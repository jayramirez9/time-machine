#!/usr/bin/env node

/**
 * Time Machine PR Review Agent
 * A separate AI context that reviews PRs for architecture drift,
 * contract violations, and quality concerns.
 *
 * Runs in GitHub Actions on pull_request events.
 * Uses the Anthropic API directly (no SDK dependency).
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY - Anthropic API key (repository secret)
 *   GH_TOKEN          - GitHub token (automatic in Actions)
 *   PR_NUMBER          - Pull request number
 *   GITHUB_REPOSITORY  - owner/repo (automatic in Actions)
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6'; // alias, no date suffix — dated Sonnet 4.0 IDs are retired
const MAX_TOKENS = 4096;

// ── Helpers ──────────────────────────────────────────────────────────────────

function env(name, required = true) {
  const value = process.env[name];
  if (required && !value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000 }).trim();
  } catch (err) {
    console.error(`Command failed: ${cmd}`);
    console.error(err.stderr || err.message);
    return '';
  }
}

function readFileIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = env('ANTHROPIC_API_KEY');
  const ghToken = env('GH_TOKEN');
  const prNumber = env('PR_NUMBER');
  const repo = env('GITHUB_REPOSITORY');

  console.log(`Reviewing PR #${prNumber} in ${repo}`);

  // 1. Get PR diff
  const diff = exec(`gh pr diff ${prNumber} --repo ${repo}`);
  if (!diff) {
    console.log('No diff found, skipping review.');
    return;
  }

  // Truncate very large diffs to stay within context limits
  const maxDiffChars = 80000;
  const truncatedDiff = diff.length > maxDiffChars
    ? diff.slice(0, maxDiffChars) + '\n\n[... diff truncated ...]'
    : diff;

  // 2. Read review prompt and context files
  const reviewPrompt = readFileIfExists('.github/review-prompt.md');
  const claudeMd = readFileIfExists('CLAUDE.md');

  // 3. Read eval results if available
  let evalResults = '';
  try {
    // Skip the slow unit suite — eval.yml gates it as its own native step;
    // the fast suites (contract/routes/profiles/era/golden) run in seconds.
    evalResults = execSync('./tm-eval.js --json --skip unit 2>&1', {
      encoding: 'utf8', timeout: 120000
    });
    console.log('Eval results captured.');
  } catch (err) {
    evalResults = `Eval run failed: ${err.message}`;
    console.log('Eval run failed, including failure info in review context.');
  }

  // 4. Build the API request
  const systemPrompt = `${reviewPrompt}\n\n## Project Architecture (CLAUDE.md excerpt)\n\n${claudeMd.slice(0, 8000)}`;

  const userMessage = `Please review this pull request diff.

## Eval Results
\`\`\`json
${evalResults}
\`\`\`

## PR Diff
\`\`\`diff
${truncatedDiff}
\`\`\`

Respond with the JSON format specified in the review prompt. Focus on substantive issues.`;

  console.log(`Sending ${userMessage.length} chars to Claude API...`);

  // 5. Call Anthropic API
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`API error ${response.status}: ${errText}`);
    process.exit(1);
  }

  const data = await response.json();
  const reviewText = data.content?.[0]?.text || '';
  console.log('Review received.');

  // 6. Parse the review JSON
  let review;
  try {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = reviewText.match(/```json\s*([\s\S]*?)\s*```/) || [null, reviewText];
    review = JSON.parse(jsonMatch[1]);
  } catch {
    console.error('Failed to parse review JSON, posting raw response.');
    review = {
      summary: reviewText.slice(0, 500),
      approval: 'comment',
      comments: []
    };
  }

  // 7. Post review comment to PR
  const reviewBody = formatReviewBody(review);

  const ghApiUrl = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
  const commentResponse = await fetch(ghApiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `token ${ghToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body: reviewBody })
  });

  if (!commentResponse.ok) {
    const errText = await commentResponse.text();
    console.error(`GitHub API error ${commentResponse.status}: ${errText}`);
    process.exit(1);
  }

  console.log('Review posted successfully.');

  // 8. Post file-level comments if any
  for (const comment of review.comments || []) {
    if (!comment.path || !comment.body) continue;

    const fileCommentBody = `**\`${comment.path}\`**: ${comment.body}`;
    await fetch(ghApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `token ${ghToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ body: fileCommentBody })
    });
  }

  if (review.comments?.length > 0) {
    console.log(`Posted ${review.comments.length} file-level comments.`);
  }
}

function formatReviewBody(review) {
  const icon = review.approval === 'approve' ? '✅'
    : review.approval === 'request_changes' ? '🔴'
    : '💬';

  let body = `## ${icon} AI Code Review\n\n`;
  body += `**Summary**: ${review.summary}\n\n`;
  body += `**Recommendation**: ${review.approval}\n\n`;

  if (review.comments?.length > 0) {
    body += `### File Comments (${review.comments.length})\n\n`;
    for (const c of review.comments) {
      body += `- **\`${c.path}\`**: ${c.body}\n`;
    }
  }

  body += '\n---\n*🤖 Automated review by Time Machine Review Agent*';
  return body;
}

main().catch(err => {
  console.error('Review failed:', err);
  process.exit(1);
});

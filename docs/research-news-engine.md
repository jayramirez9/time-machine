# Research: News Engine Architecture and Build vs. Buy

**Date:** 2026-03-05
**Status:** Complete
**Relevance:** Autonomous news scanning and strategy analysis agent (separate tool/repo)

---

## Summary / Key Takeaways

- **Build, don't buy.** The cost of a custom LLM-powered news agent (~$15-20/mo) is dramatically lower than commercial alternatives (Feedly $1,200/mo, Meltwater $25,000/yr), and custom analysis prompts provide far more value than generic filtering.
- **GDELT Project** is the most underappreciated free resource -- monitors global news in 100+ languages, updates every 15 minutes, archives back to 1979, and is completely free with no authentication.
- **MVP architecture**: RSS feeds + NYT Top Stories + GDELT trending -> Claude Haiku classification/summarization -> Sonnet daily synthesis -> Slack webhook delivery. Estimated ~7-10 days to build v1.
- **Claude API costs are negligible**: ~$5-10/mo for 100 articles/day with Haiku batch processing. Prompt caching and batch API discount (50% off) make it even cheaper.
- **Story arc tracking** via embedding-based clustering is a strong v2 feature but not needed for MVP. Use Chroma (embedded vector store) when ready.
- **Slack is the recommended primary delivery channel** for a small team, with markdown archive as secondary.

---

## 1. News Data Sources and APIs

### NYT APIs (Free, Rate-Limited)

The [NYT Developer Portal](https://developer.nytimes.com) offers several free APIs:
- **Article Search API** -- keyword/topic/date search across the full NYT archive. Returns metadata + URL (not full text). Rate limit: ~500 req/day, 5 req/min.
- **Archive API** -- all article metadata for a given month, back to 1851. Rate limit: ~2,000 req/day.
- **Top Stories API** -- current front-page stories by section.
- **Most Popular API** -- most emailed/viewed/shared articles (useful for signal detection).
- **Times Wire API** -- real-time stream of articles as they publish.

Key limitation: full article text is NOT returned -- only metadata, snippets, and URLs. Reading full articles requires a NYT subscription. You must credit the NYT in any application.

### NewsAPI.org vs NewsAPI.ai

These are **different services** -- a common source of confusion.

**[NewsAPI.org](https://newsapi.org/pricing)**: Free for development (100 req/day, last 30 days). Paid plans start at $449/mo for commercial use. Covers 150,000+ sources. Returns headlines + snippets, not full text. Good for prototyping but expensive to scale commercially.

**[NewsAPI.ai](https://newsapi.ai/plans)**: Pay-as-you-go with full-text access even on the free tier. Includes NLP enrichment (entities, events, sentiment, clustering), event detection, and SDK access. Better value for analysis workloads. Pricing starts lower than NewsAPI.org for comparable features.

### GDELT Project (Free, Massive Scale)

The [GDELT Project](https://www.gdeltproject.org/) is the largest open database of human society -- monitoring print, broadcast, and web news in 100+ languages, updating every 15 minutes, with archives back to 1979.

Key APIs:
- **DOC 2.0 API** -- article search with output modes: article list, timeline volume, tone chart, image collage. URL: `https://api.gdeltproject.org/api/v2/doc/doc?query="your query"`
- **GEO 2.0 API** -- geographic mapping of any keyword across all monitored coverage.
- **Full Text Search API** -- search full text of last 24 hours of monitored coverage across 65 machine-translated languages.
- **Google BigQuery** -- all datasets available for SQL analysis at unlimited scale.

GDELT is completely free. Python clients available: [`gdelt-doc-api`](https://github.com/alex9smith/gdelt-doc-api) and [`gdeltPyR`](https://pypi.org/project/gdelt/). Excellent for trend detection, geographic analysis, and tone/sentiment tracking over time. The 15-minute update cadence makes it useful for near-real-time monitoring.

### Associated Press API

The [AP Developer Portal](https://developer.ap.org/) provides access to global news and multimedia. However, access requires contacting AP Customer Support directly -- no self-service signup. Pricing is negotiated case-by-case: per-article fees ($5-50) for small users, or subscription feeds ($500-5,000/mo) for continuous access. Likely overkill for an internal tool -- AP content is better accessed through aggregator APIs.

### RSS Feeds at Scale

RSS remains a highly effective channel for structured news aggregation. Key Node.js libraries:

- **[rss-parser](https://www.npmjs.com/package/rss-parser)** -- lightweight, 440+ dependents, works in Node and browser. Most popular choice.
- **[@rowanmanning/feed-parser](https://github.com/rowanmanning/feed-parser)** -- well-tested against ~40 real feeds, handles non-compliant XML gracefully.
- **[rss-feed-emitter](https://github.com/filipedeschamps/rss-feed-emitter)** -- event-based aggregator, good for polling multiple feeds on a schedule.

For at-scale use: combine a parser with a job queue (BullMQ), Redis for caching/dedup, and a database for storage. Most local newspapers, industry blogs, and niche publications still offer RSS -- it is the most reliable free data source.

### Google News API Alternatives

Google deprecated the Google News Search API -- no official replacement exists. Alternatives:
- **[NewsCatcher API](https://www.newscatcherapi.com/)** -- 70,000+ sources, sentiment analysis, NER, article clustering, AI summaries. Enterprise-focused.
- **[NewsData.io](https://newsdata.io/)** -- 86,750+ sources, 89 languages, 206 countries. Free tier available. Up to 7 years of historical data.
- **[GNews API](https://gnews.io/)** -- 60,000+ sources, 22 languages. Simple REST/JSON. Free tier.
- **[The Guardian API](https://open-platform.theguardian.com/)** -- 2M+ content items. Free, well-documented.

### Reddit / Social Media Signals

[Reddit's API](https://www.reddit.com/dev/api/) changed significantly in 2023 with the shift to paid access. Free tier exists for public data but rate limits are restrictive. For lightweight social signal detection, monitoring specific subreddits via RSS (`https://www.reddit.com/r/{subreddit}.rss`) may be sufficient for an MVP.

### Local News Aggregation

For local market news (e.g., Baton Rouge real estate):
- RSS feeds from local outlets (The Advocate, WBRZ, local business journals) are the most reliable free source.
- **NewsData.io** and **GNews** support geographic filtering.
- **GDELT GEO API** can map keyword mentions to specific locations.
- **Google Alerts** (free) can monitor specific local queries and deliver via email/RSS.

---

## 2. LLM-Powered Analysis Architecture

### Claude API for Summarization and Analysis

Current [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing) (2026):

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Best For |
|---|---|---|---|
| Haiku 4.5 | $1 | $5 | Classification, routing, simple summaries |
| Sonnet 4.5 | $3 | $15 | Article analysis, strategy briefings |
| Opus 4.5 | $5 | $25 | Complex multi-article synthesis |

**Cost estimate for 100 articles/day:**
- Average news article: ~800 words = ~1,100 tokens input
- Summary + analysis prompt template: ~500 tokens
- Output per article: ~300 tokens (summary + tags + assessment)
- Daily input: 100 x 1,600 = 160K tokens
- Daily output: 100 x 300 = 30K tokens
- **Using Haiku 4.5: ~$0.31/day ($9.30/mo)** -- very affordable for summarization
- **Using Sonnet 4.5: ~$0.93/day ($27.90/mo)** -- for deeper analysis
- Daily briefing synthesis (all summaries into one report): ~50K input + ~2K output = additional ~$0.18/day with Sonnet

**Batch API discount**: 50% off for async processing. Since a daily digest does not need real-time responses, batch processing drops costs to roughly **$5-15/mo for 100 articles/day with Haiku**.

**Prompt caching**: If you use a consistent system prompt for all articles, cache reads cost 0.1x -- significant savings on repeated analysis patterns.

### Prompt Engineering for News Analysis

Recommended prompt architecture for extracting actionable intelligence:

1. **Classification layer** (Haiku): Categorize article by topic, relevance score, sentiment. Fast triage -- discard irrelevant articles before expensive analysis.
2. **Extraction layer** (Haiku/Sonnet): Pull structured data -- entities (people, companies, properties), numbers (prices, dates, percentages), claims, quotes.
3. **Analysis layer** (Sonnet): Generate strategic assessment -- what does this mean for your interests? What actions might it suggest? How does it connect to previous stories?
4. **Synthesis layer** (Sonnet/Opus): Daily briefing -- aggregate all analyzed articles into a coherent narrative with priorities.

### RAG for Story Arc Tracking

For building context over time, a RAG architecture is essential:

- **Vector store** (Pinecone, Chroma, or pgvector): Store article embeddings for semantic similarity search. When analyzing a new article, retrieve the 5-10 most similar previous articles to provide context.
- **Hybrid search**: Combine vector similarity with keyword/metadata filtering (by entity, topic, date range).
- **GraphRAG**: For tracking entity relationships across stories -- who is connected to whom, which companies are involved in which deals.
- **Incremental updates**: New articles are embedded and indexed immediately. The knowledge base grows daily.

Practical MVP: Use **Chroma** (embedded, no infrastructure) or **pgvector** (if you already have Postgres) for the vector store. Store article metadata + embeddings + LLM-generated summaries.

### Existing Open-Source Frameworks

- **[NewsLLM](https://github.com/muhd-umer/news-llm)**: RAG-based news analysis using Groq API, Chroma, LangChain, Beautiful Soup. Directly relevant.
- **[Newsletter & Blog Digester](https://github.com/mfyz/newsletter-blog-digester)** (mfyz): Node.js/Fastify/SQLite, RSS + CSS extraction, OpenAI/Ollama summarization, Slack delivery. Single Docker container. Very close to what we would want for an MVP.
- **[Matcha](https://github.com/piqoni/matcha)**: RSS to markdown daily digest generator. OpenAI summaries. Simple and effective.
- **[Dify](https://github.com/langgenius/dify)** (114K+ GitHub stars): Low-code RAG + agent platform. Could serve as infrastructure for a news agent without building from scratch.
- **[RAGFlow](https://github.com/infiniflow/ragflow)** (~70K stars): End-to-end RAG engine with document ingestion, vector indexing, and agent capabilities.

---

## 3. Story Arc Tracking

### Embedding-Based Article Clustering

The core technique: generate embeddings for each article (via Claude, OpenAI, or open-source models like `all-MiniLM-L6-v2`), then cluster similar articles using cosine similarity. Articles about the same developing story will cluster together naturally.

Implementation pattern:
1. Embed each article as it arrives.
2. Compare against existing clusters (nearest-neighbor search in vector store).
3. If similarity > threshold, add to existing cluster (story arc). Otherwise, create a new cluster.
4. Track cluster evolution over time -- growing clusters = developing stories.

### Entity Extraction and Linking

[spaCy](https://spacy.io/) is the standard tool for NER in news articles:
- Pre-built models identify PERSON, ORG, GPE (geopolitical entity), EVENT, MONEY, DATE, etc.
- Entity linking connects "Apple" in different articles to the same entity via Wikidata/Wikipedia.

However, for an LLM-powered system, **Claude can do NER directly** in the analysis prompt -- often more accurately than spaCy for complex entities, and without needing a separate NLP pipeline. Use spaCy only if you need high-throughput pre-processing before LLM analysis.

### Practical Story Arc Architecture

1. **Article arrives** -> embed + extract entities (Claude or spaCy)
2. **Cluster assignment** -> find most similar existing cluster via vector search
3. **Arc metadata** -> track: first seen, last updated, article count, key entities, sentiment trajectory
4. **Briefing context** -> when reporting on an article in a developing story, include the arc summary as context

---

## 4. Delivery Mechanisms

### Daily Email Digest

- Use **Nodemailer** (Node.js) or **Resend/SendGrid API** for sending.
- Generate HTML from markdown using `marked` or `markdown-it`.
- Template: executive summary at top, then categorized sections, each article with headline, source, 2-sentence summary, relevance tag.
- Schedule via cron job or cloud function (AWS Lambda, Vercel Cron).

### Slack Bot

- **Slack Incoming Webhooks** for push delivery -- simplest approach, no bot framework needed. Just POST formatted JSON.
- **[slack-block-builder](https://github.com/raycharius/slack-block-builder)** for rich formatted messages with sections, links, and actions.
- Supports multi-channel routing (e.g., #strategy, #real-estate, #competitors).

### Static Site / Markdown Dashboard

- Generate daily markdown files -> render with a static site generator (Astro, Next.js, or even plain HTML).
- Host on Vercel/Netlify for zero maintenance.
- Alternative: write to a shared Notion database or Obsidian vault.

### Recommendation for a Small Team

**Slack is the best primary channel** -- it is where most teams already live, supports threading for discussion, and can be set up with a single webhook URL. Use email as a secondary/fallback channel for stakeholders who do not use Slack. A static markdown archive is useful for searchability and reference but should be a secondary output, not the primary delivery.

---

## 5. Existing Tools / Build vs. Buy

### Commercial Tools

| Tool | Price | Strengths | Weaknesses |
|---|---|---|---|
| **[Feedly Market Intelligence](https://feedly.com/market-intelligence/pricing)** | ~$14,400/yr ($1,200/mo) | AI-powered filtering ("Leo"), 100M+ sources, Slack/Teams integration, trend detection | Expensive. No custom analysis. |
| **[Meltwater](https://www.meltwater.com/)** | ~$25,000/yr (custom) | Enterprise-grade media monitoring, social listening, analytics | Overkill for small team. Expensive. |
| **Google Alerts** | Free | Zero setup, email delivery, broad coverage | No AI analysis, no customization, inconsistent quality |
| **[Mention](https://mention.com/)** | $41-$149/mo | Real-time monitoring, social + web, sentiment | Limited AI analysis. Basic. |
| **Perplexity Pro** | $20/mo per user | AI-powered research, real-time web search, citation-backed answers | Not automated. Manual query-based. No scheduled briefings. |

### Open-Source Alternatives

- **[newsletter-blog-digester](https://github.com/mfyz/newsletter-blog-digester)**: Closest to what we want. Node.js, Docker, RSS+scraping, AI summaries, Slack delivery.
- **[Matcha](https://github.com/piqoni/matcha)**: RSS -> markdown digest. Simple, effective.
- **[NewsLLM](https://github.com/muhd-umer/news-llm)**: RAG-based news analysis with vector store.
- **[n8n](https://n8n.io/)**: Self-hosted workflow automation. Pre-built templates for news digest -> Slack pipelines.

### Build vs. Buy Calculus

**Buy if**: You need broad media monitoring across thousands of sources, social listening, PR/communications use case, or you have budget but not developer time. Feedly at $1,200/mo is the sweet spot for a serious team.

**Build if**: You want custom analysis prompts (strategy-specific intelligence), story arc tracking tailored to your interests, LLM-powered synthesis (not just filtering), control over costs ($15-30/mo for APIs vs $1,200/mo for Feedly), and integration with your specific workflow. The marginal cost of LLM analysis is now so low that building a custom agent is economically compelling if you have the dev capacity.

**Hybrid approach**: Use Google Alerts + RSS for data collection (free), build custom LLM analysis and delivery (cheap), and skip the expensive monitoring platforms entirely.

---

## 6. Recommended MVP Architecture

### The Simplest Useful Version

```
Data Sources          Analysis              Delivery
---                   ---                   ---
NYT Top Stories --+
RSS feeds (5-10) -+-- Fetch -- Claude -- Daily Slack message
Google Alerts ----+   (cron)   Haiku     + markdown archive
GDELT trending ---+            summary
```

### Tech Stack

- **Runtime**: Node.js (ES modules, consistent with existing codebase)
- **Data collection**: `rss-parser` for RSS, `fetch` for NYT/GDELT APIs, Gmail API or IMAP for Google Alerts
- **LLM analysis**: Claude API (Haiku for classification/summarization, Sonnet for daily synthesis)
- **Storage**: SQLite (via `better-sqlite3`) for article metadata + dedup. No vector store needed for v1 -- add Chroma later for story arc tracking.
- **Delivery**: Slack Incoming Webhook (primary), markdown files to a git repo (archive)
- **Scheduling**: System cron or a simple `setInterval` in a long-running process
- **Deployment**: Single Docker container on any VPS, or a scheduled cloud function

### v1 Feature Set

1. Fetch articles from 5-10 RSS feeds + NYT Top Stories + GDELT trending queries
2. Deduplicate by URL
3. Classify relevance with Haiku (discard irrelevant)
4. Summarize each relevant article with Haiku (headline, 2-sentence summary, entities, sentiment)
5. Synthesize daily briefing with Sonnet (executive summary, categorized sections, action items)
6. Post to Slack channel at 7am
7. Write markdown file to `briefings/YYYY-MM-DD.md`

### Estimated Effort

- **Data collection layer** (RSS + NYT + GDELT fetchers, dedup, storage): 2-3 days
- **LLM analysis pipeline** (prompts, classification, summarization, synthesis): 2-3 days
- **Delivery** (Slack webhook + markdown generation): 1 day
- **Scheduling + deployment** (cron, Docker, error handling): 1 day
- **Testing + tuning prompts**: 1-2 days

**Total: ~7-10 days for a working v1.** This assumes a single developer familiar with Node.js and the Claude API.

### Estimated Monthly Cost

- NYT API: free
- RSS feeds: free
- GDELT: free
- Claude API (Haiku batch, ~100 articles/day): ~$5-10/mo
- Claude API (Sonnet, daily synthesis): ~$5/mo
- Slack: free (webhook)
- VPS (if self-hosted): ~$5/mo (DigitalOcean droplet)
- **Total: ~$15-20/mo**

### v2 Additions (Future)

- Vector store (Chroma) for story arc tracking and embedding-based clustering
- Entity extraction for relationship mapping
- Configurable topic filters and alert thresholds
- Email digest as secondary channel
- Web dashboard with search
- GDELT tone/volume trending charts

---

## Sources

- [NYT Developer Portal / API Specs](https://github.com/nytimes/public_api_specs)
- [NewsAPI.org Pricing](https://newsapi.org/pricing)
- [NewsAPI.ai Plans](https://newsapi.ai/plans)
- [GDELT Project](https://www.gdeltproject.org/data.html)
- [GDELT DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
- [GDELT Python Client](https://github.com/alex9smith/gdelt-doc-api)
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [NewsLLM (GitHub)](https://github.com/muhd-umer/news-llm)
- [newsletter-blog-digester](https://mfyz.com/oss-newsletter-digester-ai-slack-summaries/)
- [Matcha RSS Digest](https://medevel.com/matcha/)
- [rss-parser (npm)](https://www.npmjs.com/package/rss-parser)
- [RAG Architectures Guide](https://humanloop.com/blog/rag-architectures)
- [Feedly Market Intelligence Pricing](https://feedly.com/market-intelligence/pricing)
- [Best News API Comparison 2025](https://newsapi.ai/blog/best-news-api-comparison-2025/)
- [spaCy NER Documentation](https://spacy.io/usage/linguistic-features)
- [Slack Block Builder](https://github.com/raycharius/slack-block-builder)
- [n8n News Digest Workflow](https://n8n.io/workflows/12349-curate-daily-tech-news-for-slack-and-telegram-using-browseract-and-openrouter/)

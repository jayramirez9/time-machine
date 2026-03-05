# Research: News Engine Architecture & Build vs. Buy

**Date:** 2026-03-05
**PRD Reference:** F4 — News Engine (future, separate repo)

## Key Takeaways

1. **Build it, don't buy it.** Custom LLM analysis costs ~$15-20/mo total. Feedly Market Intelligence costs $1,200/mo. The marginal cost of Claude-powered analysis is now so low that building a custom agent is economically compelling.

2. **MVP is ~7-10 days of work.** RSS + NYT Top Stories + GDELT → Claude Haiku classification/summarization → Sonnet daily synthesis → Slack webhook + markdown archive.

3. **GDELT is a hidden gem.** Free, updates every 15 minutes, archives back to 1979, 100+ languages, full-text search of last 24 hours, geographic mapping, tone/sentiment tracking. Available via BigQuery for unlimited-scale SQL analysis.

4. **Claude Haiku batch processing = ~$5-10/mo for 100 articles/day.** Add Sonnet for daily synthesis at ~$5/mo. Total LLM cost under $20/mo.

5. **Story arc tracking comes in v2.** V1 is stateless daily briefings. V2 adds vector store (Chroma/pgvector) for embedding-based clustering and entity relationship tracking.

---

## Recommended MVP Architecture

```
Data Sources          Analysis              Delivery
─────────────        ─────────             ────────
NYT Top Stories ──┐
RSS feeds (5-10) ─┤── Fetch ── Claude ── Daily Slack message
Google Alerts ────┤   (cron)   Haiku     + markdown archive
GDELT trending ───┘            summary
```

### Tech Stack
- **Runtime:** Node.js (ES modules, consistent with time-machine codebase)
- **Data collection:** `rss-parser` for RSS, `fetch` for NYT/GDELT APIs
- **LLM analysis:** Claude API — Haiku for classification/summarization, Sonnet for daily synthesis
- **Storage:** SQLite (via `better-sqlite3`) for article metadata + dedup
- **Delivery:** Slack Incoming Webhook (primary), markdown files to git repo (archive)
- **Scheduling:** System cron or `setInterval` in a long-running process
- **Deployment:** Single Docker container on any VPS

### v1 Feature Set
1. Fetch articles from 5-10 RSS feeds + NYT Top Stories + GDELT trending
2. Deduplicate by URL
3. Classify relevance with Haiku (discard irrelevant)
4. Summarize each relevant article (headline, 2-sentence summary, entities, sentiment)
5. Synthesize daily briefing with Sonnet (executive summary, categorized sections, action items)
6. Post to Slack at 7am
7. Write `briefings/YYYY-MM-DD.md`

### Estimated Cost
| Item | Monthly Cost |
|------|-------------|
| NYT API | Free |
| RSS feeds | Free |
| GDELT | Free |
| Claude Haiku batch (~100 articles/day) | ~$5-10 |
| Claude Sonnet (daily synthesis) | ~$5 |
| Slack | Free (webhook) |
| VPS (DigitalOcean droplet) | ~$5 |
| **Total** | **~$15-20/mo** |

### Estimated Build Effort
| Component | Days |
|-----------|------|
| Data collection layer (RSS + NYT + GDELT, dedup, storage) | 2-3 |
| LLM analysis pipeline (prompts, classification, summarization) | 2-3 |
| Delivery (Slack webhook + markdown generation) | 1 |
| Scheduling + deployment (cron, Docker, error handling) | 1 |
| Testing + prompt tuning | 1-2 |
| **Total** | **~7-10 days** |

---

## News Data Sources

### NYT APIs (Free)
- **Top Stories API** — current front-page stories by section
- **Most Popular API** — most emailed/viewed/shared (signal detection)
- **Times Wire API** — real-time stream as articles publish
- **Article Search API** — keyword monitoring across full archive
- Rate limits: 500 req/day, 5 req/min. Free API key.
- Returns metadata + snippets, not full text.

### GDELT Project (Free, Massive Scale)
The largest open database of global news — 100+ languages, updates every 15 minutes, archives to 1979.

- **DOC 2.0 API** — article search with timeline, tone, and geographic output
- **GEO 2.0 API** — geographic mapping of keyword mentions
- **Full Text Search** — last 24 hours across 65 machine-translated languages
- **BigQuery** — all datasets for unlimited SQL analysis
- Python clients: `gdelt-doc-api`, `gdeltPyR`

### RSS Feeds
Most reliable free source for local/niche coverage. Key Node.js libraries:
- **rss-parser** — lightweight, most popular
- **rss-feed-emitter** — event-based, good for polling multiple feeds

### NewsAPI.org vs NewsAPI.ai
- **NewsAPI.org** — $449/mo commercial. 150K+ sources. Headlines + snippets.
- **NewsAPI.ai** — pay-as-you-go, full-text even on free tier. Includes NLP enrichment (entities, sentiment, clustering). Better value for analysis.

### Other Sources
| Source | Cost | Notes |
|--------|------|-------|
| Google Alerts | Free | Email/RSS delivery, broad but inconsistent |
| NewsData.io | Free tier | 86K+ sources, 206 countries, up to 7yr historical |
| GNews API | Free tier | 60K+ sources, simple REST |
| The Guardian API | Free | 2M+ items, UK-focused |
| AP API | Negotiated | Contact required, $500-5K/mo |
| Reddit API | Free (limited) | Restrictive rate limits since 2023 pricing changes |

### Local News
For local markets (e.g., Baton Rouge real estate):
- RSS from local outlets (The Advocate, WBRZ, local business journals)
- NewsData.io and GNews support geographic filtering
- GDELT GEO API maps keyword mentions to specific locations
- Google Alerts for specific local queries

---

## LLM Analysis Architecture

### Prompt Pipeline
1. **Classification** (Haiku) — categorize by topic, score relevance, sentiment. Fast triage.
2. **Extraction** (Haiku/Sonnet) — entities, numbers, claims, quotes.
3. **Analysis** (Sonnet) — strategic assessment, connections to previous stories.
4. **Synthesis** (Sonnet/Opus) — daily briefing with priorities and action items.

### Cost Estimates (Claude API, 2026 pricing)

| Model | Input/1M tokens | Output/1M tokens |
|-------|-----------------|------------------|
| Haiku 4.5 | $1 | $5 |
| Sonnet 4.5 | $3 | $15 |
| Opus 4.5 | $5 | $25 |

100 articles/day × ~1,600 tokens input × ~300 tokens output = ~$0.31/day with Haiku. Batch API gives 50% discount → ~$5/mo.

### Prompt caching
Consistent system prompts get cached at 0.1x cost — significant savings on repeated analysis patterns.

---

## Story Arc Tracking (v2)

### Embedding-Based Clustering
1. Embed each article as it arrives
2. Compare against existing clusters (nearest-neighbor in vector store)
3. If similarity > threshold → add to existing cluster (story arc)
4. Track cluster evolution — growing clusters = developing stories

### Recommended Tools
- **Vector store:** Chroma (embedded, no infrastructure) or pgvector (if using Postgres)
- **Entity extraction:** Claude does NER directly in prompts (often better than spaCy for complex entities)
- **Graph relationships:** GraphRAG for tracking entity connections across stories

---

## Build vs. Buy Analysis

### Commercial Tools
| Tool | Price | Verdict |
|------|-------|---------|
| Feedly Market Intelligence | $1,200/mo | Best commercial option, but 80x the cost of building |
| Meltwater | ~$2,000+/mo | Enterprise overkill |
| Google Alerts | Free | No AI analysis, useful as input source |
| Mention | $41-149/mo | Basic monitoring, limited analysis |

### Open-Source Starting Points
- **[newsletter-blog-digester](https://github.com/mfyz/newsletter-blog-digester)** — Node.js, Docker, RSS+scraping, AI summaries, Slack delivery. Closest to what we'd build.
- **[Matcha](https://github.com/piqoni/matcha)** — RSS → markdown daily digest with LLM summaries
- **[NewsLLM](https://github.com/muhd-umer/news-llm)** — RAG-based news analysis with vector store
- **[n8n](https://n8n.io/)** — self-hosted workflow automation with pre-built news digest templates

### Verdict
**Build.** The economics are compelling: ~$15-20/mo for a custom agent with exactly the analysis prompts and delivery format you want, vs $1,200/mo for the closest commercial equivalent. The open-source `newsletter-blog-digester` project proves the pattern works in Node.js with minimal code.

---

## v2 Roadmap

1. **Vector store** (Chroma) for story arc tracking and semantic search
2. **Entity extraction** for relationship mapping across articles
3. **Configurable topic filters** and alert thresholds via YAML config
4. **Email digest** as secondary channel
5. **Web dashboard** with search across all archived briefings
6. **GDELT tone/volume trending** charts embedded in briefings
7. **Content opportunity detection** — flag stories relevant to Time Machine preset development (e.g., "renewed interest in 1920s New York" → opportunity for a new Place×Time)

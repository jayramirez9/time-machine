# Research: NYT Developer APIs for Historical Research & News Scanning

**Date:** 2026-03-05
**Research Spike:** PRD #8 — NYT Archive API for cultural research

## Key Takeaways

1. **NYT API returns metadata only, not full text.** You get headline, abstract, snippet, lead_paragraph, byline, keywords, pub_date, section, document_type — but not the article body. Full text requires scraping (violates ToS) or institutional access (ProQuest).

2. **Pre-1900 metadata is dramatically sparse.** Keywords are almost always empty arrays. Bylines are null (pre-1920s norm). Abstracts/snippets are often empty. You effectively get **headlines + dates + page numbers** — but the headlines themselves are rich period flavor.

3. **Chronicling America (Library of Congress) is the critical complement.** Free, no authentication, covers 1756–1963, provides **full OCR text** from ~3,000 US newspapers across all 50 states. This fills the full-text gap and the geographic coverage gap.

4. **Rate limits are workable.** Article Search: 10/min, 4K/day. Archive: 2K/day (one call = one entire month). Free, API key only. No paid tier exists.

5. **For Baton Rouge 1978, neither NYT nor Chronicling America works well.** NYT is too NYC-centric for local coverage. Chronicling America cuts off at 1963. Local newspaper archives (Baton Rouge Advocate) would require ProQuest or direct library access.

---

## API Overview

### Article Search API

**Endpoint:** `https://api.nytimes.com/svc/search/v2/articlesearch.json`

Searches every NYT article since **September 18, 1851**. Returns 10 results per page, max 100 pages (1,000 results per query). Narrow with date ranges and filters for larger result sets.

**Key query parameters:**
- `q` — free-text search (body, headline, byline)
- `fq` — Lucene filter query (document_type, section_name, glocations, persons, etc.)
- `begin_date` / `end_date` — YYYYMMDD format
- `sort` — "newest" or "oldest"
- `page` — 0–100

**Fields returned per article:**

| Field | Pre-1900 Quality |
|-------|-----------------|
| `headline.main` | Present, terse (e.g., "Sentence for Manslaughter.") |
| `abstract` / `snippet` | Usually null or empty |
| `lead_paragraph` | Usually null |
| `pub_date` | Reliable |
| `byline` | Null (pre-1920s norm) |
| `keywords` | Almost always empty `[]` |
| `document_type` | Often generic "Archives" |
| `type_of_material` | Often generic "Archives" |
| `section_name` | Generic "Archives" |
| `print_page` | Reliable |
| `web_url` | Reliable |
| `word_count` | Often `0` |

**Can advertisements be distinguished?** Yes — `document_type` distinguishes "article" from "advertisement" and `type_of_material` provides finer granularity. But for pre-1900 content, both fields often just say "Archives", making the distinction unreliable.

### Archive API

**Endpoint:** `https://api.nytimes.com/svc/archive/v1/{year}/{month}.json`

Returns **every article** for a given month/year. Same fields as Article Search. One API call = one month.

**Key characteristics:**
- Responses can be ~20 MB for a modern month (~6,800 documents)
- No server-side filtering — you get everything and filter client-side
- For "June 15, 1884" you must fetch all of June 1884, then filter by `pub_date`
- Best used to pre-fetch and cache months locally, then query without hitting rate limits

### Top Stories API

**Endpoint:** `https://api.nytimes.com/svc/topstories/v2/{section}.json`

Current articles on NYT home page or section front. Sections: home, arts, business, politics, realestate, science, technology, us, world, etc. Returns ~20-40 articles. **Current news only — no historical queries.**

### Most Popular API

**Endpoint:** `https://api.nytimes.com/svc/mostpopular/v2/{mostemailed|mostshared|mostviewed}/{section}/{period}.json`

Most emailed/shared/viewed. Period: 1, 7, or 30 days. **Current news only.**

---

## Authentication & Rate Limits

**Free.** Create account at developer.nytimes.com, create an app, get API key immediately.

| API | Per Minute | Per Day |
|-----|-----------|---------|
| Article Search | 10 | 4,000 |
| Archive | — | 2,000 |
| Books | 5 | 500 |

No paid tier documented. HTTP 429 on violation, no `Retry-After` header — implement your own throttling.

---

## Practical Assessment for Time Machine Use Cases

### NYC 1884 (Historical Cultural Research)

**What you get from NYT:**
- Every headline published on any given day — extensive NYC local coverage (crime, politics, society, weather, shipping, commerce, theater)
- Headlines are the richest data point for pre-1900 articles
- Page numbers tell you front page vs. back page priority

**What you don't get:**
- Full article text (abstracts/snippets mostly empty for 1884)
- Structured keyword metadata
- Reliable ad vs. editorial classification

**Recommended approach:** Use Archive API to cache entire months, then mine headlines locally. Headlines alone reveal: what people were talking about, weather events (corroborate NOAA), social customs, commerce, infrastructure events, street life.

### Baton Rouge 1978 (Non-NYC Location)

**NYT coverage is thin.** The NYT is a national paper — Baton Rouge coverage would be limited to nationally newsworthy events. The `glocations` filter (`fq=glocations:("Baton Rouge")`) can find what exists, but routine local coverage lives in the Baton Rouge Advocate (not available via any free API).

### News Engine (Current Scanning)

Top Stories + Most Popular APIs cover current news well. Article Search provides keyword-based monitoring. Sufficient for daily briefing generation.

---

## Alternative & Complementary Sources

### Chronicling America (Library of Congress) — Best Free Complement

- **Coverage:** 1756–1963, millions of pages, ~3,000 US newspapers across all 50 states
- **Full text:** Yes — OCR text for every digitized page
- **Authentication:** None required, completely free
- **Search by date and state:** Fully supported
- **API:** `loc.gov` JSON API (new) replacing legacy `chroniclingamerica.loc.gov/search/`
- **OCR quality:** Variable for pre-1900 (old typefaces, degraded print)
- **Limitation:** 1963 cutoff — no post-1963 coverage

For NYC 1884: multiple New York newspapers are digitized with full OCR text. This is where you get the actual article content the NYT API can't provide.

### ProQuest Historical Newspapers — Best Paid Alternative

- 200+ newspapers, full-page images + OCR text, back to 1700s
- Includes full NYT (1851–2021) with higher-quality digitization
- **Institutional subscription only, no public API**
- Data access via TDM Studio or purchased hard drives
- Not practical for runtime integration; useful for offline research

### Other Sources

| Source | Coverage | Cost | Notes |
|--------|----------|------|-------|
| Associated Press API | Wire content, some historical collections (1938+) | API key | Limited historical depth |
| The Guardian API | 1999–present | Free | UK-focused |
| NewsAPI.org | 2014–present | Free tier + paid | Aggregator, no historical |
| NewsAPI.ai | 2014–present | Free tier + paid | AI-enriched, no historical |
| Trove (Australia) | 1803–present | Free | Australian newspapers |

---

## Recommended Strategy

### For Historical Research (Phase 7 Agent Layer)

```
Target: "NYC, June 15, 1884"
    ↓
NYT Archive API → fetch June 1884 (~1 API call, cache locally)
    ↓
Filter to June 15 → list of headlines + page numbers
    ↓
Chronicling America → search other NY newspapers for same date
    ↓
Full OCR text for cross-referencing, cultural detail extraction
    ↓
LLM analysis: extract street-level detail, commerce, infrastructure,
weather reports, cultural events from combined sources
    ↓
Output: structured cultural metadata for Environment Profile
```

### For News Engine (F4)

```
Daily scan:
    ↓
NYT Top Stories API → current headlines by section
NYT Most Popular API → trending stories (1/7/30 day)
NYT Article Search API → keyword monitoring (entertainment, real estate, tourism, tech)
    ↓
Claude API analysis → summarization + strategy impact assessment
    ↓
Daily markdown briefing + high-relevance alerts
```

### Key Gaps to Fill

1. **Post-1963 local newspapers** — No free API covers this. ProQuest or direct library partnerships needed for locations like Baton Rouge.
2. **Full article text for pre-1900 NYT** — Chronicling America partially fills this, but NYT specifically requires ProQuest.
3. **Non-US coverage** — For international Place×Time targets (Venice 1903, London 1888), equivalent national newspaper archives would be needed (British Newspaper Archive, etc.)

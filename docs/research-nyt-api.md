# Research: New York Times Developer APIs

**Date:** 2026-03-05
**Status:** Complete
**Relevance:** Historical news data for Time Machine experience enrichment

---

## Summary / Key Takeaways

- The NYT API provides structured metadata (headlines, dates, keywords) back to **September 1851**, but **no full article text** — only abstracts, snippets, and lead paragraphs.
- Pre-1900 metadata is **dramatically sparser**: no keywords, no bylines, no abstracts. Headlines and dates are the only reliable fields.
- The **Archive API** returns all articles for a given month in a single call (~20 MB response), making it efficient for bulk pre-fetching.
- **Chronicling America** (Library of Congress) is the strongest free complement — full OCR text from ~3,000 US newspapers (1756--1963), no authentication required.
- For NYC 1884, the NYT API will provide extensive headline coverage. For non-NYC locations (e.g., Baton Rouge 1978), NYT coverage is thin; local newspaper archives are needed.
- Rate limits are generous for our use case: 4,000 Article Search requests/day, 2,000 Archive requests/day. Free, no paid tier.

---

## 1. Article Search API

**Endpoint:** `https://api.nytimes.com/svc/search/v2/articlesearch.json`

### Fields Returned

Each document in the `response.docs` array includes:

| Field | Description |
|-------|-------------|
| `headline` | Object with `main`, `kicker`, `print_headline` sub-fields |
| `abstract` | Short editorial summary |
| `snippet` | Brief excerpt (often identical to abstract) |
| `lead_paragraph` | First paragraph text |
| `web_url` | Link to full article on nytimes.com |
| `pub_date` | ISO publication date |
| `byline` | Object with `original`, `person[]`, `organization` |
| `source` | e.g. "The New York Times" |
| `document_type` | "article", "advertisement", "multimedia", etc. |
| `type_of_material` | "News", "Editorial", "Letter", "Review", etc. |
| `section_name` | e.g. "U.S.", "World", "Arts" |
| `news_desk` | Internal desk assignment |
| `keywords` | Array of objects with `name`, `value`, `rank`, `major` |
| `multimedia` | Array of image objects (multiple crops/sizes) |
| `word_count` | Integer |
| `print_page` | Physical page number |
| `_id` | Unique identifier |
| `uri` | NYT URI |

**No full article text is returned.** Only `abstract`, `snippet`, and `lead_paragraph` provide textual content. Full text would require scraping the `web_url`, which violates NYT Terms of Service.

### Query Parameters

| Parameter | Format | Description |
|-----------|--------|-------------|
| `q` | string | Free-text search (body, headline, byline) |
| `fq` | Lucene syntax | Filter query. Supports: `document_type`, `type_of_material`, `section_name`, `news_desk`, `source`, `persons`, `organizations`, `glocations`, `subject`, `kicker`, `pub_date`, `pub_year`, `word_count`, `day_of_week`, `creative_works`, `web_url`. Multi-token fields support `.contains` suffix |
| `begin_date` | YYYYMMDD | Publication date lower bound (inclusive) |
| `end_date` | YYYYMMDD | Publication date upper bound (inclusive) |
| `sort` | string | `"newest"` or `"oldest"` |
| `page` | 0--100 | Pagination (10 results per page) |
| `fl` | comma-separated | Limit returned fields |
| `hl` | boolean | Highlight query terms in headline/lead_paragraph |
| `facet_field` | string | One of: `source`, `section_name`, `document_type`, `type_of_material`, `day_of_week` |
| `facet_filter` | boolean | Apply fq filters to facet counts |

### Pagination Ceiling

Maximum 100 pages = **1,000 results per query**. For larger result sets, narrow with date ranges or filters.

### Coverage

Goes back to **September 18, 1851**. The API returns metadata for articles from across the entire archive.

### Pre-1900 Metadata Quality

Critical finding for the Time Machine project. For pre-1900 articles, metadata is dramatically sparser:

- **`keywords`**: Almost always an empty array `[]`
- **`byline`**: Typically null (articles were rarely bylined before ~1920s)
- **`abstract` / `snippet`**: Often null or empty
- **`word_count`**: Often `0`
- **`section_name`**: Generic `"Archives"` rather than a meaningful section
- **`type_of_material`**: Generic `"Archives"`
- **`headline`**: Present but terse (e.g., "Sentence for Manslaughter.")
- **`pub_date`**, **`web_url`**, **`print_page`**, **`source`**: These are reliably present

In practical terms: for a query like "June 15, 1884", you will get article counts and headlines, but very little structured metadata beyond that. The headlines themselves are the richest data point for historical articles.

---

## 2. Archive API

**Endpoint:** `https://api.nytimes.com/svc/archive/v1/{year}/{month}.json`

### How It Works

Pass a year and month; get back every article published that month. Response fields are identical to Article Search API.

### Response Size and Volume

- Responses can be **~20 MB** for a single month
- A modern month (e.g., December 2018) returns ~6,800 documents
- Historical months return fewer but still substantial numbers (the NYT published multiple editions daily in the 1800s)
- Each call counts as **one API request** against your daily quota

### Gotchas

1. **Huge payloads**: A single Archive API call can return 20+ MB of JSON. You need to handle this in memory or stream it.
2. **Same sparse metadata problem**: Pre-1900 months return thousands of articles, but most lack keywords, bylines, abstracts, and word counts.
3. **No filtering**: Unlike Article Search, you cannot filter by document_type or keyword. You get everything for that month and must filter client-side.
4. **One request = one month**: No way to request a single day. For "June 15, 1884" you must fetch all of June 1884 and filter by `pub_date`.

### Best Use Case

Building a local index of NYT metadata. For the Time Machine project, you could pre-fetch and cache Archive API responses for target months, then query locally without hitting rate limits.

---

## 3. Top Stories API and Most Popular API

### Top Stories API

**Endpoint:** `https://api.nytimes.com/svc/topstories/v2/{section}.json`

Returns articles currently on the NYT home page or a section front. Available sections include: `home`, `arts`, `business`, `fashion`, `food`, `health`, `magazine`, `movies`, `nyregion`, `obituaries`, `opinion`, `politics`, `realestate`, `science`, `sports`, `technology`, `theater`, `travel`, `us`, `world`, and others.

Returns ~20-40 articles per section. Current news only -- no historical queries.

### Most Popular API

**Endpoint:** `https://api.nytimes.com/svc/mostpopular/v2/{mostemailed|mostshared|mostviewed}/{section}/{period}.json`

Three variants: most emailed, most shared, most viewed. Period options: 1, 7, or 30 days. Covers the past 30 days maximum. Wire service stories (AP, Reuters) are excluded.

### Relevance to Time Machine

These APIs are only useful for a "current news context" layer -- e.g., showing what is trending today alongside historical simulation. They have no historical utility.

---

## 4. Authentication and Rate Limits

### Getting an API Key

1. Create a free account at [developer.nytimes.com](https://developer.nytimes.com)
2. Create an "App" and select which APIs to enable
3. Receive an API key immediately
4. Pass the key as `?api-key=YOUR_KEY` query parameter

### Rate Limits

| API | Per Minute | Per Day |
|-----|-----------|---------|
| Article Search | 10 requests | 4,000 requests |
| Archive | not specified | 2,000 requests |
| Books | 5 requests | 500 requests |
| General (some sources) | 5 requests | 500 requests |

Rate limit violation returns HTTP 429 with no `Retry-After` header. You must implement your own throttling.

### Pricing

**Free for non-commercial use.** There is no documented paid tier or enterprise plan for higher rate limits. The NYT API appears to be a public-good offering, not a revenue product. For commercial use, you would likely need to contact NYT directly for licensing.

---

## 5. Practical Questions for Time Machine Use Cases

### Can we get full article text?

**No.** The API returns only `abstract`, `snippet`, and `lead_paragraph`. Full text is not available through any NYT API endpoint. The `web_url` links to the article on nytimes.com, but scraping is against the Terms of Service. For pre-1900 articles, even the abstract/snippet fields are usually empty -- you effectively get only the headline.

### Can we query "all articles from June 15, 1884"?

**Yes, via two approaches:**

1. **Article Search API**: `begin_date=18840615&end_date=18840615` -- returns up to 1,000 articles for that day, 10 per page. You will get headlines, `pub_date`, `print_page`, and `web_url`, but almost no keywords, bylines, or abstracts.

2. **Archive API**: Fetch `archive/v1/1884/6.json` to get all of June 1884, then filter client-side by `pub_date` for June 15. More efficient if you want multiple days from the same month.

The data will be structured but thin -- essentially a list of headlines with dates and page numbers.

### Can advertisements be distinguished from editorial content?

**Yes.** The `document_type` field distinguishes `"article"` from `"advertisement"`. The `type_of_material` field provides finer granularity: `"News"`, `"Editorial"`, `"Letter"`, `"Review"`, `"Advertisement"`, etc. You can filter with `fq=document_type:("article")` to exclude ads. However, for pre-1900 content, both fields often just say `"Archives"`, so the distinction may be unreliable for historical articles.

### How NYC-centric is coverage for non-NYC locations?

The NYT is a national/international paper, so coverage of non-NYC locations depends on newsworthiness. For "Baton Rouge July 1978", you would likely find:
- National stories that mention Baton Rouge (politics, weather events, sports)
- Very few routine local stories (those would be in the Baton Rouge Advocate, not the NYT)
- The `glocations` filter can help: `fq=glocations:("Baton Rouge")`

For historical local coverage of non-NYC locations, **Chronicling America** (local newspapers) would be far more useful than the NYT API.

### For NYC 1884 specifically?

The NYT was a New York paper, so NYC coverage in 1884 would be extensive -- local crime, politics, society, weather, shipping, commerce, theater, etc. The headlines alone would provide rich period flavor even without abstracts.

---

## 6. Alternative and Complementary Newspaper APIs

### Chronicling America (Library of Congress) -- Best Free Alternative

**URL:** [chroniclingamerica.loc.gov](https://chroniclingamerica.loc.gov/) / [loc.gov/apis](https://www.loc.gov/apis/)

- **Coverage**: 1756--1963, millions of pages from newspapers across all 50 states
- **Authentication**: None required. Completely free and open.
- **Full text**: Yes -- OCR text is available for every digitized page, both via API (`full_text` field in JSON) and as bulk downloads (`ocr.txt` per page)
- **Search by date and state**: Fully supported via query parameters (`start_date`, `end_date`, `location_state`)
- **Data format**: JSON via loc.gov API
- **Rate limits**: No hard documented limit, but rate limiting is enforced. Queries returning >100,000 results will be rejected; use facets to narrow.
- **OCR quality caveat**: Pre-1900 OCR quality varies significantly. Old typefaces, degraded print, and microfilm artifacts produce noisy text. Searching may miss articles due to OCR errors.
- **API migration**: As of 2025, the legacy `chroniclingamerica.loc.gov/search/` API is being replaced by the `loc.gov` JSON API. Use the new endpoints.

**For Time Machine**: This is the strongest free complement to the NYT API for historical research. For NYC 1884, multiple New York newspapers are digitized. For Baton Rouge 1978, Louisiana newspapers in the collection could provide local coverage. The 1963 cutoff is a limitation for post-1963 queries.

### ProQuest Historical Newspapers -- Best Paid Alternative

- **Coverage**: 200+ newspapers, full-page images and OCR text, back to the 1700s. Includes the full NYT (1851--2021) with higher-quality digitization than microfilm.
- **Access**: Institutional subscription required. No public API. Data access via TDM Studio or purchased hard drives.
- **For Time Machine**: Not practical for a runtime API integration. Useful for offline research and pre-building content databases.

### Newspapers.com (Ancestry)

- **Coverage**: 800M+ pages, extensive US and international coverage
- **Access**: Subscription paywall. **No public API.** No programmatic access.
- **For Time Machine**: Not usable programmatically.

### Associated Press API

- **URL:** [developer.ap.org](https://developer.ap.org/)
- **Coverage**: AP wire content. Historical collections include Middle East Bureaus (1967--2005) and Washington DC Bureaus (1938--2009).
- **Authentication**: API key via developer portal, OAuth 2.0
- **For Time Machine**: Could provide national/international wire news context, but historical coverage is limited and fragmented.

### Other APIs

| Source | Coverage | Access | Notes |
|--------|----------|--------|-------|
| The Guardian API | 1999--present | Free, key required | UK-focused, no historical depth |
| NewsAPI.org | 2014--present | Free tier + paid | Aggregator, no historical depth |
| NewsAPI.ai | 2014--present | Free tier + paid | AI-enriched, no historical depth |
| Trove (Australia) | 1803--present | Free | National Library of Australia |
| Europeana Newspapers | Various | Free | European newspaper archives |

---

## API Comparison for Time Machine

| Feature | NYT Article Search | NYT Archive | Chronicling America | ProQuest |
|---------|-------------------|-------------|-------------------|----------|
| Coverage dates | 1851--present | 1851--present | 1756--1963 | 1700s--2020s |
| Full text | No (snippets only) | No (snippets only) | Yes (OCR) | Yes (OCR + images) |
| Geographic scope | NYT only | NYT only | ~3,000 US newspapers | 200+ papers |
| Authentication | API key (free) | API key (free) | None | Institutional |
| Rate limits | 10/min, 4K/day | 2K/day | Soft limits | N/A |
| Pre-1900 quality | Sparse metadata | Sparse metadata | Variable OCR | High quality |
| Cost | Free | Free | Free | Subscription |
| Ads vs editorial | `document_type` field | `document_type` field | Not structured | Structured |
| Programmatic | Yes | Yes | Yes | TDM Studio only |

---

## Recommendations

For the **NYC 1884** use case, the optimal strategy would be:

1. **NYT Archive API** to get the list of headlines for a given day -- provides the "front page" of The New York Times with date-accurate headlines
2. **Chronicling America** for full-text OCR of other New York newspapers from that day, plus broader local color
3. For **Baton Rouge 1978**, NYT API will have limited local coverage; Chronicling America's 1963 cutoff means neither source covers it well. Local newspaper archives (Baton Rouge Advocate) would require ProQuest or direct library access.

---

## Sources

- [NYT Article Search API v2 Spec](https://github.com/nytimes/public_api_specs/blob/master/article_search/article_search_v2.md)
- [NYT Archive API Spec](https://github.com/nytimes/public_api_specs/blob/master/archive_api/archive_api.md)
- [NYT Most Popular API Spec](https://github.com/NYTimes/public_api_specs/blob/master/most_popular_api/most_popular_api_v2.md)
- [NYT Developer Portal](https://developer.nytimes.com)
- [D-Lab: Getting Started with the NYT API](https://dlab.berkeley.edu/news/getting-started-nyt-api)
- [Georgetown University: NYT Text and Data Mining Guide](https://guides.library.georgetown.edu/c.php?g=729844&p=9706817)
- [Martin Heinz: Scraping News from Public APIs](https://martinheinz.dev/blog/31)
- [Chronicling America](https://chroniclingamerica.loc.gov/)
- [LOC API Documentation](https://www.loc.gov/apis/)
- [Chronicling America API Guide](https://www.loc.gov/apis/additional-apis/chronicling-america-api/)
- [ProQuest Historical Newspapers](https://about.proquest.com/en/products-services/pq-hist-news/)
- [Associated Press API](https://publicapi.dev/associated-press-api)
- [pynytimes Python Library](https://github.com/michadenheijer/pynytimes)

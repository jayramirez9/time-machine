# New Repository Plans

Ideas and specifications for future Time Machine platform repositories.

---

## 1. `star-waggon` — Physical Space Specs & Simulation

**Purpose:** Define the physical containers where Time Machine operates — trailer builds, room conversions, and portable installations. Less code, more specs, simulations, and build documentation.

**Core spaces to define:**
- **The Star Waggon** — Primary trailer build (the flagship mobile experience)
- **The Green Room** — Talent/guest holding area with ambient Time Machine
- **The Podcast Booth** — Audio-optimized enclosed space for recording + immersion
- Additional container types as the fleet grows

**What lives in this repo:**
- Physical dimensions and floor plans (CAD exports, SVGs, diagrams)
- Window/display placement specs (size, position, cardinal orientation per wall)
- Speaker placement maps (channel assignments, distances, angles)
- Electrical and HVAC requirements per container
- Material specs (wall treatments, acoustic panels, blackout, trim)
- Display hardware specs (panel model, resolution, bezel, mounting)
- Compute hardware specs (GPU nodes, network switches, cabling runs)
- Weight budgets and structural load calculations (critical for trailers)
- Build-out checklists and punch lists
- Photo documentation of builds in progress
- Calibration reference data per room (color profiles, speaker measurements)
- Cost estimates and vendor lists

**Relationship to `time-machine`:**
- Each room definition produces a **viewport config** that the weather engine / Unreal renderer consumes: how many windows, what size, what orientation, what position in the room
- Speaker placement maps feed the audio engine's spatial configuration
- This repo is the "physical layer" — `time-machine` is the "software layer"

**Repo structure sketch:**
```
star-waggon/
├── spaces/
│   ├── star-waggon-v1/
│   │   ├── floor-plan.svg
│   │   ├── dimensions.yaml
│   │   ├── displays.yaml        # panel specs, mount positions, orientations
│   │   ├── speakers.yaml        # placement, channels, distances
│   │   ├── compute.yaml         # hardware specs, network topology
│   │   ├── electrical.md
│   │   ├── materials.md
│   │   └── photos/
│   ├── green-room-v1/
│   └── podcast-booth-v1/
├── shared/
│   ├── display-catalog.yaml     # approved display models + specs
│   ├── speaker-catalog.yaml     # approved speaker models
│   └── compute-catalog.yaml     # approved GPU nodes, switches
├── templates/
│   └── new-space-checklist.md
└── README.md
```

**Format:** Primarily YAML/Markdown/SVG — machine-readable where useful, human-readable always. No runtime code needed initially, though simulation scripts could come later.

---

## 2. `viewport-designer` — Consumer Room Configuration UI (Future)

**Purpose:** A consumer-facing tool where someone enters their room dimensions, places virtual "windows" (displays) on walls, and the system generates the render configuration for Time Machine to drive those displays.

**Vision:**
- Enter room dimensions (L × W × H) or scan with phone LiDAR
- Drag and drop display "windows" onto walls in a top-down or 3D view (like the HomePod spatial audio setup UX)
- Each window gets a cardinal orientation, size, and position automatically derived from wall placement
- Output: a viewport config that tells Unreal where each camera frustum lives in the virtual world
- Connect real displays to real GPU outputs and the room becomes a Time Machine space

**Key design considerations:**
- The UI must feel like arranging furniture, not programming a render farm
- Room dimensions define the render volume — the virtual room matches the physical room
- Window placement tells the engine where the "portals" are — each one becomes an Unreal camera with correct FOV, orientation, and position
- Speaker placement (optional) configures the audio engine's spatial mix
- The gap between "pro install" (Star Waggon) and "consumer DIY" is mostly this tool — it replaces the manual calibration and config process

**Depends on:**
- `time-machine` viewport config format (to be defined)
- Unreal multi-display / nDisplay pipeline
- `star-waggon` room definitions as reference implementations

**Timeline:** Far future. Note this in PRD Section 7 (Non-Goals for v1): "Consumer DIY kits (v1 is pro install / owned-and-operated quality)." This becomes viable once the pro install pipeline is proven and stable.

---

## 3. `news-engine` — AI News Scanning & Strategy Analysis Agent

**Purpose:** An autonomous agent that monitors news sources (local and international), tracks developing stories, and analyzes how events might affect strategy — for Time Machine business decisions, content opportunities, and situational awareness.

**What it does:**
- Scans configurable news sources on a schedule (RSS, APIs, web scraping)
- Categorizes stories by relevance (entertainment industry, real estate, tourism, tech, local market conditions)
- Tracks developing stories over time (not just one-shot headlines)
- Runs prediction/analysis on how stories might play out and what they mean for strategy
- Produces daily/weekly briefings in a structured format
- Alerts on high-relevance breaking stories

**Potential architecture:**
```
news-engine/
├── agents/
│   ├── scanner.js          # RSS/API/web source ingestion
│   ├── classifier.js       # Relevance scoring and categorization
│   ├── tracker.js          # Story arc tracking over time
│   └── analyst.js          # Strategy impact analysis (LLM-powered)
├── sources/
│   └── sources.yaml        # Configurable news source definitions
├── briefings/
│   └── YYYY-MM-DD.md       # Generated daily briefings
├── config.yaml             # Categories, alert thresholds, schedule
└── README.md
```

**Key design decisions to make:**
- Which LLM powers the analysis layer (Claude API is the natural fit)
- Source selection: RSS feeds, news APIs (NewsAPI, GDELT), social media signals
- Delivery mechanism: email digest, Slack bot, web dashboard, or just markdown files in the repo
- Scope: pure business intelligence, or also content research (e.g., "there's renewed interest in 1920s New York — opportunity for a new Time Machine preset")?
- How opinionated should the strategy analysis be vs. neutral summarization?

**Not related to `time-machine` runtime** — this is a separate business intelligence tool. Could eventually feed into content prioritization decisions (which Place × Time presets to build next).

---

## 4. Apple TV Port — Single-Viewport Consumer Entry Point

**Purpose:** The simplest possible consumer Time Machine — one screen, spatial audio, no multi-display complexity. Apple TV app with a single "window" viewport and the full audio engine doing the heavy lifting for immersion.

**Why it works:**
- **Audio carries the experience.** The 5-layer audio engine (base beds, directional beds, micro-events, weather, occlusion) was built to create a believable "outside" — on a single-screen device, that spatial audio layer becomes the primary immersion driver, not a supplement to visuals
- **Single viewport = simple render pipeline.** One camera, one output, no nDisplay, no multi-GPU sync. Could potentially run on Apple's GPU (A-series / M-series) rather than requiring Unreal on a PC — or stream from a cloud render node
- **Apple TV has spatial audio built in.** AirPods Pro/Max with head tracking, HomePod surround setups — the platform already supports the kind of spatial rendering the audio engine produces
- **Low barrier to entry.** No trailer build, no custom hardware, no calibration. Download app, pick a Place × Time, put on headphones, turn on the TV

**Key design questions:**
- **Render approach:** Native Metal/RealityKit on-device? Unreal pixel streaming from cloud? Pre-rendered video loops driven by weather state? Each has very different quality/cost/latency tradeoffs
- **Audio delivery:** Web Audio API in a tvOS web view (matching current browser engine)? Native AVAudioEngine with spatial audio framework? The latter unlocks Apple's head-tracked spatial audio
- **Content scope:** Start with a curated set of Place × Time presets rather than the full open-ended engine. Quality over breadth — a few stunning experiences beat a hundred mediocre ones
- **Interaction model:** Siri Remote for preset selection, minimal UI during playback. The experience should feel like turning on a window, not operating an app
- **Time of day:** Could default to "live mode" — synced to your actual local time — so the window always shows the right light and activity level. Pick a place, and it just runs

**Relationship to `viewport-designer` (idea #2):**
- Apple TV is a degenerate case of the viewport designer — one wall, one window, fixed position
- Proves the single-viewport pipeline before scaling to multi-window consumer rooms
- The viewport designer could eventually support "Apple TV mode" as a deployment target

**Relationship to `time-machine`:**
- Consumes the same WorldState format — states + controls
- The audio engine HTML/JS could be adapted to a native tvOS audio layer, or run as-is in a WKWebView
- Weather providers, timeline interpolation, and world state compilation all work unchanged — only the rendering and audio transport layers need platform adaptation

**Product ladder:** Star Waggon (pro trailer) → Consumer multi-window room (viewport designer) → Apple TV single window (this) → Audio-only mode (headphones, no screen — just the soundscape)

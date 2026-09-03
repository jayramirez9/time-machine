# Tech Watch

Pipeline- and tooling-shaped research items that are worth a re-read but not a build. One entry per item, newest last. Format follows the watch notes in `docs/spike-generative-backdrop.md` §3 (those two stay there — they are about the backdrop question specifically; generative-model items continue to land there, everything else lands here).

Rules of the doc:

- **Source and trust level first.** Vendor post, demo thread, hands-on, or repo read — say which. A social-media thread is a claim, not a result.
- **Assess per authoring route** (PRD v3.2 §17): Historical, Memory, Authored. Most items fit one route and are noise for the others.
- **Name the re-test trigger.** A watch note with no trigger is a bookmark. Re-reading is free; scheduling work is not, and an entry here is never authorization to start it.
- **Verdict is one of:** no / watch / quarantined (PRD §17) / steal a stage / schedule (with the build id). "Steal a stage" means one mechanism transfers into an existing epic, and is still "watch" for scheduling purposes unless a build id is named; the rest of the item does not transfer.

## Index of watch items (all locations)

Older items live where they were written; they are not moved. This index is the one place to see them all. ROADMAP's "Drove Phase 7d (acted on)" bucket (3DGS, Cesium splat streaming, ion iTwin Capture, Khronos splat extensions, UE 5.8) is deliberately excluded: acted-on is not watch.

| Item | Where | Last touched | Posture |
|---|---|---|---|
| Unreal Engine 6 (Verse-first; fate of Python/RC automation) | `ROADMAP.md` §Technology Watch; `docs/review-year1-2026-07.md` (authoritative: EA end-2027, full 2028–29 — the ROADMAP bullet's late-2026 EA is stale) | 2026-07 | watch |
| RealityKit / visionOS 27 (3DGS, reverb mesh API) | `ROADMAP.md` §Technology Watch | 2026-06 | watch |
| MetaHuman Crowd (UE 5.8) | `ROADMAP.md` §Technology Watch | 2026-06 | watch |
| AI 3D generators (Meshy 6, Hyper3D/Rodin, Tripo, TRELLIS 2) | `ROADMAP.md` §Technology Watch | 2026-06 | watch |
| UE scene → splat bake for browser distribution (PlayCanvas, Atlux, SuperSplat) | `ROADMAP.md` §Technology Watch | 2026-07 | do not use for running scenes |
| Google Genie 3 and generative world models | `ROADMAP.md` §Technology Watch | 2026-06 | quarantined (PRD §17) |
| World Labs Marble (`marble-1.1`; Unreal-import claim) | `ROADMAP.md` §Technology Watch; `docs/spike-generative-backdrop.md` watch note 2026-08-13 | 2026-08-13 | quarantined; 7d.5 arm B, spike parked |
| World Labs Atlas (few-image reconstruction; future Marble) | `docs/spike-generative-backdrop.md` watch note 2026-09-02 | 2026-09-02 | watch; Memory-route core-path capability |
| PhiloLabs fable51-worlds (agent-swarm city; camera-match QA) | this doc | 2026-09-03 | steal a stage into v3-pivot #11 / P8 (E06); not scheduled, D003 holds |
| mapped.earth (ERA5 globe with a Time Machine scrub) | this doc | 2026-09-03 | no new data; scouting aid at most |

---

### Watch note (2026-09-03): fable51-worlds — agent-swarm city reconstruction, and the camera-match QA loop

**Source and trust level:** GitHub repo `PhiloLabs/fable51-worlds` (MIT; README read 2026-09-03) plus a Threads post with Hacker News commentary. The repo is real and public (MIT, README read); nothing here has been run. The cost figure (about $33 / 8M tokens for the Union Square demo) is from the thread, not the README. Not a hands-on.

**What it is:** an autonomous Claude Fable 5.1 agent swarm that rebuilds a present-day place as a browser Three.js world. Four stages: (1) research agents pull OpenStreetMap geometry, USGS 3DEP, transit specs, and a **storefront census** (README's word; any confidence scoring is our assumption, unverified); (2) Blender Python scripts generate optimized GLB kits (facades, furniture, vehicles, vegetation); (3) Three.js assembles terrain, streets, facades, props, crowds, traffic from JSON specs; (4) **camera-match QA** — Playwright screenshots fixed viewpoints, diffs them against real photographs, and independent reviewer agents (architect, geographer, artist) write validation reports. Union Square: 453 buildings, 129 real storefronts, 34 camera-matched viewpoints, 147 comparison sheets, 9 reviewer reports. Facades are **authored or procedural, not photo-derived** — Union Square lists 75 hand-authored facades; the separate Kyoto demo (deliberately ink-styled, weak support for a photoreal claim) draws every sign and roof tile in Canvas2D at startup. Photos are used only to check. Present-day only; no historical layering. HN flagged messy topology and high poly counts.

**Per route:**

- **Historical.** The pipeline is the v2 shape (place → research → assemble → validate) that §3.1 inverted where a dated frame exists; the research swarm and confidence scoring add nothing over `lib/agents/` (and confidence is demoted metadata under v3.0). Blender kit generation is what U3's era kit + PCG covers in Unreal. **One stage transfers: camera-match QA.** It is the automation of the §27 Photo Test — place a camera at the manifest viewpoint via the RC API, capture, produce a comparison sheet against the dated photo, have reviewer personas write independent reports. Nothing in the repo does this today (the nearest prior art, `buildReviewChecklist()`, is a confidence-threshold checklist, not a render-vs-photo comparison), and it is what makes "the photograph is the spec" measurable rather than a wall exercise.
- **Memory.** No photo→geometry path, so nothing transfers *except* the same QA loop, which matters more here than anywhere: the guest's photographs are the only ground truth, so guest-photo-vs-render at a matched viewpoint is the route's acceptance test.
- **Authored, real place.** The closest fit — a present-day city from OSM + USGS is exactly this case — but Cesium World Terrain + OSM Buildings in Unreal already gives it at higher fidelity than Three.js kits. The one thing OSM Buildings lacks that they solved is the **storefront inventory**: real ground-floor businesses and signage. A storefront-inventory agent feeding ground-floor dressing would help present-day urban scenes and recent-era Historical ones. Useless for Lake Oconee or a snowy cabin.

**Not worth taking:** Three.js as output; procedural Canvas2D facades as hero content; the topology quality. The cost figure is a datapoint only — swarm-authored Band C massing is cheap enough that the "extend procedurally beyond frame edge" stage (§3.1) and far-field filler need not be hand-budgeted.

**Re-test triggers:** (1) the D003 Exit choice after the Presence Gate — that is when Jay picks the next work, and this is a candidate then, not before; (2) Scene 0 turns out urban — then the storefront-inventory agent is worth a look; (3) the repo adds photo-derived facades or any historical layering — re-read, since that would change the Historical-route verdict.

**Verdict: steal a stage — watch only, do not schedule.** Camera-match QA transfers *into* the build that already owns it: `docs/v3-pivot-plan.md` step #11 (Witness / Photo-Test tooling, "side-by-side compare harness + flinch-backlog"), which `docs/refactor-plan.md` folds into the P8 flinch-eval harness extension (E06, **paused by D003** per `builds.md`). Concretely: RC-driven capture at the manifest viewpoint + comparison sheet + independent reviewer-persona reports, in place of a hand-mounted print. EP0 is the earliest point it is *technically* possible (needs the box for RC captures); it is not scheduled — `docs/experience-proof-plan.md` EP3 lists the Photo Test as not required, so its first consumer is Scene 1 (BR-1985), and D003 Exit gives Jay the choice after the Presence Gate. Serves all three routes. Storefront agent: watch. Everything else: no.

---

### Watch note (2026-09-03): mapped.earth — an ERA5 globe with a "Time Machine" scrub

**Source and trust level:** the site itself (`mapped.earth/earth`, `/about`, read 2026-09-03). A personal project by one author (Aaron J Becker), "all rights reserved," no API or download mentioned. The globe's own source credits name **ERA5 winds, Copernicus / ECMWF**, plus TROPOMI NO₂, WorldClim, HydroRIVERS, ETOPO. The shared URL selects `era5monthly` / `t2m_anom` (2 m temperature anomaly) / `speed` (wind). The about page says the Time Machine "scrubs eight decades of climate history" — consistent with ERA5's 1940 start.

**What it is:** a visualization layer over public reanalysis, not a data source. Verified in our code: `lib/openmeteo.js` requests **hourly** data from the Open-Meteo archive endpoint with a 1940-01-01 floor, and `lib/weatherTimeline.js` makes it the default provider for 1940+ when no Visual Crossing key is set (our own quality model still treats the 1940s as 6-hourly-grade and the 1950s–60s as 3-hourly). Per Open-Meteo's documentation (not read this session): that archive is ERA5 (0.25°) blended with ERA5-Land (0.1°) — the same Copernicus/ECMWF reanalysis this site credits; we do not pin a `models=` parameter, so we take the endpoint's default blend. What the site scrubs is the **monthly-mean** product, coarser in time than what the engine consumes for a single day. So there is no accuracy boost available here: the underlying numbers are ones we already have at finer resolution, and pre-1940 (NYC 1884) is out of range for both.

**Per route:**

- **Historical.** Nothing new as data. Two small things as *practice*: (1) the anomaly framing — a day's temperature relative to its climatology — is a witness cue ("that August was brutal") that we do not currently surface; it is computable from Open-Meteo's own climatology, no new dependency. (2) As a **human scouting aid** for an authoring session — see the synoptic pattern of a chosen week before committing a scene date — it plays the role Google 3D Tiles plays for geography: look, do not depend. Not an integration.
- **Memory.** Same as above; the date is fixed by the photographs, so only the anomaly cue applies.
- **Authored, real place.** No relevance beyond scouting.

**Not worth taking:** no API mentioned, all-rights-reserved, monthly means. There is nothing to integrate and nothing to license.

**Re-test trigger:** none on the site. The adjacent thing worth re-checking, on our own dependency, is whether Open-Meteo has added **ERA5 sub-daily precipitation type or convective indices** — `thunderProb` today derives from rain level alone (`calculateThunderProb` in the compiler), so those would sharpen it for the pre-1970 window where Visual Crossing has nothing. That is a provider question (E01, **P5 extension paused by D003** per `builds.md`); check it at the next provider-facing build or the D003 Exit choice, whichever comes first. This site is only the reminder.

**Verdict: no.** Bookmark as a scouting toy; the anomaly-as-witness-cue idea is the one takeaway, and it belongs to the compiler, not to this site.

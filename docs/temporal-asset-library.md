# Temporal Asset Library

**Status:** Spec (PRD v3.0). Not yet built. The workstream that makes multi-era mechanical instead of heroic.

## What it is

Every structure in the world carries **versions keyed to date ranges.** A building is not one asset; it is a timeline of assets — the same lot at 1884, 1910 (new cornice), 1948 (storefront modernized), 1978 (signage changed), today. You look one up by **location + date**, and you get the version that stood there then.

```
lookup(location, date) → the asset version whose [validFrom, validTo] contains date
```

That is the whole idea. It is a **CMS problem, not an agent problem** — versioning, date-range indexing, lineage, and lookup, not research. The agents (PRD §23) feed it; they are not it.

## Why it is the moat (correctly named)

PRD §17 calls the procedural + archival regime "the product's moat." That is right but under-specified. The moat is not any single reconstruction — it is that **every scene deposits assets the next scene draws on, and the value compounds.**

- Build 1884 Bowling Green and you have deposited ~29 dated building versions, a street grid, gas-lamp placements, period materials.
- Build 1910 Bowling Green and most of those buildings still stand — you author only the *deltas* (a new facade, a demolished tenement, a raised cornice), and the library already holds the rest.
- Build 1978 and you are mostly editing signage and surfaces on structures the library already knows.

The first scene of a place is heroic. The tenth is a lookup plus a delta. No mapping platform solves this — it is specific to *dated* reconstruction, and it accrues only to whoever has been building the catalog. **That accrual is the durable advantage.**

## Relationship to the rest of the system

- **Absorbs PRD §8.6 / ROADMAP Phase 8 "multi-era support."** Under v3.0, "same block, different year" is not a re-build — it is a lookup by location + date against this library. The item moved here (ROADMAP Phase 10).
- **Feeds Photo-First authoring (PRD §3.1, ROADMAP Phase 10).** A dated photograph reconstructs an in-frame view; the reconstructed structures are deposited into the library with the photo's date as an anchor point on their timeline. The next scene at that location, any date, benefits.
- **Consumes agent output (PRD §23).** The building-date agent (`lib/agents/buildingDateAgent.js`) already estimates `yearBuilt`/`yearDemolished` from 7 evidence methods — that is exactly the `[validFrom, validTo]` this library indexes on. The library is the store those estimates populate.
- **Provenance, not confidence (PRD §14.6/§23).** Each asset version records its provenance mode and the date-gates that produced it — not a confidence score. Two versions of the same lot are distinguished by date range, not by a certainty rating.

## What a versioned asset carries (sketch — to be specified during build)

- **Identity:** stable feature ID (the lot / structure), independent of any one version.
- **Version:** `{ validFrom, validTo }` date range; the geometry + material set + signage + dressing for that span.
- **Lineage:** what changed from the prior version and why (demolition, renovation, re-facing, signage swap) — so a decade transition can be authored as a delta, not a rebuild.
- **Provenance:** mode (historical / observed / authored) and the gates in force, per PRD §14.6.
- **Representation:** which regime produced this version (capture | procedural), per the representation selector (PRD §17).

## Open questions for the build

1. **Store.** Where does the catalog live — flat JSON keyed by feature ID (fits the current "profile JSON is source of truth" convention), a real content store, or a hybrid? Starts as the former; revisit when scene count makes it painful.
2. **Delta authoring UX.** How does a non-technical author say "this storefront changed in 1948" without re-touching the whole structure? This is the CMS design problem and the thing that determines whether the tenth scene is actually cheap.
3. **Cross-scene identity.** How is "the same lot" recognized across two independently-authored scenes so they share a timeline rather than forking? Geo-anchoring (OSM intersection anchors already used in `buildingMassing.js`) is the likely key.
4. **Craft-hours per version.** Track the real hours to author one dated version and one decade-delta. That number, not the ~$3/scene research figure, is the catalog economics (see PRD open items).

## Not this

- Not a research layer — the agents research; this stores and indexes.
- Not a confidence/citation store — provenance and date ranges only (PRD v3.0).
- Not per-scene — the whole point is that it is *cross*-scene and compounding.

# Sound Libraries

**Status:** Spec (PRD v3.0). A sourcing problem, not a research problem.

## What it is

Texture libraries of audio keyed by **era, region, and object class.** Not "a car horn" — a *late-1950s American V8 horn* (dual-tone, brassy) versus a *1970s delivery truck* (flatter, harsher) versus a *1980s Japanese compact* (thin, higher). Same object class, different specimens, selected by the scene's Place × Time.

```
lookup(objectClass, era, region) → the specific specimen that flinches least
```

## Why it is a library problem, not a research problem

Neither the '50s V8 horn nor the '70s truck horn is *more correct* than the other. They are **specific**, which is what the PRD already demands of every visual surface (a brownstone is a *specific* brownstone, not a generic one). The work is not researching which is right — it is **sourcing and organizing enough specimens** that the scene can always reach for the specific one.

This is the audio counterpart to the era material catalog (`lib/materialCatalog.js`): a systemized library indexed by era/region/class, reused across scenes, so quality scales with the library rather than with per-scene hand-authoring. Build the system, source the specimens, and any Place × Time draws the specimens that fit.

## Why it matters under the Flinch Standard (PRD §5.0)

Wrong-era audio is a top flinch source and it is invisible to any citation check. A synthesizer in a 1958 scene, a modern car horn in 1972, a diesel note where a gasoline engine belongs — every person who was there feels it instantly and cannot say why (PRD §5.0). Date-gating (PRD §5.6) says the *class* must exist at the scene date; the sound library goes further and supplies the *specimen* that sounds like that date and place. Gating prevents the anachronism; the library prevents the generic.

## Relationship to the rest of the system

- **Extends the procedural profile generator (`lib/profileGenerator.js`).** The generator already has 47 event templates across 6 era brackets and picks *which* events fire. The sound library determines *which specimen* each event plays — the missing specificity layer.
- **Fed by date-gating (PRD §5.6).** The gate answers "may this class appear at this date?"; the library answers "which specimen of it?"
- **Complements the ecology diurnal/temperature gating** (pending refactor, `docs/scope-code-provenance-refactor.md`): the gate says *which species, when*; the library supplies the *specimen* recording for that species/region.
- **Generation vs. sourcing.** Today ElevenLabs (`tools/elevenlabs-fetch.js`) *generates* era-aware SFX from prompts — that is one specimen source. Freesound and field recordings are others. The library is the index over all of them, era/region/class-keyed, so specimens are reused across scenes rather than regenerated per scene.

## Object classes to organize (starter set)

- **Vehicles:** engine notes, horns, brakes, tires-on-surface — by decade and market (American V8, European inline, Japanese compact, diesel truck, streetcar, steam).
- **Bells & whistles:** church bells, work whistles, fog horns, school bells, fire alarms — by region and era.
- **Human/commerce:** vendor calls, foot traffic, register/till sounds, door chimes — by era and region (dialect/language handled by the voice pipeline).
- **Domestic/industrial:** appliances, machinery, HVAC, radios-as-objects — by era.
- **Weather-on-surface:** rain and wind on cobblestone vs. asphalt vs. tin roof vs. canvas awning — already partly handled by the materials layer; specimens organized here.

## Open questions for the build

1. **Index shape.** Flat JSON keyed by `{class, era, region}` (fits the current convention) vs. a richer store. Start flat.
2. **Specimen provenance.** Each specimen records its source (generated / field / licensed) and its era/region fit — provenance, not confidence (PRD §14.6).
3. **Coverage priority.** Which classes flinch loudest first? Vehicles and bells are high-salience in urban scenes; weather-on-surface is high-salience in natural/observed scenes (PRD §17 — "observed is not the easy mode").
4. **Reuse vs. regenerate.** When is a stored specimen good enough vs. regenerating a scene-specific take? Reuse is the point; regeneration is the exception.

## Not this

- Not a research deliverable — no citations, no confidence scores (PRD v3.0).
- Not per-scene one-offs — the value is a reusable, cross-scene, era/region-indexed catalog.

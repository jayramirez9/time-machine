# PROPOSAL — PRD addition: Personal Memory Reconstruction (v2.2)

**Status: LANDED in `PRD.md` (v2.2, July 2026).** All four edits + the version-line bump are in. This file is retained as the design rationale for the addition and as the home of the open questions still owed a decision (footer) — those were deferred to a later session, not resolved.

**Design intent:** an *addition, not a replacement*. The historical North Star (§3) stays the North Star. This establishes a **second mode** that runs on the same engine, and makes the two small constitutional touches required so the new mode doesn't read as violating the existing Laws.

The edits (five, counting the version-line bump): **(0)** version line v2.1→v2.2 · **(1)** Version block → v2.2 amendment note · **(2)** new **§3.5** (the substantive framing) · **(3)** §9 → one new use case · **(4)** §17 generative boundary → one paragraph relocating authority.

---

## Edit 1 — Version block (append after the v2.1 amendment paragraph)

> **v2.2 amendment (July 2026):** Adds **§3.5 — The Second Mode (Personal Memory Reconstruction)**, a second application of the same engine in which the source of ground truth is the guest's own photographs and memory rather than the archival record. It introduces one constitutional refinement — the **relocated-authority principle** (§3.5, §17): the Laws are not suspended in this mode, but their ground-truth source shifts from *the cited archive* to *the person whose memory it is, present to verify*. The historical North Star (§3) is unchanged and remains primary.

---

## Edit 2 — NEW SECTION §3.5 (insert immediately after §3, before §4)

## 3.5) The Second Mode — Personal Memory Reconstruction

The North Star (§3) points at *history* — any Place × Time, assembled from cited archival truth, for anyone. The same engine, pointed at a different source of truth, produces a second thing that may matter to people even more: **a day you can walk back into.**

A guest brings photographs of a place that mattered to them and the date it happened — a wedding, a childhood home, a grandparent's shop, a last summer. Time Machine reconstructs that specific place and re-creates the true environment of that specific day, and the guest sits inside it again. Not a slideshow. Not a recreation "in the style of." **The actual day.**

### The division of truth: the guest supplies the *what*, Time Machine supplies the *when*

This mode works because responsibility splits cleanly, and each half is sourced from what is actually good at it:

* **The guest supplies the *what*** — the place, as geometry. Their photographs establish the space and how it was dressed that day: the flowers, the arch, the arrangement of a room.
* **Time Machine supplies the *when*** — the true environment of that date, from the same factual engine that drives historical mode. The **real weather** that day (NOAA records reach back to the 1800s), the **season's real sound** (cicadas in an August dusk, the birds that were actually singing), the **wind**, the **light** — the golden hour as the evening actually ran long. This is the product's most mature capability, and here it does exactly what it was built to do: make the environment *true*, not evocative.

"Sit in that day" is therefore not a metaphor. The world outside the windows is the world that was actually there. The room within is the room the guest remembers. Every cue still agrees (Law 5.1) — it is simply a different day being made coherent.

### The relocated-authority principle

Historical mode forbids invention (Laws 5.5, 5.6) because there is a knowable, cited ground truth that invention would *falsify*. Memory reconstruction fills in what the photographs did not capture — the far wall, the back of the room. This is not a violation of those Laws; it is those Laws operating under a **different authority.**

In historical mode, the arbiter of truth is **the archival record.**
In memory mode, the arbiter is **the person whose memory it is, present to verify.**

Filling in the unseen wall is not falsifying history — it is *collaboration with the memory's owner*, who can say "no, the light came from the other side" and be right. The Laws still bind: **Silence Over Wrongness becomes deference to the person over wrongness** (where the guest is unsure, the system stays neutral rather than inventing a confident detail), and **No Anachronisms still holds absolutely** (nothing from after that date leaks into that date). What changes is only the *source* of ground truth, not the obligation to it.

### What this mode reconstructs — and what it must never

Memory reconstruction rebuilds a **place and a day.** It does **not** synthesize people.

The guests in the memory are the real people who physically return to the room — not AI recreations of them, and never a resurrection of the deceased. Time Machine reconstructs the church, the weather, the cicadas, the cake on the table; it does not generate a likeness of the person who sat at that table. This is a bright ethical line, not a technical limitation, and it is a **non-negotiable** of this mode. The product returns people to a place. It does not return people to people.

### Why it is buildable — and buildable early

The mode sidesteps the two hardest problems in the historical program:

* **No archival sparsity.** Most memory venues still stand. The building is captured *today* — dense, present-day, high-resolution — which is the capture pipeline's easy case, not the archival-photo hard case. The guest's photographs are not the geometry source; they are the **set dressing and the date evidence.**
* **No relighting-of-history puzzle for the shell** — though the guest will want that day's actual evening light, which is why the hero structure favors relightable representation (mesh + PBR) over frozen capture, consistent with the Representation Regimes model (§17).

The engine that makes each bespoke reconstruction affordable rather than an artisan project is the automation already built for historical mode — scene bootstrap, the capture pipeline, the profile assembler. Historical mode scales *breadth* (any place, automatically). Memory mode scales *depth* at the places people care about most. They are complementary uses of one system.

### The sensory completion (dream-state extension)

Memory mode makes the strongest case for extending "every cue agrees" (Law 5.1) into the two senses the platform does not yet reach — **smell and taste** — because smell is the sense most directly wired to memory. This decomposes into two distinct workstreams, not one:

* **Ambient scent is an environmental cue** — flowers, fresh bread, rain on stone, June air. It belongs on the venue control plane (container-os) as another WorldState-driven actuator, exactly as fog or wind-audio are: *WorldState → scent.* No partner required.
* **Food and drink is a hospitality service** — the actual cake, the actual meal, recreated through partners (a recreation-specialist bakery, a caterer). This is business development, not rendering, and it is what turns the room from an immersive display into a full-sensory venue.

Both are dream-state, not v1. They are recorded here because this mode is where they become obvious.

### Exit criteria (the day, made real)

Five years on, the couple returns to the room — with the people who were actually there. Outside the windows is the church where they married, captured true. The light falls exactly as it fell that June evening, because the system knows the sun's real position on that date. It is warm, because it actually was. A cicada drone rises as the light goes gold, because that is the season that was. On the table is the cake — the real one, recreated by a partner from the couple's own photographs — and there are drinks in their hands. Nothing is anachronistic. No one has been synthesized. They are simply, again, in that day.

---

## Edit 3 — §9 Core Use Cases (append as item 6)

6. **Memory Reconstruction Mode** — "Our wedding — St. Mary's — that June evening." Guest-supplied geometry and date dressing, fused with the true weather, light, and soundscape of the actual day (§3.5). One-to-one, bespoke, authored under the guest's authority rather than the archive's.

---

## Edit 4 — §17, append one paragraph to "The generative-world-model boundary"

> **Authority in memory mode.** The boundary above governs the *historical core*, where the archive is the arbiter and invention is forbidden. In Personal Memory Reconstruction (§3.5), the arbiter is the guest, present to verify — so filling in geometry the guest's photographs did not capture is permitted, because it is corrected against a living authority rather than fabricated against a cited one. The provenance discipline is unchanged: contributed geometry and dressing are recorded as guest-authored, at guest-verified confidence, in the same accuracy manifest. Memory mode reconstructs place and environment only; it never synthesizes people (§3.5).

---

## Open questions — DEFERRED to a later session (not resolved at landing)

Jay approved landing the four drafted edits as-is; the decisions below were consciously left for a future pickup, not answered.

1. **Section number.** `§3.5` keeps it adjacent to the North Star without renumbering §4–§23 (the doc already uses `Phase 4.5`, so `.5` is idiomatic). Alternative: a full new top-level section at the end. I recommend §3.5 — it signals "sibling to the North Star," which is the point.
2. **Naming.** "Personal Memory Reconstruction" is descriptive; the evocative line is *"a day you can walk back into."* Keep both, or pick one as the mode's name?
3. **Where the "never synthesize people" non-negotiable is *indexed*.** It is stated bindingly in §3.5, but it's a *permanent* moral line and §5 (The Laws) is where this doc indexes its non-negotiables ("They do not get negotiated away"). Cap's review flags that §7 — my original suggestion — is the wrong home, because §7 is titled "Non-Goals (**for v1**)" and would mis-frame a permanent line as temporary scoping. **Re-scoped: land it in §5 as a Law or Law-level annotation (primary); §7 optional/secondary.** Deferred, not resolved.
4. **Scope of the sensory/venue material.** Kept light here and flagged dream-state. If you want scent/food as a first-class part of the mode rather than a forward-looking note, it grows into its own subsection.

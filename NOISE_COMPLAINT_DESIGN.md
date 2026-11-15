# NOISE COMPLAINT — Design Bible

*Version 0.1 · Working title. The consolidated design record for the follow-up game to Felt Castle Siege: Blocks Edition.*

---

## 1. Vision

**Pitch:** *"The band upstairs has played for forty days and forty nights. You just want to sleep."*

A physics puzzle game where you fling things at a house to **stop the music**. Every level is a home, a fortress, or a hall with musicians inside — and the music itself is the objective, the progress bar, and part of the physics.

**Platform:** iOS (iPhone + iPad), native **Swift + SpriteKit**. Portfolio project. One-off premium app, no ads, no in-app purchases, no accounts.

### Four pillars
1. **Tactile physics** — drag, stretch, snap, crash. The verb must feel physical.
2. **A living, musical world** — the level breathes with the beat; every instrument is a rule.
3. **Easy to pick up, deep to master** — one-finger play; stars and scores reward mastery.
4. **Respect the player** — offline forever, instant restarts, no timers, no paywalls.

### The three differentiators (guard these jealously)
Everything below in the framework tables is table stakes — Angry Birds already did it. These three are why this game should exist:

1. **Music as the objective.** You don't knock down a structure for points; you silence a band. The motivation is a feeling everyone already has.
2. **Instruments as physics rules.** The band keeps the house standing — and misbehaving. Each musician adds one audio layer, one physical behavior, one visual effect.
3. **Audible progress.** The mix thins as you win. Damaged musicians play *sour* before they go silent. Near-miss feedback is heard, not read off a health bar.

---

## 2. Characters

Three characters, three reasons to be furious about noise, three different ways to solve every house.

| Character | Motivation | Weapon | Playstyle |
|---|---|---|---|
| **Grandma** | *"It's past eight."* | Rocking-chair catapult — heavy, slow, deliberate arcs | **The demolisher.** Fewer, heavier shots. Big crashes. The classic siege feel. |
| **The Mad Cat Lady** | *"The drums upset the cats."* | Wicker basket lobbed at the house — on landing, **the cats scatter** | **The chaos engine.** The basket does little; three cats bounce around the structure knocking things loose. Brilliant against tall houses. |
| **The Cook** | *"Nobody slams pans like I do."* | Thrown food — potatoes, and the rare **boiling pot** (detonates like a powder keg) | **The lobber.** High arcs, splat physics, weapon-selection within the weapon. |

**Rules:**
- Personality through animation only — nobody speaks. Grandma's slow wind-up and satisfied nod; the basket wiggling before launch; the Cook kissing the potato.
- Characters are the ammo system (see framework 1.3): same house, three different puzzles.
- Per-character best scores on every level. Shared star progression; the level select quietly shows who cleared what.

---

## 3. Instruments as mechanics

Every instrument = **one audio layer + one physics behavior + one visual effect.** Read the band and you have read the level.

| Instrument | Audio | Physics | Visual |
|---|---|---|---|
| **Drums** | The beat everything follows | Roof and upper blocks **bounce on the beat**; timing shots to land when the roof is *down* is a skill | Dust puffs off the roof on each thump |
| **Saxophone** | Wailing melody | None — but **notes drift out the window** as floating skill-shot targets (bonus points) | Curling notes wobbling away |
| **Trumpet** | Loud stabs | Periodic **gust** shoves loose blocks sideways and nudges projectiles through its cone | Visible air cone; papers flutter |
| **Flute** | Soft high line | Gentle **updraft** above the window — light blocks hover, thrown food floats a little | Sparkle trail rising |
| **Double bass** | Low pulse | **Vibration** — blocks jitter, creep, and damaged ones crack further on each pulse | Ripples in puddles |

**Discipline:** 2–3 instruments per level, never five. Each level is a sentence about one or two mechanics. When a level uses everything, players stop reading the band and fire randomly.

**Damage sequence:** intact → *sour* (flat notes, missed beats — the audible "one hit left") → **silent**. Two-stage audio feedback on every musician.

**Boss idea:** a level where the last musician plays *harder* under pressure — panic tempo. And the finale: the full orchestra. When the last instrument falls silent, the silence itself is the ending beat. A game about noise that ends in perfect quiet.

---

## 4. Structural framework (deconstruction)

### Table 1 — Input and Control

| ID | Element | Psychological driver | Status in this game |
|---|---|---|---|
| 1.1 | Drag-to-aim vector reticle with prediction arc | Agency & commitment | Core — day one |
| 1.2 | Zero-friction instant restart (no loading screens) | Loss mitigation & flow | Core — day one (learned the hard way in Felt Castle Siege) |
| 1.3 | Projectile/ammo switcher | Strategic autonomy | Fulfilled by **character select** — characters are ammo with faces |
| 1.4 | **Cancelled shot** — release outside the launch zone fires nothing | Frustration mercy on touch | Add early; tiny cost, huge relief |

### Table 2 — Physics and Environment

| ID | Element | Psychological driver | Status |
|---|---|---|---|
| 2.1 | Tiered destructible materials (glass/wood/stone) | Readability — players forecast mass vs resistance | Core; carry over material tuning from Felt Castle Siege |
| 2.2 | Ballistic flight (gravity, optional wind/drag) | Anticipation during the surrender of control | Core; SpriteKit physics |
| 2.3 | Chain-reaction triggers (explosives, unstable joints) | Variable reward & spectacle | Boiling pot, gas lamps, stacked furniture |
| 2.4 | **Spectacle camera** — slow-mo zoom on the final collapse | Doubles the payoff of near-misses | Add with the win sequence |

### Table 3 — Progression and Psychological Feedback

| ID | Element | Psychological driver | Status |
|---|---|---|---|
| 3.1 | Efficiency star thresholds (1–3 stars) | Competence & mastery — elegance over survival | Core meta layer |
| 3.2 | Organic near-miss states (one beam teetering) | Loss chasing & hope | Emergent from honest physics; protect readability so near-misses are *legible* |
| 3.3 | Sawtooth difficulty curve (teach–spike–breather) | Flow maintenance | Level sequencing rule |
| 3.4 | **Collection completion** (hidden items — e.g. golden sax notes) | Completionism, distinct from mastery | Post-launch or late content |
| 3.5 | **Daily ritual** — seeded daily house, streak counter | Habit loop | Date-derived seed; zero server needed |
| 3.6 | **Game Center** achievements & leaderboards | Platform-native gamification, free, no server | Use instead of building a custom achievement backend |

---

## 5. Session and length design

- **Per level:** 30–90 seconds. Long enough for an arc, short enough that "one more" is always yes.
- **Per sitting:** 3–6 levels (~5 minutes). Design the session; total length follows.
- **Campaign:** 90 minutes–2 hours of genuinely good content (~40 houses across 3–4 districts). A tight excellent campaign beats a padded long one.
- **After the ending:** endless/daily mode carries retention. A proper ending creates goodwill; the ritual holds people afterwards.
- **Teach → twist → test:** introduce a mechanic, practice it, combine it with an old one, twist it. Something new every 60–90 seconds of play.
- **The "one more" beat:** levels end on near-misses, one-point-from-3-star scores, or a character one star away.

---

## 6. Audio direction

All synthesized or bundled as small samples; music must survive 200 hearings.

- **One hummable motif** — 5–6 notes, one key.
- **Layered, not looped:** calm plucked layer while aiming; rhythm joins in flight; sting on destruction; full theme on victory.
- **The mix is the HUD:** each silenced instrument removes its layer. Sour-note damage states before silence.
- Silence is a reward state — earnable, and used as the ending.

---

## 7. Platform plan (iOS)

**Stack:** Swift + SpriteKit (physics gives proper toppling — an upgrade over Felt Castle Siege's translational-only constraint). SwiftUI for menus/screens; SpriteKit for gameplay scenes. Game Center for achievements/leaderboards.

**Costs:** Apple Developer Program ~$99/yr (required for TestFlight + App Store). Xcode, Swift, SpriteKit, Game Center: free.

**Submission extras:** app icon set, screenshots, privacy policy URL, age-rating questionnaire. Review typically 1–3 days; expect one rejection-and-fix cycle on a first app.

### Roadmap
1. **Phase 0 — Setup (one evening):** Xcode, developer enrollment, template app running on own iPhone.
2. **Phase 1 — Vertical slice (2–4 weeks):** one house, one character, one drummer. Slingshot drag, beam house, drum bounce, silence-the-drummer win. No menus, no stars, no other characters. The slice answers: *is this fun on a phone?*
3. **Phase 2 — Make it a game (1–2 months):** character select, stars, level select map, instrument roster, Game Center.
4. **Phase 3 — Ship (2–3 weeks):** icons, screenshots, TestFlight beta, submission.

**Realistic total:** ~3–6 months part-time. First milestone: *the drummer house running on an iPhone within a month.*

**Portfolio practice:** keep a devlog from day one — screenshots, decisions, art evolution. "Designed and shipped a physics game on the App Store; here's the process."

---

## 8. Build-order checklist (from the framework)

Vertical slice = **only five elements**: 1.1 drag-aim, 1.2 instant restart, 2.1 materials, 2.2 ballistics, one instrument (drum bounce). Fun is proven before any meta layer exists.

Then, in order: 1.4 cancelled shot → 3.1 stars → 2.3 chain reactions + 2.4 spectacle camera → character select (1.3) → 3.6 Game Center → 3.3 full campaign sequencing → 3.5 daily ritual → 3.4 collections.

---

## 9. What carries over from Felt Castle Siege

- Material tuning (mass/HP tables), damage thresholds, quiet-time round resolution — hard-won numbers from a tested core
- UX lessons: delayed result dialogs, tap-to-continue after round end, camera follow, drag-anywhere, auto-resume after interruptions
- The felt/handmade art direction (evolve it with real animation tooling)
- The tested approach: simulate the physics headlessly before it ever renders

*Felt Castle Siege (HTML) remains live as the playable design prototype.*

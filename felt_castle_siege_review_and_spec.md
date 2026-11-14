# Felt Castle Siege: Blocks Edition

Code review and revised specification, version 2.0

14 November 2026. Reviewed against the complete specification and source supplied in this conversation.

Outcome: the original is a visual prototype with release-blocking gameplay faults. Version 2.0 replaces its physics and round management, implements separate Functional Blocks, and supplies a self-contained HTML game. All 26 core checks and eight simulated UI checks pass. Real-browser testing was subsequently run in a headless Chromium environment: seven browser checks pass (page load, standard-shot win with dialog, dialog interaction, inspector, pause, mobile layout, touch-target sizing), and desktop/mobile screenshots were captured. Real touch behaviour, screen readers and Safari/iOS remain unverified.

## 1. Review of the supplied version

| ID | Severity | Finding | Version 2.0 treatment |
| --- | --- | --- | --- |
| R01 | Critical | Every castle object falls under gravity, but there is no block-to-block contact resolution. The roof and crown fall through the supports without a shot. | AABB contacts, mass-weighted separation, normal impulses, friction, ground constraints and eight solver passes support the castle. Each layout passes a 30-second idle stability check. |
| R02 | High | `update()` runs after WIN or LOSE. Projectile collisions, scoring and physics can continue behind the result overlay. | Terminal states freeze gameplay. Launches are rejected outside READY, and each terminal result is emitted once. |
| R03 | High | The crown wins only when directly destroyed. Being knocked off its perch does not satisfy the advertised objective. | Destroying the crown or moving its centre 42 logical pixels from its settled starting position wins. Detection starts only after the first launch. |
| R04 | High | Explosion damage reduces neighbouring HP, but does not process their deaths. Nearby barrels do not recursively detonate. | One destruction path handles HP, score, events and explosions. Barrels mark themselves destroyed before propagating damage, so each detonates once. |
| R05 | High | The prediction starts at the sling anchor, while the shot starts at the pulled position. Its continuous formula also differs from the integration used in play. | Prediction and flight share the same start position, velocity and discrete integrator. The predictor stops at the first ground encounter and does not forecast collisions or rebounds. |
| R06 | High | Physics advances once per rendered frame. Game speed and difficulty therefore depend on screen refresh rate. | A fixed 120 Hz simulation is driven by an accumulator. Long frames are capped at 0.1 seconds of catch-up; hidden pages pause. |
| R07 | High | Projectile mass is declared but never used. Blocks have no mass. Every impact transfers a fixed velocity fraction. Overlaps are not separated. | Material mass, inverse-mass penetration correction and normal/friction impulses govern impacts. Damage uses closing normal speed and the other body's mass. |
| R08 | High | Every overlapping projectile contact causes damage, including slow repeated contact. Powder ignites on any contact despite the specified speed threshold. | Impact damage requires closing speed above 85 px/s. Each pair has a 0.15-second damage cooldown. Ordinary support contact does not erode the castle. |
| R09 | High | Reset does not reset score. Replaying lets users retain points from previous attempts. The saved cumulative score is not a high-score record. | Attempt score resets. Successful attempts update a separate best score per level; lower replay scores cannot replace a best. |
| R10 | High | Saved JSON is neither shape-checked nor range-checked. `null`, a negative level or invalid values can break loading. Storage writes are unguarded and can interrupt the win flow. | Schema normalisation, bounded integers, finite scores, safe read/write failure handling and an in-memory fallback. Saving failure is visible. |
| R11 | High | Dragging has no pointer ownership, capture, cancellation or focus-loss handling. Reset does not clear dragging. | One captured pointer owns a drag. Cancel, lost capture, Escape, pause, reset and loss of visibility discard it without firing. |
| R12 | Medium | A shot leaving on the left has no explicit completion rule. There is no absolute shot timeout or castle-settling interval. | Both horizontal bounds, projectile rest, castle motion and a quiet interval are checked. A 12-second simulated timeout ensures control returns. |
| R13 | Medium | The claimed level selector and per-level unlocks do not exist. Only one saved level index is used. | A selector lists three levels and disables locked choices. Unlocks, selected level and per-level bests persist locally. |
| R14 | Medium | Many named Blocks are comments around shared state, rather than components with reusable interfaces. The inspector shows counters but does not establish architectural reuse. | Functional constructors and operations are exposed through `FeltSiegeCore`. The inspector lists components, responsibilities and live measurements. Reuse of an earlier Blocks library has not been established. |
| R15 | Medium | Rotation is nominal: `vAngle` starts at zero and is never given collision torque. Rendered angles would not match AABB contacts if rotation were enabled. | Rotational rigid-body physics is explicitly outside this edition's scope. Rectangular bodies retain their orientation. The specification no longer claims rotational drag or tipping. |
| R16 | Medium | Zoom is disabled, controls are small, the HUD shrinks with the canvas, there is no non-drag control path, and audio starts automatically on interaction. | Zoom remains enabled; controls sit outside the scaled canvas; aim sliders, keyboard controls, pause and mute are provided. Sound defaults off. |
| R17 | Low | Reset leaves old particles and floating text. The projectile trail is recorded but never drawn. Glass, wood and stone particles all use the same circular shape. | Reset clears effects. Unused trail storage is removed. Visual effects distinguish wood slivers, glass triangles, stone dust and blast smoke. |
| R18 | Low | The crown is a plain disc; the promised felt layers, bead texture and character release are not represented accurately by the description. | A crown silhouette, stitched material shapes, cached cloth fibres and layered scenery support the felt direction. The projectile is explicitly a felt boulder. |

## 2. Product definition

A small offline siege game with three handcrafted castles. The player has three felt boulders per attempt and wins by destroying the crown or knocking it from its perch. Timber, glass, stone and explosive barrels offer different ways to disrupt the structure.

The game demonstrates the three agreed Block categories: Functional Blocks, Visual Blocks and Section compositions. A single HTML delivery file does not require all implementation to share global state. The core owns simulation data; the UI consumes its public methods and events.

Delivery: `felt_castle_siege.html`, containing all styles, code, level data, drawing and optional sound synthesis. No network requests, dependencies, imported fonts, image downloads or build step are required for play.

Scope limit: this is an arcade translational physics system, not a general rigid-body engine. Blocks move horizontally and vertically but do not rotate. It does not model torque, angular inertia, hinged structures, fracture geometry or continuous collision detection. Adding realistic toppling later requires oriented collision shapes and angular contact resolution together.

The initial game uses authored layouts constructed from data. It does not claim to generate new castle designs procedurally.

## 3. Block contracts

### Functional Blocks

| Block | Inputs and public operations | Outputs and responsibility |
| --- | --- | --- |
| DragBlock | Optional configuration; `begin(id,x,y)`, `move(id,x,y)`, `end(id)`, `cancel()`, `aim(x,y)` | Owns one pointer and clamps pull distance. Returns a pull vector or null. No DOM dependency. |
| PhysicsIntegratorBlock | Body, time step and optional configuration; `integrate`, `ground` | Mutates position and velocity consistently. Uses gravity in px/s² and velocity in px/s. |
| CollisionBlock | Two bodies; `contact`, `resolve` | Finds circle-box or box-box contact, corrects overlap and applies mass-based impulse/friction. Returns closing speed for the damage policy. |
| TrajectoryPredictorBlock | Pull vector, simulation step count and optional configuration; `predict` | Returns free-flight sample points using the same integrator. Does not resolve collisions. |
| SessionStorageBlock | Storage adapter and level count; `load`, `save`, `complete` | Validates and persists progress. Reports availability and retains current-session progress when persistence fails. The name is retained for taxonomy continuity; persistence uses localStorage, not sessionStorage. |
| FixedStepClockBlock | Elapsed seconds and a step callback; `advance`, `reset` | Runs simulation at 120 Hz independently of drawing. Limits catch-up work after stalls. |

SiegeWorld is the game-specific coordinator. `reset(level)` creates an attempt; `launch(pull)` accepts a valid shot only from READY; `step(dt)` advances the simulation; `drain()` transfers queued events to the UI. It owns material damage, explosions, scoring and round transitions. These game rules are distinct from general collision operations.

Core components are available as `globalThis.FeltSiegeCore`. Runtime UI diagnostics expose a copied snapshot through `FeltSiege.snapshot()`. Tests load the core directly from the delivered HTML, so they check the delivered code rather than an independent copy.

### Visual Blocks

| Block | Responsibility |
| --- | --- |
| StitchedFeltRendererBlock | Cached fibre backdrop, layered cloth scenery, stitched rectangles, crown silhouette, sling, felt boulder, trajectory beads and optional hitboxes. Drawing does not mutate the simulation. |
| ParticleEffectsBlock | Bounded, time-based material fragments and explosion smoke. Clears on reset and suppresses fragments when reduced motion is requested. |
| AudioBlock | Optional synthesised tones after a user gesture. Sound defaults off; unavailable or suspended audio does not block the game. |

The Visual Blocks and Section compositions are implemented separately but remain tailored to this game. They are not advertised as installed, independently packaged library assets. Extracting and versioning them for other games is outside this change.

### Section compositions

| Section | Responsibility |
| --- | --- |
| CatapultLauncherSection | Converts canvas coordinates, captures pointer input, connects drag to launch, and handles keyboard aiming. |
| CastleBuilderSection | Converts each authored material layout into live bodies with IDs, mass, HP and velocity. |
| GameHUD | Score, ammunition, best score, level selector, save status, result dialog, focus handling and inspector telemetry. |

The inspector reports state, live body count, particle count, explosion count, shot duration, projectile position/velocity and saving availability. It also lists all twelve named components. Hitboxes appear on the canvas. The component list identifies responsibilities; it is not a per-function execution profiler.

## 4. Physics and materials

World coordinates are 1100 × 620 logical pixels. The ground is at y = 520. The sling anchor is (180, 400). The boulder radius is 18 and its mass is 5 game units.

Gravity is 650 px/s². Maximum pull is 110 pixels; velocity is the opposite pull vector multiplied by 9 per second. Pulls shorter than 12 pixels cancel. The launch starts at the pulled position. The keyboard/sliders use the same virtual pull and flight calculation.

Each 1/120-second step applies semi-implicit Euler integration, ground contact, then eight iterations of pairwise collision resolution. Resting contacts are nearly inelastic; harder impacts use 0.12 restitution. Coulomb-style friction is limited to 0.35 of the normal impulse. The ground applies separate horizontal damping. The boulder has a small ground bounce above a minimum vertical speed.

| Material | Mass | HP | Gameplay role |
| --- | ---: | ---: | --- |
| Glass | 1 | 24 | Light, fragile support or barrier. Breaks on a modest damaging impact, but does not break merely from resting contact. |
| Timber | 3 | 110 | Intermediate support. A direct fast boulder impact can remove it. |
| Stone | 11 | 240 | Heavy, resistant support. Transfers less velocity than timber under the same impulse. |
| Powder | 2 | 25 | Explodes when destroyed by impact or blast damage. |
| Crown | 1.5 | 30 | Primary objective, vulnerable to direct impact and displacement. |

Collision damage starts above 85 px/s closing normal speed. Per eligible contact, damage is (speed − 70) × 0.32 × min(other mass, 5). A body pair cannot cause impact damage more than once per 0.15 seconds. Static support contact and glancing tangential motion alone do not accumulate damage.

A barrel blast affects live castle bodies whose centres are within 150 pixels. Damage and impulse fall linearly with distance. Maximum nominal damage is 170; impulse includes upward lift and is reduced for heavier bodies. Blasts can destroy other barrels, which then propagate their own blasts. Destruction is idempotent. Blast damage passes through other bodies; cover and occlusion are not modelled. The boulder is not affected by blasts.

The small fixed step reduces the risk of tunnelling at the configured launch speeds. It is not a swept collision solver, and arbitrary custom velocities or much thinner imported bodies are outside the tested range.

## 5. Round rules and scoring

The state sequence is READY → FLYING → READY, WON or LOST. Pause is an independent UI flag that stops stepping. WON and LOST stop gameplay mutation; cosmetic fragments may finish animating.

1. Loading or resetting a level restores all bodies and three shots, clears effects and attempt score, cancels dragging and resets the clock. Bodies settle for one simulated second without damage, then the crown's baseline position is recorded.
2. A valid launch spends exactly one shot. Launches while flying, paused or finished are rejected.
3. A crown destroyed or displaced by at least 42 pixels from its baseline yields a win. The crown is scored once in either case.
4. Otherwise, the round waits until the boulder has left play or is slow on the ground and all live castle pieces are slow. After at least one second of flight and 0.65 seconds of quiet, the next shot becomes available or the attempt ends in loss.
5. At 12 simulated seconds after a launch, a non-winning shot is resolved even if motion continues. This intentionally bounds waiting time.
6. A win stops further collisions and scoring. A loss cannot subsequently turn into a win.

Destroyed ordinary pieces earn 200 points. The crown earns 1,000. A win adds 100 points per unused shot. Best scores update only on successful attempts. Resetting an attempt cannot retain or farm its points. Replaying never adds to a cumulative campaign total because there is no cumulative campaign total.

## 6. Levels and persistence

- **Wooden outpost**: two timber supports, a timber roof, glass barrier and crown.
- **Powder bastion**: stone supports, a timber roof, glass support and one barrel.
- **Grand fortress**: stone lower supports, an upper timber/glass structure and two barrels close enough to form an explosion chain.

The first level begins unlocked. Winning unlocks the next; completing the third leaves all three available. The selector cannot select locked levels through the UI. Progress is local convenience data, not a security or anti-cheat boundary.

Schema under `feltCastleProgress.v2`:

```json
{"version":2,"unlocked":0,"selected":0,"bests":[0,0,0],"muted":true}
```

Level indices are bounded integers. Selected level cannot exceed unlocked level. Scores are finite, non-negative integers capped at 100,000 per level. Invalid JSON falls back to defaults. Storage read/write errors leave the session usable and display a saving-unavailable message.

The original `feltCastleProgress` key is read only when the version 2 key is absent. Its valid level unlock is migrated and clamped. Its cumulative score is not converted into a per-level best because that would misrepresent its meaning. The original key is not deleted.

Progress is stored for the browser/origin that opens the game. Persistence when opening an HTML file directly is browser-dependent; no cross-device or cloud synchronisation is promised.

## 7. Controls, presentation and accessibility

- Drag the boulder backwards and release with a mouse, pen or touch pointer.
- Alternatively choose angle and power with labelled sliders and press Launch boulder.
- With the canvas focused: Up/Down changes angle; Left/Right changes power; Space fires; Escape cancels dragging; P pauses or resumes.
- Reset, pause/resume, sound and level selection are native buttons/select controls with visible focus outlines.
- Zoom is enabled. The page can scroll on small displays. Controls are outside the scaled canvas and target at least 44 CSS pixels in height.
- Status and score updates have text alternatives. Results use a native modal dialog and focus the main action. Closing the result allows inspection of the finished castle.
- Sound begins off. A user's toggle persists when possible. Hidden pages and window blur pause the game and cancel active dragging; returning does not automatically resume.
- Reduced-motion preference suppresses fragments. It does not remove the motion necessary to play the game.

These features improve accessibility but do not constitute a WCAG conformance claim. The canvas does not expose a detailed spatial castle description for non-visual play. Real screen-reader and touch testing remain outstanding.

## 8. Verification and acceptance status

### Passed: 26 core checks

| Area | Checks |
| --- | --- |
| Structural stability | All three layouts unchanged after 30 seconds idle. |
| Playability | All three levels win from a normal shot at 10° and 80% power. Level 3 produces two explosions. |
| Round handling | Three misses lose; win and loss freeze state; reset clears attempt state; only one active shot; invalid/tiny pulls spend no ammunition. |
| Prediction and timing | Prediction matches each sampled free-flight point; 30/60/144 Hz driving yields identical state; long-frame work is bounded. |
| Input core | Pull clamp, exclusive pointer ownership and cancellation. |
| Physics and objectives | Mass-dependent impulse; valid normal for an embedded circle; displaced-crown victory; each barrel detonates once. |
| Recovery | Left-boundary exit; 12-second shot timeout. |
| Persistence | Malformed values; denied storage; best-score and unlock persistence; safe legacy unlock migration. |

### Passed: eight simulated UI checks

Both scripts from the delivered HTML execute in a minimal DOM test harness. Canvas drawing operations are stubs. These checks establish wiring and event behaviour, not rendered appearance or browser conformance.

1. Startup, score display and locked options.
2. Button launch, win dialog, focus, next level and score reset.
3. Pause freezes the simulation and disables firing.
4. Pointer cancellation and second-pointer rejection.
5. Pointer release launches exactly once.
6. Visibility loss pauses and cancels a drag.
7. Saving failure does not interrupt the win dialog.
8. Keyboard aiming and inspector updates.

### Passed: seven browser checks (headless Chromium)

The Playwright suite ran in a sandboxed headless Chromium after installing the required shared libraries and fonts locally. Desktop and mobile screenshots are captured for inspection.

1. Desktop page loads and HUD renders.
2. Standard shot (10°, 80%) wins and the result dialog appears.
3. Result dialog interaction.
4. Inspector opens with the component list.
5. Pause toggles.
6. Mobile layout without horizontal overflow at 390 px.
7. Launch control meets a 44 CSS pixel touch target.

### Still to verify in real browsers and on devices

- Pointer capture, real touch cancellation, multi-touch and release outside the canvas.
- Keyboard focus behaviour and native modal-dialog handling in Safari/Firefox.
- Audio permission behaviour and sound quality.
- Safari/iOS, Android Chrome, Firefox and Chromium operation, including direct-file persistence.
- Play balance through repeated human play and performance on low-powered devices.

Release judgement: the supplied source faults have been addressed within the revised arcade scope, with core, simulated UI and headless-browser evidence. This is a testable build, not a fully device-verified release.

## 9. Files and reproduction

- `felt_castle_siege.html`: the complete game. Open in a modern browser.
- `felt_castle_siege_review_and_spec.md`: this review and specification.
- `core_tests.cjs`: dependency-free Node tests against the HTML's embedded core.
- `ui_tests.cjs`: dependency-free simulated UI integration tests against both embedded scripts.
- `browser_tests.cjs`: Playwright checks. Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`, then run `node browser_tests.cjs`. It writes local desktop and mobile screenshots for inspection.

Run the verified suites from the extracted project directory:

```bash
node core_tests.cjs
node ui_tests.cjs
```

All three test suites read the delivered HTML. Update them when the intended game rules change, and retain the distinction between core tests, simulated UI tests and browser/device acceptance.

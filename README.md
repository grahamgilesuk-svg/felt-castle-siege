# Felt Castle Siege — Blocks Edition (v2.0)

A small offline siege game in a single HTML file. Pull back the felt boulder, let go, and bring down the crown.

## Play

Open `felt_castle_siege.html` in a modern browser. No network, dependencies, fonts, images or build step are required.

- **Drag** the boulder backwards and release (mouse, pen or touch), or
- use the **angle and power sliders** and press **Launch boulder**, or
- focus the canvas: **arrow keys** aim and set power, **Space** launches, **P** pauses, **Escape** cancels a drag.

Three boulders per attempt. Win by destroying the crown or knocking it 42 px from its perch. Timber, glass, stone and explosive barrels each behave differently. Winning unlocks the next level; best scores are kept per level.

## Physics scope

Arcade translational physics only: blocks slide and fall; they do not rotate. No torque, angular inertia, hinged structures, fracture geometry or continuous collision detection. Rotation is explicitly out of scope for this edition.

## Files

| File | Purpose |
| --- | --- |
| `felt_castle_siege.html` | The complete game (styles, code, levels, drawing, optional sound synthesis). |
| `felt_castle_siege_review_and_spec.md` | Review of the previous version (18 findings) and the v2.0 specification. |
| `core_tests.cjs` | 26 dependency-free Node checks against the HTML's embedded core. |
| `ui_tests.cjs` | 8 simulated UI integration checks in a minimal DOM harness. |
| `browser_tests.cjs` | Playwright checks for an environment that can launch Chromium. |
| `screenshot-*.png` | Browser-suite captures (desktop, desktop win dialog, mobile). |

## Verification

```bash
node core_tests.cjs
node ui_tests.cjs
```

Both suites read the delivered HTML directly, so they test the shipped code.

The browser suite needs Playwright and a Chromium executable:

```bash
CHROMIUM_PATH=/path/to/chromium node browser_tests.cjs
```

It writes local desktop and mobile screenshots. A passing script does not replace visual inspection or physical-device testing; real touch behaviour, screen readers, Safari/iOS and low-powered devices remain unverified.

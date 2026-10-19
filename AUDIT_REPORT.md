# Abduction: Midnight Harvest — technical audit

Audit date: 19 October 2026 (Asia/Kolkata). Corrected local release: 1.0.1.

## Result and scope

The existing game was inspected before source modifications: all modules, styles, HTML, configuration, documentation, tests, packager, ignored release HTML and source ZIP were inventoried. The release archive matched its then-current sources. A 19-file snapshot plus SHA-256 manifest was retained at `/private/tmp/abduction-audit-baseline-20261019` before edits. Git had no committed application baseline: all game sources were untracked. The audit did not reset Git, delete user data, run database operations, add dependencies, or publish/upload the project.

The baseline had **35 passing tests**, despite a broken standalone build and collision defects. The corrected project has **65 passing automated tests**. This report distinguishes executable tests, real browser checks, controlled fault injection, and unverified hardware behavior. It does not claim every possible bug is eliminated.

## Architecture and applicable systems

- Vanilla JavaScript ES modules, HTML/CSS, custom Canvas 2D drawing, and custom 60Hz fixed-step simulation. Node v24.9.0 and Python 3.13.5 were used on macOS 27.0.1 arm64. Build tooling supports Node 18 or newer; no package installation is needed.
- Flat 2400x720 world, ground at y610; centered AABB colliders. The corrected shared slab sweep resolves player, lifted and airborne movement, projectile ordering, world bounds, and overlap recovery. Scripted aircraft and transport entry/exit intentionally cross map boundaries. UFO flight and tractor suspension remain intentional.
- Rule/timer character state machines, local perception and line of sight, finite population, shelter entrance reachability, and a shared encounter director. Navigation is one-dimensional ground movement; there is no navmesh or asynchronous path service.
- Original procedural artwork, animation, particles and lighting gradients. No meshes, skeletons, retargeting, texture streams, materials/shaders, depth buffer, 3D clipping planes, LOD or asset bundles exist. Their listed 3D failure cases are not applicable.
- Web Audio oscillators and gain nodes, now with owned transient voices, disposal, bounded concurrency and reported device/resume errors. No streamed clips or spatial audio system exists.
- Version 1 localStorage saves with last-good backup, upgrade levels, mission records and preferences. Existing integer saves remain compatible. Fractional multipliers are retained and unsupported future saves are protected from writes.
- Single-player and local only. No authoritative gameplay server, replication, prediction, reconciliation, sockets or multiplayer was added. Network-loss multiplayer tests are not applicable.

## Verification and evidence

`audit/baseline-tests.txt` records the original 35-test baseline. `audit/test-results.txt` records the final test run. `audit/bugs.json` contains the structured tracker with every issue's reproduction, expected/actual behavior, root cause, affected files, correction, test coverage, status and limitations.

Automated coverage includes the full fresh campaign, legal earned upgrades, mission unlocks, multiple boss encounter seeds, corrupted/blocked/future-version storage, payouts, beam capacity, lifting interruptions, releases, roof support/destruction, side walls, ceilings/world bounds, thin walls, corners, overlapping geometry, a narrow corridor, high-speed shots/cargo/aircraft, ordered impacts, shelter behavior, blocked agent intent, finite population, attack overlap, homing limits, input ownership, modal keyboard routing, pause clocks, fallback initialization, audio lifecycle/faults, renderer finite geometry, and the actual embedded script and CSS.

Ten seeded 30-second gameplay stress runs validate geometry and finite state with maximum flight/beam upgrades. Stress projectiles/cargo/aircraft also use velocities above shipped balancing values to exercise continuous collision. These stress fixtures are not claims that such speeds occur in ordinary missions. There are no authored slopes, stairs or moving platforms to test; their behavior was not invented or added.

### Real browser checks

The corrected **standalone HTML itself**, not just the development modules, was served from a loopback-only release server and exercised in the Codex in-app browser. An isolated test origin kept these tests separate from the user's earlier localhost save.

- Captured two specimens using Space, moved with W, survived mission 1, received 1,300 credits, unlocked mission 2, bought the 500-credit ion drive, reloaded, and confirmed 800 credits plus retained completion and purchase.
- Opened mission 2, paused, opened settings, Shift-Tabbed from the first field to the last button, pressed Escape back to pause, restarted through confirmation, and paused again. No warning/error console entries were returned in the inspected session.
- Inspected layouts at 320x640, 768x1024, 1280x800 and 1920x1080. Phone mission launch and shop navigation remained reachable. Document scroll width matched viewport width in the measured 320, 768 and 1920 layouts. Desktop/tablet/phone screenshot evidence is in `audit/screenshots/`.
- Browser opt-in frame diagnostics (`?audit=1`) measured an active opening-mission window at CPU p50 **0.9ms**, p95 **1.3ms**, frame interval p50 **16.7ms**, p95 **18.3ms**. These are a bounded 240-frame window in this browser, not device-wide GPU or universal frame-rate measurements. Instrumentation is inactive on the ordinary play path and sends no telemetry.

### CPU and memory profile

Run `npm run profile`. It warms five missions, then measures 30 deterministic mission sessions and records post-GC heap after each ten-run batch. The profiler retains a fixed-size histogram rather than every timing sample. Profile JSON files are included in `audit/`.

| Measurement | Original baseline | Initial collision fix | Final optimized correction |
|---|---:|---:|---:|
| Simulation steps | 161,698 | 159,199 | 159,199 |
| Step p50 | 0.015ms | 0.037ms | 0.019ms |
| Step p95 | 0.028ms | 0.108ms | 0.035ms |
| Step p99 | 0.056ms | 0.271ms | 0.078ms |
| Heap after warmup | 4,449,352 B | 4,683,488 B | 4,653,152 B |
| Heap after final batch | 4,483,280 B | 4,743,064 B | 4,718,136 B |

Final corrected post-GC heap samples: 4,653,152 → 4,738,416 → 4,746,128 → 4,718,136 bytes. This does not show continuing growth over the measured batches. It is a Node simulation profile, not a browser/GPU/audio-memory profile. Scenario lengths differ slightly after physics/AI fixes because outcomes change; the same input policy and seed schedule were used. The final correction preserves collision work at a modest increase over the less-correct baseline. CPU sampling identified collision temporary allocations and shape copies; the optimized correction reduced its initial p95 step cost by roughly two thirds. Particle, entity, projectile, text, event and audio collections remain bounded in the tested scenarios. A general object-pooling rewrite was not justified by these measurements.

## Prioritized defect tracker

31 recorded issues: 26 Verified fixed and 5 Fixed, partially verified. Statuses use the requested terminology.

| Bug ID | Severity | Issue | Final status |
|---|---|---|---|
| BUILD-001 | Critical | Standalone HTML cannot start | Verified fixed |
| BUILD-002 | High | Standalone theme is corrupted | Verified fixed |
| PHYS-001 | High | Side contact teleports the UFO onto a roof | Verified fixed |
| PHYS-002 | High | Airborne cargo crosses building sides | Verified fixed |
| PHYS-003 | High | Released people pass through roofs | Verified fixed |
| PHYS-004 | High | Suspended cargo penetrates floor and stage edges | Verified fixed |
| PHYS-005 | Medium | Distant cover shields a nearer UFO | Verified fixed |
| PHYS-006 | Medium | Shots miss hits when a step ends outside the map | Verified fixed |
| PHYS-007 | Medium | Fast dropped cargo tunnels through a defender | Verified fixed |
| PHYS-008 | High | A boss-stage defender spawns embedded in a building | Verified fixed |
| PHYS-009 | High | Lifted objects cut through solid scenery | Verified fixed |
| AI-001 | High | A shelter target disables unrelated wall collisions | Verified fixed |
| AI-002 | High | Transports drive through solid buildings | Verified fixed |
| AI-003 | Medium | Doorway shelter needs protection and occupant feedback | Verified fixed |
| AI-004 | Medium | Agents repeat a blocked last-sighting move | Verified fixed |
| SAVE-001 | High | Older code overwrites future-version progress | Verified fixed |
| SAVE-002 | Medium | Half-step multipliers lose rewards and records | Verified fixed |
| AUDIO-001 | Medium | Burst effects lack a voice cap and explicit graph cleanup | Verified fixed |
| AUDIO-002 | Medium | Victory notes outlive the scene that scheduled them | Verified fixed |
| AUDIO-003 | Medium | Rejected browser audio resume becomes unhandled | Verified fixed |
| AUDIO-004 | Medium | Beam source creation failure can terminate a frame | Fixed, partially verified |
| UI-001 | Medium | Escape fails in a settings select and nested menus resume unexpectedly | Verified fixed |
| UI-002 | Medium | Modal focus can escape to unrelated page controls | Verified fixed |
| UI-003 | Medium | Right click activates the beam and unrelated releases interrupt it | Fixed, partially verified |
| UI-004 | Medium | A held joystick finger can resume stale movement | Fixed, partially verified |
| UI-005 | Medium | Display backing size, camera and pointer coordinates can diverge | Fixed, partially verified |
| UI-006 | Low | Actors keep animating while gameplay is paused | Verified fixed |
| UI-007 | Medium | Phone title actions are clipped and header credits wrap | Verified fixed |
| CRASH-001 | Medium | Missing Canvas or an unexpected render exception leaves no recovery UI | Fixed, partially verified |
| CRASH-002 | Medium | Missing ResizeObserver prevents startup | Verified fixed |
| PERF-001 | Low | Initial collision correction allocates excessively in hot paths | Verified fixed |

### BUILD-001 — Standalone HTML cannot start

- **Category:** Build
- **Severity:** Critical
- **Gameplay impact:** Standalone HTML cannot start
- **Reproduction:** Extract the shipped HTML script and parse it with vm.Script.
- **Expected:** The delivered file contains executable game code.
- **Actual before correction:** Invalid or unexpected token; cargo messages contain inserted HTML.
- **Root cause / evidence:** String.replace interprets dollar-sign substitution tokens inside the replacement source.
- **Affected files:** scripts/package.mjs, release/Abduction-Midnight-Harvest.html
- **Correction:** Use literal replacement callbacks and validate the script extracted from the final HTML.
- **Regression checks:** package.test.mjs, Actual standalone browser launch, mission win, purchase and reload
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### BUILD-002 — Standalone theme is corrupted

- **Category:** Build / graphics
- **Severity:** High
- **Gameplay impact:** Standalone theme is corrupted
- **Reproduction:** Launch the embedded edition after stripping the Google Fonts import.
- **Expected:** The root theme variables and local fallback fonts survive packaging.
- **Actual before correction:** White page, dark text on dark scenery, missing button colors.
- **Root cause / evidence:** The import-removal regex stops at a semicolon inside the font URL and leaves invalid text before :root.
- **Affected files:** scripts/package.mjs
- **Correction:** Remove the complete import line and test the embedded CSS prefix.
- **Regression checks:** package.test.mjs BUILD-002 assertion, Browser screenshots at 320, 768 and 1920 pixels
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### PHYS-001 — Side contact teleports the UFO onto a roof

- **Category:** Physics / player
- **Severity:** High
- **Gameplay impact:** Side contact teleports the UFO onto a roof
- **Reproduction:** Fly right from x743,y530 toward the first barn.
- **Expected:** Stop at the side and retain altitude.
- **Actual before correction:** Y changes instantly from 530 to 469.
- **Root cause / evidence:** Every horizontal building overlap is resolved as a roof collision.
- **Affected files:** dist/sim.js, dist/collision.js
- **Correction:** Resolve the earliest swept AABB contact and slide along its normal.
- **Regression checks:** audit-physics.test.mjs PHYS-001
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### PHYS-002 — Airborne cargo crosses building sides

- **Category:** Physics / cargo
- **Severity:** High
- **Gameplay impact:** Airborne cargo crosses building sides
- **Reproduction:** Launch a rock horizontally toward a building at 600, 12000 and 60000 units/second.
- **Expected:** Solid walls stop or deflect cargo.
- **Actual before correction:** The rock crosses the wall because only roof crossings are handled.
- **Root cause / evidence:** Airborne integration has no side/underside collision resolution.
- **Affected files:** dist/sim.js, dist/collision.js
- **Correction:** Sweep every airborne body against solids and world boundaries; resolve contact velocities.
- **Regression checks:** audit-physics.test.mjs PHYS-002, Thin-wall and seeded invariant tests
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### PHYS-003 — Released people pass through roofs

- **Category:** Physics / characters
- **Severity:** High
- **Gameplay impact:** Released people pass through roofs
- **Reproduction:** Drop a defender above a building, then destroy its support.
- **Expected:** Land and recover on the roof; fall after support is removed.
- **Actual before correction:** The defender reaches ground inside the building.
- **Root cause / evidence:** Building contact handling exists only for carried cargo.
- **Affected files:** dist/sim.js, dist/collision.js
- **Correction:** Share airborne contact handling across characters and cargo; validate support before grounded/stunned behavior.
- **Regression checks:** audit-physics.test.mjs PHYS-003
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### PHYS-004 — Suspended cargo penetrates floor and stage edges

- **Category:** Physics / beam
- **Severity:** High
- **Gameplay impact:** Suspended cargo penetrates floor and stage edges
- **Reproduction:** Hold a rock while hovering at y540 near the left boundary.
- **Expected:** The rock remains above ground and within the stage.
- **Actual before correction:** The rock bottom reaches y649 below the y610 floor.
- **Root cause / evidence:** Beam followers directly update positions without geometry or bounds.
- **Affected files:** dist/sim.js, dist/collision.js
- **Correction:** Move lifted bodies through the same bounded collision solver and report blocked cargo.
- **Regression checks:** audit-physics.test.mjs PHYS-004
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### PHYS-005 — Distant cover shields a nearer UFO

- **Category:** Physics / projectiles
- **Severity:** Medium
- **Gameplay impact:** Distant cover shields a nearer UFO
- **Reproduction:** Fire a stress-speed shot through a UFO with a building farther along the same segment.
- **Expected:** The nearer UFO is hit first.
- **Actual before correction:** The building consumes the shot before the UFO is considered.
- **Root cause / evidence:** Collision loops are ordered by object category rather than time of impact.
- **Affected files:** dist/sim.js, dist/collision.js
- **Correction:** Select the earliest hit among buildings, cargo and the moving ship.
- **Regression checks:** audit-physics.test.mjs PHYS-005
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### PHYS-006 — Shots miss hits when a step ends outside the map

- **Category:** Physics / projectiles
- **Severity:** Medium
- **Gameplay impact:** Shots miss hits when a step ends outside the map
- **Reproduction:** A fast shot crosses the UFO and finishes beyond the stage in one step.
- **Expected:** Resolve the crossing before removing the projectile.
- **Actual before correction:** No damage is dealt.
- **Root cause / evidence:** Out-of-bounds cleanup runs before swept collision checks.
- **Affected files:** dist/sim.js
- **Correction:** Resolve the valid lifetime segment, then expire or remove the projectile.
- **Regression checks:** audit-physics.test.mjs PHYS-006
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### PHYS-007 — Fast dropped cargo tunnels through a defender

- **Category:** Physics / impacts
- **Severity:** Medium
- **Gameplay impact:** Fast dropped cargo tunnels through a defender
- **Reproduction:** Drop a stress-speed rock through a defender in one step.
- **Expected:** A cargo impact defeats the defender once.
- **Actual before correction:** The defender survives because endpoint boxes no longer overlap.
- **Root cause / evidence:** Cargo damage uses only discrete final positions.
- **Affected files:** dist/sim.js, dist/collision.js
- **Correction:** Sweep the actual cargo shape over its traveled path before applying impact damage.
- **Regression checks:** audit-physics.test.mjs PHYS-007, Original cargo challenge regression
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### PHYS-008 — A boss-stage defender spawns embedded in a building

- **Category:** Spawning / AI
- **Severity:** High
- **Gameplay impact:** A boss-stage defender spawns embedded in a building
- **Reproduction:** Create mission 5 with seed 1234, or iterate the first ten seeds.
- **Expected:** Non-sheltered actors spawn outside solid rectangles.
- **Actual before correction:** A thrower at approximately x1293.93 overlaps the x1280 building.
- **Root cause / evidence:** Spawn placement does not validate collider extents.
- **Affected files:** dist/sim.js, dist/collision.js
- **Correction:** Choose the nearest free horizontal spawn position; share depenetration for stale overlaps.
- **Regression checks:** audit-physics.test.mjs PHYS-008, Overlapping-geometry recovery fixture
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### PHYS-009 — Lifted objects cut through solid scenery

- **Category:** Physics / beam
- **Severity:** High
- **Gameplay impact:** Lifted objects cut through solid scenery
- **Reproduction:** Hold a rock left of a building while the ship is on its right.
- **Expected:** Cargo remains on the near side or slides around the geometry.
- **Actual before correction:** The rock moves through the building.
- **Root cause / evidence:** Lifted movement bypasses collision entirely.
- **Affected files:** dist/sim.js, dist/collision.js
- **Correction:** Apply continuous collision to beam following without disabling the beam or solids.
- **Regression checks:** audit-physics.test.mjs PHYS-009
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### AI-001 — A shelter target disables unrelated wall collisions

- **Category:** Navigation
- **Severity:** High
- **Gameplay impact:** A shelter target disables unrelated wall collisions
- **Reproduction:** Assign a civilian a shelter beyond an intervening building.
- **Expected:** Reject the unreachable route and retain collision.
- **Actual before correction:** The civilian walks through the intervening building.
- **Root cause / evidence:** A truthy shelterId bypasses all building checks.
- **Affected files:** dist/sim.js
- **Correction:** Validate a reachable entrance; enter shelter as an explicit protected state at the doorway.
- **Regression checks:** audit-physics.test.mjs AI-001
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### AI-002 — Transports drive through solid buildings

- **Category:** Vehicles / navigation
- **Severity:** High
- **Gameplay impact:** Transports drive through solid buildings
- **Reproduction:** Drive a delivery truck toward a blocked drop-off.
- **Expected:** Stop before the obstruction, unload safely, and return by a valid direction.
- **Actual before correction:** The truck crosses the building.
- **Root cause / evidence:** Scripted truck positions are integrated without collision.
- **Affected files:** dist/sim.js, dist/collision.js
- **Correction:** Sweep the route, stop and unload at a blockage, and reverse departure direction when necessary.
- **Regression checks:** audit-physics.test.mjs AI-002, Population-conservation regression
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### AI-003 — Doorway shelter needs protection and occupant feedback

- **Category:** Shelter integration / presentation
- **Severity:** Medium
- **Gameplay impact:** Doorway shelter needs protection and occupant feedback
- **Reproduction:** Enter shelter at its new safe doorway position and activate the beam above it.
- **Expected:** Sheltered occupants are protected and counted until exit or destruction.
- **Actual before correction:** Without an explicit exclusion, the doorway occupant remains beam eligible; the renderer has no occupancy data.
- **Root cause / evidence:** Shelter protection previously depended on physical overlap with the building.
- **Affected files:** dist/sim.js, dist/render.js
- **Correction:** Exclude sheltered targets from capture/impact decisions, count occupancy, hide the sheltered actor, and restore behavior on exit.
- **Regression checks:** audit-physics.test.mjs AI-003, Renderer contract test
- **Final status:** Verified fixed
- **Limits:** This defect was found during integration of the collision-safe shelter correction.

### AI-004 — Agents repeat a blocked last-sighting move

- **Category:** Navigation / state recovery
- **Severity:** Medium
- **Gameplay impact:** Agents repeat a blocked last-sighting move
- **Reproduction:** Give an agent a remembered target beyond a wall after sight is lost.
- **Expected:** Abandon the blocked intent briefly and make progress away from the wall.
- **Actual before correction:** Cached target steering repeatedly overrides the collision reversal.
- **Root cause / evidence:** There is no failed-route cooldown or memory invalidation on contact.
- **Affected files:** dist/sim.js
- **Correction:** Clear blocked target memory and apply a bounded navigation cooldown before reconsidering it.
- **Regression checks:** audit-physics.test.mjs AI-004
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### SAVE-001 — Older code overwrites future-version progress

- **Category:** Persistence
- **Severity:** High
- **Gameplay impact:** Older code overwrites future-version progress
- **Reproduction:** Store version 2 with a version 1 backup, load, then change a preference.
- **Expected:** Retain the newer record and report that the old client cannot save it.
- **Actual before correction:** persistSave returns true and replaces the newer schema.
- **Root cause / evidence:** Version rejection is implemented only in the loader.
- **Affected files:** dist/progression.js
- **Correction:** Refuse writes over unsupported primary schemas and preserve unsupported backup records.
- **Regression checks:** progression.test.mjs SAVE-001
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### SAVE-002 — Half-step multipliers lose rewards and records

- **Category:** Scoring / persistence
- **Severity:** Medium
- **Gameplay impact:** Half-step multipliers lose rewards and records
- **Reproduction:** Complete a run with maxCombo 1.5, save and reload.
- **Expected:** Keep 1.5 and award a 75-credit performance bonus.
- **Actual before correction:** The record becomes 1 and the bonus is 50.
- **Root cause / evidence:** A general integer normalizer is used for fractional multipliers.
- **Affected files:** dist/progression.js
- **Correction:** Validate half-step multipliers separately while retaining existing integer saves.
- **Regression checks:** progression.test.mjs SAVE-002
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### AUDIO-001 — Burst effects lack a voice cap and explicit graph cleanup

- **Category:** Audio / resources
- **Severity:** Medium
- **Gameplay impact:** Burst effects lack a voice cap and explicit graph cleanup
- **Reproduction:** Trigger 100 effects at the audio boundary and finish the sources.
- **Expected:** Bound simultaneous voices and release oscillator/gain connections.
- **Actual before correction:** 100 oscillators are created with no ended cleanup callbacks.
- **Root cause / evidence:** Every effect constructs nodes without a cap or disconnect lifecycle.
- **Affected files:** dist/audio.js
- **Correction:** Cap effects at 16 voices, disconnect ended nodes, and provide explicit disposal.
- **Regression checks:** audio.test.mjs AUDIO-001, 30-mission heap profile
- **Final status:** Verified fixed
- **Limits:** The 100-event burst is a stress fixture. No browser audio-heap leak or speaker clipping measurement is claimed.

### AUDIO-002 — Victory notes outlive the scene that scheduled them

- **Category:** Audio / scenes
- **Severity:** Medium
- **Gameplay impact:** Victory notes outlive the scene that scheduled them
- **Reproduction:** Schedule victory audio, mute and re-enable immediately, then run pending callbacks.
- **Expected:** Old scene notes are canceled.
- **Actual before correction:** All four delayed notes still play.
- **Root cause / evidence:** JavaScript timers are not owned or canceled by scene transitions.
- **Affected files:** dist/audio.js, dist/app.js
- **Correction:** Schedule notes on the audio clock and cancel all transient voices at scene, pause and mute boundaries.
- **Regression checks:** audio.test.mjs AUDIO-002, Browser pause/restart flow
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### AUDIO-003 — Rejected browser audio resume becomes unhandled

- **Category:** Audio / errors
- **Severity:** Medium
- **Gameplay impact:** Rejected browser audio resume becomes unhandled
- **Reproduction:** Make AudioContext.resume reject.
- **Expected:** Report the failure once and continue gameplay.
- **Actual before correction:** The resume rejection is unhandled.
- **Root cause / evidence:** A synchronous try/catch cannot catch a rejected resume promise.
- **Affected files:** dist/audio.js
- **Correction:** Handle resume/close promise rejection and report unavailable audio.
- **Regression checks:** audio.test.mjs AUDIO-003
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### AUDIO-004 — Beam source creation failure can terminate a frame

- **Category:** Audio / device failure
- **Severity:** Medium
- **Gameplay impact:** Beam source creation failure can terminate a frame
- **Reproduction:** Make oscillator creation throw after context initialization.
- **Expected:** Optional audio failure is reported without stopping the game.
- **Actual before correction:** The beam path throws to the main frame loop.
- **Root cause / evidence:** Unlike tone creation, beam graph construction has no error boundary.
- **Affected files:** dist/audio.js
- **Correction:** Catch and report beam graph failure, release partial state, and preserve gameplay.
- **Regression checks:** audio.test.mjs AUDIO-004
- **Final status:** Fixed, partially verified
- **Limits:** Fault injection passes; physically disconnecting an output device was not tested.

### UI-001 — Escape fails in a settings select and nested menus resume unexpectedly

- **Category:** UI / keyboard
- **Severity:** Medium
- **Gameplay impact:** Escape fails in a settings select and nested menus resume unexpectedly
- **Reproduction:** Open settings, focus the difficulty select, and press Escape; repeat from pause.
- **Expected:** Escape closes the dialog and nested settings return to pause.
- **Actual before correction:** The early input-element return ignores Escape; closing nested settings resumes play.
- **Root cause / evidence:** Keyboard routing checks form targets before modal commands and has no modal parent.
- **Affected files:** dist/app.js
- **Correction:** Route modal commands first, track the pause parent, and restore game focus on resume.
- **Regression checks:** client.test.mjs UI-001, Actual browser select/Escape and nested pause/settings
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### UI-002 — Modal focus can escape to unrelated page controls

- **Category:** UI / focus
- **Severity:** Medium
- **Gameplay impact:** Modal focus can escape to unrelated page controls
- **Reproduction:** Open settings and Shift-Tab from its first control.
- **Expected:** Focus wraps inside the dialog.
- **Actual before correction:** Focus reaches controls outside the dialog.
- **Root cause / evidence:** Only part of the interface is inert and there is no keyboard focus trap.
- **Affected files:** dist/app.js
- **Correction:** Isolate all background sections, wrap Tab focus, and restore a valid focus target.
- **Regression checks:** client.test.mjs UI-002, Actual browser Shift-Tab wraps to All set
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### UI-003 — Right click activates the beam and unrelated releases interrupt it

- **Category:** Input routing
- **Severity:** Medium
- **Gameplay impact:** Right click activates the beam and unrelated releases interrupt it
- **Reproduction:** Right-click the canvas, or release another finger while a mouse beam is held.
- **Expected:** Only the owning primary pointer controls that beam.
- **Actual before correction:** Right-click starts it; any pointer release stops it.
- **Root cause / evidence:** Pointer state has no button filter, ownership, or lost-capture handling.
- **Affected files:** dist/app.js
- **Correction:** Track each input owner, filter primary clicks, and handle cancel/lost capture.
- **Regression checks:** client.test.mjs UI-003
- **Final status:** Fixed, partially verified
- **Limits:** Mouse/keyboard browser checks and synthetic pointer regression pass; physical multi-touch hardware was not available.

### UI-004 — A held joystick finger can resume stale movement

- **Category:** Touch / pause
- **Severity:** Medium
- **Gameplay impact:** A held joystick finger can resume stale movement
- **Reproduction:** Hold the stick, pause/resume, and move the old pointer without a new press.
- **Expected:** Reset ownership and require a new press.
- **Actual before correction:** The old pointer changes movement after resume.
- **Root cause / evidence:** Reset clears axes but leaves the captured pointer ID valid.
- **Affected files:** dist/app.js
- **Correction:** Clear IDs, release owned capture, and ignore stale/secondary pointers.
- **Regression checks:** client.test.mjs UI-004
- **Final status:** Fixed, partially verified
- **Limits:** Synthetic multi-pointer lifecycle passes; physical touch hardware was not tested.

### UI-005 — Display backing size, camera and pointer coordinates can diverge

- **Category:** Graphics / input scaling
- **Severity:** Medium
- **Gameplay impact:** Display backing size, camera and pointer coordinates can diverge
- **Reproduction:** Resize to an extreme aspect ratio or a high-DPI viewport.
- **Expected:** Use bounded logical world dimensions, a clear backing buffer, and drawable-area hit testing.
- **Actual before correction:** An ultrawide fixture allocates width 7200 and the camera uses different limits; backing resolution ignores display scale.
- **Root cause / evidence:** Canvas backing pixels are used as world coordinates and are derived from the unconstrained window ratio.
- **Affected files:** dist/app.js, dist/styles.css
- **Correction:** Separate logical viewport, CSS drawable area and bounded backing resolution; map pointers through the actual canvas rectangle.
- **Regression checks:** client.test.mjs UI-005, Browser 320/768/1280/1920 layouts
- **Final status:** Fixed, partially verified
- **Limits:** Actual native fullscreen transition and physical high-DPI hardware were not confirmed in the in-app browser.

### UI-006 — Actors keep animating while gameplay is paused

- **Category:** Animation / pause
- **Severity:** Low
- **Gameplay impact:** Actors keep animating while gameplay is paused
- **Reproduction:** Pause after a moving character or effect is visible.
- **Expected:** Gameplay animation pauses with simulation time.
- **Actual before correction:** The renderer continues using the wall clock.
- **Root cause / evidence:** Rendering uses requestAnimationFrame timestamp rather than simulation time.
- **Affected files:** dist/app.js
- **Correction:** Render active gameplay from game.time; retain ambient menu timing.
- **Regression checks:** client.test.mjs UI-006, Actual browser pause flow
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### UI-007 — Phone title actions are clipped and header credits wrap

- **Category:** Responsive layout
- **Severity:** Medium
- **Gameplay impact:** Phone title actions are clipped and header credits wrap
- **Reproduction:** Use the title at 320x640.
- **Expected:** The main action is visible and credits remain readable.
- **Actual before correction:** The short game panel clips the action and squeezes the balance onto two lines.
- **Root cause / evidence:** The phone canvas aspect ratio is too short for title content, and header content can shrink/wrap.
- **Affected files:** dist/styles.css
- **Correction:** Give narrow phones a taller game frame, allow scrollable menus, contain balance text, and improve HUD labels.
- **Regression checks:** Browser screenshots/phone.png, 320-pixel mission launch and shop navigation
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### CRASH-001 — Missing Canvas or an unexpected render exception leaves no recovery UI

- **Category:** Startup / runtime recovery
- **Severity:** Medium
- **Gameplay impact:** Missing Canvas or an unexpected render exception leaves no recovery UI
- **Reproduction:** Return null from getContext, or throw during a frame.
- **Expected:** Display a recovery action, preserve banked data, and retain the diagnostic.
- **Actual before correction:** A blank or frozen game is left without recovery guidance.
- **Root cause / evidence:** No explicit startup capability check or frame error boundary exists.
- **Affected files:** dist/app.js, dist/index.html
- **Correction:** Report the original cause, stop the failed loop, and show a reload action without resetting progress.
- **Regression checks:** client.test.mjs CRASH-001
- **Final status:** Fixed, partially verified
- **Limits:** Missing Canvas is fault-injected; actual GPU/context-loss and device recovery were not forced.

### CRASH-002 — Missing ResizeObserver prevents startup

- **Category:** Platform initialization
- **Severity:** Medium
- **Gameplay impact:** Missing ResizeObserver prevents startup
- **Reproduction:** Launch in a runtime without ResizeObserver.
- **Expected:** Start with a resize-event fallback.
- **Actual before correction:** ReferenceError occurs during initialization.
- **Root cause / evidence:** ResizeObserver is constructed unconditionally.
- **Affected files:** dist/app.js
- **Correction:** Feature-detect the observer and retain window resize handling.
- **Regression checks:** client.test.mjs UI-006 without observer
- **Final status:** Verified fixed
- **Limits:** Verification is limited to the scenarios and environment described below.

### PERF-001 — Initial collision correction allocates excessively in hot paths

- **Category:** Performance
- **Severity:** Low
- **Gameplay impact:** Initial collision correction allocates excessively in hot paths
- **Reproduction:** Profile 30 seeded missions after the first collision correction.
- **Expected:** Retain collision correctness with bounded per-step allocation.
- **Actual before correction:** Initial corrected p95 step time is 0.108ms versus a 0.028ms baseline.
- **Root cause / evidence:** CPU samples point to movement, segment queries, object spreads and garbage collection.
- **Affected files:** dist/collision.js, dist/sim.js
- **Correction:** Use scalar slab math, avoid temporary axis arrays/shape spreads, and iterate a stable entity-count snapshot without copying the array.
- **Regression checks:** scripts/profile.mjs, Full physics and campaign regressions
- **Final status:** Verified fixed
- **Limits:** Final p95 is 0.035ms on this machine; the corrected solver still does more work than the less-correct baseline. No universal FPS or GPU claim is made.

## Remaining verification limits and unresolved items

No known critical startup, collision, scoring or save-corruption defect remains unresolved in the tested configurations. The following checks remain incomplete and must not be represented as verified:

| Item | Status | Evidence / next check |
|---|---|---|
| Direct `file://` opening | Not tested | Browser URL policy rejected file-scheme navigation. No alternative browser surface or policy bypass was used. The identical self-contained file passed local HTTP gameplay; open it directly in a normal browser to verify that environment's file-origin save behavior. |
| Native fullscreen transition | Not tested | The in-app browser did not expose a confirmed fullscreen element after its button was invoked. Logical scaling and pointer mapping passed unit tests and viewport changes; confirm native entry/exit in an external browser. |
| Physical multi-touch and high-DPI devices | Not tested | Ownership, cancellation, stale pointer and backing-coordinate tests pass; responsive widths were browser-tested. Device hardware was unavailable. |
| Speaker quality / device switching | Not tested | Audio scheduling, cleanup, bounded voices, rejected resume and device-error paths pass boundary tests. Subjective listening and unplug/reconnect were not performed. |
| Real graphics context loss / GPU resources | Not tested | Recovery handlers exist and finite Canvas operations are tested. No GPU fault or driver failure was induced. |
| Long-duration browser memory and cross-browser matrix | Not tested | Thirty-run Node heap profile and browser frame timings are included. Multi-hour browser/GPU/audio heaps, Chrome/Firefox/Safari matrix and mobile OS behavior remain to be measured. |
| Simultaneous tabs writing progress | Not tested | Single-browser-session persistence and reload pass. localStorage is not a cross-tab transactional database; concurrent writers can still race. |
| Multiplayer resilience / 3D rigs and streaming | Not tested | These systems are absent, so adding or simulating them would change scope. |

Browser module caching during development initially reused an older entry module. A fresh loopback test origin and the final single-file artifact were used for confirmation. This observation is not counted as a game-engine fix.

## Build and launch

1. For the delivered local edition, open `release/Abduction-Midnight-Harvest.html` in a normal browser. It embeds scripts, CSS, procedural graphics and synthesized audio, with no external runtime assets.
2. For development, run `npm start` and visit `http://localhost:4173`. The server binds loopback only. HTTP is required for modular `dist/index.html`.
3. Run `npm test` for the regression suite. Run `npm run package` to rebuild and validate the standalone HTML. Run `npm run archive` to rebuild the source ZIP after packaging. Run `npm run profile` for the repeatable Node CPU/heap scenario.
4. Optional browser-only diagnostics: append `?audit=1` while testing. Remove it for ordinary play. The output reports bounded recent CPU/frame intervals and object counts; it does not contact a service.

The source ZIP deliberately excludes `.git`, cloud hosting identity, credentials and unrelated workspace projects. Nothing was published or uploaded during this audit. Local test-server processes are temporary and are stopped at handoff.

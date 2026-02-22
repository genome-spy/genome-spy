# WASD Keyboard Navigation Plan

## Goal
Add smooth keyboard navigation for horizontal genomic views using:
- `W`: zoom in
- `S`: zoom out
- `A`: pan left
- `D`: pan right

The interaction should feel similar to Chrome DevTools flame graph navigation:
- quick tap: immediate acceleration followed by smooth braking to stop in about 1 second
- key hold: same quick start, then gradual additional acceleration
- key release: braking profile similar to tap tail

## Constraints and Eligibility
Keyboard navigation is enabled only when all conditions are true:
1. Exactly one zoomable `x` scale resolution exists in the active view tree.
2. That `x` scale is resolved to the root view.
3. The target is continuous and zoomable (already enforced by `ScaleResolution.isZoomable()`).

If these conditions are not met, keyboard navigation remains inactive.

## High-Level Design
Use a self-contained motion module for keyboard acceleration/deceleration and integrate it in Core at the root `GridView` level.

- Main integration point: `packages/core/src/view/gridView/gridView.js`
- Self-contained motion logic: new module, e.g. `packages/core/src/view/keyboardZoomMotion.js`
- Existing scale operation reused for all frames: `ScaleResolution.zoom(scaleFactor, anchor, pan)`
- Small shared Core hook in zoom module to mark zoom activity for tooltip/picking deferral:
  - `packages/core/src/view/zoom.js`

`interactionController.js` remains unchanged.

## Alternatives Considered

### A) Root GridView integration + standalone motion module (recommended)
- Pros: small surface area, clear ownership, reusable motion profile, no controller refactor
- Cons: introduces keyboard listener wiring in a view class

### B) `interactionController.js` integration + standalone motion module
- Pros: centralizes all input in one controller
- Cons: requires extra plumbing to resolve the correct root scale target and adds coupling

### C) Extend `zoom.js` into a universal interaction hub
- Pros: all zoom kinetics in one place
- Cons: `zoom.js` currently adapts pointer events; this would blur responsibilities

## Step-by-Step Implementation Plan

## Phase 1: Resolve keyboard target and activation state
1. Extract/add a helper that finds zoomable resolutions for a subtree and/or the root.
2. Add helper: `getKeyboardZoomTarget(rootView)` returning the single eligible root `x` resolution or `undefined`.
3. Implement strict checks:
   - exactly one zoomable `x` resolution in the tree
   - equality with `rootView.getScaleResolution("x")`
4. Add unit tests for eligibility combinations:
   - no zoomable `x`
   - multiple zoomable `x`
   - one zoomable but not root-resolved
   - one zoomable and root-resolved

Deliverable: deterministic target-selection utility with tests.

## Phase 2: Implement self-contained motion engine
1. Create `keyboardZoomMotion.js` with no view/DOM dependencies.
2. Define API (example):
   - `setPressed(key, pressed)`
   - `step(dtMs) -> { panDelta, zoomDelta, active }`
   - `reset()`
3. Implement per-axis kinematics:
   - state: velocity, held-time, direction
   - quick start ramp for initial acceleration
   - hold-time-based extra acceleration
   - release braking with time constant tuned to ~1s stop
4. Encode constants in one config object for tuning.
5. Add focused unit tests:
   - tap generates accelerate-then-brake profile
   - hold increases terminal speed over time
   - release decelerates smoothly
   - opposite keys (`A`+`D`, `W`+`S`) cancel each axis

Deliverable: pure motion engine + profile tests.

## Phase 3: Wire keyboard listeners in root GridView
1. Register `keydown`/`keyup` using `context.addKeyboardListener(...)` once at root GridView initialization.
2. Filter events:
   - ignore editable targets (`input`, `textarea`, `select`, contentEditable)
   - ignore modifier-driven combinations
   - avoid duplicate transitions on repeated keydown for already pressed state
3. Maintain pressed-state map for `KeyW`, `KeyA`, `KeyS`, `KeyD`.
4. Start a frame loop via `context.animator.requestTransition(...)` when motion becomes active.
5. Each frame:
   - compute `dt`
   - call motion `step(dt)`
   - if target resolution exists, apply:
     - `scaleFactor = 2 ** zoomDelta`
     - `anchor = 0.5`
     - `pan = panDelta`
   - request render only when `resolution.zoom(...)` changes domain
6. Stop scheduling frames when motion reports inactive and no keys are held.

Deliverable: keyboard navigation working in Core for eligible layouts.

## Phase 4: Add small shared hook in zoom activity tracking
1. In `packages/core/src/view/zoom.js`, expose a tiny helper to mark recent zoom activity timestamp.
2. Call this helper from keyboard frame updates when zoom/pan actually changes domain.
3. Keep existing pointer behavior unchanged.
4. Add a test (or assertions in existing interaction tests) ensuring the activity flag is updated.

Deliverable: keyboard motion participates in existing `isStillZooming()` timing semantics.

## Phase 5: Verify behavior and regressions
1. Run targeted tests for new modules and grid view interaction logic.
2. Run `npm test` or at least relevant Core suites if full run is too heavy.
3. Run lint and type checks used by the workspace (`npm run lint`, `npm -ws run test:tsc --if-present`).
4. Manual validation scenarios:
   - single root x scale: WASD works
   - multiple zoomable x scales: WASD inactive
   - root x not zoomable: inactive
   - text input focused: WASD does not hijack typing
   - smooth start/brake feel for tap and hold

Deliverable: validated feature with clear in/out-of-scope behavior.

## Acceptance Criteria
1. `W/S/A/D` produce smooth zoom/pan only when one eligible root-resolved zoomable `x` scale exists.
2. Tap and hold behavior matches the acceleration/deceleration goals.
3. No regressions in wheel/drag zoom behavior.
4. Keyboard handling does not interfere with typing in inputs.
5. New tests cover eligibility logic and motion profiles.

## Suggested Implementation Order (PR-sized)
1. Target-resolution helper + tests
2. Motion engine + tests
3. GridView keyboard wiring
4. Zoom activity hook
5. Tune constants and finalize tests/docs

## Risks and Mitigations
- Risk: movement feels too fast/slow across datasets
  - Mitigation: centralize tunables; perform small iterative tuning with manual checks
- Risk: accidental activation in complex composed views
  - Mitigation: strict eligibility guard and explicit tests
- Risk: keyboard events conflict with App/UI shortcuts
  - Mitigation: ignore editable targets/modifiers and keep behavior gated by eligibility

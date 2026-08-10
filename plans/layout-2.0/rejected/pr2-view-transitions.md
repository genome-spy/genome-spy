# PR 2: Layout View Transitions and Follow-up Optimization

## Purpose

The second PR builds on retained geometry from PR 1. It separates canonical
target layout from presented geometry, animates layout commits without rerunning
layout, supports visibility transitions, and applies further optimizations only
when profiles show remaining value.

Suggested PR title: `feat(core): animate retained layout transitions`

## Step 1: Add target and presented geometry

### Outcome

Extend geometry slots with `from`, `target`, and `presented` rectangles. A layout
commit updates target geometry without changing presented geometry until
transition policy is applied.

Without a transition, presented geometry snaps immediately to target. Headless
renderers use this path unless a test explicitly controls animation time.

Audit coordinate consumers and move logical layout consumers to target geometry
while drawing and interaction remain on presented geometry.

### Affected areas

- Geometry slots and public/internal bounds accessors.
- Scale axis length and layout params.
- Interaction routing, picking, rulers, loading indicators, and mutation bounds.
- SVG/headless final-state behavior.

### Verification

- At rest, target and presented bounds are equal.
- Synthetic intermediate presentation affects drawing/hit testing but does not
  change target axis length or invalidate layout.
- Bounds APIs retain documented last-rendered semantics.

### Documentation and migration

- Document target versus presented semantics in `ARCHITECTURE.md`.
- Add user docs only if transition controls become public.

### Tentative commit

`refactor(core): separate target and presented layout geometry`

## Step 2: Animate persistent layout instances

### Outcome

Add a layout transition coordinator using the existing `Animator` timeline:

1. Capture affected slots' current presented geometry.
2. Run incremental layout and commit targets.
3. Match persistent instances by stable identity.
4. Interpolate presented `x`, `y`, `width`, `height`, and transition opacity.
5. Draw the retained batch without rerunning layout.
6. On interruption, use current presented state as the new start.

Derive clipping from presented parent/viewport state. Round intermediate scissor
coordinates only when applying WebGL state to avoid pixel-snapping jitter.

Move the WebGL backing store directly to its final required size. A possible DOM
wrapper-size animation remains separate.

### Affected areas

- `Animator` integration and transition cancellation.
- Geometry slots, viewport state, picking, and interaction bounds.
- Layout request API and transaction completion events.

### Verification

- Deterministic timestamp tests cover start, midpoint, completion, interruption.
- No layout or batch compilation occurs on transition frames.
- Picking and hit testing follow midpoint presentation geometry.
- Reduced-motion/headless mode snaps to target.
- Nested clipping remains valid through expansion and contraction.

### Documentation and migration

- Document internal defaults and interruption semantics.
- If options become public, document duration, easing, reduced motion, and
  defaults under `docs/` and schema types.

### Tentative commit

`feat(core): animate retained layout geometry`

## Step 3: Support visibility and structural cases

### Outcome

Support instances present on only one side of a transition:

- Persistent views interpolate live geometry.
- Entering views begin from a defined collapsed/parent-relative rectangle and
  zero transition opacity.
- Exiting views retain tombstone requests until completion, then trigger one
  scene rebuild.
- Reparented or incompatible instances initially use exit/enter behavior.

Apply per-request transition opacity through viewport/view uniforms so repeated
facets can transition independently when needed.

This adapts the CSS View Transitions lifecycle of matched old/new visual states:
<https://www.w3.org/TR/css-view-transitions-1/>. A later extension may capture
old subtrees into textures, but snapshots are not initially required.

### Affected areas

- Visibility initialization and configured visibility.
- Scene generation, tombstone lifetime, and batch cleanup.
- View/facet transition identity and per-request opacity.

### Verification

- Hide/show tests cover sibling reflow, enter/exit opacity, and cleanup.
- Removing a view during a transition does not access disposed state.
- Repeated visibility changes interrupt without coordinate/opacity jumps.
- Exactly one final scene rebuild removes expired tombstones.

### Documentation and migration

- Document animated structural cases and fallback behavior.
- Preserve immediate behavior when transitions are disabled.

### Tentative commit

`feat(core): transition view visibility changes`

## Step 4: Apply profile-guided further optimizations

### Outcome

Profile ordinary rendering and active transitions before selecting additional
work. Candidates, in likely order, are:

1. Collect shared request topology once and compile normal/picking executors.
2. Replace closure-heavy enabled/visible wrappers with a compact grouped
   executor.
3. Avoid `JSON.stringify` facet-coordinate keys and retain facet option records.
4. Cache effective opacity and target axis length by generation.
5. Reuse constrained-flex scratch arrays and frozen flags.
6. Add offscreen snapshots only if live exit/reparent handling is inadequate.

Do not implement an item solely because it is listed. Every selected change
needs a profile, work counter, or allocation trace showing relevance after PR 1.

### Affected areas

- Determined by selected optimizations.

### Verification

- Focused semantic tests for every changed contract.
- Before/after profile or benchmark in PR notes.
- No regression in batch reuse or transition-frame work counters.

### Documentation and migration

- Internal documentation unless behavior becomes public.

### Tentative commits

- `perf(core): share render requests with picking`
- `perf(core): reduce retained batch dispatch overhead`
- Other commits scoped to measured changes.

## Acceptance criteria

- Persistent layout changes animate without layout or batch work per frame.
- Interrupted transitions continue from current presented geometry.
- Target geometry drives subsequent layout and scale sizing.
- Presented geometry drives drawing, clipping, and interaction.
- Visibility changes have deterministic enter/exit behavior and cleanup.
- Headless and reduced-motion paths snap deterministically.
- Further optimizations have measurement evidence.

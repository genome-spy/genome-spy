# Chrome Overlay Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor generated interactive chrome overlays so rulers and interval selections share event configuration, extent resolution, and overlay construction without adding feature-specific infrastructure.

**Architecture:** Keep user-authored views, generated chrome views, and interaction controllers as separate concerns. Move shared event parsing and generated `LayerView` setup into neutral utilities, then let ruler overlays and interval selection overlays consume those utilities. Container-spanning interval selections should use the same extent decision model as rulers.

**Tech Stack:** GenomeSpy Core, JSDoc-typed JavaScript, TypeScript spec declarations, GridView/GridChild chrome rendering, ParamRuntime expressions, Vitest.

---

## Branch Context

This branch is intentionally based on `master` and should contain only this
planning document. The ruler implementation is expected to merge separately.
After the ruler branch is merged, continue this refactor by rebasing or
recreating the implementation branch on top of the merged ruler code.

The plan therefore distinguishes:

- Current master code, which has interval selection overlays but no ruler code.
- Ruler-branch findings, which identify the new ruler overlay code that should
  be generalized after that branch lands.

## Findings

### Event Configuration Is Not Feature-Neutral

Current master has `asEventConfig` in `packages/core/src/selection/selection.js`.
Point selections, interval selections, and ruler code from the ruler branch all
need the same compact string/object parsing and filter handling.

This should not live under `selection`. It is an interaction grammar utility.
Each feature can still validate its allowed event types separately.

### Interval Selection `clear` Is Normalized But Not Honored

`asSelectionConfig` normalizes `clear`, including `clear: false`, default
`dblclick`, and filtered event config objects. However, interval selection
handling in `GridChild` currently hardcodes a capture-phase `dblclick` clear and
does not use the normalized `select.clear` value.

This creates an avoidable mismatch with rulers. Before aligning ruler and
selection behavior, interval selections should honor their own existing `clear`
configuration.

### Generated Chrome Layer Construction Is Repeated

Several generated chrome views need the same mechanics:

- Create a generated `LayerView`.
- Mark it as non-addressable.
- Mark it as chrome.
- Keep it out of scale/domain participation.
- Initialize children at the correct lifecycle point.
- Render it with a z-index and a decoration order.

Current master has this pattern in selection rectangle code. The ruler branch
adds another version in `rulerOverlay.js`. The common part should become a small
generated chrome overlay helper, not a ruler-specific helper.

### Selection Rect Rendering Is Hard To Extend To Container Extent

`SelectionRect` currently owns a dynamic inline data source and updates that
source whenever the interval selection parameter changes. That works for
per-view rectangles, but it does not naturally support a single overlay rendered
at a concat/container level.

The ruler branch uses a simpler pattern: a static `[{}]` data source, a
parameter-driven filter, and positional `ExprRef`s that read the parameter. That
model is a better fit for both moving rulers and future container-spanning
interval selections.

### Ruler Container Extent Is The Right Model For Interval Extent

The ruler branch introduces `extent: "view" | "container" | "auto"` for drawing
either per participating view or once over an aligned concat. Interval
selections should eventually support the same concept:

- `x` intervals can span a `vconcat` when x projections align.
- `y` intervals can span an `hconcat` when y projections align.
- `auto` can choose container extent when safe and fall back to per-view.
- Forced `container` should throw a clear error when projections do not align.

This argues for a neutral concat overlay extent resolver.

### Document-Level Drag Tracking Is Repeated, But Not The First Refactor

Master already has document-level mouse drag code in interval brushing, zoom
panning, and scrollbars. The ruler branch adds another instance for drag rulers.
A helper may be worthwhile, but only after event config and overlay ownership
are clearer. A helper that merely wraps `document.addEventListener` can add more
surface area than it removes.

## Proposed User-Visible Alignment

Where the concepts overlap, rulers and interval selections should use the same
property names and semantics:

- `encodings`: positional channels controlled by the interaction.
- `on`: event that starts or updates the interaction, with optional filters.
- `clear`: event that clears the parameter, with `false` meaning keep the value.
- `mark`: generated overlay styling.
- `extent`: visual overlay extent, not value synchronization.

Defaults can differ when the interaction differs:

- Interval selection default `on` remains `mousedown`, with the existing
  shift requirement when a brushed channel is zoomable.
- Ruler pointer default `on` remains `mousemove`.
- Interval selection default `clear` remains `dblclick`.
- Hover rulers can default to `mouseleave`, and drag/viewport rulers can default
  to keeping the current value.

The important rule is that the same config shape should not behave differently
for accidental implementation reasons.

## Proposed Infrastructure

### 1. Event Config Utility

Create a neutral event config module, for example:

- `packages/core/src/utils/interactionConfig.js`

Responsibilities:

- Parse event strings such as `"mousedown[event.shiftKey]"`.
- Accept event config objects unchanged.
- Convert filter expressions to predicates.
- Provide validation helpers that produce feature-specific error messages.

Selection code should import this helper instead of owning it. Ruler code should
also use it after the ruler branch is merged.

### 2. Generated Chrome Overlay Helper

Create a small helper near GridView/GridChild chrome code, for example:

- `packages/core/src/view/gridView/generatedChromeOverlay.js`

Responsibilities:

- Create generated `LayerView` instances from already-built layer specs.
- Mark generated overlays as chrome and non-addressable.
- Return a small descriptor such as `{ view, zindex, order }`.
- Keep initialization explicit so `GridChild` and `GridView` can continue to
  await or intentionally fire-and-forget according to their lifecycle.

This helper should not know about rulers or selections.

### 3. Concat Overlay Extent Resolver

Create or generalize an extent resolver, for example:

- `packages/core/src/view/gridView/overlayExtent.js`

Responsibilities:

- Resolve `"view"`, `"container"`, and `"auto"` for a set of channels.
- Encode the safe concat cases:
  - x over `vconcat`
  - y over `hconcat`
- Validate aligned projections through a caller-provided predicate.
- Return `"view"` or `"container"` without constructing views.

Rulers should use this after the ruler branch is merged. Interval selections
should use it when `extent` is added.

### 4. Expression-Backed Interval Overlay Spec

Replace or supplement `SelectionRect`'s dynamic data-source rendering with an
expression-backed overlay spec:

- Static data: `{ values: [{}] }`
- Filter expression: active interval channels are non-null.
- Positional expressions:
  - `x`: `brush.intervals.x[0]`
  - `x2`: `brush.intervals.x[1]`
  - `y`: `brush.intervals.y[0]`
  - `y2`: `brush.intervals.y[1]`
- Measurement text can continue to use expressions derived from interval bounds.
- Cursor style can continue to use the existing `intervalDragActive` helper
  parameter.

This makes per-view and container-spanning interval overlays differ only in
where the generated overlay is rendered, not how the overlay receives data.

## Implementation Sequence

### Phase 1: Move Event Config Parsing

Files:

- Create `packages/core/src/utils/interactionConfig.js`
- Add `packages/core/src/utils/interactionConfig.test.js`
- Modify `packages/core/src/selection/selection.js`
- Modify point-selection setup in `packages/core/src/view/unitView.js`
- Modify interval-selection setup in `packages/core/src/view/gridView/gridChild.js`

Steps:

- [ ] Move `asEventConfig` out of `selection.js`.
- [ ] Add a helper for event filter predicate creation.
- [ ] Keep point selection behavior unchanged.
- [ ] Keep interval selection `on` validation unchanged.
- [ ] Run focused selection and interaction tests.
- [ ] Commit as `refactor(core): move event config helpers`.

### Phase 2: Honor Interval Selection `clear`

Files:

- Modify `packages/core/src/view/gridView/gridChild.js`
- Add or extend focused interval selection tests

Steps:

- [ ] Use the normalized interval `select.clear` config instead of hardcoded
      `dblclick`.
- [ ] Support `clear: false` by registering no clear listener.
- [ ] Support filtered clear events through the shared event predicate helper.
- [ ] Preserve capture-phase behavior for the default `dblclick` clear.
- [ ] Run focused GridChild/GridView selection tests.
- [ ] Commit as `fix(core): honor interval selection clear config`.

### Phase 3: Add Generated Chrome Overlay Helper

Files:

- Create `packages/core/src/view/gridView/generatedChromeOverlay.js`
- Add `packages/core/src/view/gridView/generatedChromeOverlay.test.js`
- Modify `packages/core/src/view/gridView/selectionRect.js`
- After ruler merge, modify `packages/core/src/view/gridView/rulerOverlay.js`

Steps:

- [ ] Extract only generated `LayerView` construction and chrome marking.
- [ ] Keep selection-specific spec construction in `SelectionRect`.
- [ ] Keep initialization ownership at the caller.
- [ ] Add tests that verify generated overlays are chrome and non-addressable.
- [ ] Run selection rectangle and GridView decoration tests.
- [ ] Commit as `refactor(core): add generated chrome overlay helper`.

### Phase 4: Rebase After Ruler Merge

Files:

- Rebase or recreate the implementation branch after the ruler branch lands.
- Review `packages/core/src/view/gridView/rulerOverlay.js`
- Review `packages/core/src/view/gridView/gridChild.js`
- Review `packages/core/src/view/gridView/gridView.js`

Steps:

- [ ] Rebase the refactor branch on the merged ruler branch.
- [ ] Resolve conflicts by keeping neutral helpers and adapting ruler code to
      use them.
- [ ] Re-run focused ruler and selection tests before continuing.
- [ ] Commit conflict-resolution or adaptation changes separately.

### Phase 5: Generalize Overlay Extent

Files:

- Create `packages/core/src/view/gridView/overlayExtent.js`
- Add `packages/core/src/view/gridView/overlayExtent.test.js`
- Modify ruler overlay extent call sites after ruler merge

Steps:

- [ ] Move ruler extent logic into a feature-neutral resolver.
- [ ] Preserve existing ruler extent behavior exactly.
- [ ] Add tests for x/vconcat, y/hconcat, unsupported directions, and
      misaligned forced container extent.
- [ ] Commit as `refactor(core): generalize concat overlay extent`.

### Phase 6: Convert Interval Overlay To Expression-Backed Rendering

Files:

- Modify `packages/core/src/view/gridView/selectionRect.js`
- Modify `packages/core/src/view/gridView/gridChild.js`
- Modify `packages/core/src/view/gridView/gridView.js`
- Extend `packages/core/src/spec/parameter.d.ts` if adding public `extent`
- Modify `packages/core/src/view/gridView/selectionRect.test.js`
- Modify `packages/core/src/view/gridView/gridView.test.js`

Steps:

- [ ] Add interval selection overlay spec construction using static data and
      parameter-backed expressions.
- [ ] Keep the current interaction controller behavior unchanged.
- [ ] Preserve current per-view selection rectangle rendering first.
- [ ] Remove dynamic source updates once expression-backed rendering is covered.
- [ ] Add interval `extent` support only after the per-view expression-backed
      overlay is stable.
- [ ] Add a vconcat x-interval example or test where the selection rectangle
      spans the whole concat when projections align.
- [ ] Commit as `refactor(core): use expression-backed interval overlays`.
- [ ] Commit interval `extent` support separately, likely as
      `feat(core): support container extent interval selections`.

## Test Strategy

Run focused tests after each phase:

- `npx vitest run packages/core/src/selection/selection.test.js`
- `npx vitest run packages/core/src/view/gridView/selectionRect.test.js`
- `npx vitest run packages/core/src/view/gridView/gridChild.test.js`
- `npx vitest run packages/core/src/view/gridView/gridView.test.js`
- After ruler merge, add the ruler controller and ruler overlay tests.

Before merging the refactor implementation, also run:

- `npx vitest run packages/core/examples.schema.test.js`
- `npm --workspaces run test:tsc --if-present`
- `npm run lint`

## Non-Goals

- Do not create a generic interaction framework that owns all brushing, panning,
  scrolling, and ruler behavior in one pass.
- Do not change point selection behavior except for imports from the moved event
  utility.
- Do not add interval `extent` until expression-backed interval overlay
  rendering is working per view.
- Do not remove `SelectionRect` as a public class-like concept unless the
  replacement keeps cursor, z-index, measurement, and chrome behavior clear.

## Open Questions

- Should `mouseup` become part of the shared `DomEventType` for clear events, or
  remain a ruler-only allowed clear event?
- Should interval selection `extent` default to `"view"` initially to avoid
  surprising existing specs, or `"auto"` to match ruler behavior?
- Should container-spanning interval overlays draw through gaps and axes or only
  across the union of plot rectangles?
- Should expression-backed interval overlays participate in picking exactly like
  the current dynamic-source `SelectionRect`?

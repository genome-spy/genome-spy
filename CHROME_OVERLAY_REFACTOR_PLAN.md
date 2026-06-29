# Chrome Overlay Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce duplication and behavioral discrepancies between ruler overlays and interval selection overlays without introducing a broad interaction framework.

**Architecture:** Keep user-authored views, generated chrome views, and interaction controllers separate. Extract only the shared interaction-configuration parsing, generated chrome `LayerView` setup, and concat overlay extent decisions. Preserve current ruler behavior while making interval selections honor their existing configuration and preparing interval overlays for future container-spanning rendering.

**Tech Stack:** GenomeSpy Core, JSDoc-typed JavaScript, TypeScript spec declarations, GridView/GridChild chrome rendering, ParamRuntime expressions, Vitest.

---

## Branch Context

This branch has been rebased on `master` after the ruler feature was merged.
The current codebase already contains:

- interval selection overlays in `packages/core/src/view/gridView/selectionRect.js`
- ruler overlays in `packages/core/src/view/gridView/rulerOverlay.js`
- ruler interaction controllers in `packages/core/src/ruler/`
- ruler setup in both `GridChild` and `GridView`

The plan no longer needs a rebase-after-ruler phase. Refactors should now work
directly against the merged ruler implementation.

## Current Findings

### Event Configuration Still Lives Under Selection

`asEventConfig` is still implemented in
`packages/core/src/selection/selection.js`, while ruler code imports it from
there. Point selections, interval selections, interval zoom, and ruler pointer
events all use the same compact event-string grammar, but that grammar is not
selection-specific.

Move the parser and event-filter predicate helper to a neutral interaction
utility. Feature code should still validate which event types it supports.

### Interval Selection `clear` Is Still Not Fully Honored

`asSelectionConfig` normalizes `clear`, including `clear: false`, the default
`dblclick`, and filtered event configs. `GridChild` still ignores that normalized
value for interval selections and hardcodes:

- a capture-phase `dblclick` clear listener
- a click/release path that clears an active interval when a mousedown does not
  start brushing and the pointer barely moves

This is the most concrete user-visible mismatch with rulers. It should be fixed
before deeper overlay refactoring.

### GridChild Has Two Different Interaction Styles

Ruler setup delegates pointer and viewport behavior to controller classes.
Interval selection setup remains a large inline block inside `GridChild`, mixing
configuration normalization, scale validation, pointer inversion, rectangle
translation, wheel zoom, hover state, and event registration.

Moving interval interaction behavior into a focused controller is likely to
reduce more complexity than overlay helper extraction alone. This can happen
after interval `clear` semantics are corrected.

### Generated Chrome Layer Construction Is Repeated

`SelectionRect` and ruler overlays both end up as chrome `LayerView` instances:
`SelectionRect` is a subclass, while rulers construct a plain generated
`LayerView`. Both mark the view as chrome, mark it as non-addressable, and
expose z-index behavior. The shared part is small and should remain small. A
helper should not know about ruler values, selection intervals, measurement
labels, or interaction behavior.

### Selection Rect Rendering Uses Dynamic Data For A Reason

`SelectionRect` currently uses a dynamic inline data source and updates it when
the interval selection parameter changes. The datum uses underscore-prefixed
fields to avoid tooltip pollution while preserving picking and event masking.

Expression-backed interval overlays are still attractive because they match the
ruler overlay model and make container-spanning interval overlays easier. Any
conversion must first preserve:

- active/inactive rectangle visibility
- picking and event masking behavior
- tooltip cleanliness
- brush measurement labels
- z-index and cursor behavior

This conversion should be separate from interval `clear` and event-config
refactors.

### Ruler Container Extent Is Still The Right Starting Point

Ruler `extent: "view" | "container" | "auto"` already encodes the useful concat
cases:

- `x` overlays can span a `vconcat` when x scale/layout alignment is safe
- `y` overlays can span an `hconcat` when y scale/layout alignment is safe
- forced `container` throws when the requested extent is impossible
- `auto` falls back to per-view overlays

This logic should become a neutral overlay extent resolver before interval
selection gets public `extent` support.

### Listener Lifecycle Should Be Made Explicit

`RulerViewportController` has explicit disposal. `RulerMouseEventController`
registers view interaction listeners but does not currently remove them. This is
not the first refactor to do, because view disposal drops the view with its
listeners, but it should be addressed before any dynamic ruler binding resync is
introduced.

Document-level drag tracking is also repeated in interval brushing, drag rulers,
scrollbars, and zoom panning. A helper may be worthwhile later, but it should
not be the first abstraction.

## Proposed User-Visible Alignment

Where the concepts overlap, rulers and interval selections should use the same
property names and semantics:

- `encodings`: positional channels controlled by the interaction
- `on`: event that starts or updates the interaction, with optional filters
- `clear`: event that clears the parameter, with `false` meaning keep the value
- `mark`: generated overlay styling
- `extent`: visual overlay extent, not value synchronization

Defaults can differ when the interaction differs:

- interval selection default `on` remains `mousedown`, with the existing shift
  requirement when a brushed channel is zoomable
- ruler pointer default `on` remains `mousemove`
- interval selection default `clear` remains `dblclick`
- hover rulers default to `mouseleave`; drag and viewport rulers keep the
  current value by default

The important rule is that a shared property name should not behave differently
because the implementation path is different.

## Proposed Infrastructure

### 1. Event Config Utility

Create `packages/core/src/utils/interactionConfig.js`.

Responsibilities:

- parse event strings such as `"mousedown[event.shiftKey]"`
- accept event config objects unchanged
- create event filter predicates with `createEventFilterFunction`
- validate allowed event types with feature-specific error messages

Selection code and ruler code should import this helper instead of importing
event helpers from `selection.js`.

### 2. Interval Selection Controller

Create a focused controller for interval interaction setup, for example
`packages/core/src/selection/intervalSelectionController.js` or
`packages/core/src/view/gridView/intervalSelectionController.js`.

Responsibilities:

- own interval mousedown, drag, click suppression, clear, wheel zoom, and hover
  event listeners
- keep point inversion and interval normalization together
- expose the `SelectionRect` instance or a descriptor needed by `GridChild`
- keep `GridChild` responsible for view chrome ordering and lifecycle ownership

This can be introduced after interval `clear` is fixed, or it can be the vehicle
for that fix if the refactor stays tightly scoped.

### 3. Generated Chrome Overlay Helper

Create `packages/core/src/view/gridView/generatedChromeOverlay.js`.

Responsibilities:

- construct a generated `LayerView` from an already-built layer spec
- mark the view as chrome and non-addressable
- return a descriptor such as `{ view, zindex }`
- leave initialization ownership explicit at the caller

This helper should not construct ruler or selection specs. It should only remove
the repeated `LayerView` + chrome marking boilerplate.

### 4. Concat Overlay Extent Resolver

Create `packages/core/src/view/gridView/overlayExtent.js`.

Responsibilities:

- resolve `"view"`, `"container"`, and `"auto"` for a set of channels
- support x-over-vconcat and y-over-hconcat container cases
- validate alignment through a caller-provided predicate
- return `"view"` or `"container"` without constructing views
- produce feature-specific error messages through caller-provided labels

Rulers should use this immediately. Interval selections should use it when
public interval `extent` support is added.

### 5. Selection Rect Spec Builder

Split `SelectionRect` spec construction into a testable function before changing
its data model.

Possible file:

- `packages/core/src/view/gridView/selectionRectSpec.js`

Responsibilities:

- build the current dynamic-source selection rectangle spec
- keep measurement label and cursor expression behavior unchanged
- make the eventual expression-backed version easier to compare and test

This is a low-risk intermediate step that makes later rendering changes easier
to review.

## Implementation Sequence

### Phase 1: Move Event Config Parsing

Files:

- Create `packages/core/src/utils/interactionConfig.js`
- Add `packages/core/src/utils/interactionConfig.test.js`
- Modify `packages/core/src/selection/selection.js`
- Modify `packages/core/src/view/unitView.js`
- Modify `packages/core/src/view/gridView/gridChild.js`
- Modify `packages/core/src/ruler/rulerMouseEventController.js`

Steps:

- [ ] Move `asEventConfig` from `selection.js` to `utils/interactionConfig.js`.
- [ ] Add a helper that returns either a compiled filter predicate or `() => true`.
- [ ] Add event-type validation helpers that accept an allowed-type list and a
      feature-specific error message prefix.
- [ ] Keep point selection behavior unchanged.
- [ ] Keep interval selection `on` and `zoom` behavior unchanged.
- [ ] Keep ruler pointer `on` and `clear` behavior unchanged.
- [ ] Run:
      `npx vitest run packages/core/src/selection/selection.test.js packages/core/src/ruler/rulerMouseEventController.test.js packages/core/src/view/gridView/gridChild.test.js`
- [ ] Commit as `refactor(core): move event config helpers`.

### Phase 2: Honor Interval Selection `clear`

Files:

- Modify `packages/core/src/view/gridView/gridChild.js`
- Add or extend interval selection tests in
  `packages/core/src/view/gridView/gridChild.test.js` or
  `packages/core/src/view/gridView/gridView.test.js`

Steps:

- [ ] Add tests for default interval clear on `dblclick`.
- [ ] Add tests for filtered interval clear, for example
      `"clear": "dblclick[event.shiftKey]"`.
- [ ] Add tests for `clear: false`.
- [ ] Include the click/release clearing path in the `clear: false` coverage.
      With `clear: false`, clicking an active interval without brushing must not
      clear it.
- [ ] Use normalized `select.clear` instead of a hardcoded `dblclick` listener.
- [ ] Preserve capture-phase behavior for the default `dblclick` clear.
- [ ] Keep selection translation, brushing, and wheel zoom behavior unchanged.
- [ ] Run:
      `npx vitest run packages/core/src/view/gridView/gridChild.test.js packages/core/src/view/gridView/gridView.test.js`
- [ ] Commit as `fix(core): honor interval selection clear config`.

### Phase 3: Extract Interval Interaction Controller

Files:

- Create `packages/core/src/view/gridView/intervalSelectionController.js`
- Add `packages/core/src/view/gridView/intervalSelectionController.test.js`
- Modify `packages/core/src/view/gridView/gridChild.js`

Steps:

- [ ] Move interval event listener registration out of `GridChild`.
- [ ] Keep `GridChild` responsible for creating and owning the `SelectionRect`.
- [ ] Keep `GridChild` responsible for returning `selectionRect` in
      `getChildren()`.
- [ ] Give the controller an explicit `dispose()` method that removes view
      interaction listeners it registers.
- [ ] Keep document-level drag listener behavior unchanged.
- [ ] Run:
      `npx vitest run packages/core/src/view/gridView/gridChild.test.js packages/core/src/view/gridView/selectionRect.test.js packages/core/src/view/gridView/gridView.test.js`
- [ ] Commit as `refactor(core): extract interval selection controller`.

### Phase 4: Add Generated Chrome Overlay Helper

Files:

- Create `packages/core/src/view/gridView/generatedChromeOverlay.js`
- Add `packages/core/src/view/gridView/generatedChromeOverlay.test.js`
- Modify `packages/core/src/view/gridView/selectionRect.js`
- Modify `packages/core/src/view/gridView/rulerOverlay.js`

Steps:

- [ ] Extract only generated `LayerView` construction and chrome/non-addressable
      marking.
- [ ] Keep ruler spec construction in `rulerOverlay.js`.
- [ ] Keep selection rectangle spec construction in selection-specific code.
- [ ] Keep initialization explicit at call sites.
- [ ] Preserve `SelectionRect#getZindex()` or replace it with an equivalent
      descriptor only if that reduces code.
- [ ] Run:
      `npx vitest run packages/core/src/view/gridView/generatedChromeOverlay.test.js packages/core/src/view/gridView/selectionRect.test.js packages/core/src/view/gridView/rulerOverlay.test.js packages/core/src/view/gridView/gridView.test.js`
- [ ] Commit as `refactor(core): add generated chrome overlay helper`.

### Phase 5: Generalize Overlay Extent

Files:

- Create `packages/core/src/view/gridView/overlayExtent.js`
- Add `packages/core/src/view/gridView/overlayExtent.test.js`
- Modify `packages/core/src/view/gridView/rulerOverlay.js`
- Modify `packages/core/src/view/gridView/gridChild.js`
- Modify `packages/core/src/view/gridView/gridView.js`

Steps:

- [ ] Move ruler extent logic into a feature-neutral resolver.
- [ ] Preserve existing ruler extent behavior exactly.
- [ ] Add tests for x/vconcat, y/hconcat, unsupported directions, auto fallback,
      and misaligned forced container extent.
- [ ] Keep error messages feature-specific, for example using caller-provided
      labels such as `Ruler param "cursor"`.
- [ ] Run:
      `npx vitest run packages/core/src/view/gridView/overlayExtent.test.js packages/core/src/view/gridView/rulerOverlay.test.js packages/core/src/view/gridView/gridChild.test.js packages/core/src/view/gridView/gridView.test.js`
- [ ] Commit as `refactor(core): generalize concat overlay extent`.

### Phase 6: Split Selection Rect Spec Construction

Files:

- Create `packages/core/src/view/gridView/selectionRectSpec.js`
- Add `packages/core/src/view/gridView/selectionRectSpec.test.js`
- Modify `packages/core/src/view/gridView/selectionRect.js`

Steps:

- [ ] Move current `LayerSpec` construction into a pure spec-builder function.
- [ ] Preserve dynamic inline data behavior initially.
- [ ] Preserve underscore-prefixed fields and measurement label expressions.
- [ ] Preserve default and custom cursor behavior.
- [ ] Keep `SelectionRect` responsible for dynamic data updates for now.
- [ ] Run:
      `npx vitest run packages/core/src/view/gridView/selectionRectSpec.test.js packages/core/src/view/gridView/selectionRect.test.js`
- [ ] Commit as `refactor(core): split selection rectangle spec builder`.

### Phase 7: Convert Interval Overlay To Expression-Backed Rendering

Files:

- Modify `packages/core/src/view/gridView/selectionRectSpec.js`
- Modify `packages/core/src/view/gridView/selectionRect.js`
- Modify `packages/core/src/view/gridView/selectionRect.test.js`
- Modify `packages/core/src/view/gridView/gridView.test.js`

Steps:

- [ ] Add tests that capture current inactive selection behavior.
- [ ] Add tests that capture current picking/event masking behavior.
- [ ] Add tests that capture tooltip cleanliness for the selection rectangle.
- [ ] Change selection rectangle data to static `{ values: [{}] }`.
- [ ] Add a parameter-driven filter expression for active interval channels.
- [ ] Replace field-based positional channels with `datum` ExprRefs reading the
      interval parameter.
- [ ] Update measurement label expressions to read interval parameter values.
- [ ] Remove dynamic inline source updates after expression-backed rendering is
      covered.
- [ ] Run:
      `npx vitest run packages/core/src/view/gridView/selectionRect.test.js packages/core/src/view/gridView/gridView.test.js packages/core/examples.test.js`
- [ ] Commit as `refactor(core): use expression-backed interval overlays`.

### Phase 8: Add Interval Overlay `extent`

Files:

- Modify `packages/core/src/spec/parameter.d.ts`
- Modify `packages/core/src/view/gridView/gridChild.js`
- Modify `packages/core/src/view/gridView/gridView.js`
- Modify `packages/core/src/view/gridView/selectionRectSpec.js`
- Add or modify tests in `packages/core/src/view/gridView/gridView.test.js`
- Add a manual example under `examples/core/selection/` or the nearest existing
  selection examples folder

Steps:

- [ ] Add `extent?: "view" | "container" | "auto"` to interval selection config.
- [ ] Choose default `"view"` unless there is an explicit decision to make
      existing specs start spanning containers.
- [ ] Reuse the neutral overlay extent resolver.
- [ ] Add a vconcat x-interval test where the selection rectangle spans the
      whole concat when projections align and `extent: "container"` is set.
- [ ] Add forced-container rejection tests for unsupported or misaligned cases.
- [ ] Keep value synchronization unchanged: `extent` controls only rendering.
- [ ] Run:
      `npx vitest run packages/core/src/spec/schema.test.js packages/core/src/view/gridView/gridView.test.js packages/core/examples.schema.test.js`
- [ ] Commit as `feat(core): support container extent interval selections`.

## Test Strategy

Run focused tests after each phase. Before merging the refactor implementation,
also run:

- `npm test`
- `npm --workspaces run test:tsc --if-present`
- `npm run lint`

The full `npm test` is important because the ruler PR showed that acid mutation
tests can catch lifecycle bugs that focused overlay tests miss.

## Non-Goals

- Do not create a generic interaction framework that owns brushing, panning,
  scrolling, ruler behavior, and zoom behavior in one pass.
- Do not change point selection semantics except for imports from the moved
  event utility.
- Do not add interval `extent` until interval `clear` is correct and interval
  overlay rendering is expression-backed or otherwise container-ready.
- Do not remove `SelectionRect` unless the replacement preserves cursor,
  z-index, measurement, picking, tooltip, and chrome behavior.
- Do not make `display` reactive for rulers in this refactor.

## Open Questions

- Should `mouseup` become part of the shared event type for clear events, or
  remain a ruler-only clear event?
- Should interval selection `extent` default to `"view"` initially to avoid
  surprising existing specs, or `"auto"` to match ruler behavior?
- Should container-spanning interval overlays draw through gaps and axes or only
  across the union of plot rectangles?
- Can expression-backed interval overlays preserve picking/event masking without
  reintroducing hidden datum fields?
- Should `RulerMouseEventController` remove view interaction listeners on
  dispose now, or only when dynamic ruler binding resync is introduced?

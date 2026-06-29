# Chrome Overlay Refactor Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish simplifying the merged ruler/interval overlay refactor by deleting remaining unnecessary structure and preparing interval selections for container-spanning overlays.

**Architecture:** Keep the useful shared pieces: event config parsing, expression-backed generated overlays, and concat overlay extent resolution. Prefer deleting or collapsing thin wrappers over adding new abstractions. Interval selection `extent` is still expected, so extent resolution should remain feature-neutral.

**Tech Stack:** GenomeSpy Core, JSDoc-typed JavaScript, TypeScript spec declarations, GridView/GridChild chrome rendering, ParamRuntime expressions, Vitest.

---

## Branch Context

This branch is based on `master` after ruler parameters were merged. Phases 1-7
of the original plan have already been implemented:

- event config parsing moved to `packages/core/src/utils/interactionConfig.js`
- interval selection `clear` now honors the normalized config
- interval selection interaction logic moved from `GridChild` to
  `packages/core/src/view/gridView/intervalSelectionController.js`
- generated chrome helper added in
  `packages/core/src/view/gridView/generatedChromeOverlay.js`
- concat overlay extent resolver added in
  `packages/core/src/view/gridView/overlayExtent.js`
- selection rectangle spec construction moved to
  `packages/core/src/view/gridView/selectionRectSpec.js`
- interval overlays now use static `[{}]` data and parameter-backed ExprRefs

The remaining work should be deletion-oriented. Do not reimplement phases 1-7.

## Current Findings

### `SelectionRect` Is Now Mostly A Thin Wrapper

`packages/core/src/view/gridView/selectionRect.js` now extends `LayerView`, calls
`createSelectionRectSpec(...)`, stores a z-index, and marks the view as chrome.
The dynamic inline source update logic is gone, so the class has much less
reason to exist.

The likely simplification is to replace the class with a factory that returns
the same descriptor shape as ruler overlays:

```js
{
    view,
    zindex
}
```

This would make interval overlays and ruler overlays use the same generated
chrome construction path.

### `generatedChromeOverlay` Is Useful Only If Both Overlay Families Use It

`createGeneratedChromeOverlay(...)` is currently used by ruler overlays.
`markGeneratedChromeOverlay(...)` is currently used by `SelectionRect`.

That is a weak abstraction boundary. It becomes worthwhile if selection
rectangles are also created through `createGeneratedChromeOverlay(...)`. If
`SelectionRect` remains a subclass, the helper should probably be collapsed back
to the simpler mark-only function or inlined.

### `overlayExtent` Should Stay

`overlayExtent.js` is currently used only by rulers, but interval selection
`extent` is still planned and should use the same x-over-vconcat and
y-over-hconcat decision rules. Keep this module. The next interval extent work
should consume it directly rather than duplicating ruler logic.

### Ruler Mouse Controllers Are Stored But Not Disposed

`GridChild` stores `rulerMouseEventControllers`, but
`RulerMouseEventController` has no `dispose()` method and `GridChild.dispose()`
only resets the array. This is not a useful ownership model.

Either:

- add explicit listener disposal to `RulerMouseEventController`, or
- stop storing mouse controllers and document that view-owned listeners die with
  the view

Prefer explicit disposal if it can be implemented without a larger interaction
framework.

### `IntervalSelectionController` Is Better Isolated But Still Bulky

`intervalSelectionController.js` is the biggest new file. It is cleaner than the
old inline `GridChild` block, but it still mixes:

- scale validation
- brush start
- drag-existing-brush behavior
- click suppression
- clear behavior
- wheel zoom
- hover state for cursor behavior
- document-level drag tracking

Do not split it just for aesthetics. Trim local structure first:

- `name`, `param`, and `select` do not need to be instance fields if they are
  only used during setup
- `addViewInteractionListener(...)` exists mainly for disposal and tests; it can
  become private if tests exercise disposal through a real controller
- the temporary click-to-clear `mouseup` listener should either be tracked and
  disposed consistently or explicitly documented as one-shot

### `selectionExpression` Must Not Default To Compiled Expression Code

`SelectionRect` currently accepts `selectionExpression = selectionExpr.code`.
In real runtimes, `selectionExpr.code` may contain compiled backing code such as
`globalObject["brush"]`, which is not valid user spec expression syntax. The
controller already passes the parameter name explicitly.

Make the selection expression string required in the overlay factory or
constructor. Fail fast rather than falling back to compiled expression code.

## Proposed Shape

After cleanup, generated overlay construction should look like this:

- ruler overlays:
  - `createRulerOverlaySpec(...)`
  - `createRulerOverlayView(...) -> { view, zindex }`
- interval selection overlays:
  - `createSelectionRectSpec(...)`
  - `createSelectionRectOverlay(...) -> { view, zindex }`
- shared chrome helper:
  - constructs generated `LayerView`
  - marks chrome and non-addressable
  - returns `{ view, zindex }`

`GridChild` should store interval selection overlay descriptors or the overlay
view directly, but it should not need a special `SelectionRect` class merely for
z-index.

## Implementation Sequence

### Phase 1: Replace `SelectionRect` With An Overlay Factory

Files:

- Modify `packages/core/src/view/gridView/selectionRect.js`
- Modify `packages/core/src/view/gridView/intervalSelectionController.js`
- Modify `packages/core/src/view/gridView/gridChild.js`
- Modify `packages/core/src/view/gridView/selectionRect.test.js`
- Modify `packages/core/src/view/gridView/gridView.test.js`

Steps:

- [ ] Add or update tests that verify interval overlay descriptors expose
      `{ view, zindex }`.
- [ ] Replace `new SelectionRect(...)` with a factory such as
      `createSelectionRectOverlay(...)`.
- [ ] Have the factory call `createSelectionRectSpec(...)` and
      `createGeneratedChromeOverlay(...)`.
- [ ] Make the selection expression string required. The controller should pass
      the interval parameter name.
- [ ] Preserve z-index ordering in `GridView`.
- [ ] Preserve chrome and non-addressable behavior.
- [ ] Run:
      `npx vitest run packages/core/src/view/gridView/selectionRect.test.js packages/core/src/view/gridView/gridChild.test.js packages/core/src/view/gridView/gridView.test.js`
- [ ] Commit as `refactor(core): make selection rect a generated overlay`.

### Phase 2: Reassess `generatedChromeOverlay`

Files:

- Modify `packages/core/src/view/gridView/generatedChromeOverlay.js`
- Modify `packages/core/src/view/gridView/generatedChromeOverlay.test.js`
- Modify `packages/core/src/view/gridView/rulerOverlay.js`
- Modify `packages/core/src/view/gridView/selectionRect.js`

Steps:

- [ ] If both ruler and interval overlays use `createGeneratedChromeOverlay(...)`,
      keep the helper.
- [ ] If only one overlay family uses the construction helper, inline it and
      keep only the small chrome-marking helper if that still removes real
      duplication.
- [ ] Remove tests that only verify a now-deleted helper.
- [ ] Run:
      `npx vitest run packages/core/src/view/gridView/generatedChromeOverlay.test.js packages/core/src/view/gridView/rulerOverlay.test.js packages/core/src/view/gridView/selectionRect.test.js`
- [ ] Commit as `refactor(core): simplify generated chrome overlay helper`.

### Phase 3: Add Disposal For Pointer Ruler Controllers

Files:

- Modify `packages/core/src/ruler/rulerMouseEventController.js`
- Modify `packages/core/src/view/gridView/gridChild.js`
- Add or modify `packages/core/src/ruler/rulerMouseEventController.test.js`
- Add or modify `packages/core/src/view/gridView/gridChild.test.js`

Steps:

- [ ] Add tests showing `RulerMouseEventController.dispose()` removes view
      interaction listeners.
- [ ] Track view interaction listeners registered by the controller.
- [ ] Remove those listeners in `dispose()`.
- [ ] Keep document-level mousedown drag listeners one-shot; they already remove
      themselves on mouseup.
- [ ] Keep `GridChild` storing `rulerMouseEventControllers`, because the array
      will now represent real ownership.
- [ ] Run:
      `npx vitest run packages/core/src/ruler/rulerMouseEventController.test.js packages/core/src/view/gridView/gridChild.test.js`
- [ ] Commit as `refactor(core): dispose pointer ruler listeners`.

### Phase 4: Trim `IntervalSelectionController` Local State

Files:

- Modify `packages/core/src/view/gridView/intervalSelectionController.js`
- Modify `packages/core/src/view/gridView/intervalSelectionController.test.js`
- Modify `packages/core/src/view/gridView/gridChild.test.js`

Steps:

- [ ] Remove `name`, `param`, and `select` instance fields if they are only used
      by setup.
- [ ] Make listener-registration helpers private unless another production file
      needs them.
- [ ] Track or document the one-shot click-to-clear `mouseup` listener.
- [ ] Keep behavior unchanged.
- [ ] Run:
      `npx vitest run packages/core/src/view/gridView/intervalSelectionController.test.js packages/core/src/view/gridView/gridChild.test.js packages/core/src/view/gridView/gridView.test.js`
- [ ] Commit as `refactor(core): trim interval selection controller state`.

### Phase 5: Add Interval Overlay `extent`

Files:

- Modify `packages/core/src/spec/parameter.d.ts`
- Modify `packages/core/src/view/gridView/gridChild.js`
- Modify `packages/core/src/view/gridView/gridView.js`
- Modify `packages/core/src/view/gridView/selectionRect.js`
- Modify `packages/core/src/view/gridView/selectionRectSpec.js`
- Add or modify tests in `packages/core/src/view/gridView/gridView.test.js`
- Add a manual example under `examples/core/selection/` or the nearest existing
  selection examples folder

Steps:

- [ ] Add `extent?: "view" | "container" | "auto"` to interval selection
      config.
- [ ] Default to `"view"` unless there is an explicit decision to make existing
      interval selections start spanning containers.
- [ ] Reuse `resolveOverlayExtent(...)`.
- [ ] Add a vconcat x-interval test where the selection rectangle spans the
      whole concat when projections align and `extent: "container"` is set.
- [ ] Add forced-container rejection tests for unsupported or misaligned cases.
- [ ] Keep value synchronization unchanged: `extent` controls only rendering.
- [ ] Run:
      `npx vitest run packages/core/src/spec/schema.test.js packages/core/src/view/gridView/gridView.test.js packages/core/examples.schema.test.js`
- [ ] Commit as `feat(core): support container extent interval selections`.

## Test Strategy

Run focused tests after each phase. Before merging the cleanup implementation,
also run:

- `npm test`
- `npm --workspaces run test:tsc --if-present`
- `npm run lint`

## Non-Goals

- Do not create a generic interaction framework for brushing, panning,
  scrolling, ruler behavior, and zoom behavior.
- Do not remove `overlayExtent.js`; interval selection extent is still expected.
- Do not split `IntervalSelectionController` into several classes unless a
  concrete behavior change requires it.
- Do not make ruler `display` reactive in this cleanup.
- Do not change point selection semantics.

## Open Questions

- Should interval selection `extent` default to `"view"` initially to avoid
  surprising existing specs, or `"auto"` to match ruler behavior?
- Should container-spanning interval overlays draw through gaps and axes or only
  across the union of plot rectangles?
- Should the selection rectangle factory live in `selectionRect.js`, or should
  that file be renamed to `selectionRectOverlay.js` after the class is removed?

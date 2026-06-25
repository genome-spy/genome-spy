# Facet View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore `facet` specs by implementing a modern `FacetView` that repeats one child view over many facet cells without creating one child view per facet.

**Architecture:** `FacetView` remains a specialized `ContainerView`, not a `GridView` subclass. It owns one heavy child view and one `GridChild` chrome wrapper, computes lightweight facet-cell instances with the existing `Grid` and flex layout helpers, and renders the same child/chrome repeatedly with different `facetId` options. A parent `GridView`, including the implicit root wrapper, owns viewport scrolling through `viewportHeight` and `viewportWidth`.

**Tech Stack:** JavaScript with JSDoc types, existing GenomeSpy view/dataflow APIs, `Grid`, `flexLayout`, `GridChild`, `InlineSource.updateDynamicData`, Vitest layout snapshots.

---

## Investigation Summary

`packages/core/src/view/facetView.js` is stale:

- It uses the old constructor signature and old `context.createView(...)` call shape.
- It imports `DecoratorView`, which no longer exists.
- It relies on removed view data methods such as `transformData()`, `getData()`, and `UnitView.updateData()`.
- Its `getSize()` is unimplemented.
- It is not registered in `ViewFactory`; `isFacetSpec` is exported but the registration is commented out.

The current codebase already has the required primitives:

- `packages/core/src/view/layout/grid.js` maps repeated instance indices to row/column coordinates.
- `packages/core/src/view/layout/flexLayout.js` maps size definitions to pixel locations.
- `packages/core/src/view/gridView/gridChild.js` creates child chrome: background, stroke, axes, grid lines, legends, title, selection rectangle.
- `packages/core/src/view/flowBuilder.js` groups unit collectors by `view.getFacetFields()`.
- `packages/core/src/marks/mark.js` renders a grouped mark batch using `options.facetId`.
- `packages/core/src/data/sources/inlineSource.js` supports `updateDynamicData(...)`, which is already used by chrome views such as `SeparatorView` and `SelectionRect`.
- `GridView` already handles `viewportHeight` and `viewportWidth` for a scrollable child by comparing `view.getViewportSize()` and `view.getSize()`.

The important constraint is that `FacetView` must not create one child view per facet. A 100-facet view should still have one child subtree and one set of mark/shader resources.

## Initial Scope

Support these cases first:

- Single field shorthand:

```json
{
  "facet": { "field": "Series" },
  "columns": 2,
  "spec": { "mark": "point" }
}
```

- Row/column matrix facets:

```json
{
  "facet": {
    "row": { "field": "Origin" },
    "column": { "field": "Cylinders" }
  },
  "spec": { "mark": "point" }
}
```

- Shared scales and shared axes only.
- Repeated rendering of the same child view and same child chrome.
- Parent `GridView` viewport scrolling via `viewportHeight` / `viewportWidth`.
- Dynamic row and column headers.
- Visible-cell culling during render.

Reject these cases with clear errors in the first version:

- `facet.row` combined with top-level `columns`.
- Any facet field definition without `field`.
- Facet specs whose child or descendants require independent scales or axes.
- Facet specs with nested `facet` as the immediate child.
- Per-facet scale domains.

## File Map

Modify:

- `packages/core/src/view/facetView.js`
  - Replace the stale implementation with a modern single-child repeated renderer.
- `packages/core/src/view/viewFactory.js`
  - Import/register `FacetView`.
  - Include `isFacetSpec(...)` in implicit root wrapping.
- `packages/core/src/view/viewSpecGuards.js`
  - Keep `isFacetSpec(...)`; adjust only if stricter detection is needed.
- `packages/core/src/spec/view.d.ts`
  - Replace `facet: any` with minimal typed `FacetFieldDef | FacetMapping`.
  - Document the initial shared-scale behavior and `columns` restriction.
- `packages/core/src/view/viewUtils.js`
  - Keep or tighten `isFacetFieldDef` and `isFacetMapping`; avoid broad runtime behavior.

Create:

- `packages/core/src/view/facetLayout.js`
  - Pure helpers for factors, cell instances, size calculation, and pixel coordinate mapping.
- `packages/core/src/view/facetHeaderView.js`
  - Dynamic chrome view for row/column labels using a single `UnitView` per orientation and inline data updates.
- `packages/core/src/view/facetView.test.js`
  - Unit/layout tests for factory registration, grouping, layout, scroll culling, and validation.

Do not modify in the first pass unless tests prove it is necessary:

- `packages/core/src/view/gridView/gridView.js`
- `packages/core/src/view/gridView/gridChild.js`
- `packages/core/src/marks/mark.js`
- `packages/core/src/view/flowBuilder.js`

## Data Model

Normalize facet definitions into a stable runtime shape:

```js
/**
 * @typedef {"row" | "column"} FacetChannel
 *
 * @typedef {object} NormalizedFacet
 * @prop {import("../spec/channel.js").FieldDefWithoutScale | undefined} row
 * @prop {import("../spec/channel.js").FieldDefWithoutScale | undefined} column
 * @prop {string[]} fields Collector groupby fields in facetId tuple order.
 */
```

Facet id tuple order must be stable and must match collector `groupby` order:

- Row+column matrix: `[rowValue, columnValue]`
- Row-only facet: `[rowValue]`
- Column-only facet: `[columnValue]`

The layout cell stores both the tuple and display values:

```js
/**
 * @typedef {object} FacetCell
 * @prop {import("../spec/channel.js").Scalar[]} facetId
 * @prop {number} row
 * @prop {number} column
 * @prop {import("../spec/channel.js").Scalar | undefined} rowValue
 * @prop {import("../spec/channel.js").Scalar | undefined} columnValue
 */
```

Use array facet ids even for one-dimensional facets. Current `Collector` and mark rendering already normalize facet batch ids with arrays, and this avoids comma-string collisions.

## Facet State From Dataflow

`FacetView` should derive factors from completed descendant unit collectors. Do not derive factors from raw data in `FacetView`; the dataflow collector already knows grouped facet batches.

Algorithm:

```js
function collectFacetKeys(childView) {
    /** @type {Set<string>} */
    const encoded = new Set();
    /** @type {import("../spec/channel.js").Scalar[][]} */
    const keys = [];

    childView.visit((view) => {
        if (!(view instanceof UnitView)) {
            return;
        }

        const collector = view.getCollector();
        if (!collector?.completed) {
            return;
        }

        for (const key of collector.facetBatches.keys()) {
            if (key === undefined) {
                continue;
            }

            const tuple = Array.isArray(key) ? key : [key];
            const encodedKey = JSON.stringify(tuple);
            if (!encoded.has(encodedKey)) {
                encoded.add(encodedKey);
                keys.push(tuple);
            }
        }
    });

    return keys;
}
```

`FacetView` should keep a cached signature of these keys:

```js
const signature = JSON.stringify(keys);
if (signature !== this.#facetSignature) {
    this.#facetSignature = signature;
    this.#rebuildFacetState(keys);
    this.invalidateSizeCache();
    this.context.requestLayoutReflow();
}
```

To ensure the layout updates when data arrives:

- In `getSize()` and `render()`, call `#syncFacetCollectors()` before using facet state.
- `#syncFacetCollectors()` walks descendant `UnitView` collectors and registers observers for unobserved collectors.
- Each observer calls `#updateFacetStateFromCollectors()`, invalidates size, and requests layout reflow.
- Register observer disposers on `FacetView` so `dispose()` cleans them up through the existing view disposer path.

This avoids adding a new global dataflow hook.

## Layout Model

Create `packages/core/src/view/facetLayout.js` with pure helpers:

```js
export function createFacetGrid(normalizedFacet, factors, columns) {}
export function getFacetGridSize(grid, childSize, childOverhang, headers, spacing) {}
export function getFacetCellLayout(grid, coords, childSize, childOverhang, headers, spacing, devicePixelRatio) {}
export function isRectVisible(rect, clip) {}
```

Use existing primitives:

- `Grid` for wrapped one-dimensional facets.
- `mapToPixelCoords(...)` for pixel locations.
- `getLargestSize(...)` and `sumSizeDefs(...)` for flex size aggregation.
- `Rectangle.intersect(...)` and `Rectangle.isDefined()` for culling.

Recommended first implementation:

- For column-only facets with `columns`, use wrapping `Grid(factorCount, columns)`.
- For column-only facets without `columns`, use `Grid(factorCount, Infinity)`.
- For row-only facets, use one column and one row per factor.
- For row+column matrix facets, use rows from row factors and columns from column factors.
- Reserve a top header band when column labels exist.
- Reserve a left header band when row labels exist.
- Reserve child chrome overhang per cell using `gridChild.getOverhangAndPadding()`.

The layout helper should return visible-independent cell rectangles in `FacetView` local coordinates:

```js
/**
 * @typedef {object} FacetCellLayout
 * @prop {FacetCell} cell
 * @prop {import("./layout/rectangle.js").default} viewportCoords
 * @prop {import("./layout/rectangle.js").default} childCoords
 */
```

The distinction mirrors `GridView`:

- `viewportCoords` is the full cell frame used for background, axes, legends, title, and selection chrome.
- `childCoords` is passed to `gridChild.view.render(...)`. For the first version, this can equal `viewportCoords` unless child scrollability must be supported inside each facet cell.

## Header Rendering

Create `packages/core/src/view/facetHeaderView.js`.

Use one dynamic `UnitView` per orientation:

- `facetHeaderColumn` renders all visible column/wrapped labels.
- `facetHeaderRow` renders all visible row labels.

Follow the dynamic inline-data pattern in `SeparatorView`:

- The header view creates a `UnitView` with `data: { values: [] }`.
- On each render, it computes label tuples and calls `flowHandle.dataSource.updateDynamicData(data)`.
- It updates the x/y scale domains to the current `coords.width` and `coords.height`.
- It renders the single `UnitView` over the full `FacetView` content coordinates.

Suggested data shape:

```js
{
    x: number,
    y: number,
    text: string,
    angle: number
}
```

Suggested column header spec:

```js
{
    data: { values: [] },
    mark: {
        type: "text",
        clip: false,
        align: "center",
        baseline: "middle"
    },
    encoding: {
        x: { field: "x", type: "quantitative", scale: null },
        y: { field: "y", type: "quantitative", scale: null },
        text: { field: "text", type: "nominal" },
        size: { value: 12 },
        color: { value: "black" }
    }
}
```

If text marks do not accept datum-driven `angle`, create separate row/column header `UnitView`s with fixed mark angles instead of using an `angle` field. That still keeps the count to two header views, not one view per factor.

Mark header views with:

```js
markViewAsNonAddressable(view, { skipSubtree: true });
markViewAsChrome(view, { skipSubtree: true });
```

Header sizing for the first version:

- Column header height: `18` px.
- Row header width: `18` px for rotated row labels.
- Keep these constants private in `facetHeaderView.js` or `facetLayout.js`.
- Later configuration can follow Vega-Lite header config, but do not add schema surface in the first implementation.

## Rendering Order

`FacetView.render(context, coords, options)` should:

1. Call `super.render(context, coords, options)`.
2. Return early if not configured visible.
3. Sync facet state from collectors.
4. Shrink own padding only when `!this.layoutParent`, matching current root behavior. In the expected root case, the implicit `GridView` applies parent padding.
5. Push `FacetView` to the rendering context.
6. Compute facet layout for current `coords`.
7. Normalize parent clip options.
8. Build visible cell list with `isRectVisible(cell.viewportCoords, options.clip)`.
9. Render cell backgrounds and grid lines.
10. Render repeated child content with:

```js
gridChild.view.render(context, cell.childCoords, {
    ...options,
    facetId: cell.cell.facetId,
    firstFacet: visibleIndex === 0
});
```

11. Render repeated axes by translating the same `gridChild.axes` against each visible `viewportCoords`.
12. Render repeated background strokes.
13. Render local legends only once for the whole facet view in the first version. If this produces confusing placement, reject legends in faceted children until a per-cell legend policy is defined.
14. Render column/row headers.
15. Render selection rectangle only if tests prove interval selection works with repeated cells; otherwise reject interval selection under `FacetView` in the first version.
16. Pop `FacetView`.

Repeat axes because initial facets use shared scales only. Do not build per-facet scale or axis resolutions.

Use a local decoration queue copied narrowly from `GridView` if z-index ordering is needed. Keep it private to `FacetView`; do not extract until duplication becomes measurable.

## Resolution Rules

`FacetView.getDefaultResolution(channel, resolutionType)` should initially return:

```js
if (resolutionType == "axis" || resolutionType == "scale") {
    return "shared";
}
return "shared";
```

Add validation after child creation and axis resolution:

```js
this.visit((view) => {
    if (view === this) {
        return;
    }
    for (const channel of ["x", "y"]) {
        if (view.getConfiguredOrDefaultResolution(channel, "scale") === "independent") {
            throw new Error("FacetView currently supports only shared scales.");
        }
        if (view.getConfiguredOrDefaultResolution(channel, "axis") === "independent") {
            throw new Error("FacetView currently supports only shared axes.");
        }
    }
});
```

The exact traversal may need to skip chrome views once `GridChild` has created axes and headers. Use `isChromeView(...)` if validation runs after chrome creation.

## Testing Strategy

Use permanent tests that assert behavior and layout contracts, not temporary implementation details.

Primary focused command:

```bash
npx vitest run packages/core/src/view/facetView.test.js
```

Related regression commands:

```bash
npx vitest run packages/core/src/view/gridView/gridView.test.js
npx vitest run packages/core/src/view/layoutSnapshot.test.js
npm --workspaces run test:tsc --if-present
```

Full verification before considering the feature complete:

```bash
npm test
npm run lint
```

## Task 1: Restore Factory Recognition Behind a Failing Test

**Files:**

- Create: `packages/core/src/view/facetView.test.js`
- Modify: `packages/core/src/view/viewFactory.js`
- Modify: `packages/core/src/view/facetView.js`

- [ ] Add a test that `isFacetSpec(...)` is considered a valid view spec after registration.
- [ ] Add a test that a root facet spec is wrapped by the implicit root `GridView`.
- [ ] Run `npx vitest run packages/core/src/view/facetView.test.js`; expected result is failure because `FacetView` is not registered or not constructible.
- [ ] Replace stale `facetView.js` with a minimal modern `FacetView extends ContainerView` constructor that accepts `(spec, context, layoutParent, dataParent, name, options)`.
- [ ] Register `FacetView` in `ViewFactory`.
- [ ] Add `isFacetSpec(viewSpec)` to the implicit-root wrapping condition.
- [ ] Run the focused test and confirm the factory/root wrapping tests pass.
- [ ] Commit with:

```bash
git commit -m "feat(core): restore facet view factory registration"
```

## Task 2: Normalize Facet Specs and Expose Grouping Fields

**Files:**

- Modify: `packages/core/src/view/facetView.js`
- Modify: `packages/core/src/view/viewUtils.js`
- Test: `packages/core/src/view/facetView.test.js`

- [ ] Add tests for shorthand column facets, row/column facets, and invalid `row` plus `columns`.
- [ ] Implement `normalizeFacetSpec(spec)` in `facetView.js` or a private helper module.
- [ ] Implement `FacetView.getFacetFields()` using the normalized facet field order.
- [ ] Ensure descendants inherit these fields through the existing `View.getFacetFields(...)` path.
- [ ] Run the focused test and confirm grouping field tests pass.
- [ ] Commit with:

```bash
git commit -m "feat(core): normalize facet fields for grouped dataflow"
```

## Task 3: Build One Child View and One Chrome Wrapper

**Files:**

- Modify: `packages/core/src/view/facetView.js`
- Test: `packages/core/src/view/facetView.test.js`

- [ ] Add a test that a facet spec creates exactly one non-chrome child view for `spec.spec`.
- [ ] Add a test that descendant unit collectors group by the facet fields after `initializeViewSubtree(...)` and data load.
- [ ] In `FacetView.initializeChildren()`, create the child with:

```js
this.child = await this.context.createOrImportView(
    this.spec.spec,
    this,
    this,
    this.getNextAutoName("facet"),
    undefined,
    { inheritEncoding: true }
);
```

- [ ] Create one `GridChild` for the child:

```js
this.#gridChild = new GridChild(this.child, this, 0);
await this.#gridChild.createAxes();
```

- [ ] Implement `[Symbol.iterator]()` to yield `this.#gridChild.getChildren()` plus header views once they exist.
- [ ] Run the focused test and confirm one-child dataflow behavior.
- [ ] Commit with:

```bash
git commit -m "feat(core): create single child chrome for facets"
```

## Task 4: Derive Facet Factors From Collector Batches

**Files:**

- Modify: `packages/core/src/view/facetView.js`
- Test: `packages/core/src/view/facetView.test.js`

- [ ] Add tests that loaded data produces the expected facet ids:
  - Anscombe `Series`: `[["I"], ["II"], ["III"], ["IV"]]`
  - Cars `Origin` x `Cylinders`: row values from `Origin`, column values from `Cylinders`.
- [ ] Implement collector discovery over descendant `UnitView`s.
- [ ] Register collector observers lazily and dispose them through `FacetView.registerDisposer(...)`.
- [ ] Implement factor sorting with current default ascending comparison. Keep custom sort out of scope.
- [ ] Implement `#facetSignature` so repeated renders do not rebuild state when keys are unchanged.
- [ ] Run the focused test and confirm factor extraction.
- [ ] Commit with:

```bash
git commit -m "feat(core): derive facet cells from grouped collectors"
```

## Task 5: Implement Facet Grid Layout Helpers

**Files:**

- Create: `packages/core/src/view/facetLayout.js`
- Test: `packages/core/src/view/facetView.test.js`

- [ ] Add pure unit tests for:
  - Column facet with `columns: 2`.
  - Row/column matrix facet.
  - Row-only facet.
  - Culling rectangles outside a clip.
- [ ] Implement `createFacetGrid(...)` using `Grid`.
- [ ] Implement size aggregation using `getLargestSize(...)`, `sumSizeDefs(...)`, and header size constants.
- [ ] Implement pixel coordinate mapping using `mapToPixelCoords(...)`.
- [ ] Implement `isRectVisible(rect, clip)`:

```js
export function isRectVisible(rect, clip) {
    if (!clip) {
        return true;
    }

    const visible = rect.intersect(clip.rect);
    return visible.isDefined() && visible.width > 0 && visible.height > 0;
}
```

- [ ] Run the focused test and confirm pure layout behavior.
- [ ] Commit with:

```bash
git commit -m "feat(core): add facet grid layout helpers"
```

## Task 6: Implement `FacetView.getSize()`

**Files:**

- Modify: `packages/core/src/view/facetView.js`
- Test: `packages/core/src/view/facetView.test.js`

- [ ] Add layout snapshot tests showing that `getSize()` grows with facet count.
- [ ] Add a test for `viewportHeight` where the implicit root grid creates a smaller viewport than full facet content.
- [ ] Implement `FacetView.getSize()` from facet layout helpers and `this.#gridChild.getOverhangAndPadding()`.
- [ ] Ensure `getSize()` returns zero dimensions when the view is not configured visible.
- [ ] Run the focused test and `npx vitest run packages/core/src/view/gridView/gridView.test.js`.
- [ ] Commit with:

```bash
git commit -m "feat(core): compute facet grid size"
```

## Task 7: Add Dynamic Facet Headers

**Files:**

- Create: `packages/core/src/view/facetHeaderView.js`
- Modify: `packages/core/src/view/facetView.js`
- Test: `packages/core/src/view/facetView.test.js`

- [ ] Add tests that column and row header chrome views are present and marked as non-addressable chrome.
- [ ] Add a layout snapshot test that column headers occupy the top header band and row headers occupy the left header band.
- [ ] Implement `FacetHeaderView` using the `SeparatorView` dynamic inline-data pattern.
- [ ] Use one `UnitView` per active orientation, not one view per facet value.
- [ ] Update header data during render from visible label positions.
- [ ] Run the focused test.
- [ ] Commit with:

```bash
git commit -m "feat(core): render dynamic facet headers"
```

## Task 8: Render Repeated Facet Cells

**Files:**

- Modify: `packages/core/src/view/facetView.js`
- Test: `packages/core/src/view/facetView.test.js`

- [ ] Add a debugging-layout test that the child view appears once per visible facet cell with different coordinates.
- [ ] Add a test that `firstFacet` is true only for the first rendered visible cell.
- [ ] Implement `FacetView.render(...)` with:
  - visible-cell culling,
  - repeated background rendering,
  - repeated grid line rendering,
  - repeated child rendering with `facetId`,
  - repeated axis rendering,
  - repeated background stroke rendering,
  - header rendering.
- [ ] Keep local legends rendered once for the whole `FacetView`; if tests show misleading placement, reject faceted child legends with a clear error.
- [ ] Run the focused test.
- [ ] Commit with:

```bash
git commit -m "feat(core): render repeated facet cells"
```

## Task 9: Validate Shared Scale and Axis Limitations

**Files:**

- Modify: `packages/core/src/view/facetView.js`
- Test: `packages/core/src/view/facetView.test.js`

- [ ] Add tests that `resolve.scale.x = "independent"` and `resolve.axis.x = "independent"` under a facet throw clear errors.
- [ ] Add tests that nested immediate `facet` children throw a clear error.
- [ ] Implement validation after the child is created and before axes are created.
- [ ] Use the existing resolution APIs; do not inspect raw spec only.
- [ ] Run the focused test.
- [ ] Commit with:

```bash
git commit -m "feat(core): validate initial facet limitations"
```

## Task 10: Add Integration Specs for Former Private Examples

**Files:**

- Create: `examples/core/facet/anscombe_wrapped.json`
- Create: `examples/core/facet/cars_matrix.json`
- Test: `packages/core/src/view/facetView.test.js`

- [ ] Convert `private/facet.json` into a committed core example with relative data URL preserved.
- [ ] Convert `private/facet2.json` into a committed core example with relative data URL preserved.
- [ ] Add tests that load both examples and produce stable layout snapshots.
- [ ] Run the focused test.
- [ ] Commit with:

```bash
git commit -m "test(core): cover restored facet examples"
```

## Task 11: Update Spec Types and User-Facing Docs

**Files:**

- Modify: `packages/core/src/spec/view.d.ts`
- Create: `docs/grammar/facet.md` if no facet page exists.
- Modify: the existing docs facet page instead of creating `docs/grammar/facet.md` if the docs tree already has a dedicated facet page.
- Test: `npm run build`
- Test: `npm run build:docs`

- [ ] Replace `facet: any` in `FacetSpec`.
- [ ] Document that initial facets use shared scales and axes.
- [ ] Document `columns` as valid for one-dimensional column facets only.
- [ ] Add one docs example only after the implementation is passing.
- [ ] If schema/docs artifacts fail due missing generated schema, run:

```bash
npm run build
npm run build:docs
```

- [ ] Commit with:

```bash
git commit -m "docs(core): document initial facet support"
```

## Task 12: Final Verification

**Files:**

- No planned source edits unless verification finds a defect.

- [ ] Run focused tests:

```bash
npx vitest run packages/core/src/view/facetView.test.js
```

- [ ] Run nearby regression tests:

```bash
npx vitest run packages/core/src/view/gridView/gridView.test.js
npx vitest run packages/core/src/view/layoutSnapshot.test.js
```

- [ ] Run workspace type checks:

```bash
npm --workspaces run test:tsc --if-present
```

- [ ] Run lint:

```bash
npm run lint
```

- [ ] Run the full suite before merging:

```bash
npm test
```

- [ ] Inspect the diff:

```bash
git diff --stat
git diff
```

- [ ] Commit any verification fixes with a message matching the changed area, or leave no extra commit if no fixes were needed.

## Known Risks and Decisions

- Header rendering needs dynamic data. Use the established `InlineSource.updateDynamicData(...)` pattern rather than restoring `UnitView.updateData()`.
- `FacetView` size depends on data-loaded facet keys. Lazy collector observers plus `requestLayoutReflow()` are required so the viewport updates after data arrives.
- Repeated axes are acceptable only because the initial contract is shared scales and shared axes.
- Per-cell legends are not part of the first version. Render legends once for the whole `FacetView`; if a faceted child configures a legend orientation that cannot be placed clearly at the facet-view level, throw `FacetView currently supports only facet-level shared legends.`
- Interval selections under repeated facets may need facet-aware selection state. Reject them initially if they are not already correct.
- `DebuggingViewRenderingContext` currently deduplicates repeated views only when name and coords match. Facet cells have different coords, so layout snapshots can verify repeated rendering.

## Completion Criteria

The feature is operational when:

- A root facet spec is accepted and implicitly wrapped by `GridView`.
- `private/facet.json` and `private/facet2.json`, or committed equivalents, render through tests.
- The child subtree is created once regardless of facet count.
- Mark rendering receives correct array `facetId` values.
- `viewportHeight` produces a scrollable full facet grid through the parent `GridView`.
- Shared axes render repeatedly in visible facet cells.
- Row/column headers render distinct labels.
- Focused tests, nearby layout/grid tests, type checks, lint, and full tests pass.

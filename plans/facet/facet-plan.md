# Facet View Implementation Plan

The current scope, simplification review, and remaining correctness work are in
[facet-compatibility.md](facet-compatibility.md).
The completed interaction and dataflow implementations are recorded in
[facet-interactions.md](facet-interactions.md) and [facet-dataflow.md](facet-dataflow.md).
The restoration tasks below are historical and do not prescribe the current workflow.

**Goal:** Restore `facet` specs by implementing a modern `FacetView` that repeats one child view over many facet cells without creating one child view per facet.

The user clarified the target on 2026-10-10: a plot can be repeated for
different categories with predictable data, layout, and interactions. Full
Vega-Lite facet compatibility is not a goal. Shared domains, outer axes,
ascending category order, and simple value labels are sufficient defaults.

**Architecture:** `FacetView` remains a specialized `ContainerView`, not a `GridView` subclass. It owns one heavy child view and one `GridChild` chrome wrapper, computes lightweight facet-cell instances with the existing `Grid` and flex layout helpers, and renders the same child/chrome repeatedly with different `facetId` options. A parent `GridView`, including the implicit root wrapper, owns viewport scrolling through `viewportHeight` and `viewportWidth`.

**Tech Stack:** JavaScript with JSDoc types, existing GenomeSpy view/dataflow APIs, `Grid`, `flexLayout`, `GridChild`, `InlineSource.updateDynamicData`, Vitest layout snapshots.

---

## Current Status and Remaining Work (2026-10-10)

### Shared outer axes (authorized follow-up)

Replace repeated per-cell axes with outer axes using GridView's existing axis
views and arrangement path. This supersedes the earlier decision to defer outer
axes; independent scales and axes remain outside scope. Keep one repeated child
and one set of guide views, with grid lines in every cell.

- [x] Extract GridView's edge selection into a shared helper. The bottom axis
  follows the last occupied cell in each column, and the right axis follows the
  last occupied cell in each row, including incomplete wrapped rows. Reuse the
  helper for GridView's axis placement and legend offsets.
- [x] Let the existing GridChild arrangement and overhang calculation use the
  axes selected for a placement. Facet tracks reserve the largest applicable
  chrome overhang, preserving equal plot spans and child titles while removing
  interior axis reservations. Avoid another axis ownership or rendering system.
- [x] Verify all four orientations, ragged wrapping, matrix empty combinations,
  dynamic membership, hidden headers, per-cell grid lines, titles, legends, and
  scrolling through real layout/SVG paths. Axes scroll with the complete grid
  and are clipped by its enclosing viewport; they do not jump to visible cells.
- [x] Exercise the Anscombe example and a wrapped, scrollable grid in WebGL and
  Canvas, including picking and shared pan/zoom after scrolling. Run focused
  facet/GridView/layout tests, TypeScript, lint, and release checks. Measure the
  runtime diff against `a0a7f0a51` (four main layout files: 3,300 physical lines).
- [x] Update the grammar comparison and existing facet changeset. Commit this
  feature separately as `feat(core): share outer axes across facet cells`.

Verification: focused facet, interaction, GridView, and SVG suites pass (202
tests), as does the full suite (518 files, 4,852 passed, one skipped, two todo).
Workspace TypeScript, lint, generated documentation checks, and release checks
pass. Browser checks in WebGL and Canvas confirm the complete Anscombe quartet
with two x axes and two y axes, plus picking, tooltips, point selection, shared
wheel zoom, and mouse pan after scrolling a five-cell wrapped grid in both
directions. SVG checks cover all orientations, moving exposed edges after data
replacement, per-cell grid lines, fixed plot dimensions, title repetition, and
axis clipping. Clearing facet-owned axis coordinates before arrangement avoids
retaining cells when an axis moves out of view or changes its outer placement.

Size against `a0a7f0a51`: FacetView 621→643, facetLayout 227→230,
gridChildArrangement 396→427, GridView 2,056→2,021, and GridChild 1,066→1,071
physical lines. The four main files grow 3,300→3,321; including GridChild, the
runtime total is 4,366→4,392 (**net +26 physical lines**). The shared helper
replaces both GridView edge predicates, and the existing guide views, clipping,
paint queue, and title geometry are reused. No per-cell guide instances,
resolution, or persistent placement cache is introduced. The existing Core
minor changeset covers this feature (next fixed-group release: 1.2.0).

### Follow-up: collapsed documentation example

The reported `anscombe-wrapped.json` page collapses to a 20-pixel canvas.
Before data initialization, an empty facet grid loses its child's flexible
growth. Browser startup consequently disables container growth and resize
observation. Fully initialized headless layout checks missed this lifecycle
contract. The documentation sample also contains only one point per series.

- [x] Preserve flexible dimensions while facet categories are unavailable.
      Keep fixed empty dimensions at zero. Cover sizing before and after real
      data initialization and verify the original browser URL with both WebGL and
      Canvas. Commit: `fix(core): preserve flexible facet sizing before data loads`.
      Verified the unchanged reported sample at 1280×680 and resized Canvas at
      900×560, with four visible cells and no browser errors. Facet/GridView tests
      pass (166 tests); the sizing fix adds five physical runtime lines (222→227).
- [x] Replace the documentation sample with the full local `vega-datasets`
      Anscombe quartet and sensible fixed cell dimensions. Record provenance beside
      the example and verify four rendered plots with eleven points each. Commit:
      `docs(core): show the complete Anscombe quartet in the facet example`.
      Verified the actual documentation spec through URL loading and SVG output
      (11 points per cell, labels I–IV), schema validation, and visible WebGL/Canvas
      output at the reported URL. The example uses 200×150-pixel plots.

### Small compatibility additions (authorized follow-up)

Baseline: `70533c581`. Implement four small options while retaining one child,
the static batched dataflow, and existing grid chrome. This supersedes the
historical decision to defer all ordering and header configuration. Field
titles, independent domains, and a general header framework remain outside
scope. Outer axes are covered by the later follow-up above.

- [x] **Category ordering** — Add `sort: "ascending" | "descending" | Scalar[]`
  to facet fields. Default to ascending; explicit arrays place present listed
  values first, then other values in input encounter order. Do not invent cells
  for absent array entries. Apply ordering independently to rows and columns,
  including after data replacement. Reject unsupported sort forms. Verify real
  collector-to-cell/header output and schema acceptance. Update grammar docs and
  the existing feature changeset. Commit: `feat(core): support facet category ordering`.
- [x] **Header visibility** — Support `header: null` and
  `header: {labels: false}` without reserving a header band or its gap. Preserve
  matrix orientation, empty combinations, wrapped layouts, axes, and child
  titles. Verify rendered layout and SVG output with hidden row and column
  headers. Update types, docs, and changeset. Commit:
  `feat(core): support hiding facet headers`.
- [x] **Numeric header formatting** — Add `header.format` using D3 number
  formatting compiled once per header. Format numeric labels only; preserve
  category identity, ordering, and nonnumeric labels. Reject invalid format
  specifications clearly. Verify SVG labels and unchanged underlying facet
  keys. Update types, docs, and changeset. Commit:
  `feat(core): format numeric facet labels`.
- [x] **Separate spacing** — Accept `spacing: {row, column}` alongside numbers.
  Each omitted direction defaults to 10 pixels; zero removes the gap. Require
  finite nonnegative values. Use the same directional gaps in sizing,
  arrangement, and header placement. Verify matrix and wrapped geometry,
  schema, and interaction routing with asymmetric gaps. Update docs and
  changeset. Commit: `feat(core): support directional facet spacing`.

Final integration: run focused facet/dataflow/SVG/schema tests, workspace
TypeScript, lint, Core build/schema generation, and release checks. Exercise
combined options with picking, tooltips, and shared pan/zoom in WebGL and
Canvas. Measure the three facet runtime files before and after (baseline 819
physical lines) and inspect added machinery for opportunities to simplify.

Compatibility references: local Vega-Lite `src/spec/facet.ts`,
`src/compile/header/parse.ts`, `src/header.ts`, and `src/spec/base.ts` at the
revision recorded in [facet-compatibility.md](facet-compatibility.md). Adopt
the small public contracts, without copying compiler code. Aggregate/field
sorts, time formatting, arbitrary header styling, and `labelExpr` remain deferred.

Final inspection found that nested collector grouping visited all combinations
of the first row category before the next row. This can change the encounter
order of unlisted column values in an explicit sort array. Fixed in `57f250258`:
one Map traversal preserves group first-occurrence order and retains batch
publication, membership, and file provenance. The real matrix regression now
covers interleaved rows; collector/dataflow checks pass.

Completion: all four additions are committed separately. The full suite passes
(518 files, 4,844 tests, one skipped, two todo), as do workspace TypeScript,
lint, Core build/schema/declarations, generated documentation checks, and
release checks. Four combined-option browser cases cover wrapped and matrix
facets in WebGL and Canvas: picking, tooltips, point selection, shared wheel
zoom, and mouse pan. Screenshots confirm numeric formatting, requested order,
asymmetric gaps, and removal of the row-header gutter. The existing Core minor
changeset includes the additions.
Anscombe wrapped, cars matrix, and per-facet means also pass smoke checks in
both renderers after the grouping correction.

Size against `70533c581`: FacetView 520→621, facetLayout 206→222, and
facetHeaderView 93→103 physical lines (819→946 total). Collector changes from
680→681 lines while consolidating single/compound grouping paths. Parser-based
runtime JavaScript count across these four files adds 149/deletes 39, **net
+110 production lines**, excluding tests, declarations, comments, and blank
lines. Growth implements the requested options and boundary validation; no
per-cell objects, dataflow branches, header framework, or new cache is added.

Category repetition, supported child transforms, shared legends, picking,
tooltips, and shared-scale navigation are implemented through one static child
subtree. The independent simplification review's correctness issues are fixed,
unsupported options fail clearly, and the consolidation pass is complete.
The acceptance results and review are in [facet-compatibility.md](facet-compatibility.md).
Vega-Lite differences are recorded as optional capabilities rather than
requirements. The restoration investigation and checklists below are historical.

| Capability | Verified status |
| --- | --- |
| Single-field, row-only, column-only, and wrapped facets | Working |
| Faceted unit and layered plots | Working |
| Shared positional scale domains | Working |
| Shared outer axes | Working; one per occupied column/row, including incomplete wrapped rows |
| Matrix layout, including empty row/column combinations | Working |
| Dynamic factor membership and labels | Working |
| Raw value labels, repeated child titles, backgrounds, clipping, and visible-cell culling | Working |
| Child transforms evaluated separately for each facet | Working for supported transforms; see scope below |
| Default shared color legend | Working; one legend beside the complete grid |
| Cell routing, picking, tooltips, and shared point/interval selections | Working |
| Shared-scale wheel zoom, mouse pan, and touch gesture routing | Working |
| Interactions after scrolling a facet viewport | Working in WebGL and Canvas |
| Independent axes per cell | Unsupported and rejected |
| Independent positional scale domains | Unsupported and rejected; intentionally outside the current scope |
| Independent non-positional scales and legends per cell | Unsupported and rejected; layer independence remains supported |
| Custom facet ordering | Working: ascending, descending, and explicit arrays |
| Facet field titles and configurable headers | Visibility and numeric formatting work; field titles remain unsupported |
| Facet-field bin/time-unit definitions | Optional; precomputed category fields are sufficient |
| Rulers in repeated cells | Fixed; one controller uses the pointed cell and retains drag projection |
| Hover transitions after layout refresh | Fixed; facet tuples are compared by value |
| Removing a facet during a brush drag | Fixed; controller cleanup precedes parameter disposal |
| Child viewport options | Rejected clearly; container viewport scrolling remains supported |

### Completed validation fixes

- Independent positional resolution validation now covers the facet declaration
  itself as well as unit and layer children. Previously an unsupported
  `resolve.scale` or `resolve.axis` on the facet was silently accepted.
- Wrapping `columns` must now be a positive integer. Zero, negative, fractional,
  and non-finite counts fail before layout; the generated JSON Schema also
  enforces positive integer counts. Omitting `columns` still gives one row.

### Child transforms: fixed with static facet batches

`flowBuilder.js` now groups input after the outer facet transforms and before
child transforms. Terminal collectors retain facet batch identity rather than
regrouping by possibly removed fields. The A/B mean example now produces 2 and
15 without repeating `g` in `groupby`; stack restarts at zero in each facet.

Aggregate, window, stack, sample, pileup, coverage, set intersection, and self
lookup honor the logical partition. Physical file boundaries preserve row
shapes through buffering, grouping, sorting, and replay without restarting a
facet's reduction. Identifiers remain unique across facets.

The input collector owns membership, so child filters retain empty cells and
an ungrouped count can produce zero. Facet fields are not implicitly restored
after aggregate/project. Child-owned data repeats in every input cell; foreign
relations keep their own scope. Explicit `collect.groupby` and unaudited
placement transforms reject inherited facet data with clear errors.

The [dataflow plan](facet-dataflow.md) records the selected contract, alternatives,
optimizer TODOs, verification, and remaining scope. Correctness uses one static
operator graph and does not require optimizer improvements or dynamic branches.

### Shared legends: fixed

The missing legend was caused by `getLegendOwners(...)` in
`packages/core/src/view/gridView/gridChild.js` omitting facet views. It now
includes the facet view's legend resolutions, so the parent's existing
`GridChild` renders and reserves space for one shared legend beside the whole
grid. No per-cell legend host or additional layout path is needed.

SVG regressions cover a wrapped unit facet and a layered facet inside a concat,
including category labels, one rendered legend, and space before the next plot.

### Cell interactions and shared navigation: implemented

`FacetView` routes input through visible cell bounds into its shared child.
Events and mark hits retain the facet tuple; enter/leave transitions distinguish
cells. Point selections share the child runtime, and interval brushes project
through their initiating cell. Mark hits and custom tooltip contexts expose
`facetId`, including for child-owned data repeated in multiple cells.

The parent grid owns pan/zoom and drag-scroll sessions. It uses the pointed
cell's full plot bounds and updates each shared resolution once. Scrolling
refreshes layouts containing facets, so newly visible cells acquire current
rendering and picking geometry. Optimization TODOs and detailed verification
are recorded in [facet-interactions.md](facet-interactions.md).

### Completed restoration acceptance

- [x] Correct per-facet child transform semantics. Cover aggregate and stack
  with the A/B example, row/column tuple groups, and a layered child. Verify
  outer transforms retain their intended scope and repeated marks receive the
  correct facet batches without creating a subtree per cell.
- [x] Render one shared color legend for the whole facet view. Verify its
  entries, placement, size reservation, and behavior inside an enclosing concat.
- [x] Route interactions to the pointed cell with the correct facet identity
  and coordinates. Verify representative click/selection and shared-scale
  pan/zoom behavior across multiple cells in a browser, including a scrolled
  facet viewport.
- [x] Re-run the wrapped Anscombe and cars matrix examples through WebGL and
  Canvas; use focused SVG assertions for grouped marks, guides, and clipping.
  Add durable regression tests for the semantic gaps above.
- [x] Record the supported subset and remaining compatibility differences.
  The narrowed scope and independent review below supersede the original
  compatibility roadmap.

### Completed correctness and simplification work

The completion pass fixes lifecycle and interaction issues, rejects unsupported
options, and reduces duplicated layout code. It retains the existing static
batched flow, one repeated child, and shared grid chrome. No new scale instance
system, header framework, or Vega-Lite normalization layer was introduced.

- [x] Dispose the facet-owned inner `GridChild`, including active brush/ruler
  sessions, when the facet is removed. Cancel listeners before their parameter
  runtime is destroyed.
- [x] Route rulers through the pointed cell's coordinates, install one logical
  controller, and prevent old-cell leave events from clearing the new value.
- [x] Compare facet tuples by value when synthesizing hover transitions, so
  rebuilding layout metadata does not imply entering another category.
- [x] Reject child viewport options rather than compressing content; use the
  supported viewport on the facet container.
- [x] Reject unsupported per-cell non-positional scale/legend resolution with a
  clear error. Preserve legitimate independence between layers.
- [x] Resolve the unused facet field `title` contract without adding a general
  header API: use existing title machinery if small, or narrow the facet type.
- [x] Consolidate point-to-cell projection, remove unused layout parameters,
  avoid redundant clipping/copies, and trim implementation-detail test overlap
  where the independent review identifies concrete savings.
- [x] Avoid republishing unchanged facet header positions and text.
- [x] Discard sorting/header/outer-axis/independent-domain milestones as
  prerequisites for completion. These remain optional future capabilities.
- [x] Verify the completion pass with the full unit suite, workspace TypeScript,
  lint, Core build/schema/declarations, release checks, and representative
  browser input and example checks in WebGL and Canvas.

The [review and completion plan](facet-compatibility.md) records findings,
measurements, concrete follow-ups, and verification. Keep current examples and
supported interactions predictable; optimizer improvements and full Vega-Lite
behavior are outside this work.

Completion verification: 518 test files and 4,806 tests pass (one skipped,
two todo). Fourteen browser scenarios cover picking, tooltips, shared point
selection, pan/zoom, viewport scrolling, inherited/child-owned rulers, stable
hover after layout refresh, brushes, and subtree removal during active drags.
Anscombe wrapped, cars matrix, and means pass in both renderers. All review
fixes and the simplification/header-update changes are committed separately.

Verification for the static dataflow implementation includes the full unit
suite, workspace TypeScript checks, lint, Core build, release checks, and schema
validation. Focused regressions cover mixed transforms, reactive and foreign
updates, lazy multi-file replacement, empty cells, shared domains, graph size,
disposal, and SVG output after aggregates drop facet fields. WebGL and Canvas
smoke checks cover Anscombe, cars, the means example, and transformed variants.
Detailed counts and measurements are recorded in the dataflow plan.

## Original Restoration Investigation (Historical)

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

# SVG Export Proof-of-Concept Plan

## Status

Proposed proof of concept. This plan intentionally stops before designing a
production-ready SVG renderer or hybrid vector/raster export system.

## Summary

Implement a small SVG export path that demonstrates that GenomeSpy can export
simple plots as editable vector graphics while preserving the rendered view
hierarchy. The proof of concept will support enough of the existing fundamental
marks to render ordinary axes, titles, points, bars, and labels from a small set
of existing examples.

The proof of concept should answer these questions before advanced export
features are designed:

1. Can the existing `ViewRenderingContext` traversal produce an SVG group tree
   that follows the rendered view hierarchy and draw order?
2. Can the existing CPU encoders and resolved Vega/D3 scales place basic marks
   consistently with WebGL?
3. Can generated axes and titles be emitted using the same basic mark exporters
   as authored unit views?
4. Is the resulting SVG structurally useful in a vector editor, not merely
   visually similar in a browser?

## Goals

- Add a Core API that exports the current visualization as standalone SVG.
- Represent each rendered view occurrence as a nested SVG `<g>` element.
- Export simple axis-aligned rectangles, circular points, straight rules/ticks,
  and text as native SVG elements.
- Reuse the existing CPU encoders and resolved scale instances instead of
  implementing another scale system.
- Render ordinary axes, grid lines, titles, subtitles, and simple data labels.
- Preserve the current logical export dimensions, layout, draw order, clipping,
  and the state of resolved scale domains.
- Establish focused structural and visual tests that can guide later work.

## Non-goals

The proof of concept will not design or implement:

- Automatic or explicit rasterization of dense views.
- A complete SVG representation of every mark property.
- Link or arrow marks.
- Non-circular point shapes, point rotation, semantic zoom, geometric zoom, or
  point fill gradients.
- Rounded rectangles, hatching, shadows, or other SVG filter/pattern effects.
- Text fitting, squeezing, flushing, viewport-edge fading, sequence logos, or
  exact glyph-level parity with the SDF renderer.
- Sample-facet texture placement, general faceting, scrolling, rulers,
  selections, picking, transitions, or interactive SVG.
- Font embedding or conversion of text to paths.
- Optimizing SVG size or supporting tens of thousands of SVG elements.
- App UI changes such as adding SVG to the Save Image dialog.
- A public specification property for selecting vector or raster output.

These areas should be designed only after the proof of concept has established
the basic rendering contract and revealed the actual parity problems.

## Current implementation findings

### View traversal already exposes the required hierarchy

`UnitView`, `LayerView`, `GridView`, `FacetView`, title views, and legend views
render through `ViewRenderingContext.pushView()`, `renderMark()`, and
`popView()`. The old
[`svgViewRenderingContext.js`](../../packages/core/src/view/renderingContext/svgViewRenderingContext.js)
already demonstrates a stack of SVG groups, although it emits only placeholder
graphics.

The proof of concept should replace the placeholder behavior while retaining
the stack-based idea. It should not introduce a second traversal of the view
tree.

### CPU encoders already apply the resolved scales

`createEncoder()` in
[`encoder.js`](../../packages/core/src/encoder/encoder.js) returns a function
that reads a datum and invokes the resolved Vega/D3 scale. SVG mark emitters can
therefore call the existing mark encoders directly. They should not parse,
transpile, or duplicate the generated GLSL scale functions.

The current renderer uses GLSL. WGSL is relevant to a future WebGPU migration,
not to the current proof of concept.

### Mark data remains available through collectors

Each unit view exposes its collector and its facet batches. For the proof of
concept, a mark emitter can select either the non-faceted batch or the batch
identified by `RenderingOptions.facetId`, following the same choice made by the
WebGL render callback. General facet and visible-range optimization can be
deferred, but the helper that selects a batch should fail clearly for an
unsupported rendering mode.

## Comparable designs and provenance

The high-level design follows established renderer patterns without copying
their source code:

- [Vega](https://vega.github.io/vega/docs/api/view/) can render the same
  hierarchical scenegraph through Canvas or SVG renderers. Its scenegraph uses
  group marks as containers for nested marks. This supports keeping GenomeSpy's
  rendering traversal backend-independent at the context boundary.
- [Matplotlib's mixed-mode renderer](https://matplotlib.org/stable/gallery/misc/rasterization_demo.html)
  shows how dense artists can later be rasterized while surrounding axes and
  text remain vector graphics. Rasterization is deliberately postponed until
  after this proof of concept.

Vega is BSD-3-Clause licensed and Matplotlib uses its PSF-based license. No code
will be copied or closely adapted during the proof of concept; these are design
references only.

## Proof-of-concept architecture

### Export entry point

Add an asynchronous, options-based Core method with a deliberately small
surface, for example:

```js
const svg = await genomeSpy.exportSvg({
    logicalWidth,
    logicalHeight,
    background: "white",
});
```

The proof of concept may return an `SVGSVGElement` or serialized SVG string
internally, but the externally useful result should be a `Blob` with the
`image/svg+xml` media type. Keeping the method asynchronous leaves room for
later resource and raster embedding without changing its return type.

The export should render with the requested logical dimensions and then restore
the normal canvas layout, matching the cleanup behavior of `exportCanvas()`.

### SVG rendering context

Extend `SvgViewRenderingContext` to own:

- The root `<svg>` element with `xmlns`, `width`, `height`, and `viewBox`.
- A root `<defs>` element for clip paths.
- A stack of current `<g>` nodes.
- A parallel stack of current view coordinates.
- Stable unique IDs for groups and definitions within one export.

Each `pushView()` creates a group with editor-friendly metadata:

```xml
<g id="view-7" data-view-name="Bar" data-view-path="root/Bar">
  <title>root/Bar</title>
  ...
</g>
```

IDs are export-local and unique. Authored names and paths remain intact in
`data-*` attributes. A repeated rendered occurrence, such as a future facet,
must eventually receive its own group even if it refers to the same View
instance.

The context must not call `view.onBeforeRender()` itself. The normal rendering
pipeline is responsible for view lifecycle, and an export should not initialize
the same view repeatedly.

### Mark emission contract

Add a mark-level method such as `emitSvg(svgContext, options)`. The base `Mark`
implementation should throw an explicit unsupported-mark error. The four
proof-of-concept mark classes override it.

The SVG context supplies the current group, view coordinates, clip definition,
and coordinate projection helpers. Mark classes retain responsibility for the
geometry and presentation semantics of their own mark type. This avoids a
central switch that would duplicate mark knowledge.

Add small shared CPU helpers only when they represent renderer-independent
semantics. Do not move large shader implementations into JavaScript merely to
make the proof of concept pixel-identical.

### Coordinates

Position encoders produce unit-space values. Convert them to top-left-origin SVG
coordinates using shared helpers equivalent to:

```text
svgX = coords.x + unitX * coords.width
svgY = coords.y + (1 - unitY) * coords.height
```

Pixel-valued offsets are applied after projection. Preserve the existing
half-pixel alignment for rules and ticks where it affects crisp placement.

The proof of concept should test linear and band/index placement through real
examples rather than introducing a generalized projection abstraction.

### Clipping

Reuse `normalizeClipOptions()` and `prepareMarkClipOptionsFromClip()` to compute
the final clip for a mark. Emit rectangular `<clipPath>` definitions and attach
them to the mark group. Full x/y clipping is required for the proof of concept.
Directional x-only or y-only clips may be represented using the root export
bounds for the unrestricted dimension.

## Initially supported mark features

### Rect

Support:

- `x`, `x2`, `y`, and `y2`, including endpoints supplied by fixed/default
  encodings.
- Linear, band, and index scale output provided by the existing encoders.
- Axis-aligned `<rect>` geometry with sorted endpoints.
- Constant or encoded `fill`, `stroke`, `fillOpacity`, `strokeOpacity`, and
  `strokeWidth`.
- Effective view opacity folded into the element opacity exactly once.

Defer corner radii, minimum-size opacity compensation, hatching, shadows, and
all fragment-shader effects.

### Point

Support:

- Per-datum `x` and `y` positions.
- The default circular shape only, emitted as `<circle>`.
- Constant/default point size, converted from GenomeSpy's area-based `size` to
  a circle radius.
- Basic fill, stroke, fill/stroke opacity, and stroke width.

Encoded size, shape, angle, geometric/semantic zoom, gradients, and sub-pixel
opacity compensation are deferred. Encountering a non-circular shape should
produce an explicit unsupported-feature error rather than silently drawing the
wrong symbol.

### Rule and tick

Support:

- Straight `x`/`y` to `x2`/`y2` geometry emitted as `<line>`.
- Color, opacity, and size/stroke width.
- Butt and square line caps used by ordinary axes, ticks, and grid lines.
- The ordinary tick encoding generated for axes.

Defer dash arrays, dash offsets, round caps, and minimum-length
adjustments unless one of the selected examples proves that a generated guide
requires them.

### Text

Support:

- Plain `<text>` elements for axis labels, axis titles, view titles, subtitles,
  and simple data labels.
- Text value/formatting through the existing text encoder and formatter.
- Position, color, opacity, font size, horizontal alignment, baseline, `dx`,
  `dy`, and simple rotation.
- Existing SDF font metrics for layout measurements. Use the loaded
  `TextMark.font.metrics`, including `measureWidth`, cap height, and descent,
  when computing GenomeSpy's anchor or bounding geometry.
- `font-family="sans-serif"` in the SVG output regardless of the SDF font
  family. Exact glyph metrics and line breaks are not acceptance requirements
  for the proof of concept.

The mismatch between SDF measurements and the selected system sans-serif font
must be documented in the exported API and tests should use positional
tolerances rather than glyph-outline comparisons.

Defer ranged text, `fitToBand`, `squeeze`, `flushX`/`flushY`, padding,
viewport-edge fading, sequence logos, and embedded fonts.

## Selected example specifications

Use existing examples unchanged as the primary testing material.

### 1. Minimal smoke test

[`examples/core/first.json`](../../examples/core/first.json)

Why:

- Smallest existing point plot.
- Exercises quantitative x/y encoders, generated axes, ticks, grid lines, and
  axis labels.
- Uses the small local `data/sincos.csv` fixture.
- Is already the recommended first browser smoke test for the repository.

Expected proof: a browser or vector editor opens a standalone SVG containing
nested groups, circular point elements, and vector guide elements.

### 2. Titles and subtitles

[`examples/docs/grammar/title/basic-title.json`](../../examples/docs/grammar/title/basic-title.json)

Why:

- Adds a view title and subtitle to the same simple point-and-axis structure.
- Exercises generated text hierarchy and title layout without composition,
  legends, or special styling.
- Reuses the same local data fixture as the smoke test.

Expected proof: title and subtitle appear as editable `<text>` elements and are
grouped separately from the plotted unit view where the runtime hierarchy does
so.

### 3. Rectangles, labels, and layers

[`examples/docs/grammar/composition/layer/bar-and-label-layer.json`](../../examples/docs/grammar/composition/layer/bar-and-label-layer.json)

Why:

- Uses a small inline dataset and has no network dependency.
- Exercises band and quantitative scales, rect coverage, and implicit bar
  baselines.
- Exercises a named two-member layer hierarchy.
- Adds plain data labels through a text mark.
- Retains ordinary axes while avoiding advanced mark effects.

Expected proof: bars and labels are editable native elements under named nested
groups, with axes aligned to the bars.

`examples/docs/grammar/mark/point/point-mark.json` is intentionally not an
initial acceptance fixture because its encoded point size is outside the narrow
point feature set. It is a natural first follow-up after the proof of concept.

## Verification strategy

### Structural tests

Add focused Vitest tests next to the SVG rendering context or export module.
Normalize generated IDs before snapshotting. Verify representative structure,
not every presentation attribute:

- Root dimensions and `viewBox`.
- Nested groups and view metadata.
- Presence and count of the expected `circle`, `rect`, `line`, and `text`
  elements.
- Draw order within the layered bar example.
- Clip-path references.
- No placeholder elements or embedded raster `<image>` elements.
- XML serialization can be parsed back into an SVG document.

### Geometry tests

Use small inline unit tests for projection and basic geometry:

- Unit-to-SVG x/y projection.
- Pixel offsets and half-pixel rule alignment.
- Rect endpoint sorting and band coverage.
- Point area-to-radius conversion.
- Text anchor/offset calculations based on SDF metrics.

### Browser visual checks

Use Playwright to load each selected example, invoke `exportSvg()`, insert or
open the exported SVG, and capture it. Compare it with the WebGL rendering using
a tolerant visual comparison or a concise manual checklist during the proof of
concept. Exact text glyph matching is excluded; layout, axes, and mark placement
must be recognizably aligned.

Also manually open at least the layered bar SVG in Inkscape or another vector
editor and confirm that:

- View and layer groups are visible in the object hierarchy.
- Bars, labels, axes, and titles are separately selectable.
- Text remains text.

### Regression checks

Run:

```sh
npx vitest run <focused SVG test files>
npm --workspaces run test:tsc --if-present
npm run lint
```

The full unit suite is appropriate before merging but is not required after
every proof-of-concept iteration.

## Implementation steps

### Step 1: Establish the SVG document and hierarchy

Outcome:

- Replace placeholder behavior in `SvgViewRenderingContext` with root document,
  group-stack, metadata, and serialization support.
- Add rectangular clipping support.
- Add a low-level export function that performs a render traversal at requested
  logical dimensions.

Affected areas:

- `packages/core/src/view/renderingContext/`
- `packages/core/src/genomeSpy/`
- `packages/core/src/types/rendering.d.ts`

Verification:

- Structural unit test with a synthetic nested view.
- Confirm balanced group nesting and stable draw order.

Documentation and migration:

- Internal only at this step; no migration.

Tentative commit:

`feat(core): establish hierarchical SVG export context`

### Step 2: Add rule/tick and text emission for guides

Outcome:

- Render the generated axes and title hierarchy from the first two selected
  examples.
- Use SDF metrics for placement and plain sans-serif SVG text.

Affected areas:

- `packages/core/src/marks/mark.js`
- `packages/core/src/marks/rule.js`
- `packages/core/src/marks/text.js`
- Small shared SVG/projection helpers under `packages/core/src/`

Verification:

- Focused geometry and SVG snapshot tests.
- Browser check of axes, title, and subtitle without the data point layer yet.

Documentation and migration:

- Record the temporary font-metric mismatch in the proof-of-concept API docs or
  JSDoc.

Tentative commit:

`feat(core): emit guide rules and text in SVG exports`

### Step 3: Add circular points and basic rectangles

Outcome:

- Complete the three selected example exports with native circles and rects.
- Support the basic fill/stroke/opacity channels needed by those examples.

Affected areas:

- `packages/core/src/marks/point.js`
- `packages/core/src/marks/rect.js`
- Shared SVG geometry helpers and tests

Verification:

- Structural snapshots for all selected examples.
- Browser comparison against WebGL.
- Manual vector-editor inspection of the layered bar example.

Documentation and migration:

- No specification migration. Document the supported proof-of-concept subset.

Tentative commit:

`feat(core): emit basic point and rect marks in SVG exports`

### Step 4: Expose and demonstrate the proof-of-concept API

Outcome:

- Add `GenomeSpy.exportSvg()` with the minimal options-based API.
- Provide a development-only invocation or test helper that downloads the
  result; do not modify the App Save Image dialog yet.
- Record observed parity issues and element counts for the three fixtures.

Affected areas:

- `packages/core/src/genomeSpyBase.js`
- Core API typings and exports
- Focused test/browser utilities
- Developer-facing proof-of-concept notes

Verification:

- All three selected examples export without unsupported-feature errors.
- The returned Blob is standalone and has the correct media type.
- Normal canvas layout and rendering are restored after export.

Documentation and migration:

- Clearly label the API experimental until the advanced design is complete.
- No user specification migration.

Tentative commit:

`feat(core): expose experimental SVG export API`

### Step 5: Evaluate before advanced design

Outcome:

- Summarize implementation complexity, visual differences, output structure,
  file size, and export time.
- Decide whether mark-level emission remains the right abstraction.
- Use the findings to write a separate production design for advanced mark
  features, text fidelity, rasterization, and App integration.

Affected areas:

- A follow-up plan under `plans/svg-export/`.

Verification:

- Review the proof-of-concept acceptance criteria and recorded limitations.

Documentation and migration:

- None until a production design is accepted.

Tentative commit:

`docs: evaluate SVG export proof of concept`

## Alternatives considered

### Build an intermediate scenegraph first

Rejected for the proof of concept. It may become useful for multiple export
backends, but the current rendering-context traversal already supplies hierarchy
and draw order. Introducing a full scenegraph before validating basic emission
would make the experiment larger without answering a new feasibility question.

### Translate GenomeSpy views into Vega and use Vega's SVG renderer

Rejected. GenomeSpy's resolved layouts, custom genomic scales, mark semantics,
and generated guide views would still need translation. Directly using the
existing runtime encoders and hierarchy is smaller and tests the architecture
that a production exporter would most likely use.

### Design rasterization before emitting any vector marks

Rejected for this milestone. Rasterization is important for production, but it
does not help establish coordinate parity, editable hierarchy, or fundamental
mark emission. It should be designed using measurements from the working proof
of concept.

### Reconstruct SVG from the WebGL framebuffer

Rejected. A framebuffer contains pixels and has lost mark identities, data
boundaries, hierarchy, and editable text.

## Risks and mitigations

- **Text widths differ from the SDF renderer.** Use SDF metrics for placement,
  emit `sans-serif`, document the mismatch, and exclude glyph-perfect parity
  from acceptance.
- **SVG and WebGL use opposite y-axis conventions.** Centralize the two
  projection helpers and test known unit coordinates.
- **Generated axes rely on more mark behavior than expected.** Add only the
  smallest missing rule/text property required by the selected fixtures and
  record everything else for the later design.
- **View lifecycle is accidentally invoked twice.** Keep `pushView()` structural
  and rely on the existing render traversal for lifecycle and layout.
- **Opacity is multiplied twice through nested groups.** For the proof of
  concept, keep groups structural and apply the already resolved effective view
  opacity at the mark element level.
- **Unsupported features silently produce misleading output.** Fail fast with
  the view path, mark type, and unsupported property. The proof of concept is
  allowed to reject specs outside its declared subset.
- **DOM output becomes implementation-dependent and hard to test.** Define a
  small stable structural contract and normalize generated IDs in snapshots.

## Unresolved questions to answer during the proof of concept

- Should `emitSvg()` append directly to the DOM or return an iterable of SVG
  nodes? Start with direct append and revisit only if tests expose a need.
- Does the current half-pixel WebGL adjustment improve or harm exported vector
  rules at arbitrary zoom levels?
- Which generated axis properties beyond butt caps are exercised by the three
  fixtures?
- Is SDF-measured placement with `text-anchor` and `dominant-baseline`
  sufficiently stable across Chrome, Inkscape, and Illustrator?
- Should a production API return only a Blob, or additionally expose the SVG
  element/string for programmatic editing?

These questions should be answered with the working exports rather than settled
up front as part of the proof-of-concept architecture.

## Acceptance criteria

The proof of concept is successful when:

1. All three selected examples export to standalone SVG through a Core API.
2. Their rendered view hierarchy appears as nested, named `<g>` elements.
3. Axes and grid lines are native SVG lines and axis labels are native SVG text.
4. The title example contains editable title and subtitle text.
5. The first example contains native circular point elements in approximately
   the same positions as WebGL.
6. The layered bar example contains native rectangles and editable data labels
   in named layer groups, aligned with its axes.
7. Text layout uses existing SDF measurements while emitted elements specify
   plain `sans-serif`.
8. The proof-of-concept output contains no raster `<image>` elements.
9. Unsupported mark types and advanced properties fail with actionable errors.
10. Export does not alter subsequent interactive WebGL layout or rendering.
11. Focused structural, geometry, and browser checks pass.
12. A vector-editor inspection confirms that groups and graphical elements are
    independently editable.

Meeting these criteria authorizes a separate design phase for production SVG
export. It does not imply that arbitrary GenomeSpy specifications are supported.

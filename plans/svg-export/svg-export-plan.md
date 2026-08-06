# SVG Export Plan

## Status

The proof of concept is complete. GenomeSpy Core can export a standalone SVG,
and GenomeSpy App exposes the exporter through **Save SVG**. The output follows
the rendered view hierarchy using nested `<g>` elements and emits supported
marks as editable vector elements. Existing proof-of-concept examples, including
`complex_grid_layout2.json`, closely match the WebGL output apart from the
expected font difference.

Work can now proceed iteratively toward broader mark parity. Rasterization is
explicitly out of scope for this phase: unsupported features should either be
implemented as vector graphics or fail clearly instead of silently producing
incorrect output.

## Objective

Provide publication-quality SVG export that preserves GenomeSpy's layout,
scales, axes, titles, view hierarchy, and editable graphical elements. The SVG
renderer should reuse the existing view traversal, CPU encoders, and resolved
Vega/D3 scales so that it follows the same visualization state as WebGL. Mark
classes remain responsible for translating their own geometry and presentation
semantics into SVG.

Exact glyph-outline parity is not currently a goal. Text placement uses the SDF
font metrics used by WebGL, while the SVG contains editable plain
`sans-serif` text.

## Current implementation

The main implementation points are:

- [`svgViewRenderingContext.js`](../../packages/core/src/view/renderingContext/svgViewRenderingContext.js)
  constructs the SVG document, maintains the view-group stack, and creates
  reusable clip paths.
- [`mark.js`](../../packages/core/src/marks/mark.js) selects the data batch for
  SVG rendering and provides the fail-fast base implementation.
- [`svgMarkUtils.js`](../../packages/core/src/marks/svgMarkUtils.js) contains
  shared encoder and coordinate-projection helpers.
- Individual mark classes implement `renderSvg()`.
- [`svgExport.js`](../../packages/core/src/genomeSpy/svgExport.js) drives the
  export traversal. The public Core/embed APIs return an SVG Blob.
- Focused coverage lives in
  [`svgExport.test.js`](../../packages/core/src/genomeSpy/svgExport.test.js) and
  [`svgViewRenderingContext.test.js`](../../packages/core/src/view/renderingContext/svgViewRenderingContext.test.js).

The following features are working:

- Nested, editor-friendly view groups with view names and paths.
- Rectangular and directional clipping.
- Rules and ticks, including line caps and dash patterns.
- Plain text used by axes, titles, subtitles, and ordinary labels.
- Basic rectangles.
- Circular points, including encoded size and semantic-score filtering.
- Link marks as SVG paths for the supported link shapes.
- App download through the **Save SVG** toolbar action.

Known explicit rejections include non-circular point shapes, rounded/hatched/
shadowed rectangles, fitted and logo-letter text, arrow marks, link arc fading,
expression-valued link properties, and sample facets.

## Implementation principles

- Reuse the normal render traversal; do not build a second view-tree walker.
- Reuse mark encoders and resolved scales rather than duplicating scale logic.
- Keep SVG emission in the corresponding mark class.
- Port shader calculations to JavaScript only when they define visible mark
  semantics required for parity.
- Preserve draw order and the nested view-group structure.
- Fail fast with the mark type and view path when a feature is unsupported.
- Add focused structural and geometry tests for each increment, followed by a
  browser comparison against WebGL using a small existing example.
- Keep every increment independently reviewable and commit it separately.

## Next increments

### 1. Complete point-symbol support

Add square, diamond, triangles, ticks, cross, `x`, and `+`, including the
existing `angle` encoding. The supported shape vocabulary is centralized in
[`encoder.js`](../../packages/core/src/encoder/encoder.js). Emit circles and
squares using native elements where practical and use `<path>` for the remaining
symbols. Match the size conventions and geometry in `point.fragment.glsl`.

Keep point gradients, `inwardStroke`, and geometric-zoom-dependent geometry
out of this increment. Continue to apply semantic-score filtering as the current
circle exporter does.

Testing material:

- [`examples/core/marks/point/point.json`](../../examples/core/marks/point/point.json)
- [`examples/core/scales/parameterized_range_test.json`](../../examples/core/scales/parameterized_range_test.json)
- Shape legends under `examples/core/legends/`

Verification should cover every shape, rotation, encoded shape, and the
stroke-only behavior of `x` and `+`.

Tentative commit: `feat(core): export point symbols as SVG`

### 2. Match minimum-size geometry

SVG currently ignores rule `minLength` and rectangle `minWidth`, `minHeight`,
and `minOpacity`. Port the corresponding small vertex-shader calculations so
that short rules remain visible and narrow rectangles use the same centered
size expansion and opacity compensation as WebGL.

This is primarily a correctness increment: these properties must not produce a
plausible but geometrically different export.

Testing material:

- [`examples/core/marks/rule/rule_test.json`](../../examples/core/marks/rule/rule_test.json)
- A focused inline rectangle fixture exercising width, height, and opacity
  compensation

Tentative commit: `feat(core): preserve minimum mark sizes in SVG exports`

### 3. Add rounded rectangles

Support a constant uniform `cornerRadius` first using `<rect rx ry>`. Then add
the four independently configured corner radii using an SVG path. Clamp radii
the same way as the WebGL implementation when a rectangle is too small.

Mark properties may be expression-valued. If resolved expression values cannot
yet be obtained through a shared mechanism, land constant radii first and keep
expression-valued radii as an explicit rejection rather than embedding an
object as an SVG attribute.

Testing material:

- [`examples/core/layout/layer/rect.json`](../../examples/core/layout/layer/rect.json)
- [`examples/core/marks/rect/rect_with_params.json`](../../examples/core/marks/rect/rect_with_params.json)

Tentative commits:

- `feat(core): export uniformly rounded SVG rectangles`
- `feat(core): export per-corner rectangle radii as SVG paths`

### 4. Add basic ranged and fit-to-band text

Support ordinary text positioned within `x`/`x2` and `y`/`y2` ranges, followed
by `fitToBand`. Reuse the existing SDF measurements when determining fitting and
emit editable SVG text using `textLength` and `lengthAdjust` where appropriate.
The initial implementation should cover common heatmap labels and annotations.

Defer sequence-logo stretching, viewport-edge fading, and any behavior that
requires individual glyph geometry. Treat `squeeze`, flushing, and padding as
follow-up parity work if they cannot be implemented without substantially
expanding this increment.

Testing material:

- [`examples/core/layout/layer/heatmap_with_text.json`](../../examples/core/layout/layer/heatmap_with_text.json)
- A small inline ranged-text fixture

Tentative commit: `feat(core): export fitted text as SVG`

### 5. Add a basic arrow-mark subset

Arrow is the only fundamental mark type with no SVG implementation. Start with
one straight stem and one non-repeated triangle or open head. Support forward
and reverse directions, diagonal segments, fill/stroke styling, and constant
mark properties.

Do not initially attempt full shader parity. The WebGL arrow implementation also
handles short-arrow blunting, head notches, inside/outside placement, repeated
heads, band-relative sizing, and stemless heads. Add these in later commits once
the basic geometry has a stable test representation.

Testing material:

- [`examples/docs/grammar/mark/arrow/arrow-mark.json`](../../examples/docs/grammar/mark/arrow/arrow-mark.json)
- Focused fixtures from `examples/core/marks/arrow/`

Tentative commit: `feat(core): export basic arrow marks as SVG`

## Later vector-only work

These features remain desirable but are not the next low-hanging increments:

- Rectangle hatches using reusable SVG `<pattern>` definitions.
- Rectangle shadows using SVG filters.
- Full arrow geometry and repeated arrowheads.
- Link arc fading using SVG masks or gradients.
- Point gradients and inward strokes.
- Text squeezing, flushing, viewport-edge fading, and sequence-logo letters.
- A consistent way to resolve expression-valued mark properties for SVG.
- Sample-facet placement.
- SVG size and export-time diagnostics for very dense vector output.

Ordinary grammar faceting is not used by the project and should not be worked on
as part of SVG export. Rasterization and hybrid vector/raster output will be
designed separately if they become requirements.

## Verification and completion criteria

For each increment:

1. Add focused Vitest assertions for element structure and representative
   geometry. Avoid exhaustive snapshots of incidental attributes.
2. Export at least one listed example and compare mark placement with WebGL.
3. Confirm that unsupported variants fail with an actionable error.
4. Confirm that the SVG contains no raster `<image>` elements.
5. Run the focused SVG tests, workspace TypeScript checks, and lint.
6. Commit the completed increment before starting the next one.

The vector-only phase is complete when all fundamental mark types have a useful
SVG representation, common axes/titles/labels and mark properties match WebGL,
the output remains organized into editable view groups, and the remaining
limitations are confined to explicitly advanced effects or project-unused
rendering modes.

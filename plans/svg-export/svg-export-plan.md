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
renderers remain responsible for translating each mark's geometry and
presentation semantics into SVG.

Exact glyph-outline parity is not currently a goal. Text placement uses the SDF
font metrics used by WebGL, while the SVG contains editable plain
`sans-serif` text.

## Current implementation

The main implementation points are:

- [`svgViewRenderingContext.js`](../../packages/core/src/svg/svgViewRenderingContext.js)
  constructs the SVG document, maintains the view-group stack, and creates
  reusable clip paths.
- [`markData.js`](../../packages/core/src/svg/markData.js) selects the collector
  batch for the rendered occurrence.
- [`svgMarkUtils.js`](../../packages/core/src/svg/svgMarkUtils.js) contains
  shared encoder and coordinate-projection helpers.
- [`renderers/`](../../packages/core/src/svg/renderers/) contains the
  export-specific mark renderers and their registry.
- [`index.js`](../../packages/core/src/svg/index.js) drives the export traversal.
  `GenomeSpy.exportSvg()` loads this subsystem dynamically. The public
  Core/embed APIs return an SVG Blob together with deduplicated warnings for
  unsupported properties that were ignored.
- Focused coverage lives in
  [`svgExport.test.js`](../../packages/core/src/genomeSpy/svgExport.test.js) and
  [`svgViewRenderingContext.test.js`](../../packages/core/src/view/renderingContext/svgViewRenderingContext.test.js).

The following features are working:

- Nested, editor-friendly view groups with view names and paths.
- Rectangular and directional clipping.
- Rules and ticks, including line caps, dash patterns, and minimum lengths.
- Plain text used by axes, titles, subtitles, and ordinary labels, including
  ranged placement, viewport flushing, padding, squeezing, and `fitToBand`.
  This includes chromosome labels on locus axes.
- Rectangles with minimum-size and opacity compensation plus uniform or
  independently rounded corners, including current expression-valued
  properties and shader-compatible radius clamping.
- All point symbols, including encoded shape, size, angle, and semantic-score
  filtering. Circles and squares use native elements; the other symbols use
  editable paths.
- Link marks as SVG paths for the supported link shapes and current
  expression-valued geometry properties.
- Basic arrows with triangle or open heads, optional stems, forward/reverse
  direction, inside/outside placement, diagonal endpoints, and encoded size and
  direction.
- App download through the **Save SVG** toolbar action.

Unsupported point effects, rectangle hatches and shadows, text viewport-edge
fading and sequence-logo stretching, advanced arrow geometry, and link arc
fading are ignored when basic geometry can still be emitted, and the export
result includes view-qualified warnings. Unsupported mark types and sample
facets remain errors because export cannot yet meaningfully continue past them.

## Implementation principles

- Reuse the normal render traversal; do not build a second view-tree walker.
- Reuse mark encoders and resolved scales rather than duplicating scale logic.
- Keep SVG emission in the corresponding lazy renderer under `src/svg/`.
- Port shader calculations to JavaScript only when they define visible mark
  semantics required for parity.
- Preserve draw order and the nested view-group structure.
- Return view-qualified warnings when unsupported properties are ignored. Fail
  with the mark type and view path only when export cannot continue.
- Add focused structural and geometry tests for each increment, followed by a
  browser comparison against WebGL using a small existing example.
- Keep every increment independently reviewable and commit it separately.

## Later vector-only work

These features remain desirable but are not the next low-hanging increments:

- Rectangle hatches using reusable SVG `<pattern>` definitions.
- Rectangle shadows using SVG filters.
- Arrow start notches, repeated heads, non-right head notches, and short-arrow
  blunting.
- Link arc fading using SVG masks or gradients.
- Point gradients and inward strokes.
- Text viewport-edge fading and sequence-logo letters.
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
3. Confirm that unsupported properties produce actionable warnings while basic
   mark geometry is still exported.
4. Confirm that the SVG contains no raster `<image>` elements.
5. Run the focused SVG tests, workspace TypeScript checks, and lint.
6. After changing the import boundary, build Core and confirm that the ESM
   entry loads a separate SVG chunk.
7. Commit the completed increment before starting the next one.

The vector-only phase is complete when all fundamental mark types have a useful
SVG representation, common axes/titles/labels and mark properties match WebGL,
the output remains organized into editable view groups, and the remaining
limitations are confined to explicitly advanced effects or project-unused
rendering modes.

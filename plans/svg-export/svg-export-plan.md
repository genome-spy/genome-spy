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
- Integration and example coverage lives beside the SVG entry point in
  [`src/svg/`](../../packages/core/src/svg/). Each mark renderer has a focused
  test file beside its implementation under
  [`src/svg/renderers/`](../../packages/core/src/svg/renderers/).

The following features are working:

- Nested, editor-friendly view groups with view names and paths.
- Rectangular and directional clipping.
- Rules and ticks, including line caps, dash patterns, and minimum lengths.
- Plain text used by axes, titles, subtitles, and ordinary labels, including
  ranged placement, viewport flushing, padding, squeezing, and `fitToBand`.
  This includes chromosome labels on locus axes and viewport-edge fading.
- Sequence-logo letters stretched into their encoded `x`/`x2` and `y`/`y2`
  ranges while remaining editable text.
- Rectangles with minimum-size and opacity compensation plus uniform or
  independently rounded corners, including current expression-valued
  properties, shader-compatible radius clamping, drop shadows, and reusable
  screen-aligned hatch patterns.
- View background fills, shadows, and strokes, including their configured
  opacity and z-order relative to view content.
- The visualization-level canvas background from the root specification or
  selected built-in theme, with explicit export overrides and transparency.
- All point symbols, including encoded shape, size, angle, semantic-score
  filtering, and inward strokes that shrink cleanly to zero. Circles and
  squares use native elements; the other symbols use editable paths.
- Link marks as SVG paths for the supported link shapes and current
  expression-valued geometry properties, including arc-distance fading with
  masks shared by collinear chords.
- Arrows with triangle or open heads, optional stems, forward/reverse
  direction, inside/outside placement, diagonal endpoints, encoded size and
  direction, start and head notches, minimum-stem blunting, and repeated heads
  merged with the stem into a single editable path.
- Conservative instance culling against the effective directional clip and
  root SVG viewport. Partially visible geometry is retained and clipped. Text
  and point marks also support directional `cullByVisibleRange` anchor culling,
  including unclipped labels in scrollable axes.
- SampleView faceting in both rendering modes: repeated plot marks use the
  per-sample uniform transform, while labels and metadata using `facetIndex`
  resolve the same CPU-side positions that back the GPU facet texture. All
  sample rows retain the shared SampleView GridChild clip.
- App download through the **Save SVG** toolbar action.

Unsupported point gradients and the deprecated `geometricZoomBound` property
are ignored when basic geometry can still be emitted, and the export result
includes view-qualified warnings. Unsupported mark types remain errors because
export cannot yet meaningfully continue past them.

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

- SVG size and export-time diagnostics for very dense vector output.

## Intentional non-goals

- Point fill gradients are decorative, uncommon, and could require many SVG
  gradient definitions when colors are data-dependent. Points use their flat
  fill color instead and the exporter returns a warning.
- The deprecated point property `geometricZoomBound` will not be implemented.
  Zoom-dependent point sizes should use expression-valued encodings, whose
  current encoded values are already exported.

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

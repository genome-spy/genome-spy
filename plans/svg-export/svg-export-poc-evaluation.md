# SVG Export Proof-of-Concept Evaluation

## Status

Implemented on `feature/svg-export`. The proof of concept establishes the
vector-rendering architecture and an experimental Core API. Automated tests
pass. Real-browser comparison and vector-editor inspection remain pending
because no controllable browser was available in the implementation
environment.

## Outcome

SVG export is feasible without translating GenomeSpy specifications into a
second visualization grammar or reconstructing geometry from WebGL output.
The existing view traversal provides the required hierarchy, and the existing
CPU encoders provide coordinates from the same resolved D3 scales used to
generate GPU scale implementations.

The proof of concept adds:

- A standalone SVG document with nested, named view groups and rectangular
  clip paths.
- Mark-level SVG emission for rules/ticks, text, circle points, and
  axis-aligned rectangles.
- An asynchronous `exportSvg(options)` API on Core and App embed results. It
  returns an `image/svg+xml` `Blob` and restores the ordinary canvas layout and
  rendering in a `finally` block.
- Explicit errors for unsupported mark types and advanced mark features.

The current renderer uses GLSL, not WGSL. SVG placement reuses the resolved CPU
encoders and D3 scales rather than attempting to translate shader code.

## Evidence

Focused automated coverage verifies:

- Root dimensions, `viewBox`, background handling, serialization, nested view
  groups, group metadata, and directional clip-path deduplication.
- Linear scale projection, offsets, rule geometry, dash attributes, plain SVG
  text, and SDF-derived `textLength`.
- Circle radius conversion from GenomeSpy's area-based point size.
- Sorted rectangle endpoints and basic fill/stroke presentation.
- A titled point plot with two native circles, generated axis-domain lines,
  editable title and subtitle text, and no raster image elements.
- The unchanged
  `examples/docs/grammar/composition/layer/bar-and-label-layer.json` fixture,
  including nine native rectangles, editable data labels, and separate `Bar`
  and `Label` view groups.
- Core and App embed APIs forwarding the SVG export method.

The focused SVG/API suite has 12 passing tests. The App forwarding suite has 3
passing tests. All workspace TypeScript checks and the workspace lint check
pass.

## Architecture assessment

Mark-level emission remains the right abstraction for a production design.
It keeps mark geometry beside the WebGL implementation, while
`SvgViewRenderingContext` owns document structure, clipping, and traversal.
A separate intermediate scenegraph is not justified by the proof of concept.

The main implementation cost is semantic parity rather than SVG construction.
Each mark must explicitly decide which shader-era behaviors have a meaningful
vector equivalent. Fail-fast behavior is important: silently approximating an
unsupported shape or effect would make publication output unreliable.

The exported hierarchy is useful for editing because view groups contain native
SVG elements and retain `data-view-name` and `data-view-path`. No `<image>`
elements are emitted by the proof of concept.

## Observed limitations

- Text uses SDF measurements through `textLength`, but the emitted font is
  plain `sans-serif`; glyph outlines and browser/editor baseline behavior will
  differ from WebGL.
- Ranged/fitted/squeezed/flushed text, viewport-edge fading, and sequence logos
  are unsupported.
- Only circle points are supported. Point gradients, inward strokes,
  non-circle shapes, and zoom-dependent geometry are rejected.
- Rectangle minimum-size compensation, per-corner radii, hatching, and shadows
  are unsupported.
- Link, arrow, and other mark types are unsupported.
- General and sample faceting are not validated.
- The proof of concept emits every datum as an SVG element and has no dense-view
  rasterization policy.
- Crisp rule half-pixel alignment still needs visual evaluation at browser and
  editor zoom levels.
- Headless tests initialize generated axis-domain marks, but lazy axis tick and
  label population requires a live rendering workflow for full visual
  validation.

## Production design priorities

Advanced SVG export should be designed as a separate phase in this order:

1. Define fidelity tiers and the error/fallback contract for every mark and
   property.
2. Design hybrid vector/raster output. Dense mark groups should be rasterized
   into an `<image>` inside the corresponding named view group while axes,
   titles, and sparse marks remain vector.
3. Define rasterization thresholds using element count, estimated SVG size,
   and export-time measurements rather than a single hard-coded datum count.
4. Resolve text strategy: system-font approximation, embedded fonts, or text
   paths, including editor portability and licensing.
5. Add browser comparisons for the three selected fixtures and inspect the bar
   example in Inkscape and Illustrator-compatible tooling.
6. Decide whether the public API should additionally return an SVG element or
   string. Retain the asynchronous Blob API so future raster/font resources do
   not require an API break.
7. Only after those decisions, design App Save Image integration and user-facing
   controls.

## Conclusion

The proof of concept answers the feasibility question positively. GenomeSpy can
export simple plots with hierarchical, editable SVG groups and native basic
marks while reusing its current view traversal and resolved scales. The next
phase should focus on fidelity policy, text portability, and hybrid
rasterization, not on replacing the established rendering-context and
mark-emitter architecture.

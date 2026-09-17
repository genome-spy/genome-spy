# Sparse WebGPU MSDF atlas: implemented design record

Status: complete; production implementation lives in `src/symbols/`

## Origin and provenance

Canonical [msdfgen v1.13](https://github.com/Chlumsky/msdfgen/tree/v1.13)
established the quality oracle and informed edge coloring, pseudo-distance, and
interpolation-error correction. Adapted algorithms retain attribution beside
the implementation and in the renderer's third-party notices.

The GPU work decomposition follows the published idea in Chen et al.,
_Real-Time GPU Vector Graphics SDF Generation Based on Quadratic Stroke
Rendering_ ([DOI](https://doi.org/10.1145/3799902.3811177)): rasterize bounded
edge-local regions and atomically retain nearest distances instead of making
every output texel evaluate every edge.

The authors' OpenGL reference implementation was inspected at revision
`71e34256a551319756fe666ace24d1d545b3a0e5`. It has no license file, so no code
was copied or closely translated. GenomeSpy independently implements the
published algorithmic structure in WebGPU.

## Implemented pipeline

### CPU preparation

- Parse closed SVG paths and normalize line, quadratic, and cubic segments.
- Convert cubics to bounded quadratic approximations.
- Assign MSDF edge colors and build contour adjacency.
- Compute normalized bounds, conservative edge rectangles, and directional
  miter extents.
- Pack only the required symbol or glyph rectangles.

This work scales with path complexity, not texture area.

### GPU generation

1. Clear bounded scratch state for the active jobs.
2. Rasterize conservative per-edge rectangles and atomically retain nearest
   channel distances.
3. Apply nearest-edge-gated perpendicular endpoint pseudo-distances to preserve
   sharp corners.
4. Resolve even-odd sign and lightweight interpolation-error correction.
5. Write signed RGB MSDF plus regular signed distance in alpha to the final
   `rgba16float` atlas.

All jobs share renderer-owned pipelines and bounded scratch resources. Final
symbol atlases are immutable. Font atlases append missing glyphs, grow
geometrically while preserving coordinates, and rebind their borrowers.

## Rendering contract

- RGB stores signed atlas-pixel distances for sharp fill and outline coverage.
- Alpha stores the nearest regular signed distance for stable soft effects.
- Linear filtering is the production baseline.
- Each mapped tile includes a sampling gutter for filtering and supersampling.
- Glyph and symbol metrics exclude the gutter.
- Instance quads derive minimum expansion from shape bounds, stroke extent,
  antialiasing, rotation, and miter metadata.
- Picking uses the same reconstructed visible contour.

The detailed buffer layouts, generation stages, resource ownership, and
algorithm attribution are maintained in
`packages/webgpu-renderer/src/symbols/README.md`.

## Results

- The GPU route removes the catastrophic tile artifacts of the early WASM
  runtime path and the acute seams of the focused JavaScript rasterizer.
- Warm generation of the representative 16-symbol fixture was roughly 4-5 ms,
  versus roughly 103-104 ms for canonical WASM at matching dimensions.
- Atlas generation performs no CPU readback or bitmap upload.
- Tight glyph rectangles and geometric atlas growth materially reduced font
  atlas memory relative to the original fixed-square layout.
- The same generator now serves path points, TrueType glyphs, and the scalar
  distance channel used by text shadows.

## Intentional differences from canonical msdfgen

- The quadratic solver and correction are simplified and use `f32`.
- Sign uses an even-odd contour policy rather than general SVG composition.
- Cubics are approximated before GPU generation.
- Output channels are not expected to match byte-for-byte.
- Conservative edge rectangles replace canonical full-tile traversal.

The compatibility requirement is stable rendered topology and bounded visual
difference, not internal channel equality.

`rgba16float` storage writes, linear sampling, rendering, and copying are core
WebGPU capabilities and do not require WGSL `f16`. Focused GPU tests and the
required Core examples exercise the exact usage combination on Apple Metal 3
at DPR 1 and 2, so no RGBA8 compatibility fallback is planned.

## Remaining production work

- Add a compact wide-range tier for useful strokes on very small point marks.
- Re-run generation, memory, and draw benchmarks on representative large font
  and scatter-plot workloads.
- Define public finite-path limits and behavior when updates introduce an
  unseen path.

These tasks are tracked only in
[`production-integration-plan.md`](production-integration-plan.md).

# CPU + WGSL MSDF atlas generator

This directory contains the experimental path-to-MSDF pipeline used by the
WebGPU `PathPoint` proof of concept. It accepts closed SVG path strings,
prepares their topology and edge metadata on the CPU, and generates an atlas
directly on the GPU. The final texture is sampled by one shared mark shader for
fill, variable-width outline, rotation, and picking.

The implementation is deliberately split into two backends:

- `createSparseGpuPathAtlas` is the fast CPU + WGSL experiment.
- `buildPathAtlas` invokes canonical msdfgen v1.13 through WebAssembly and is
  retained as the correctness oracle.

They share path normalization, atlas-entry metadata, and the PathPoint decoder,
but they are not expected to produce identical RGB bytes.

## Pipeline overview

```text
SVG path or TrueType glyph outline
    |
    v
CPU: parse, validate, normalize, color, annotate corners
    |
    v
packed quadratic edge buffer + atlas job buffer
    |
    v
GPU render pass: nearest true RGB edge distances
    |
    v
GPU render pass: accepted endpoint pseudo-distances
    |
    v
compute: even-odd sign + signed raw RGB distances
    |
    v
compute: lightweight interpolation-error correction
    |
    v
RGBA8 atlas -> median RGB reconstruction in PathPoint
```

### 1. CPU path preparation

[`sparsePathAtlasLayout.js`](./sparsePathAtlasLayout.js) performs work that is
irregular, topology-dependent, and cheap relative to rasterization:

1. Parse SVG path syntax with the focused Vega Scenegraph adaptation under
   `src/vendor/vegaScenegraph/`.
2. Require explicit closed, non-empty contours and discard zero-length lines.
3. Normalize each shape or glyph into its atlas tile. A caller may provide a
   shared `normalizationSpan`, such as a font's `unitsPerEm`, so narrow glyphs
   retain their proper scale instead of filling their tile independently.
4. Detect corners from the true endpoint tangents. For a quadratic Bézier, the
   end tangent is `p2 - p1`; using the whole `p2 - p0` chord falsely classifies
   smooth font contours as corners.
5. Assign two-channel cyan, magenta, and yellow masks to edge groups. The
   median decoder needs the nearby edge distance in at least two channels.
6. Annotate sharp convex endpoints with channel masks and tangent domains for
   pseudo-distance reconstruction.
7. Recursively approximate cubic Béziers with quadratics to a configurable
   atlas-pixel tolerance. Lines and quadratics remain exact input primitives.
8. Pack fixed-layout 64-byte segment records and 32-byte atlas-job records.

The current packer deduplicates identical path strings but otherwise uses a
simple square grid of fixed-size tiles. Tight rectangles, incremental packing,
eviction, and resolution classes are production work rather than part of this
generator experiment.

### 2. Sparse nearest-distance rasterization

[`sparseGpuPathAtlas.js`](./sparseGpuPathAtlas.js) draws one conservative
rectangle per edge instead of evaluating every edge at every atlas texel. The
vertex shader expands the line or quadratic bounds by the configured distance
range. The fragment shader computes the exact line distance or a sampled and
Newton-refined quadratic distance only inside that edge-local rectangle.

Each atlas pixel has three interleaved `atomic<u32>` distance slots. Positive
finite `f32` magnitudes are converted to reversed ordered-bit keys, allowing a
cleared zero buffer and `atomicMax` to retain the smallest distance without
floating-point atomics.

Generation uses two edge passes:

1. The first pass records the nearest true finite-segment distance per channel.
2. The second pass considers tangent-based endpoint pseudo-distances. A pseudo
   candidate is accepted only when its source edge was also the nearest true
   edge for that channel. This gate prevents a remote corner from creating a
   detached color island.

The second pass starts from a copy of the true-distance buffer. Queue ordering
makes the generated atlas visible to later draws without CPU readback.

### 3. Sign and correction compute passes

The raw-distance compute pass tests each pixel center against all contours with
an even-odd horizontal ray. Quadratics are split at vertical extrema before the
half-open crossing rule is applied. This avoids the one-pixel sign streaks that
occur when two roots at a shared extremum both count, or neither counts.

The resulting global sign is applied to all three channel magnitudes and stored
temporarily in `rgba16float`. A final compute pass checks channel-crossing
points between horizontally, vertically, and diagonally neighboring texels.
The linear classifier collapses the farther texel to its median when
interpolation would create a false zero crossing or leave both endpoint medians
by more than the maximum expected one-texel distance change. The diagonal
bilinear classifier is deliberately narrower: it corrects only false
inside/outside crossings. This removes faint seams without applying aggressive
unprotected correction to legitimate acute tips. The default output maps the
corrected distances to `rgba8unorm`; the GPU backend can instead retain signed
atlas-pixel distances in `rgba16float` without changing the sampling filter.

This correction adapts selected parts of msdfgen's artifact classifier. It
still omits the canonical edge/corner protection stencil, local-extrema range
tests for non-inverting diagonal artifacts, and exact shape-distance
improvement test. Regression tests therefore exercise acute stars and
triangles across multiple sizes, rotations, and stroke widths so that broader
correction cannot silently collapse their tips or create detached spikes.

### 4. Rendering

The PathPoint fragment shader samples the atlas with linear filtering and
reconstructs signed distance as `median(r, g, b)`. It decodes normalized
8-bit values or consumes floating-point atlas distances directly. A
per-instance scale derived from point diameter, device-pixel ratio, and atlas
shape resolution converts the stored texel distance range into device pixels.
Fill coverage uses the zero-distance contour; an outline shifts the same
distance by half the requested stroke width.

The vertex shader expands and rotates a path-specific quad. CPU metadata stores
the normalized fill bounds and directional unit-stroke miter extents, so
ordinary shapes do not pay for one worst-case global padding allowance.

Atlas resolution still matters. MSDF preserves corner topology better than a
single-channel SDF, but it cannot recover features that were undersampled in
the atlas. Device-pixel ratio must be included when selecting a resolution
class for large text.

## Relationship to msdfgen

[msdfgen](https://github.com/Chlumsky/msdfgen) is the algorithmic and visual
reference. The pinned v1.13 source, license, wrapper, and reproducible WASM
build are documented under [`vendor/msdfgen`](../../vendor/msdfgen/README.md),
with the packaged runtime under
[`src/vendor/msdfgen`](../vendor/msdfgen/README.md).

The CPU + WGSL generator closely follows these msdfgen ideas:

- color smooth edge groups with two-channel cyan, magenta, and yellow masks;
- use the deterministic `edgeColoringSimple` corner and color-switching rules;
- reconstruct the signed boundary from the median RGB distance;
- extend finite-edge endpoint distance into a perpendicular pseudo-distance so
  offset contours retain sharp corners; and
- correct samples where independently interpolated channels would select the
  wrong median.

The JavaScript edge-coloring code is a focused adaptation of msdfgen's MIT-
licensed `edgeColoringSimple` algorithm. The generated WASM backend uses the
original C++ implementation, including contour orientation, overlap support,
robust distance selection, and canonical error correction.

The WGSL backend does **not** port msdfgen's polynomial solvers, edge selectors,
contour combiners, or correction machinery. Its quadratic minimization,
pseudo-distance gating, sign calculation, and correction pass are smaller
GenomeSpy implementations tested against the WASM oracle.

## Relationship to the sparse GPU paper

The GPU organization is based on the method described by Chen et al.,
[_Real-Time GPU Vector Graphics SDF Generation Based on Quadratic Stroke
Rendering_](https://doi.org/10.1145/3799902.3811177):

- keep path decomposition and other irregular work on the CPU;
- represent curves as quadratic strokes;
- rasterize conservative edge-local regions rather than running a full-grid
  all-edge distance kernel;
- merge competing edge distances atomically; and
- finalize signed output and correction in GPU passes.

The paper motivated the architecture, not a line-for-line shader port. The
authors' public prototype had no license when inspected, so no GLSL source was
copied or translated. GenomeSpy independently implements its WGSL distance
solver, buffer formats, global even-odd sign, pseudo-distance pass, correction,
atlas packing, and WebGPU resource lifecycle.

The largest intentional departure is sign determination. The paper can rely on
normalized oriented local geometry; this proof of concept performs an explicit
global even-odd containment pass so nested holes are deterministic regardless
of source winding.

## Current limitations

- Only closed contours are supported. Exact SVG caps, joins, dashes, and open
  path stroking require geometry rather than thresholding this distance field.
- The fill rule is provisionally even-odd. Self-intersections and malformed
  overlapping contours are not a public compatibility promise.
- Cubics are approximated by quadratics; difficult cubics may require many
  segments or a tighter tolerance.
- The quadratic nearest-point solver is iterative and uses `f32`; canonical
  msdfgen remains more robust around degenerate control geometry.
- One-corner contours containing fewer than three source edges use a white
  fallback instead of msdfgen's split-in-thirds teardrop treatment.
- Pseudo-distance reconstruction currently targets convex sharp corners and
  does not implement a configurable geometric miter limit.
- Correction is local and lightweight rather than canonical.
- At small sizes, some convex 90-degree corners can look slightly rounder or
  flatter than canonical msdfgen. A rotated-diamond coverage test verifies that
  visible pixels retain a guard band inside the expanded quad, so this is a
  reconstruction difference rather than quad clipping.
- Acute star tips can retain isolated subpixel stroke blemishes at particular
  rotations and widths. Focused tests reject connected white seams, detached
  spikes, or deep coverage loss; the smaller residual remains accepted PoC
  debt.
- Analytic circles remain smoother than atlas-sampled circles at some sizes.
  The production point mark should keep an analytic built-in fast path.
- Tiles are fixed-size, square, single-resolution, and have no mipmaps.
- Scratch storage is proportional to the generation surface. Production atlas
  population should batch into bounded reusable scratch regions.
- `rgba16float` materially improves delivered edge smoothness over eight-bit
  output, at twice the texture bytes. The prototype keeps both formats for
  comparison; production policy is deferred to atlas resource classes.

## Verification and comparison

Focused unit and browser tests cover contour validation, cubic reduction,
smooth quadratic tangents, miter metadata, holes, dispatch bounds, quadratic
extrema, visible rendering, and picking.

The comparison tool renders the same printable-ASCII scene with both backends
and writes WGSL, WASM, and high-contrast difference images:

```sh
npm run compare:path-text --workspace=@genome-spy/webgpu-renderer -- \
    --output /tmp/path-text --threshold 8 --dpr 2
```

Magenta in the diff means excess WGSL coverage, cyan means excess WASM
coverage, and yellow/red means both cover the pixel but disagree in color or
coverage. Always compare at the device-pixel ratios and screen sizes the atlas
is expected to serve; a close DPR-1 comparison can hide DPR-2 undersampling.

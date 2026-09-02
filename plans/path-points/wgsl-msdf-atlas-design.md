# Sparse WebGPU MSDF atlas generation design

Status: Feasibility accepted; implementation frozen pending production
integration

## Motivation and evidence

Canonical msdfgen v1.13 compiled to WASM established that MSDF path points can
remove the acute-corner seams seen with the earlier focused rasterizer. The
60,312-byte WASM artifact is small enough to remain a development oracle, but
the 14-symbol 1032-by-1032 atlas took about 340 ms to generate warm on the
development machine. Generating large or incremental font atlases this way
would delay first use and perform avoidable CPU-to-GPU uploads.

Chen et al., _Real-Time GPU Vector Graphics SDF Generation Based on Quadratic
Stroke Rendering_ (SIGGRAPH 2026), describe a better GPU work decomposition
than a full-grid compute port of msdfgen. Each quadratic edge rasterizes only a
conservative distance band and fragment invocations atomically retain the
nearest per-channel distance. A later compute pass corrects and converts the
result into a sampled atlas.

The authors' public OpenGL research implementation was inspected at commit
`71e34256a551319756fe666ace24d1d545b3a0e5`. It has no license file, so no code
is copied or closely translated. This project independently implements the
published algorithmic idea and uses canonical msdfgen output as its oracle.

Sources:

- <https://doi.org/10.1145/3799902.3811177>
- <https://github.com/tuzhong007/quadratic-stroke-sdf>
- <https://github.com/Chlumsky/msdfgen/tree/v1.13>

## Goals

- Demonstrate that WebGPU can generate the PathPoint atlas without CPU
  per-texel work, readback, or bitmap upload.
- Test sparse edge-local rasterization rather than making every atlas texel
  evaluate every curve distance.
- Preserve sharp MSDF-like corners, holes, and the accepted PathPoint shader
  contract closely enough for a feasibility decision.
- Keep path parsing, topology policy, atlas packing, and rendering independent
  from Core.
- Retain the WASM generator as a correctness oracle and optional temporary
  fallback while GPU output is evaluated.

## Non-goals of the first implementation

- Byte-for-byte reproduction of canonical msdfgen channels.
- A literal port of the paper's OpenGL tessellation and geometry shaders.
- Exact SVG stroking, general self-intersection preprocessing, or arbitrary
  nonzero-winding composition.
- Dynamic font parsing, shaping, eviction, or persistent atlas caching.
- Optimizing every atlas allocation before the sparse generation method has
  passed the visual gate.

## Findings from the reference implementation

The implementation contains details that must not be inherited accidentally:

- its conservative raster width is controlled by a variable named
  `strokeWidth`, while its separately named maximum distance affects only
  normalization and an epsilon;
- its MSDF correction threshold contains demo-transform constants and is not
  canonical msdfgen error correction;
- its final compute shaders omit bounds checks and rely on dimensions divisible
  by eight;
- its generic-looking cubic conversion is valid only because its NanoSVG fork
  supplies quadratic control points;
- sign handling assumes one closed, positively oriented, non-self-intersecting
  quadratic contour; and
- joints and per-channel caps contain additional numerical special cases not
  captured by a simple "render a stroked curve" description.

The WebGPU version therefore uses explicit atlas-pixel distance units, checks
every dispatch bound, approximates cubics independently, and computes a global
even-odd sign instead of inheriting orientation-dependent local signs.

## Simplified proof-of-concept architecture

```text
SVG path string
    -> existing focused SVG parser
    -> closed contours of lines, quadratics, and cubics
    -> bounded cubic-to-quadratic approximation on CPU
    -> simple corner-based RGB edge coloring on CPU
    -> fixed atlas layout and per-edge atlas-pixel records
    -> sparse conservative edge rectangles in a WebGPU render pass
    -> atomic nearest unsigned distance per RGB channel
    -> compute global even-odd sign and raw signed RGB distances
    -> compute interpolation-inversion correction and output conversion
    -> existing PathPoint texture sampler
```

### Why conservative rectangles

WebGPU has no tessellation or geometry shader stages. The first implementation
draws a six-vertex axis-aligned rectangle around each quadratic's control-point
bounds, expanded by the requested distance range. This is less tight than the
paper's subdivided seven-vertex polygons, but it preserves the central property:
exact curve-distance work runs only in an edge-local raster region. It also
avoids adding a second GPU geometry-generation system before feasibility is
known.

If fragment overdraw is material, replace rectangles with CPU-generated tight
polygons or a compute-generated indirect vertex buffer after measuring the PoC.

### CPU preprocessing

- Lines remain explicitly tagged lines and use a degenerate-safe analytic
  distance calculation.
- Quadratics are stored directly.
- Cubics use recursive De Casteljau subdivision. Each subcurve is degree-reduced
  to a quadratic and subdivided until the elevated quadratic's control points
  differ from the cubic by at most the configured atlas-pixel tolerance.
- Smooth contours use all three channels. Corner-delimited edge groups receive
  a deterministic color sequence in which neighboring groups differ and every
  contour uses all channels when possible.
- Every contour must be closed. Empty and open contours fail loudly.

### Tight per-path draw bounds

Atlas generation and point rendering share a 48-byte entry containing UV
bounds, normalized local path bounds, and four directional stroke-padding
coefficients. Preprocessing intersects the unit-offset lines at every convex
corner and records the largest left, top, right, and bottom miter component.
Smooth and concave regions need only one stroke radius. Components above four
retain the previous SVG-default-miter-limit extent until an explicit bevel
boundary is implemented.

The PathPoint vertex shader rotates this local rectangle and expands each side
by its own coefficient times half the requested stroke width. Fill-only points
reserve one device pixel for the antialiasing raster guard; stroked points use
1.5 pixels so filtering and subpixel placement cannot clip the outer fringe.
They therefore use the path's actual aspect ratio with no global miter
allowance, while a square uses one stroke radius per side instead of the former
four-width allowance. This metadata is constant per shape or glyph, so
millions of instances reuse it through one cached storage-buffer entry.

No unlicensed reference shader source is used.

### GPU resources

The PoC uses:

- an immutable edge buffer containing atlas-pixel quadratic control points,
  edge kind, channel mask, sharp-endpoint masks and tangent domains, and
  atlas-job index;
- an immutable job buffer containing each unique path's edge range and tile;
- one nearest-true-distance scratch buffer and one corrected-distance scratch
  buffer, each containing three interleaved `atomic<u32>` values per atlas
  pixel;
- one `rgba16float` raw-distance texture reused by the correction pass; and
- the final `rgba8unorm` texture used directly by PathPoint.

The atomic key reverses the ordered positive `f32` magnitude bits so the buffer
can be cleared to zero and `atomicMax` retains the smallest magnitude. The
first sparse edge pass selects true segment distances. After copying those
results to the corrected scratch buffer, a second sparse pass may replace an
endpoint distance with its perpendicular pseudo-distance only when that edge
was the nearest true-distance edge for the channel. This nearest-edge gate
prevents a distant corner from creating a disconnected color island. NaN and
non-finite candidates are rejected before encoding. Queue order makes the
generated atlas visible to a subsequent draw without CPU waiting.

### Global sign and topology

The paper's local sign assumes normalized positive orientation. The PoC instead
computes even-odd containment in the raw-distance compute pass by intersecting
an atlas-pixel ray with the path's line and quadratic segments. This adds a
cheap full-grid edge loop but keeps the expensive nearest-distance calculation
sparse, supports nested holes independent of input winding, and makes the
existing overlap fixture deterministic.

This is a feasibility policy, not a final SVG fill-rule decision. A production
generator may replace it with normalized nonzero winding and explicit fallback
for intersecting paths.

### Correction

The correction pass implements the unprotected linear-neighbor classifier and
an inversion-only subset of msdfgen's diagonal bilinear classifier. At each
channel-crossing point between adjacent texels, it checks whether independently
interpolated channels would introduce a false zero crossing outside the maximum
expected one-texel distance change. Linear neighbors also detect medians that
leave the endpoint range. Only the texel farther from the contour is collapsed
to its median. Restricting diagonal correction to sign inversions avoids
erasing legitimate acute star tips. It is not canonical msdfgen correction:
protection stencils, non-inverting diagonal local-extrema tests, and exact
shape-distance improvement checks remain omitted.

The Path Points pixel-diff harness compares matching RGBA8 atlas dimensions and
reports per-symbol coverage disagreement against msdfgen. It also supports an
RGBA16F WGSL run for delivered-quality comparison. The compound overlapping
path is reported separately because its fill behavior differs in the current
WASM reference.

## Atlas policy during the PoC

Use smaller fixed tiles than the earlier diagnostic atlas. Keep shape
resolution, encoded distance range, and geometric padding as separate values.
The current candidate is a 128-pixel tile with a 48-pixel shape interior and a
32-pixel distance range, plus a one-pixel gutter. Rebalancing the earlier
32-pixel shape / 48-pixel range allocation improves 90-degree corner sampling
without increasing atlas dimensions.

This makes the 16-symbol atlas 520 by 520 RGBA8, about 1.03 MiB instead of 4.06
MiB. It is still a benchmark geometry. Production text should tightly pack
variable glyph rectangles and generate wide-effect variants only when a glyph
actually requests an exceptional stroke or effect range.

## Ownership and lifecycle

The experimental PathPoint program owns its generated atlas and temporary GPU
resources. Generation is submitted during mark-resource initialization and
finishes before later render submissions by queue order. Destruction releases
the final atlas and all scratch resources.

If the method passes, move pipelines and reusable scratch buffers into a
renderer-owned `MsdfAtlasGenerator`. Symbol and font atlas owners then retain
only their final textures, allocators, entry metadata, and pending jobs.

## Current proof-of-concept result

The PathPoint program now selects the sparse GPU generator by default and keeps
canonical WASM as a Storybook comparison backend. The GPU output removes the
large false-color and black tile regions visible in the WASM stress scene.
Holes, overlapping even-odd contours, curves, render/pick behavior, and atlas
sizes not divisible by the eight-pixel compute workgroup are covered by focused
browser tests.

The first sparse implementation incorrectly assigned single-channel primary
colors to sharp edge groups. A median decoder then saw usable distance on only
one channel along a straight side, so the stroke disappeared there; two edges
contributed at corners, producing detached round islands. MSDF edge groups must
use two-channel cyan, magenta, and yellow masks so at least two channels carry
the nearby edge distance. Correcting this restores continuous polygon strokes
and removes the corner islands. A focused GPU assertion samples the exterior
distance immediately beside a rectangle edge to prevent regression.

True distance to a finite segment still produces circular distance contours at
its endpoints, which rounds the decoded outline and any shifted stroke contour.
For convex sharp corners, preprocessing now records the channels missing from
the adjacent edge and its tangent. The second sparse pass applies
channel-specific perpendicular endpoint pseudo-distances inside the corner
wedge. A texture-level assertion verifies that a square's diagonal corner
offset has the same encoded median as an equally distant side offset; that is
the distinguishing miter-field signature rather than a radial endpoint field.
Squares, diamonds, triangles, and star tips now retain sharp outer contours,
and nearest-edge gating removes the large detached islands seen in the first
pseudo-distance attempt.

The initial font pass also miscomputed quadratic end tangents from the whole
endpoint chord. That turned smooth glyph joins into false corners and caused
excessive color switching and broadly rounded output. The preprocessing now
uses the true `p2 - p1` endpoint tangent and follows canonical
`edgeColoringSimple` color switching for smooth, one-corner, and multi-corner
contours. The printable-ASCII WGSL/WASM comparison at DPR 2 now differs only in
small boundary-localized samples when atlas resolution matches device size.

The implementation and its provenance are documented in
`packages/webgpu-renderer/src/symbols/README.md`.

This is still a feasibility implementation rather than canonical msdfgen
quality. At high device-pixel ratios, complex alternating convex and concave
silhouettes can show occasional roughly one-device-pixel hairs. A configurable
miter limit is also postponed: abruptly disabling the pseudo-distance beyond a
ratio created discontinuities, while a correct bevel limit needs an explicit
cap or bevel boundary.

Exceptionally wide effects still remain part of the font/effect quality gate.
A production route may eventually need range classes, an auxiliary true-
distance channel, or geometric stroking outside the tested range, but the
observed missing-side failure was not evidence for that limitation.

The remaining accepted visual debt is localized. Some small convex 90-degree
corners look slightly rounder or flatter than the WASM oracle, and acute star
tips can show isolated subpixel stroke blemishes at particular rotations. A
non-symmetric rotated-diamond test verifies that visible coverage remains at
least 0.75 CSS pixels inside the computed quad boundary, ruling out quad
clipping for that case. The star/triangle matrix rejects deep white seams,
detached spikes, and connected coverage loss. These residuals do not block the
production architecture work and should not be chased by widening correction
without the canonical protection machinery.

On the development machine in headless Chromium with Metal, the two-stage
16-symbol 520-by-520 atlas completed in 3.8-5.1 ms warm, with 0.6-0.9 ms spent
before submission. Canonical WASM took 103-104 ms warm at identical atlas
geometry. The first GPU call completed in 8.0 ms. These are feasibility
measurements, not cross-device performance guarantees.

In a separate 1,024-by-768 render benchmark with five million visible square
instances, guarded PathPoint quads completed in 78.0 ms for two-pixel fill-only
points, 80.1 ms for four-pixel fill-only points, and 82.7 ms for two-pixel
points with a one-pixel stroke. The matching hard-coded point shader completed
in 64.7, 67.0, and 67.8 ms respectively. These warm local medians put the atlas
path 20-22% behind instead of the previous 2.38-times stroked result. The
remaining difference includes filtered atlas sampling and is not dominated by
stroke padding.

## Milestones

### 1. Sparse PathPoint atlas proof of concept

Outcome: PathPoint uses a GPU-generated atlas produced by conservative edge
rectangles, atomic nearest-distance merging, and compute conversion.

Affected areas:

- `src/symbols/` path preprocessing, layout, and GPU generation;
- the temporary PathPoint resource initialization;
- focused GPU tests and the Path Points Storybook scene; and
- the renderer migration plan.

Verification:

- square, circle, acute star, bow-tie, nested hole, and overlap fixtures;
- atlas dimensions not divisible by eight to verify dispatch bounds;
- repeated output to expose atomic nondeterminism;
- visible and picking PathPoint rendering; and
- GPU validation without errors.

Tentative commit: `feat(webgpu): generate path msdfs with sparse gpu rasterization`

### 2. Oracle comparison and performance gate

Outcome: measured evidence decides whether sparse GPU generation can replace
runtime WASM atlas baking.

Verification:

- median sign agreement with WASM outside a one-texel boundary band;
- no background-connected star or bow-tie seams larger than one device pixel;
- warm timings for one symbol, 16 symbols, and representative 32-128 glyph
  batches; and
- separate CPU preprocessing, GPU submission, GPU completion, scratch memory,
  and final-atlas memory measurements.

The GPU path should materially beat the roughly 340 ms warm WASM baseline for
the diagnostic symbol atlas. A one-glyph GPU loss is acceptable if batching
wins and lazy publication keeps first use responsive.

Tentative commit: `test(webgpu): compare sparse msdf generation with wasm`

### 3. Font-scale and range-class prototype

Outcome: representative TrueType quadratic outlines populate tightly packed,
incremental atlas entries with ordinary text paying no cost for uncommon wide
effects.

Verification:

- simple, compound, Latin, non-Latin, dense, and high-edge-count glyphs;
- ordinary and wide-effect cache keys;
- 256, 1,024, and 4,096 requested glyph populations; and
- renderer recreation after terminal device loss.

Review gate: independently inspect resource hazards, output parity, packing,
and cross-device performance before exposing font integration.

Tentative commit: `perf(webgpu): batch sparse glyph atlas generation`

## Acceptance criteria

- Atlas generation performs no CPU per-texel distance work and no GPU readback
  in production rendering.
- The final atlas is generated directly on the GPU and sampled by the existing
  PathPoint shader.
- Compute dispatches bounds-check both dimensions.
- Nested-hole and overlap signs follow the documented PoC even-odd policy.
- The acute star and bow-tie have no connected exterior seams at the tested
  sizes, rotations, stroke widths, and DPRs.
- Unsupported or malformed paths fail explicitly rather than silently
  generating an invalid atlas.
- Provenance identifies the paper and inspected implementation while making
  clear that unlicensed source was not copied.

## Risks and stop conditions

- Simple edge coloring or median-collapse correction may not match canonical
  msdfgen around difficult corners.
- Cubic approximation may require too many quadratics for icon-heavy SVG paths.
- Fragment atomic contention may dominate dense glyphs or very wide ranges.
- AABB conservative regions may overdraw enough to erase the sparse method's
  advantage.
- Global even-odd sign classification may become the bottleneck for large
  high-edge-count tiles.
- Scratch buffers use 24 bytes per active atlas pixel before raw and final
  textures; production batching must reuse bounded scratch regions.

Stop or redesign if the GPU output reintroduces connected seams, produces
unstable signs, or fails to beat WASM materially for batched glyphs. Compare
tight conservative polygons, a full-grid compute port, and worker-based WASM
before selecting the production backend.

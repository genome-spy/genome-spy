## WebGPU Migration Plan

This plan reflects the intended direction: a WebGPU-first renderer, columnar
data, storage buffers + vertex pulling, and a clean separation between core
(dataflow/params) and rendering (GPU execution).

### 1) Split a renderer-only package — IN PROGRESS

Create a new package (`@genome-spy/webgpu-renderer`) that contains only:

- Mark implementations (rect/point OK; rule/link/text pending) — IN PROGRESS
- WGSL codegen (scale transforms OK; conditional encodings/selections pending) — IN PROGRESS
- GPU resources (buffers, textures, pipelines) — IN PROGRESS
- Picking pass — IN PROGRESS
- Viewport/scissor management — IN PROGRESS
- SDF text rendering (glyph atlas, shaders, layout helpers) — IN PROGRESS

Explicitly exclude:

- Dataflow
- View hierarchy and layout
- Param/expr evaluation
- Scale domain computation

Core remains responsible for dataflow, parameters, expressions, scale domains,
and view/layout structure. Renderer becomes a "dumb" GPU execution backend.

### 2) Columnar data as the renderer contract — OK

Renderer APIs accept typed arrays (SoA / columnar), not array-of-objects:

- Numeric data only (categoricals are mapped to integers in core).
- Schema describes which channels map to which arrays.
- Instance count is explicit.

This enables zero-copy transfer from workers and aligns with GPU-friendly
layouts. The renderer should accept identical typed arrays for multiple channels
and deduplicate internally.

### 3) Storage buffers + vertex pulling — IN PROGRESS

Replace expanded vertex buffers (e.g., rect = 6 vertices) with:

- One element per mark instance stored in a storage buffer.
- Vertex pulling in WGSL uses `instance_index` to load per-instance data.
- Mark geometry is procedurally generated in shader (rects, lines, etc.).

Benefits:

- No data duplication for multi-vertex marks.
- Natural fit for columnar data and worker transfers.
- Simpler CPU-side builders.

### 4) Deduplication inside the renderer — OK

Deduplicate fields on the renderer side to keep the API clean:

- If two channels reference the same `TypedArray`, store one GPU buffer and
  alias it for multiple channels.
- Keep a `Map<TypedArray, fieldId>` registry per mark to avoid redundant uploads.
- Validate length/type consistency when a field is reused.

Optional escape hatch:

- Allow explicit `{ id, data, type }` field descriptors if identity-based
  deduplication is insufficient.

### 5) Uniforms and updates: no texture leakage — IN PROGRESS

Renderer should not expose textures in the public API. Use data-driven updates:

- `updateGlobals`: viewport, DPR, global timing.
- `updateMarkUniforms`: mark-specific constants (opacity, stroke width, etc.).
- `updateScales`: domain/range data (renderer builds textures or buffers).
- `updateSelections`: selection data (renderer builds/updates textures).

Internally, map these to WebGPU bind groups:

- `global`, `mark`, `scales`, `selection` bind groups with stable layouts.
- Frequent updates use buffer writes, not pipeline recreation.

### 6) Param/expr handling stays in core — OK

Core owns:

- Param hierarchy and expression evaluation
- Selection state logic
- Scale domain computation
- Dataflow repropagation

Renderer only receives final numeric values (uniforms, ranges, indices) and
buffers. This avoids leaking expression logic or selection semantics into the
renderer.

### 7) Rendering order strategy — IN PROGRESS

Start simple: draw in view hierarchy order (current mental model).

- WebGPU renderer can later add safe local batching (within a view/layer) to
  reduce pipeline/bind-group switches.
- Avoid global reordering that could change visual stacking.

### 8) Pipeline/shader strategy — IN PROGRESS

Expect many unique shader variants due to encoding differences.

- Cache pipelines by stable keys (mark type + shader variant + blend mode).
- Avoid recompilation on param changes; keep dynamics in buffers/uniforms.
- ~100 unique shaders is acceptable if created once and reused.

### 9) Picking in WebGPU — IN PROGRESS

Maintain a dedicated picking pass:

- Render into offscreen texture (color attachment).
- Use per-instance IDs (unique ID buffer) and encode to output.
- Reuse the same draw order as the main pass.

### 10) Worker-compatible data pipeline — IN PROGRESS

Prepare for web workers:

- Workers load/transform data into typed arrays.
- Transfer `ArrayBuffer`s to main thread (zero copy).
- Renderer updates buffers without object reconstruction.

This is a strong motivator for the columnar data contract.

### 11) SDF text and font metadata split — IN PROGRESS

Renderer keeps GPU-side SDF rendering and glyph atlas.
Core still needs font metrics for layout/measurement.

Plan:

- Share font metadata from a small shared module/package.
- Renderer consumes metadata for atlas build.
- Core uses the same metadata for CPU-side text measurement.

### 12) Long-term vector output (SVG/canvas)

The renderer package should not prevent a future vector backend:

- Keep a stable "mark instance schema" that a future SVG/canvas backend can
  consume (x/y/x2/y2, fill/stroke, opacity, etc.).
- SVG/canvas backend can live in a separate package and implement the same
  draw API without GPU resources.

### 13) Port `glslScaleGenerator.js` to WGSL (step-by-step) — IN PROGRESS

Goal: reproduce the current GLSL scale codegen in WGSL while keeping names
compatible (`getScaled_`, `uDomain_`, `uRange_`, etc.). Range textures are
implemented first. Params/selections come last.

1) **Inventory current GLSL generator + call sites** — IN PROGRESS
   - Read `packages/core/src/gl/glslScaleGenerator.js` and note:
     - Prefixes (`attr_`, `uDomain_`, `uRange_`, `getScaled_`, etc.).
     - Generated pieces: accessor functions, scale functions, range texture
       lookups, selection checks, param-driven accessors.
   - Identify which mark shaders (`packages/core/src/marks/*.glsl`) rely on
     which generated functions.

2) **Define WGSL prefix constants (shared)** — OK
   - Mirror GLSL prefixes in `packages/webgpu-renderer/src/wgsl/prefixes.js`.
   - Use them in WGSL codegen (already started for `uDomain_`, `uRange_`,
     `getScaled_`).

3) **Port low-level scale math to WGSL** — OK
   - Map `packages/core/src/gl/includes/scales.glsl` to WGSL equivalents
     (already in `packages/webgpu-renderer/src/wgsl/scales.wgsl.js`).
   - Ensure scale helpers have identical signatures and edge-case behavior.

4) **Implement range textures (first-class in WGSL)** — OK
   - Decide texture format/layout for ranges (1D as 2D texture with height 1).
   - Add WGSL helpers for `uRangeTexture_*` lookups (like GLSL).
   - Plumb texture/sampler bindings into mark pipelines.
   - Provide renderer APIs to upload/update range textures from core.
   - WebGPU writeTexture requires 256-byte row alignment; helper utilities
     should pad rows and keep width/height metadata.

5) **Port accessor generation (data vs. value)** — OK
   - Translate `accessor_` function logic to WGSL.
   - Use WGSL storage buffers for `attr_*` data access (vertex pulling).
   - Support constants for non-dynamic values (inline WGSL literals).
   - Keep piecewise scale segment counts stable per scale instance; the size
     can change only when the scale is redefined (not per-frame).
   - Param/expr-driven accessors are still pending (see selection/params step).

6) **Port scale function generation** — IN PROGRESS
   - Generate `scale_*` functions that apply domain/range transforms.
   - Ensure `getScaled_*` wraps `accessor_*` + `scale_*` consistently.
   - Keep `getScaled_*` as the only mark-facing entry point.

7) **Handle discrete vs. continuous ranges** — OK
   - Reproduce discrete range mapping logic (`getDiscreteRangeMapper` path):
     - For small discrete ranges, inline literal vectors.
     - For large or dynamic ranges, route through range textures.
   - For categorical lookups, storage buffers can be a simpler alternative
     when interpolation is unnecessary.
   - For piecewise scales, treat domains/ranges as fixed-length arrays per
     scale instance to avoid per-frame pipeline changes.

8) **Recreate shared-field logic** — IN PROGRESS
   - Support shared quantitative channels in WGSL (`makeAttributeName` /
     shared accessors) to prevent duplicate buffer reads.

9) **Wire domain/range updates** — OK
   - Core supplies domains/ranges; renderer writes `uDomain_*` / `uRange_*`
     uniform entries.
   - Confirm default range behavior for positional channels (viewport-based).
   - Renderer APIs should document that piecewise domain/range arrays must keep
     a fixed length after initial setup; changing the length requires
     re-registering the scale (pipeline/bind group rebuild).

10) **Fill remaining GLSL generator gaps** — IN PROGRESS
    - Conditional encoders + selection predicates:
      - `generateConditionalEncoderGlsl` equivalents in WGSL
      - `checkSelection_*` helpers + selection mask plumbing
    - Param/expr accessors:
      - `uParam_*` uniforms and expr-ref driven accessors
    - High-precision/index/locus scales:
      - `isHighPrecisionScale`, `splitHighPrecision`, `toHighPrecisionDomainUniform`
      - `scaleBandHp` / `scaleBandHpU` equivalents and u64 emulation path
    - Additional scale families + metadata:
      - quantile/quantize (discretizing), time/utc (temporal), point scale
      - sequential/diverging family parsing (`splitScaleType`) + `isInterpolating`
    - Null handling:
      - `scaleNull` behavior for nulls in numeric/color channels

12) **Port selection + params last**
    - Implement `checkSelection_*` and `uParam_*` only after scale/texture
      parity is achieved.
    - Core remains responsible for evaluating params; renderer only consumes
      the final values or selection masks.

13) **Deprecate GLSL generator (final step)**
    - Once WGSL parity is achieved and all marks ported, remove GLSL generator
      usage from the WebGPU path while keeping GLSL for the WebGL backend.

### 14) Scale codegen pipeline (IR-style) — IN PROGRESS

This is a low-level internal refactor to make WGSL generation more composable
and ready for future features (high precision, conditional encoders). The API
surface stays the same; only codegen internals change.

1) **Introduce a pipeline model** — OK
   - `scalePipeline.js` defines steps that mutate an expression and append WGSL
     blocks.
2) **Route scale codegen through the pipeline** — OK
   - Continuous, piecewise, and threshold scales all go through the pipeline.
3) **Add tests for `markShaderBuilder` before widening scope** — OK
    - Current GPU tests cover WGSL helpers + scaleCodegen only.
4) **Unify value source resolution** — PENDING
   - Extract shared logic for constants/uniforms/storage buffers so both
     `scaleCodegen` and `markShaderBuilder` use the same source model.
5) **Add future steps** — PENDING
   - High precision (index/locus), conditional encoders, selection masks.

### Scale properties used by the renderer

Only a subset of `packages/core/src/spec/scale.d.ts` feeds the shader pipeline
via `glslScaleGenerator.js`. When porting to WebGPU, focus on these properties
and treat the rest as preprocessing handled in core.

Directly consumed by `glslScaleGenerator.js`:
- `type`
- `domain()` (and domain length for piecewise + high precision)
- `range()`
- `props.range` (raw range to detect ExprRef-driven dynamic ranges)
- `clamp()`
- `base()` (log)
- `constant()` (symlog)
- `exponent()` (pow/sqrt)
- `paddingInner()`, `paddingOuter()`, `align()` (band/point/index/locus)

Not consumed directly in the generator (handled upstream in core):
- `scheme`, `reverse`, `nice`, `domainMin/Max/Mid`, `bins`,
  `zero`, `round`, etc.

WebGPU-specific notes:
- `interpolate` is consumed by the WebGPU renderer to build ramp textures for
  sequential/piecewise color interpolation.

### Vega scale metadata alignment

`glslScaleGenerator` relies on category predicates (`isContinuous`,
`isDiscrete`, `isDiscretizing`, `isInterpolating`, `isLogarithmic`,
`isTemporal`). Vega derives these from scale metadata in
`vega-scale/src/scales.js`. When porting to WebGPU, keep the same metadata
flags in a scale registry so category checks remain consistent across WebGL
and WebGPU.

## WebGPU Migration Plan

This plan focuses on the remaining work. Completed items are omitted.

### Renderer package: remaining work

- Marks: text (ranged layout, edge fade, gamma, picking).
- Picking pass (offscreen ID buffer + readback).
- Viewport/scissor management.
- SDF text rendering (glyph atlas, shaders, layout helpers).
- Worker-friendly update path (transfer buffers, no object reconstruction).
- Optional vector backend compatibility (stable mark instance schema).

### Scale + shader codegen: remaining gaps

- Conditional encoders + selection predicates (`checkSelection_*`).
- Param/expr-driven accessors (`uParam_*`) and integration with core.
- Discretizing scales (quantile/quantize) and temporal scales (time/utc).
- Null handling behavior for numeric/color channels.
- Shared-field accessor reuse across channels where possible.
- Keep metadata predicates aligned with Vega scale registry.

#### Refactor candidates (redundancy cleanup)

- **Propagate range-texture decisions** — `buildChannelAnalysis` already computes `useRangeTexture`, but `scaleResources` recomputes it. Carry the analysis result through to avoid duplicated logic.
- **Move WGSL literal helpers** — `formatLiteral` lives in `scaleCodegen.js` but is used by shader IR generation; extract a shared WGSL literal utility module to avoid cross-layer imports.
- **Hash parity guard** — `hash32` exists in both JS (`hashTable.js`) and WGSL (`hashTable.wgsl.js`). Consider a parity test or codegen to keep them in sync.
- **Merge channel normalization paths** — Defaults and normalization are split between `channelSpecUtils.js` and `channelConfigResolver.js`. Pull defaulting/normalization into one place and keep validation separate.
- **Unify WGSL string helpers** — Small WGSL string helpers (domain/range accessors) are defined in both `scalePipeline.js` and `scaleCodegen.js`. Consolidate into a single helper module.

### Binding mitigation (storage buffer limit = 8)

We already hit the vertex-stage storage buffer cap. Mitigation options are
listed in recommended order:

0. **Temporary limit bump (stopgap)** — request
   `maxStorageBuffersPerShaderStage=10` if the adapter supports it. This keeps
   examples running while packing/dedupe work lands. Remove once we fit in 8.
1. **Binding dedupe by shared arrays** — DONE. Channels that share a
   `TypedArray` at mark creation re-use one binding; updates must keep the
   group shared.
2. **Stage-specific bindings** — only bind buffers in VERTEX or FRAGMENT
   based on usage.
3. **Packed series buffer (SoA inside one buffer)** — store all series in
   a single storage buffer + uniform metadata (offset/type/components).
   - Consider two packed buffers (u32 + f32) to avoid bitcasts.
4. **Move tables to textures** — ordinal ranges, glyph metrics, or other
   static tables can be sampled from textures.
5. **Diagnostics** — warn when a mark approaches per-stage limits and report
   binding usage in debug output.

Notes for text:

- Text should not allocate multiple per-glyph buffers. Favor a packed series
  buffer for glyph indices/positions + atlas texture + optional metrics table.
- Text migration plan (GPU-friendly layout):
  1. Build per-string instances in a packed series buffer (x/y/x2/y2/size/color/
     opacity/angle/flags + precomputed width).
  2. Build a glyph instance buffer with `stringId`, `glyphId`, and
     `xAdvanceOffset` (per-glyph local x).
  3. Provide a glyph metrics buffer (UVs + offsets/advance) and bind a single
     atlas texture (one font per mark).
  4. Move alignment, range fitting, and rotation into the vertex shader using
     per-string width + channel values.
  5. Keep MSDF sampling + AA in fragment; optional later: kerning + multiline.
- Incremental packed-series adoption:
  1. Add packed series layout metadata (`offset`, `stride`, `components`,
     `scalarType`) and two packed buffers (f32 + u32) per mark.
  2. Teach shader codegen to emit `readSeries_<channel>()` for both packed and
     legacy paths (opt-in at first).
  3. Migrate text: use packed series for per-string attributes and keep glyph
     - metrics buffers separate.
  4. Migrate a simple mark (rect/rule) to packed series, then flip defaults
     and remove legacy bindings once stable.

Ranged text plan (x2/y2 optional; only apply when defined):

1. **Introduce feature flags** — use `#if defined(x2_DEFINED)` /
   `#if defined(y2_DEFINED)` in WGSL and run via the WGSL preprocessor.
   Keep non-ranged path fast and branch-free.
2. **Add range inputs** — extend channel specs to include `x2`/`y2`
   (optional). Keep alignment/baseline behavior identical when undefined.
3. **Port range fitting** — implement `positionInsideRange` + `flush/padding`
   logic in WGSL, producing `{pos, scale}` for each axis when range is active.
4. **Rotation-aware alignment** — port `calculateRotatedDimensions` and
   `fixAlignForAngle` for ranged text so flush and padding account for angle.
5. **Scale-to-fit behavior** — implement `squeeze` behavior (fade vs. drop)
   with the same thresholds as WebGL.
6. **Viewport edge fade** — add uniforms and vertex-side computation of the
   edge fade opacity so ranged text respects viewport fade settings.

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
- `paddingInner()`, `paddingOuter()`, `align()` (band/point/index)

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

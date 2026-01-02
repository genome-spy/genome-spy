## WebGPU Migration Plan

This plan focuses on the remaining work. Completed items are omitted.

### Renderer package: remaining work

- Text: baseline alignment + vertical flip fix, edge fade, gamma, picking.
- Picking pass (offscreen ID buffer + readback).
- Viewport/scissor management.
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
   `maxStorageBuffersPerShaderStage=10` if the adapter supports it. Remove
   once packed-series usage keeps us under the default limit.
1. **Binding dedupe by shared arrays** — OK. Channels that share a
   `TypedArray` at mark creation re-use one binding; updates must keep the
   group shared.
2. **Stage-specific bindings** — only bind buffers in VERTEX or FRAGMENT
   based on usage.
3. **Packed series buffers** — OK. Store all series in two buffers (f32 + u32)
   with per-channel offset/type metadata; no per-channel bindings.
4. **Move tables to textures** — ordinal ranges, glyph metrics, or other
   static tables can be sampled from textures when it saves bindings.
5. **Diagnostics** — warn when a mark approaches per-stage limits and report
   binding usage in debug output.

Notes for text:

- Current implementation: packed series buffer for per-string attributes,
  a glyph instance buffer (`stringId`, `glyphId`, `xAdvanceOffset`), glyph
  metrics buffer (UVs + offsets/advance), and a single atlas texture per mark.
- Remaining work: fix baseline alignment + vertical flip, add edge fade/gamma
  parity, and implement picking + optional kerning/multiline.

Ranged text (x2/y2 optional; only apply when defined):

- **Implemented** — preprocessor-based gating, range fitting, rotation-aware
  alignment, and squeeze behavior.
- **Remaining** — verify alignment constants against uniform-based alignment,
  plus edge-fade parity and baseline fixes.

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

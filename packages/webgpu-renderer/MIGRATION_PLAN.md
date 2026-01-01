## WebGPU Migration Plan

This plan focuses on the remaining work. Completed items are omitted.

### Renderer package: remaining work

- Marks: rule/link/text (text needs atlas + layout).
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

### Binding mitigation (storage buffer limit = 8)

We already hit the vertex-stage storage buffer cap. Mitigation options are
listed in recommended order:

1) **Binding dedupe by shared arrays** — re-use one binding when multiple
   channels reference the same `TypedArray` (x/x2, y/y2).
2) **Stage-specific bindings** — only bind buffers in VERTEX or FRAGMENT
   based on usage.
3) **Packed series buffer (SoA inside one buffer)** — store all series in
   a single storage buffer + uniform metadata (offset/type/components).
   - Consider two packed buffers (u32 + f32) to avoid bitcasts.
4) **Move tables to textures** — ordinal ranges, glyph metrics, or other
   static tables can be sampled from textures.
5) **Diagnostics** — warn when a mark approaches per-stage limits and report
   binding usage in debug output.

Notes for text:

- Text should not allocate multiple per-glyph buffers. Favor a packed series
  buffer for glyph indices/positions + atlas texture + optional metrics table.

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

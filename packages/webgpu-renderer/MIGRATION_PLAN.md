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

### ScaleDef registry consolidation

Phase 1: **Document the ScaleDef contract** — OK. Expand the contract in
`scaleDefs.js` and centralize helper accessors (no behavior change).

Phase 2: **Use ScaleDef for validation** — OK. `channelAnalysis` now carries
scale metadata from the registry, and `channelConfigResolver` consumes it with
fallbacks.

Phase 3: **Move resource requirements into ScaleDef** — OK. Scale resource
requirements are resolved from the registry and consumed in `scaleResources`.

Phase 4: **Move WGSL emission into ScaleDef** — OK. Scale emitters now live
alongside the registry; `scaleCodegen` delegates to per-def emitters.

Phase 5: **Consolidate helpers** — merge shared WGSL utilities and remove
legacy paths once parity tests pass.

Phase 6: **Per-scale modules + centralized validation** — move each scale into
its own file (e.g., `scales/defs/linear.js`, `log.js`, `band.js`) with a shared
`scaleValidation.js` toolkit. Keep a thin registry in `scaleDefs.js` that
imports these definitions.

Phase 7: **ScaleDef-driven validation hooks** — replace scattered checks in
`channelConfigResolver` and `scaleCodegen` with a single `validateScaleConfig`
pipeline that uses `ScaleDef` metadata and optional per-scale `validate`
functions.

Phase 8: **Emitter/toolkit split** — keep emitters in per-scale modules but
reuse shared helpers (clamp/round/piecewise/ramp sampling) from
`scalePipeline.js` (or a renamed shared WGSL toolkit) to avoid duplication.

#### Current State / Context (handoff)

- ScaleDef registry now owns resource rules and WGSL emitters; `scaleCodegen`
  delegates to `ScaleDef.emit`, and `scaleResources` consumes
  `getScaleResourceRequirements`.
- Emitters live in `src/marks/scales/scaleEmitters.js`; registry in
  `src/marks/scales/scaleDefs.js`.
- Validation is still split between `channelConfigResolver.js` and
  `scaleCodegen.js` (this is what Phase 6–8 intends to centralize).
- `domainRangeUtils.js` now consults `getScaleResourceRequirements` for
  domain/range kinds.
- Tests updated: `scaleDefs.test.js` now checks resource requirements.

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

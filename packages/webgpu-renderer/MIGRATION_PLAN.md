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

Phase 5: **Consolidate helpers** — OK. Shared WGSL literal helpers and piecewise
utilities live in dedicated modules (`wgsl/literals.js`, `scales/scaleUtils.js`).

Phase 6: **Per-scale modules + centralized validation** — OK. Each scale lives
in `scales/defs/*` and `scaleValidation.js` owns shared config checks; the
registry in `scaleDefs.js` just imports the per-scale defs.

Phase 7: **ScaleDef-driven validation hooks** — OK. `validateScaleConfig` now
drives scale-specific checks and is invoked from `channelConfigResolver`.

Phase 8: **Emitter/toolkit split** — OK. Emitters live in
`scales/emitters/*` with shared helpers in `emitters/utils.js` and
`scalePipeline.js`.

#### Current State / Context (handoff)

- ScaleDef registry now owns resource rules and WGSL emitters; `scaleCodegen`
  delegates to `ScaleDef.emit`, and `scaleResources` consumes
  `getScaleResourceRequirements`.
- Emitters live in `src/marks/scales/scaleEmitters.js`; registry in
  `src/marks/scales/scaleDefs.js`.
- Validation now flows through `scaleValidation.js` and is invoked from
  `channelConfigResolver` / `scaleCodegen`.
- `domainRangeUtils.js` now consults `getScaleResourceRequirements` for
  domain/range kinds.
- Tests updated: `scaleDefs.test.js` now checks resource requirements.

#### Refactor candidates (redundancy cleanup)

- **Propagate range-texture decisions** — `buildChannelAnalysis` already computes `useRangeTexture`, but `scaleResources` recomputes it. Carry the analysis result through to avoid duplicated logic.
- **Move WGSL literal helpers** — OK. `formatLiteral` lives in `wgsl/literals.js` and is shared across IR/codegen.
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

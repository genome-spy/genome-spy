## WebGPU Migration Plan

This plan focuses on the remaining work. Completed items are omitted.

### Renderer package: remaining work

- Text: baseline alignment + vertical flip fix, edge fade, gamma, picking.
- Picking pass (offscreen ID buffer + readback).
- Viewport/scissor management.
- Worker-friendly update path (transfer buffers, no object reconstruction).
- Optional vector backend compatibility (stable mark instance schema).
- Slot handles for values/scales (see detailed plan below).
- Decide code-first API direction (defs vs. instances), then align public types.

### Scale + shader codegen: remaining gaps

- Param/expr-driven accessors (`uParam_*`) and integration with core.
- Discretizing scales (quantile/quantize) and temporal scales (time/utc).
- Null handling behavior for numeric/color channels.

### Selections: remaining gaps

- Provide a stable way to address conditional scale branches (synthetic
  channel names are currently internal).
- Optional selection-driven filtering/masking (skip drawing non-selected
  instances without requiring core-side filtering).
- Explicit selection docs in public API (uniqueId requirements, predicate
  ordering semantics).

### Slots for values + scales (detailed plan)

Goal: make updates lean and stable even when scales/values are buried in
conditions. Slots are prevalidated handles created at mark construction;
updates should avoid name lookups and heavy validation.

1. **Define slot handle contracts** — add internal types for `ScaleSlotHandle`
   and `ValueSlotHandle` (methods + metadata). Each slot stores:
   - channel name, condition branch key (default/when/else)
   - expected scalar type + components
   - resource target kind (uniform, range texture, domain map, ordinal range)
   - fixed array lengths (for shape stability checks)
2. **Build slots at mark creation** — when normalizing channels, enumerate
   all scale/value occurrences (default + each condition branch) and create
   a slot per occurrence. Keep them on the mark program instance, and return
   them from `createMark` alongside `markId` so the caller can hold references.
3. **Lean update path** — slot setters perform only:
   - minimal shape/type checks (length, component count)
   - write to precomputed uniform offsets / texture rows / buffers
   - set dirty flags for GPU upload
   Scale/mark revalidation should not be repeated on updates.
4. **Dynamic vs. static values** — if a value is static, its slot should
   throw on updates (explicitly require mark recreation). If `dynamic: true`,
   the slot writes to uniforms and supports updates.
5. **Conditional branches** — expose nested slot handles with stable branch
   keys (default + `when:<selection>`). The ordering used in shader code must
   match the ordering of slot handles.
6. **Optional signals** — allow `slot.set(signalLike)` as an adapter, but keep
   subscription and lifetimes explicit and opt-in. Signals should not be the
   primary update mechanism.
7. **Docs + tests** — document how to obtain and use slots, and add tests:
   - slot creation matches condition branches
   - updating a slot changes rendering without rebuild
   - updating a static slot throws

### Code-first API direction (classes vs. defs)

Goal: decide whether users pass scale/mark instances (tree-shakeable,
typed, code-first) or use the current name/registry approach.

- **If instance-based**: scale/mark instances are immutable definitions that
  expose minimal hooks (`emitWGSL`, `validate`, `resourceRequirements`, and
  default config). Instances hold no mutable GPU state. Runtime state lives in
  slots/program instances, so reusing an instance across marks is safe. Any
  change that alters resource shapes (array lengths, output arity, range kind)
  requires recreating the mark/pipeline; runtime updates happen via slots.
- **If def-based**: keep registry for built-ins but provide per-scale entry
  points to improve tree-shaking. Consider explicit registration to avoid
  side-effect imports.
- Avoid supporting both paths unless needed; dual-path support adds surface
  area and maintenance cost.

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

Phase 7: **ScaleDef-driven validation hooks** — OK. Each scale exposes a
`validate` hook and `scaleValidation.js` delegates scale-specific checks to it.

Phase 8: **Emitter/toolkit split** — OK. Emitters live alongside each scale
definition in `scales/defs/*`, with shared helpers in `scaleEmitUtils.js` and
`scalePipeline.js`.

#### Current State / Context (handoff)

- ScaleDef registry now owns resource rules, WGSL snippets, and emitters;
  `scaleCodegen` delegates to `ScaleDef.emit`, and `scaleResources` consumes
  `getScaleResourceRequirements`.
- WGSL scale helpers are assembled from `wgsl/scaleCommon.wgsl.js` plus
  per-scale snippets via `scaleWgsl.js`, so custom scales can contribute WGSL.
- Validation now flows through `scaleValidation.js` (shared checks + per-scale
  `validate` hooks) and is invoked from `channelConfigResolver` / `scaleCodegen`.
- `scaleStops.js` now consults `getScaleResourceRequirements` for stop-array
  kinds.
- Tests updated: `scaleDefs.test.js` now checks resource requirements.

#### Refactor candidates (redundancy cleanup)

- **Propagate range-texture decisions** — `buildChannelAnalysis` already computes `useRangeTexture`, but `scaleResources` recomputes it. Carry the analysis result through to avoid duplicated logic.
- **Move WGSL literal helpers** — OK. `formatLiteral` lives in `wgsl/literals.js` and is shared across IR/codegen.
- **Hash parity guard** — `hash32` exists in both JS (`hashTable.js`) and WGSL (`hashTable.wgsl.js`). Consider a parity test or codegen to keep them in sync.
- **Merge channel normalization paths** — Defaults and normalization are split between `channelSpecUtils.js` and `channelConfigResolver.js`. Pull defaulting/normalization into one place and keep validation separate.
- **Unify WGSL string helpers** — Small WGSL string helpers (domain/range accessors) are defined in both `scalePipeline.js` and `scaleCodegen.js`. Consolidate into a single helper module.
- **Scale module polish** — Each scale now owns emit/validate/WGSL. Consider
  moving scale-specific validation into the per-scale files exclusively and
  keeping `scaleValidation.js` limited to shared checks.

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

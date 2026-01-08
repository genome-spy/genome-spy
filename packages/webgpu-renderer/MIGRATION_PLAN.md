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

### Codebase review: findings & opportunities

Findings (issues to address):
- **Selections lack GPU/integration tests** — codegen tests exist, but there is
  no GPU coverage for predicate evaluation + resource updates across the three
  selection types. Add at least one GPU test per selection type.
- **Scale rules are spread across multiple files** — `channelAnalysis.js`,
  `scaleValidation.js`, `scaleStops.js`, and `scaleResources.js` each encode
  pieces of scale behavior; drift is likely.
- **Per‑update work still allocates** — range/domain setters still normalize
  data and (re)compute stop data; for per‑frame updates this risks GC churn.
- **Text rendering lacks GPU tests** — only layout tests exist; sampling +
  alignment is unverified at the GPU level.
- **`ordinalDomain.js` naming is misleading** — it is mostly validation, not
  normalization; rename or split validation/normalization helpers.

Opportunities (cleanup/structure):
- **Centralize scale capabilities in `ScaleDef`** — derive output rules,
  vector output, stop kinds, and resource needs directly from defs to reduce
  scattered checks.
- **Make setters minimal** — preallocate typed arrays for stops/range positions
  and have setters only copy values and flag dirty state.
- **Add GPU tests for non‑scale marks** — text/rule/point smoke tests that
  validate basic output colors/coverage to prevent regressions.
- **Formalize a “scale toolkit” module** — consolidate shared math/validation
  helpers so per‑scale files stay concise.

#### Plan: consolidate scale rules (detailed)

Goal: make `ScaleDef` the single source of truth for what a scale accepts,
emits, and requires, so `channelAnalysis.js`, `scaleValidation.js`,
`scaleStops.js`, and `scaleResources.js` only query metadata and avoid
scale-type conditionals.

1. **Extend `ScaleDef` metadata**
   - Add/confirm fields: `input` (numeric/u32/any), `output`
     (scalar type resolver), `vectorOutput` (never/always/interpolated),
     `resources` (stopKind, needsDomainMap, needsOrdinalRange), `stopRules`
     (min/max lengths, piecewise behavior), `rangePolicy`
     (allowsColor, allowsFunction, requiresVec4).
   - File: `src/marks/scales/scaleDefs.js` + per-scale defs in
     `src/marks/scales/defs/*`.

2. **Refactor `channelAnalysis.js`**
   - Replace local logic (`rangeIsFunction`, `rangeIsColor`,
     `interpolateEnabled`, `allowsScalarToVector`) with helper accessors that
     read `ScaleDef`.
   - Keep only data-shape decisions (inputComponents/outputComponents) and
     channel source kind.

3. **Refactor `scaleValidation.js`**
   - Reduce to shared validation that is independent of scale type and then
     delegate scale-specific checks to `ScaleDef.validate`.
   - Avoid recomputing interpolate/vec4 logic here; use `ScaleDef` rules.

4. **Refactor `scaleStops.js`**
   - Remove scale-type checks (e.g., band/index) and derive stop handling from
     `ScaleDef.resources.stopKind` and `ScaleDef.stopRules`.
   - Keep only data-shape/length normalization and piecewise packing.

5. **Refactor `scaleResources.js`**
   - Replace any scale-type or rule checks with `ScaleDef.resources` lookups.
   - Ensure setters only use precomputed `ScaleDef` metadata and do not
     recompute range/stop policies.

6. **Update tests**
   - Add unit tests for `ScaleDef` metadata invariants (e.g., vector output
     rules for scales with function ranges).
   - Update `scaleValidation.test.js` (if added) and `scaleStops.test.js` to
     assert behavior is driven by defs, not type checks.

7. **Cleanup**
   - Remove duplicated helpers (e.g., `allowsVectorOutput` logic) after
     consolidation.
   - Document the final `ScaleDef` contract for custom scales.

#### Plan: minimal work per slot setter (detailed)

Goal: ensure domain/range updates only copy data into preallocated buffers and
set dirty flags, avoiding normalization/rebuild work on hot paths.

1. **Precompute per-slot handlers**
   - When a scale slot is created, bind a tiny `set` function that captures:
     uniform offsets, typed array views, range texture writer, and any fixed
     lengths.
   - File: `src/marks/programs/scaleResources.js`.

2. **Preallocate scratch storage**
   - Allocate reusable typed arrays for stop arrays, range positions, and
     domain maps per slot (or per scale) rather than per update call.
   - File: `src/marks/scales/scaleStops.js`, `src/marks/scales/ordinalDomain.js`.

3. **Move normalization to initialization**
   - Normalize static inputs (e.g., domain length, range color conversion,
     stop count) during `initializeScale` and store results on the slot.
   - Keep update-time logic to direct copies into the precomputed layouts.

4. **Split “validate vs. copy” paths**
   - Move validation into the slot creation phase (and keep minimal
     shape/length checks on updates).
   - For dynamic updates, only enforce invariants that prevent buffer
     corruption (length/stride/type), not semantic validation.

5. **Range texture updates**
   - Pre-bind the texture writer with the row/offset for each slot so the
     setter can call a single copy helper without recomputing placement.
   - File: `src/marks/programs/scaleResources.js`,
     `src/utils/webgpuTextureUtils.js`.

6. **Tests + perf check**
   - Add a unit test that asserts setters do not allocate (reuse buffers).
   - Add a microbenchmark or GPU test that updates ranges in a tight loop and
     verifies no rebinds are triggered.

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

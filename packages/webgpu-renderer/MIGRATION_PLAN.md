## WebGPU Migration Plan

This plan focuses on the remaining work. Completed items are omitted.

### Renderer package: remaining work

- Text: baseline alignment + vertical flip fix, edge fade, gamma, picking.
- Picking pass (offscreen ID buffer + readback).
- Viewport/scissor management.
- Worker-friendly update path (transfer buffers, no object reconstruction).
- Optional vector backend compatibility (stable mark instance schema).
- Decide code-first API direction (defs vs. instances), then align public types.

#### Picking implementation plan (incremental)

Goal: provide a `pick(x, y)` API that returns the globally unique `uniqueId`
for the topmost mark at a screen pixel, using an offscreen ID pass. Keep the
main pass untouched and keep per-frame work minimal.

1. **Core data + contracts**
   - Require `uniqueId` channel (u32) on marks that should be pickable.
   - When not provided, mark is not pickable (skip in pick pass).
   - Use an offscreen `rgba8unorm` target (pack u32 into RGBA); add a TODO for
     `r32uint` once supported across targets.

2. **Renderer-level surface**
   - Add `pick(x, y)` method that:
     - Ensures the pick render target exists (size = canvas size * dpr).
     - Re-renders the picking pass if `pickingDirty` is set.
     - Reads back one pixel and decodes the u32.
   - Add `markPickingDirty()` hook; any scale updates and selection updates
     should set it, alongside data/viewport changes.

3. **Pick render pass**
   - Add a per-renderer pick pass that:
     - Uses the same view/layout state but renders into the pick target.
     - Uses a dedicated fragment shader (`fs_pick`) emitted by `markShaderBuilder`.
     - Skips blending; just overwrite with the encoded ID.

4. **Per-mark integration**
   - Emit `pickId` in `VSOut` only when the mark is pickable.
   - Bind the `uniqueId` channel as series (u32) and add `getScaled_uniqueId`.
   - For marks without `uniqueId`, either skip the pick pipeline or emit
     a zero pickId (and treat zero as “no hit”).
   - Prefer coverage-based picking (reuse the mark’s fragment coverage/alpha
     logic), but allow mark-specific overrides in WGSL:
     - Text: pick the whole quad for better usability (ignore SDF discard).
     - Rule: keep dash gaps pickable by bypassing the dash mask in the pick path.

5. **Resource plumbing**
   - Add a pick pipeline to each program (likely shared state with the main
     pipeline; only the fragment entry point differs).
   - Add an optional pick bind group layout (same buffers, no extra resources).
   - Ensure pick textures are recreated on resize and invalidated on device loss.

6. **API + docs**
   - Document that `uniqueId` must be globally unique across all marks.
   - Clarify that pick uses the last rendered frame’s data; changes to data,
     scales, or selections invalidate it.

7. **Testing**
   - **GPU test**: render a single mark into pick target and assert readback
     equals the expected u32.
   - **GPU test**: overlapping marks (two IDs) ensures topmost wins.
   - **GPU test**: update scale/range and ensure pick changes (pickingDirty).

8. **Performance follow-ups**
   - Add a small readback buffer cache to avoid allocations per pick.
   - Optional: throttle pick pass to only re-render on dirty state.

9. **Incremental delivery cadence**
   - Implement in small, testable steps (resource wiring → WGSL path → render
     pass → readback → API). Run GPU tests after each step to catch regressions
     early and avoid large, hard-to-debug changes.

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

### GPU test debugging: mark-shader-builder compute pass returns zeros

Status: **tests fail** for `mark-shader-builder.gpu.test.js` (compute pass for
series-backed scales). Example scenes render correctly.

**Symptom**
- Test: `markShaderBuilder executes series-backed scales in a compute pass`
  writes all zeros instead of scaled values.
- Even with debug modes that bypass scaling, output remains all zeros.

**Relevant files**
- Tests: `packages/webgpu-renderer/tests/mark-shader-builder.gpu.test.js`
- Helpers: `packages/webgpu-renderer/tests/scaleShaderTestUtils.js`
- Shader builder: `packages/webgpu-renderer/src/marks/shaders/markShaderBuilder.js`
- Pipeline/bindings: `packages/webgpu-renderer/src/marks/programs/internal/pipelineBuilder.js`
- Renderer scaffolding: `packages/webgpu-renderer/src/renderer.js`

**Debug flags (already wired)**
- `SCALE_TEST_READ_SERIES=1` — compute shader writes `read_x(i)` to output.
- `SCALE_TEST_COPY_SERIES=1` — bypass compute, GPU copies series buffer to
  readback buffer (also adds `COPY_SRC` usage).
- `SCALE_TEST_DUMP_OUTPUT=1` — dumps JSON outputs to `test-results/`.
- `DUMP_MARK_SHADER=1` — dumps WGSL/JSON for the shader under test.

**Commands used**
```
DUMP_MARK_SHADER=1 npx playwright test -c packages/webgpu-renderer/playwright.config.js \
  --grep "executes series-backed scales in a compute pass" --timeout 120000

SCALE_TEST_READ_SERIES=1 SCALE_TEST_COPY_SERIES=1 SCALE_TEST_DUMP_OUTPUT=1 \
  DUMP_MARK_SHADER=1 npx playwright test -c packages/webgpu-renderer/playwright.config.js \
  --grep "executes series-backed scales in a compute pass" --timeout 120000
```

**Observed artifacts**
- `test-results/mark-shader-<test>-x-f32-linear-*.wgsl` shows bindings:
  params @group(1) @binding(0), `seriesF32` @binding(1), output @binding(2).
- Output JSON contains only zeros even when `read_x(i)` is used or when
  `COPY_SRC` path is enabled.

**Likely culprits**
- Series buffer not written or not bound as expected.
- Bind group layout/binding mismatch for compute path.
- `writeBuffer` or `copyBufferToBuffer` not executed as intended in the test
  harness.

**Next steps (incremental)**
1. Add a micro GPU sanity test that does only:
   `device.queue.writeBuffer` → `copyBufferToBuffer` → `mapAsync`,
   to confirm GPU writes/reads in the harness.
2. If that passes, isolate compute wiring:
   minimal compute shader that copies `seriesF32[i]` to output.
3. Compare bind group layout entries against the dumped WGSL.
4. If compute still fails, check `scaleShaderTestUtils` for binding index
   assumptions or missing `COPY_DST`/`STORAGE` usage flags.

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
- Slot handles for values/scales are in place; updates route through slots and
  avoid name-based update APIs.

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

## GPU Test Debugging: mark-shader-builder compute pass returns zeros

This section is a handoff for a fresh chat or a smaller model to continue
debugging quickly without reading the whole codebase.

### Symptom
- `packages/webgpu-renderer/tests/mark-shader-builder.gpu.test.js` fails.
- The test "markShaderBuilder executes series-backed scales in a compute pass"
  returns all zeros instead of scaled values.
- Example failing assertion: expected 5, received 0.

### What was verified
- The generated WGSL looks correct and compiles.
- `getScaled_x(i)` is correct in shader output.
- Even when the compute shader is forced to return `read_x(i)` directly,
  output is still all zeros.
- Even when bypassing compute output and copying the series buffer directly
  into the readback buffer, the output is still all zeros.

Conclusion: the issue is **not** in scale logic or shader code. The series
buffer data is not reaching the GPU buffer or not being copied back correctly.

### Commands used (single-test repro)
```
DUMP_MARK_SHADER=1 npx playwright test -c packages/webgpu-renderer/playwright.config.js --grep "executes series-backed scales in a compute pass" --timeout 120000
```

Debug flags (added in `tests/scaleShaderTestUtils.js`):
```
SCALE_TEST_READ_SERIES=1    # compute writes read_x(i) instead of getScaled_x(i)
SCALE_TEST_COPY_SERIES=1    # copy series buffer directly to readback (bypass output)
SCALE_TEST_DUMP_OUTPUT=1    # dump output JSON to test-results/
```

### Relevant files
- `packages/webgpu-renderer/tests/mark-shader-builder.gpu.test.js`
- `packages/webgpu-renderer/tests/scaleShaderTestUtils.js`
- `packages/webgpu-renderer/tests/gpuTestUtils.js`
- `packages/webgpu-renderer/src/marks/shaders/markShaderBuilder.js`
- `packages/webgpu-renderer/src/marks/programs/internal/packedSeriesLayout.js`

### Expected vs. actual dump artifacts
Dumped WGSL/JSON files live in repo-root `test-results/` when `DUMP_MARK_SHADER=1`.
The debug output file (when `SCALE_TEST_DUMP_OUTPUT=1`) is:
```
test-results/markshaderbuilder-executes-series-backed-scales-in-a-compute-pass-output.json
```
It shows `output: [0, 0, 0]`.

### Likely culprits to investigate (most to least likely)
1. **Series buffer upload / visibility**  
   - `runScaleCompute` creates the series buffers and writes data via
     `device.queue.writeBuffer`, but the readback remains zero.
   - The buffers might not be in the right bind group or their bindings could
     be misaligned with the shader layout.
2. **Bind group layout mismatch**  
   - Compute harness uses group(0)/group(1) layouts; the binding order in
     `markShaderBuilder` may not match the test harness assumptions.
3. **Resource binding numbering**  
   - The output binding is `initial.resourceBindings.length + 1`, and the
     series buffer binding comes from `resourceBindings`. A mismatch could
     yield a valid pipeline that reads from the wrong buffer.
4. **ArrayBuffer serialization in Playwright**  
   - The test harness converts typed arrays to plain arrays for `page.evaluate`.
     If this serialization is flawed (e.g., wrong type or empty array), the
     GPU buffer would contain zeros.
5. **Buffer usage flags**  
   - Series buffers need `COPY_SRC` when `SCALE_TEST_COPY_SERIES=1`.
     This was added, but if not applied consistently it can result in zeros.

### Suggested next diagnostic step (low-cost)
Add a micro GPU test that does **only**:
`writeBuffer → copyBufferToBuffer → mapAsync`, without any shader.  
If that fails, the harness is broken. If it passes, the bind group layout or
shader bindings are the issue.

### Incremental workflow
Run only one test with grep and a single debug switch at a time. Keep dumps
enabled only when needed to avoid extra churn.

### Debug instrumentation added
- `tests/harness-queue-copy.gpu.test.js` and `tests/storage-buffer-write.gpu.test.js` verify `writeBuffer → copyBufferToBuffer → mapAsync` works even when buffers are declared as `STORAGE`, covering the exact usage that plagued the compute pass.
- `scaleShaderTestUtils.js` now normalizes uniforms (injecting `__scale_dummy` when none exist), emits stub `VSOut`/`shade` helpers so compute entry points always compile, logs series payloads when `SCALE_TEST_LOG_BUFFERS=1`, and exposes `runSeriesCopyCase` which copies `seriesF32` straight into the output for binding verification.
- `tests/series-buffer-binding.gpu.test.js` uses `runSeriesCopyCase` to prove `seriesF32` retains the expected values before any scaling logic runs; these helpers/dumps stay so future GPU failures can be triaged with the documented flags (`SCALE_TEST_LOG_BUFFERS`, `SCALE_TEST_COPY_SERIES`, `SCALE_TEST_READ_SERIES`, `SCALE_TEST_DUMP_OUTPUT`).

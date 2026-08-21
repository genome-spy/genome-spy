## WebGPU Migration Plan

This plan focuses on the remaining work. The feature-parity milestones are
implemented in commits recorded in
`plans/webgpu-core-integration/webgpu-renderer-parity-plan.md`.

### Completed mark parity

- Endpoint offsets are explicit pixel-valued channels for rectangles, rules,
  ranged text, links, and arrows.
- Rules support dash atlases and point marks support the `x` and `+` line
  shapes.
- Rectangles support independent corner radii, hatch patterns, and rounded-box
  shadows.
- Core dispatches link marks and arrow marks through public retained renderer
  definitions.

### Renderer package: remaining work

- WebGL mark-feature parity is tracked in
  `plans/webgpu-core-integration/webgpu-renderer-parity-plan.md`; the current
  inventory covers endpoint offsets, rule dashes, point line shapes, rectangle
  radii/shadows, links, arrows, and remaining adapter rejection paths.
- The link property `noFadingOnPointSelection` is currently retained in Core
  configuration but is not applied by the WebGPU link shader because the
  renderer has no generic point-selection aggregate predicate yet.
- Text: baseline alignment + vertical flip fix, edge fade, gamma.
- Per-occurrence opacity and scale state for repeated views whose positional
  ranges differ.
- Worker-friendly update path (transfer buffers, no object reconstruction).
- Optional vector backend compatibility (stable mark instance schema).
- Split development-only validation from always-on public safety checks and
  prove production dead-code elimination with dual bundle fixtures, following
  the API direction note's production validation policy.

#### Picking implementation

The renderer and Core now provide an offscreen `rgba8unorm` ID pass, filtered
pick draws, DPR-aware asynchronous readback, and stale-result protection in the
non-faceted interaction path. Facet-scoped picking remains postponed with
faceted rendering.

### Scale + shader codegen: remaining gaps

- Param/expr-driven accessors (`uParam_*`) and integration with core.
- Quantile, bin-ordinal, and temporal scales remain intentionally unsupported.
- Null handling behavior for numeric/color channels.

### Selections: remaining gaps

- Provide a stable way to address conditional scale branches (synthetic
  channel names are currently internal).
- Optional selection-driven filtering/masking (skip drawing non-selected
  instances without requiring core-side filtering).
- Generic point visibility predicates and semantic-zoom selection bypasses are
  tracked separately in the parity plan.

### Code-first API direction (classes vs. defs)

Decision: use explicitly imported immutable definition values. Runtime state
lives in renderer-created programs and slots, so definitions are reusable and
contain no device resources.

Definition migration — complete:

- the generic renderer accepts `MarkDefinition` values and imports no built-in
  mark switch;
- all built-in marks and scales have side-effect-free public subpaths;
- shader, validation, and resource helpers consume scale definitions directly;
- a bundle fixture proves that point plus linear excludes unrelated marks,
  scales, and font support;
- the string API, compatibility entry, and production scale registry have been
  removed after migrating examples and the Core PoC.

Ordered frame submission — complete:

- `renderer.render({ draws, clearColor })` draws retained-handle occurrences in
  caller-provided order, with logical-pixel viewports, scissors, and instance
  ranges;
- the visible and picking passes consume the same normalized draw list;
- one retained handle can be drawn multiple times without duplicating its GPU
  resources;
- the Core proof of concept consumes completed layout results without another
  view traversal;
- compatible Core marks reuse their renderer handles and update public series,
  scale, and value slots between frames;
- `handle.series.replace()` replaces complete logical series through a
  definition-owned updater; text rebuilds glyph layout and expanded channels
  without recreating its pipeline or font atlas;
- logical text arrays are strictly per-string and preserve source-array aliases
  during glyph expansion; empty series use valid minimum-sized GPU buffers;
- a single series-backed default or conditional branch is replaced through its
  stable logical channel name; multiple series branches remain renderable but
  intentionally reject public replacement until branch IDs are designed;
- growing packed series destroy the superseded GPU buffer;
- the former renderer-level `updateSeries(markId, ...)` compatibility surface
  has been removed;
- frame order is independent of allocation order, so z-order changes do not
  require resource recreation.

Deterministic resource lifetime — complete:

- `destroyMark(markId)` disposes a retained mark without importing Core
  lifecycle types;
- idempotent `renderer.destroy()` disposes all marks, global and picking
  resources, unconfigures the canvas context, and destroys the renderer-owned
  device;
- mark disposal releases current series, scale, selection, uniform, and extra
  resources, while resource replacement releases superseded allocations;
- retained update slots and renderer entry points fail after destruction, and
  late text-atlas completion cannot upload or invalidate the host;
- Core surfaces and standalone examples use whole-renderer destruction for
  terminal cleanup.

The exact custom mark extension and scale-authoring contracts remain
experimental, but they no longer block migration of built-in features.

### ScaleDef consolidation history

Phase 1: **Document the ScaleDef contract** — OK. Define scale metadata and
centralize helper accessors without changing behavior.

Phase 2: **Use ScaleDef for validation** — OK. `channelAnalysis` carries scale
metadata from imported definitions, and `channelConfigResolver` consumes it.

Phase 3: **Move resource requirements into ScaleDef** — OK. Imported
definitions provide the requirements consumed in `scaleResources`.

Phase 4: **Move WGSL emission into ScaleDef** — OK. Scale emitters live beside
their definitions; `scaleCodegen` delegates to per-definition emitters.

Phase 5: **Consolidate helpers** — OK. Shared WGSL literal helpers and piecewise
utilities live in dedicated modules (`wgsl/literals.js`, `scales/scaleUtils.js`).

Phase 6: **Per-scale modules + centralized validation** — OK. Each scale lives
in `scales/defs/*`, while `scaleValidation.js` owns shared config checks.

Phase 7: **ScaleDef-driven validation hooks** — OK. Each scale exposes a
`validate` hook and `scaleValidation.js` delegates scale-specific checks to it.

Phase 8: **Emitter/toolkit split** — OK. Emitters live alongside each scale
definition in `scales/defs/*`, with shared helpers in `scaleEmitUtils.js` and
`scalePipeline.js`.

#### Current State / Context (handoff)

### Core adapter limitations still requiring follow-up

The following are intentionally explicit gaps, rather than silently ignored
WebGL behavior:

- Faceted rendering is rejected by the Core adapter.
- Conditional channel encodings are translated by the Core adapter; multiple
  series-backed branches still require a renderer branch-update contract.
- Data-driven enum properties such as point shape, rule cap, and arrow
  direction require constant values; data-driven colors require a supported
  scale.
- Unsupported scale families (including quantile, bin-ordinal, and temporal
  scales) are rejected with contextual errors.
- Core forwards `uniqueId` channels to the WebGPU definitions and connects the
  renderer pick pass to non-faceted hover and tooltip handling.
- Link selection-aware arc fading and full Core selection semantics remain a
  follow-up to generic selection predicates in mark shaders.

- Imported ScaleDef values own resource rules, WGSL snippets, and emitters;
  `scaleCodegen` delegates to `ScaleDef.emit`, and `scaleResources` consumes
  `getScaleResourceRequirements`.
- WGSL scale helpers are assembled from `wgsl/scaleCommon.wgsl.js` plus
  per-scale snippets via `scaleWgsl.js`, so custom scales can contribute WGSL.
- Validation now flows through `scaleValidation.js` (shared checks + per-scale
  `validate` hooks) and is invoked from `channelConfigResolver` / `scaleCodegen`.
- `scaleStops.js` now consults `getScaleResourceRequirements` for stop-array
  kinds.
- Test-only fixtures import the scale definitions they exercise directly.
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
   - Files: per-scale definitions in `src/marks/scales/defs/*` and generic
     accessors in `src/marks/scales/scaleDefinition.js`.

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

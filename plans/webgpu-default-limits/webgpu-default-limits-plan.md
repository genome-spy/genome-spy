# WebGPU default limits: example audit and mitigation design

Status: default device limits and repeatable example audit implemented;
scale/gap packing, mixed-series packing, startup byte negotiation, and audit
forcing are implemented. Final integration verification remains in progress.

The font startup race found by the audit is now fixed in Core's shared render
entry point: resize and animation callbacks can update layout during launch,
but drawing waits until startup preparation finishes. Launch requests a fresh
frame afterward. A focused regression test covers both callback paths, the
first post-startup frame, and subsequent resize rendering. The three browser
reproductions (`rules.json`, `multi-url-bigwig.json`, and
`bpreveal-pisa-matrix.json`) now pass with visible content and labels. The full
238-spec rerun on default limits returned 232 passes and 6 failures. All 13
previous font failures now pass. The remaining failures are the same five
9/8 storage-binding cases and the arrow playground's zero-height canvas.

## Goals and scope

- Keep binding counts at standard WebGPU defaults. Simple plots must work on
  all devices supporting full WebGPU; compatibility mode is outside this scope.
- Request supported buffer-size limits at startup, before dataset sizes are
  known. Large datasets may require more byte capacity than some devices offer.
- Retain a strictly default-limit example audit, including buffer byte limits,
  independently of normal startup negotiation.
- Exercise every JSON specification under `examples/core` and `examples/docs`
  with real browser WebGPU validation, including remotely loaded data.
- Report failures separately from resource headroom. Preserve every example's
  encodings, selection semantics, text, shapes, placement, and picking.
- Keep resource packing inside the unpublished renderer. Core must continue
  using documented mark and scale APIs without knowing buffer layouts.
- Preserve #563's direct GPU-table borrowing, live updates, and ownership
  transfer, including the linked selection consumers in #562.

This audit covers initialization, initial visible lazy data, the initial
render, and a canvas screenshot. It does not exhaust interactions, hidden
tracks, future lazy-data viewports, pixel parity, or every possible combination
of renderer features. Other failures found by the sweep are reported; repairing
them is separate from the requested limit reset and mitigation design.

Selection-table arenas and support for an unlimited number of independently
bound selections are outside this work. The packing changes target mark-owned
series and scale/gap resources; they must preserve GPU-produced membership.
Chunking huge datasets and recreating devices after loading are outside this
work. A dataset exceeding the initialized device's byte capacity may fail with
a contextual capacity error.

## Reproduction and evidence

Baseline checkout: `22d005a08`, with this change applied. Run on 2026-10-14,
macOS arm64, bundled Playwright Chromium, headless, ANGLE Metal, DPR 1.
The inventory contains 113 Core specs and 125 docs specs, 238 total.

```sh
npx vitest run packages/core/examples.schema.test.js --reporter=agent
node packages/core/scripts/runWebGpuExamples.mjs --all \
    --output-dir output/webgpu-default-limits
```

All 238 specs pass current Core schema validation. The initial browser sweep returned
218 passes and 20 failures: 5 storage-limit failures, 13 outline-font preparation
failures, 1 zero-height canvas failure, and 1 aborted remote request. The remote
request example passed a focused rerun; the zero-height failure reproduced.
After the font startup fix, all 238 examples were rerun with default limits:
232 pass and 6 fail, with no font-preparation errors. See
[the current failure and headroom inventory](audit-report.md).

Generated artifacts, ignored by Git:

- `output/webgpu-default-limits-font-fix/`: the current full rerun's summary,
  failure report, and screenshots after the font startup fix.
- `output/webgpu-default-limits/summary.json`: every example's errors,
  observed device limits, explicit pipeline layouts, binding visibility, and
  peak buffer sizes.
- `output/webgpu-default-limits/failure-report.md`: full failure diagnostics
  and resource peaks at or above 80% of the actual device defaults.
- `output/webgpu-default-limits/*.png`: screenshots for ready harnesses.

The runner records supported startup byte requests and removes those two
limits before native device creation, forcing baseline byte capacity. It rejects
all other explicit limits, including binding-count overrides, and validates
byte requests before forcing defaults. Uncaptured GPU validation errors are
failures even when a canvas is nonempty: axes can render while a main mark fails.
Explicit layouts are counted across all bind groups for each shader stage.
Auto-layout MSDF compute pipelines remain subject to default device validation,
but their inferred layouts are not reflected by the headroom instrumentation.
Byte peaks cover explicit buffer bindings and all buffer allocations; they do
not measure total GPU memory or texture-dimension headroom.
Decision 4 describes this deliberate audit override; normal rendering negotiates
byte capacity while the sweep exercises actual default device limits.

## Current resource pressure

`packages/webgpu-renderer/src/renderer.js` requested up to 10 storage buffers
per shader stage. The baseline reset removed that binding-count override;
normal startup now requests only supported buffer byte limits (decision 4).
The observed defaults are 8 storage buffers per stage and 4 bind groups.
These match the [WebGPU default limits](https://www.w3.org/TR/webgpu/#limits).
Moving bindings to another bind group cannot evade the per-stage limit.

The pressure originates in generated mark layouts:

- `src/marks/programs/internal/packedSeriesLayout.js` and `seriesBuffers.js`
  pack series into up to three storage bindings, one per scalar type.
- `src/marks/shaders/markShaderBuilder.js` emits separate storage bindings for
  every ordinal range and sparse categorical domain map. Equivalent Core
  encodings can therefore consume several bindings even when they share a
  data field or domain.
- `src/marks/programs/internal/selectionResources.js` adds one hash-table
  binding per multi-selection.
- `src/marks/programs/pathPointProgram.js` adds atlas-entry metadata.
- `src/marks/programs/textProgram.js` adds glyph instances, string metrics,
  glyph metrics, and, with text effects, render items.
- Placement-enabled marks add a vertex storage binding in group 2.

The five over-budget specs require 9 storage buffers in the vertex stage.
Two grouped-bar specs reach exactly 8; nine further specs reach 7. The maximum
bind-group count is 3/4. Observed explicit buffer bindings are far from byte
limits (largest storage binding 3,942,480/134,217,728 bytes; largest uniform
binding 752/65,536 bytes).
Increasing binding-count limits concealed this growth rather than making
layouts portable. Negotiating buffer byte capacity does not resolve these
binding-count failures.

## Compatibility target: GPU-table borrowing in #563

[PR #563](https://github.com/genome-spy/genome-spy/pull/563), reviewed at
`b55f65ae98846e1be1ed99369df5ce4c36b35b14`, introduces the renderer contract
used by the lasso integration in [#562](https://github.com/genome-spy/genome-spy/pull/562).
These APIs are on the pending PR branch, not this checkout's master. Preserve
them when the packing changes and that branch are integrated:

- `setGpuTable(buffer, active)` binds the producer's actual same-device hash
  buffer. Consumers observe compute updates directly and can share the buffer
  across marks. Preview rendering needs no CPU readback/reupload or full-table
  copy into each mark's resources.
- The caller owns a borrowed table. Rebinding or destroying a mark must not
  destroy it; switching to CPU `set(ids, active)` creates or reuses an owned
  table without overwriting or destroying the borrowed buffer.
- `LassoSelection.takeTable()` transfers ownership to the caller, allowing the
  helper to be destroyed while consumers retain the table. Consumers must stop
  borrowing before the new owner destroys it.
- Explicit activity distinguishes an active zero-match query from a cleared
  selection without reading a GPU membership count.
- The 10-million-point table occupies 128 MiB, already the default maximum
  storage-binding size. Adding scale metadata to that binding exceeds the
  default. The producer currently allocates the table with `STORAGE` usage
  alone; a copy-based packing path would also change its usage contract.

Higher negotiated byte limits do not change this ownership contract or justify
copying borrowed tables into mark-owned metadata. Validate borrowed tables
against the consuming device's actual storage-binding limit.

The [integration comment on #563](https://github.com/genome-spy/genome-spy/pull/563#issuecomment-6162838291)
records these constraints for review after the buffer work. Recheck the actual
PR contracts when rebasing; the pinned revision identifies the design reviewed
here.

## Key decisions

### 1. Pack scale/gap metadata and keep selection tables independently bound

Replace per-channel ordinal-range/domain-map bindings and the gap-cut binding
with slices of a single `array<u32>` storage buffer. Keep every multi-selection
table, whether CPU-owned or GPU-borrowed, outside this metadata buffer.
Store slice offsets and lengths in existing mark uniforms. Generated accessors
load words and use typed reconstruction/`bitcast` where required.

Keep the semantic `ScaleResourceManager` contract, publishing slice metadata
and staged bytes. `bindGroupBuilder.js` binds the scale/gap buffer once and
binds selection resources independently. Preserve `SelectionResourceManager`'s
owned/borrowed distinction from #563. Keep per-channel scale slices independent
initially; scale deduplication is an optional optimization.

Preserve the existing hash-table probe algorithm, empty-key sentinel, sparse
category identifiers, ordinal range ordering, vector colors, missing values,
and packed high-precision gap coordinates. Uniform offsets must be word
offsets with one authoritative layout definition shared by uploads and WGSL
generation. Individual slices are not separate WebGPU bindings, so they do
not require `minStorageBufferOffsetAlignment` padding between slices.
Update hash lookup emission in `src/wgsl/hashTable.wgsl.js` for packed scale
domain maps to use slice offsets and capacities. Selection lookups retain the
whole-buffer `[u32 key, u32 value]` layout and derive capacity from
`arrayLength`. Share the probing algorithm while generating the appropriate
load/capacity expressions; keep module-scope access without requiring WGSL
unrestricted pointer parameters.

Retain segment capacity across updates. Update changed tables with
`queue.writeBuffer`; zoom/pan continues to update uniforms without repacking
series or unchanged tables. On capacity growth, rebuild the CPU staging bytes
and buffer on the update path, publish new offsets, and rebuild the bind group.
Offsets belong in uniforms so capacity changes do not recompile pipelines.
Dispose the aggregate buffer with its mark. Font-owned metadata remains shared
under its existing ownership. Selection updates do not rebuild or upload the
scale/gap buffer, and scale updates do not replace borrowed selection tables.

This addresses the measured categorical point failures while preserving their
independent scale mappings and every visual channel.

### 2. Use one binary series buffer across f32/u32/i32 channels

Extend the existing interleaved-series layout to one 32-bit-word record per
instance. Upload f32 bits through a shared ArrayBuffer view and read them with
`bitcast<f32>`; preserve u32 directly and reconstruct i32 with `bitcast<i32>`.
Never numerically convert integer identifiers or packed genomic coordinates to
f32. Preserve source-array alias deduplication, components, count validation,
retained updates, and indexed access used by glyph/series relationships.

This removes the scalar-type multiplier from the storage-binding budget and
uses one representation for every mark rather than introducing a fallback
only when a layout is over budget. Update series-slot and debugging metadata
to derive from the same layout. The renderer is unpublished, so obsolete
internal three-buffer paths should be deleted rather than retained as a
second storage layout.

Accept the resulting large-data capacity tradeoff explicitly. For 10 million
points, f32 x/y/size plus a u32 unique ID previously occupy separate
120,000,000-byte and 40,000,000-byte bindings; one packed series binding needs
160,000,000 bytes, exceeding the default 128 MiB. This workload may fail on a
device without sufficient byte capacity and must work when the negotiated
device limits accommodate it. This does not relax binding-count budgets or
the default-limit requirement for the Core/docs examples. The native 10M lasso
fixture's x/y/ID series uses 120,000,000 bytes and still fits the default.

The proposed worst-case built-in text budget, including effects and placement,
is `7 + N` vertex storage bindings. `N` counts named multi-selection bindings,
whether CPU-owned or GPU-borrowed:

| Resource family                                            | Vertex storage bindings |
| ---------------------------------------------------------- | ----------------------: |
| All series scalar types                                    |                       1 |
| All scale/gap tables                                       |                       1 |
| Glyphs, string metrics, glyph metrics, effect render items |                       4 |
| Placement rectangles                                       |                       1 |
| Multi-selection tables                                     |                       N |
| Total                                                      |                   7 + N |

Path points use one atlas-entry binding in place of the text's four, giving a
budget of at most `4 + N` with placement. Repeated predicates referencing the
same selection name reuse its binding. Different names still consume separate
bindings even if the caller supplies the same buffer; physical-buffer identity
does not reduce a layout's binding count.

The worst-case text configuration fits one multi-selection at 8/8 and exceeds
the default with two. There is no unconditional spare slot. Count each actual
configuration; if a supported workload exceeds the budget, design further
packing of mark-owned resources without copying borrowed selection tables.
Preserve current global/mark/placement groups: at most 3 of the default 4.
Custom mark definitions must receive contextual errors when their complete
layout exceeds device limits.

Budget compute pipelines separately. #563's `createPointLassoSelection` reuses
the mark shader and bind groups and adds three output storage buffers for
captured x, y, and IDs. Preserve selection and atlas metadata's vertex-only
visibility; packing scale/gap and series resources must not broaden selection
visibility to compute. One series and one scale/gap binding plus the capture's
three outputs use 5/8; account for other compute-visible extras separately. Its
current prohibition on repeated placements and conditional positions remains.
The standalone lasso containment layout already uses 8/8 compute storage
bindings and must remain within defaults.

### 3. Validate the complete generated layout before creating GPU objects

`pipelineBuilder.js` should check binding counts across the global, mark, and
optional placement groups using `device.limits`. Report the mark label, shader
stage, limit, and resource families contributing to the count. WebGPU remains
the authoritative validator; the renderer check provides actionable context
instead of cascades of invalid pipeline/bind-group errors.

Include independent selection bindings in the complete layout. Preserve #563's
`computeStorageBufferCount` accounting and validate capture's three extra
outputs as well as the standalone containment and density pipelines.

Check aggregate binding bytes against `device.limits.maxStorageBufferBindingSize`
and allocation bytes against `device.limits.maxBufferSize` before allocating
or growing GPU buffers, including retained capacity, growth policy, and padding.
Cap spare growth capacity at the applicable limit when the required payload
still fits, rather than rejecting data solely because of an oversized reserve.
Dataset sizes become known during loading and can change with subsequent
updates or lazy data. Check each allocation/update boundary against the limits
selected at startup; do not recreate the device or renegotiate limits on failure.
Report the mark/resource, required bytes, applicable limit, and available bytes.
Never truncate data. Recheck the measured examples' byte peaks after packing.

### 4. Negotiate buffer byte capacity at startup and keep the audit on defaults

In `src/renderer.js`, request the adapter's supported values for exactly two
limits when creating the device:

```js
const device = await adapter.requestDevice({
  requiredLimits: {
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxBufferSize: adapter.limits.maxBufferSize,
  },
});
```

Leave all other limits unspecified, retaining standard WebGPU binding counts,
including 8 storage buffers per shader stage and 4 bind groups. Do not request
the adapter's complete limits object or require a fixed desktop-sized minimum.
An adapter offering only baseline byte limits must still initialize and render
simple plots. Core continues to call the renderer's existing startup API; no
dataset-size estimate or separate large-data mode is required.

Device limits are fixed at creation, while data arrives later. Requesting byte
capacity does not allocate buffers or reserve that amount of GPU memory.
The [WebGPU limits and device creation rules](https://gpuweb.github.io/gpuweb/#limits)
define these independent limits, including the constraint that a storage
binding cannot exceed `maxBufferSize`. Use the supported pair reported by the
adapter; actual allocation success still depends on available memory.

Adapt `packages/core/scripts/webGpuLimitAudit.js` at its existing browser API
boundary. Allow and record only these two requested byte limits, verify that
they are supported by the adapter, and omit them from the descriptor passed to
the native `requestDevice`. Continue rejecting every other explicit limit,
including any binding-count override. Record both requested byte limits and
the actual audited device limits, and assert default byte/count limits in the
report. This intentionally forces the complete Core/docs sweep onto default
devices without adding a Core specification or embedding option. Test the
audit shim so a supported byte request cannot elevate the audited device and
a binding-count request still fails.

Verify normal startup separately: baseline-only adapters initialize, capable
adapters receive exactly the two supported byte requests, and binding counts
remain at defaults in real GPU tests. Test the 160,000,000-byte mixed-series
case with sufficient negotiated capacity and its contextual rejection at the
default 128 MiB boundary; cover subsequent growth as well as initial loading.
Use focused layout/capacity tests for boundary cases and real GPU rendering
and picking for a capable adapter, reporting its actual limits. Keep these
large-data results separate from the default-limit example audit.

## Established designs and alternatives

The [WebGPU instanced-cube sample](https://github.com/webgpu/webgpu-samples/blob/main/sample/instancedCube/main.ts)
demonstrates batching indexed per-instance records in one GPU buffer. The
existing GenomeSpy packed-series implementation already follows that general
pattern. This proposal extends it to mixed scalar representations and table
slices using standard [WGSL memory layout](https://www.w3.org/TR/WGSL/#memory-layouts)
and [bitcast](https://www.w3.org/TR/WGSL/#bitcast-builtin) operations. No external
code is copied or closely adapted; no new dependency is required.

- Requesting 10 storage bindings or all adapter limits: rejected; it defeats
  baseline binding-count portability and leaves unbounded per-channel and
  selection growth. Only the two buffer byte limits are negotiated.
- Choosing limits after loading or retrying on a new device: rejected; sizes
  are unknown at startup and recreating the device would invalidate resources.
- Retaining scalar-type buffers or chunking solely to preserve baseline
  huge-data capacity: not required by the agreed support target. Use one
  packed representation and report insufficient device byte capacity.
- More bind groups: rejected; stage limits count across groups.
- Deduplicating only identical scales: useful later, but insufficient for
  independent scales and selections and adds identity/lifetime complexity.
- Packing selection tables into per-mark metadata: rejected; it breaks direct
  borrowing and adds copies for GPU-produced updates. A full 128 MiB table plus
  metadata also exceeds baseline byte capacity. A shared GPU selection arena
  would require a separate producer/consumer API and ownership design.
- Small lookup tables in uniforms: introduces size-dependent shader layouts
  and shifts pressure to uniform binding sizes. Packed storage has one path.
- Storage textures for tables: keep as a future alternative if a measured
  byte-budget issue warrants it; format, addressing, and texture ownership
  changes are larger than the current binding-count problem.
- Splitting marks into extra passes or evaluating encodings on the CPU:
  rejected for this mitigation; either risks paint-order/picking semantics or
  changes the GPU-first interaction model.

## Implementation milestones

1. **Bound scale/gap bindings while preserving selection borrowing.** Change
   scale resources, WGSL slice access, uniforms, and bind-group construction as
   one coherent renderer change. Keep selection tables independently bound.
   Verify the failing point examples, sparse domains, independent scale updates,
   gaps, rendering, and picking on default limits. After integrating #563,
   exercise borrowed-buffer identity across linked marks, live compute updates,
   CPU/GPU replacement, active-empty/clear, `takeTable()`, and disposal. Assert
   that scale updates do not replace borrowed buffers and borrowed-table updates
   require no metadata uploads, readback, or per-mark table copies. Update
   renderer resource/debug descriptions while retaining the borrowing API.
   Tentative commit: `refactor(webgpu): pack scale and gap tables into one buffer`.
2. **Bound mixed series and negotiate byte capacity.** Replace the three scalar
   buffers with one word buffer, update generated accessors and slot updates,
   and add complete-layout count/byte diagnostics. Request the two supported
   buffer-size limits in renderer startup and adapt the browser audit to force
   defaults without accepting other overrides. Verify baseline-only startup,
   exact byte requests, default binding counts, the 160,000,000-byte mixed
   series case, and contextual capacity errors on loading and growth. Verify
   signed integers, f32 bit patterns, u32 identifiers, genomic high precision,
   aliases, count changes, text effects, placement, and picking using focused
   unit/GPU tests.
   Remove obsolete packing tests and preserve behavior-based coverage. Update
   renderer startup/resource documentation and debug descriptions without
   changing the Core grammar. Document baseline simple-plot support and
   device-dependent large-data capacity. Adapt #563's shader reuse and point
   capture to the same typed series/scale accessors
   used by rendering, preserve exact u32 IDs, and verify the capture compute
   budget including its three output buffers.
   Tentative commit:
   `refactor(webgpu): pack series with negotiated buffer capacity`.
3. **Integrate and verify preserved behavior.** Run the full 238-spec matrix
   again, compare failures with this baseline, and test representative pointer
   selection, domain/range updates, zoom, and placement changes. Use point.json,
   point2d.json, redundant-encoding.json, ranged_text.json, grouping-gap and
   multi-selection scenes, plus text-effects and placement GPU tests. Compare
   visible and picking output under WebGPU and WebGL where applicable; exercise
   WebGPU raster/SVG export after shared-series changes. Check actual text
   budgets at `7 + N`, including the one-selection 8/8 case and contextual
   rejection of excess bindings. Rebase #563 onto the packing changes before
   its review and run its affected GPU suites plus the native 10M and linked
   scenarios from #562 with forced default device limits. Run the larger mixed
   series workload separately with negotiated byte limits and default binding
   counts, recording the actual device capacity. Verify capture under nonlinear
   scales, shared preview/committed buffers, ownership transfer and disposal,
   and preserved membership through navigation. All measured formerly-over-
   budget examples must render without dropping functionality. Tentative commit:
   `test(webgpu): verify packed resources across examples and interactions`.

Review the shared resource/WGSL contract after milestone 1, and review mixed
series, precision, and downstream text/picking/export and lasso-capture consumers
after milestone 2. Final integration must verify the rebased #563/#562 path
alongside the full example sweep. Changes remain confined to the experimental
renderer/adapter tooling; assess release impact again when implementing.

## Implementation record

### Milestone 1: scale/gap packing complete

Scale ranges, sparse domain maps, and exact gap keys share one mark-owned
storage buffer. Independent CPU slices retain their capacity and upload only
changed bytes; growth republishes word offsets and rebuilds the binding without
recompiling shaders. Selection hash tables retain their separate whole-buffer
layout and ownership. Obsolete per-channel buffer bindings and disposal paths
were removed. Production source changed by +2 lines overall (raw line count,
excluding tests), replacing existing paths rather than adding a second layout.

Verification: 163 renderer program/shader unit tests and renderer TypeScript
checks pass. All five formerly-over-budget Core/docs examples pass with actual
default device limits (`output/webgpu-scale-packing/`). GPU categorical mapping,
whole-buffer hashes, grouping gaps, placement, and point rendering/picking pass.
A new GPU regression covers independent categorical updates after relocation.
The broader shader GPU suite exposes five existing inclusive-endpoint fixture
expectations against half-open interval code; one was reproduced with the
unchanged baseline shader. Reconcile these fixtures during milestone 3.
#563 borrowing/capture qualification remains an integration follow-up because
that PR's API is not present in this branch.

### Milestone 2: mixed series and byte negotiation complete

All f32/u32/i32 channels share one interleaved word buffer, copying exact source
bits and deduplicating source-array aliases. Scalar-type buffer/layout paths
were removed. Startup requests exactly the two supported byte limits; all
binding counts remain at defaults. Pipeline creation validates the complete
per-stage layout before GPU objects are created, including independent
selection tables and placement. Series, scale, and owned selection storage
receive contextual capacity checks; scale growth releases unused slice capacity
before rejecting a payload that fits. The audit records original byte requests
but forces a default device and rejects unsupported requests/count overrides.

Verification: 314 renderer unit tests, 7 audit tests, renderer/Core TypeScript,
and targeted lint pass. Seventeen point/text/placement/gap/series GPU tests pass,
as does the new 160,000,000-byte GPU case with first/last record picking and exact
large IDs. That device reported both byte limits as 4,294,967,292 and counts of
8 storage buffers/4 groups. Baseline rejection, later growth rejection, and
scale-capacity compaction have regression coverage. A three-example Core/docs
rerun passed and recorded the supported requests alongside effective default
byte limits (`output/webgpu-series-packing/`). Production renderer source changed
by +3 raw lines overall, excluding tests/test scaffolding, including the new
capacity/count helpers. Full example/export/interaction and #563 qualification
remain in milestone 3.

## Risks and open questions

- Binary layout mistakes can corrupt f32 values or precision-sensitive IDs;
  test behavior and GPU readback, including values above f32 integer precision.
- Larger aggregate buffers can increase growth-copy and upload costs and reduce
  the maximum dataset size on baseline devices. This capacity tradeoff is
  accepted for huge data; verify the mixed-series boundary case and retain
  baseline simple-plot coverage. Measure retained update traffic; do not add
  allocations or repacking to frame paths.
- Advertised byte capacity is not a total-memory guarantee. Validate against
  actual device limits without claiming that negotiation reserves GPU memory.
- Slice-offset uniforms can increase uniform bytes; record their combined
  size against the 64 KiB default in the full audit.
- Selection bindings consume the available headroom. Multiple selections with
  text effects and placement can exceed defaults even after this packing;
  identify supported workloads needing further mark-owned resource packing.
- Changing hash lookup emission or resource visibility can break borrowed
  table capacity/activity semantics or lasso capture's compute budget. Keep
  whole-buffer selection lookups and qualify #563 after rebasing.
- The original font-preparation failures prevented complete resource creation.
  That startup race is fixed, and their headroom observations were repeated
  in the full current sweep.

## Acceptance criteria and task record

- [x] Restore default device creation and assert 8 storage buffers/4 groups in
      a real GPU test with placement and picking.
- [x] Validate the complete Core/docs spec inventory against the current schema.
- [x] Add a repeatable default-limit browser audit that fails on elevated
      requests and GPU validation errors and reports measured binding headroom.
- [x] Finish the full browser sweep and record every failure and near-limit spec.
- [x] Fix the font startup race, cover resize and animation callbacks with a
      regression test, and rerun every Core/docs spec with default limits.
- [x] Design renderer-owned scale/series mitigations with explicit per-stage
      budgets while retaining encodings, precision, placement, text, and picking.
- [x] Reconcile the design with #563's borrowed GPU tables, activity and ownership
      contracts, size limit, and independent selection/capture binding budgets.
- [x] Revise the design to request supported buffer byte limits at startup,
      retain default binding counts and the complete default-limit example audit,
      and accept device-dependent huge-data capacity with contextual errors.
- [x] Implement startup byte negotiation and audit forcing;
      verify baseline-only startup, unchanged binding counts, mixed-series
      capacity boundaries, and loaded/lazy-data growth errors.
- [ ] Integration follow-up: qualify the rebased #563/#562 lasso and linked-view
      scenarios on default limits without table copies or per-frame readback.
- [x] Milestone 1: implement scale/gap packing and verify categorical updates,
      gaps, picking, and the five default-limit example failures.
- [x] Milestone 2: unify mixed series and implement contextual budget errors.
- [ ] Milestone 3: finish the full example and interaction/integration matrix,
      including reconciliation of the existing interval GPU fixtures.

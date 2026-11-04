# WebGPU retained update optimization

Status: implemented, reviewed and measured during the SampleView investigation.
This draft foundation PR collects the independently useful WebGPU changes; the
SampleView placement/navigation refactor stacks on it. Retain this temporary
record for draft discussion and retire it before merge.

## Goal and architecture

Reduce repeated adapter evaluation and uniform packing without changing the
renderer API, GPU resource ownership, batching or picking semantics. Correct live
categorical ranges and preserve pixel geometry under ordinary placement. These
changes also apply to ordinary Core marks without SampleView.

Start at [ARCHITECTURE.md](../../ARCHITECTURE.md) and Core's
[rendering architecture](../../packages/core/docs/architecture/rendering.md).
Core owns specification semantics, completed scale mappings and rendering
revisions. Its WebGPU adapter translates those into documented renderer slots.
The renderer owns validation, fixed uniform layouts, packing, shaders, resources
and disposal. No renderer implementation import crosses the adapter boundary.

Scale-only revisions use the existing retained binding set without reevaluating
unrelated mark properties and expressions. Resource-expression revisions still
refresh those inputs. Numeric/color literals use static slots. Frozen categorical
domains retain identity, while mutable domains are copied so in-place edits are
observable. Band bindings read the current effective range and edges, including
reversed ranges.

The renderer compiles uniform writers from fixed layout entries and retains
direct writers in scale, value and scalar slots. Each writer selects its
Float32Array, Int32Array or Uint32Array view once. Named writes use the same
implementation. Layout offsets, types and strides remain the source of truth;
there is no second packing model. Existing typed series storage uses the same
native-endian representation assumption. WebGL/TWGL's retained setters provide
the precedent for resolving static destinations once; no external code is copied.

Placement fits mark coordinates while retaining pixel-sized strokes, point
sprites and offsets. The renderer's generic GPU regression verifies this with
placed geometry, diagonal rules and collapsed marks. Legacy metadata facet
support remains here; its removal belongs to the SampleView consumer PR.

## Completed milestones

| Outcome                                                                      | Consumers and verification                                                                                  | Commit                                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Skip unrelated bindings on scale-only updates                                | Shared Mark revisions and Core WebGPU surface; expression, configuration and resource lifecycle regressions | `perf(core): skip unrelated WebGPU bindings during scale updates`  |
| Retain immutable inputs and literal channels; follow live categorical ranges | Core adapter/surface; composed band navigation, reversed ranges, literals and mutable-domain tests          | `perf(core): retain immutable WebGPU inputs and literal channels`  |
| Preserve pixel geometry through placement                                    | Renderer mark programs; generic GPU placement/clamping regression                                           | `fix(webgpu-renderer): preserve pixel geometry through placements` |
| Compile retained typed uniform writers                                       | Named/retained f32/i32/u32, vectors, strided arrays, omitted uniforms and invalid shapes                    | `perf(webgpu-renderer): compile retained typed uniform writers`    |

Public renderer declarations and other rendering backends are unchanged. No
grammar, persistence or user-documentation migration is required. Core's small
revision extension preserves its existing consumers. The WebGPU implementation
is unpublished and excluded from released Core bundles, so this foundation adds
no changeset. Existing fragments still queue the fixed-group 1.3.0 release.

## Measurements and rejected alternatives

Measurements were collected in the SampleView investigation. They isolate
individual optimization candidates on that application; they do not establish a
whole-application gain for this complete foundation against remote master.

The earlier scale-only binding subset reduced an instrumented scroll probe from
31,680 to 18,900 binding reads (40.3%) with 2,400 writes in both versions. The
instrumented resource phase changed from 1.427 to 1.292 ms/frame (9.4%). With
application profiling disabled, renderer-thread CPU was 845.29 versus 844.29 ms
per interaction, within variation.

A larger grouped-mapping/input-mask and reusable viewport-storage experiment
reduced binding reads from 57,420 to 22,080, but logical writes stayed 7,440 and
GPU writeBuffer calls/bytes stayed 3,900/5,716,352. It added 113 production lines
without a reliable application benefit and was discarded. Preserve its history
on `codex/webgpu-direct-updates-experiment`; do not revive its parallel routing
model without new evidence.

For the final writer selection, five alternating warmed Chrome 156 packing
rounds performed one million domain/gap updates and two million writes each.
Final bytes matched. Median packing time was 22.2 ms for the original named
DataView implementation, 45.0 ms for compiled bound DataView writers (discarded),
and 9.4 ms for retained typed-array writers: about 58% less packing time. This
excludes uploads, drawing, layout and adapter work.

Three alternating warmed, profiler-disabled WebGPU synthetic interaction pairs
measured 833.907 versus 816.907 ms mean renderer-thread CPU for original versus
typed writers. Pair differences were -4.55%, +3.53% and -4.82%; no reliable
whole-interaction speedup is claimed. P95 cadence was comparable. The selected
writer-only change added two net non-comment production lines and no Core code.
It does not establish that native band navigation's earlier application CPU
overhead has been eliminated.

## Integration verification

- [x] Independent foundation diff review: no App, SampleView navigation policy,
      metadata facet removal, heatmap example or discarded experiment leaks.
- [x] Standalone foundation: 192 focused Core tests and 319 renderer tests pass.
- [x] Core and renderer TypeScript checks pass.
- [x] GPU placement/clamping regression passes in Chrome.
- [x] Release policy and release-status checks pass.
- [x] Scoped lint and format checks pass.
- [x] All non-plan tracked files on the reconstructed upper branch match the
      previously tested `a13287481` tree exactly; independent review has no findings.

Earlier integration checks on the complete consumer stack covered native band
heatmap navigation/restore, shared matrix/tree resolutions, point size,
category-selection updates, quantitative zoom and semantic thresholds with no
runtime errors. Rebuilding the stack must preserve those package contents.

## Further optimizations to investigate

1. Profile adapter evaluation, normalization, packing, upload calls/bytes and GPU
   work separately. Use profiler-disabled interaction CPU/cadence for acceptance;
   lower counters alone did not justify the discarded routing experiment.
2. Reuse evaluation and normalization when primary and secondary positional
   channels share the same live mapping. Investigate renderer uniform/shader
   reuse while preserving independently scaled secondary channels and distinct
   band positions. Equal initial values alone are not a sharing contract.
3. Compare whole-block uploads with one contiguous dirty span and coalescing
   compatible updates. Preserve batching/picking semantics and avoid multiplying
   small writeBuffer calls. Shared categorical domain/gap resources are another
   candidate only with clear renderer ownership and disposal.
4. Compare fixed scale-parameter shader specialization with retained uniforms.
   Measure pipeline/shader variants, creation cost and memory alongside update
   cost; fewer uniforms can increase pipeline churn.
5. Revisit finer Core notifications only if profiling identifies a meaningful
   remaining cost. Prefer replacing the generic scan over introducing parallel
   mask state or a scale-alias registry. Keep the public renderer API unless a
   measured opportunity warrants a simpler generic contract.

These are follow-up investigations, not implemented or benchmarked promises.

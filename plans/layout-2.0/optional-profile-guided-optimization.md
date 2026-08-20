# Optional Phase: Profile-Guided Layout and Rendering Optimization

Status: Discarded from this sequence; reconsider only with new measurements

Tentative PR title: select only after profiling identifies a focused change

## Purpose

Preserve optimization findings from the Layout 2.0 experiments without making
them prerequisites for maintainability or semantic zoom. Each selected
optimization should normally become its own focused PR with a profile,
allocation trace, or reproducible work counter.

## Guiding principle

First make the complete deterministic path cheap. Retain durable identity and
expensive resources, but recompute cheap derived state when that is simpler than
synchronizing caches.

Dear ImGui is the useful counterexample: it regenerates UI and draw descriptions
while reusing grown buffers and durable state, aims for zero general heap
allocation on a typical frame, and relies on compact sequential structures and
clipping. GenomeSpy is not an immediate-mode UI, but the same question applies:
is retained derived state actually cheaper than a predictable full pass? See
[Dear ImGui's runtime-performance notes](https://github.com/ocornut/imgui/issues/7892)
and [overview](https://github.com/ocornut/imgui#how-it-works).

## Partial layout opportunities

The prototype demonstrated that less layout work is possible:

- **Axis-aware size invalidation:** a width change need not clear unrelated
  height measurements, and vice versa. Invalidate the changed view and only
  ancestors whose measured output may depend on that dimension.
- **Clean-sibling skipping:** when an ancestor must be recomputed, siblings with
  unchanged inputs and allocations can retain their previous result.
- **Subtree-scoped arrangement:** a dirty subtree can start from its last parent
  allocation when a proven boundary contains its size change.
- **Scrollable viewport boundaries:** fixed `viewportWidth` or `viewportHeight`
  can contain intrinsic content growth in that axis. Content geometry and
  scrollbar limits still update, while unrelated outer layout does not.
- **Coalesced invalidation:** multiple synchronous domain, size, guide, or
  mutation changes should produce one final layout commit.

Comparable retained layout engines use related patterns: Yoga keys measurement
and layout caches by constraints, Flutter propagates layout dirtiness according
to parent-size dependencies and relayout boundaries, and LayoutNG uses explicit
inputs and reusable layout results. These are patterns to evaluate, not code to
copy:

- [Yoga layout algorithm](https://github.com/facebook/yoga/blob/main/yoga/algorithm/CalculateLayout.cpp)
- [Flutter `RenderObject` layout](https://api.flutter.dev/flutter/rendering/RenderObject-class.html)
- [Chromium LayoutNG](https://developer.chrome.com/docs/chromium/layoutng)

## What made the prototype complicated

The first attempt combined axis dirty flags, per-instance input snapshots,
generations, retained layout inputs, boundary-root scheduling, command-range
reconciliation, scene detection, and geometry slots. Those concerns amplified
one another and made a performance optimization into a new architecture.

In particular:

- Subtree skipping was initially coupled to advancing over retained render
  command ranges. Layout validity should never depend on render-command order.
- Generic comparison of arbitrary rendering options expanded the invalidation
  surface and made it difficult to state what actually changes a scene.
- Per-facet input maps keyed through serialization created work and obscured
  identity.
- A boundary needs its last allocated rectangle and relevant local inputs, but
  retaining every traversal option can cost more complexity than recomputing
  ancestors.
- Container dependencies are not uniform. Grid/concat, layer, facet, legends,
  titles, axes, guide overhang, and App sample containers have different
  cross-axis behavior.

If partial layout is revisited, start with one measured case and explicit local
container rules. Correct over-invalidation is acceptable; stale geometry is not.
Keep the full-layout path as the semantic oracle and avoid a generic dependency
engine until repeated cases clearly justify it.

## Known allocation and calculation opportunities

Earlier review identified these candidates, independent of dirty layout:

- Make steady-state `Mark.setViewport()` avoid temporary arrays/objects by
  reading rectangle scalars once and reusing uniform storage.
- Cache flattened viewport and clip values for a geometry/presentation
  generation if profiling shows repeated accessor and clipping work.
- Reduce `GridView` temporary arrays and repeated passes: visible-child lists,
  `[column, row]` tuples, coordinate unions, flex items, and decoration records
  are candidates for reuse or simpler loops.
- Do not compare facet IDs using repeated serialization in hot paths; use the
  explicit identity model from Phase 2.
- Consider sharing command topology between normal and picking batch
  construction while keeping their executors/render targets separate.
- For WebGPU, measure retained-handle lookup and ordered-draw materialization
  separately. Reusing expensive handles does not require retaining every cheap
  frame descriptor.
- Replace closure-heavy grouped execution only if profiles show dispatch or
  allocation cost.
- Cull or virtualize offscreen scroll content before building fine-grained
  invalidation machinery when large repeated collections are the bottleneck.

Clay's default visibility culling is evidence that early viewport rejection can
keep regenerated render output compact. GenomeSpy already has clipping and
mark-level visible-range culling, so any additional optimization should target
measured view/instance dispatch cost. Base it on presented bounds and effective
clips, and do not let culling change instance identity, resource lifetime,
render membership, or batch topology. See Clay's
[visibility-culling documentation](https://github.com/nicbarker/clay#visibility-culling).

## Rectangle representation opportunity

`Rectangle` deliberately models coordinates as an immutable graph of accessor
closures. Transformations such as translate, expand, intersect, union, and
modify create derived nodes, so retained rendering callbacks automatically see
changes in upstream locations. This has enabled scrolling, sticky elements,
SampleView peek, and batch reuse without an explicit geometry commit system.

The tradeoff is significant in hot paths: creating a numeric rectangle normally
creates four constant closures; transformations add closure layers; getters may
walk and recalculate those layers repeatedly; and `flatten()` evaluates the graph
only to allocate another `Rectangle` and four more constant closures. The branch
prototype's `RectangleSlot` adds replaceable-source indirection but retains these
costs. `Mark.setViewport()` currently flattens during drawing, where allocations,
array mapping, property reads, and function calls multiply across requests.

A different Layout 2.0 architecture could emit flat numeric geometry keyed by
stable layout-instance identity. Layout commits would calculate target
rectangles and clips once; transition frames would update presented numbers in a
known order; retained backend work would keep an index or lightweight slot and
read scalars directly. This would make retention an identity/indirection
property rather than a consequence of closure graphs.

Do not replace `Rectangle` mechanically. First distinguish its roles:

- convenient ephemeral value/calculation API during layout;
- retained dynamic dependency graph;
- rendering-facing committed geometry;
- interaction and public bounds value.

It may remain useful in the first and last roles while flat storage replaces the
middle roles. Any migration must cover dynamic clipping, scrollbars, sticky
summaries, axes, SVG, picking, and SampleView peek, and compare allocations and
property/function-call counts as well as wall-clock performance.

## SampleView peek migration opportunity

Peek is already a specialized retained view transition. `LocationManager` keeps
fitted and scrollable layouts, interpolates mutable presented locations for
samples, summaries, and groups, updates sample-height-dependent state, and makes
the result available through both a GPU facet texture and CPU position accessors.
This is semantically close to the planned target/presented model and should
inform its design.

At around 2,000 samples the implementation can become expensive even though it
avoids per-frame layout allocation. Candidate costs to measure separately are:

- O(sample + summary + group) interpolation on every animation frame;
- another pass that normalizes and packs sample locations into facet texture
  data, followed by texture upload;
- closure-backed `Rectangle` chains for sample-dependent chrome and summaries;
- per-facet callbacks, function calls, visibility checks, and uniform updates
  for marks not rendered through the facet-texture path; and
- linear CPU lookup or interaction work over presented locations.

After Phase 4, consider a focused App migration using stable sample-instance
indices and structure-of-arrays or typed-array storage for old/target/presented
location and size. Texture-faceted marks could potentially upload old and target
values once and interpolate with a transition scalar in the shader, while CPU
consumers either update a compact presented array or evaluate only queried
instances. Preserve specialized group, sticky-summary, scroll-offset, and
filtering logic unless the general model clearly simplifies it.

The migration requires before/after profiles at small and large sample counts,
especially around 2,000 samples. It must reduce total CPU work/function dispatch
or uploads, not merely rename `LocationManager` state. Treat it as its own App PR
so the Core transition design can be evaluated first.

Do not implement all candidates as a bundle. Removing allocation can increase
retained memory or code complexity; reducing function calls can make ownership
less clear. Each tradeoff needs evidence.

## Required correctness scenarios for partial layout

### Nested step-sized view with an index scale

Change the scale domain so a nested `{ step: ... }` view changes intrinsic size.
Verify final geometry against forced full layout, show which ancestor path was
measured/arranged, and prove an unrelated sibling was skipped.

### Dirty subtree inside a scrollable viewport

Grow content within a fixed scrollable viewport. Verify content and scrollbar
updates, unchanged viewport/outer geometry, stopped propagation in the relevant
axis, and equality with forced full layout.

### Legend extent change

Change a legend domain or label so its extent changes. Verify the guide, owning
grid child, plot rectangle, and overhang that actually depend on it, while
unrelated branches remain untouched. Distinguish a legend geometry change from
legend creation/removal, which changes render membership.

### SampleView filtering and peek

Treat App `SampleView` as the required repeated-facet workload. Filtering changes
the sample hierarchy and may require size, layout, guide, sidebar, and scene
updates; verify that work is coalesced and surviving samples retain identity.
Peek changes mutable per-sample locations every animation frame without changing
membership; verify that it performs drawing/presentation updates rather than
partial or full view layout and does not reconstruct WebGL batches or compatible
WebGPU resources per frame.

For all scenarios, backend retention is a separate assertion: geometry-only
changes should reuse WebGL batches and compatible WebGPU handles after Phase 3.
Occurrence-topology changes should rebuild WebGL batches or WebGPU draw order
once without implying unnecessary WebGPU resource reconstruction.

## Measurement and verification

- Add disabled-by-default counters for distinct views measured and arranged,
  layout commits/settling passes, changed instances, semantic occurrences
  collected, normal/picking batches built, WebGPU handles created/destroyed, and
  ordered draws materialized. Disabled instrumentation must not allocate in hot
  paths.
- Compare the complete incremental result—not only the changed view—with a
  forced deterministic full layout.
- Use representative Core and App layouts; microbenchmarks alone can hide guide,
  facet, and mutation behavior.
- Record before/after code size for simplification claims and before/after
  profiles for performance claims.
- Reject an optimization whose measurable benefit does not justify its state,
  invalidation rules, tests, and maintenance cost.

## Non-goals

- Making incremental layout a correctness requirement.
- Building a universal constraint/dependency graph.
- Using render-command topology as the layout cache.
- Optimizing transition frames before Phase 4 defines their semantics.
- Copying implementation code from referenced engines.

## Decision gate for each optimization PR

1. What measured workload is expensive?
2. Can a flat full pass, clipping, or allocation reuse solve it more simply?
3. What cache state and invalidation rules would be introduced?
4. How is the optimized result compared with the full-layout oracle?
5. What evidence shows less calculation, allocation, or dispatch?
6. Is the code still easier to maintain after including its tests and metrics?

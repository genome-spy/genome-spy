# Phase 3: Retain Backend Work Across Geometry Changes

Status: Draft; revise after the Phase 2 review

Tentative PR title: `perf(core): retain renderer work across layout changes`

## Purpose

Ensure expensive backend work survives when a full layout changes only the
coordinates or clipping of existing layout instances. WebGL should begin
retaining its normal and picking batches. WebGPU should preserve the compatible
mark handles, pipelines, buffers, textures, and bind groups that its production
renderer already retains while updating or regenerating a compact ordered draw
list. Canvas, SVG, and headless consumers need no retained batch merely to
conform to this phase.

Retention decisions should be driven by explicit semantic changes, not by the
fact that layout ran and not by one universal WebGL-shaped scene flag.

## Findings to preserve

Buffered WebGL mark callbacks already read rectangle and clipping values when
drawing, so geometry can be changed through stable indirection without
recreating the callbacks. The earlier prototype verified this with replaceable
`Rectangle` sources and separate layout and scene generations.

It also exposed two traps:

- Reconciling every newly arranged command against the previous command
  sequence makes geometry updates depend on render order and complicates
  partial layout. Layout should update instances by stable identity; it should
  not scan command ranges to prove that a subtree is unchanged.
- Scene change cannot safely be inferred only from the number of commands.
  Identity, order, facet membership, clipping topology, generated chrome, mark
  readiness, and captured rendering options can affect a buffered callback.

The WebGPU proof of concept on the `webgpu` branch exposes a third trap: render
occurrence topology and GPU resource lifetime are not the same thing. Reordering
or repeating a mark may require a new ordered draw list without requiring a new
pipeline or data buffer. Conversely, changing a structural mark property may
require a new handle even when the occurrence identity and position are
unchanged.

The simpler intended contract is explicit about distinct facts:

- geometry or presentation changed for stable occurrences;
- occurrence membership or paint order changed;
- backend resource structure changed for a semantic mark; and
- data, scale, or dynamic values changed without changing the first three.

The layout lifecycle owns the first two facts. Mark/data systems and rendering
adapters own the latter two. Adding, removing, reordering, showing, or hiding
configured views changes occurrence topology. Derived instances such as facets,
guides, and scrollbars require equally explicit ownership rules rather than
traversal comparison heuristics.

`SampleView` already exercises both geometry and topology. Peek updates mutable
per-sample locations, sizes, facet-texture data, and CPU facet positions while
the set of repeated samples stays stable; those frames should draw through
retained backend work. Filtering changes the sample hierarchy, repeated
membership, sidebar/metadata alignment, and potentially guide overhang; it
changes occurrence topology and size once after the update settles.

Clay's retained-rendering guidance is supporting evidence for associating
regenerated layout output with persistent graphics objects through stable IDs.
GenomeSpy should adapt that mapping concept through layout-instance indices or
slots. Do not adapt Clay's suggestion to byte-compare flat render commands:
GenomeSpy's backend work includes callbacks, ordered occurrences, rendering
options, picking behavior, and GPU state whose contracts are clearer through
explicit semantic changes. See Clay's
[retained-mode guidance](https://github.com/nicbarker/clay#retained-mode-rendering).

## Intended outcome

- A full layout produces new target geometry for stable instances.
- Existing WebGL callbacks observe the new geometry through the simplest viable
  indirection chosen after Phase 2.
- Normal and picking WebGL batches keep their identities when render membership
  and ordering are unchanged.
- WebGPU's already-retained compatible resources survive geometry-only and
  occurrence-order changes. The adapter may regenerate cheap ordered draw
  descriptors and must preserve exact Core paint order.
- Occurrence-topology changes rebuild WebGL batches once after a transaction;
  WebGPU updates its ordered occurrence list and creates or destroys handles
  only when semantic resource ownership requires it.
- Canvas size, device-pixel ratio, framebuffer, and picking-dirty state can be
  updated independently of command or resource compilation.
- Layout, occurrence collection, backend resource preparation, and
  draw/presentation work are observable separately in tests.

## Provisional approach

Expose whether the completed layout changed occurrence membership/order or only
geometry. Structural mutation helpers and view/container operations that affect
rendered membership or order must make that fact explicit. A geometry-only
layout must not report a topology change.

Do not require one shared `sceneInvalidated` enum or generation to encode every
backend cache. Coordinators consume the semantic facts according to their
native lifecycle:

- WebGL updates geometry associated with stable IDs when topology is unchanged
  and rebuilds normal/picking batches when it changes;
- WebGPU continues mapping semantic mark ownership to retained resources, then
  emits ordered occurrence draws from the completed layout result; and
- Canvas, SVG, and headless paths may consume the result without retaining a
  compiled command cache.

Command collection should never be used as a positional diff algorithm. A
backend may compare explicit stable identities or revisions required by its
cache, but layout validity must not depend on that comparison.

Possible geometry indirections include mutable rectangle slots, numeric
records, or ID-based lookup from buffered operations. Select based on
allocation, accessor-call, and ownership measurements. In particular, do not
merge viewport operations merely because their rectangles are currently equal:
distinct instances may later diverge.

Do not assume that retention requires keeping the current dynamic `Rectangle`
graph. A WebGL command or WebGPU occurrence can instead retain a stable instance
index and read four committed scalars from numeric storage. Layout or
presentation updates would eagerly calculate derived rectangles and clips once.
Compare that approach with `RectangleSlot`: the latter is a smaller migration
but preserves closure dispatch and repeated dependency evaluation.

## Affected areas

- `RenderCoordinator` layout, batch-construction, and picking lifecycle.
- The Phase 2 layout-instance/result representation.
- Buffered and composite rendering contexts.
- The Core WebGPU coordinator's occurrence-to-handle map and ordered frame
  submission when the experimental backend is present.
- Structural view mutations, facet updates, generated legends/chrome, and mark
  readiness paths.
- Render-target dimensions and viewport/clipping setup.

## Verification

- The nested step-sized/index-scale scenario changes final sizes and positions
  while normal and picking WebGL batch generations remain unchanged.
- Pure container resize and legend-extent changes retain WebGL batches when
  rendered membership is unchanged.
- The WebGPU `first.json` fixture retains compatible mark handles and pipelines
  across geometry-only layout changes. Its ordered draws receive updated
  viewport/scissor geometry without using handle creation order as paint order.
- A repeated-occurrence fixture draws one compatible WebGPU handle in distinct
  placements and clips. Reordering those occurrences changes their submitted
  order without recreating the handle.
- SampleView peek frames retain normal and picking WebGL batches while updated
  locations, facet texture/CPU positions, clipping, summaries, chrome,
  scrollbars, and picking follow the visible samples.
- Sample filtering rebuilds WebGL batches once, updates WebGPU occurrence
  topology without unnecessarily recreating surviving resources, preserves the
  identity of surviving sample facets, removes filtered instances, and produces
  correct layout and sidebar/metadata alignment.
- View insertion, removal, reordering, show/hide, and facet cardinality changes
  update each backend exactly once after a transaction.
- Picking and ordinary rendering use the same updated geometry and occurrence
  order.
- Logical canvas resize and DPR changes update viewport calculations without
  leaving stale constructor-captured state.
- Canvas, SVG, and headless output remain deterministic without adopting GPU
  retention machinery.
- Tests use counters or identities rather than timing to prove WebGL batch and
  WebGPU handle reuse separately.

## Non-goals

- Skipping any part of full layout.
- Animating between old and new geometry.
- Keeping exiting views temporarily drawable.
- Defining one retained-batch API shared by WebGL, WebGPU, Canvas, and SVG.
- Redesigning mark rendering or GPU resource ownership beyond the smallest
  contracts required to separate resources from occurrences.

## Risks and open questions

- Enumerate the minimal explicit set of occurrence-topology changes without
  falling back to a fragile command diff.
- Some callback or occurrence options may be geometry-like while others change
  resource or command behavior. Their ownership must be made clear rather than
  compared generically.
- A single shared invalidation state may either recreate WebGPU resources too
  often or leave WebGL callbacks stale. Keep shared facts semantic and
  backend-cache decisions local.
- Stable accessor-backed rectangles are simple but may add repeated function
  calls; flat numeric state may be faster but require broader call-site changes.
- Hidden persistent semantic-zoom candidates are a Phase 5 concern and should
  not distort the initial visibility contract.

## Phase acceptance and review gate

The phase succeeds when geometry-only layouts demonstrably reuse WebGL batches,
already-retained compatible WebGPU resources survive, occurrence reordering
does not imply WebGPU resource recreation, and the change contract is easier to
explain than sequence reconciliation. Measure construction savings and
retained-state overhead before adding target and presented geometry.

Tentative commit sequence:

1. `refactor(core): distinguish occurrence and geometry changes`
2. `perf(core): update retained render geometry after layout`
3. `refactor(core): preserve WebGPU resources across layout changes`
4. `test(core): distinguish layout, topology, resources, and drawing`

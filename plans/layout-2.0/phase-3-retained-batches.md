# Phase 3: Retain Render Batches Across Geometry Changes

Status: Draft; revise after the Phase 2 review

Tentative PR title: `perf(core): retain render batches across layout changes`

## Purpose

Stop recreating normal and picking batches when a full layout changes only the
coordinates or clipping of existing layout instances. Batch construction should
be driven by explicit scene/topology invalidation, not by the fact that layout
ran.

## Findings to preserve

Buffered mark callbacks already read rectangle and clipping values when drawing,
so geometry can be changed through stable indirection without recreating the
callbacks. The earlier prototype verified this with replaceable `Rectangle`
sources and separate layout and scene generations.

It also exposed two traps:

- Reconciling every newly arranged command against the previous command sequence
  makes geometry updates depend on render order and complicates partial layout.
  Layout should update instances by stable identity; it should not scan command
  ranges to prove that a subtree is unchanged.
- Scene change cannot safely be inferred only from the number of commands.
  Identity, order, facet membership, clipping topology, generated chrome, mark
  readiness, and captured rendering options can affect a buffered callback.

The simpler intended contract is explicit: geometry changes update layout
state; operations that change render membership or order invalidate the scene.
Adding, removing, reordering, showing, or hiding configured views are clear scene
changes. Derived instances such as facets, guides, and scrollbars require equally
explicit ownership rules rather than traversal comparison heuristics.

`SampleView` already exercises both sides of this boundary. Peek updates mutable
per-sample locations, sizes, facet-texture data, and CPU facet positions while
the set of repeated samples stays stable; those frames should draw through an
existing batch. Filtering changes the sample hierarchy, repeated membership,
sidebar/metadata alignment, and potentially guide overhang; it explicitly
invalidates scene and size and should rebuild once after the update settles.

Clay's retained-rendering guidance is supporting evidence for associating
regenerated layout output with persistent graphics objects through stable IDs.
GenomeSpy should adapt that mapping concept through layout-instance indices or
slots. Do not adapt Clay's suggestion to byte-compare flat render commands:
GenomeSpy commands capture callbacks, rendering options, picking behavior, and
GPU state whose contracts are clearer through explicit scene invalidation. See
Clay's
[retained-mode guidance](https://github.com/nicbarker/clay#retained-mode-rendering).

## Intended outcome

- A full layout produces new target geometry for stable instances.
- Existing buffered callbacks observe the new geometry through the simplest
  viable indirection chosen after Phase 2.
- Normal and picking batches keep their identities when render membership and
  ordering are unchanged.
- Scene invalidation rebuilds both batches once after a transaction.
- Canvas size, device-pixel ratio, framebuffer, and picking-dirty state can be
  updated independently of command compilation.
- Layout, scene, and draw/presentation work are observable separately in tests.

## Provisional approach

Introduce an explicit scene-invalidated state at the coordinator or root
lifecycle boundary. Structural mutation helpers and view/container operations
that affect rendered membership or order mark it. A geometry-only layout does
not.

When the scene is clean, the completed layout result updates geometry associated
with stable instance IDs and requests a draw. When the scene is dirty, command
collection consumes the completed layout result and builds new normal and
picking batches. Command collection should never be used as a diff algorithm.

Possible geometry indirections include mutable rectangle slots, numeric records,
or ID-based lookup from buffered operations. Select based on allocation,
accessor-call, and ownership measurements. In particular, do not merge viewport
operations merely because their rectangles are currently equal: distinct
instances may later diverge.

Do not assume that batch retention requires retaining the current dynamic
`Rectangle` graph. A render command can instead retain a stable instance index
and read four committed scalars from numeric storage. Layout or presentation
updates would eagerly calculate derived rectangles and clips once. Compare that
approach with `RectangleSlot`: the latter is a smaller migration but preserves
closure dispatch and repeated dependency evaluation.

## Affected areas

- `RenderCoordinator` layout, batch-construction, and picking lifecycle.
- The Phase 2 layout-instance/result representation.
- Buffered and composite rendering contexts.
- Structural view mutations, facet updates, generated legends/chrome, and mark
  readiness paths.
- Render-target dimensions and viewport/clipping setup.

## Verification

- The nested step-sized/index-scale scenario changes final sizes and positions
  while normal and picking batch generations remain unchanged.
- Pure container resize and legend-extent changes retain batches when rendered
  membership is unchanged.
- SampleView peek frames retain normal and picking batches while updated
  locations, facet texture/CPU positions, clipping, summaries, chrome,
  scrollbars, and picking follow the visible samples.
- Sample filtering rebuilds batches once, preserves the identity of surviving
  sample facets, removes filtered instances, and produces correct layout and
  sidebar/metadata alignment.
- View insertion, removal, reordering, show/hide, and facet cardinality changes
  rebuild exactly once after a transaction.
- Picking and ordinary rendering use the same updated geometry.
- Logical canvas resize and DPR changes update viewport calculations without
  leaving stale constructor-captured state.
- SVG and headless output remain deterministic.
- Tests use counters or identities rather than timing to prove batch reuse.

## Non-goals

- Skipping any part of full layout.
- Animating between old and new geometry.
- Keeping exiting views temporarily drawable.
- Redesigning mark rendering or GPU resource ownership beyond what batch reuse
  requires.

## Risks and open questions

- Enumerate the minimal explicit set of scene-invalidating operations without
  falling back to a fragile command diff.
- Some callback options may be geometry-like while others change callback
  behavior. Their ownership must be made clear rather than compared generically.
- Stable accessor-backed rectangles are simple but may add repeated function
  calls; flat numeric state may be faster but require broader call-site changes.
- Hidden persistent semantic-zoom candidates are a Phase 5 concern and should
  not distort the initial visibility contract.

## Phase acceptance and review gate

The phase succeeds when geometry-only layouts demonstrably reuse both batches
and the invalidation contract is easier to explain than sequence reconciliation.
Measure construction savings and retained-state overhead before adding target
and presented geometry.

Tentative commit sequence:

1. `refactor(core): make scene invalidation explicit`
2. `perf(core): update retained render geometry after layout`
3. `test(core): distinguish layout work from batch construction`

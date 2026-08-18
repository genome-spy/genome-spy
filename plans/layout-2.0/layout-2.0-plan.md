# Layout 2.0

Status: Draft summary

This document is the current high-level roadmap for Layout 2.0. High-level draft
plans preserve findings and questions for each phase, but each draft must be
revised after the preceding phase has been completed and evaluated. Earlier,
more prescriptive proposals are preserved in [rejected/](rejected/) as design
history.

## Background

GenomeSpy's view lifecycle has grown organically. Layout calculation, coordinate
bookkeeping, render-command collection, and batch construction are closely
coupled, and `View.render()` does considerably more than its name suggests. The
implementation works, but its responsibilities and invalidation rules are
difficult to explain and change safely.

Performance is not currently a critical problem. Avoiding unnecessary work is
desirable, but maintainability and clear semantics are the primary motivation.

The longer-term feature goal is semantic zooming: smoothly showing and hiding
persistent tracks as the user zooms, including children of concat views rather
than only overlaid layers. When a track enters or exits the target layout,
surrounding tracks should move smoothly to their new positions.

Previous attempts have shown that batch retention, partial layout, repeated
facets, clipping, visibility, and animation interact in nontrivial ways. The
work will therefore proceed as a sequence of small PRs with an explicit review
gate after every phase.

## Previous implementation attempt

The branch `perf/layout-2.0` is a failed second implementation attempt and is
not the basis for the next PR. It combined lifecycle separation, retained
geometry, render-batch reuse, partial invalidation, subtree layout, metrics, and
scene invalidation before the underlying responsibilities had stabilized. The
result demonstrated useful behavior but introduced too many interacting caches,
generations, input snapshots, command records, and invalidation paths to satisfy
the maintainability goal.

The attempt established several findings that this plan preserves:

- `View.render()` can be separated into arrangement and render-command
  collection without changing final output.
- Geometry-only changes can be observed by existing buffered commands without
  rebuilding normal and picking batches.
- Axis-aware size invalidation, clean-sibling skipping, and scrollable subtree
  boundaries are feasible and testable against forced full layout.
- Positional command reconciliation couples layout reuse to render topology and
  is the wrong foundation for partial layout.
- The closure-backed `Rectangle` graph and SampleView peek already provide forms
  of retained presentation, but their costs and identities should be made
  explicit before generalizing them.
- Landing these concerns together makes it difficult to tell which complexity
  is necessary. Small PRs and a KISS/YAGNI review after each phase are required.

The rejected prescriptive plans and a more detailed retrospective are kept in
[rejected/](rejected/). The implementation branch remains useful as a prototype
and source of tests, not as code to merge incrementally.

Core `FacetView` is currently dormant and is a future compatibility target, not
the representative production workload for these phases. App `SampleView`
faceting is active and critical: repeated sample identity, filtering, peek
animation, facet textures and CPU positions, summaries, chrome, clipping, and
picking must keep working throughout the refactor.

SampleView peek is also an existing specialized view transition and an important
source of design evidence. It already separates fitted/scrollable targets from
mutable presented sample locations, but its closure-heavy coordinate graph,
linear per-frame updates, facet-texture preparation, and per-facet dispatch can
be costly with thousands of samples. After the general transition model is
proven, a separate measured App PR may migrate compatible parts of peek to its
flatter identity and geometry representation.

## Goals

- Make the view lifecycle easier to understand and maintain.
- Establish stable semantics for layout instances and their coordinates.
- Support smooth layout changes and semantic visibility for persistent concat
  children.
- Preserve deterministic canvas, SVG, headless, picking, and interaction
  behavior.
- Optimize only where measurements justify the added complexity.

## Non-goals

- Replacing GenomeSpy's layout model with a general-purpose layout engine.
- Requiring incremental layout for Layout 2.0 to be successful.
- Animating arbitrary dynamic insertion, removal, or reparenting in the first
  semantic-zoom implementation.
- Defining a public transition or semantic-zoom specification before the
  internal behavior is proven.
- Selecting detailed APIs and data structures for later phases in this summary.

## Rationale and key decisions

Layout 2.0 separates concepts that currently change together:

- **Render membership:** whether a persistent view has render commands and GPU
  resources.
- **Layout participation:** whether the view occupies space in the target
  layout.
- **Target geometry:** the canonical result of a completed layout calculation.
- **Presented geometry:** the coordinates currently used for drawing, picking,
  clipping, and interaction during a transition.

A persistent concat child can then leave the target layout while it remains
drawable during an exit transition. Siblings can move toward their targets
without recomputing layout on every animation frame.

Full layout recomputation is the baseline. Incremental layout is an optional
optimization and should be attempted only if measurements show that its benefit
is worth its invalidation and caching complexity.

Retain durable identity and expensive resources, but do not retain derived
layout state merely to avoid recomputing it. A complete layout pass may emit a
compact, keyed description of target geometry that is reconciled with retained
render resources and transition state. This hybrid direction is informed by
Dear ImGui's immediate-mode philosophy: application state remains authoritative,
cheap UI and draw descriptions are regenerated, and only state that must survive
is retained. See [Dear ImGui's overview](https://github.com/ocornut/imgui#how-it-works)
and [API principles](https://github.com/ocornut/imgui/blob/master/docs/FAQ.md#q-what-is-the-difference-between-dear-imgui-and-traditional-ui-toolkits).

The current closure-backed `Rectangle` graph is a clever form of retained
geometry: derived rectangles and old render callbacks observe upstream changes
without rebuilding batches. Its cost is implicit dependency chains, several
closures per derived rectangle, repeated calculation on property access, and
materialization/allocation when flattened. A different layout-result model may
store committed numeric geometry directly and make the closure graph unnecessary
on rendering hot paths. Preserve `Rectangle` through the lifecycle split, then
evaluate this architectural choice alongside stable layout-instance storage.

Stable layout-instance identity is a prerequisite for retention and animation.
It should be based on explicit concepts such as view, facet, and rendering role,
not traversal order or serialized keys.

[Clay](https://github.com/nicbarker/clay) provides additional evidence for this
direction. Its immediate-mode layout output uses stable semantic element IDs to
connect repeated layouts to transitions and retained renderers, and its local-ID
model shows how parent-instance scope can disambiguate reusable descendants. The
transferable idea is explicit identity based on domain keys and ownership, not
Clay's hashing or traversal-derived automatic IDs. See Clay's
[element-ID documentation](https://github.com/nicbarker/clay#element-ids) and
[retained-mode guidance](https://github.com/nicbarker/clay#retained-mode-rendering).

Clay's transition implementation also exposes requirements that should be made
explicit here: nested motion must not be applied twice, a semantic group needs
one owner for enter/exit lifetime, interaction during transitions needs a
policy, and exiting content needs deterministic paint order. These are design
and test requirements, not implementation patterns to copy. Clay recomputes
layout during active transitions and clones disappearing subtrees; both conflict
with GenomeSpy's layout-free animation frames and persistent-view starting
point. See Clay's
[transition processing](https://github.com/nicbarker/clay/blob/main/clay.h#L4188-L4478).
Clay's generation-based cleanup is also not a lifetime model for GenomeSpy:
absence from a target-layout result may mean non-participating but still
renderable, not destroyed.

## Alternatives considered

- **Implement incremental layout first:** rejected as the default sequence
  because it is not required for semantic zoom and introduces a large
  correctness surface before performance need is established.
- **Retain every computed layout object:** not assumed to be necessary. A full
  deterministic pass that regenerates compact target geometry may be simpler
  than synchronizing a deeply retained layout representation. Stable identity
  can connect that output to retained rendering and transition state.
- **Treat hidden views as immediately removed from rendering:** insufficient for
  smooth exit transitions. Persistent semantic-zoom candidates need separate
  render-membership and layout-participation state.
- **Plan the complete transition system up front:** rejected in favor of phase
  reviews because previous attempts exposed important requirements only during
  implementation.
- **Use bitmap snapshots for all transitions:** deferred. Snapshots may help
  with difficult structural cases, but persistent live views are the preferred
  starting point.

## Proposed phases and PRs

These boundaries are provisional. A phase may be split, combined, revised, or
stopped after review.

### Phase 1: Clarify the lifecycle

Refactor naming and responsibilities so layout, render-command collection, and
drawing are distinguishable. Remove the misleading `View.render()` name while
preserving behavior and full layout recomputation. Do not add speculative
transition or performance state.

Draft plan: [Phase 1: Clarify the layout and rendering lifecycle](phase-1-lifecycle.md)

### Phase 2: Establish stable layout instances

Introduce the smallest representation needed to identify repeated layout
instances and associate them with geometry. Define identity for ordinary views,
facets, axes, legends, decorations, and App-specific repeated sample views.
Focus on ownership and deterministic output, not animation or partial layout.

Draft plan: [Phase 2: Establish stable layout instances](phase-2-layout-instances.md)

### Phase 3: Retain render batches across geometry changes

Allow a completed full layout to update stable geometry without recreating
normal and picking batches. Separate geometry changes from render-membership or
command-order changes. Measure batch-construction savings and retained-state
overhead before planning further optimization.

Draft plan: [Phase 3: Retain render batches across geometry changes](phase-3-retained-batches.md)

### Phase 4: Separate target and presented geometry

Add non-structural layout transitions for persistent instances. A layout commit
computes targets once; animation updates presentation without layout or command
collection on every frame. Define interruption, picking, clipping, headless,
and reduced-motion behavior before adding visibility transitions.

Draft plan: [Phase 4: Separate target and presented geometry](phase-4-layout-transitions.md)

### Phase 5: Add semantic visibility for persistent concat children

Separate target layout participation from presentation visibility for views
that remain in the configured hierarchy. Animate concat-child entry, exit, and
sibling reflow at semantic-zoom thresholds. Arbitrary structural mutation may
initially remain immediate and rebuild render batches.

Draft plan: [Phase 5: Semantic visibility for persistent concat children](phase-5-semantic-visibility.md)

### Optional phase: Profile-guided optimization

Measure representative layouts after the maintainability and transition work.
Only then consider dirty-branch layout, relayout boundaries, allocation removal,
or other incremental techniques. Each optimization must be isolated and
justified by a profile, allocation trace, or reproducible work counter.

Opportunity record: [Profile-guided layout and rendering optimization](optional-profile-guided-optimization.md)

## Known layout optimization opportunities

Earlier prototypes demonstrated several potentially useful techniques. They are
recorded here so the findings are not lost, but they are not commitments for the
initial phases.

- **Partial size invalidation:** invalidate width and height independently and
  clear measurement caches only along ancestor paths whose output can depend on
  the changed dimension.
- **Clean-sibling skipping:** when an ancestor must recompute layout, avoid
  measuring or arranging sibling branches whose inputs and allocations are
  unchanged.
- **Subtree-scoped layout:** allow a dirty subtree to be arranged from its last
  allocated rectangle without starting at the root when a proven relayout
  boundary contains the change.
- **Scrollable viewport boundaries:** a fixed viewport dimension can contain
  changes in scrollable content size. Content geometry and scrollbars may need
  updating while outer layout remains unchanged.
- **Container-specific dependencies:** concat, grid, layer, legends, titles, and
  App-specific containers do not have identical size dependencies. Explicit,
  local rules may be simpler and safer than one generic propagation engine.
- **Coalesced invalidation:** multiple synchronous size changes should produce
  one final layout commit rather than repeated intermediate layouts.

If these techniques are revisited, partial layout must remain independent of
render-command ordering and batch topology. Stable layout-instance identity
should provide the geometry update path; command-range scanning or reconciliation
should not be required to skip a layout subtree.

Correctness should be established by comparing complete incremental results
against the deterministic full-layout path. Work counters should demonstrate
which measurements and arrangements were skipped, and performance measurements
should determine whether the added cache and invalidation state is worthwhile.

## Acceptance scenarios

Revised phase plans will select the applicable scenarios and add focused
assertions. These scenarios describe the intended direction without fixing an
implementation prematurely.

### Lifecycle and deterministic output

- Representative Core and App specifications retain the same final layout and
  rendering after lifecycle refactors.
- SVG, canvas export, headless rendering, normal rendering, and picking agree on
  final geometry.
- The full-layout path remains an obvious correctness baseline.

### Geometry changes without scene changes

- A nested step-sized view with an index scale changes size when its domain
  changes, and the final layout is correct.
- Once batch retention exists, persistent commands observe the new geometry
  without rebuilding normal or picking batches.

### Repeated and decorated views

- App `SampleView` facets, axes, legends, titles, backgrounds, scrollbars,
  clipping, and decorations have stable, unambiguous identities.
- Repeated instances use semantic or domain keys when their order can change.
  Parent-instance scope may disambiguate reusable generated descendants without
  making traversal position part of their identity.
- Equal rectangles belonging to different instances may later diverge without
  accidentally sharing presentation state.
- Sample filtering updates repeated membership, layout, metadata/sidebar
  alignment, guides, picking, and batches exactly when their contracts require.
- The existing SampleView peek transition continues to update sample positions,
  sizes, facet textures, CPU/SVG positions, summaries, scrollbars, chrome, and
  interaction without double interpolation or per-frame batch construction.
- The identity and layout-result model leaves a clear route for reviving Core
  `FacetView`, but its current behavior is not used as proof of correctness.

### Non-structural layout transition

- Resizing or repositioning produces deterministic start, intermediate, and
  target geometry without layout work on animation frames.
- Parent and child presentation remain coherent: movement inherited from a
  transitioning parent is applied exactly once, regardless of whether the
  implementation interpolates local or absolute geometry.
- Picking, hit testing, and clipping follow presented geometry; logical layout
  and scale sizing use target geometry.
- Persistent instances that remain in the target layout remain interactive
  through their presented geometry during the transition.
- Interruption continues from the current presentation without a visible jump.

### Semantic zoom in a concat view

- Crossing a zoom threshold changes the visible set of persistent concat
  children while exiting, entering, and sibling tracks animate coherently.
- The semantic track owns its enter/exit lifetime and presentation. Descendant
  layers follow that transition rather than creating independent enter/exit
  state.
- Exiting tracks stop participating in picking and interaction when the exit
  begins, even though they remain drawable until presentation completes.
- Exiting tracks have a deterministic, tested paint order relative to reflowing
  siblings; the initial policy is selected using the representative example.
- Reversing direction does not cause coordinate jumps. Hysteresis or an
  equivalent policy prevents threshold flicker.
- Layers inside a track behave as a unit.

### Immediate and structural fallbacks

- Headless rendering, reduced motion, and disabled transitions snap to targets.
- Actual insertion or removal may rebuild batches and use immediate behavior.
- Unsupported cases fall back deterministically without stale coordinates or
  commands.

## Risks and unresolved questions

- Stable identity must cover repeated and decorated instances without relying
  on traversal accidents.
- Keeping semantic-zoom candidates renderable while hidden may affect data
  initialization, resource lifetime, and memory use.
- Target and presented coordinate APIs must not expose ambiguous state.
- The initial enter/exit geometry and opacity policy is undecided.
- The location of semantic-zoom policy—specification, parameter expression, or
  application state—remains open.
- Transition interruption and threshold hysteresis require explicit semantics.
- Exit paint order must account for retained mark batching; Clay's underneath,
  natural, and above-sibling policies are useful cases to evaluate, not a public
  API requirement.
- Scope may grow toward arbitrary structural transitions; YAGNI review should
  keep those out until a concrete use case requires them.

## Review gate after every phase

Before planning or starting the next PR, record answers to these questions:

1. Did the phase make the lifecycle easier to explain and maintain?
2. Which new abstractions are required by behavior that exists now?
3. Which code or planned machinery can be removed under YAGNI?
4. Is there a simpler design that satisfies the demonstrated scenarios?
5. Are we retaining derived state that would be simpler and cheap enough to
   recompute?
6. Does the implementation preserve an obvious full-layout fallback?
7. What do tests, counters, benchmarks, or profiles actually demonstrate?
8. Should the next phase be pursued, revised, split, or stopped?

Passing tests is necessary but does not by itself satisfy this gate. A phase
should not continue merely because the roadmap lists it.

## Planning the next phase

The linked phase drafts record current evidence and prevent design findings from
being lost. Shortly before implementation, revise the applicable draft using the
preceding phase review. Confirm the immediate problem, intended behavior,
non-goals, affected areas, acceptance tests, and unresolved decisions, and remove
assumptions that are no longer supported. Avoid selecting APIs or data structures
that are not required to evaluate that phase.

# Facet completion and simplification review

Review date: 2026-10-10. Runtime baseline: `6f2d4f210`.

## Agreed scope

The user clarified the goal: **a plot can be repeated for different categories
without odd behavior**. Full Vega-Lite facet compatibility is not a requirement.
Retain one child subtree, shared scales, repeated axes, simple category labels,
and static batched dataflow. Ascending factor order is a sufficient default.

Grouping, supported partition-local transforms, shared legends, picking,
tooltips, selections with shared state, shared pan/zoom, and container viewport
scrolling are implemented. Complete predictable behavior and simplify existing
paths before adding capabilities.

The earlier sorting, configurable-header, outer-axis, and independent-domain
milestones are discarded as requirements for this completion pass. They may be
useful later, but their absence does not make category repetition incomplete.
Precomputed category fields suffice; bin/time-unit syntax, encoding macros,
per-cell parameter runtimes, and advanced layout/configuration are also outside
scope. Dynamic dataflow branches and optimizer improvements are unnecessary.

## Independent review: baseline correctness findings (resolved)

A read-only subagent review inspected the accumulated branch and ran focused
Node/jsdom probes through real view creation, layout, interaction dispatch,
parameter state, and dynamic removal. No runtime code was edited. These are
supported-path defects or accepted-option surprises, not parity requests.
All six findings below are now resolved; the completion record follows.

1. **Facet-owned controllers are not disposed.** `facetView.js:99` creates the
   inner `FacetGridChild`, but its lifecycle is not wired to teardown. Removing
   a facet during an interval drag leaves document mousemove/mouseup listeners;
   subsequent mouseup writes to a disposed `intervalDragActive` parameter and
   throws. Use existing ownership/disposer mechanisms and cancel controllers
   before dependent runtimes disappear. A parent grid only disposes its outer
   wrapper. `View.disposeSubtree` is post-order, so verify cleanup ordering.
2. **Rulers use the wrong cell geometry and duplicate ownership.**
   `ruler/rulerMouseEventController.js:184` projects through
   `view/scaleProjection.js:88`, which falls back to the arbitrary first
   `view.coords`. `GridChild.#setupRulers` also installs outer and inner
   controllers for facet-owned rulers. A probe at 20% of cell B on a [0,10]
   scale wrote 13 then about 6.19 instead of 2. A child-owned ruler is also
   cleared by the old cell's leave after the new cell's mousemove. Reuse the
   existing point-aware projection/ownership contract used by brushes and zoom;
   keep one logical controller and preserve the new cell's value.
3. **Layout refresh synthesizes false cell transitions.**
   `genomeSpy/interactionDispatcher.js:117–122` compares facet arrays by
   reference. `FacetView` rebuilds those arrays with the size/layout cache.
   Hover B, invalidate size, arrange, then move at the same point: B receives
   leave and enter despite unchanged category/geometry. Compare tuples by value
   using existing array utilities, rather than add a stable-identity registry.
4. **Child viewports are accepted but do not scroll as specified.**
   `FacetView.arrange` passes the same child rectangle as both content and
   viewport coordinates. A child of height 300 with viewportHeight 60 is placed
   at height 60, compressing its content and preventing overflow. For this
   scope, reject child viewport options with a clear error; keep the existing
   supported viewport on the complete facet grid. Do not add per-cell scroll
   state to repair an unsupported case.
5. **Unsupported resolution requests can silently share a union domain.**
   Validation checks only x/y; independent color scale/legend requests can be
   accepted without occurrence-specific domains. A headless probe produced the
   union [blue, red] across A/B. Reject unsupported per-cell resolution at the
   appropriate boundary; preserve legitimate independence between layers.
6. **The facet field type advertises an unused title.** `FacetFieldDef` aliases
   `FieldDefWithoutScale`, whose title is never consumed by facet labels. Honor
   it with existing title machinery only if small, or narrow the facet type.
   Do not grow a general configurable header API to resolve one unused option.

Paths above are relative to `packages/core/src`. The ordinary missing-field
boundary already fails loudly; it is not a confirmed silent data-loss issue.
These probes supplement the earlier implementation tests; the review has not
re-run the full suite or a browser matrix.

## KISS and SLOC direction

Keep `FacetView` as a lightweight container with one repeated `GridChild` and
reuse `gridChildArrangement.js`. It is shared code extracted from `GridView`,
not a separate facet renderer. Static transform batching is needed to keep
child aggregates/stack correct, and file provenance is needed for heterogeneous
multi-file inputs; deleting those contracts would reintroduce known failures.

The concrete simplification candidates are:

- Consolidate the two nearly identical `FacetGridChild` point-to-cell coordinate
  methods, and use that contract for rulers rather than a separate projection
  route. Different coordinate sources for similar controllers are a code smell.
- Remove unused header-size parameterization and redundant constants if all
  callers use the same fixed sizes. Do not build configuration machinery to
  justify a parameter that has no caller.
- Remove the redundant `this.spec = spec` assignment in FacetView; its base
  constructor already stores the specification.
- Combine visible-cell filtering and interaction-bound retention so clipping
  is computed once and layouts are not copied through a second pass. Combine
  the adjacent subtree scans for clip flags in `gridChildArrangement` locally.
- Avoid replacing header source data on arrangements where text/positions are
  unchanged: an unchanged layout currently increments header dataRevision.
  Treat this as allocation/work churn; do not introduce a large memoization
  subsystem merely to reduce small header updates.
- Review overlapping helper/layout/chrome assertions and implementation-detail
  snapshots. Preserve behavior tests for grouped data, clipping, dynamic
  membership, interactions, and teardown; delete tests of removed knobs.

Other smells to watch are facet checks spreading through generic grid/input
code, scrollbar callbacks walking descendants and causing full reflow, and
cache lifetime being mistaken for semantic identity. The current whole-layout
scroll refresh is a documented correctness workaround; a new incremental
layout system is not required for completion. Optimize it only with evidence.

Measured branch runtime delta against `master` (`e35d3bee9`), scoped to
`packages/core/src` JavaScript: **+1,330 / -738 = net +592 non-comment code
lines**, across 32 files. Tests, declarations, comments, and blank lines are
excluded. The comparison includes the stale, previously inactive FacetView on
master; it is a branch delta, not a measure of all newly enabled functionality.

Physical sizes: FacetView 500, facetLayout 223, facetHeaderView 76,
gridChildArrangement 408. GridView shrank from 2,425 to 2,059 physical lines.
The shared arrangement extraction must not be counted as 408 wholly additional
implementation lines. The reviewer measured an in-memory edit for removing
unused header-size arguments/constants, delegating duplicate projection, and
removing the redundant spec assignment: facetLayout 223 to 211 and FacetView
500 to 495, a combined **17 physical lines** saved. This is not a production
token count or an applied change. Other savings are unmeasured; measure the
actual diff rather than promise a large reduction.

## Completed work sequence and acceptance

1. **Lifecycle and interaction correctness.** Fix inner wrapper disposal, ruler
   ownership/projection/clearing, and false hover transitions. Reuse existing
   disposer and point-coordinate APIs, with focused regressions that exercise
   real facet specs and removal during an active drag. Split independent fixes
   into commits, for example `fix(core): dispose facet interaction controllers`,
   `fix(core): route rulers through facet cells`, and
   `fix(core): preserve facet hover identity across layout`.
2. **Clear supported-option boundaries.** Reject child viewports and unsupported
   per-cell resolution requests; resolve the unused title contract without
   building parity features. Check layered children and a facet inside concat,
   preserve supported shared legends and container scrolling, and document the
   limits. Tentative commit: `fix(core): validate supported facet options`.
3. **Small consolidation pass.** Merge duplicated projection logic, remove
   unused layout knobs, combine clipping passes, and trim related test overlap
   where this improves readability and reduces code. Measure runtime lines
   before/after. Tentative commit: `refactor(core): simplify facet layout helpers`.

Update the existing feature changeset and facet docs for user-visible fixes.
Final integration: wrapped Anscombe, cars matrix, and per-facet means must keep
correct grouped marks, shared domains/guides, and dynamic membership. Check
picking/tooltips, pan/zoom, brushes and rulers in later cells and a scrolled
viewport, then remove a facet during a drag. Use focused subsystem tests and
WebGL/Canvas checks where input/rendering contracts require them. Confirm one
child/dataflow subtree as category count grows. No optional Vega-Lite feature
blocks this acceptance.

## Completion record

- Controller lifecycle: GridChild registers controller cleanup on its content
  view, before parameter disposal. Guide views retain ordinary subtree cleanup.
  Focused tests cover facet removal and whole-root disposal during a brush.
- Rulers: the repeated child owns the controller and uses its pointed-cell
  projection. Cell transitions preserve the newly written value, while leaving
  the plot clears it. Document drags retain their initiating cell's rectangle.
  Real-spec tests cover facet/child parameter ownership and later-cell drags;
  existing concat-gap and ruler suites preserve ordinary ruler behavior.
- Hover identity: dispatch compares tuple values, avoiding synthetic leave/enter
  events after unchanged layout rebuilds. A real-spec regression also verifies
  that moving to another category still produces transitions.
- Child viewports: reject width/height viewport declarations anywhere in the
  repeated subtree with a message directing authors to the facet container.
  Existing container scrolling tests remain the supported contract.
- Per-cell resolutions: reject independent scale/legend declarations on the
  facet boundary, including default declarations. Layers retain independent
  non-positional scales whose domains span cells; a real-spec test verifies
  their distinct color domains. Positional independence remains rejected.
- Field titles: narrowed FacetFieldDef to its field/description contract and
  reject title declarations at runtime. Category value labels and repeated
  child titles remain supported. Schema and real-spec tests cover shorthand
  and mapped facet definitions without growing header configuration.
- Consolidation: fixed header sizes have one source of truth, point projection
  delegates to cell lookup, visible-cell clipping is computed once, and shared
  arrangement computes both clip flags in one subtree scan. Removed the unused
  clip-helper re-export and redundant spec assignment, and combined resolution
  validation into one path. Five overlapping
  factory/grouping/header-structure tests were removed; broader dataflow,
  layout, SVG, and chrome/addressability tests retain the contracts.
  Runtime files shrink by 44 physical lines (FacetView 532→520, facetLayout
  223→206, gridChildArrangement 408→396, GridView 2059→2056). The focused facet
  test file shrinks by 139 physical lines. These are before/after line counts,
  distinct from the parser-based branch production count above.
  All 344 focused facet, grid, SVG, and layout tests pass. The broader grid
  check also updated a keyboard fixture to model the disposer lifecycle.
- Header updates: compare new label values with the existing collector's rows
  before republishing. This keeps the dataflow unchanged after identical layout
  refreshes without a second cached state or memoization subsystem. Resizing
  and membership changes still update the labels, covered in the existing
  dynamic-header regression.

## Final verification and status

Basic category repetition meets the agreed acceptance target. There is no
remaining known correctness issue from this review. Full Vega-Lite syntax and
per-cell scales/runtimes remain outside scope. The existing TODOs for facet
scroll reflow, partition optimization, collector fusion, and file provenance
remain profiling-led future work rather than prerequisites.

- Full suite: 518 files pass; 4,806 tests pass, one skipped, two todo.
- Workspace TypeScript checks, lint, Core production build/schema/declarations,
  generated-schema regressions, release policy, and release status pass. The
  existing feature changeset retains a minor release for the synchronized group.
- Six browser scenarios cover inherited/repeated child-owned data and scrolling
  in WebGL and Canvas: picking, facet identity, custom tooltip content, point
  selection, wheel zoom, and document pan.
- Eight additional browser scenarios cover facet-owned and child-owned rulers,
  stable hover across layout refresh, ruler drags beyond their starting cell,
  interval brushes, and removing the subtree before releasing an active drag.
  Native mouse assertions allow one screen pixel of coordinate rounding.
  Screenshots confirm ruler/brush placement in scrolled cells. No application
  console errors occurred; development HMR connection messages were excluded.
- Anscombe wrapped, cars matrix, and the per-facet means example pass smoke
  checks in both WebGL and Canvas.

Parser-based runtime JavaScript counts exclude tests, declarations, comments,
and blank lines. The consolidation commit (`fae42612a`, compared with
`ded9aaca2`) adds 51/deletes 80: **net -29 production lines**. The complete review
fix pass through `a06f1134f`, compared with the plan commit `6e1537b6e`, adds
140/deletes 87: **net +53 production lines**, including necessary validation,
controller cleanup, ruler routing, hover equality, and header-update checks.
The final branch compared with master `e35d3bee9` adds 1,397/deletes 752:
**net +645 production lines** across 34 runtime files. These are branch deltas;
master contains an inactive old FacetView. The completion pass does not add
per-cell view/dataflow/controller instances.

The plans remain versioned as requested. Reconcile and retire them before a
future PR/merge under the repository workflow; no PR or merge is part of this
completion pass.

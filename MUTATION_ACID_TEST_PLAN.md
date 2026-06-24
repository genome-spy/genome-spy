# Mutation Acid Test Plan

## Why this is needed

GenomeSpy now supports dynamic view hierarchy mutations, lazy dataflow
initialization, and on-the-fly scale resolution updates. These features interact
in complex, timing-sensitive ways that are hard to validate with unit tests
alone. A focused "acid test" suite would provide confidence that core
invariants hold under real mutation scenarios, including visibility toggles,
subtree insertion/removal, and in-flight data loads. See `ARCHITECTURE.md` for
the current lifecycle, dataflow, and resolution details that these tests should
cover.

## Goals

- Catch regressions in view hierarchy mutations (insert/remove/reorder).
- Verify dataflow wiring and propagation when views are initialized lazily.
- Ensure scale/axis resolution stays consistent across dynamic changes.
- Detect UI-visible issues such as missing marks, axes, or stale domains.
- Ensure complex mutations that are canceled immediately leave the internal
  hierarchy effectively identical to the pre-mutation state.

## Proposed scope (initial draft)

- Define a small set of mutation scenarios that reflect real usage.
- Build a test harness that can drive mutations and assert invariants (see the
  lifecycle and mutation notes in `ARCHITECTURE.md`).
- Use synthetic specs with controlled data to make failures deterministic.
- Include a slow/async data source to exercise in-flight load timing.

## Mutation scenarios to cover (draft)

- Toggle visibility of a hidden subtree with chrom/pos encodings.
- Add/remove a subtree that shares a data source with an existing branch.
- Reinsert a previously removed subtree with shared scales/axes.
- Apply a complex speculative mutation sequence and cancel it immediately.
- Switch visibility via URL hash/bookmark restore during initial load.
- Mutate encodings (e.g., add a channel) and confirm mark encoders reinit.

## Round-trip cancellation invariant

Acid tests should include "round-trip no-op" scenarios. The test should capture
a stable internal snapshot, apply a complex mutation sequence, cancel or undo it
immediately, await lifecycle stabilization, and compare the resulting state with
the baseline.

The comparison should not require raw object identity everywhere. It should use
a normalized representation of the relevant internal state, with targeted
identity checks for objects that are expected to survive cancellation, such as
pre-existing views, shared data sources, collectors, scale resolutions, and
parameter scopes.

The snapshot should cover:

- View hierarchy structure, names, import scopes, types, visibility, data init
  states, and parent relationships.
- Dataflow sources, collectors, branch shape, observer counts, and loading
  statuses.
- Scale, axis, and legend resolution membership and view-level config
  attachments.
- Axis, gridline, legend, separator, title, and other generated guide/chrome
  views.
- Param scopes, registered params, subscriptions, and lifecycle owner state.
- Layout-relevant cached state or a stable rendered/layout hierarchy snapshot.

The post-cancel state should be effectively identical to the baseline: no extra
collectors, listeners, guide views, resolution members, param scopes, data
reloads, or stale references may remain.

## Invariants to assert (draft)

- Every visible UnitView has a dataflow branch with a Collector.
- Collectors for visible views receive data after initialization completes.
- ScaleResolution members match the visible view set (no stray members).
- Axis/gridline views exist and render for visible scale resolutions.
- Encoders never see chrom/pos channel defs after linearization.
- No extra data reloads when not needed; no missed reloads when required.
- Canceling a speculative mutation restores the normalized internal snapshot.

## Test harness outline (draft)

- A spec builder that can generate a small, layered layout with shared scales
  (matching the view hierarchy and resolution rules in `ARCHITECTURE.md`).
- A mutation driver that can apply ordered changes and await completion.
- A stable snapshot collector for views, dataflow, resolutions, generated
  guide/chrome views, params, subscriptions, and layout output.
- A verification layer that compares snapshots and inspects selected object
  identities where cancellation should preserve them.
- A mocked slow data source to control load timing and partial propagation.

## Initial executable coverage

`packages/core/src/view/viewMutationApi.acid.test.js` contains the first
round-trip cancellation scenario. It captures a normalized internal hierarchy
snapshot, rendered layout snapshot, and selected object identities, then applies
an add/reorder/remove mutation sequence inside a transaction and verifies that
the pre-existing hierarchy is restored.

This first scenario covers generated guide/chrome views, flow handles,
scale/axis/legend resolution summaries, and layout output. It does not yet cover
slow data sources, visibility toggles, encoding mutation, or URL/bookmark
restore.

## Testability considerations

To make acid testing feasible and reliable, some architectural improvements may
be needed. Areas to revisit:

- Provide a minimal, headless test context for view creation and dataflow (see
  view context responsibilities in `ARCHITECTURE.md`).
- Expose stable inspection hooks for flow nodes and scale resolutions.
- Allow deterministic control of async load completion (test hooks/mocks).
- Make lifecycle boundaries explicit (e.g., "data ready" for subtree).
- Avoid hidden side effects that require a full render loop to stabilize state.

## Items that need further analysis

- Exact lifecycle sequence when restoring from URL/bookmark.
- Dataflow behavior when attaching new branches during in-flight loads (see the
  dataflow lifecycle in `ARCHITECTURE.md`).
- Scale resolution membership rules with mixed visibility states (resolution
  notes in `ARCHITECTURE.md`).
- Axis/gridline lifecycle for views that toggle visibility frequently.
- How to best validate mark/encoder readiness without a GPU context.
- Identify dependency directions between view/data/encoding propagation,
  resolutions, and parameters to pinpoint fragile couplings.

## Potential architecture gaps to revisit later

- Reliance on global coordination for dataflow and scale resolution updates.
- Limited visibility into when data propagation has fully settled.
- Implicit coupling between view creation and dataflow initialization (tracked
  in `ARCHITECTURE.md`).
- Lack of a formal mutation API that enforces lifecycle ordering.

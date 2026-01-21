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
- Switch visibility via URL hash/bookmark restore during initial load.
- Mutate encodings (e.g., add a channel) and confirm mark encoders reinit.

## Invariants to assert (draft)

- Every visible UnitView has a dataflow branch with a Collector.
- Collectors for visible views receive data after initialization completes.
- ScaleResolution members match the visible view set (no stray members).
- Axis/gridline views exist and render for visible scale resolutions.
- Encoders never see chrom/pos channel defs after linearization.
- No extra data reloads when not needed; no missed reloads when required.

## Test harness outline (draft)

- A spec builder that can generate a small, layered layout with shared scales
  (matching the view hierarchy and resolution rules in `ARCHITECTURE.md`).
- A mutation driver that can apply ordered changes and await completion.
- A verification layer that inspects views, flow nodes, and scale resolutions.
- A mocked slow data source to control load timing and partial propagation.

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

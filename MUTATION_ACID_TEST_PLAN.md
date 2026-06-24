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

## Mutation scenarios to cover

### Highest value

1. Lazy source insertion during in-flight loading - done

   Insert a new track that shares or uses a lazy/windowed data source while
   another source is loading. Verify the inserted view receives data, renders,
   and can be removed cleanly.

2. Immediate cancel acid sequence with async data - done

   Capture a baseline snapshot, insert an async/lazy track, reorder it, remove
   it before or after data resolves, and compare the normalized hierarchy,
   guides, flow handles, resolutions, and rendered layout with the baseline.

3. Shared guide ownership churn - done

   Use multiple tracks with a shared x axis and a shared color legend. Add,
   remove, and reorder tracks so the owner of a shared axis or legend changes.
   Verify guides remain present, measured, rendered, and free of stale guide
   views. Also verify scale, axis, and legend resolution members match the
   current live children and preserve correct domains after mutation.

4. Inherited data insertion and removal - done

   Use a container with inherited data and transforms, then insert tracks that
   inherit that data instead of declaring their own source. Verify inserted
   collectors attach to the correct upstream branch, inherited transforms are
   applied once, removal leaves no stale observers, and canceling returns the
   dataflow graph to its baseline shape.

5. Parameter scopes and subscriptions - done

   Insert and remove views that declare or reference params. Include scoped
   repeated specs that use the same param names. Verify param scopes,
   subscriptions, signal values, and expression dependencies are registered and
   disposed with the view subtree, and that pre-existing param subscriptions
   survive round-trip cancellation.

6. Repeated same spec object with scopes - done

   Insert the exact same `ViewSpec` object multiple times using different
   scopes. Verify independent handles, selectors, titles/data, no shared spec
   mutation, and correct removal of one instance.

7. Nested containers - done

   Mutate a named concat inside another concat, grid, or layer. Verify scoped
   selectors resolve through the hierarchy, implicit chrome is preserved, and
   sibling branches are unaffected.

8. Transaction batching - done

   In one transaction, insert several tracks, move one, and remove another.
   Verify one final layout/render pass, stable final order, and no intermediate
   stale guide or dataflow state leaks.

9. Failure rollback after partial insertion - done

   Force a failure after spec insertion but before full initialization, for
   example with invalid assembly, data, font, or import setup. Verify backing
   spec, live child list, guide views, dataflow collectors, and handles roll
   back.

10. Move render freshness - done

   Reorder tracks where layout bounds change but data does not reload. Verify
   the canvas changes immediately without resize and overlay controls update
   from `subscribeToLayout()`.

### Important secondary coverage

11. Layer container semantics

   Insert, remove, and reorder layer children. Verify z-order changes without
   data reload and without incorrectly creating concat-style chrome.

12. Implicit root behavior - done

    Start from a root unit spec that is wrapped internally. Verify `root()`,
    selectors, layout bounds, and mutations under the actual mutable container
    behave predictably.

13. Handle liveness under nested removal

    Keep handles to a parent and its descendants, remove the parent subtree,
    then verify all descendant handles are dead and cannot be used for
    move/remove/layout-bounds operations.

14. Duplicate names across scopes

    Insert views with the same `name` under different scopes. Verify scoped
    selectors resolve correctly and unscoped ambiguous selectors fail fast or
    follow the documented behavior.

15. Named data updates after mutation

    Insert a track using `data.name`, call `updateNamedData()`, remove it, and
    update the named data again. Verify no stale collectors or listeners remain.

16. Visibility toggles

    Insert hidden or conditionally visible views, toggle visibility, then remove
    and reinsert them. Verify layout, guide ownership, and data initialization
    remain consistent.

17. Resize after mutation

    Add, reorder, and remove tracks, resize the container, and verify layout
    bounds, canvas rendering, axes, legends, and overlay controls remain
    aligned.

18. Import spec scope reuse

    Import the same template multiple times with different scopes, then mutate,
    remove, and reorder imported instances. Verify imported scope addressing and
    cleanup.

19. Complex undo round trip

    Apply a realistic sequence: add a signal track, add a variants track, move
    variants up, remove signal, then immediately undo to the original state.
    Compare the normalized internal hierarchy with the baseline.

20. Error ordering and serialization

    Queue several mutations quickly, including one invalid operation. Verify
    operation order, rejection behavior, and final hierarchy state are
    deterministic.

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
- Views with inherited data attach to the correct upstream flow node and do not
  duplicate inherited transforms.
- Removing a subtree removes its dataflow observers, collectors, and named data
  listeners without disturbing inherited-data users that remain live.
- ScaleResolution members match the visible view set (no stray members).
- Shared scale domains reflect the current live members after add/remove/reorder
  and return to the baseline after round-trip cancellation.
- Axis/gridline views exist and render for visible scale resolutions.
- Shared axis and legend definitions match the current resolution owners and do
  not retain removed views.
- Param scopes, registered params, expression subscriptions, and signal values
  match the live view hierarchy.
- Removing or canceling a mutation disposes params introduced by that subtree
  while preserving pre-existing param objects and subscriptions.
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

## How to proceed next

Implement the highest-value scenarios first. Each scenario should be its own
commit so regressions, follow-up fixes, and review feedback can be traced to one
behavioral concern at a time. If a scenario needs reusable test infrastructure,
put that infrastructure in a small preparatory commit before the scenario that
uses it.

Suggested order:

1. Done: Add the minimum reusable acid-test harness needed for the next
   scenarios.

   Keep this focused on normalized snapshots, selected identity checks, and
   lifecycle settling. Do not broaden the harness beyond what the first new
   scenario needs.

   Commit shape: `test(core): factor view mutation acid test harness`.

2. Done: Implement lazy source insertion during in-flight loading.

   Commit shape: `test(core): cover lazy insertion during in-flight loading`.

3. Done: Implement the immediate cancel sequence with async data.

   Commit shape: `test(core): cover async mutation cancellation`.

4. Done: Implement shared guide ownership churn.

   Commit shape: `test(core): cover shared guide ownership churn`.

5. Done: Implement inherited data insertion and removal.

   Commit shape: `test(core): cover inherited data view mutations`.

6. Done: Implement parameter scopes and subscriptions.

   Commit shape: `test(core): cover params across view mutations`.

7. Done: Implement repeated same-spec insertion with scopes.

   Commit shape: `test(core): cover repeated scoped spec insertion`.

8. Done: Implement nested container mutation coverage.

   Commit shape: `test(core): cover nested container view mutations`.

9. Done: Implement transaction batching coverage.

   Commit shape: `test(core): cover batched view mutation lifecycle`.

10. Done: Implement failure rollback after partial insertion.

    Commit shape: `test(core): cover failed insertion rollback`.

11. Done: Implement move render freshness coverage.

    Commit shape: `test(core): cover render scheduling after view move`.

After this highest-value batch, pause and evaluate the status before starting
the secondary scenarios. The secondary scenarios may expose new API design or
testability questions, so they should not be implemented mechanically before
the first batch has been reviewed.

When implementing the scenarios, fix trivial bugs as they are discovered. If the
bug is local to the scenario, include the fix and regression coverage in the
scenario commit. If the bug is incidental or affects existing behavior more
broadly, make a separate `fix(core): ...` commit before continuing the scenario.

If a scenario exposes a larger lifecycle or architecture issue that needs design
discussion, document it in this plan, mark the scenario as deferred or blocked,
and continue with the next independent scenario. One design issue should not
stall the whole acid-test expansion.

## Initial executable coverage

`packages/core/src/view/viewMutationApi.acid.test.js` contains the reusable
acid-test harness and the first batch of executable scenarios. The covered
scenarios capture normalized internal hierarchy snapshots, rendered layout
snapshots, selected object identities, dataflow object counts, and shared guide
ownership.

Current executable coverage includes round-trip cancellation, lazy insertion
during an in-flight shared load, async branch insertion/removal cancellation,
shared guide ownership churn after add/move/remove operations, and inherited
data insertion/removal, scoped params/subscription cleanup, repeated scoped spec
insertion, nested container mutation, transaction batching, failed insertion
rollback, move render freshness, and implicit root behavior. It does not yet
cover visibility toggles, encoding mutation, or URL/bookmark restore.

## Testability considerations

To make acid testing feasible and reliable, some testing infrastructure should
be factored out of the first acid test and strengthened. These changes should
stay in test utilities unless the production API needs the same capability.

- Extract a reusable mutation acid harness.

  The current acid test has local snapshot helpers. Move the stable parts into
  test utilities so new scenarios can reuse a common setup: create a headless
  engine, create the view API, render to a stable layout snapshot, apply ordered
  mutations, await stabilization, and compare normalized snapshots.

- Define a stable normalized hierarchy representation.

  The snapshot should intentionally represent public and lifecycle-relevant
  facts: view names, types, layout/data parents, child order, visibility, data
  init state, flow handle presence, generated chrome, and resolution summaries.
  It should avoid incidental object shapes that make tests brittle.

- Add identity assertions as an explicit helper.

  Round-trip cancellation tests need both structural equality and selected
  identity preservation for pre-existing views, collectors, data sources, scale
  resolutions, and guide views. A helper should make these expectations explicit
  per scenario.

- Provide deterministic async/lazy data test sources.

  In-flight data scenarios need controllable promises or a mock lazy source that
  can pause, resolve, reject, and report request counts. Without this, tests
  either become timing-sensitive or miss the real lifecycle risk.

- Add lifecycle settle helpers.

  Tests need a clear way to await mutation completion, data readiness, guide
  rebuild, layout computation, and render scheduling. Existing mutation promises
  cover operation-specific work, but async source and visibility tests need a
  reusable "settle until stable" helper.

- Improve dataflow inspection for tests.

  Acid scenarios should inspect collector/source counts, observer membership,
  loading status, and branch ownership without traversing private implementation
  details ad hoc in every test.

- Improve guide/resolution inspection for tests.

  Existing code can inspect scale, axis, and legend resolutions, but the shape
  should be centralized so tests can compare guide ownership churn and stale
  members consistently.

- Keep browser-level checks separate from core acid tests.

  Scenarios such as overlay alignment and immediate canvas refresh are useful,
  but they involve DOM/canvas behavior. Core acid tests should verify layout
  bounds and render scheduling; browser smoke tests can verify actual overlay
  positioning.

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
- Parameter-driven scale-domain changes can affect axis extents and layout
  caches even after the parameter value is reset. This is broader than mutation
  cleanup, so the current params acid scenario audits hierarchy and
  subscription cleanup but leaves layout-cache invalidation for separate
  analysis.

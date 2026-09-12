# Interaction consolidation

Status: implemented and verified; reviewed by a Luna xhigh subagent before
implementation.

## Goal and scope

Reduce production code and independently maintained interaction state without
splitting large controllers merely to relocate their contents. Preserve the
selection grammar, embedding APIs, rendering contracts, and established input
ordering. Work on the current branch.

The investigation found repeated document-drag lifecycle in brushing, panning,
and scrollbars; cached brush hit state; duplicated picking mechanics; and manual
cursor refresh paths. These are consolidation candidates, not evidence that all
interaction behavior should move into the reactive graph.

Baseline physical lines (including comments and whitespace):

| File under `packages/core/src/`                | Lines |
| ---------------------------------------------- | ----: |
| `genomeSpy/interactionController.js`           |  1204 |
| `view/gridView/intervalSelectionController.js` |   763 |
| `view/zoom.js`                                 |   510 |
| `view/gridView/scrollbar.js`                   |   305 |
| `genomeSpy/cursorManager.js`                   |   131 |
| `ruler/rulerMouseEventController.js`           |   215 |
| Total                                          |  3128 |

For every milestone, record before/after counts over all affected production
files, including new helpers, and inspect `git diff --stat`. Controller shrinkage
alone is insufficient. Accept growth only for a documented correctness or
maintenance benefit; discard abstractions that merely move or expand the glue.

## Architectural grounding and comparable design

Read `ARCHITECTURE.md`, `packages/core/ARCHITECTURE.md`, and Core's
`docs/architecture/{views-and-dataflow,reactivity}.md` before implementation.
The view tree owns routing and lifecycle; scales own domain/navigation policy;
the parameter runtime owns coherent derived updates; the renderer owns picking.
Keep these boundaries.

Relevant current implementation:

- `genomeSpy/interactionController.js`: native ingress, GPU pick coordination,
  hover, tooltip policy, wheel inertia, touch normalization, and API events.
- `genomeSpy/interactionDispatcher.js`: layered routing and subtree transitions.
- `view/gridView/intervalSelectionController.js`: brush gestures, projection,
  normalization, overlay state, and commit subscriptions.
- `view/zoom.js` and `view/gridView/scrollbar.js`: separate document drag handlers.
- `ruler/rulerMouseEventController.js`: a fourth document-drag consumer, with
  caller-owned coordinate mapping and release clearing but no hover suspension.
- `genomeSpy/cursorManager.js`: cursor ownership and expression subscriptions.
- `genomeSpyBase.js`: interaction registration and pick invalidation on render
  and engine destruction; preserve these existing lifecycle boundaries.
- `paramRuntime/embedParamApi.js` and its tests: public selection change/commit
  delivery, including settled derived parameters on programmatic commits.
- `view/viewInteractionListenerTracker.js`: existing view-listener cleanup.
- `view/gridView/selectionRect.js`, `view/gridView/gridView.js`, and scale
  selection/domain utilities: downstream overlay, ownership, and linked-domain
  behavior that must survive the refactor.

Vega's local `tmp/vega/packages/vega-dataflow/src/EventStream.js` provides filter,
map-like application, merge, and start/end gating through `between()`.
`tmp/vega/packages/vega-view/src/events.js` centralizes event ingress and listener
tracking. Its `docs/examples/crossfilter-flights.vg.json` also illustrates that
brush logic remains in signal definitions rather than disappearing.
Inspected Vega revision: `c03b7d0fe369be1a6e81d23dc899aef6eb7da967`.
Upstream reference:
<https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-dataflow/src/EventStream.js>.

Borrow the design principle of centralized event lifetime and explicit derived
dependencies. Do not copy code in this work by default. Before copying or closely
adapting any implementation, verify its license against this repository and
record a revision-pinned source and required attribution near the code.

## Decisions and preserved contracts

1. Introduce at most a small shared drag-lifetime primitive if the four callers
   demonstrate net benefit. It owns document listeners and exactly-once cleanup
   and hover resumption. Callers own geometry, selection publication, and inertia.
   Register cancellation with the actual owning view/controller lifecycle.
   Distinguish release from cancellation: disposal must not commit a selection
   or start pan inertia. Do not impose global exclusive ownership without
   establishing existing layered routing and simultaneous-listener behavior.
2. Determine whether a press hits the current brush from its actual position and
   current selection. Remove `mouseOver` and its dedicated move listener.
   Represent active brush mode/start geometry once; derive the overlay active
   flag and internal active test from that lifetime. Retain independent state
   such as pending click suppression where its lifetime differs.
3. Share picking read/invalidation/hit-resolution mechanics only. Preserve a
   synchronous return path for synchronous renderers. Hover is latest-intent
   coalesced; each mark event retains its own coordinate/result; explicit `pick`
   remains observational and returns hit/empty/invalidated without changing hover.
   Keep existing error behavior and native subscription veto/order contracts.
4. Audit cursor publication after the above changes. Prefer a single explicit
   update boundary; use existing owned signals/computeds/effects only if they
   remove coordination and preserve required timing. Never add a second scheduler.
   Preserve frozen/suspended cursor behavior and reactive cursor expressions.
5. Retain synchronous wheel claiming and `preventDefault()` decisions, click vs
   drag thresholds, sticky/long-press tooltip policies, touch gestures, inertia,
   shared-scale ownership, index/locus rounding, and current nonlinear behavior.
   Existing nonlinear translation limitations are not part of this refactor.

## Non-goals and alternatives

- No general event-stream language, Rx dependency, Vega runtime adoption, or
  conversion of every interaction flag into a signal. The abstraction cost is
  unjustified by the current consumers and does not solve asynchronous picking.
- No file-splitting project, new public gesture API, Pointer Events migration,
  changed mouse/touch semantics, or new recovery/reentrancy machinery.
- No scene-graph rewrite or changes to scale math and GPU selection encoding.
- Keeping drag handlers entirely local avoids an abstraction, but retains three
  copies of listener/hover cleanup. Keep local computations while sharing only
  the proven lifetime contract.
- Making every pick asynchronous simplifies a signature but changes observable
  synchronous dispatch; reject that alternative.

## Milestones

### 1. Consolidate drag lifecycle and brush state

The shared lifetime is idempotent and owner-disposed. Keep coordinate mapping
caller-owned: interval/ruler use view offsets, pan uses client deltas, and scrollbar
uses axis coordinates. Hover hooks apply only to consumers that already suspend
hover; do not add hover suspension to rulers.

- [x] Inspect ownership/disposal callers and characterize release, cancellation,
      click suppression, and commit notification behavior before replacing handlers.
- [x] Replace duplicated drag listener setup/teardown in interval selection,
      viewport pan, scrollbars, and mousedown rulers with the smallest shared lifetime mechanism.
      Normalize coordinate handling only where caller coordinate contracts match.
- [x] Remove cached `mouseOver`; test the current press against current selection,
      host bounds, and ownership. Consolidate active-brush state and overlay updates.
- [x] Ensure controller/view disposal removes temporary listeners, including the
      pending click-to-clear mouseup listener where applicable. Distinguish cleanup
      from successful release. Preserve clear/external-write/commit semantics.
- [x] Verify brush creation, translation, shift modifiers, drag-outside release,
      panning with inertia, scrollbar movement, cancellation/disposal, balanced hover
      suspension, click propagation, and linked selection domains. Include a press
      after programmatic selection change without an intervening mousemove.

Affected areas: the four gesture consumers, view context/lifecycle wiring if
needed, overlay drag state, and selection commit/API consumers. Add focused
behavior tests near the code; use existing gridView/gridChild/zoom suites.
Use `test-genomespy-views` for generated overlays or view-tree tests.
No user-facing documentation or migration should be needed. Update internal
architecture documentation only if a shared ownership contract is introduced.

Tentative commit: `refactor(core): consolidate drag lifecycle and brush state`

Implementation result: the six baseline files decreased from 3128 to 3095
physical lines. Including the newly affected `gridView.js` and the shared
`documentDrag.js`, total affected production code increased from 5493 to 5514
lines. The 21-line growth buys owner-driven cancellation for pan, scrollbar,
ruler, and brush disposal, plus a tested release/cancellation ordering contract;
the original gesture consumers and their independently maintained brush state
shrank by 33 lines. Focused Vitest suites passed 121 tests. The five named
integration examples passed the browser rendering smoke check, and live browser
checks covered brush creation, translation after a programmatic update, wheel
zoom, clear, outside-canvas release, scrollbar dragging, and ruler release clear.

Release verification includes explicit ordering/cancellation assertions, scrollbar
disposal, and ruler release-clear versus disposal behavior. Use the ordering
matrix below as the contract.

### 2. Consolidate picking mechanics

- [x] Factor the common frame-read, invalidation-generation, and hit-resolution
      work used by `pick()` and `#handlePicking()` without conflating their policies.
- [x] Preserve synchronous renderer delivery, asynchronous hover coalescing,
      individual mark-event results, explicit-pick scope filtering, and invalidation.
- [x] Test synchronous and delayed reads, rapid movement, multiple clicks at
      distinct coordinates, scene invalidation, leaving/suspending during a read,
      native veto, and explicit-pick errors/empty results. Check that public picks
      never publish hover or tooltips and pending results cannot act after disposal.
- [x] Inspect downstream mark/point selection and embedding interaction API
      consumers for ordering assumptions; measure total changed production code.

Affected areas: interaction controller, renderer picking boundary, scoped hit
lookup, tooltip/hover subscribers, and embedding API consumers. Prefer extending
`interactionController.test.js` and existing picking tests over new mock-heavy
frameworks. Exercise both sync and async backend contracts regardless of which
renderer is available for browser smoke testing. No public docs/migration expected.

Tentative commit: `refactor(core): share picking mechanics across interaction paths`

Implementation result: `interactionController.js` increased from 1204 to 1226
physical lines. The 22-line growth centralizes framebuffer refresh, generation
validation, and scoped hit lookup while retaining separate hover, mark-event,
and explicit-pick policies and the synchronous fast path. The focused controller,
embedding parameter, and view mutation suites passed 85 tests; Core TypeScript
and lint checks passed. Browser rendering smoke checks passed for the point and
concat interval examples. Downstream inspection confirmed that point selections
still consume routed hover, view mutation handles only convert the public result,
and engine destruction invalidates reads before listener and renderer disposal.

### 3. Consolidate cursor publication if the audit supports it

- [x] Decide whether delayed hover/resume leaving a stale cursor is a bug to fix.
      The intended result is cursor convergence after an accepted asynchronous hover
      result. Characterize any changed timing as a correctness fix, not merely
      behavior-preserving cleanup; reject broader timing changes.
- [x] Trace cursor changes through dispatch, accepted asynchronous hover, resume,
      leave, post-render refresh, cursor-expression changes, and frozen interaction.
- [x] Replace duplicate refresh wiring with one coherent publication path if it
      reduces state/calls without weakening timing or lifecycle behavior. Keep tooltip
      gesture policy imperative. If this needs broader architecture or more machinery,
      mark implementation discarded with evidence and retain the audit findings.
- [x] Verify cursor state after delayed picks, double-click domain changes,
      stationary-pointer expression updates, suspended/frozen interaction, resume
      outside the canvas, and disposal. Preserve mark-over-view cursor precedence.

Affected areas: interaction controller, CursorManager, cursor expression owners,
and potentially the existing parameter runtime's owned observer APIs. A reactive
approach must account for dynamic dependencies and owner cleanup without putting
per-move topology reconstruction or allocations into a hot path.
Update internal reactivity documentation if its ownership contract changes;
no public documentation or migration expected.

Tentative commit if implemented:
`refactor(core): consolidate interaction cursor publication`

Implementation result: asynchronous resume and post-render refresh now keep the
previous cursor while the read is pending and publish exactly when the accepted
pick replaces hover. This fixes the stale cursor that previously survived the
read. Ordinary routed dispatch still publishes after hover acceptance; leave
clears cursor ownership; frozen and suspended paths preserve it; and expression
watchers continue updating the active source without pointer movement. Cursor
publication now passes through one controller helper while `CursorManager` remains
the owner of source precedence and subscriptions. Delayed refreshes also reject
results after pointer movement, leave, resuspension, or frozen interaction. The
controller grew from 1226 to 1237 physical lines; `cursorManager.js` remained at 131. The 11-line growth is the explicit acceptance predicate and callback needed
for asynchronous convergence without reviving obsolete hover.
Focused controller and cursor-manager suites passed 29 tests, including delayed
double-click refresh, delayed resume, resume outside the canvas, frozen and
suspended interaction, reactive expressions, and mark-over-view precedence.

## Review gates and integration verification

Review the shared drag contract and its four downstream consumers together after
milestone 1. Review picking ordering and any cursor dependency changes together
after milestones 2–3, including final integration. Apply worthwhile correctness
and simplification fixes before committing each coherent milestone; avoid
recursive reviews for minor fixes. Implementation review model is not prescribed
by this plan; the initial plan review uses the requested Luna xhigh subagent.

- [x] Run narrow Vitest suites with `--reporter=agent` during implementation.
      At final integration run the full unit suite, workspace TypeScript checks,
      and lint; distinguish pre-existing failures from regressions.
- [x] Use `debug-genomespy-web` for browser verification of
      `examples/core/selection/interval_points.json`, `interval_genome.json`,
      `interval_concat.json`, and `interval_linked_domain_two_way.json`, plus
      `examples/docs/grammar/composition/concat/scrollable-viewports.json`.
      Cover brush → translate → wheel zoom → clear, shared-view routing, drag release
      outside the canvas, pan inertia, scrollbar dragging, and tooltip/cursor recovery.
      Also exercise touch pan/pinch and synchronous page-scroll prevention on wheel.
      Exercise a mousedown ruler with release clearing and disposal during a drag.
      Use available interactive backends; explicitly report unavailable coverage.
- [x] Record final affected-file size deltas and explain any production growth.
      Keep tests for behavior and contracts; remove temporary implementation tests.
- [x] Reconcile every checkbox as complete or explicitly discarded, commit the
      reconciled record, then delete this temporary plan in a later commit before PR
      creation. Do not merge the plan.

Final integration passed all 477 Vitest files (4158 tests passed, one skipped,
and two todo), every workspace TypeScript check, and lint. The browser smoke
runner passed all five named examples. Live Chromium checks repeated brush
creation, translation, wheel zoom, clear, cursor recovery, and synchronous wheel
page-scroll prevention; synthetic browser `TouchEvent`s covered one-pointer pan
and two-pointer pinch with cancellation. The same browser session could not
provide physical touchscreen input. Earlier live checks covered shared-view
routing, outside-canvas release, pan inertia, scrollbar dragging, and ruler
release clear; owner-disposal behavior is covered by focused tests because
destroying the live example would remove the inspected canvas.

Across all affected production files, physical lines increased from 5493 to
5547 (+54). The original six baseline files finish unchanged in aggregate at
3128 lines: the interaction controller's 33-line growth is offset by the
33-line interval-controller reduction and the net reduction in zoom/scrollbar
versus ruler changes. The remaining growth is the 46-line shared drag lifetime
and eight lines of `GridView` ownership wiring. That cost replaces four temporary
document-listener lifetimes with an idempotent, owner-cancelled contract and adds
the tested async pick/cursor acceptance boundary; no general event abstraction
or new scheduler was introduced.

## Risks and questions to resolve during implementation

- Which object owns a pan session across shared-resolution/gap routing, and which
  existing disposal path can cancel it? Resolve before selecting helper placement.
- Selection commits currently combine release notification and a parameter effect
  gated by brushing. Establish their ordering and multiplicity before simplifying;
  do not silently change public commit behavior or linked-domain echo handling.
- Hover suspension is counted and long-press behavior intentionally defers clearing.
  A helper must preserve nested callers rather than replacing the count blindly.
- Pending picks, post-render refresh callbacks, and tooltip timers can outlive
  listener removal. Check lifetime invalidation using existing mechanisms; avoid
  introducing unrelated async infrastructure.
- Cursor effects can run later than imperative dispatch. Choose a timing boundary
  explicitly and reject a reactive conversion that changes observable behavior.

## Acceptance criteria

- Shared gesture lifecycle replaces duplicated cleanup across all four consumers;
  brush hit decisions use current state and active gesture state has one owner.
- Picking mechanics are consolidated while sync/async event policies remain intact.
- Cursor consolidation is either verified and implemented or explicitly discarded
  with an evidence-based explanation.
- Relevant behavior tests and integration checks pass, public contracts remain
  stable, and total production changes demonstrate simplification rather than
  controller-only line movement. Any growth has an explicit justified tradeoff.

## Ordering and error contracts clarified by review

These requirements refine the milestones above and their verification.

| Path                         | Required sequence or behavior                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brush release                | Remove listeners and clear active/overlay state, resume hover, then notify commit.                                                                                                       |
| Programmatic selection write | Commit observers see settled derived parameters; retain the existing effect path and delivery multiplicity.                                                                              |
| Pan release                  | Cleanup, resume hover, then start inertia.                                                                                                                                               |
| Cancellation/disposal        | Exactly-once cleanup and applicable hover resumption; no release commit, inertia, or ruler release-clear publication.                                                                    |
| Native ingress               | Native listeners can veto before picking and routed handling.                                                                                                                            |
| Mark click                   | Mark listener invocation precedes generic click emission and routed click/point selection; listener promises are not awaited. Each mark pick retains its coordinates and result.         |
| Other mark events            | Preserve existing dblclick/contextmenu routing timing separately; do not assume the click wait policy applies to them.                                                                   |
| Explicit pick                | Check readback support first, validate finite/in-canvas coordinates next, then check `canPick`; render before read and reject invalidated results. No hover/tooltip publication.         |
| Pick failures                | Public async API rejects read failures, including synchronous read throws. Internal async rejection is logged and reports unsuccessful application; preserve synchronous throw behavior. |

Characterize these at observable API boundaries before changing them. This does
not add serialization of independent asynchronous mark reads. Extend verification
to unsupported readback, invalid coordinates while `canPick` is false, synchronous
throws, asynchronous rejection, and non-awaited mark listeners. Downstream audit
includes `paramRuntime/embedParamApi.test.js`, `genomeSpyBase.js`,
`view/viewMutationApi.js`, and UnitView point-selection consumers; locate the
mutation API file before editing if its path changes.

Sticky-tooltip temporary listeners and raw post-render RAF cleanup are audited
for regressions at engine destruction. A general tooltip lifecycle rewrite is
excluded; record existing unrelated defects separately rather than silently
expanding this consolidation. The cursor timing preservation rule permits only
an explicitly accepted, tested stale-cursor correction as described in milestone 3.

## Plan review reconciliation

Luna xhigh identified missing precision around release order, mark-versus-routed
click timing, actual drag ownership, pick validation/errors, and delayed cursor
publication. The plan includes explicit contracts and verification for each.
Its additional ruler consumer was verified in source and added to the baseline
and milestone 1. Coordinate mapping remains caller-owned. Tooltip lifecycle work
is bounded above. One review phrasing was corrected against source: coordinate
validation precedes `canPick`, but follows the unsupported-readback check.
No source implementation or tests were changed during plan review.

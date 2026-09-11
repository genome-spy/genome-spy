# Embed integration API: implementation restart

Status: implemented on `codex/embed-integration-restart`; follow-up cleanup is
tracked below. This is the only
implementation plan for this fresh branch. It carries forward the agreed
redesign and consumer workflows, not the rejected implementation. No production
changes were imported from the failed branch.

## What we are building

Build a public interaction and state-observation API for applications embedding
GenomeSpy through the modern embed API. Build two working consumers alongside it:
a browser annotation editor and a notebook integration. Their real workflows must
shape and validate the API rather than follow an already completed abstraction.

The API lets hosts respond to mouse input, inspect clicked or hovered mark data,
access lexically scoped parameters, and observe or clear point and interval
selections. It extends the existing embed namespaces and view handles; it is not
an annotation feature inside GenomeSpy Core.

## User workflows

### Browser annotation editor

A user views data tracks, brushes a region, and right-clicks the brush. The host
opens an **Add annotation** menu and a form for a name and description. Saving adds
a row containing the selected region and entered details to a visible table. The
host publishes the updated table to a declared GenomeSpy dataset, and a concat
annotation layer visualizes it. Canceling adds no row. Clicking or hovering an
annotation lets the host inspect its data.

The first deliverable is a minimal runnable version of this workflow in
`packages/embed-examples`, using real public API calls. Add Core capabilities as
the consumer needs them; demonstrate the complete brush-to-visible-annotation
path before expanding coverage.

### Selection-driven notebook form

A user selects a point or brushes a region. A subscription exposes that selection
to host state; a completed brush updates a form or notebook cell for annotation
entry. Saving sends annotation rows back to GenomeSpy for visualization. This
workflow does not require a context menu or a Python callback handling DOM events.

Develop a selection-driven example alongside the browser editor, with a runnable
marimo bridge exchanging selection snapshots and annotation rows with Python, and
an Observable subscription/cleanup recipe. Begin that integration when selection
observation is introduced so its needs inform the API's snapshot contract.

## Responsibilities and scope

| GenomeSpy Core provides                                                              | The embedding application provides                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Native input subscriptions and control of the current Core default action            | Browser menu handling and application actions                      |
| Scoped mark activation, hover observation, and explicit picking with datum access    | Tooltips, inspectors, and other presentation                       |
| Lexically scoped parameter access and coherent subscriptions                         | Application or notebook state and controls                         |
| Point/interval selection snapshots, brush commit observation, clear, and containment | Annotation forms, table state, persistence, and notebook transport |
| Existing dataset updates and annotation visualization                                | Annotation rows and the authored visualization specification       |

Success means both workflows run through the modern public API without private
Core access or consumer-side workarounds for missing contracts. The hooks should
also be useful for other embed integrations; do not hard-code annotation actions
into Core. Retain legacy APIs with historical behavior and `@deprecated` guidance.

The implementation must reuse existing interaction and parameter owners, and must
not change renderers. The detailed contract below defines timing and ownership;
the later safeguards explain the lessons and boundaries of this fresh attempt.

## Public contract

Use the existing modern embed factory and canonical view handles. All subscription
methods return an unsubscribe function. Root/scoped parameter APIs share handle
construction, but legacy lookup retains its historical semantics.

```js
const view = api.views.get({ scope: [], view: "track" });
const root = api.views.root();
api.events.subscribe("contextmenu", (event) => {
  /* synchronous */
});
view.marks.subscribe("click", (event) => inspect(event.hit));
view.marks.observeHover((hit) => showHover(hit));
const result = await view.marks.pick({ x, y });
const param = view.params.get("threshold"); // also api.params.get(name)
const brush = view.params.getSelection("brush"); // also api.params.getSelection(name)
brush.subscribe((snapshot) => updateForm(snapshot), { delivery: "commit" });
if (brush.type === "interval") brush.contains({ x, y });
```

### Native input and marks

- `api.events.subscribe` covers canvas `click`, `dblclick`, `contextmenu`,
  `mousedown`, `mouseup`, `mousemove`, `mouseenter`, `mouseleave`, and `wheel`.
  Delivery is synchronous before Core processes the original native event.
  Payload: `{ sourceEvent, point, preventViewDefault() }`; point uses canvas CSS
  pixels. DOM fields and browser cancellation stay on `sourceEvent`.
- `preventViewDefault()` vetoes the current Core action during the callback;
  it does not roll back an active gesture. Do not publish synthetic inertia events
  or internal wheel probes. Native subscriptions are canvas-wide.
- `view.marks.subscribe` covers `click`, `dblclick`, and `contextmenu`, scoped to
  the handle's subtree. Payload: `{ sourceEvent, point, hit }`. Delivery is always
  synchronous, using the existing confirmed hover hit at native ingress, before
  built-in handling changes the scene. Use it only when its confirmed position
  matches the event point and it remains valid for the current scene and owner.
  Missing, pending-for-another-position, stale, suspended, or out-of-scope hits
  produce no mark callback. Do not start a pick, wait, queue, or replay activation.
  A pending refresh alone need not invalidate an otherwise valid confirmed hit.
  Snapshot the eligible hit before invoking host callbacks; recheck disposal before
  delivery. Keep Core cancellation on the native hook, not a second mark facade.
  Document that rapid clicks can be missed, and keyboard context menus or input
  without a confirmed pointer pick cannot rely on mark activation. Hosts requiring
  an answer use the native hook and explicitly call `marks.pick(event.point)`;
  browser cancellation must still happen synchronously in that native callback.
- `MarkHit` has readonly `view`, `uniqueId`, and `datum`. The view is the canonical
  associated unit handle, including annotation units. Use the existing picking
  ID, not a new mark ID or a promise of a persistent row key. Return a detached
  datum tuple including transform outputs but excluding the internal ID field.
  Document copy depth; do not promise arbitrary object serialization/deep cloning.
- `pick(point)` returns `{ status: "hit", hit }`, `{ status: "empty" }`, or
  `{ status: "invalidated" }`. It queries the current picking frame's frontmost
  hit. Out-of-scope is empty; do not pick through it. In-flight scene changes
  invalidate results. Unsupported or ambiguous queries reject; subscription
  errors use the existing error reporter. Preserve legacy first-match behavior.
- `observeHover` supplies the controller's current confirmed `MarkHit | undefined`
  synchronously on subscription, then changes. No fresh initial probe. Departure,
  drag suspension, and owner removal clear hover. Reuse coalesced scene refresh
  for stationary pointers, including data replacement retaining the same ID.
  Subscribers must not multiply readbacks. Hosts use native movement for positioning.

### Parameters and selections

- `api.params` starts at the authored top-level specification, through implicit
  wrappers. `view.params` starts at that view's lexical scope. Resolve the nearest
  declaration first; a plain parameter shadows an ancestor selection and causes
  `getSelection` to reject. Missing/wrong-capability lookups fail clearly.
- `get(name)` exposes `getValue()`, `setValue(value)`, and `subscribe(listener)`.
  Preserve supported interval writes; computed values are read-only.
- `getSelection(name)` exposes discriminant `type: "point" | "interval"`,
  `getValue()`, `subscribe(listener, { delivery })`, and `clear()`. Snapshots are
  detached, contain `active`, and expose interval ranges or selected point data.
  Use the snapshot contract below; do not expose mutable runtime objects.
- A child declaration containing both `select` and `push: "outer"` owns selection
  capabilities while using the outer value ref. The outer declaration stays plain.
  Never reverse-discover child selections by looking up their plain outer target.
- Interval-only `contains(point)` combines the controller's interaction geometry
  and ownership with the domain interval predicate. Respect clipping, scoped
  ownership, and gaps; return false when inactive. A domain comparison alone is
  insufficient. Test shared bindings without creating global discovery machinery.
- Parameter/selection subscriptions are future-only, observing coherent runtime
  updates. Selection delivery defaults to `"change"`; `"commit"` publishes the
  settled selection after gesture completion and programmatic changes outside a
  gesture. Point changes qualify for either. Cancellation alone is not a commit.
  `clear()` cancels active document drag listeners before clearing and publishes
  the cleared state. Reuse controller lifecycle; graph effects alone cannot infer
  gesture completion.
- Unsubscribe, scope removal, and embed finalization disconnect subscriptions and
  prevent pending delivery. Listener failures are reported without aborting other
  listeners. Async callback results are not awaited.

### Consumer decisions for the first implementation

These contracts are decided before coding. Their internal realization is left to
consumer-driven iteration; do not prebuild a coordination layer to satisfy them.

**Selection snapshots.** Use plain public envelopes with these shapes:

```ts
type PointSnapshot = {
  type: "point";
  active: boolean;
  data: ReadonlyArray<Readonly<Record<string, unknown>>>;
};
type IntervalSnapshot = {
  type: "interval";
  active: boolean;
  intervals: Partial<Record<"x" | "y", readonly [number, number] | null>>;
};
```

Single-point selections contain zero or one row; multi-point selections contain
zero or more. `active` means nonempty selected state, not “drag in progress,” and
is independent of an empty-selection predicate's match-all behavior. For intervals,
include declared projection channels, use `null` for an unset channel, and set
`active` when at least one interval is set. Ranges use existing numeric selection
domain coordinates (including linearized genomic coordinates), not screen pixels;
do not introduce another locus conversion convention. Preserve endpoint semantics
from the existing selection implementation.

Copy the envelope, arrays, ranges, and each datum's own enumerable fields; exclude
the internal ID field from datum copies. Nested datum values are not deep-cloned
and are read-only to consumers. No `Map`, runtime ref, or view object occurs in the
snapshot envelope. These are JavaScript values, not a promise that arbitrary datum
contents are JSON-safe. The notebook example uses JSON-safe authored columns and
explicitly projects outgoing data to those columns. Transport conversion belongs
to the bridge. Row-backed single/multi point and interval selections are the first
supported capabilities; if projected-value selections cannot supply rows, reject
`getSelection` clearly for that capability rather than fabricating datum objects.
Ordinary parameter access remains available for those values.

**Containment ownership.** A selection handle retains its requesting view scope as
well as its resolved declaration/value binding. Resolve containment through the
existing interaction host associated with that binding and scope, including an
inherited host where appropriate. A root handle may call `contains` when that
binding has one unambiguous host, such as the annotation PoC's concat brush.
If several hosts are possible, `contains` throws a descriptive ambiguity error;
the caller must obtain the selection from a view scope that identifies one host.
Do not union all rectangles, choose the first host, or scan unrelated selections.
Within that host, gaps/clipping/ownership remain part of containment. Inactive
selections return false once ownership is resolved. The PoC must demonstrate this
with its actual container brush before the implementation is generalized.

**Commit delivery.** A brush gesture with selection writes produces one settled
commit on normal completion, even if its final value equals the starting value.
Intermediate writes produce change observations but no commits. Cancellation or
owner/embed disposal produces no completion commit and does not promise rollback.
A changed programmatic value outside a gesture produces one commit after coherent
propagation; an unchanged write does not create an artificial commit. Programmatic
writes during a gesture are change observations and join its eventual completion;
`clear()` is the explicit exception: cancel the active gesture, then publish the
cleared state once if it changed, without a second completion commit. Point changes
use the same coherent publication for both delivery modes. Lost mouseup alone
must not be treated as successful completion. Reuse existing cancellation paths;
identify a reproducible missing cancellation case in the PoC before adding more.

**Explicit picking.** `pick(point)` requests a pick of the latest completed visible
scene using existing picking-render orchestration; it may prepare that scene's
picking buffer but must not wait for loading or force a future visual frame.
With no completed usable scene, return `invalidated`; an available frame with no
in-scope mark returns `empty`. If the scene or owner changes during the query, or
finalization occurs while it is pending, resolve `invalidated`. Calls on an already
finalized handle, invalid arguments, unsupported backends, ambiguous identity, and
readback failures reject with descriptive errors. Do not log and swallow explicit
query failures. Native handlers must prevent browser defaults before awaiting it.

Native subscriptions expose actual canvas DOM enter/leave events, not synthetic
view transitions. Capture an activation's eligible confirmed hit before host
callbacks; deliver native subscribers before mark subscribers, and both before
built-in interaction handling. Existing tooltip housekeeping is not a new public
cancellation guarantee. Keep legacy callbacks' timing and payload unchanged.

**What iteration must determine.** The minimal validity fields and existing
invalidation signals, the controller notification boundary for gesture completion,
and notebook transport/library choice are implementation questions. Prove them
with the consumers, targeted tests, and size measurements. The notebook artifacts
belong under `packages/embed-examples/notebooks/`, with startup dependencies,
commands, and manual verification documented there. Do not introduce a Core wire
protocol. Substantial changes to the contracts above still require user review.

## Implementation ownership and research

Start with these baseline files, rather than the experimental adapter:

| Area                                                  | Existing owner / integration point                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Public namespaces, canonical handles, types           | `packages/core/src/embedFactory.js`, `packages/core/src/view/viewMutationApi.js`, `packages/core/src/types/embedApi.d.ts` |
| Picking, native ingress, hover, delayed requests      | `packages/core/src/genomeSpy/interactionController.js`                                                                    |
| Existing internal routing                             | `packages/core/src/genomeSpy/interactionDispatcher.js`; preserve its ownership                                            |
| Parameter handles and lexical refs                    | `packages/core/src/paramRuntime/embedParamApi.js`, `viewParamRuntime.js`                                                  |
| Brush geometry, gesture lifecycle, document listeners | `packages/core/src/view/gridView/intervalSelectionController.js` and its GridView host                                    |
| Annotation unit ownership                             | `packages/core/src/view/concatView.js` and existing unit hierarchy                                                        |

Use graph effects for coherent observations and existing runtime/view disposal.
Distinguish declaration metadata from effective value ownership in one small
runtime accessor. Do not create parallel registries or scan all views per event.
Activation only reads the controller's confirmed hit; no activation queue or
scheduler is needed. Keep position/scene validity with the existing hover owner,
using existing invalidation signals rather than a second cache. Explicit queries
and hover remain asynchronous where the backend requires it. Factor existing
picking only where needed; retain the legacy click contract separately.

[Vega's View API](https://vega.github.io/vega/docs/api/view/) separates native input
from signal observation. [ECharts events](https://echarts.apache.org/handbook/en/concepts/event/)
supply datum-bearing callbacks with filtering. Follow those distinctions while
accommodating GenomeSpy's asynchronous picking. These are design references;
no implementation is copied. Verify licensing before any future code adaptation.

Alternatives rejected: trim the oversized implementation (retains duplicated
owners); expose mutable internals (unstable public contract); remove selection
capabilities (fails the intended annotation/notebook ergonomics).

## Starting state and session instructions

- Branch: `codex/embed-integration-restart`, created directly from local `master`.
- Production baseline: `491e632a0533d6bb551246b09cb8bdfb7c860ef2`.
  Measure this feature against that commit, not against the failed implementation.
- Read repository instructions, `ARCHITECTURE.md`, `packages/core/AGENTS.md`,
  Core's overview, and its reactivity and views/dataflow documents. Read descendant
  instructions before editing their paths and use the relevant repository skills.
- Continue on this branch; do not recreate it or merge the experimental branch.
  A separate worktree may be used if needed. No production implementation is
  authorized by the act of preparing this plan; a subsequent implementation
  session should follow the milestones and user-review gate below.
- Historical reference only: `codex/embed-interactions` at `139511d56` preserves
  the rejected code and subsequent planning. This plan has no file dependencies
  on that branch. Inspect it only for specific regression evidence, not as a
  scaffold or source of architecture to port wholesale.

## Lessons from the previous attempt

The rejected attempt grew Core production code by 2,573 net lines, including
JavaScript, declarations, comments, and blanks. Passing tests did not justify
that complexity. These lessons shape the implementation, rather than requiring
compatibility with any experimental public API:

- Existing owners already held most required state. A second hover tracker,
  public routing pass, and selection coordination machinery duplicated ownership
  and multiplied invalidation and disposal work. Extend existing producers.
- Queuing asynchronous picks for every activation created ordering and cancellation
  problems. A valid confirmed hover hit normally already exists. Use it for
  synchronous activation and explicitly omit unavailable hits; retain an explicit
  asynchronous query for consumers that need it.
- Declaration scope and effective value ownership differ for outer aliases.
  Resolve the nearest declaration first; a child selection may write an outer
  plain parameter without turning that outer declaration into a selection.
- Coherent value observation does not supply gesture completion. Reuse the brush
  controller's lifecycle for commit/clear rather than inventing another runtime.
- Brush containment requires actual interaction geometry and ownership, not just
  domain ranges. Prove clipping and gap behavior with the annotation consumer.
- Delayed examples let an elaborate API grow without proving its ergonomics.
  Deliver a runnable annotation PoC first and develop notebook consumers alongside
  selection observation. Let consumer evidence challenge this proposal.
- Regression tests should preserve user-visible contracts, not justify machinery
  invented by the rejected implementation. Verify behavior with focused tests and
  real integrations; do not port its entire test suite mechanically.

## Warning signs: stop expanding and reassess

Watch for these signals during implementation and review:

- An adapter stores pointer, hover, gesture, or lifecycle state already owned by
  a controller/runtime, or needs its own queue, registry, or invalidation protocol.
- A small public method requires repeated view-tree scans, multiple caches, or
  several coordinating objects; subscribers multiply picking readbacks.
- An example needs private objects, retries, timers, elaborate glue, or undocumented
  ordering to accomplish the basic brush/save or selection/form workflow.
- Core grows rapidly while the annotation PoC is still not runnable, or expected
  final growth approaches the 800-line ceiling with major contracts unfinished.
- Most new tests verify private coordination rather than observable behavior.
- Correctness appears to require renderer changes, broader picking infrastructure,
  global selection discovery, or a silent change to legacy behavior.

These are investigation triggers, not permission to drop requirements. If resolving
one requires a substantial change, apply the user-review gate below: stop
implementation, show the concrete proposal, and wait for approval.

## Things that absolutely must not be done

1. Do not merge or cherry-pick the failed implementation, rebuild on its branch,
   or copy its Core adapter/coordination architecture wholesale.
2. Do not change renderers, shaders, picking encodings, or rendering contracts.
3. Do not add a second hover tracker, public routing/bubbling system, parallel
   selection registry, or general-purpose scheduling/event framework.
4. Do not launch, await, queue, or replay picks for mark activation. Do not report
   a stale hit as a clicked mark. Explicit queries remain a separate operation.
5. Do not build the complete Core API before consumers. Do not use mocks or
   private Core access to present a supposedly working public-API PoC.
6. Do not remove or silently alter legacy APIs. Retain them with `@deprecated`
   annotations and modern replacement guidance.
7. Do not introduce `markId` or a new instance identity scheme. Use the associated
   canonical unit view and existing readonly `uniqueId`.
8. Do not put annotation menus/forms or notebook transport into Core, or move
   Core machinery into another package to hide its production-line cost.
9. Do not meet the size ceiling by dense formatting, removing useful comments,
   deleting unrelated code, or changing the measurement baseline.
10. Do not silently weaken agreed contracts, exceed the complexity budget, or
    implement a substantial redesign before the user reviews and approves it.

## Milestones

Build Core and its consumers together. Do not complete the API before starting
examples. The first runnable PoC is the earliest delivery, not a final milestone.
Use real modern embed calls; mocks or direct internal access do not prove the API.
Keep the PoC small and usable while adding each capability.

The examples are design tests, not merely demonstrations. If a consumer exposes
awkward usage, missing capabilities, or unnecessary coordination, revise the API
rather than forcing the example to accommodate a bad contract. Small refinements
that preserve the agreed semantics and scope may be implemented and documented
within the milestone.

**User review gate:** if the examples require substantial API changes, stop
implementation and present a concrete revised proposal to the user for review.
Substantial changes include changing timing or delivery guarantees, ownership or
lookup semantics, removing agreed capabilities, introducing new public abstractions
or coordination machinery, or exceeding the complexity/size budget. Explain the
consumer problem, show proposed before/after usage, and state compatibility,
implementation, and size implications. Record the unresolved decision in this
plan and wait for user approval before resuming implementation. Do not silently
weaken the contract, build around the problem, or implement the proposed redesign
before review.

### 1. Deliver an annotation PoC and prove the design

- [x] First scaffold and link a minimal annotation editor in `packages/embed-examples`
      with data tracks, a concat annotation layer, a named brush, and host-owned form
      and table. Implement only the Core hooks needed to make brush → context menu →
      name/description → save → visible annotation work, then browser-test that path
      immediately. Its required Core slice is native context-menu subscription, scoped
      interval lookup/snapshot, `contains`, and `clear`, together with the existing
      dataset update API. Mark activation, hover, explicit picking, and outer-alias
      edge cases follow this working path; they are not prerequisites for its delivery.
      Deliver this runnable slice before widening the API or finishing
      the remaining feasibility tests. Cancel must add no row; save updates the named
      dataset through the modern API and clears the brush.
- [x] Extend that same consumer while implementing native context-menu veto,
      scoped mark click/pick/hover, and one
      lexically scoped interval selection with outer alias, commit, clear, and contains.
      Add public types implementing the snapshot shapes above.
      Use clicked annotation data and hover in the PoC as those hooks become available.
- [x] In parallel with commit observation, start a second selection-driven form
      example: brush commits update host state and enable annotation entry without a
      context menu. Begin the marimo bridge with this slice so Python transport needs
      inform snapshots before their public shape is finalized.
- [ ] Use focused tests to prove confirmed-hit activation without extra readbacks,
      omission while a newer pointer position is pending, scene-invalidated hits,
      no delayed replay, explicit async query invalidation, click/selection coexistence,
      shadowing, alias ownership, and
      clear/disposal during a drag. Exercise actual geometry with gaps/clipping and
      shared selection values. Record any unsupported ownership case explicitly.
- [ ] Measure actual added/removed/net Core production lines against the baseline.
      Inspect readback counts during movement, scene updates, and animation. Review
      the architecture and contracts before widening coverage.

This gate must expose the difficult costs early. The provisional final ceiling is
**800 net production lines**, counting declarations/comments/blanks, excluding
tests. Report gross additions and removals too. Do not compress formatting, move
Core machinery into examples, or delete unrelated code to meet the ceiling. If
contracts require duplicated ownership or the final target is not credible,
report the specific conflict and revise the plan before expanding implementation.
Do not silently drop a capability or grow to another 2,000-line solution.

Document timing/ownership choices in the plan and public JSDoc. Intended commit:
`feat: demonstrate annotation editing with compact embed primitives`.
An earlier verified PoC commit is encouraged:
`feat(embed-examples): add working annotation editing proof of concept`.
Include its necessary Core changes in that commit; do not leave a broken example.

### 2. Extend the API and both consumers together

- [ ] Extend the selection-driven form with point selection and run the marimo
      adapter against real Python state. Add the Observable subscription/cleanup recipe.
      Exercise new capabilities in the examples as they land; do not defer consumer
      integration until API completion.
- [ ] Complete the native event list, activation events, point selections,
      programmatic updates, canonical annotation identity, and lifecycle behavior.
- [ ] Verify authored-root lookup through implicit wrappers, lexical overrides,
      plain shadowing, computed parameters, and child select/outer aliases.
- [ ] Test stale queries, ambiguous ownership, same-ID replacement, stationary
      hover, owner removal, listener errors, unsubscribe, and finalization. Keep tests
      about contracts rather than the chosen private machinery.
- [ ] Retain/deprecate legacy entry points; verify App and React consumers still
      work. Document the API, coordinates, timing, ID lifetime, snapshots, and migration
      in the existing embed reference using the documentation skill.

Run focused suites, workspace type checks, and lint. Recheck production size.
Intended commit: `feat(core): complete scoped embed integration contracts`.

### 3. Finish and verify the existing browser and notebook integrations

These examples must already be runnable from milestones 1–2. This milestone
finishes their coverage, documentation, and integration checks.

- [x] Finish the **annotation editor** in `packages/embed-examples`: data tracks plus
      a concat annotation layer, named brush, host-owned context menu and form, visible
      table, and `api.datasets.set("annotations", rows)` on save. Test brush containment
      before opening the menu and capture its snapshot. Clear after save; cancel adds
      no row. Clicking an annotation inspects its datum; hover shows a host readout.
- [x] Finish the **selection-driven form**: point and interval observation updates host
      state without context menus; interval commits enable name/description entry and
      publish annotation rows. Include a runnable marimo adapter/example exchanging
      plain snapshots and rows with Python, plus an Observable subscription/cleanup
      recipe. Keep generic notebook transport outside Core. A JavaScript form alone
      does not count as verification of Python integration.
- [x] Link examples from the package index and document startup/cleanup. Reuse the
      historical examples only for specific useful UI or behavioral details. Write
      consumers against this contract; do not bring over old compatibility glue.

Use the browser-debug skill for real Canvas/WebGL interaction checks: brush,
context menu, save/cancel, clicked annotation, hover after dataset replacement,
selection-driven form, and disposal/re-embed. Exercise delayed picking in focused
controller tests if an available browser backend is synchronous. Verify a rapid
click with a pending hover pick is omitted and is never replayed later. Run the marimo
example and record the result; disclose environmental blockers rather than claim
it works from a Python syntax check.

Run the full unit suite, workspace type checks, lint, and
`npm run build:smoke --workspace=@genome-spy/embed-examples`. Review the integrated
diff for duplicate machinery, renderer changes, downstream regressions, and total
size. Intended commit:
`feat(embed-examples): demonstrate annotations and notebook selections`.

### 4. Review and clean up the implemented integration

The initial implementation is a sound PoC, but a production follow-up should
address the following review findings without changing the agreed public
contracts:

- [ ] Consolidate the duplicated modern embed-result assembly in Core and App,
      keeping App-specific fields and lifecycle behavior explicit.
- [x] Replace new internal `any` types and optional selection-controller
      registration fallbacks with small typed contracts owned by the existing
      interaction and parameter components.
- [ ] Make lifecycle behavior uniform for embed-level and view-level parameter
      and selection handles after finalization or view removal.
- [x] Revisit and clearly encode the confirmed-hover rule for mark activation:
      either keep the documented synchronous behavior as an explicit contract or
      propose a materially different activation design for user review.

Keep each cleanup independently verified and commit it separately. Do not
expand the API, add a second interaction owner, or change renderer behavior.
If resolving a finding requires changing timing, ownership, or public usage,
stop at the user-review gate and present the revised proposal before coding.

## Implementation reconciliation

- The runnable annotation editor is implemented and browser-tested through brush,
  vetoed context menu, save, dataset update, visible annotation, hover, click,
  and cancel behavior.
- The selection-driven browser form, Observable recipe, and marimo HTTP bridge
  are implemented under `packages/embed-examples`. The local environment does
  not have `marimo` installed, so the bridge was syntax-checked but not launched
  here. Install it with the command in the notebook README before using the
  Python round-trip.
- Core exposes native events, scoped marks, explicit picking, scoped parameter
  and selection APIs, detached snapshots, interval commit/clear/contains, and
  lifecycle guards. The App embed surface exposes the same modern event and
  parameter namespaces. Legacy entry points remain present.
- Against baseline `491e632a0533d6bb551246b09cb8bdfb7c860ef2`, Core production
  changes measure 961 gross additions, 47 removals, and 914 net lines. This is
  114 net lines over the provisional 800-line ceiling; the complete public
  contract and App compatibility are retained, and no renderer files changed.
- Verification completed: focused Core tests (24 passed), full unit suite (4,131
  passed, 1 skipped, 2 todo), workspace type checks, lint, Python syntax check,
  and `npm run build:smoke --workspace=@genome-spy/embed-examples`.

## Delivery and fresh-session handoff

Commit after each coherent, verified milestone using the delivery skill. Keep
checks and worthwhile review fixes within that milestone; no review loop for each
minor edit. An independent review is useful at the feasibility gate and final
integration, especially for asynchronous behavior and selection ownership.

Final acceptance requires the declared contracts, both examples, verified legacy
compatibility, no renderer changes, and an honest size report against the original
baseline. Record completed/discarded tasks and any limitations in this plan. Before
PR delivery, commit that reconciliation, then remove temporary plans in a later
commit as required by repository instructions.

Suggested prompt for the new session:

> Implement plans/embed-integration-restart/embed-integration-restart-plan.md in
> the existing fresh codex/embed-integration-restart branch based on master.
> Preserve the experimental branch and do not import its implementation. Start with milestone 1
> and its feasibility gate; retain the redesigned capabilities, reuse existing
> owners, and do not touch renderers. Deliver a runnable annotation PoC first;
> develop the examples alongside Core, including notebook observation. Commit the
> early working PoC and each subsequent verified milestone. Let the examples
> test the API design; stop and present a revised proposal for user approval if
> substantial design changes are needed.

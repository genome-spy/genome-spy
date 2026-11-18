# View visibility handles and startup restoration

This is the second milestone of
[#740](https://github.com/genome-spy/genome-spy/issues/740). Build on
[#741](https://github.com/genome-spy/genome-spy/pull/741), which added
expression ownership and a shared visibility refresh. An embed host can hide a
track, keep its live state, save its explicit choice, and reopen the
visualization with that choice applied before the first layout or load.

The optional track chooser and visibility subscriptions belong to follow-up
work. This milestone uses the existing `visible` grammar and bookmark format.

## Public contract and ownership

Add `readonly visibility: ViewVisibilityApi` to `ViewHandle`. Cache it with the
existing handle in
[viewMutationApi.js](../../packages/core/src/view/viewMutationApi.js). The
namespace exposes three live getters and one asynchronous write.

- `locallyVisible: boolean` reads the expression, manual choice, or App radio
  result before ancestor visibility or container collapse. Factor this local
  read from `View.isConfiguredVisible()` in
  [view.js](../../packages/core/src/view/view.js), where subclasses can add
  layout rules.
- `staticDefault: boolean | undefined` returns the authored boolean, defaults to
  `true` for an omitted `visible`, and returns `undefined` for an expression.
- `override: boolean | undefined` returns the explicit choice, including a
  boolean equal to the authored default. A default App radio loser has no
  explicit choice.
- `setOverride(value: boolean | undefined): Promise<void>` stores the boolean or
  clears the choice. It rejects writes to expression-controlled views. The
  promise covers required first-show initialization and a request for layout
  reflow. Use `views.subscribeToLayout()` for geometry, `awaitVisibleLazyData()`
  for viewport-dependent loads, and `dataLoading` for source outcomes.

Check liveness on every read and inside the queued write. Preserve the same
handle and namespace through hide, show, and move. Removal and finalization
expire the original namespace even when a later view uses the same name.

Core owns the local visibility decision and its effects on layout, dataflow,
scales, and picking. Store the bare Core choice on the live view, so an unnamed
child is independently toggleable through `children()`. An App view with a
unique, addressable selector uses Redux for its choice. Other App handles use
the live view to store the choice. App keeps menu eligibility and radio policy
in `configurableVisibilityUtils.js` and `viewSettingsUtils.js`.

TanStack Table also exposes per-item visibility and gives controlled state
precedence over initial state. GenomeSpy needs to retain the authored default
and the explicit choice separately because defaults can be `false` and
expressions can own visibility. The selector-wide snapshot and setter in
[#700](https://github.com/genome-spy/genome-spy/pull/700) and its App
integration in [#701](https://github.com/genome-spy/genome-spy/pull/701) were
prototypes. A live handle covers unnamed views and expires with its view. Scoped
selectors serve persistence.
[TanStack Table column visibility](https://tanstack.com/table/v8/docs/guide/column-visibility)

## Milestone 1. Core handles and one-shot startup choices

Use `enqueue()` in `viewMutationApi.js` to order writes with insert, remove, and
move. Await first-show work through the shared refresh in
[viewDataInit.js](../../packages/core/src/genomeSpy/viewDataInit.js). Send
layout requests through `context.requestLayoutReflow`, which
`views.transaction()` defers. Keep the choice and existing collectors,
parameters, and selections attached to the same view. Join first-show work for
affected views and their required data producers, including descendants and App
radio peers a choice can reveal. The flow initialization state can advance
before fonts and data finish loading. Preserve #741's immediate hide behavior
for expressions and external App updates during loads. Unrelated pending loads
must leave a hide-only write and its reflow free to complete. First-show eager
initialization finishes independently of viewport-dependent lazy loads.

Add `ViewVisibilityOverride = ViewSelector & { visible: boolean }` and
`EmbedOptions.initialVisibilityOverrides?: readonly ViewVisibilityOverride[]` in
[embedApi.d.ts](../../packages/core/src/types/embedApi.d.ts). Resolve the list
once after the authored/import hierarchy is constructed in
[GenomeSpyBase](../../packages/core/src/genomeSpyBase.js), before guide setup,
the startup data scan, and layout. Reuse
[viewSelectors.js](../../packages/core/src/view/viewSelectors.js) with a
tolerant startup lookup for missing and ambiguous views, including duplicate
import scopes. Keep public live selector errors. Skip expression-owned matches
and use the last eligible input per resolved view, including when a named import
root can be reached by two selectors. App will derive the Redux key from the
resolved view's canonical selector. Share the startup step with the headless
test bootstrap, and apply the list only to this initial tree.

Extend `viewMutationApi.test.js` for unnamed children, hidden parents and
collapsed containers, explicit values equal to defaults, clear, expression
rejection, and expired getters and writes. Verify an awaited write inside a
transaction with structural work and a single deferred reflow. Gate an eager
source to prove the write waits for publication without restarting a refresh
already loading that branch. In `genomeSpyCanvasLive.test.js`, round-trip
Coverage's explicit override between embeds, check the first layout and
independent source load, and remove and reinsert the same selector. Include
distinct import instances, a named import root reached through both selector
forms, and skipped entries. Document the contract and save/restore example in
`docs/api/views.md` and regenerate the API reference.

Tentative commit `feat(core): expose visibility on view handles`.

## Milestone 2. App Redux and bookmark precedence

Use an internal visibility delegate with App's existing
`createViewMutationApi()` call. The App predicate in
[app.js](../../packages/app/src/app.js) reads the radio-resolved visibility, and
the handle reads the raw Redux choice for `override`. Use the same live selector
identity for effective reads, raw reads, and writes. An ambiguous selector gives
neither matching view a shared Redux choice. Compute ownership on hierarchy
changes to keep selector traversal out of the visibility predicate. Reuse one
App operation for handle and View settings writes. Selecting a radio member with
`true` updates it and its scoped peers in one dispatch, including when the
earlier member and target both default to visible. `false` is an explicit
choice. Clearing drops the target's scoped choice and any applicable legacy
fallback. The ordinary checkbox still clears when clicked back to its default.

Run handle writes in Core's ordered queue. Use the App cohort mutation wrapper
for structural work and the outer transaction as today. Share a refresh request
between the Redux subscriber and the awaiting handle. Test a radio clear that
reveals a peer with a pending first load.

Consume the App startup option once through the same pre-guide hierarchy
boundary, with Redux as its sole destination. For a valid standalone URL
bookmark, apply its complete visibility settings there, including an empty set
when `viewSettings` is absent. An invalid or missing bookmark leaves the host
choices eligible. Preserve legacy bookmark name handling across distinct import
instances. Keep the later URL restore responsible for provenance, scale domains,
and plots. Use consistent bookmark normalization, then reapply the full choices
after intent replay, which can temporarily reveal tracks. Later bookmarks
replace the current manual choices via
[restoreBookmark](../../packages/app/src/bookmark/bookmark.js), clearing any
view-local App overrides too so omitted tracks resume their defaults. The
configured remote fallback bookmark continues through this later restore path.

Reconcile choice ownership by view identity on structural edits that change
selector uniqueness. A surviving view keeps its explicit choice when it moves
between Redux and view-local storage. Discard the scoped choice of a view that
left the hierarchy, including a track outside SampleView and a removal whose
subsequent guide or data refresh failed. Preserve surviving views' choices when
legacy names overlap. Verify a duplicate selector becoming unique and a
same-name insertion starting from its own default.

Test the public App handle and toolbar against the same Redux choices in
`appLifecycle.test.js`. Give its headless startup the live root at the same
pre-guide boundary as production. Cover radio selection from the second
default-visible member, bookmark capture and replacement, host-only startup, and
URL startup both with conflicting choices and with omitted visibility settings.
Document the App precedence and include one feature changeset for Core and App.

Tentative commit `feat(app): restore and share embed visibility choices`.

## Integration and review gates

- Check whether the existing source promises can cover the awaited first-show
  boundary. If work can still be pending before a source promise exists, track
  that completion at the existing initialization boundary in `viewDataInit.js`.
- Reopen Coverage hidden beside expression-controlled Detail. The first layout
  has no Coverage row, and its independent source loads once on first show.
  Brush Coverage, hide it, and show it again. Check retained selection and
  handle identity, absent hidden bounds and picks after reflow, and
  corresponding SVG placement. Detail follows its parameter even with a stale
  bookmark entry.
- Exercise the existing
  [interval-selection concat](../../examples/core/selection/interval_concat.json)
  with handle toggles and the
  [zoom-driven visibility example](../../examples/core/layout/zoom-driven-visibility.json)
  across its domain threshold. Review shared scale participation and use the
  existing live Canvas and App test paths for the lifecycle. The same Core
  layout placements feed the other renderers and SVG export.
- Review the Core API, early selector matching, and refresh timing before App
  wiring. Review final App startup and live restoration together. Run the
  focused Core and App suites, workspace typing, lint, API-doc generation, and
  release checks. Retire the plan after recording completed work on the branch.

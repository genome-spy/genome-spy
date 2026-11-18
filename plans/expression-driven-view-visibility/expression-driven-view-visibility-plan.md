# Expression-driven view visibility

This branch covers the first PR in issue #740. A track can declare
`"visible": { "expr": "mode === 'detail'" }`. Changing `mode` removes or
restores the track's row, including its axes and spacing. The track keeps its
live handle, initialized data, and selections across the transition.
[Issue and acceptance case](https://github.com/genome-spy/genome-spy/issues/740)

## Authoring contract

| Authored `visible` | Configured visibility before ancestor visibility is applied            |
| ------------------ | ---------------------------------------------------------------------- |
| Omitted            | Defaults to true. A manual choice can override it.                     |
| Boolean            | Defaults to that value. Clearing a manual choice restores the default. |
| `ExprRef`          | The expression owns the value. Only a boolean result is valid.         |

Apply this contract to ordinary views and import sites. An import-site value
takes precedence over the imported root's declaration. Evaluate the winning
expression in the resulting view's lexical parameter scope, including
import-site parameter overrides. A hidden layout ancestor hides the whole
subtree. Descendants keep their choices and continue observing their parameters,
so revealing the ancestor uses each child's current value.

This extends GenomeSpy's existing scoped `ExprRef` grammar. Vega signals offer a
precedent for driving properties from the same parameter that host code can
update. GenomeSpy's layout and first-show data initialization give `visible` its
own meaning. An opacity expression still occupies a row, and an arbitrary
visibility expression has no unique parameter that a checkbox could write.
[Vega signals](https://vega.github.io/vega/docs/signals/)

## Milestone 1. Resolve visibility before layout and load

- Extend both `visible` declarations in `packages/core/src/spec/view.d.ts`. Keep
  import precedence in `view/viewFactory.js`. In `view/view.js`, expose the
  evaluated authored boolean through `isVisibleInSpec()` and distinguish
  expression ownership from its current value. For expression-owned views,
  `isConfiguredVisible()` must use that boolean even when App has a saved
  choice. For manual views, preserve the existing host predicate. Keep implicit
  concat collapse and surround-center visibility in their respective containers.
- Make the authored boolean readable after parameter registration and before the
  first visibility query, including for hidden views. At launch this must
  precede guide preparation and the first canvas sizing. During insertion,
  `UnitView` registers scale members in its constructor. An existing shared
  scale can query the new member while rebinding its domain inputs, before
  `ViewFactory.createOrImportView()` receives the new instance. Bind on demand
  at that early read and ensure every authored expression is bound during
  protected view preparation. This also lets App subclasses register their own
  parameters after `super()`. A validation failure in the base constructor would
  escape the factory’s disposal handler.
- Accept expressions over startup-available parameters, including selections and
  derived values such as `selectionActive(brush)`. The expression has no current
  datum. Reject datum references, scale helpers, and reads of layout-produced
  dimensions, even through a derived parameter. Extend `analyzeExpression` and
  follow each declaration in its **own** lexical scope before materializing
  pending refs. This distinguishes an explicitly authored `width` from an
  automatic dimension and catches a derived `zoomLevel` alias even through a
  debounced parameter. Report the winning `visible.expr` source location for an
  unsupported dependency or a non-boolean initial or later value.
- Use a view-owned computed for the boolean and an effect for settled changes. A
  transaction that switches multiple tracks should schedule one Core refresh.
  During construction and initial data setup, record changes and reconcile
  current visibility before the first completed layout. Disposal releases the
  binding. An equal boolean result needs no work.
- Bring the refresh currently split between
  `GenomeSpyBase.initializeVisibleViewData()` and App's Redux subscriber into
  Core. Invalidate size and stale bounds, hover and picking state, and reflow
  using the current visibility. A hide must take effect even while a first-show
  load is pending. Reuse `genomeSpy/viewDataInit.js` for newly visible branches,
  completed collector replay, and hidden producers required by visible
  consumers. When loading completes, lay out the current tree only if the engine
  is still live. Route async errors to `context.reportError`. Retain initialized
  data and selection state.
- Wire that same first-show work into `createHeadlessEngine()`, which owns its
  own data initialization, and give its default predicate the browser’s authored
  visibility semantics. Keep `createHeadlessViewHierarchy()` usable for
  inspecting a hierarchy before data loading. In `containerMutationHelper.js`,
  account for layout ancestors above the insertion container when deciding
  whether an independent source may start.

**Verification.** Start with a `vconcat` containing Coverage and a Detail track
with its own counted source. With `mode` initially set to overview, the first
layout has no Detail row and its source has zero loads. Show Detail via the
public parameter API, brush an interval, hide it, and show it again. Check one
load, the same handle, and the same interval. Extend
`genomeSpy/viewDataInit.test.js` for source behavior and use
`genomeSpyCanvasLive.test.js` for bounds, picking and SVG export. Test a hidden
layer over a visible sibling as well. `LayerView` currently visits all children
and `UnitView.arrange()` records bounds before its visibility check. A hidden
layer must have neither bounds nor an interaction target after reflow. Drive the
headless first-show test through a parameter write and observe source completion
through the existing data lifecycle. `whenPropagated()` settles the parameter
graph only. Also re-hide Detail during its first load and verify that completion
cannot restore the row. With two template instances, check that an import-site
expression resolves a shadowed parameter in the intended instance. Inserting a
view with an indirect scale dependency into a live shared scale must fail at the
expression and leave the original instance responsive. Exercise a valid
parameter changing to a non-boolean after launch as well.

Document the grammar and import precedence in the specification JSDoc and
`docs/grammar/import.md`, regenerate the schema, and add a parameter-bound
example and a Core minor changeset. Tentative commit
`feat(core): support expression-driven view visibility`.

## Milestone 2. Respect expression ownership throughout App

- Use the Core ownership check in `configurableVisibilityUtils.js`,
  `viewSettingsUtils.js`, and the View settings menu. Exclude expression views
  from checkboxes and scoped radio membership even if explicitly marked
  configurable. A menu row retained for parameter controls needs no visibility
  input. Keep eligible children discoverable when the controlling parameter
  changes with the menu open. Apply the same eligibility to configurable-name
  warnings in `viewSelectorConstraints.js`. Boolean views keep their existing
  menu defaults and radio rules.
- App continues to own manual choices in Redux. At startup and live bookmark
  restore, ignore expression-owned targets in both scoped entries and legacy
  name maps. Standalone App reads URL settings **before** the live hierarchy
  exists. Keep that early read for manual tracks. Once the hierarchy exists,
  discard entries for expression-owned targets from the restored Redux choices
  so they cannot affect Restore defaults or a later insertion. Live bookmark
  restore replays parameter actions before applying view settings. Preserve that
  order. A saved `mode` action may change Detail through its expression.
- For bookmarks and shareable URLs, `buildViewSettingsPayload()` currently
  serializes the result of `resolveRadioVisibilityConflicts()`. Serialize actual
  Redux choices for eligible views. Derived radio losers can be unchecked
  without a saved entry. Preserve per-member choices explicitly written by a
  radio click and older boolean entries for eligible views. When a legacy name
  matches several scopes, filter each match by ownership.
- Route Redux changes into the Core refresh. Use its settled visibility
  transition to update the open menu and wake an initialized
  `sampleView/mergeFacets.js` summary after regrouping while hidden. A parameter
  write alone may produce that transition.
- A direct manual write in `agentApi/index.js` checks its **target**. An
  eligible child can record a choice under a hidden parent. A sample attribute
  request in `SampleView` actually needs the data, so preflight the whole layout
  path. If an expression currently hides a required view, identify it before any
  override, zoom, or readiness wait. Skip expression-owned ancestors that are
  already visible when revealing the manual views on that path.

**Verification.** Restore an old bookmark that hides ordinary Coverage and tries
to show Detail while its expression is false. In the standalone URL startup
case, assert zero Coverage loads and no Coverage row in the first layout. In the
live restore case, include a `mode` action that contradicts the stale Detail
choice. Toggle `mode` again and save. Only Coverage has a manual entry. Use an
imported group with an expression member and two eligible siblings to
distinguish a default loser from an explicit radio click. Verify that setting a
child's choice under a hidden parent succeeds, a blocked sample-attribute reveal
has no side effects, and showing a stale summary publishes the current
aggregates.

Update “Toggleable view visibility” in `docs/sample-collections/app-features.md`
with the ownership rule and the effect on older bookmarks. Include App in the
feature changeset. Tentative commit
`feat(app): respect expression-owned visibility in view settings`.

## Integration and dependency boundaries

- Exercise both milestones in the ordinary Coverage/Detail composition. In App,
  use the Coverage checkbox and bookmark. In bare Core, use the existing scoped
  parameter API for Detail. Check that hidden tracks reclaim space, produce no
  marks or hits, and disappear from SVG export. Verify the same layout decision
  on a retained GPU backend. The retained selection in the earlier Core demo is
  the reference interaction.
  [Demo in PR #700](https://github.com/genome-spy/genome-spy/pull/700#issuecomment-6661860699)
- Verify an insertion under a hidden ancestor and removal of an expression view
  with its controlling parameter still live. Also check a shared locus scale
  after first show and after a later hide/show. Scale input binding can change
  when a contributor first initializes. Preserve established zoom and domain
  behavior. Redefining shared-domain membership is separate work.
- An outer parameter can acquire a transform producer while descendants are
  constructed (`ViewParamRuntime.resolveOutput()`). Check the finalized
  ownership before initial loading or committing an insertion. An independent
  producer already required by the dataflow can publish normally and change a
  visibility expression. Defer the circular case where revealing a track is
  itself necessary to start its controlling producer. Report that dependency at
  the expression. Per-facet values such as `sampleCount` arrive during data
  processing and cannot supply one initial value for the whole view.

## Follow-up PRs in #740

1. **Live handles and one-shot restoration.** Add `isConfiguredVisible()`,
   `canSetVisibilityOverride()`, `getVisibilityOverride()`, and async
   `setVisibilityOverride(boolean | undefined)` to `ViewHandle`. A checkbox
   reads configured visibility before ancestor filtering. For authored
   `visible: false`, the two value getters initially return `false` and
   `undefined`. Setting an explicit choice records it even if it equals the
   default. Passing `undefined` clears it. Expression handles report that
   overrides are unavailable and reject writes. Resolve the setter after
   first-show eager loading and completed layout using the existing live handle
   and mutation lifecycle. Lazy viewport readiness uses its existing API.
   Removed handles follow the usual stale-handle rules. Bare Core stores choices
   on the view, including unnamed children obtained through `tracks.children()`.
   Persistence requires a unique scoped selector or host identity. Addressable
   App handles and the menu share one Redux choice. Seed that same store on
   restoration. Apply `EmbedOptions.initialVisibilityOverrides`, a readonly list
   of `ViewSelector & { visible: boolean }` entries, once to unique, eligible
   scoped matches before first layout and data loading. Skip missing, ambiguous,
   and expression-controlled targets. A later same-name insertion starts fresh.
   Verify the round trip through two real `embed()` calls. Save Coverage’s
   explicit override, add a stale Detail entry, and reopen with zero Coverage
   loads. Show, brush, hide, and show Coverage with one load and the same
   selection while Detail follows `mode`. Verify that removing and reinserting
   Coverage cannot revive the startup entry in either Core or App. App currently
   clears removed visibility keys during cohort removal. Cover ordinary track
   removal in that cleanup as well. Document in `docs/api/views.md`.
2. **Optional embed chooser.** Build the proposed
   `trackVisibilityButton(tracks)` on the public child handles in
   `@genome-spy/core/controls`. An ordinary `vconcat` can then offer checkboxes
   for eligible tracks without a parameter on each child. Verify that hidden
   children remain discoverable and that the default and minimal Core bundles
   are independent of the chooser.

The earlier Core plan allowed manual overrides on expressions. Issue #740
settles that precedence in favor of the expression. PRs #700 and #701
demonstrate retained hide/show and reuse of Redux. Their selector-keyed Core
store, global reset, and Core radio policy differ from the live-handle contract
above.
[Earlier plan](https://github.com/genome-spy/genome-spy/blob/bb5fc7dff145f7320448c70d710e0b7da1ee3d2b/plans/core-view-visibility/core-view-visibility-plan.md)
· [Core prototype](https://github.com/genome-spy/genome-spy/pull/700) ·
[App prototype](https://github.com/genome-spy/genome-spy/pull/701)

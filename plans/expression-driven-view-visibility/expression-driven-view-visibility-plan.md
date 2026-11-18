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
- Bind after the owning view registers its parameters and before the first
  guide, scale, size, or data-initialization read. The end of base `View`
  parameter registration is the candidate for both launch and dynamic insertion.
  Use the same authored default in `genomeSpy/headlessBootstrap.js`, whose
  current default predicate returns true for every view. Bind hidden views too.
  During hierarchy construction, allow parameter values to settle before
  scheduling layout or data work.
- Use the existing expression analysis, lexical parameter lookup, and view-owned
  computed/effect lifecycle. Validate the initial result and each update at
  `visible.expr`. A settled boolean change requests a refresh. Parameter changes
  yielding the same result need no layout work. Disposal releases the binding
  when a view is removed.
- Support parameter-driven expressions, including ordinary derived parameters.
  Visibility affects the dimensions and scale inputs it would otherwise read.
  Reject direct and transitive dependencies on scale helpers or automatic layout
  dimensions with a located error. Resolve names in scope so an authored
  parameter named `width` is distinguishable from a layout input.
- Bring the refresh currently split between
  `GenomeSpyBase.initializeVisibleViewData()` and App's Redux subscriber into
  Core. Invalidate size and stale bounds, hover and picking state, and reflow
  using the current visibility. A hide must take effect even while a first-show
  load is pending. Reuse `genomeSpy/viewDataInit.js` for newly visible branches,
  completed collector replay, and hidden producers required by visible
  consumers. On completion, lay out the current tree. Retain initialized data
  and selection state.

**Verification.** Start with a `vconcat` containing Coverage and a Detail track
with its own counted source. With `mode` initially set to overview, the first
layout has no Detail row and its source has zero loads. Show Detail via the
public parameter API, brush an interval, hide it, and show it again. Check one
load, the same handle, and the same interval. Extend
`genomeSpy/viewDataInit.test.js` for source behavior and use
`genomeSpyCanvasLive.test.js` for bounds, picking and SVG export. Test a hidden
layer over a visible sibling as well. `LayerView` currently visits all children
and `UnitView.arrange()` records bounds before its visibility check. A hidden
layer must have neither bounds nor an interaction target after reflow. Use a
scoped import to cover initial binding, shadowing, an invalid result and an
unsupported dependency with focused assertions.

Document the grammar and import precedence in the specification JSDoc and
`docs/grammar/import.md`, regenerate the schema, and add a parameter-bound
example and a Core minor changeset. Tentative commit
`feat(core): support expression-driven view visibility`.

## Milestone 2. Respect expression ownership throughout App

- Use the Core ownership check in `configurableVisibilityUtils.js`,
  `viewSettingsUtils.js`, and the View settings menu. Exclude expression views
  from checkboxes and scoped radio membership even if explicitly marked
  configurable. Preserve access to a view's parameter controls and eligible
  descendants. Boolean views keep their existing menu defaults and radio rules.
- App continues to own manual choices in Redux. At startup and live bookmark
  restore, ignore expression-owned targets in both scoped entries and legacy
  name maps. Omit those entries when saving again. Route manual changes into the
  same Core refresh as parameter changes. A parameter update alone must also
  wake an initialized `sampleView/mergeFacets.js` summary that became stale
  while hidden.
- Enforce ownership at programmatic writes, including `agentApi/index.js` and
  `SampleView`'s reveal-before-zoom path. Preflight the target and its layout
  ancestors. If an expression currently hides a required view, report which view
  blocks the operation before writing overrides, zooming, or waiting for data.
  Skip already-visible expression ancestors when revealing a manual view.

**Verification.** Restore an old bookmark that hides ordinary Coverage and tries
to show Detail while its expression is false. Verify the first App layout,
toggle Detail's parameter, and save again. Only Coverage has a manual entry.
Exercise an imported radio group with an expression member and two eligible
siblings, and hide a manual parent while its child's parameter changes. Cover a
blocked sample-attribute reveal and a summary shown after regrouping using the
existing App visibility, bookmark, and sample-view suites.

Update “Toggleable view visibility” in `docs/sample-collections/app-features.md`
with the ownership rule and the effect on older bookmarks. Include App in the
feature changeset. Tentative commit
`feat(app): respect expression-owned visibility in view settings`.

## Integration and remaining design questions

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
- Resolve one bootstrap question during milestone 1. How early can the runtime
  classify an indirect layout/scale dependency, including a lazy `zoomLevel`
  alias, without materializing its scale? Check this at initial launch and
  insertion. Reuse `analyzeExpression` and scoped parameter declarations. A
  transform output whose own initialization depends on the view becoming visible
  needs an explicit eligibility decision at that boundary.

## Follow-up PRs in #740

1. **Live handles and one-shot restoration.** Add `isConfiguredVisible()`,
   `canSetVisibilityOverride()`, `getVisibilityOverride()`, and async
   `setVisibilityOverride(boolean | undefined)` to `ViewHandle`. A checkbox
   reads configured visibility. A bookmark reads the explicit override only, so
   a boolean default, a radio decision, and a hidden ancestor cannot manufacture
   a saved choice. Expression handles reject writes. Bare Core stores choices on
   the live view, including unnamed children. Addressable App handles and the
   menu share the existing Redux choice. Apply
   `EmbedOptions.initialVisibilityOverrides` once to unique, eligible scoped
   matches before first layout and data loading. Skip missing, ambiguous, and
   expression-controlled targets. A later same-name insertion starts fresh.
   Verify a bare embed can save hidden Coverage, reopen with zero Coverage
   loads, then show, brush, hide, and show it with one load and the selection
   intact. Document in `docs/api/views.md`.
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

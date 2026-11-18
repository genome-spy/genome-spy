# Expression-driven view visibility

A track with `"visible": { "expr": "mode === 'detail'" }` should take up a row
only in detail mode. Implement this as another way to supply the boolean that
Core already uses for view visibility. This plan covers the first PR in
[#740](https://github.com/genome-spy/genome-spy/issues/740).

## Core

Implemented and verified in the Core milestone, including startup changes and
import insertion into a live shared scale.

**Resolve the local choice on the view.** Extend `visible` to
`boolean | ExprRef` on views and import sites in `spec/view.d.ts`. Keep the
import-site precedence in `viewFactory.js`. For an omitted value or boolean,
keep the existing host predicate and its authored default of `visible ?? true`.
For an expression, its boolean in the resulting view’s lexical parameter scope
is authoritative even if App has a saved override. Container collapse and
ancestor visibility continue to use `isConfiguredVisible()` and `isVisible()`.
Hiding a parent preserves each child’s choice.

**Bind only expressions, once, on first read.** In `view/view.js`, have
`isVisibleInSpec()` return the literal default directly or read a view-owned
computed. Bind the authored `ExprRef` with `createExpression()`, pass its
dependencies and a boolean-checked evaluator to `paramRuntime.computed()`, and
attach one effect to its changes. The existing runtime handles equality,
propagation, and disposal. First read is early enough even when a unit joins an
already-live shared scale during construction. A child first visited when its
parent becomes visible reads the parameters’ current values. Both cases use the
same binding code.

Support parameters available before layout, including ordinary derived and
selection parameters. At binding, use the existing expression analysis and
scoped declarations to check the inputs the expression references. Follow
derived declarations in their own scope. Report datum, scale, or automatic
layout dependencies and non-boolean results at `visible.expr`. An authored
parameter named `width` is an ordinary input. A track whose visibility requires
its own unloaded data has a circular specification. Document that limit and
leave data loading under the existing producer rules.

**Give visibility changes one route to layout.** Move the work currently split
between App’s Redux subscriber and `GenomeSpyBase.initializeVisibleViewData()`
into one Core refresh, callable from the expression effect or the App
subscriber. Batch changes, clear hidden bounds and stale picks, invalidate
sizes, and request reflow. Let `genomeSpy/viewDataInit.js` initialize any newly
visible branches. Its existing initialization states and collector replay
already handle first show and preserve loaded data. If a track is hidden during
loading, completion lays out the current live tree. A visibility change keeps
the view, its handle, and its selections.

Use the authored value during the existing startup scan. Reconcile changes
during initial loading before the first completed layout. Wire the same refresh
into the initialized headless engine. Keep raw hierarchy inspection free of data
loading. Skip hidden children during layer arrangement and hit testing so they
cannot reacquire bounds after reflow. All renderers and SVG export consume the
resulting placements.

Update the grammar JSDoc, schema, and import example. Tentative commit
`feat(core): support expression-driven view visibility`.

## App

- Keep Redux as the owner of manual choices. Use the same expression-ownership
  check in `configurableVisibilityUtils.js`, scoped radio membership, and direct
  writes. A hidden parent still permits setting a manual child’s choice. A
  sample operation that needs the child’s data must check the whole layout path
  before changing settings, zooming, or waiting for that data.
- In View settings, omit the visibility input for an expression-owned view. If
  it has parameter controls, keep its row. List eligible descendants
  independently of the expression’s current value. This makes the menu usable
  through a parameter change with its existing update behavior.
- Preserve the existing URL startup and live bookmark restore paths. Early URL
  settings are available before the hierarchy exists. Core’s local read already
  honors the expression on the first layout. At live restore and save, filter
  scoped entries and legacy name matches by ownership. Serialize explicit Redux
  choices in `buildViewSettingsPayload()`. Apply radio conflict resolution when
  reading the local state for display. A default radio loser creates no saved
  override. Restored parameter actions can still drive Detail.
- `MergeSampleFacets` can miss regrouping while a summary is hidden. Reuse its
  existing hidden-to-shown check on the `layoutComputed` broadcast so a
  parameter-only reveal republishes the current aggregates. Keep its cohort
  subscription for actual grouping changes.

Update the View settings docs and add a feature changeset covering Core and App.
Tentative commit `feat(app): respect expression-owned view visibility`.

## Verification

Use a `vconcat` with ordinary Coverage and expression-controlled Detail.

1. Restore an App bookmark that hides Coverage and contains a stale Detail
   entry. The first layout has no Coverage row and its independent source has
   zero loads. Show it, brush an interval, hide it, and show it again. Check one
   source load, the same handle, and the same interval.
2. Change `mode` through the parameter API in both App and a bare Core embed.
   Detail follows it on screen and in SVG export. Save the App bookmark again
   and check the explicit manual choices. In a scoped radio group, distinguish a
   default selection from an explicit radio click.
3. Use focused existing tests for the two easy-to-miss paths. Insert an imported
   track into a live shared scale with a shadowed parameter and verify its
   initial visibility. Hide a layer over a visible sibling and verify its bounds
   and pick target disappear after reflow. `UnitView.arrange()` currently
   records bounds before checking visibility.

In the existing App sample tests, regroup while a summary is hidden and reveal
it with a parameter write. Its aggregates should reflect the new groups.

## Follow-ups in #740

PR 2 exposes the stable `handle.visibility` object. `locallyVisible` reads the
local decision before ancestor and container rules, `staticDefault` identifies
manually toggleable views, and `override` reads the explicit choice to save.
Async `setOverride(value)` accepts a boolean or clears the choice with
`undefined`. Store bare-embed choices on live views, including unnamed children.
Addressable App handles use the same Redux choice as the menu. Apply
`initialVisibilityOverrides` once to unique eligible matches before first layout
and loading. Repeat the Coverage bookmark case across two bare embeds and verify
a later same-name insertion starts fresh.

PR 3 builds the optional `trackVisibilityButton(tracks)` in
`@genome-spy/core/controls` using only those public handles.

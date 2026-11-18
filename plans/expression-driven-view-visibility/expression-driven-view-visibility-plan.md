# Expression-driven view visibility

A track with `"visible": { "expr": "mode === 'detail'" }` should take up space
only in detail mode. This plan covers the first PR in
[#740](https://github.com/genome-spy/genome-spy/issues/740).

## Visibility rules

- Omitted `visible` defaults to true. A boolean sets the default. Both accept
  manual overrides, and clearing an override restores the default.
- An expression owns the view’s visibility and must return a boolean. An
  import-site declaration takes precedence over the imported root’s declaration
  and uses the resulting view’s parameter scope.
- Hiding a parent preserves each child’s local choice. Existing layout rules
  still apply. For example, hiding the center of a surround hides the surround.

## Core

Extend `visible` in `spec/view.d.ts` and reuse the scoped expression runtime in
`view/view.js`. Resolve the local value here so every caller honors expression
ownership. Use the existing host predicate for manual choices.

Bind the expression after its parameters exist and by the first visibility read.
A unit inserted into a live shared scale can be queried during construction. Use
view-owned cleanup so a failed insertion leaves the existing tree usable.
Support parameter expressions that can run without a datum, layout or a data
load. Report non-boolean results and unsupported dependencies at `visible.expr`,
including scale or layout reads through a derived parameter. A track cannot
require its own data load to decide whether to load.

When the boolean changes, run the same Core refresh for parameter writes and App
toggles. Reuse `genomeSpy/viewDataInit.js` to initialize newly shown branches.
Reflow the current tree and clear hidden bounds and picks, including when a
track is hidden again during its first load. Keep its handle, collector and
selections. Use the same path in the initialized headless engine.

Update the grammar, schema and import example. Tentative commit
`feat(core): support expression-driven view visibility`.

## App

Keep manual choices in Redux and radio policy in `viewSettingsUtils.js`. Exclude
expression-owned views from visibility controls and radio groups while keeping
their parameter controls available. The open menu and sample summaries must also
respond when a parameter alone changes visibility.

Honor eligible startup bookmark choices before first layout. Discard stale
expression entries on startup and live restore, including legacy names.
Bookmarks save explicit Redux choices. A radio group can hide a sibling without
creating a bookmark entry for it.

A direct write checks the target only, so a manual child can be configured under
a hidden parent. A sample operation that needs to reveal the child must check
its ancestors before writing settings, zooming or waiting for data.

Update the View settings docs and add a changeset covering Core and App.
Tentative commit `feat(app): respect expression-owned view visibility`.

## Acceptance

Use one `vconcat` with ordinary Coverage and expression-controlled Detail.
Restore an App bookmark that hides Coverage and contains a stale Detail entry.

1. The first layout omits Coverage and its independent source has zero loads.
   Show it, brush an interval, hide it, and show it again. Its source has loaded
   once and the same handle still reports the interval.
2. Change `mode` through the parameter API in both App and a bare Core embed.
   Detail’s row, marks and pick targets follow the expression. Saving the App
   bookmark again records only the explicit Coverage choice, if one is set.
3. In Core, check an imported Detail track with a shadowed parameter and a
   hidden layer over a visible sibling. The hidden layer has no bounds, picks,
   or SVG marks after reflow.

## Follow-ups

PR 2 adds the stable `handle.visibility` object. Its `locallyVisible` getter
reads the choice before ancestor and container rules, `staticDefault` is
undefined for expression-owned views, and `override` is the explicit choice to
save. Async `setOverride(value)` stores a boolean or clears it with `undefined`.
Bare Core stores it on the live view. App uses Redux for addressable views.
Restore `initialVisibilityOverrides` once, before layout and loading, for unique
eligible matches in the initial hierarchy.

PR 3 adds the optional `trackVisibilityButton(tracks)` in
`@genome-spy/core/controls` using those handles.

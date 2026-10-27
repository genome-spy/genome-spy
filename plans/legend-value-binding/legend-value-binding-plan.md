# Legend value binding

Status: implemented, 2026-10-26; final CI pending. Two independent Sol plan
reviews completed before implementation. PR #606 contains the standalone ordinal
fix; PR #605 replaces the projected implementation with value bindings.

## Goal and scope

Focus brain UMAP cell classes through the native categorical color legend,
keeping all data, legend entries, colors, semantic sampling and brush counts.
Use an ordinary writable array parameter and existing ordinal opacity ranges.
Remove projected selections, predicate textures, per-mark selection changes,
new selection API types and new persistence value types from this feature.
Filtering, arbitrary projection predicates, gradient legends and configurable
gesture grammars are outside this change.

## Decisions

Proposed declaration:

```json
{ "name": "class_focus", "value": [], "bind": { "legend": "color" } }
```

`color` identifies a channel in the declaring view's scope. Resolve it once
through `View.getScaleResolution`, then retain that resolution and the writable
parameter ref. Do not overload the string with field or globally named-scale
lookup. Start with categorical color symbol legends; other guide channels need
a demonstrated consumer and a clear rule for redundant guides.

Shared scales require the same parameter slot to be visible to their members;
declare it in their common scope. Independent scales bind locally. Collected
legends retain the source resolution's binding regardless of layout placement.
Reject missing/unsupported targets, competing bindings and inconsistent shared
slots at initialization. Do not discover bindings from the first legend member
or resolve parameter names again from generated legend chrome.

The array is the only state. Click replaces, Shift-click toggles, double-click
clears to `[]`. Preserve original typed values, create fresh arrays, and keep
state when a category temporarily disappears. External writes and bookmark
restoration drive the same legend feedback. Own listeners with the legend's
existing lifecycle and reuse the necessary hit-region/event work from #605.

The consumer authors its opacity encoding, including its desired base opacity.
No automatic opacity injection or multiplication across arbitrary marks. For
the brain example, use a fixed explicit opacity domain, `reverse: false`, and
one range ExprRef per domain entry. Membership refers to the opacity scale's
own typed `domain('fillOpacity')[i]`, not labels, legend order or interpolated
category literals. Empty focus means the normal opacity. This handles ordinary
data updates within the explicit universe; arbitrary domain-length changes
require regenerating the spec and are not promised here.

Use existing `params.get(name).getValue()/setValue()/subscribe()` and App bound
literal persistence. Narrow the App Parameters menu predicate to HTML input
bindings. Include small declaration/current-value summary changes if needed
for App-agent discovery; add no new tool action or selection schema.

## Evidence and alternatives

- Clean master 703f73d1 accepts three expression-valued ordinal opacity entries,
  but rejects 34 because the WebGL generator takes its numeric-vector branch.
  Excluding ordinal scales there uses the existing numeric range texture path.
- The isolated fix renders the 1.1M-cell, 34-class brain example. Twelve changes
  uploaded no vertex buffers and allocated no new textures; existing textures
  were updated. Median synchronous setter time was about 0.1 ms. This does not
  measure full interaction-to-frame latency or imply zero CPU allocations.
- A browser/SVG probe passed six independent category selections plus clear:
  constructor, **proto**, toString, quotes/backslash, numeric 1 and string "1".
  It used own-domain range expressions and the isolated fix, not legend clicks.
- Ordinal opacity adds its ordinary category vertex attribute at initialization;
  the claim is no new selection-buffer machinery or uploads during focus.
- Vega-Lite's legend compiler inspires entry/symbol/label interaction and
  state-driven feedback: https://github.com/vega/vega-lite/blob/main/src/compile/selection/legends.ts.
  Its projected tuple machinery is unnecessary here. No source is copied in
  this proposal. Vega-Lite's BSD-3-Clause license is compatible; retain required
  notices and provenance if implementation later copies/adapts source.
- Named-scale binding also works, but requires globally unique names solely
  for interaction. Scoped channel resolution better supports reusable views.
- A stacked general projection subsystem is deferred until an actual consumer
  requires it. Splitting the same oversized feature would not remove its cost.

## Delivery milestones and review gates

1. **Fix ordinal expression ranges.** Submit an independently reviewable small
   prerequisite fix in `glslScaleGenerator`, retaining native texture handling.
   Cover at least five numeric ExprRefs and a nonordinal dynamic-range regression;
   check rendered output and include a Core changeset.
   Tentative commit: `fix(core): support expression-valued ordinal ranges`.
2. **Replace #605 with focused legend binding.** Update parameter grammar,
   resolution-based binding, native legend interaction/feedback, the small App
   menu/discovery predicates, docs, example and changeset. Reuse the existing
   parameter API and persistence. Review the public scope/identity/lifecycle
   contract together. Preserve existing history; do not rewrite or force-push.
   Tentative commit: `feat(core): bind categorical legends to value parameters`.
3. **Verify the integrated interaction before delivery.** Test actual clicks,
   Shift toggles, clear and external writes; independent/shared/collected guides
   and shadowing; typed categories and differently ordered color/opacity domains;
   disappearance/reappearance; App undo/bookmarks; disposal. Re-run the real
   brain example with brush/count and semantic sample unchanged, retained texture
   identities and zero UMAP vertex uploads after initialization. Check WebGL, Canvas,
   SVG and representative WebGPU execution. Run targeted tests, lint, type/schema
   and release checks, then full CI on the replacement head. Do not re-report the
   old CI as validation of the new design.

Python/notebook adoption remains blocked on a published Core release. Temporary
experiments, recordings and this plan must not be merged as deliverable artifacts.

## Remaining risks

Actual native legend binding, external-write feedback, App restoration and
cross-renderer behavior are acceptance gates, not validated prototype claims.
Dimmed points remain pickable: this feature changes visual focus, not membership.
Array validation must cover authored initial values and public writes using the
existing parameter boundary, without introducing a second state model.

## Implementation verification

- Completed: categorical color binding, original typed arrays, shared/independent
  and collected guide scope validation, click/Shift-toggle/double-click, ordinary
  public parameter writes, invalid-write rejection, and owned listener disposal.
- Completed: App bound-value capture/restore and undo/redo; small App input-menu
  predicate; App-agent declaration and current-value discovery without new actions.
- Completed: docs example, generated schema/API docs, changesets, targeted tests,
  all workspace type checks, and full lint. Full suite with two workers: 555 files,
  5,286 passing tests, one skipped and two TODO (before the final test-only checks).
  The initial full parallel run hit existing schema-test timeouts; the complete
  suite passes with fewer workers, without changing timeouts or weakening tests.
- Completed: actual legend gestures and SVG appearance on Canvas and WebGL at
  DPR 1 and 2. The 1.1M-cell demo retains all 34 entries and a count of 181,896
  through 24 focus updates: zero large UMAP buffer uploads and no new textures.
  Median synchronous setter time was about 0.2 ms; this is not frame latency.
- Discarded from this PR: experimental WebGPU gesture support. A live check found
  transparent-rectangle picking and asynchronous click-ordering limitations. No
  renderer workaround or unrelated picking refactor is retained. Documented the
  supported Canvas/WebGL scope; a native WebGPU fix needs separate work.
- Completed: pushed the replacement as c79657e1 and verified all three hosted CI
  checks. The build log confirms 555 passing files and 5,286 passing tests.
- Completed: added the reviewer-requested five-category native-slider example in
  prerequisite PR #606 (7ecba2da), verified its schema, initialization and WebGL
  updates, and merged that dependency update into #605.
- PR #605 targets master because the existing CI workflows only run for that
  target. Merge #606 first; its files then drop out of the feature diff.
- Remaining: verify hosted CI on the updated head and remove this temporary plan
  before merge. Current check results are recorded in the PR description.
- Deferred outside Core delivery: Python/notebook adoption after a published Core
  release, as requested. No Python source or tracked notebook is changed here.

# Core view visibility

Status: proposal. No runtime implementation is included.

## Recommendation

Support parameter-driven `visible: boolean | ExprRef` in Core, then add an
explicit visibility override capability to public view handles. Use ordinary
parameters as the primary control path for authored interactive specifications.
Core should own visibility evaluation and transition mechanics; App should retain
its Redux, bookmark, and visibility-menu policy.

Implement expression support and the shared lifecycle first. The embed
capability is a useful second milestone, not a prerequisite for host-controlled
visibility.

## Goals and non-goals

- Make view visibility reactive in standalone Core, with normal lexical
  parameter scope, input bindings, and embedding parameter writes.
- Allow hosts to hide or show existing views without rewriting specifications
  or reconstructing the visualization.
- Preserve ancestor visibility, collapsed layout, visibility-aware startup,
  App bookmarks, and scoped selectors.
- Give expressions, App toggles, and embed overrides one transition lifecycle.

Do not add a Core toolbar, promote App radio-group metadata into the Core
grammar, unload hidden subtrees, introduce a generic state-management bridge,
or redesign shared-domain membership as part of this feature. Scale-dependent
visibility requires a separate bootstrap and feedback design before support can
be promised. Opacity and multiscale transitions retain their existing purposes.

## Current implementation

- `packages/core/src/spec/view.d.ts` declares boolean `visible` on both ordinary
  views and import specifications. Import-site values override the imported
  declaration in `view/viewFactory.js`.
- `View.isVisibleInSpec()` currently returns `spec.visible ?? true`.
  `isConfiguredVisible()` delegates to the context predicate, while
  `isVisible()` also checks layout ancestors (`view/view.js`). Containers add
  existing rules, including implicit concat collapse and surround-center
  visibility; these must remain intact.
- `GenomeSpyBase.viewVisibilityPredicate` defaults to authored visibility.
  App wraps it with `Redux override ?? originalPredicate` (`app/src/app.js`).
  In particular, a true override can show a view whose authored default is false.
- `genomeSpy/viewDataInit.js` skips hidden branches at startup and initializes
  newly shown branches once, replaying completed ancestor collectors where
  possible. Hiding does not dispose initialized data or marks.
- `GenomeSpyBase.initializeVisibleViewData()` handles data initialization,
  size invalidation, layout, and rendering. App separately coalesces changes,
  clears hidden coordinates, and clears highlighting. That common work belongs
  in Core so expression changes receive the same treatment.
- Public `ViewHandle`s already expose scoped `params`, `datasets`, and `marks`
  capabilities. They provide stable live identity and existing selector rules.
  `api.params.get(name).setValue(value)` already provides host parameter writes.
- App visibility settings are outside undo/redo provenance; ordinary parameters
  participate in provenance (`app/src/state/setupStore.js`). Converting all App
  visibility toggles into parameters would change existing behavior.
- Shared scale input bindings snapshot configured-visible contributors
  (`scales/scaleResolution.js`). A hide/re-show with no new initialization does
  not necessarily rebind them. Visibility cannot be advertised as a complete
  shared-domain filtering mechanism under the current lifecycle.

## Approaches considered

| Approach                                                            | Benefit                                                                       | Limitation                                                                                   | Assessment                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Expression-driven `visible`, controlled through ordinary parameters | Fits the grammar, scoped reactivity, checkbox bindings, and current embed API | Authors must declare a control parameter for simple host toggles                             | First milestone                            |
| Explicit per-view embed overrides                                   | Works with existing specs and boolean defaults; follows App's current model   | Requires reset, observation, lifecycle, and App storage integration                          | Second milestone                           |
| Only an imperative setter                                           | Small apparent API                                                            | Leaves declarative interaction unsupported and hides precedence questions                    | Insufficient alone                         |
| Make setters find and mutate an expression's controlling parameter  | Convenient for a simple `showTrack` expression                                | Arbitrary expressions have no unique writable inverse                                        | Reject                                     |
| Gate authored visibility with an additional boolean                 | Manual hiding preserves expression control                                    | A true gate cannot show an authored-false view, contrary to App's existing override behavior | Do not use for the existing visibility API |

Vega offers a useful precedent for driving specification properties with reactive
signals and writing the same signals through its host API. This supports the
parameter-first approach; it does not establish collapsing view layout semantics.
See [Vega signals](https://vega.github.io/vega/docs/signals/) and the
[View signal API](https://vega.github.io/vega/docs/api/view/#signal).

Plotly distinguishes hidden traces from traces retained in its legend. The useful
lesson is that controls must remain discoverable when their content is hidden;
this is not a precedent for removing GenomeSpy tracks from layout. See the
[trace visibility contract](https://plotly.com/javascript/reference/scatter/#scatter-visible).
These are design comparisons only; no external implementation is copied.

## Proposed contracts

### Authored visibility

Extend both ordinary and import-site `visible` to `boolean | ExprRef`, defaulting
to true. Evaluate expressions in the resulting view's normal lexical parameter
scope, including import-site parameter overrides. Require a boolean result and
report a located specification error for invalid values.

For example, a named view can declare:

```json
{
  "name": "coverage",
  "params": [
    { "name": "showCoverage", "value": true, "bind": { "input": "checkbox" } }
  ],
  "visible": { "expr": "showCoverage" },
  "mark": "rect"
}
```

The host can then use the existing scoped parameter API:

```js
const coverage = api.views.get({ scope: [], view: "coverage" });
coverage.params.get("showCoverage").setValue(false);
```

Shared controls can instead be declared on an ancestor and written through
`api.params` when declared in the authored top-level scope.

Visibility needs an earlier binding boundary than opacity. Browser startup reads
`viewRoot.getSize()` before post-scale configuration, and scale initialization
itself reads configured visibility while collecting active members. Simply adding
visibility to `configureViewsAfterScaleResolution()` is therefore insufficient.

For the first milestone, bind expressions using ordinary scoped parameters
before guide/size/scale consumers read visibility. The end of the base View
constructor, after parameter registration and before subclass resolution work,
is the initial candidate. Bind the local baseline there, but activate operational
transition effects only when hierarchy preparation is ready: descendant
`push: "outer"` declarations can still update ancestor parameters during construction.
Configure bindings even for initially hidden views. Reject unsupported direct or
transitive scale- or layout-derived dependencies with a located error rather than using a
temporary truthy expression object or an invented initial visibility value.
Determine the precise early hierarchy hook and dependency validation at the
shared-contract review; extend the existing expression analysis and pending-param
classification rather than implementing a second dependency analyzer.

Use owned computed/effect machinery to observe settled changes and avoid
reinitialization or reflow when an expression's boolean result is unchanged.
Dispose bindings with their views. Keep existing expression errors and cycle
diagnostics; do not add a separate evaluator or polling loop. General scale-driven
visibility remains a follow-up requiring deliberate staged initialization.

### Overrides and effective visibility

Conceptually, preserving the existing container-specific rules:

```text
authored   = evaluate(spec.visible ?? true)
configured = override ?? authored
effective  = configured AND layout ancestors' configured visibility
```

A manual override remains active until explicitly cleared, even if the authored
expression temporarily agrees with it. Clearing it resumes the latest expression
value. Expressions remain reactive while overridden. Showing a child does not
implicitly show its hidden ancestors.

The proposed embed surface is a capability on the existing `ViewHandle`:

```js
const visibility = api.views.get({ scope: [], view: "coverage" }).visibility;

await visibility.setOverride(false);
await visibility.clearOverride();
```

Add `getState()` returning a detached snapshot of `{ authored, override,
configured, effective }`, with undefined override meaning automatic behavior,
and `subscribe(listener)` returning an unsubscribe function. Derive these values
rather than storing four copies. A host toggle can negate `configured`; negating
`effective` would give confusing results beneath a hidden ancestor. A dedicated
toggle shorthand can wait until the basic capability is proven useful.

Override writes are asynchronous because first-show initialization can load
fonts and eager data. Resolve after that operation's initialization and completed
layout; current viewport lazy-data coverage remains the separate
`awaitVisibleLazyData()` contract. Errors reject the operation and use existing
runtime reporting; do not promise rollback. Scoped handles and stale/finalized
handle failures follow existing public API conventions.

### Shared transition lifecycle

One Core path should coalesce settled visibility changes, clear hidden bounds
and stale picking/hover state, invalidate size caches, initialize newly visible
branches, and arrange/render the resulting layout. Hiding should collapse layout
promptly without waiting for an unrelated pending load. A later data completion
must not restore hidden placements. Reuse the existing initialization states and
loading lifecycle rather than creating a parallel visibility job framework.

Visibility controls layout, rendering, and associated interaction eligibility.
It does not unload data or promise to remove loaded rows from shared domains.
First showing previously uninitialized data can expand an inferred shared domain.
Characterize existing hide/re-show behavior in a focused integration test and
preserve it for this change. A consistent visibility-sensitive domain policy,
including navigation and scale-dependent visibility feedback, requires a separate
design if desired.

### App integration

Keep Redux as App's override authority and bookmarks as its persistence format.
Core's public override writes must delegate to that authority in App embeds,
while standalone Core uses view-owned override state. Extend the existing
predicate seam only as needed for reading/writing overrides; do not mirror two
independently writable override stores. Overrides for unnamed live views may
remain transient, consistent with handle identity; only selector-addressable
views receive bookmark persistence.

App must observe the common Core visibility notification for menu refresh,
radio-group default resolution, and `MergeSampleFacets` re-show handling. Those
consumers currently rely on Redux changes or cached static defaults, which would
miss expression-only changes. Notifications must include authored-value changes
even when overrides mask them. Keep radio policy in App and invalidate its
derived cache before sampling configured visibility for the shared transition
lifecycle. Preserve its mutual-exclusion rules.

For expression-controlled views, expose an explicit reset-to-automatic action.
Do not clear a deliberate override merely because it equals the expression's
current result. Static boolean defaults may retain the current checkbox/reset
experience. Preserve visibility restoration before startup and App callers that
explicitly show named ancestors when preparing sample attributes.

## Milestones

### 1. Reactive authored visibility and a common transition path

Outcome: standalone Core specifications can toggle visibility through parameters
and bindings, and App receives the same expression-driven changes.

Affected areas: view/import types and schema, View expression binding,
early hierarchy setup, Core visibility/data initialization and layout, headless
bootstrap, and App visibility subscribers, menus, radio caches, and facet merges.

Verification: use a focused headless specification-to-layout/SVG test for
parameter changes, ancestor visibility, and removal/restoration of placements.
Extend real initialization tests for initially hidden branches and reuse of
completed upstream data. Cover imported scopes, unchanged results, settled
transaction updates, invalid results, rejection of unsupported scale-derived
dependencies, and disposal at their appropriate level.
Align headless default visibility with live Core rather than bypassing it in
each test. Add App regression coverage for expression-only notifications,
bookmarks, and radio policy. Review overlapping existing tests and retain
behavioral contracts rather than duplicating private evaluation details.

Documentation/release: update grammar visibility/import docs and an input-bound
example, regenerate schema, and add a Core changeset plus an App fragment if its
published behavior changes. Use the docs, view-testing, and changeset skills.

Tentative commit: `feat(core): support expression-driven view visibility`

Review gate: prove the early binding boundary and dependency validation before
committing to the public expression contract. Evaluate visibility-aware initialization, shared
scales, backend placement consumers, and App notification/persistence behavior
together before proceeding to the public override API.

### 2. View-handle overrides with observation and reset

Outcome: hosts can control arbitrary existing live views through explicit
overrides, including Core and App embeds, without reconstructing their specs.

Affected areas: public embed types, `view/viewMutationApi.js` handle creation,
Core override ownership, App override delegation, and scoped handle lifecycle.

Verification: exercise set/clear against boolean and expression declarations;
retain overrides while expressions change; verify configured versus effective
state beneath a hidden ancestor. Check subscription delivery, removal and
finalization cleanup, scoped imports, asynchronous first show, transaction
integration, and App bookmark restoration with no duplicate writable state.
Use existing failure behavior for initialization errors and stale handles.

Documentation/release: document the capability and precedence in `docs/api/views.md`,
add an embed-example checkbox that remains available when its view is hidden,
and update the feature's changeset. Clarify that visibility is distinct from
opacity and shared-domain filtering.

Tentative commit: `feat(core): expose view visibility overrides to embeds`

Review gate: public naming, async completion, observation, and App state ownership.

## Final integration verification

Use one representative example with imported coverage tracks, shared locus x,
independent y, a layer, and a container with axes/title. Toggle a track through a
bound parameter, a host control, and App's visibility menu; hide/show its parent,
restore automatic behavior, restore a bookmark, and insert/remove another track.
Include one initially hidden eager source and one lazy genomic source. Verify
stable loaded state, expected domains, reflow, cleared hover/picking/bounds, and
error/disposal handling when a view is removed during loading.

Check live WebGL and Canvas rendering plus SVG export for identical visibility
and layout decisions. Smoke-test the supported WebGPU mark subset because all
backends consume common placements. Use the browser-debug and view-testing skills
when implementing these checks. Run focused Vitest suites with the agent reporter,
then appropriate workspace type/schema and lint checks for the touched contracts.

## Risks and remaining decisions

- Scale- or layout-dependent expressions can feed back into their own visibility
  through domain membership or available size. They also create a bootstrap
  dependency because scales already read configured visibility. Their full
  support is deferred; reject unsupported dependencies explicitly in the initial
  contract. Use opacity/multiscale for transitions that intentionally retain layout.
- Choose exact snapshot notification timing during implementation. The intended
  contract is settled logical state, with completed geometry observed through
  the existing layout subscription and asynchronous override completion.
- Confirm the minimal App override read/write hook and transient unnamed-view
  behavior before publishing the capability. Preserve one writable authority.
- A built-in Core view chooser remains optional future UI. Existing parameter
  bindings and host controls already cover the initial use cases.

## Acceptance criteria

- Boolean specifications retain their behavior; ordinary and import-site
  expressions support scale-independent lexical parameters and initially hidden
  views. Unsupported scale-derived dependencies fail clearly.
- A parameter write alone changes standalone Core layout/rendering and safely
  initializes a previously hidden subtree once.
- App bookmarks, radio rules, sample-facet refresh, and provenance boundaries
  remain compatible with expression-only changes and public override writes.
- Explicit overrides are observable and resettable; ancestor hiding and stale
  handles have documented behavior.
- Hidden views have no stale exported placements, interaction hits, or bounds;
  showing them does not reconstruct initialized data unnecessarily.
- Shared-domain behavior is characterized and documented without introducing an
  incidental visibility-driven domain redesign.

# Dynamic SampleView lifecycle in GenomeSpy App

Status: implementation complete and verified. All three milestones are committed
separately. Retain this reconciled plan on the feature branch; remove before merge.

Issue: [#628](https://github.com/genome-spy/genome-spy/issues/628).
Base: `master` at `d983873ab`. Branch: `codex/dynamic-sample-view`.

## Outcome and scope

Keep one App shell alive while a host inserts, removes, and recreates its
SampleView. A persistent concat owns a fixed assembly and shared locus scale.
It contains independent annotation siblings and zero or one SampleView.
Removing the cohort clears its App state and history while preserving annotation
instances, loaded data, and navigation. Existing static embedding stays compatible.

This is one preparatory App lifecycle change. The consumer supplies SampleSpecs,
files/URLs, compatible inputs, source identity, and annotations.
Assembly compatibility/replacement belongs to
[#629](https://github.com/genome-spy/genome-spy/issues/629). File pickers, Figwig
inspection, specification generation, simultaneous cohorts, and restoration of a
removed view after failed replacement are outside this change.

Keep dialog handling minimal, as requested: dismissal where practical and a
liveness check for a late metadata-upload result. No dialog cancellation or
retargeting system.

## Architecture and reuse

Relevant references are `ARCHITECTURE.md`, `packages/app/APP_ARCHITECTURE.md`, and
`packages/core/docs/architecture/views-and-dataflow.md`.

- Core's `viewMutationApi.js` and `containerMutationHelper.js` already own queued
  mutations, layout-batching transactions, subtree initialization and disposal.
  Reuse these; App owns cohort policy.
- App's `app.js` installs metadata runtime, parameter provenance, and scale URL
  observations at launch. These must follow later attachments too.
- `sampleSlice.js` and `setupStore.js` own cohort state independently of view
  disposal. `setSamples` expects a single installation; there is no cohort reset.
- `intentPipeline.js` serializes intents. Metadata bootstrap/rebuild and complete
  bookmark restoration also have pending work outside that queue. Wait for that
  work before detaching, rather than adding a cancellation protocol.
- `paramProvenanceBridge.js`, toolbar/menu/search, and App visibility resolution
  cache hierarchy-derived information that needs refreshing after mutations.
- Core factory/concat/layer construction can lose successful or late children
  when a sibling fails before the parent adopts its child array. Constructor
  registrations also need a clear owner if construction throws.
- Keyboard registration and provenance action-info registration lack removal
  callbacks. Lazy interval/Figwig source disposal does not close retained readers.
  These are concrete cleanup gaps, not reasons for a general resource framework.

Source paths above are under the owning package's `src/`. Keep `agentApi` as an
exposure boundary that resolves the current SampleView; App must not depend on it.

[Vega's View API](https://vega.github.io/vega/docs/api/view/) uses explicit
finalization and awaited evaluation.
[Monaco's model/editor concepts](https://github.com/microsoft/monaco-editor/blob/main/README.md#concepts)
separate replaceable content from its UI and disposable registrations. Reuse those
ownership principles through GenomeSpy's existing subtree lifecycle. No external
code is copied or adapted.

## Design

### Mutation coordination and minimal state

Add one optional internal around-operation callback to `createViewMutationApi`,
inside its existing queue. It receives the operation kind, resolved parent/target,
and the operation to execute. Core argument/container validation and removal
dependency preflight precede destructive App state changes. Core-only callers
keep their existing behavior.

App uses this callback for cohort preparation and hierarchy refresh. All queued
mutations, including calls made through a transaction callback, follow it. Use
the same preparation once around an outer transaction, before Core suppresses
layout requests, so accepted work can finish loading. Do not add an App mutation
queue. Complete layout-dependent App setup after Core releases layout suppression
and before the outer transaction resolves. Keep existing mutation results and
transaction batching semantics; no rollback of removed cohorts.

App needs an active SampleView reference, one construction reservation, and a
transition flag. The existing factory reserves a candidate before construction
and rejects a second cohort, including one hidden inside an import/composed spec.
Reject nested SampleViews and unsupported layer placement. Disposal clears the
reservation/reference. No lifecycle enum or parallel hierarchy registry is needed.

Removing an ancestor containing SampleView detaches that cohort; moving the same
view does not reset it. Static startup uses the same attachment helpers while
preserving its metadata-warning and bookmark ordering. Public App mutations go
through the embed result's `views` API; debug objects are not a mutation API.

### Finish accepted work before detachment

Use a small App helper to admit and track complete top-level cohort operations:
metadata imports, user/agent intent submissions, and bookmark lookup/restoration.
It needs only a pending-promise set and the transition flag, not another queue.

When a lifecycle mutation reaches the Core queue:

1. Set the transition flag. Reject new top-level cohort operations and disable
   the corresponding controls.
2. Await already accepted operations, the intent pipeline's idle state, and the
   metadata update tail. Wait for every accepted operation to settle even if one
   rejects; accepted failures finish against the old cohort before state/history
   is reset.
3. Perform the mutation, reset detached state, and set up the surviving/new cohort.
4. Refresh derived consumers and reopen admission, including after cleaned-up
   failure.

Keep the internal `IntentPipeline.submit` path available throughout. An accepted
bookmark must be able to submit its remaining intents while App is draining;
new-cohort metadata bootstrap uses that same normal path. Gate an operation once
at its external App entry point, not again in its internal continuations. Add an
idle waiter to the existing pipeline as needed. Do not add routine replacement
aborts, queued-work rejection, attachment signals, or privileged bootstrap modes.

Track whole bookmark operations, including remote lookup, visibility, navigation,
plots, and failure handling. Track specific App routines, not arbitrary plugin
tasks that might themselves await a queued mutation. Never include the lifecycle
operation among the promises it drains. Source-dependent operations with no cohort
fail clearly; independent parameters remain usable in the empty App.

Existing source cancellation on disposal and caller-requested cancellation remain
in place. Unregister metadata bootstrap/runtime listeners, timers and resolvers.
Make disposed metadata rebuilds and queued parameter/store callbacks inert.
Dismiss source-bound UI where practical; discard an upload result targeting a
disposed SampleView. Do not migrate dialogs or add generalized dialog tracking.

### Reset state and refresh bindings

After successful detachment, reset identities, imported/derived metadata,
grouping/filtering, and cohort selections. Clear undo/redo and intent status,
then seed the established provenance baseline. This is one non-undoable boundary.

Remove parameter provenance and visibility overrides owned by the removed subtree,
including legacy visibility aliases, before a new cohort can reuse its selectors.
Clear surviving selections whose stored origin references that subtree. Retain
independent parent/annotation values and visibility in the new baseline. Keep
source-specific parameters in the replaceable subtree; do not infer dependencies
from arbitrary host expressions.

Each new attachment installs its own identities, complete metadata, resolvers and
hooks, even with overlapping sample IDs. Recreate the parameter provenance bridge
initially instead of introducing an incremental registry. Dispose its old
subscriptions, collector observations, throttles and queued capture effects.

Use a small non-undoable hierarchy revision to invalidate App visibility caches,
refresh toolbar/menu paths and parameter controls, and rebind search when its
locus resolution changes. Rebind named-scale URL observations to live resolutions.
Coalesce UI refresh at an outer transaction boundary and reconcile the resulting
live hierarchy. Clear stale menus/highlights. Preserve parent scale identity,
displayed locus, sibling view instances, and independent loaded data.

### Public types and persistence context

Export `AppViewApi`, `AppEmbedResult`, and `AppPersistenceContext` from the App
entry point. Preserve existing embed result members with App-specific typing:

- `views.insert` accepts `AppViewSpec | ImportSpec` with the existing Core
  address/index/scope options and handle result.
- Transaction callbacks receive the App-typed API.
- `setPersistenceContext(context | null): Promise<void>` explicitly updates or
  clears the source's bookmark identity/configuration. It does not reset cohort
  data or replay a bookmark.

Reconcile duplicate `AppEmbedFunction` declarations. Consumer typing must work
without compilation-global `coreSpecAugmentation.d.ts`.

The persistence context contains optional `specId`, `baseUrl`, and remote bookmark
listing URL, reusing existing field types. Exclude startup-only initial-bookmark
and tour options. Require remote listing URLs to be absolute or supply `baseUrl`;
relative bookmark content uses the remote file's directory. Context resolution
does not depend on the original root or the next inserted SampleView.

Serialize the setter through an existing Core transaction and the same App
preparation boundary. Replace bookmark databases/configuration, close released
connections without deleting saved bookmarks, cancel pending debounced URL writes,
and discard stale source hash state. Preserve navigation. Insertion itself does
not configure persistence or trigger remote loading.

Detachment clears the old source context; an empty context disables source
bookmarks. An explicitly set context survives failed insertion for retry, while
the failed candidate's cohort state and resources are cleaned up. A host's
ordinary replacement sequence is:

```js
await api.views.remove(previousCohort);
await api.setPersistenceContext(nextContext); // null disables source bookmarks
const nextCohort = await api.views.insert(container, nextSampleSpec);
```

View transactions retain normal batching for removal/insertion; detachment clears
the source context there too, so a host explicitly reapplies a desired context.
Automatic dynamic bookmark/tour replay is outside this change; normal restoration
runs after mutations settle. Static startup keeps its root `specId`/bookmarks and
initial-bookmark behavior. Embedded mode continues to avoid page URL/bookmark
ownership. Blob URLs are never persistence identifiers.

### Deterministic cleanup and failure

Return unsubscribe callbacks from Core `addKeyboardListener` and App
`Provenance.addActionInfoSource`; register them with the owning view. Audit the
existing keyboard zoom owner alongside SampleView.

Fix partial construction ownership in the factory and concat/layer initialization.
If a sibling fails, settle and dispose successful and late-successful children,
including those not yet adopted by the parent. Move outward App registrations
past fallible constructor setup or unwind them locally if construction throws.
Keep Core's existing candidate rollback/bookkeeping; do not restore removed views.

Add a narrow handle-disposal hook and local settlement promise to
`IntervalUrlSource` for Figwig reader closure. Include pending acquisitions, late
handles, failed header loads, and disposed debounced requests. Retain relevant
source references before pruning and await settlement for sources actually
disposed, including failure rollback. Preserve shared sources and the metadata
adapter's existing `finally` cleanup. View/FlowNode disposal stays synchronous.

The host keeps blob URLs valid during insertion/view lifetime and can revoke them
after successful awaited removal or failed-candidate cleanup. A preflight failure
that retains a view does not permit releasing its URL.

Invalid arguments, a second/nested cohort and failed removal preflight leave the
current cohort/history intact. Failed insertion cleans its candidate and partial
App state before rejecting. After successful removal followed by failed insertion,
the App remains empty and usable for retry, preserving annotations/navigation.
Metadata bootstrap warnings keep static launch's existing usable-cohort policy.
Finalization invalidates pending callbacks and preserves synchronous embed cleanup.

## Implementation milestones

### 1. Complete Core mutation and disposal boundaries

Completed: queued host hooks, partial construction cleanup (including shared
outputs and constructor failure), keyboard ownership, and awaited reader closure.
Independent review found and verified fixes for constructor and sibling-output
cleanup. Focused mutation/construction/source/keyboard suites and Core type checks
pass; release checks accept the Core patch fragment.

Outcome: the existing queue hosts App coordination, and removed/failed subtrees
release registrations and readers. Areas: mutation API/helper/factory, concat/layer
construction, keyboard context/owners, interval/Figwig sources. Consumers include
Core embedding, transactions, and App.

Extend `viewMutationApi.acid.test.js` for hooks through transactions/imports and
failed construction with successful/late siblings. Preserve its existing sibling
and rollback coverage. Extend keyboard and interval/Figwig tests for unsubscription
and reader closure, including late acquisition/header failure. Record changed
Core disposal guarantees in the relevant architecture/API notes.

Tentative commit: `fix(core): complete dynamic subtree lifecycle cleanup`.

### 2. Support App cohort attachment and serialized replacement

Completed: public typed mutations, per-attachment metadata/identity initialization,
non-undoable cohort reset, operation draining and failure recovery. Five composed
App regressions cover A/B replacement, imports, ancestor removal, accepted slow
work, removed selection origins and rapid independent inputs. Independent review
findings are resolved; affected suites and App type checks pass.

Outcome: empty start, insert/remove/replace, and failure recovery through the
public typed API. Areas: App orchestration/factory, sample reset/provenance, pending
operation tracking, pipeline idle waiter, metadata/bookmark lifetimes, embed types.
Consumers include static embedding, metadata imports, selection actions, and
agent API entry points.

Use composed App tests with real SampleView/dataflow. Replace A after metadata,
filtering/grouping, selections and undo/redo with B using overlapping IDs and
reused names. Assert complete B state and fresh history. Cover imported insertion,
ancestor removal, second/nested-cohort rejection, failed candidate then retry.
Use deferred promises to prove accepted metadata/intent/bookmark work finishes
before detachment and new work is rejected during replacement. In particular,
an accepted bookmark must finish submitting its actions without deadlocking, and
one rejected operation must not let detachment overtake other accepted work.
Review overlapping lower-level tests as these contracts gain composed coverage.

Document lifecycle, state reset and typed host usage with the documentation skill.

Tentative commit: `feat(app): support dynamic SampleView attachment and detachment`.

### 3. Refresh controls and source persistence

Completed: hierarchy-aware controls/search, scale observations, explicit bookmark
context setter, isolated public consumer types, docs and composed SVG coverage.
Retained baseline inputs round-trip through bookmarks without retaining old undo
history. Integration also fixed partial FacetView cleanup and canvas wrapper/resize
ownership when the root changes between fixed and growing size.
Active metadata summary and dialog background-read promises use the same admission
helper; open dialog lifetime remains untracked. Failed sibling summaries settle
all readers before removal can finish and the host can release a blob URL.

Outcome: parameter provenance, toolbar/menu/search and URL/bookmarks follow the
live hierarchy. Areas: hierarchy revision/visibility cache, parameter bridge,
controls, scale observations, explicit persistence setter, lightweight UI cleanup.

Verify new parameters support undo/redo and bookmark replay, metadata controls
appear on first insertion, and search observes a newly appearing locus scale.
Check listener replacement, relative remote URL/content resolution, source
identity/hash isolation, and independent parameter/visibility retention. Verify
lazy bookmark replay after a transaction has released layout suppression and
explicit-context retention across failed insertion/retry. Retain embedded-mode
coverage and add a consumer TypeScript fixture using public exports.

Document fixed-assembly ownership, context switching, failure and blob URL release
under embedding/sample collection docs. Use the changeset skill for an App minor
fragment and any independently shipped Core patch impact.

Tentative commit: `feat(app): refresh controls and persistence after view mutations`.

## Final integration and acceptance

- [x] Real App empty start, insert/remove/insert without replacing shell/toolbar.
- [x] Composed fixed-assembly replacement preserves annotation instances, collector
      data/source load count, shared scale identity and navigated locus; B loads
      its own identities, metadata and signal.
- [x] Overlapping-ID A/B case proves isolation of cohort state, removed parameters,
      visibility, history and source-specific persisted state.
- [x] Replacement waits for accepted slow work, rejects new cohort work, and has
      no late old-cohort dispatch/error handling against B. Repeated cycles release
      callbacks, subscriptions, keyboard handlers, reservations and readers.
- [x] Imports, ancestor removal and transaction callbacks follow the lifecycle;
      unsupported cohorts and failed construction leave a usable App.
- [x] A representative composed `appLifecycle.test.js` SVG case exports the current
      cohort plus retained annotations. Reused the real App fixture and existing
      SVG helper instead of duplicating it in `sampleViewSvg.test.js`.
- [x] Browser verification with `debug-genomespy-web`: two small same-assembly
      Figwig fixtures, annotation sibling, metadata import, bound input/selection,
      navigation, replacement, undo/redo, removal and failed insertion/retry.
      Check menus, first locus-scale search, single keyboard handling and static
      SampleView embedding.
- [x] Narrow affected Vitest suites use `--reporter=agent`; run App/Core source
      and test TypeScript checks, lint, and applicable schema/docs/release checks.
      Broaden validation only for concrete failures or unresolved integration risks.
- [x] Review substantial implementation boundaries and final composition; reconcile
      this temporary plan and retain it in branch history. Plan deletion is a
      required pre-merge step, outside this implementation request.

Final verification: 568 Vitest files passed (5,374 tests; existing one skipped and
two todo). Workspace source/test checks, isolated App consumer typing, lint,
formatting and release checks passed. Changesets calculates version 1.3.0 for the
fixed release group: App functionality is minor and Core cleanup is patch.
Documentation examples were syntax checked; no grammar/schema changes were needed.

Real Chromium/WebGL smoke used two upstream Figwig fixtures with a shared assembly.
It covered metadata import, inputs, grouping/filtering, selections, persistence,
failed insertion/retry, static embedding, first-scale search and repeated keyboard
cleanup. Annotation handles/collectors/rows, locus and App shell remained identical.
Fixed-to-growing canvas insertion, host resizing, and removal back to fixed height
were visually verified. Final removal left zero loading entries and no errors.
Temporary browser/server resources were closed.

Size check: App orchestration grew from 873 to 1,174 lines. The added code owns
attachment/reset, accepted-operation draining, and explicit persistence/scale
observations. Coordination remains in the existing Core queue with one App
transition flag and pending-promise set; no task or resource framework was added.

Core KISS follow-up removes the request registry and wrapper: disposal awaits
pending handle acquisitions and reader closure, with Figwig owning cancellation
of pending queries. One container resize observer now lasts for the embed's
lifetime and checks the current sizing mode. Focused source, mutation, App lifecycle
and canvas suites, Core typing, lint, formatting and release checks passed.

## Tradeoffs and review

Serialization can delay replacement while accepted work finishes. This is the
explicitly supported #628 contract. Add cancellation machinery only for a concrete
caller requirement that cannot use this sequencing. The essential risks remain
partial construction cleanup, missed external operation entry points, and reused
selectors; verification targets those boundaries directly.

Re-embedding loses independent siblings/navigation. Making every source-dependent
object rebindable introduces multiple owners. Reuse Core's queue and existing
App owners instead. Split a Core cleanup PR only if implementation establishes
independent value; keep the remaining App lifecycle change together.

Subagent audits established the ownership gaps. Independent review identified
partial sibling/constructor cleanup, transaction layout sequencing and persistence
URL bases; those requirements remain. A subsequent KISS review prompted this
revision: finish accepted work, use a transition flag with promise tracking,
and configure persistence through an explicit setter. The reviewer found the
revised proposal materially simpler, with no blocking findings. Clarifications
cover waiting for all accepted failures/successes and retaining an explicitly set
persistence context for insertion retry.

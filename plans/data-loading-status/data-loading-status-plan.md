# Playground diagnostics and public data-loading status

Status: implementation complete. Runtime encoding-field diagnostics remain a deferred follow-up.

- [x] Milestone 1: source reporting API, origin hook, and live-consumer overlays.
      Verified with 158 focused tests, Core/App/Playground type checks, lint, generated
      API docs, and the missing-CSV shared-source overlay in the in-app browser.
      Changeset selects a minor release (1.2.0 for the fixed release group).
- [x] Milestone 2: lazy waits reject relevant source failures before requesting
      unavailable data. Removed App's readiness shortcut so it observes failures too.
      Verified inherited and auxiliary dependency failures, no retry on entry, hidden
      and eager-only exclusions, successful readiness, abort, and cleanup with 85
      focused tests and Core/App type checks. Both screenshot harnesses already
      propagate non-timeout rejections and need no changes.
- [x] Milestone 3: Playground diagnostics and final integration verification.
      Verified with 17 editor tests covering origin/range resolution, duplicate URLs,
      formatting, semantic edits, schema coexistence, disposal, and stale async results.
      The full unit suite passed (4,541 tests), as did all workspace type checks, lint,
      the Playground production build, and release checks. In-browser checks passed
      for eager CSV and lazy BigWig failures through Core/App embeds with Canvas/WebGL,
      including snapshots, origins, local overlays, lazy-wait rejection, and finalization.
      Playground checks covered a URL typo and correction, formatting, tooltip text,
      and configuration fallback ranges for downstream processing and lazy failures.

## Goal and scope

Make experimenting with specifications in Playground easier for humans and agents.
Humans should see which editable declaration failed and why; agents should inspect
loading outcomes programmatically and identify the declaration to correct. Keep
failed-track messages local to the visualization and preserve successful
initialization when a data source fails.

The primary lifecycle is Playground's edit-and-re-embed loop. Source locations
belong to the editor document associated with an embed. Generic embedders also get
the loading-reporting API, but preserving editor locations through arbitrary
dynamic view mutations is outside this feature's scope.

The contract covers actual loading attempts by eager URL sources and lazy sources,
including transform side inputs. It does not certify unrequested data in hidden
views or future genomic windows.

Keep this observational API separate from `datasets`: named-data updates supply
rows synchronously and continue to throw to their callers. Application-owned
fetches remain the application's responsibility. Parameter-driven URL changes do
produce new GenomeSpy loading attempts and update the same source's status.

Non-goals: retries, rollback, an error history, a general error-class hierarchy,
automatic popups, changing the meaning of `EmbedOptions.onError`, a new loading
scheduler, or comprehensive provenance for imported/generated/dynamically inserted
specifications. Encoding-field, expression, transform, and renderer-property
highlighting are future extensions of the same origin concept, not initial
implementation scope.

## Current implementation

- `packages/core/src/data/sources/dataSource.js` reports loading status through
  `LoadingStatusRegistry` with a view and an optional message.
- `packages/core/src/genomeSpy/loadingStatusRegistry.js` stores one status per
  view. Main and auxiliary sources created by `view/flowBuilder.js` can share that
  view, so one successful source can overwrite another source's failure.
- `genomeSpyBase.js` also uses the registry for root initialization and runtime
  errors. These are not data-source statuses.
- `genomeSpy/loadingIndicatorManager.js` subscribes to the registry for overlays.
- `embedApi.js` constructs the shared Core/App public API. `EmbedOptions.onError`
  currently handles launch/runtime errors and controls their default UI.
- `view/dataReadiness.js` waits for lazy dependency readiness and supports abort,
  but does not subscribe to recorded loading failures. A failed request can leave
  `awaitVisibleLazyData()` pending until the caller aborts it.
- Playground's `editor/jsonLanguageServiceWorker.js` already parses a JSON AST
  with source ranges. `editor/jsonLanguageService.js` supplies schema diagnostics
  through CodeMirror's linter. Multiple linter sources are combined by CodeMirror.

## Proposed public contract

Add `EmbedResult.dataLoading` with two operations:

```ts
getSnapshot(): readonly DataLoadingEntry[];
subscribe(listener: (change: DataLoadingChange) => void): () => void;
```

Each detached entry identifies one active data source and its declaration context:

```ts
interface DataLoadingEntry {
  sourceId: string;
  viewId: string;
  viewPath: string;
  origin?: string;
  status: "loading" | "complete" | "error";
  message?: string;
  errorPhase?: "request" | "processing";
}

type DataLoadingChange =
  | { type: "update"; entry: DataLoadingEntry }
  | { type: "remove"; sourceId: string };
```

`sourceId` is stable within an embed. After optimization, capture the canonical
source's original `viewId`, `viewPath`, and optional authored `origin` once.
`viewId` uses the existing view identity registry; it identifies the original
declaring view and does not guarantee that the view remains live. `viewPath` is
captured descriptive context, not a JSON pointer or current runtime address.
Removing that view does not rewrite this context while the shared source remains
active. Do not expose internal View/DataSource objects.

The message accompanies an error; callers detect failure from `status`, without
parsing message text. Optional `errorPhase` distinguishes a confirmed request
failure from parsing or downstream processing failures. Leave it absent when the
boundary cannot classify the failure reliably. Include `message` and `errorPhase`
only for error entries; later loading/completion clears both.

`getSnapshot()` supplies the complete current state, including eager errors that
happened before `embed()` returned. `subscribe()` reports future changes only:
`update` supplies one source's current entry, including its first reported status;
`remove` identifies a source whose entry was removed on disposal. Subscribers do
not need to compare complete snapshots to identify the changed source.

For initial state plus observation, subscribe and then read the snapshot
synchronously, with no `await` between them. JavaScript run-to-completion prevents
asynchronous loading results from interleaving those two calls. The returned
function unsubscribes; finalization removes subscriptions automatically.
Reads/subscriptions through a finalized embed fail like other public capabilities.

Snapshots describe current source state, not past failures. A new attempt replaces
that source's error with loading; success replaces it with complete. Existing
stale-request and disposal guards remain responsible for suppressing obsolete
results. Do not introduce retries as part of observation.

## Playground source locations

Use an optional generic `EmbedOptions.getSpecOrigin(fragment)` hook, initially
called for original Data definitions at `dataSourceFactory.js`, before eager
expression activation or lazy parameter slicing. Playground associates input
objects with JSON pointers in a WeakMap and supplies that lookup. Core treats the
returned string as opaque and reports it as `origin`; other embedders can omit it.
Keep origin metadata outside source parameters and optimizer sharing keys.

The origin points to the authored fragment in one editor document, not its current
position in the runtime hierarchy. Moving runtime views does not renumber origins.
For this version, imported or cloned definitions whose origins are unknown simply
have no editor location. Correct source lifetime and error reporting still apply
to dynamic views; only editor-location preservation is optional.

For a confirmed request failure (`errorPhase: "request"`) attributable to one
authored URL, Playground locates the original Data definition's `url` node in the
JSON AST and adds a runtime lint diagnostic. The same approach covers nested,
inherited, and transform side-input definitions. A lazy definition's `lazy.url`
can be highlighted only with the same attribution guarantee. Multiple URLs,
unknown data/index-file attribution, processing errors, and unclassified failures
highlight the enclosing Data configuration. A source error alone does not identify
a faulty URL. Exact attribution within URL lists can be added later.

Classify failures at known loader boundaries: direct fetch/HTTP failures are
request failures, while parsing and row propagation/publication failures are
processing failures. Preserve the existing failure handling and record this small
piece of context without parsing error messages or introducing an error hierarchy.
Third-party lazy loaders with ambiguous fetch/parse/index errors remain
unclassified. Their failures still produce a configuration diagnostic.

Use the existing diagnostic UI: an underline and a hover message. Combine runtime and schema diagnostics in the existing worker validation
request so both remain visible. CodeMirror only guards asynchronous lint results
against document changes; a loading-revision check must also discard results
superseded by a source update on the same document. A single linter avoids stale
results from separately batched async sources. Clear a source's diagnostic when its state changes or it is disposed.
Associate callbacks with the active embed/editor revision and discard stale
results. Formatting-only edits that retain the same embed must recompute source
ranges; invalid or semantically changed documents clear obsolete highlights until
the matching embed is available. No attempt is made to maintain locations through
arbitrary edits to a live runtime spec tree.

The generic origin hook allows future expression, transform, and rendering error
boundaries to retain their authored context. Wiring those error paths is deferred.

## Deferred: runtime encoding field diagnostics

Extend the same origin mapping and editor diagnostics to field mappings validated
when data becomes available. Capture the original channel definition's origin
before normalization and retain it with the accessor. When runtime field
validation fails, attach that origin to the reported error so Playground can
highlight the authored `field` property, such as `/encoding/x/field`, and show the
missing field and available fields in the hover message.

Accessors already retain their channel definition in `encoder/accessor.js`;
`utils/field.js` validates simple field names on first access to a datum. The
deferred work must connect that later validation failure to the captured origin
and runtime-error reporting path. Reuse editor range resolution and stale-document
guards; keep data-loading status specific to loading outcomes.

Verify failures after eager and lazy data arrival, inherited and conditional
encodings, and correct locations after edits. This is a recorded follow-up, outside
the implementation milestones below.

## Internal state and UI

Keep one source of truth, but key data-loading state by canonical source identity
and keep root initialization/runtime state distinct. Equivalent declarations
merged by the optimizer produce one public entry. Register cleanup with source
disposal; removing any consumer, including the canonical source's original view,
must not discard its status while another consumer still uses it. Emit `remove`
only when the source itself is disposed. Keep the captured declaration context
stable; do not reassign source ownership or emit context-only updates on moves or
consumer removal. The source's existing runtime/parameter ownership is unchanged.

Derive overlays from live unit views' actual data dependencies, including primary
and auxiliary sources, using the existing dependency traversal. A view shows an
error if any required source failed, otherwise loading if one is loading.
Successful sources cannot clear another source's failure. Overlay placement does
not use the public entry's captured `viewId` or `viewPath`, so a surviving consumer
retains an error overlay after the original declaring view is removed. Derive this
projection when overlays update, including after view disposal, without a second
consumer-ownership registry or public list of affected views.

Preserve existing root initialization indicators and the root-error visibility
behavior committed in `835f93296` while separating initialization and data-source
status.

## Agent completion boundary

Keep `embed()` successful for nonfatal loading errors. Its returned snapshot
contains eager outcomes. Agents can inspect these immediately and subscribe to
subsequent loading state.

Extend the existing `awaitVisibleLazyData(signal)` failure contract: reject when
a source needed by an awaited visible lazy branch has a recorded failure, either
on entry or during the wait. Determine relevance through the actual dependency
graph, including inherited sources and auxiliary inputs. Unrelated hidden failures
do not reject this wait. Rejecting this explicit caller wait does not fail the
visualization or invoke the fatal error UI. Keep abort support and existing domain
request behavior. Do not treat the absence of in-flight requests as readiness.

At wait entry, subscribe to relevant source changes and inspect their recorded
failures before requesting unavailable lazy data. Reject immediately on an
existing relevant error without starting another request. Only after that check
passes, request unavailable data and check readiness. Subsequent status changes
recheck both failure and readiness. This preserves observation of failures without
adding retries through the waiting API.

Use an ordinary rejected Error with useful context initially; the structured
snapshot remains the authoritative inspection API. Structured URL/status metadata
can be added at loader boundaries later, without reconstructing it from messages.

## Risks and open decisions

- Source sharing and auxiliary branches make view ownership insufficient for
  tracking lifetime or determining which failure affects a readiness wait.
- Root startup/runtime status must remain separate from source outcomes, including
  when both refer to the same root view.
- Subscriber exceptions are reported asynchronously through `reportError`, so
  they cannot become loading failures or prevent delivery to other subscribers.
- Use the `dataLoading` namespace and reporting-view fields below. The context
  fields describe the original declaration, not a live
  consumer. Rich structured URL metadata is deferred; the optional error phase is
  sufficient for the initial conservative URL-highlighting policy.
- Source locations are optional aids for a matching editor document, not stable
  runtime addresses. A canonical shared source initially reports one authored
  origin; highlighting every equivalent declaration is outside this scope.

## Alternatives and precedents

- An `onDataError` option is simple notification but does not provide current
  state to a later consumer or report that an error has cleared. A snapshot plus
  subscription fits the existing capability-based embed API.
- Routing data errors through `onError` would mix data observation with the
  current launch/runtime error UI policy.
- Publishing the current per-view registry directly would retain overwrites
  between sources and confuse root runtime errors with data-loading errors.
- [deck.gl layer error callbacks](https://deck.gl/docs/api-reference/core/layer#onerror)
  demonstrate contextual layer-level error reporting. [Vega's View API](https://vega.github.io/vega/docs/api/view/)
  exposes logger hooks and an asynchronous evaluation boundary. GenomeSpy needs
  current source state as well as notifications because eager and lazy requests
  finish at different times. These are API precedents; no code is copied.

## Implementation milestones and review gates

1. **Expose source status in Core and App.** Change registry ownership, preserve
   overlay behavior, wire the common embed API and optional origin hook, and
   document the public contract.
   Test an initial root concat HTTP failure, a later lazy failure, simultaneous
   main/lookup outcomes, a successful replacement load, shared-source disposal,
   finalization, and subscription cleanup. Specifically remove the canonical
   source's original view while another consumer remains: assert unchanged source
   identity/context/error, a surviving consumer's overlay, no `remove` event until
   final source disposal, and no overlay on the removed view. Verify snapshots
   contain initial outcomes while notifications identify only an updated or
   removed source, and error phase distinguishes known request and processing
   failures without guessing ambiguous lazy errors. Use real spec-to-dataflow
   tests and a focused browser check for overlays. Include a Core minor changeset.
   Tentative commit: `feat(core): expose data-loading status through the embed API`.
2. **Make explicit lazy waits reject on loading failure.** Subscribe to relevant
   source outcomes at the existing readiness boundary and clean up on every exit.
   Test failures before/during a wait, inherited/auxiliary dependencies, unrelated
   hidden failures, successful readiness, and abort. For a failure already
   recorded at wait entry, assert rejection without another source request.
   Verify Core/App screenshot harness callers and document rejection handling for
   agent validation. Update the same unreleased changeset.
   Tentative commit: `fix(core): reject lazy data waits when required sources fail`.
3. **Highlight loading failures in the Playground editor.** Index original Data
   definitions, resolve their locations with the existing JSON AST, and publish
   runtime lint diagnostics from loading snapshots/change events. Test duplicate
   URL strings, root/nested/lookup definitions, later lazy failures, correction,
   formatting without re-embedding, stale callbacks after edits, and coexistence
   with schema diagnostics. Include a valid URL with a failing downstream
   transform: highlight the enclosing Data configuration, not its URL property.
   Verify the same fallback for ambiguous lazy data/index failures. Document the
   visible behavior and update the coherent feature changeset to describe the
   Playground benefit.
   Tentative commit: `feat(playground): highlight declarations with loading errors`.

Review the source identity and public API contracts together before implementation.
Review readiness dependency selection and downstream wait callers before delivery.
Final integration: load the vertical-concat example with a missing CSV and a lazy
BigWig example with a failed request, check programmatic status and local overlays,
and confirm the same contract through Core and App embeds with Canvas and WebGL.
In Playground, introduce and correct a URL typo, verify the matching underline and
hover message, format the document, and confirm that old errors do not highlight
a subsequently edited specification.

Acceptance: an embedder detects eager and lazy failures without DOM/console access;
no successful source hides another source's error; waits terminate on relevant
failure; partial failures stay local; stale loads and disposed sources cannot
publish obsolete state; direct authored URL failures highlight the correct
declaration in the matching Playground editor document.

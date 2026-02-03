# GenomeSpy App Architecture

## Overview

GenomeSpy App wraps the Core renderer with Redux-driven state, provenance,
and UI components for cohort/sample analysis. It keeps view settings and
domain/zoom state separate from undoable sample operations so users can
explore a stable "scene" while undoing or redoing edits to the sample set.

## State and provenance (Redux)

- Store setup: `packages/app/src/state/setupStore.js`.
- Undoable slice: `provenance` wraps the sample view state only via
  `createProvenanceReducer` (`packages/app/src/state/provenanceReducerBuilder.js`).
- Non-undoable slices: `viewSettings` and `lifecycle`.
- Intent status: `intentStatus` tracks async progress, errors, and rollback
  metadata (start index, last successful index, current action/progress).

### Action info and provenance UI

- `Provenance` (`packages/app/src/state/provenance.js`) is a thin helper over
  redux-undo for undo/redo, history access, and bookmark replay.
- `ActionInfo` sources map actions to titles/icons for provenance UI and
  context menus (`packages/app/src/sampleView/state/actionInfo.js`).

## Intent dispatching and augmentation

- `IntentExecutor` (`packages/app/src/state/intentExecutor.js`) wraps store
  dispatch and allows registering action augmenters.
- `SampleView` registers augmenters that enrich attribute-related actions
  with computed attribute values before dispatch.
- Augmented data is stored under `_augmented` and stripped from provenance
  history so recorded actions remain serializable and intent-only.

### What "intents" mean here

In GenomeSpy App, an "intent" is a user-driven action expressed as a plain
Redux action that describes *what* should happen (e.g., "sort by this
attribute" or "filter by this interval"), without embedding transient runtime
data. Intents can be enriched at dispatch time (augmentation) and then replayed
later (bookmarks), which is why they remain serializable and are processed
through the intent pipeline when async data readiness is involved.

## Async intent pipeline

`IntentPipeline` (`packages/app/src/state/intentPipeline.js`) is the async
orchestrator for sequential action processing:

- Ensures required data before dispatch (e.g., attribute availability).
- Awaits post-dispatch processing when the action affects data flow.
- Serializes submissions; batches are exclusive to avoid interleaving.
- Tracks progress in `intentStatus` so UI can show "(3 of 5)" and current action.
- On failure, it dispatches an error status with rollback metadata; the root
  reducer applies rollback to the last successful action or the batch start,
  then `resolveError` clears the status.

Intent status UI is wired via `attachIntentStatusUi` to show delayed progress
dialogs and error recovery choices.

## Bookmarks and URL state

- Bookmarks capture:
  - Provenance actions (sample operations)
  - Scale domains (zoom/pan state)
  - View settings (visibility overrides)
- Restoring a bookmark resets provenance to the initial state and replays the
  actions (now via `IntentPipeline` when available), then applies scale domains
  and view settings. The same structure backs URL hash state.

## SampleView and attribute info

`SampleView` (`packages/app/src/sampleView/sampleView.js`) orchestrates tracks,
metadata panels, attribute menus, and the bridge to Redux/provenance. It
coordinates:

- Attribute context menus and dialogs (`attributeContextMenu.js`,
  `attributeDialogs/*`).
- Metadata sources and attribute info aggregation (`metadata/*`,
  `compositeAttributeInfoSource.js`).
- Grouping, labels, and layout helpers (`SampleGroupView`, `SampleLabelView`,
  `locationManager.js`, `mergeFacets.js`).

## Ensuring domains and data readiness

Async actions often depend on attribute data that may be lazily loaded. The
pipeline ensures availability using AttributeInfo hooks:

- `ensureAvailability`: make the target view visible, apply the x-scale domain
  (via `domainAtActionTime` from the attribute specifier), and wait for data
  readiness.
- `awaitProcessed`: wait for post-dispatch updates (e.g., metadata updates that
  reconfigure scales).

Readiness signaling is handled via Core dataflow collectors and Core helpers
(`buildReadinessRequest`, `isSubtreeLazyReady`, `awaitSubtreeLazyReady` in
`packages/core/src/view/dataReadiness.js`). SampleView uses these to wait for
lazy sources without relying on `subtreeDataReady` broadcasts; broadcasts still
drive non-lazy readiness and sample extraction. App-level gates (e.g., ReadyGate)
ensure metadata updates and scale domains are consistent before augmenters run.

## Key entry points

- App bootstrap: `packages/app/src/app.js`
- Store setup: `packages/app/src/state/setupStore.js`
- Intent orchestration: `packages/app/src/state/intentExecutor.js`,
  `packages/app/src/state/intentPipeline.js`
- Bookmark handling: `packages/app/src/bookmark/bookmark.js`

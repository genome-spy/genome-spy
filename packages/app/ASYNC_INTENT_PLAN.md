# Async Intent Plan (App)

## Rationale

The current intent pipeline is synchronous and assumes attribute data are
immediately available. This breaks down for lazily loaded sources (e.g. BigBed)
where actions must first ensure data availability by making views visible,
navigating to a region, and waiting for data to load. We need an async pipeline
that preserves provenance and bookmark replay while keeping UI updates
deferred/merged during batches. The goal is to let users apply actions to lazy
data, create a bookmark, and later restore the bookmark so the same actions
replay against newly loaded data.

In interactive usage, the data and visibility are typically already in place,
so the async path primarily targets batch replays (bookmarks) and automated
action sequences (e.g., future LLM tool calls).

## Step-by-Step Plan (Updated)

### Completed

1) **Types and specifiers**
   - `BaseSpecifier` now carries `view`, `field`, and `domainAtActionTime`.

2) **Async intent contracts**
   - `IntentPipeline` exists with queueing and sequential processing.

3) **Intent status slice**
   - Slice added with `idle`/`running`/`error`/`canceled`.

4) **Ensure by AttributeInfo**
   - `ensureAvailability` and view-backed attribute ensure implemented.

5) **Processed/ready signals**
   - `awaitProcessed` hook added and used for view-backed attributes.

6) **Queue and batch execution**
   - Queueing, batch rejection, and failure propagation implemented.

7) **Bookmark integration**
   - Bookmark restore runs through the async pipeline.

8) **Metadata readiness gating**
   - Metadata update awaits data flow completion; manual domain reconfigure removed.

9) **Shared readiness helper**
   - Added `ReadyGate`/`ReadyWaiterSet` to shrink readiness boilerplate.
   - Used for subtree data readiness and metadata readiness.

### Next

1) **Refactor pipeline wiring to reduce smells**
   - Add `IntentPipeline.setResolvers({ getAttributeInfo, awaitMetadataReady })`
     and call it once in `App` after `SampleView` is created.
   - `restoreBookmark` should only call `intentPipeline.submit(...)`, with no
     direct SampleView access or `bind(...)` plumbing.

2) **Action hook registry**
   - Replace hard-coded action-type checks in the pipeline with a registry:
     `registerActionHook({ predicate, ensure, awaitProcessed })`.
   - Register metadata actions to await `awaitMetadataReady` without embedding
     `"sampleView/addMetadata"` in the pipeline.

1) **Ready fast-path**
   - Add a fast-path for “already ready” subtrees to avoid hanging waits.
   - Open question: how to reliably detect “already ready” for a subtree.

2) **Intent status integration**
   - Have the pipeline set `intentStatus` to running/error/canceled and store
     `startIndex` before batch execution.
   - Implement a recovery action (e.g., `intent/recoverFromError`) to combine
     rollback/clear in one dispatch.

3) **Bookmark restore error handling**
   - Ensure errors from async bookmark restore are surfaced to the user
     (dialog/toast), not just logged or swallowed.

4) **UI update debouncing (last)**
   - Add a render gate/debouncer after bookmark replay is verified.

## Risks

- **Deadlocks or long waits**: if ensure/processed signals are not emitted (or
  miswired), actions may hang. Mitigate with timeouts and cancellation.
- **Provenance mismatch**: partial batch execution could confuse users unless
  the UI clearly offers rollback vs keep-current-state.
- **Over-coupling to views**: ensure hooks that know too much about view
  internals could become brittle. Keep the contract narrow and attribute-driven.
- **UI responsiveness**: large batches can still stall without yielding.
  Periodic `requestAnimationFrame` yields mitigate this.

## Feasibility Review (Critical)

- **Attribute-driven ensure is feasible** because `AttributeInfo` already
  centralizes view and field metadata for SampleView. The new requirement is to
  expose `domainAtActionTime` and a reliable path to the target view.
- **Waiting for readiness is the hardest part**: there is no built-in "view
  visible + dataflow wired + data loaded" promise. This needs a minimal signal
  exposed by SampleView (likely based on `subtreeDataReady`), or a data source
  level "loaded" promise. Without this, ensure could hang.
- **Batch replay semantics are compatible with provenance** since only
  successful actions are recorded and bookmarks store intent actions only.
- **UI debouncing is low risk** because it only gates rendering; data loading
  still proceeds immediately.

## Testing and Commits

- **Unit tests first**: build the async pipeline with fakes; test sequencing,
  queueing vs rejection, cancellation, and failure/rollback decisions.
- **Integration tests next**: add a test-only lazy source that gates `load()`
  on a promise; run SampleView tests without launching the full App.
- **Run tests immediately after writing each test** using focused `vitest run`
  to keep feedback tight; run full `npm test` before final merge/ship.
- **Commits**: make small commits per step (types, pipeline skeleton, tests),
  ensuring each commit passes tests.

## Midpoint Review Checkpoint

Midpoint review was completed after the pipeline and ensure/processed hooks.

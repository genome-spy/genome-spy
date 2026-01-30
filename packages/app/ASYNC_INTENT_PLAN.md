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

## Step-by-Step Plan

1) **Types and specifiers**
   - Add a `BaseSpecifier` with `view`, `field`, and `domainAtActionTime`.
   - `LocusSpecifier` / `IntervalSpecifier` extend it and use x-scale domain.

2) **Async intent contracts**
   - Add a small `IntentPipeline` interface (or `AsyncIntentExecutor`) that
     accepts `submit(action|action[], options?) -> Promise`.
   - Define a minimal context object with access to `store`, `provenance`,
     `intentExecutor`, and a cancel signal.

3) **Intent status slice**
   - Add a Redux slice that tracks `status` (`idle`/`running`/`error`/`canceled`),
     `batchId`, `startIndex`, and `error`.
   - This enables the UI to offer "keep current state" or "rollback to
     pre-batch state" on failure.
   - Prefer a single top-level recovery action (e.g., `intent/recoverFromError`)
     whose payload chooses the behavior (`accept`, `rollback`). The root reducer
     can apply rollback via `jumpToPast(startIndex)` and clear the error status
     in one dispatch.

4) **Ensure by AttributeInfo**
   - Attribute availability is determined by `AttributeInfo` (SampleView-only).
     For view-backed attributes, use `ViewAttributeSpecifier` with
     `domainAtActionTime` (x-scale domain) and a `view` reference.
   - The intent pipeline resolves the attribute using the same resolver used by
     the action augmenter, then `await`s `ensureAvailability` when present.
   - Ensure semantics for view-backed attributes:
     1) make the view visible so its dataflow is wired,
     2) zoom the **x** scale to `domainAtActionTime` (or to a locus/interval
        derived domain if missing),
     3) wait for a data-ready signal (e.g., subtree data ready).
   - If an action has no attribute, it bypasses the ensure step.

5) **Processed/ready signals**
   - Implement a minimal "processed" awaiter: after dispatching an action, wait
     for a view/dataflow signal that indicates the action’s effects are applied
     and data are ready.
   - Start with a simple hook per view (e.g., `ensureAttribute` / `awaitReady`)
     that resolves when the relevant subtree has loaded.

6) **Queue and batch execution**
   - Ensure batches run strictly sequentially and stop on first error.
   - On error:
     - record `startIndex` from provenance,
     - update intent status to `error`,
     - allow the user to keep partial state or rollback to `startIndex`.
   - Concurrency rules:
     - If a single action is submitted while another single action is still
       processing, queue it (FIFO).
     - If a batch is processing, reject new submissions to avoid interleaving
       and preserve batch rollback semantics.

7) **Bookmark integration**
   - Continue to record intent actions in provenance (stripped of augmentation).
   - Bookmark restore runs through the async pipeline:
     - ensures lazy data,
     - replays actions sequentially,
     - yields to UI when appropriate.

8) **UI update debouncing (last)**
   - Implement only after bookmark replay is verified.
   - Add a render gate or debounced scheduler so UI updates are coalesced during
     batches while data loading proceeds immediately.
   - Default strategy: `queueMicrotask` for same-tick merges and
     `requestAnimationFrame` for frame-level coalescing.

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

After steps (1) Types and (2) Async pipeline are in place (but before wiring
ensure/processed hooks to SampleView), pause for a review:
- verify the queue/batch semantics,
- review the error state/rollback flow,
- confirm the testing strategy and readiness signal approach.

# Milestone 5: coherent synchronous propagation

Status: implemented and reviewed. Milestone 6 remains the domain simplification
experiment and decision gate; this foundation alone does not make the branch
merge-ready.

## Outcome and boundaries

Extend the existing `GraphRuntime` so graph computations, parameter-triggered
streaming replay, and downstream effects settle within one explicit synchronous
flush. Expose the small computed/effect surface through `ParamRuntime` and
`ViewParamRuntime`. Preserve streaming datum evaluation and the existing direct
subscription API while migrating Filter/Formula replay to the coherent boundary.
This is the foundation for milestone 6, not completion of the scale migration.

The concrete defects are direct expression subscribers observing width/height
halfway through a transaction, duplicate replays from transforms sharing an
upstream collector, and effects reading stale computed values after another
effect writes a source. Synthetic synchronous scale dependencies can also flush
inside the first listener before the rest of a notification has been scheduled.

Vega's settled-input operator model is the design precedent, not an implementation
to copy. A small keyed replay queue in the existing graph is preferable here to
representing streaming transforms or individual rows as reactive operators.

## Shared update contract

1. Source writes remain immediately readable. Direct subscribers retain their
   synchronous invalidation semantics; they do not promise coherent observations
   inside a transaction. Migrated observers use computed refs and effects.
2. A transaction batches graph work. Existing microtask scheduling remains the
   default; `flushNow()` after the outer transaction is the synchronous boundary.
   Notification fan-out also batches scheduling so a synchronous dependency does
   not flush halfway through its siblings. Scale notifications explicitly batch
   their full fan-out and flush before returning outside an enclosing transaction.
3. A flush drains ranked computeds, then queued streaming update jobs, then one
   effect. Return to stabilization before the next effect. A whole collector
   replay/fan-out is one job: graph consumers cannot observe partly replayed
   children. Jobs scheduled by invalidation coalesce by stable replay-root identity.
   Re-stabilize computeds after each job before processing further work.
4. An effect that writes a source starts another propagation round within the
   same flush. Earlier effects are not rolled back; an effect that produces data
   must use the update-job boundary if observers must wait for its publication.
   This is not a promise that arbitrary imperative side effects are simultaneous.
5. `whenPropagated()` includes queued replay jobs and their resulting graph work.
   It does not await network requests or future animation frames. Async source
   completion remains an external input governed by existing source protections.
6. Computeds have fixed, explicit dependencies and are initially evaluated once.
   Provide optional equality for derived arrays/objects; retain current identity
   equality by default. Expressions used per datum remain callable and are never
   eagerly evaluated with a dummy datum just to register replay dependencies.
7. Owners dispose computeds/effects and expression subscriptions. Queued replay
   work must ignore disposed roots and must not retain removed transform listeners.
   Binding replacement disposes old resources; declaration scope is independent
   of resource ownership. Do not add dynamic dependency discovery.
8. Existing initialization and scale-helper cycle checks remain. Detect runaway
   repeated work in a synchronous flush and fail with a useful diagnostic rather
   than hanging. This is a bounded feedback guard, not general static cycle proof.
   Preserve lazy `displace1d` bootstrap and its explicit deferred initial replay.

## Concrete implementation and deletion boundary

- `GraphRuntime`: add deduplicated update jobs to the existing flush loop; settle
  after each effect; batch runtime-source notification fan-out; optional computed
  equality and explicit disposal. No second scheduler or per-row graph nodes.
- `ParamRuntime` / `ViewParamRuntime`: expose unnamed, owner-bound computed refs,
  grouped effects, and update scheduling. Expressions expose their already-bound
  dependency refs so consumers can participate without another scope lookup.
- `FlowNode` / Collector / sources: identify the actual upstream replay boundary
  and enqueue its stable callback. Keep ordinary repropagation and async loading
  behavior available. Filter/Formula replace immediate replay listeners with
  queued invalidation; both still read their expression per streamed datum.
- `ScaleResolution`: batch notification fan-out using the shared runtime. This
  is a temporary integration boundary, not another domain policy. Milestone 6
  replaces the migrated domain callbacks with graph bindings.
- Architecture docs: distinguish direct invalidations from coherent effects,
  explain synchronous flush and streaming publication, and state unmigrated paths.

Milestone 6's binding sketch is resolved configuration/contributors → derived
candidate/readiness/reset/extent inputs → historical domain policy → target and
display publication → physical scale and calibrated dependents. Animation writes
display frames through that same boundary. Selection writes need explicit origin
that survives deferred graph propagation; the current stack-scoped echo marker
cannot simply be reused after moving its listener into an effect. Review and
implement a minimal linked-navigation/clear probe at milestone 6 before expanding.

The deletion ledger for that experiment includes configured-domain subscriptions,
collector-domain refresh callbacks, viewport cache invalidation callbacks,
resolution-driven notification ordering, and transition orchestration in the
resolution for the migrated path. Retain readiness/interaction history, cancellation
identity, normalization, and public API delegation only for their actual contracts.
Milestone 5 cannot claim those deletions yet.

## Verification and delivery

- Graph tests: nested transactions and diamonds (including synchronous fan-out),
  grouped final values, effect writes, replay publication followed by derived
  values, stable equality, disposal, feedback failure, and propagation barriers.
- Runtime tests: expression dependencies retain declaration scopes; unnamed
  computed/effect ownership and teardown; no eager datum evaluation.
- Streaming integration: chained Filter/Formula and branching transforms sharing
  a collector, two parameters changed together, empty output, one replay per
  shared root, coherent sibling output when the replay publishes graph values,
  and disposal before queued work. Use the interval-filter and viewport signal
  example patterns with deterministic data.
- Regression suites: scales/calibration/selection, transform/lazy readiness,
  `displace1d`, dynamic lifecycle; then full unit, workspace TypeScript, lint,
  formatting. Real animation tests protect same-frame scale semantics. Browser
  domain experiments remain milestone 6 unless a regression needs reproduction.
- Subagent reviews this contract before implementation and the integrated shared
  runtime/dataflow result before commit. Resolve material correctness/KISS issues.
- Measure affected production code together (initial ten-file baseline: 5,316
  lines). Explain additions as foundation, not accomplished domain simplification.
- Tentative commit: `refactor(core): coordinate synchronous reactive updates`.

No grammar changes, new public padding feature, async latest-wins protocol,
general reactive-consumer migration, or removal of domain animations is included.

## Contract review

The subagent review approved the bounded design with two corrections: use
synchronous source loading capabilities so replay errors abort propagation, and
subsume queued descendant replays only when the ancestor publishes synchronously.
Dispatching an async reload cannot substitute for a pending collector replay.
A failed flush stops before pending observers and rejects propagation waiters,
with no row rollback. Retain computed/effect invalidations but discard replay
jobs and suppress the already scheduled microtask. The caller must resubmit
failed publication before flushing/observing; equal retry values must still
repair invalidated computed caches. Throwing computeds remain invalid for retry. Independent dataflow review also
required ancestor/descendant coalescing and full scale notification fan-out batching.

## Delivery record

- The existing graph now settles computeds and queued streaming publications
  before each effect. Source/scale notification fan-out batches scheduling;
  synchronous APIs and real domain transition/calibration tests remain intact.
- Filter/Formula invalidations enqueue the actual upstream replay root. Two
  chained or branching transform invalidations produce one shared replay, and
  an intermediate collector does not introduce a duplicate descendant replay.
  Async source requests leave cached descendant replay eligible. No per-row
  signal or computed node was introduced.
- Computed/effect facilities are exposed through the existing facades, expression
  dependencies retain declaration scope, and computed equality is configurable.
  Review fixed owner-disposer retention during repeated binding replacement,
  waiter abort-listener cleanup, and a cached replay retaining the first child
  runtime rather than the shared scheduler.
- Final shared-contract review also caught equal-publication retry corruption.
  Failed propagation now preserves invalidations, rejects its current waiters,
  and suppresses automatic resumption. Explicit retry and throwing-computed tests
  cover that boundary. No rollback or async generation protocol is claimed.
- Nineteen new regressions cover transactions/diamonds, effect-produced values,
  scope/equality/disposal, replay coalescing/publication, async dispatch, failure
  and retry. The focused runtime/replay run passes 51 tests. The existing lookup
  test now checks initial/reloaded output instead of counting calls to an async
  wrapper that synchronous replay intentionally bypasses.
- Full unit run: 461 test files passed, one failed; 3,947 tests passed, two failed,
  one skipped, two TODOs. Both failures were new stable-order assertions in
  concurrently edited `utils/topK.test.js`, outside this milestone's changes.
  All scale, parameter, streaming, lazy/bootstrap, App, shared-example, and
  rendering suites in that run passed. Workspace TypeScript and repository lint
  passed. Formatting and diff checks passed for this delivery.
- Twelve affected production files total 5,449 → 5,721 lines (+272), including
  facade methods and lifecycle/failure contracts. This is foundation growth;
  domain responsibility removal remains milestone 6's explicit acceptance gate.
  No timing improvement is claimed; replay-count tests demonstrate avoided work.
- Architecture documents describe the adopted boundary and its limits. Grammar
  docs and the filter/formula/viewport/linked-selection examples retain their
  existing behavior. No browser experiment was needed for these headless
  propagation contracts; actual domain integration remains milestone 6.

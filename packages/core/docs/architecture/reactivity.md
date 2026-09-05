# Parameters, Expressions, and Reactivity

## Runtime

- Each view owns a `ViewParamRuntime`
  (`src/paramRuntime/viewParamRuntime.js`) backed by shared `ParamRuntime`
  internals.
- `src/paramRuntime/` separates graph scheduling, scoped parameter storage,
  expression binding, and owner-lifecycle disposal.
- DAG propagation is transaction-aware through `runInTransaction` and provides
  `whenPropagated` as a deterministic synchronization barrier.

### Coherent synchronous updates

`ParamRuntime` and `ViewParamRuntime` expose owner-bound anonymous `signal` refs, `computed` refs and
`effect` callbacks with explicit dependencies. Expressions expose their bound
dependency refs, retaining the declaration's lexical scope even when a different
owner holds the computation. Computeds evaluate initially; effects first run on
change. Computeds use identity equality by default, with an optional comparator
for values such as domain arrays. Explicit disposal unregisters owner cleanup as
well as dependencies, allowing bindings to be replaced in long-lived scopes.

Direct ref/expression subscriptions remain synchronous invalidation callbacks.
They may observe intermediate writes within a transaction; use graph effects
for coherent observation. A flush stabilizes ranked computeds, runs queued
streaming publication jobs, and then runs one effect. After each job or effect,
newly invalidated work settles before the next observer. An effect's writes start
another round; arbitrary imperative effects are not collectively atomic.

`runInTransaction` batches until the outermost transaction exits. Call `flushNow`
after it when propagation must finish synchronously; otherwise the existing
microtask flush applies. Runtime-source and scale-notification fan-out batch graph
scheduling, preventing synchronous subscribers from flushing before their sibling
dependencies are notified. Source completion and collector replay batch the full synchronous fan-out.
Domain commands request a synchronous flush at the enclosing transaction exit;
ordinary parameter-only transactions retain their microtask scheduling.

Filter/Formula parameter invalidations enqueue a stable callback for their actual
upstream collector/source. Shared roots coalesce, and an ancestor's synchronous
replay subsumes pending descendant replays. The entire replay/fan-out finishes
before graph effects consume published values; expression evaluation per datum
remains streaming. Async reload dispatch cannot subsume a cached descendant's
replay. `whenPropagated` includes synchronous replay and resulting graph work,
but excludes network completion and future animation frames.

A failed flush rejects current propagation waiters and stops automatic flushing.
Pending computed/effect invalidations remain, while queued publication jobs are dropped. Caller-owned cleanup hooks discard their
pending commands; cleanup must not retry or publish during failure handling.
There is no row rollback: callers must resubmit failed publication before explicitly
retrying propagation/observation. Retaining invalidations lets an equal-value retry
repair computed caches. Repeated non-settling work has a bounded error diagnostic;
existing initialization and scale-helper cycle checks still apply.

Domain inputs for all scale kinds bind configured expression dependencies, contributor
accessors and viewport topology when the bindings change. Candidate jobs use the
same runtime queue as streaming replay. `DomainRuntime` publishes physical scale
mapping and a stable native displayed-domain ref; calibrated expressions consume
that ref instead of a synthetic event dependency. Source/selection/zoom inputs
settle before terminal domain notifications and rendering. Viewport debounce and
coverage remain explicit input policy, with immediate initial calibration.

Initial reference collection remains provisional throughout synchronous publication.
A finalization job runs after all domain jobs and before observer effects, changing
only the historical phase to ready. This makes reversed contributor/calibration
order independent of initial zoom references. Later observer-authored writes start
another propagation round. Source bindings discard queued snapshots on replacement;
public navigation survives binding changes. Readiness still excludes future network
responses and is distinct from coverage of the current viewport.

Scale-kind differences are limited to candidate conversion and policy: index/locus
interval conventions, assembly defaults, and categorical ordering. There is no
second domain subscription or refresh path. Pure domain readers serve bootstrap
and unbound data-domain queries; they do not cache lifecycle state. Unrelated
reactive consumers and asynchronous loading remain outside this synchronous contract.

The design draws on Vega's explicit dependency-driven signal model and
fine-grained systems such as Preact Signals, particularly batched updates and
localized subscriptions. GenomeSpy uses its own purpose-built runtime rather
than embedding either runtime.

## Scope model

- Each `ViewParamRuntime` creates an internal `ScopeId` linked through
  data-parent ancestry.
- Resolution is lexical: the nearest scope wins and lookup then walks the parent
  chain, allowing child scopes to shadow names.
- Selector/import scopes used by view and parameter selectors and provenance
  keys are a separate addressing system. They do not participate in runtime
  parameter-value resolution.

## Expressions and propagation

- `vega-expression` parses and compiles expressions, which generated accessors
  bind to parameter values.
- Expression changes may request a render, re-propagate dataflow for transforms
  such as `filter` and `formula`, or reload URL-backed sources.
- `activateExprRefProps` converts expression-reference properties into getters
  and batches their updates through microtasks.
- Scale-dependent parameters reserve scoped names during view construction and
  materialize real derived refs on demand. Pending declarations shadow ancestor
  names without exposing placeholder values.
- New scale resolutions defer expression binding until initialization. Hierarchy
  finalization initializes scales before remaining pending parameters; domains
  are readable before range binding, allowing a domain-derived parameter to
  control a range. Live member changes retain their preflight validation.
- Selection/viewport domain metadata queries do not evaluate ordinary domain
  expressions. Parameter initialization and scale helper guards reject recursive
  initialization without introducing another runtime dependency scheduler.
- Domain publications install state and mirror the physical display before
  synchronizing linked selections and zoom-level inputs. `domain()` observes
  intermediate frames, so calibrated domains settle before rendering.
  ExprRef domains update immediately by default; opting into transitions on an
  initialized zoomable scale preserves its navigated display.
- Selection ingress captures the exact scoped outgoing object before deferred
  processing. Own echoes preserve animation; nested external writes and equal
  external clears remain authoritative. Own echoes cannot subsume data changes.
  Cancellation invalidates retained frame callbacks and completion promises.

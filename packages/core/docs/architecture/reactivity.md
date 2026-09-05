# Parameters, Expressions, and Reactivity

## Runtime

- Each view owns a `ViewParamRuntime`
  (`src/paramRuntime/viewParamRuntime.js`) backed by shared `ParamRuntime`
  internals.
- `src/paramRuntime/` separates graph scheduling, scoped parameter storage,
  expression binding, and owner-lifecycle disposal.
- DAG propagation is transaction-aware through `runInTransaction` and provides
  `whenPropagated` as a deterministic synchronization barrier.

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
- Domain commits install owner state and mirror the display before synchronizing
  linked selections and notifying dependents. `domain()` observes intermediate
  animation frames, so calibrated expression domains settle before rendering.
  ExprRef domains update immediately by default; opting into transitions on an
  already initialized zoomable scale preserves its navigated display.
- Two-way selection synchronization marks the exact outgoing object during the
  synchronous parameter write. Its own echo preserves an active transition;
  nested external writes remain authoritative. Effects validate display/transition
  identity so benign echoes cannot suppress a required notification or animation.
  Cancellation also invalidates retained callbacks and promise completions.

# Reactive Expression-Property Batching Plan

## Context

[Issue #512](https://github.com/genome-spy/genome-spy/issues/512) follows the
reactive-runtime work in #508 and #510. `activateExprRefProps` still coordinates
property notifications with a changed-key set, scheduling and cancellation
flags, its own microtask, and an optional `whenPropagated` barrier with a
failure fallback. This duplicates the transaction-aware scheduling already
provided by `GraphRuntime` computeds and effects.

The helper currently serves sequence and URL sources, several lazy genomic
sources, and reactive grid-child legend disabling. Nested URL-template
expressions use a separate direct-subscription loop in `urlDescriptor.js`.

## Goals

- Represent a related group of expression-valued properties as one graph-native
  computed value with explicit expression dependencies.
- Notify its consumer once through an owner-bound graph effect after synchronous
  graph and streaming work has settled.
- Preserve lexical expression scope, datum-free evaluation, initial values,
  changed-key reporting, disposal, synchronous source publication, and
  asynchronous latest-wins loading.
- Suppress notification when repeated writes settle on unchanged effective
  property values.
- Avoid creating graph nodes when a listener has no expression-valued inputs.
- Remove the superseded microtask, barrier, flags, and failure fallback with a
  net reduction in production source lines.

## Non-goals

- Do not add new reactive grammar properties.
- Do not bring network completion, lazy coverage, animation convergence, or
  other asynchronous lifecycle state into `GraphRuntime`.
- Do not introduce a generic property-binding framework or a new scheduler API.
- Do not change source-specific reload policy, descriptor-handle replacement,
  or debouncing behavior except where required to adopt graph scheduling.
- Do not make direct expression subscriptions coherent for unrelated callers;
  they remain synchronous invalidation callbacks by contract.

## Current contracts and caller audit

- `SequenceSource` reloads synchronously for changes to any expression-valued
  sequence property. Its `start`, `stop`, `step`, and `as` properties form the
  representative coherent group.
- `UrlSource` dispatches an asynchronous reload. Its existing load identifier
  rejects stale parsing and publication; network completion remains outside the
  synchronous graph flush.
- `BigBedSource`, `BigWigSource`, and `TabixSource` select reinitialization or a
  current-domain reload from the changed-key set. Existing abort and descriptor
  state continue to own asynchronous replacement.
- `BamSource` currently reacts only to `windowSize`, although its activated
  `url` and `indexUrl` getters may change. Dynamic BAM handle replacement has no
  established contract and will not be added by this refactor. BAM therefore
  does not contribute nested descriptor expressions to its activation group.
- `gridChildLegends.js` reacts only to `disable`; `orient` remains an explicitly
  initialization-only expression.
- `MockLazySource` is a testing-only source that directly watches nested URL
  expressions. It must migrate to the grouped activation path so removal of the
  old watcher does not break lazy readiness and side-input fixtures.
- Nested URL-template expressions have the same settled-notification need as
  top-level URL properties and do not justify a direct-subscription exception.

## Key decisions

### One grouped computed and one effect

For each activated object, compile its expression properties in the declaration
scope, union their exposed dependency refs, and create one owner-bound computed
whose value is an index-aligned array of evaluated property values. Use shallow
identity equality so the computed publishes only when at least one effective
value changes.

Activated getters read the corresponding cached array entry. A single effect on
the grouped computed compares the newly published array with the previous one,
constructs the changed-key set, and invokes the existing listener. This keeps
the public helper shape and source callbacks while moving their consistency
boundary into `GraphRuntime`.

The no-listener path remains a direct expression getter. It needs neither
notification nor graph batching and retaining it avoids unnecessary graph
nodes. A listener with no expression bindings likewise returns the copied
literal properties without creating a computed or effect.

The helper's runtime contract becomes explicit: `createExpression` must return
functions with `dependencies`, while `computed` and `effect` provide the group
and notification nodes. Update the local JSDoc types and replace lightweight
test mocks that implement only `createExpression` or `watchExpression`. Do not
retain a compatibility fallback to direct subscriptions.

### Use an effect, not an operation

Reloading a source and invalidating layout are external actions that may publish
more work. They belong in a terminal effect. `operation` is reserved for
applying an owned resource configuration before publishing its producer ref and
forbids observer notification during application.

### Fail closed on propagation errors

A failure in upstream computed or streaming work does not invoke the property
listener. The graph retains that upstream invalidation and the still-queued
property effect for an explicit retry, following the existing `GraphRuntime`
contract. Remove the current fallback that calls the listener after
`whenPropagated` rejects because it can expose a state from a failed generation.

An exception thrown by the property listener itself has a different existing
contract: `GraphRuntime` has already dequeued the effect, so `flushNow()` does
not rerun it. A later distinct dependency change may enqueue it again. Preserve
and test this distinction rather than expanding `GraphRuntime` retry semantics
as part of this simplification.

### Reuse the grouped path for nested URL expressions

Allow `activateExprRefProps` to receive a small optional list of additional
keyed expressions that affect an existing top-level property. Reloadable URL
sources and `MockLazySource` pass the nested `url.values` expression as another
`url` binding. The helper includes these dependencies in the same computed and
reports the top-level key if either its own or its nested effective value
changes.

This makes each source's one activation group cover ordinary source properties,
top-level `url`/`indexUrl` expressions, nested URL-template values, and properties
such as Tabix `addChrPrefix`. Remove `watchUrlDescriptorExpressions` and its
controller wiring instead of creating a second computed/effect pair. Descriptor
normalization continues to evaluate the source's resolved URL shape when the
single async reload is dispatched.

Do not pass additional descriptor expressions from `BamSource` or other sources
without an existing dynamic descriptor-reload contract. Retain their current
initialization-only effective behavior and cover the exclusion with a regression
test.

### Preserve lifecycle ownership

Graph nodes remain owned by the declaration's `ViewParamRuntime` scope. Also
register their explicit disposers with a source or legend when that consumer can
end before the view scope. Disposal must remove pending effects before they can
notify and remain idempotent when both ownership paths eventually dispose.

## Alternatives considered

- **Keep the barrier and simplify its flags:** This would retain a second
  scheduler and the extra promise continuation without providing graph-native
  equality or ordering.
- **Create one computed and effect per property:** This would still require
  another changed-key accumulator and would evaluate a logical configuration as
  independent graph nodes.
- **Use one direct effect over the raw expression dependencies:** This could
  coalesce notifications but could not detect unchanged effective values or
  provide settled cached getters without recreating comparison state.
- **Add a reusable reactive-property framework:** The existing computed and
  effect primitives already express the required contract. A framework would
  increase surface area and work against the simplification goal.
- **Create a separate URL expression group:** This would replace direct
  subscriptions but still allow one transaction to dispatch twice when a
  top-level source property and nested template value change together. Keyed
  additional expressions keep one source-level consistency boundary.
- **Migrate only `SequenceSource`:** This would prove the timing but leave the
  helper's scheduler in place for identical callers. Updating the shared helper
  removes the duplicated mechanism wherever the same contract applies.

## Source-line budget

The existing helper is approximately 100 nonblank physical lines, including 51
lines in its local scheduling block. This is only a planning estimate. The
implementation must use `scripts/count-production-lines.mjs` against
`origin/master` for the final count and satisfy a net production change of zero
or less.

The primary production count includes changed `.js` runtime files under
`packages/core/src`, excludes tests and `.d.ts` declarations, and reports added,
deleted, and net parser-token lines. Report declaration changes separately if
the implementation touches them.

Expected budget:

- Delete the local scheduling block and `batchMode`/`whenPropagated` plumbing.
- Replace it with approximately 25--35 lines for grouped expression binding,
  shallow equality, changed-key derivation, and disposer registration.
- Remove the production `batchMode: "whenPropagated"` arguments.
- Remove the direct nested URL-expression watcher and controller wiring after
  folding its keyed dependencies into the source's activation group.
- Replace, rather than append to, the architecture description.

Test code should also remain at or below its current size where practical by
consolidating overlapping helper scheduling tests and replacing the obsolete
failure-fallback test with the new failure/retry contract.

## Milestone: Replace property-local scheduling

### Intended outcome

`activateExprRefProps` and nested URL descriptor expressions publish coherent,
effective property changes through `GraphRuntime`. No helper-owned scheduling or
barrier machinery remains, and all existing consumers retain their documented
source or layout behavior.

### Affected areas and downstream consumers

- `packages/core/src/paramRuntime/paramUtils.js`
- `packages/core/src/data/sources/urlDescriptor.js`
- `packages/core/src/data/sources/urlDescriptorController.js`
- `packages/core/src/data/sources/lazy/mockLazySource.js`
- Sequence, eager URL, BAM, BigBed, BigWig, and Tabix source construction
- Grid-child legend activation and layout reflow
- Parameter-runtime, sequence-source, URL-descriptor, eager URL, and applicable
  lazy-source tests
- `packages/core/docs/architecture/reactivity.md`

### Verification

- Extend helper tests for multiple dependencies, repeated writes, nested
  transactions, unchanged final values, exact changed keys, and disposal before
  notification.
- Verify that listener-plus-all-literal input creates no graph work.
- Replace the rejected-barrier fallback test with two focused failure tests:
  upstream failure leaves the property effect queued for one coherent callback
  after explicit successful retry, while a listener exception is not rerun by
  `flushNow()` and requires a distinct later dependency change.
- Cover eager initial evaluation explicitly, including a deferred parameter, a
  scale-helper expression during source construction, and an expression that
  fails initial evaluation. The graph-bound listener path intentionally
  validates its full initial property group during activation and does not call
  the listener for that initial snapshot.
- Complete the existing `SequenceSource` reactivity TODO. Change `start`,
  `stop`, and `step` in one transaction, assert one synchronous reload, and
  assert that the collector contains only the final sequence.
- At the sequence consumer level, change an upstream parameter without changing
  its evaluated value and assert that the source does not reload.
- Cover nested URL-template repeated writes and a mixed transaction that changes
  nested `url.values` together with a top-level URL-affecting property. Assert
  one settled reload request and retain existing eager URL stale-load,
  stale-parser, and disposal race tests.
- Migrate `MockLazySource` to the keyed grouped activation path and retain its
  lazy readiness, delayed publication, and side-input integration coverage.
- Verify that changing a nested BAM URL-template expression does not trigger
  reinitialization; dynamic descriptor replacement remains outside this plan.
- Retain representative lazy source tests for descriptor replacement,
  ready-empty results, cached descriptor restoration, and current-domain
  reloads.
- Verify grid-child legend `disable` still requests layout reflow and does not
  notify after legend disposal.
- Verify source or legend disposal before a queued flush, later view-runtime
  disposal, idempotence of both ownership paths, and no late callback.
- Run focused Vitest suites with the `agent` reporter, Core TypeScript checks,
  and repository lint. Run the full unit suite because the helper is shared by
  all reactive data-source implementations.
- Run the production-line counter with `origin/master` as the base and
  `packages/core/src` `.js` runtime files as the primary scope. Reject the
  implementation if the reported net increases.

### Documentation and migration

Replace the architecture statement that says `activateExprRefProps` batches
through microtasks with its grouped computed/effect contract and explicit
failure behavior. No user-facing documentation or migration note is required
because the grammar and supported async source semantics do not change.

### Tentative commit

`refactor(core): schedule expression properties through reactive graph`

## Review gate

Review the shared helper contract and all downstream consumers together. In
particular, verify that synchronous `SequenceSource` publication rejoins the
current graph flush, asynchronous URL work remains merely dispatched by the
effect, changed-key routing still selects the correct lazy-source action, and
scope plus consumer disposal cannot produce a late notification.

## Final integration verification

After focused tests, exercise a real specification with a parameterized sequence
source and one with parameterized URL-template values. Confirm that a grouped
interaction produces one coherent synchronous sequence update, URL replacement
preserves latest-wins publication, and subsequent zooming still triggers lazy
coverage through the existing debounce and abort paths. No renderer-specific
change is expected, but a normal WebGL render of the updated data must complete
without a delayed extra reload or layout pass.

## Risks

- Group computeds evaluate their initial snapshot eagerly. Current listener
  callers will therefore validate every reactive property during activation,
  rather than only when its getter is first read. This is an accepted fail-fast
  contract for the graph-bound path; the no-listener getter path stays lazy.
- Getters return the settled cached value during an open transaction instead of
  exposing an intermediate direct-ref value. This is intentional; outside a
  transaction, synchronous dependencies must still settle in the same frame.
- An expression returning a new array or object identity remains changed even
  when structurally equal. This matches existing graph identity equality and
  avoids introducing property-specific deep comparison policy.
- A synchronous source listener that throws becomes a graph effect failure. It
  is visible to the caller but is not retried by an otherwise empty
  `flushNow()`; only a later distinct dependency change schedules it again.

## Unresolved questions

- Should dynamic BAM `url` and `indexUrl` replacement become a separately
  specified feature, or should those properties be made initialization-only?
  This plan preserves the current behavior either way.

## Acceptance criteria

- A transaction changing multiple expression properties yields one listener
  call with a coherent final property group and exact changed keys.
- Nested transactions and repeated writes are deduplicated; an unchanged final
  property group produces no callback.
- Disposal or replacement before a flush prevents notification.
- An upstream propagation failure produces no property callback; an explicit
  successful retry observes the retained final change once. A listener failure
  follows the existing dequeued-effect contract and is not retried by an empty
  flush.
- `SequenceSource` reloads once and publishes only final rows for a grouped
  parameter update.
- Eager and lazy URL sources retain latest-wins, abort, readiness, and
  current-domain semantics; network completion is not included in
  `whenPropagated`.
- The helper creates no graph nodes for an all-literal property object.
- One source-level group coalesces top-level and nested URL-affecting expression
  changes into one reload request.
- `MockLazySource` uses the same group, while BAM descriptor expressions retain
  their current non-reactive replacement behavior.
- The helper contains no local microtask, barrier, scheduling flag, or failure
  fallback, and nested URL expressions do not retain a parallel watcher.
- Non-comment production SLOC is unchanged or reduced.

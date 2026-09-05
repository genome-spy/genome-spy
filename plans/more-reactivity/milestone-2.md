# Milestone 2 — Declared side-input publication

Status: implemented and verified, 2026-09-06. This document expands M2 in
[next-refactors.md](next-refactors.md).

## Goal and boundaries

Make declared foreign collector dependencies drive observation, primary replay,
and consumed-revision readiness for lookup and cross. A transform author should
supply the relation and its local cache/coverage policy instead of independently
implementing subscription lifetime, replay scheduling, and freshness accounting.

Keep streaming rows and complete replay through FlowNodes. There will be no
incremental tuple processing, pulse objects, per-row reactive nodes, tuple diffs,
or added/removed/modified row sets. GraphRuntime coordinates publication jobs;
it does not execute relational algorithms. This follows the separation selected
in the [architecture proposal and research](more-reactivity-plan.md).

Preserve schemas, lookup defaults and errors, Cartesian-product semantics, batch
identity, lazy coverage, and source loading policy. Do not broaden M2 into URL
request generations (M3), a universal scheduler, or cross-source atomic snapshots.

## Current implementation and specific duplication

- `data/flowNode.js` declares `dataDependencies` for readiness traversal and owns
  `requestRepropagate()`. That method queues the actual optimized `replaySource`,
  coalesces requests, and lets synchronous ancestor replay subsume descendants.
- `data/collector.js` materializes output and notifies observers on completion.
  Its completion currently propagates rows and descendant completion before
  incrementing `dataRevision`, invalidating domains, and notifying observers.
  Its cached replay deliberately retains `dataRevision` and still notifies.
- `data/transforms/lookup.js` owns a foreign observer, primary-completed state,
  consumed revision, and readiness override. Its indexed handler separately tracks
  the evaluated/index revision. Self lookup buffers complete batches; coordinate
  lookup supplies availability, request, batch preparation, and row filtering.
- `data/transforms/cross.js` duplicates foreign observation, primary-completed
  state, consumed revision, readiness checks, and immediate primary replay.
- `data/dataReadiness.js` traverses optimized primary ancestry and side edges.
  `view/dataReadiness.js` waits on output/dependency collectors and lazy coverage.
  Neither should acquire a second graph or assume view ownership is data ancestry.

Both foreign observers currently call immediate `repropagate()`. M2 should use the
existing queued replay path, not merely move those callbacks into another class.

## Publication contract

1. **Declaration and ownership.** A foreign collector is declared once per consumer.
   Normalize duplicate collectors by object identity once when binding; observe
   each once. The same declaration supplies readiness traversal and observation. Bind after
   construction and graph optimization through the graph initialization lifecycle;
   do not read subclass private fields from the FlowNode constructor. Dispose the
   observation with the consuming node. Self lookup declares no foreign edge.
2. **Invalidation.** On foreign publication, invalidate only the local state that
   depends on that publication and request primary replay if primary input has
   completed. Readiness becomes false immediately when an input is pending or its
   current revision differs from the revision consumed by completed output.
3. **Replay.** Resolve the replay root through the actual optimized primary path.
   Queue its stable callback through `requestRepropagate()`. Multiple consumers or
   parameter changes sharing that root must not independently replay it. Retain
   the existing distinction between synchronous cached replay and async reload.
4. **Consumption.** Capture the foreign revision actually used at the first
   successful batch/index preparation; never read the latest revision at completion
   and assume it was consumed. No per-row allocation or revision lookup is needed.
   Clear this publication's consumption state on reset. If the dependency changes
   before completion, the output cannot certify the newer revision.
5. **Empty output.** A completed empty primary can certify an available foreign
   revision without constructing an index. Pending or skipped coordinate input
   cannot use this shortcut. Empty foreign relations are successful publications:
   lookup applies its existing defaults and cross produces ready-empty output.
6. **Completion visibility.** Validate availability and consumed revisions before
   propagating successful downstream completion. Downstream domain/readiness
   observers must never see output as fresh for an unconsumed side revision.
   Pending lazy output may still complete its current (possibly empty) stream;
   `completed` and fresh `isDataReady()` remain different facts. Do not suppress
   terminal completion notifications needed to recheck waits. A failed computation
   must not advance its freshness record. No row rollback or automatic retry is
   introduced.
7. **Settled observation.** Direct collector observers remain invalidation callbacks
   and may see pending output. Coherent consumers and `whenPropagated()` observe
   the completed synchronous replay. Network completion and future viewport
   requests remain outside that barrier.

A callback with unchanged `dataRevision` is not automatically a new relation.
Avoid redundant index rebuilding/replay when consumed output is already current,
but do not suppress an outstanding pending/coverage transition solely because the
revision number is equal. Test cached replay notification separately from new
collector publication.

### Publication classification and coverage

The binding accepts a transform-owned `isAvailable()` predicate in addition to
collector revisions. Eager consumers use collector completion; coordinate lookup
uses its existing current-domain coverage predicate. It also records whether the
last completed primary publication was accepted or skipped/pending. This is
publication-level state, not a second relation revision or tuple change set.

On a side callback: a changed revision invalidates relation caches; an unchanged
revision with already-accepted output and currently satisfied availability does
nothing. Unchanged revision with a previously pending publication and now-satisfied
availability requests primary replay without rebuilding an unchanged keyed index.
If availability is still false, remain pending and let coordinate lookup retain
request policy. Batch preparation must always refresh loaded-domain bounds even
when the keyed index can be reused. Readiness checks evaluate availability as well
as consumption; a viewport change must not wait for a collector callback to make
an old coverage result stale. Existing viewport/request paths provide the next
publication notification; M2 adds no new coverage event or generation counter.

### Ordering independent replay roots

Primary-tree depth is insufficient when parameter changes enqueue both an
auxiliary branch and its consumer. For example, a primary root queued first can
otherwise publish using foreign revision N, then replay again after the auxiliary
root publishes N+1. The final values may be right while the one-replay contract
and observer timing are wrong.

Extend the existing streaming job selection with bounded replay prerequisites:
for a pending primary replay, pending jobs that produce its declared side
collectors run first. Derive those prerequisites from the optimized FlowNode
parent/side edges and stable replay callback identities; deduplicate shared roots.
Do not use arbitrary numeric priority offsets or create another queue. Preserve
current ancestor subsumption within primary branches. Before executing a consumer,
recheck pending prerequisites because earlier jobs can enqueue more work. Report
an unsupported dependency cycle rather than spinning through repeated deferrals.
The implementation can keep this metadata on replay jobs; generic computed-node
scheduling and per-row processing need no changes.

This ordering concerns synchronous publications already queued in the same flush.
Dispatching an async reload is not equivalent to publishing its result: do not
block the synchronous barrier on network work or certify new data. Preserve the
current pending-source skip/loading policy and replay on actual completion. Side
callbacks run only after the foreign collector has installed its completed
relation and revision. Prove this with both enqueue orders and with parameterized
unary transforms on auxiliary branches, not only manual collector completion.

Multiple lookup/cross consumers can occur sequentially on a primary path, but
`view/flowBuilder.js` rejects side-input transforms inside auxiliary pipelines.
Preserve that restriction. Do not add support for nested auxiliary joins or
arbitrary cyclic FlowNode graphs to satisfy a synthetic test.

## Concrete implementation shape

Implement one small owned side-input binding, tentatively
`data/sideInputBinding.js`, integrated with FlowNode lifecycle. Prefer one binding
for a node's declared collector list over one runtime per dependency. Nodes with
no side inputs should allocate no binding and retain their current hot path.

The binding owns subscription disposers, primary-publication state, and consumed
revision records. It exposes narrow batch/publication operations: invalidate on
side completion, record the inputs used, reset consumption, finalize consumption
before downstream completion, and answer whether completed output is current.
Method names are provisional; these responsibilities are the acceptance contract.
`FlowNode.dataDependencies` must remain the single source of side-edge identity.
Do not maintain a second transform-specific list with independent ownership.

The transform supplies cache invalidation, `isAvailable()`, and whether this publication actually
used available foreign data. Keep the following local:

- Lookup's keyed index, implicit output-field discovery, cached writer, cloning,
  and evaluated index revision. Retain the minimum index-version information
  needed for correctness; remove the duplicate consumed-output revision tracker.
- Cross's foreign row materialization, homogeneous-field validation, field
  collision checks, and per-batch combiner.
- Self lookup's buffering and final batch flush, without binding a foreign input.
- Coordinate lookup's request dispatch, loaded-domain bounds, coverage predicate,
  and row acceptance. The generic binding must not request genomic intervals.

Use existing `initializeOnce()` for wiring after topology is established
(`data/flowInit.js` initializes after optimization and handle synchronization); inspect
all direct-construction tests and initialize their graphs explicitly where needed.
Do not add a production fallback scheduler for fixtures without a runtime.
Binding only subscribes and records identities: it must tolerate either primary
or auxiliary source initializing first, without reading unavailable rows. Verify
consumer disposal removes the subscription before auxiliary pruning releases its
collector (`view/flowBuilder.js`, `data/dataFlow.js`). Use the existing disposal
path, not duplicate teardown registered in both objects.
Supported view subtree attachment must wire new consumers, while disposal must
remove observers without cancelling replay still needed by a sibling consumer.
M2 does not add arbitrary live replacement of a transform's side-edge list.

### Collector ordering decision

Audit collector publication before changing its revision order. The observable
contract is that the revision identifies the relation actually available to a
consumer. First establish whether a dependency can be on primary ancestry in graphs the
builder and optimizer actually produce. If so, descendant processing must not
stamp the previous revision just before the collector advances it. If not, retain
that supported-topology boundary and do not add recovery for a hand-built graph.

Prefer preserving collector ordering if the binding can certify the correct
published relation without a special-case replay. If a revision must move earlier,
write a representative ancestry/publication regression first and publish the
revision only after collector preparation succeeds. Verify downstream exceptions,
readiness, domain subscribers, and observer ordering; do not treat an early
revision as proof that every descendant completed. Resolve this choice within M2
before its review gate, with one revision contract rather than compensating flags.
Record the expected timeline: relation prepared → revision exposed to consumers →
primary consumption recorded → output completion/domain observation. Tests must
assert which revision each observer sees, not merely the final rows.

## Implementation slices within one milestone

- [x] Establish the owned declaration/publication contract in FlowNode and the
      small binding; cover an ordinary consumer and empty publication. Resolve the
      collector ancestry ordering case against actual optimized graphs.
- [x] Migrate cross and foreign lookup to the binding and existing replay queue;
      delete their observer/replay and consumed-output state. Preserve local cache
      specialization, batch boundaries, and eager validation.
- [x] Integrate coordinate lookup, self lookup, subtree lifetime, and readiness
      consumers. Complete cross-subsystem checks and update permanent architecture
      documentation. Review and deliver M2 as one coherent implementation commit.

## Verification matrix

Use behavioral tests beside the relevant implementation. Extend existing
`data/reactiveReplay.test.js`, `data/dataReadiness.test.js`,
`view/dataReadiness.test.js`, and lookup/cross/coordinateLookup suites.

| Scenario                                                   | Required observation                                                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Foreign ready before primary                               | First primary publication uses it without redundant replay.                                                                              |
| Eager nonempty primary before foreign                      | Preserve existing load-order errors; do not introduce buffering or fabricate readiness.                                                  |
| Lazy coordinate primary before coverage                    | Keep current pending/discard/request policy; later publication replays primary and becomes ready.                                        |
| Empty primary or foreign                                   | Correct empty/default rows, fresh consumption before domain notification.                                                                |
| Both inputs change in one transaction                      | Settled output uses both final publications; obsolete side callbacks do not trigger extra replay.                                        |
| Two side consumers share a replay root                     | One replay after invalidation; both outputs certify their actual dependencies.                                                           |
| Sequential primary consumers and supported shared ancestry | Correct order and revision attribution; no stale readiness or self-sustaining replay loop. Preserve rejection of nested auxiliary joins. |
| Cached foreign replay with unchanged revision              | No redundant work for an already-current consumer; pending availability is still reconsidered.                                           |
| Lookup parameter replay with unchanged foreign data        | Cached index remains valid; transformed output updates.                                                                                  |
| New foreign fields or cross schema                         | Index/writer/combiner refresh; existing collision and heterogeneous-field errors remain.                                                 |
| Failed preparation or replay                               | No fresh consumption record or successful waiter result; explicit retry follows existing runtime contract.                               |
| Disposal while replay is queued                            | No disposed output publication; shared surviving consumers still update.                                                                 |
| Inherited lookup and overriding data branch                | Only the real dependent path waits or replays.                                                                                           |
| Self lookup, facets, and file batches                      | Buffering, order, and batch identity remain unchanged.                                                                                   |
| Coverage changes and empty lazy completion                 | Publication readiness remains distinct from current viewport coverage.                                                                   |

For synchronous coalescing fixtures, provide an explicit runtime and flush/barrier;
do not accidentally depend on immediate foreign-observer recursion. Also test a
foreign publication while a primary root is pending an async reload: preserve the
existing skip/reload behavior and never certify a revision absent from output.

Verify domain extents after side replacement through the existing domain input
owner. Check `packages/app/src/sampleView/sampleView.js`
`ensureViewAttributeAvailability()` and its `awaitSubtreeLazyReady()` path through
their existing readiness APIs; add a focused App test only where Core tests cannot
establish the contract.
Inspect applicable App instructions before touching App code.

Browser integration: use `examples/docs/grammar/transform/cross/cross-heatmap.json`
and `examples/docs/examples/genomic-data/dynseq-spi1-bqtl.json` for Cartesian output
and lazy coordinate lookup. Confirm the actual transforms in each fixture, then
exercise foreign replacement and viewport movement with deterministic data where
remote responses would make an ordering assertion unreliable. Check WebGL, WebGPU,
and Canvas output, picking, and immediate SVG export after propagation; compare
semantic rows and resource revisions so equivalent final pixels cannot hide
redundant replay or upload. Run focused suites during iteration, then the full unit
suite, workspace TypeScript checks, and lint for the shared contract change.

## Size, documentation, and delivery gates

Baseline relevant production files: FlowNode 572, Collector 620, dataReadiness 51,
Lookup 513, Cross 185, CoordinateLookup 96 lines (2,037 total). Include new shared
code and every touched production file in the final comparison. Expect a net
reduction in duplicated coordination; if total size grows, explicitly justify it
and simplify before declaring the milestone successful. Do not move duplicate
branches into the binding and call that a reduction in complexity.

Update `packages/core/docs/architecture/views-and-dataflow.md` and the publication
portion of `reactivity.md` with declaration, consumption, observer timing, and
lifetime contracts. Add concise contributor JSDoc at the binding boundary. Public
schemas and documentation need no changes unless the implementation intentionally
changes observable transform behavior, which is outside this proposal's scope.

Review gate: optimized replay topology, collector revision ordering, pending/empty
publication, coordinate coverage, and downstream readiness/domain/App consumers.
No new generic abstraction is accepted solely to reduce lookup/cross line counts.
Tentative commit:
`refactor(core): coordinate side-input publication through data dependencies`.

## Luna plan review

Reviewed by a `gpt-5.6-luna` subagent on 2026-09-06. The review identified gaps
in equal-revision coverage handling, independent replay-root ordering, auxiliary
initialization/disposal, collector revision attribution, and duplicate dependency
identity. This revision incorporates explicit availability classification, pending
replay prerequisites, initialization-order and teardown rules, a revision timeline
gate bounded to supported topology, and identity deduplication. This section records the pre-implementation plan review; implementation evidence
is recorded below.

## Implementation outcome

Implemented through `SideInputBinding`, the existing FlowNode lifecycle, and
pending prerequisite callbacks in the existing GraphRuntime streaming queue.
Lookup/cross lose separate foreign observers, primary-completed flags, consumed
revision fields, and readiness overrides. Their relation caches and coordinate
coverage/request policies remain local. No collector revision reordering was
needed: the builder creates terminal auxiliary collectors and the optimizer merges
sources, not collectors into primary ancestry. The supported timeline remains
foreign preparation/completion → revision and side notification → queued primary
consumption → output completion/domain observation.

The implementation review checked synchronous side requests during primary
preparation, cached same-revision notifications, failed replay, both independent
root enqueue orders, shared surviving consumers after disposal, and downstream
App lazy readiness. A few manually driven tests now initialize side bindings and
wait for propagation instead of relying on recursive foreign-observer replay.

Verification: full unit suite passes, along with workspace TypeScript and lint.
New tests exercise both enqueue orders in a real built/optimized cross pipeline,
shared roots, ready-empty output, pending coverage, unchanged revisions, failure
and explicit retry, disposed subscribers, and cyclic publication prerequisites.
Existing lifecycle tests cover inherited Dynseq, overriding branches, and lazy
readiness; the browser fixture also uses the App's general lazy-readiness API.
Real cross-heatmap and Dynseq examples pass WebGL/WebGPU smoke and comparison runs.
Deterministic cross and lazy-coordinate browser fixtures pass WebGL, WebGPU and
Canvas: one simultaneous-input output publication, pending-to-ready viewport
replacement, correct rows, immediate SVG geometry, and picking of the new datum.
The cross fixture checks one collector revision increment; no new GPU upload path
was introduced or direct driver-level upload counts claimed.

Size gate: production changes add 179 and remove 115 lines (net +64), including
87 lines for the shared binding. Lookup/cross together shrink by 91 lines. The
expected overall size reduction was not achieved: independent-root ordering and
shared lifecycle/consumption semantics cost more than the duplicated transform
code removed. Simplification retained the existing queue and `completed` flag,
kept collector ordering unchanged, and avoided a new scheduler, generation system,
or tuple protocol. This growth is accepted for the tested publication-ordering
contract rather than presented as an overall code-size reduction.

# Unified Lazy-Request Lifecycle Plan

## Context

The descriptor-backed windowed sources currently implement one logical domain
load through three state-owning layers:

- `SingleAxisWindowedSource` owns window quantization, debounce placement,
  interval cancellation, loading status, and fetched-but-unpublished coverage.
- `UrlDescriptorWindowedSource` owns descriptor normalization, initialization,
  current-domain reloads, and the bridge between descriptor readiness and
  interval readiness.
- `UrlDescriptorState` owns descriptor revisions, active handles, active and
  published descriptor keys, and the pending handle cache.

`SingleAxisWindowedSource` has no production subclass other than
`UrlDescriptorWindowedSource`. The separation therefore does not currently
support two independent source families. Instead, one request crosses two base
classes and a state object while using both an abort controller and a revision
to reject stale work.

The three lifecycle components contain 314 non-comment production JavaScript
lines at the start of this branch: 124 in `SingleAxisWindowedSource`, 81 in
`UrlDescriptorWindowedSource`, and 109 in `UrlDescriptorState`. This excludes
the five concrete sources and their repeated handle-selection and publication
steps.

## Goals

- Represent descriptor resolution, handle acquisition, interval fetching,
  publication, coverage, and loading status as one window request.
- Use that request's abort signal as the stale-work boundary from the first
  asynchronous operation through publication.
- Remove the separate descriptor initialization lifecycle and its revision.
- Keep descriptor-keyed handle reuse, including shared pending construction and
  retry after failure.
- Preserve the two ordinary-source debounce modes and window quantization.
- Keep BigWig's debounce duration and last-domain-wins behavior while moving
  its handle-aware preparation under that debounce.
- Preserve readiness for the last published domain until its backing
  configuration is invalidated.
- Preserve empty successful publication, per-descriptor skip behavior, and
  Tabix's physical per-file batches.
- Delete `SingleAxisWindowedSource` and `UrlDescriptorState` rather than replace
  them with similarly sized abstractions.
- Reduce non-comment production SLOC substantially. The target is at least 80
  fewer lines in `packages/core/src/data/sources`; every implementation commit
  must independently reduce production SLOC or be rejected.

## Non-goals

- Do not move axes, legends, or other guides out of the data-source subsystem.
- Do not change guide-source behavior.
- Do not centralize domain and layout event ownership in the view layer.
- Do not change eager `UrlSource`, source sharing, flow optimization, collector
  replay, or subtree initialization.
- Do not add tile caching, request prioritization, concurrency limits, or a
  generic scheduler.
- Do not change URL grammar, data formats, window sizing, or configured debounce
  durations.
- Do not retain multiple published windows or introduce a tile pyramid.
- Do not add recovery for unsupported partial states merely to make a general
  request framework.

## Outcome

- Milestone 1 was completed in `c760c116b`: interval publication, coverage,
  and completion became one atomic boundary with a net production SLOC
  reduction.
- Milestone 2 was completed in `3f0362e67`: descriptor acquisition joined the
  interval request, revisions and initialization state were deleted, and one
  abort signal became the stale-work boundary.
- The final source API cleanup was completed in `f3bd9a4a3`: the surviving base
  became `IntervalUrlSource`, concrete setup boilerplate was removed, and the
  single-URL policy began using stable source labels.
- The review gate and acceptance criteria were completed. Focused lifecycle and
  source suites, the full unit suite, workspace TypeScript checks, lint, and the
  cumulative SLOC gate passed. The branch removes 133 non-comment production
  lines against `origin/master`.
- Representative browser smoke tests passed for BigWig, BigBed, indexed FASTA,
  and BAM. The remainder of the exhaustive browser matrix is discarded: its
  format and lifecycle contracts are covered by the full automated suite, and
  no renderer-specific behavior changed.
- No supported embed dependency on eager descriptor or header errors was
  identified. Those errors now intentionally surface on the first loadable
  interval request.

## Comparable design

deck.gl's `TileLayer` gives each load a stable tile identity and an
`AbortSignal`, keeps successfully loaded content in a separate cache, and tells
loaders not to cache aborted or incomplete results. Its viewport selection,
refinement, request queue, and multi-tile cache are intentionally outside this
plan. GenomeSpy loads one aggregate window at a time and publishes it through a
dataflow, so adopting a tile abstraction would add machinery rather than remove
it.

The relevant design lesson is narrower: cancellation belongs to the request
and must cover the whole asynchronous pipeline, while reusable content belongs
to a cache whose entries are independent of which request is current. The plan
uses that separation without copying deck.gl code. deck.gl and GenomeSpy are
both MIT-licensed, so the reference is license-compatible even though no code
adaptation is proposed.

References:

- https://deck.gl/docs/api-reference/geo-layers/tile-layer
- https://github.com/visgl/deck.gl/blob/master/LICENSE

## Current contracts

### Domain triggering and debouncing

`SingleAxisLazySource.activate()` starts domain and layout listeners only after
the shared source-loading lifecycle is active. This remains unchanged.

Windowed sources support two distinct debounce placements:

- `domain` debounces before quantization and window-change detection.
- `window` performs quantization on each domain event but debounces the actual
  load.

Both ordinary-source modes must retain their current timing. A configuration
replacement must still abort active work and invalidate readiness immediately,
before either debounce delay.

The unified lifecycle orders work as follows:

| Source path       | Before debounce                                   | Inside the debounced request                                                                                  |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Ordinary `domain` | Store the latest raw domain                       | Width gate, quantize, detect a changed window, acquire descriptors and handles, then load                     |
| Ordinary `window` | Width gate, quantize, and detect a changed window | Acquire descriptors and handles, then load the prepared interval                                              |
| BigWig `window`   | Store the latest raw domain                       | Acquire descriptors and handles, select reduction levels, derive and quantize the effective window, then load |

For ordinary sources, width rejection and quantization therefore happen before
descriptor work whenever the current mode requires it. A raw domain outside
`windowSize` performs no normalization, module loading, or handle construction.

BigWig currently acquires handles and prepares its effective window before the
load debounce. Preserving that exact internal ordering would require a second
abortable candidate-preparation lifecycle alongside the active load. This plan
instead moves the whole BigWig preparation under the existing `window` debounce.
With cached handles, network loading retains the same debounce delay and final
domain. On the first request, metadata acquisition begins after the delay rather
than before it. This is an accepted simplification and must be covered by a
rapid-domain test.

### Publication and readiness

`SingleAxisLazySource._lastLoadedDomain` describes the latest successfully
published batch. A completed fetch is not ready until its rows, including an
intentional empty result, have propagated and completed the dataflow.

Ordinary domain movement may leave the previous publication ready for domains
it still covers while a new window is pending. In contrast, changing a property
that affects the data content invalidates published coverage immediately.

`coordinateLookup`, subtree readiness, viewport-domain logic, and side-input
readiness consume this distinction through `ensureDataForDomain()`,
`getLoadedDomain()`, and `isDataReadyForDomain()`.

### Descriptor-backed sources

The shared lifecycle serves BAM, BigBed, BigWig, indexed FASTA, and Tabix. All
five support reactive URL descriptors. BAM and indexed FASTA require exactly
one resolved descriptor; the others may load several.

Descriptor fields are part of handle identity, while `onLoadError: "skip"` is
per-request loading policy. A URL-limit overflow is a successful empty source,
not an error status. A failed construction must not poison the cache, and
concurrent requests for the same handle identity must share construction.

BigWig can batch intervals across handles. BAM, BigBed, and indexed FASTA load
per chromosome. Tabix preserves one physical dataflow batch per source file and
publishes coverage only after all current batches complete.

BigWig is also the only source that must acquire handles before choosing its
window: reduction levels from those handles and the current axis length define
the effective window size. Unlike the ordinary sources, it does not reject a
raw domain merely because it exceeds a configured `windowSize`.

### Cancellation and disposal

Starting a newer interval aborts the older interval. Descriptor replacement
aborts interval work before normalization or handle construction can affect the
source. Aborted work must not publish, change status, clear current data, or
mark coverage ready. Disposal has the same terminal effect and also releases
the handle cache.

## Key decisions

### Keep one windowed base class

Move the required quantization, debounce, request, and descriptor-cache logic
into `IntervalUrlSource`, which will extend `SingleAxisLazySource`
directly. Delete `SingleAxisWindowedSource` after migrating its only production
subclass and tests.

Do not introduce a public `Request`, `Loader`, or lifecycle class. The current
request is a private plain record owned by the base source. Its essential data
is the requested interval and an `AbortController`; the controller's signal is
the request lease.

### One asynchronous request boundary

Replace the current sequence

1. initialize descriptors,
2. wait through `initializedPromise`,
3. select active handles,
4. start an independently abortable interval load,
5. return fetched coverage through `#loadedInterval`, and
6. let the concrete source publish and mark descriptors loaded

with one protected operation that owns the whole attempt:

1. abort the previous request;
2. create the new request signal and set loading status;
3. normalize the current descriptors;
4. acquire cached or newly constructed handles;
5. prepare the effective window using the raw domain and those handles;
6. split the prepared window into discrete chromosome intervals;
7. invoke the source-specific loader;
8. if the signal is still live, synchronously publish the result and its
   interval; and
9. set complete status only after successful publication.

Errors from a live request set error status and propagate. Errors from an
aborted request are ignored. A request publisher runs inside the same guarded
operation so there is no fetched-but-unpublished interval field.

The runner starts from the unquantized domain. The ordinary preparation path
enters only after width gating and, in `window` mode, quantization. BigWig starts
from the final debounced raw domain and performs handle-aware preparation inside
the same runner: it selects one reduction level per handle, derives the effective
window size from the axis length, and does not apply the ordinary "domain wider
than windowSize" rejection. The selected reduction levels travel only as
request-local load context.

The implementation may name this operation `runWindowRequest`, but the name
and callback shape are not compatibility contracts. Prefer one small protected
preparation hook that BigWig overrides over a general callback protocol. Choose
the smallest commit hook that accommodates both ordinary chunk publication and
Tabix's per-file batch publication.

### Make descriptor acquisition demand-driven

`setupUrlLoading` stores descriptor options and the handle factory but
does not start a parallel initialization promise. The first window request
normalizes descriptors and acquires handles. Later requests repeat cheap
normalization and reuse handle-keyed promises.

This intentionally makes invalid URL or header errors observable when a lazy
window is requested, rather than during construction of a source whose current
domain may be outside its configured `windowSize`. This matches the lazy-source
boundary and eliminates `initializedPromise` from `SingleAxisLazySource`.

Do not cache module-loader promises separately. Dynamic imports already cache
loaded modules, and a second cache would need its own rejection and disposal
policy. Measure before adding any such optimization.

### Separate cache identity from request currency

Keep a single `Map<handleKey, Promise<handle>>` in the windowed descriptor
source. The map answers only whether construction can be reused. It does not
describe the active request or published data.

The handle key combines `urlDescriptorKey()` with any source-specific input to
handle construction. Tabix includes the effective `addChrPrefix` value because
it changes `renameRefSeqs`; URL, index URL, and descriptor fields remain in the
descriptor key. Do not include `onLoadError`, because it is request policy and
does not change the underlying handle.

Cache the raw handle-construction promise. Apply `onLoadError: "skip"` around
that promise separately for each request. Thus concurrent strict and skipping
requests may share construction without a skip converting the strict request's
error into a cached `undefined` value.

Pending construction may complete after its requester is aborted and remain
reusable. It cannot publish because the request signal is checked after every
asynchronous phase and at the commit boundary. Failed construction removes its
own promise so a later request can retry. A skipped request does not alter the
raw cache beyond that ordinary rejection cleanup.

This separation makes the following `UrlDescriptorState` fields unnecessary:

- active handles;
- active keys;
- loaded keys;
- updating state; and
- descriptor revision.

Delete `UrlDescriptorState` and `updateUrlDescriptorState`; do not preserve a
compatibility wrapper.

### Invalidate content through the request owner

A reactive descriptor change performs one synchronous operation on the base:

- abort the current request;
- clear published coverage so the retained rows are no longer ready;
- reset window selection so the current domain is eligible; and
- schedule the current domain through the existing debounce path.

Retain the previous rows until the replacement publishes, as the current
sources do. Clear propagated rows only on the existing live-error and
over-limit paths; do not introduce an empty flash during ordinary replacement.

Properties such as BigWig `pixelsPerBin` that change the produced data use the
same invalidating reload entry point. A plain domain movement does not clear
still-covering published data merely because another request is pending.

Preserve immediate loading feedback for configuration replacement: the
invalidating reload sets status to `"loading"` before scheduling through the
debounce path. Initial descriptor setup is demand-driven and sets no loading
status until the first eligible request begins. The request runner may reassert
`"loading"` when asynchronous work starts, matching the current descriptor-then-
interval status sequence without adding a separate status flag.

Every delayed runner entry checks `this.disposed` before setting status,
normalizing descriptors, or touching the handle cache. This makes an already
scheduled debounce callback inert after disposal without extending the shared
`debounce()` utility with another lifecycle API.

The base may retain separate method names for an invalidating configuration
reload and an ordinary domain request, but both must converge on the same
request runner. Avoid boolean option bags that permit unsupported combinations.

### Commit publication and coverage together

The request runner supplies the requested interval directly to publication.
Remove `SingleAxisWindowedSource.#loadedInterval` and the override that uses it
as an implicit default.

For ordinary sources, the commit callback publishes the returned chunks with
that interval. For Tabix, the callback may emit its physical per-file batches.
Both follow the same ordering required by current completion observers:

1. reset, begin batches, and propagate rows;
2. stage `_lastLoadedDomain` immediately before `complete()`;
3. call `complete()` so observers see the new coverage;
4. clear the staged coverage if completion throws; and
5. report complete status only after successful completion and a final live
   signal check.

No concrete source calls `markLoaded()` or manipulates descriptor readiness.
URL-limit overflow and an all-skipped descriptor set take an explicit empty
commit path for the requested interval. They publish and complete an empty
batch, establish coverage, and only then report complete status.

For ordinary sources, width gating and quantization precede normalization, so
overflow and all-skipped results cover the quantized interval. BigWig cannot
derive its effective window without handles; if normalization overflows or all
handles are skipped, its empty result covers the raw debounced domain. This
preserves the current empty-handle behavior and makes readiness deterministic.

If synchronous propagation throws, the live request reports an error and must
not claim successful coverage. Preserve the existing guarantee that collector
completion, rather than a finished network promise, determines readiness.

### Preserve explicit validation, remove defensive duplication

Keep boundary validation that represents a supported contract:

- channel must be `x` or `y`;
- a single-file source must resolve exactly one descriptor;
- batched interval loaders must return one result per discrete interval;
- default `.bai`, `.fai`, and `.tbi` derivation remains explicit; and
- URL expansion limits and descriptor-field conflicts remain enforced.

Do not add rollback state, multiple current-request checks, optional lifecycle
hooks, or a generic state enum. One signal check at each asynchronous return and
one guarded commit boundary are sufficient.

## Alternatives considered

### Keep the hierarchy and rename its state

Replacing revisions with a request object while retaining active keys,
published keys, and fetched coverage would improve terminology but not remove
the duplicated model. The plan instead deletes the unused inheritance boundary
and makes publication coverage the source of readiness truth.

### Add a reusable request manager

A generic request manager would need callbacks for normalization, caching,
batching, publication, status, and disposal. Those are precisely the layers to
remove. Keep the operation private to the only source family that needs it.

### Retain eager descriptor initialization

Starting handle construction in the constructor requires a separate promise,
stale-initialization identity, error/status path, and handoff to later interval
work. Demand-driven acquisition removes that handoff. Retain eager module or
header loading only if a measured user-visible requirement is identified.

### Use descriptor keys as the request identity

Descriptor equality is useful for handle caching but insufficient for requests:
the same descriptors can be loaded for a new domain or data-affecting property
configuration. Abort-signal identity covers the whole attempt without encoding
every input into a composite key.

### Introduce a tile cache

GenomeSpy currently publishes one aggregate window and relies on collectors for
retained rows. A tile cache would change memory, refinement, and dataflow
semantics and would increase SLOC. Descriptor handles may remain cached because
they are reusable resources rather than published data.

## Source-line budget

The primary measurement uses the production-line counter against the branch
base, scoped to changed `.js` files under `packages/core/src/data/sources`, with
tests and declarations excluded.

The current removable lifecycle contains 314 production lines before counting
concrete-source boilerplate. The implementation target is:

- delete `singleAxisWindowedSource.js`;
- delete `urlDescriptorState.js`;
- grow `intervalUrlSource.js` only with the behavior that survives;
- delete `initializedPromise`, fetched-interval handoff, descriptor
  `markLoaded()` calls, and source-local publication guards; and
- finish at least 80 production lines below the branch base.

The concrete forecast starts with 233 deleted production lines from
`singleAxisWindowedSource.js` and `urlDescriptorState.js`. The surviving
`intervalUrlSource.js` is expected to absorb 100--130 lines for
quantization, debouncing, request execution, handle caching, and publication.
Concrete-source cleanup should remove another 15--35 lines. The expected final
range is therefore roughly -100 to -150 lines; the -80 gate leaves limited room
for the BigWig preparation and Tabix commit boundaries without accepting a
nominal class deletion that merely relocates all code.

Every implementation commit is gated independently:

1. Count its production delta against its immediate parent.
2. If the net is zero or positive, do not commit it; simplify or discard the
   milestone.
3. After all milestones, count the complete branch against `origin/master`.
4. Tests and documentation do not fund production growth. Avoid replacing
   deleted implementation-detail tests one-for-one when the state no longer
   exists.

The 80-line target is a rejection criterion, not an estimate to be relaxed. If
the lifecycle cannot meet it without weakening cancellation, readiness, or
Tabix batching, retain the merged architecture and record the experiment as
discarded.

## Milestone 1: Make interval publication atomic

### Intended outcome

One base-owned interval attempt covers discrete-interval loading, status,
guarded publication, and coverage. No fetched-but-unpublished interval state or
concrete post-load currency check remains.

Descriptor acquisition explicitly remains on the existing initialization and
revision path during this milestone. It is not yet part of the interval request
lease. This intermediate commit is complete only for the fetch-to-publication
boundary and must reduce production SLOC by itself. Milestone 2 moves handle
acquisition inside the runner and establishes the single end-to-end request.

### Affected areas and downstream consumers

- `packages/core/src/data/sources/lazy/singleAxisWindowedSource.js`
- `packages/core/src/data/sources/lazy/urlDescriptorWindowedSource.js`
- BAM, BigBed, BigWig, indexed FASTA, and Tabix interval loaders
- loading-status registry
- collector completion and viewport readiness
- coordinate lookup side-input loading

### Verification

- Assert a superseded request cannot publish, complete status, or record
  coverage after its loader resolves.
- Assert ordinary publication records coverage only after synchronous dataflow
  completion, including an empty result.
- Assert completion observers see the staged coverage while `complete()`
  notifies them, and a thrown completion clears it again.
- Assert a publication error reports error status and does not record coverage.
- Preserve per-chromosome and batched loader behavior, including result-count
  validation.
- Preserve `domain` and `window` debounce placement with fake timers.
- Preserve readiness of a still-covering old publication while a same-content
  request for another window is pending.
- Preserve immediate cancellation and invalidation for data-affecting property
  changes.
- Exercise Tabix per-file batches and BigWig multi-handle batched loading.
- Run focused windowed-source, descriptor-source, BAM, BigBed, BigWig, indexed
  FASTA, Tabix, coordinate-lookup, and readiness suites.
- Run Core TypeScript checks and lint, then apply the per-commit SLOC gate.

### Documentation and migration

No public migration is required. Update the Core architecture description only
after the descriptor lifecycle is removed in Milestone 2.

### Tentative commit

`refactor(core): make interval publication atomic`

## Milestone 2: Fold descriptor acquisition into the request

### Intended outcome

Descriptor normalization and handle construction become demand-driven phases
of the same request. The request signal is the only stale-work lease.
`SingleAxisWindowedSource`, `UrlDescriptorState`, descriptor revisions,
active/loaded descriptor sets, and `initializedPromise` are deleted.

`IntervalUrlSource` directly owns the remaining quantization,
debouncing, request, and handle-cache behavior while extending
`SingleAxisLazySource`.

### Affected areas and downstream consumers

- `packages/core/src/data/sources/lazy/intervalUrlSource.js`
- `packages/core/src/data/sources/lazy/singleAxisLazySource.js`
- removal of `singleAxisWindowedSource.js` and `urlDescriptorState.js`
- `packages/core/src/genomeSpyBase.js` and its windowed-source detection
- descriptor normalization and handle-cache tests
- reactive reload callbacks in the five descriptor-backed sources
- loading status, disposal, readiness, and current-domain reload behavior
- windowed test doubles in `axisExtent.test.js` and
  `scaleResolution.lifecycle.test.js`
- `packages/core/docs/architecture/views-and-dataflow.md`

### Verification

- Resolve descriptor normalization, module loading, handle construction, and
  interval fetching out of order across A, B, and C requests; only C may
  publish or update status.
- Change descriptor configuration during every asynchronous phase and assert
  that the same request signal is aborted.
- Assert readiness is invalidated synchronously on URL, index URL, and other
  data-affecting property changes, before debounce expiry.
- Restore a previously used descriptor and verify handle reuse followed by a
  new publication for the current domain.
- Request the same pending descriptor concurrently and assert one handle
  construction. Reject it once and assert a later request retries.
- Share one failing construction between concurrent strict and skipping
  descriptors; the strict request must still reject while the skipping request
  may omit it.
- Toggle Tabix `addChrPrefix` and assert a distinct handle-cache identity and
  reference-name mapper, then restore it and verify safe reuse.
- Preserve skipped descriptors, all-skipped empty publication, URL-limit empty
  publication, single-descriptor validation, and default index URLs.
- Dispose during normalization, handle construction, and interval loading;
  none may publish, update status, or retain a failed cache entry.
- Leave both debounce modes pending at disposal and assert their delayed
  callbacks cannot set status, normalize, create handles, publish, or add cache
  entries.
- Verify a source outside its `windowSize` performs no eager descriptor or
  module work and starts loading when zoomed into range.
- Verify `layoutComputed` and `ensureDataForDomain()` each start the first
  in-range demand-driven request through the existing activation lifecycle.
- Cover startup with URL-limit overflow and an invalid header, including their
  deferred timing and status/publication outcomes.
- Preserve BigWig's handle-dependent reduction-level selection, effective
  window size, and acceptance of raw domains wider than ordinary window sizes.
- Retain grouped reactive reload tests for BAM and indexed FASTA and
  representative BigBed, BigWig, and Tabix replacements.
- Run the focused suites from Milestone 1, the full Core suite, workspace
  TypeScript checks, repository lint, and the cumulative SLOC gate.

### Documentation and migration

Replace the architecture description of revisioned active descriptor state
with the demand-driven request-signal and independent handle-cache model.
Document that lazy descriptor errors surface when a window is requested.
No grammar or user documentation change is required.

### Tentative commit

`refactor(core): unify descriptor-backed window requests`

## Review gate

Review the combined lifecycle after Milestone 2. Inspect every asynchronous
boundary from descriptor normalization through publication, plus configuration
replacement and disposal. Verify that abort is the only currency mechanism and
that cached handle completion cannot publish on its own.

Review the concrete sources together. In particular, ensure the base does not
gain format-specific branches, BigWig retains multi-handle batching, Tabix
retains physical file batches, and BAM/indexed FASTA retain their single-handle
contracts.

Review every former `SingleAxisWindowedSource` consumer. The production
`hasIntervalLazyDataSource()` query may test `IntervalUrlSource`
directly because it is now the complete production windowed family. Test-only
generic subclasses should move to the surviving base or to focused lazy-source
test doubles; do not add a production marker solely for tests.

Reject abstractions whose main benefit is moving callbacks or state into a new
file. The final review must compare deleted responsibilities and state fields,
not only class count.

## Final integration verification

Exercise real BAM, BigBed, BigWig, indexed FASTA, Tabix TSV, GFF3, and VCF
specifications in the browser. For each applicable source:

- pan within a covered window and confirm no reload;
- cross a window boundary and confirm one request;
- zoom beyond and back within `windowSize`;
- change reactive URL or index configuration;
- change window size or BigWig resolution parameters;
- navigate away or dispose while a request is pending; and
- revisit a cached descriptor and confirm handle reuse without stale rows.

Also exercise a coordinate lookup with a lazy foreign source and a viewport
readiness wait. Confirm loading indicators, empty results, errors, semantic mark
data, and subsequent rendering remain correct. No renderer-specific output
change is expected.

## Risks

- Demand-driven descriptors delay invalid URL and header errors until a window
  is requested. This is intentional but must be visible in loading status and
  architecture documentation.
- Running descriptor acquisition inside the interval request can cause cheap
  normalization to repeat on navigation. Handle and module imports remain
  cached by their existing mechanisms; do not optimize without measurement.
- BigWig cannot use the ordinary prepare-then-load sequence because handles
  determine its reduction levels and window size. Its preparation hook must
  remain inside the request without becoming a generic pipeline framework.
- Downstream propagation can throw synchronously during publication. Coverage
  must be staged before completion observers run, then cleared on failure;
  status must not report a failed batch as complete.
- Tabix's per-file batching does not fit an overly narrow "chunks in, publish
  once" callback. The base must expose a small commit boundary without learning
  Tabix format details.
- Aborting a request does not cancel dynamic imports or libraries that ignore
  `AbortSignal`. Their completion may warm the handle cache but cannot publish.
- A debounce timer may fire after disposal. The runner's entry guard must make
  it inert before status, normalization, loading, or cache mutation.
- Collapsing two bases can make one class large. Judge the result by total state,
  responsibilities, and production SLOC; do not preserve files solely to keep
  individual classes short.
- Custom code may import internal source classes by path even though they are
  not public API. Deleting `SingleAxisWindowedSource` is an intentional internal
  cleanup and should be called out in release notes only if an undocumented
  downstream use is identified.

## Unresolved questions

- Can the atomic request runner support Tabix publication without a callback
  protocol larger than the code it removes? Prototype this first and reject the
  runner shape if it requires rollback or format-specific hooks.
- What is the smallest handle-aware preparation contract for BigWig? Prefer one
  override returning its interval and reduction-level context; reject a generic
  staged-pipeline API if that override does not remain locally understandable.
- Does any supported embed rely on descriptor/header errors appearing before a
  loadable domain is requested? Search callers and examples before accepting
  the demand-driven timing change.

## Acceptance criteria

- One abort signal covers normalization, handle acquisition, interval loading,
  publication, and status for a window request.
- Starting a newer request, invalidating configuration, or disposing the source
  prevents all older asynchronous work from affecting visible state.
- The last published domain remains ready while compatible pending work runs;
  configuration changes invalidate it synchronously.
- Coverage becomes ready only as part of a successful dataflow publication,
  including intentional empty results.
- Descriptor handles remain cached by descriptor identity, pending construction
  is shared, and failures remain retryable. Per-request skip policy cannot
  change the result observed by a concurrent strict request.
- Inputs that affect handle construction but are outside the descriptor,
  including Tabix `addChrPrefix`, participate in handle-cache identity.
- BAM and indexed FASTA still require exactly one descriptor and derive default
  index URLs.
- BigBed, BigWig, and Tabix retain multi-descriptor fields and skip semantics.
- BigWig retains batched interval loading and Tabix retains per-file dataflow
  batches.
- BigWig selects reduction levels before quantization and retains its distinct
  wide-domain scheduling behavior.
- Both debounce modes and window quantization behave identically.
- Axis and legend guide sources remain data sources and are unchanged.
- Production and test consumers no longer import or test against the deleted
  windowed base; viewport readiness still recognizes every windowed source.
- Debounced callbacks that fire after disposal are inert before any observable
  work.
- `SingleAxisWindowedSource`, `UrlDescriptorState`, descriptor revisions,
  descriptor active/loaded sets, `initializedPromise`, and fetched-interval
  handoff state are absent.
- Every implementation commit reduces non-comment production SLOC, and the
  complete branch reduces it by at least 80 lines.

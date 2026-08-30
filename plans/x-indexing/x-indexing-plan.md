# Renderer-neutral x-indexing plan

Status: Complete

## Context

GenomeSpy already treats `encoding.x.buildIndex` as a data-ordering contract.
Mark normalization enables it by default, and `flowBuilder` sorts eligible
zoomable field encodings before the collector materializes facet batches.
However, the retained and immediate renderers currently consume that contract
differently:

- WebGL builds a binned index over emitted vertex ranges and narrows draw calls
  to the current x domain.
- Canvas2D scans and projects every source datum before exact screen-space
  culling. Software picking repeats the same full traversal when dirty.
- The WebGPU adapter retains complete packed series and already culls repeated
  placements by their layout geometry. Within each surviving occurrence or
  placement range, however, it submits every packed instance. Its renderer
  accepts `firstInstance` and `instanceCount`, but Core does not narrow them by
  the live x domain.
- SVG performs complete deterministic traversal and does not need
  interaction-oriented indexing.

The product direction determines which of these paths should receive new
infrastructure. WebGPU is intended to replace WebGL as the primary interactive
renderer. Canvas2D must remain an interactively usable fallback when WebGPU is
unavailable or unsuitable. WebGL is a temporary compatibility and behavioral
oracle during that transition, and its renderer directory remains an
intentional deletion boundary. This plan therefore integrates the shared
contract with WebGPU and Canvas2D without refactoring WebGL to consume it.

The current generic `createBinningRangeIndexer()` already maps an x/x2 interval
to an arbitrary integer range, while WebGL has a mature vertex-specific
implementation whose behavior can guide compatibility checks. The shared
opportunity is not a renderer abstraction: it is a small
interval-to-native-range contract that WebGPU and Canvas2D can populate using
their own representations and retain using their own resource lifecycles.

The design follows two established ideas without copying external code:

- Tabix requires coordinate-sorted input and returns records overlapping a
  genomic interval: https://www.htslib.org/doc/tabix.html
- deck.gl retains derived attributes and rebuilds them through explicit
  invalidation rather than per-frame reconstruction:
  https://deck.gl/docs/developer-guide/custom-layers/attribute-management

These are conceptual references only. The implementation will evolve
GenomeSpy's existing binned-index code, so no external source or license notice
is required.

This follow-up starts as a plan-only branch from `master`. Before runtime work,
rebase it onto the merged Canvas performance work so its benchmark extensions,
sample-facet culling, and immediate-rendering changes form the measured
baseline rather than being duplicated here.

## Goals

- Define one internal x-index contract that the Core WebGPU adapter and
  Canvas2D can consume without sharing renderer resources.
- Preserve the existing `buildIndex` grammar and sorting behavior.
- Make an index map source x/x2 intervals to any contiguous renderer-native
  integer range, initially source rows or packed instances.
- Build indexes only when data or index configuration changes; pan and zoom
  perform allocation-free queries.
- Use one conservative query-envelope policy for visible and picking passes so
  indexed rendering cannot create missing or stale hit targets.
- Fail closed to the complete renderer-native range whenever eligibility,
  ordering, geometry expansion, or scale semantics are uncertain.
- Treat Canvas2D performance as a product requirement for the fallback, not
  merely as a correctness path.
- Use existing WebGL behavior as a migration oracle without coupling new code
  to WebGL resources or extending WebGL's lifetime.
- Keep SVG output and dependencies unchanged.

## Non-goals

- A universal drawing API or shared retained-resource lifecycle.
- Moving GPU buffers, Canvas state, or renderer delegates into semantic marks,
  collectors, or scale resolutions.
- Making SVG export use viewport-dependent subsets.
- Replacing dataflow filtering, lazy loading, semantic zoom, or viewport-domain
  calculation.
- Indexing arbitrary two-dimensional geometry or non-contiguous native ranges.
- Migrating or refactoring WebGL's private indexing implementation.
- Changing renderer selection, WebGPU feature detection, or fallback policy.
- Expanding indexing to every mark type in the first implementation.

## Key decisions

### Share interval-to-native-range mechanics, not caches or resources

Add a backend-neutral module under `packages/core/src/rendering/xIndex/`. It
must not import Canvas2D, SVG, WebGL, WebGPU, TWGL, WGSL, or DOM APIs.

Its low-level contract is intentionally representation-agnostic:

```js
const builder = new XRangeIndexBuilder(indexDomain, binCount);
builder.add(x, x2, nativeStart, nativeEnd);
const index = builder.finish();

// Writes a half-open [start, end) native range into reusable storage.
index?.query(queryStart, queryEnd, targetRange);
```

`nativeStart` and `nativeEnd` are renderer-defined non-negative integers:

| Consumer       | Native range                                      |
| -------------- | ------------------------------------------------- |
| Canvas2D       | Indices into one stable source-data batch         |
| WebGPU adapter | Packed instance indices submitted to the renderer |

The builder validates finite coordinates, monotonic starts, non-inverted x/x2
intervals, nondecreasing non-overlapping native ranges, and a finite nonzero
index domain. Empty native spans are ignored. `finish()` returns `undefined`
when any invariant fails. Queries deliberately overfetch whole bins and never
allocate or return sliced data.

Each adapter owns its cache because its native ranges and invalidation inputs
differ. The shared module owns no module-global mark cache and subscribes to no
lifecycle events.

### Derive mark eligibility and live queries through a shared Core contract

The same folder exposes a higher-level mark helper with a tentative interface:

```js
const spec = createMarkXIndexSpec(mark);
const queryable = resolveMarkXIndexQuery(mark, spec, targetDomain);
```

`createMarkXIndexSpec()` returns `undefined` unless all index-build invariants
are known:

- `x.buildIndex` is enabled;
- x has one non-constant raw data accessor;
- x2 is absent or has one compatible raw accessor and scale;
- the x scale is continuous;
- the scale resolution has a finite increasing zoom extent.

The immutable spec contains raw numeric x/x2 accessors, the stable index
domain, encoder identities needed for cache validation, and the index/locus
inclusive-start adjustment. It never stores renderer resources.

`resolveMarkXIndexQuery()` reads the live scale domain and expands it by a
shared conservative pixel envelope converted through the current axis length.
It returns `false` when the mark type has no defined envelope, the envelope is
unbounded, or the live domain is invalid, instructing the adapter to use its
complete native range. Index-build eligibility and query eligibility stay
separate so adapters can migrate their native index mechanics without silently
changing unsupported mark behavior.

The initial geometry envelope covers rectangles and points:

- positional x/x2 offsets and `dx` where applicable;
- rectangle `minWidth`, seam padding, stroke width, shadow blur, and shadow
  offset;
- point radius, rotation-safe bounds, stroke width, and `minPickingSize`.

The envelope is the union required by visible rendering and picking across
supported backends. Normal rendering may overfetch a few more candidates, but
both passes use the identical candidate range. Data-dependent unscaled
encoders, conditional positional branches, non-finite scale ranges, and
unsupported geometry return the full range.

### Keep invalidation explicit and adapter-owned

An adapter cache entry is valid only while its complete identity vector is
unchanged:

- logical mark and collector identity;
- collector `dataRevision`;
- stable input-batch or packed-range identity;
- x/x2 encoder and raw-accessor identity;
- index-domain endpoints; and
- renderer-native packing revision.

Expression-backed geometry and scale-domain changes do not rebuild the index.
They are evaluated while resolving the live query envelope. Encoding rewrites,
data replacement, or topology changes that repack instances rebuild the
adapter entry.

This follows existing retained ownership:

- Canvas2D's live coordinator owns source-row indexes shared by visible and
  software-picking contexts.
- WebGPU's packed-mark cache owns instance indexes and reuses them from its
  retained frame plan.

Semantic marks and `Collector` remain free of renderer-native indexes. The
collector's existing `dataRevision` is an invalidation input, not an index
container.

The adapter workflow is the same even though ownership differs:

| Adapter  | Build trigger                               | Builder input                       | Query consumer                       |
| -------- | ------------------------------------------- | ----------------------------------- | ------------------------------------ |
| Canvas2D | Source batch or x config changes            | One native span per source row      | Immediate visitor start/end          |
| WebGPU   | Packed batch, topology, or x config changes | One native span per packed instance | Draw `firstInstance`/`instanceCount` |

Use `xIndex` or `xIndexedRange` consistently. In particular, do not reuse the
WebGPU adapter's existing `indexed` placement flag for x-domain indexing.

### Preserve stable occurrence batches

Indexes require stable arrays or stable packed ranges. Collector facet batches
already satisfy this. The immediate `facetIndex` path currently constructs new
arrays during every traversal; Canvas must not build persistent indexes over
those transient arrays.

Before Canvas integration, occurrence grouping will become revision-aware and
stable, keyed by mark, source batch, collector revision, and `facetIndex`
encoder identity. Alternatively, if profiling shows grouping is rare for the
target marks, the adapter may conservatively use full traversal for transient
groups. It must not silently rebuild a large index every paint.

WebGPU already retains stable packed occurrence ranges. WebGL's existing stable
facet-to-vertex ranges remain unchanged and provide useful comparison cases.

### Adapt native ranges at renderer boundaries

Canvas queries a source-row range and passes optional `start`/`end` integers to
immediate rectangle and point visitors. Those visitors iterate the original
array directly. SVG callers omit the bounds and retain complete traversal.

WebGPU queries a packed-instance range and updates the existing draw command:

```js
draw.firstInstance = indexedStart;
draw.instanceCount = indexedEnd - indexedStart;
```

The external `@genome-spy/webgpu-renderer` remains unchanged. It continues to
own buffers, pipelines, draw-range resolution for expanded representations
such as text glyphs, and the final `pass.draw()` call. Normal and picking passes
reuse the same Core frame-plan range.

WebGL keeps its existing index, vertex readers, geometry builders, and range
entries. Compatibility tests compare visible and picking behavior rather than
making either new adapter import WebGL internals. This avoids spending migration
effort on code intended to disappear.

### Instrument decisions at adapter boundaries

Adapters report renderer-qualified profiler counters:

- indexed and fallback queries;
- index builds and rejected builds;
- complete native items and candidate native items; and
- empty indexed ranges.

Fallback reasons are exposed to focused tests and optional debug snapshots,
not allocated as strings in the production paint loop.

## Alternatives considered

### Store source-row indexes in `Collector`

Rejected. A collector owns materialized data and revision, but does not own
mark encoders, x2 semantics, zoom extents, screen-space geometry, or native
renderer ranges. Storing the index there would couple dataflow to rendering and
still fail to represent retained WebGPU packing cleanly.

### Put all indexing in semantic marks

Rejected. Marks should not acquire retained backend lifecycle or cache native
resource offsets. It would also make one logical mark coordinate multiple
resource representations.

### Implement indexing in `@genome-spy/webgpu-renderer`

Rejected. The renderer package sees packed series and draw commands but should
not learn Core grammar, `buildIndex`, genomic scales, collector revisions, or
facet semantics. The Core adapter can already narrow `firstInstance` and
`instanceCount` through the public renderer contract.

### Share only a source-row index

Rejected as the sole abstraction. It is convenient for Canvas, but WebGPU
occurrence packing can use nonzero bases and some representations expand one
datum into a different native count. Mapping intervals directly to arbitrary
native ranges avoids per-frame translation tables in the retained adapter.

### Reuse `ViewportDomainManager` as the render index

Rejected. Its block summaries answer viewport-derived scale-domain questions
and may scan qualifying blocks to aggregate another field. Rendering needs one
contiguous native draw/iteration range and different screen-geometry safety
rules. Both can rely on sorted collector batches without sharing state or
conflating their query contracts.

### Filter or slice candidate arrays

Rejected because it allocates per query, changes data-array identity, and
undermines retained caches. Integer ranges preserve identity and painter order.

## Milestone 1: Establish the shared contract and compatibility oracle

### Intended outcome

The renderer-neutral builder and common scale-query mechanics have independent
contract tests. Existing WebGL results provide compatibility fixtures without
changing WebGL runtime code or draw-range decisions.

### Work

- Add `rendering/xIndex/` with the native-range builder and mark-level spec and
  query helpers.
- Add table and property tests for eligibility, conservative envelopes, and
  native-range queries.
- Capture representative expected ranges and visible/picking outcomes from the
  current WebGL implementation as compatibility fixtures.
- Leave WebGL imports, resources, private index, and draw callbacks unchanged.

### Affected areas and consumers

- New renderer-neutral x-index module
- Shared x-index tests and WebGL compatibility fixtures
- Existing generic binned-index tests and callers

Canvas2D, WebGPU, SVG, dataflow, and the public grammar remain behaviorally
unchanged.

### Verification

- Shared tests cover points, half-open intervals, empty bins, long overlaps,
  unordered and inverted data, non-finite values, native ranges with nonzero
  bases, index/locus adjustment, and bounded/unbounded geometry.
- Existing WebGL index and mark-rendering tests remain unchanged and pass.
- WebGL normal and picking screenshots remain unchanged on representative
  indexed genomic examples.

### Documentation and migration

Add a short internal README for the shared contract. No user migration.

Tentative commit: `feat(core): add renderer-neutral x-index contract`

## Milestone 2: Integrate Canvas rendering and picking

### Intended outcome

Eligible Canvas rectangle and point batches project only conservative x-domain
candidates, while visible output, painter order, and software picking remain
equivalent to full traversal. The fallback remains responsive on the
pathological MCCA interaction instead of merely rendering correctly.

### Work

- Give the live Canvas coordinator an adapter-owned source-row index cache.
- Stabilize or conservatively bypass transient `facetIndex` occurrence groups.
- Add optional start/end bounds to immediate rectangle and point visitors.
- Use the same queried range in visible and software-picking contexts.
- Keep detached raster export on full traversal initially; enable its index
  only if repeated export profiling justifies an ephemeral cache.

### Affected areas and consumers

- Canvas coordinator, normal context, software-picking context, and renderers
- Immediate rectangle and point visitors
- Occurrence-data grouping where stable batch identity is required

SVG calls the bounded visitors without a range and remains behaviorally and
dependency-wise unchanged.

### Verification

- Unit tests compare indexed candidates against full geometric visibility for
  randomized sorted points and intervals, including offsets, minimum sizes,
  strokes, shadows, clips, and picking envelopes.
- Canvas command-recording and software-picking tests compare full and indexed
  output for facets, sample rows, pan, zoom, and empty ranges.
- Data, filtering, sorting, and encoding changes rebuild or fall back correctly.
- Exact MCCA profiling reports index builds, fallback decisions, and candidate
  reduction for wheel zoom, Peek opening, and closeup scrolling.
- Repeated before/after traces show a material reduction in Canvas scripting
  time for closeup interaction without a regression in the small control spec.

### Documentation and migration

Update the Canvas internal README. No public migration.

Tentative commit: `perf(core): cull Canvas marks with shared x indexes`

## Milestone 3: Integrate the Core WebGPU adapter

### Intended outcome

WebGPU retains complete series buffers but submits only the indexed packed
instance range for eligible occurrences during normal and picking passes. The
design fits the intended primary renderer's retained frame plan instead of
copying Canvas's immediate traversal model.

### Work

- Attach adapter-owned x indexes to stable packed mark ranges.
- Translate queried source or packed ranges to `firstInstance` and
  `instanceCount` without repacking or uploading data on domain changes.
- Refresh mutable draw ranges in place as part of the retained frame plan.
- Use identical narrowed ranges for normal and picking submission.
- Keep the external renderer package and its public API unchanged.

### Affected areas and consumers

- `webGpuMarkData.js` packed ranges and cache validation
- `webGpuViewRenderingContext.js` live draw-range refresh
- WebGPU adapter tests and interaction benchmark counters

The WebGPU renderer's buffers, programs, glyph-range resolution, placement
resources, and draw implementation remain unchanged.

### Verification

- Adapter tests cover nonzero packed bases, facets, topology replacement,
  filtered and sorted data, text range resolution, picking parity, and domain
  changes without mark uploads.
- The WebGPU interaction benchmark shows no new layout replay, occurrence
  reconstruction, resource synchronization, or buffer writes during zoom.
- Repeated hardware-backed runs show improved frame timing on large indexed
  marks. If query overhead affects small batches, establish a measured
  eligibility threshold or full-range fast path rather than rebuilding the
  index architecture.

### Documentation and migration

Update the WebGPU adapter README. No renderer-package or public migration.

Tentative commit: `perf(core): narrow WebGPU draws with shared x indexes`

## Final integration verification

After Canvas2D and the Core WebGPU adapter consume the contract:

- Run focused Canvas, WebGPU, immediate-rendering, binned-index, compatibility,
  and TypeScript suites.
- Run structured SVG export tests and verify that SVG never queries an x index.
- Compare Canvas and WebGPU normal and picking behavior against the existing
  WebGL oracle for points, intervals, facets, sample placements, clips, pan,
  zoom, filtering, sorting, and parameter-driven geometry.
- Run the private MCCA visualization at the exact reported state, including
  genomic wheel zoom, Peek open/close, closeup scrolling, hover, and selection.
- Run a small non-genomic control specification to expose fixed index overhead.
- Inspect minimal and optional-renderer bundle graphs so the shared module does
  not pull any renderer implementation into an unregistered entrypoint.

## Review gates

- Review the shared contract and compatibility fixtures before Canvas or WebGPU
  adopts it. Reject dependencies from shared code into WebGL.
- Review Canvas visible/picking equivalence and fallback coverage before its
  performance commit; candidate reduction alone is insufficient without an
  interaction-time improvement.
- Review final WebGPU retained-state behavior and cross-renderer integration
  after hardware-backed measurements.

## Risks and unresolved questions

- Conservative bins may overfetch substantially for very long intervals or
  domains close to the full zoom extent.
- A single contiguous native range cannot exclude interior gaps; correctness
  is preserved, but gains depend on sorted spatial locality.
- Dynamic geometry can make the query envelope unbounded. Full traversal is
  required rather than guessing a maximum.
- Canvas `facetIndex` grouping currently creates transient arrays and needs
  stable ownership or explicit fallback.
- WebGPU may be vertex- or raster-bound elsewhere, making CPU index queries a
  net loss for smaller batches. Benchmark thresholds may be warranted, but no
  threshold should be chosen before measurement.
- Text and other variable-expansion marks require their renderer's native-range
  resolver to preserve datum-to-native mapping; unsupported marks fall back.
- Index construction increases retained memory. Each adapter should report
  index counts and candidate reduction before considering more bins.

## Acceptance criteria

- One internal mark-level eligibility and query-envelope contract is used by
  Canvas2D and the Core WebGPU adapter.
- One interval-to-native-range implementation serves source rows and packed
  instances without importing renderer-specific resources.
- Every uncertain or unsupported case visibly falls back to the complete
  native range with no false-negative culling.
- Normal and picking passes use identical candidate ranges and preserve paint
  order and picking IDs.
- Domain-only interaction never rebuilds an index, repacks WebGPU data,
  reuploads GPU buffers, or allocates candidate arrays.
- SVG output, tests, and bundle dependencies remain unchanged and do not import
  the x-index module.
- WebGL runtime code remains unchanged and continues to provide a behavioral
  oracle during migration.
- Canvas shows a repeatable interaction-time improvement on the pathological
  MCCA state, and WebGPU shows a hardware-measured gain for large indexed marks
  without a meaningful small-spec regression.
- No public specification, renderer-selection, or migration change is needed.

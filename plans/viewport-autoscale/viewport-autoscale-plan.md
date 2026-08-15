# Viewport Autoscale

## Summary

Add an opt-in scale-domain mode that derives a scale domain from data whose
positional encodings overlap the current viewport. Domain calculation and, when
enabled, the existing smooth domain transition start only after navigation has
paused for a short trailing debounce period.

For x-sorted collectors, the initial implementation uses a flat x block index,
with approximately 256 consecutive rows per block, only when the collector
participates in viewport autoscaling. X bounds let a query skip disjoint blocks.
An x-only query can accept a block whose rows are all x-visible by merging its
precomputed target min/max; an x/y query scans the x-selected rows and applies y
exactly.
Unsorted collectors use the debounced exact scan. A collector that is never
enabled for viewport autoscaling gets no block index and no associated
construction cost. No per-frame domain calculation, spatial tree, worker, GPU
reduction, or source-specific statistics API is introduced.

The feature covers genomic signal y-scales as well as quantitative color and
size scales in zoomable scatter plots.

## Problem

GenomeSpy currently has no separate autoscaling subsystem. An implicit scale
domain is the union of accessor domains extracted from all rows in the
collectors that contribute to a `ScaleResolution`:

- `DomainPlanner.getDataDomain()` in
  `packages/core/src/scales/domainPlanner.js` delegates to
  `resolveDataDomain()`.
- `Collector.getDomain()` in `packages/core/src/data/collector.js` scans all
  collected rows and caches the result.
- Collector completion invalidates cached domains. Subscriptions registered by
  `ScaleResolution.registerCollectorSubscriptions()` then call
  `reconfigureDomain()`.

This produces two undesirable behaviors:

1. A lazy genomic source loads a quantized window larger than the visible
   domain. The y-domain includes peaks in the loaded flanks even though they are
   outside the viewport.
2. Panning or zooming static data changes a positional scale domain but does
   not modify its collector. Other data-derived domains therefore remain
   unchanged.

`getCompareParamsForView()` in `packages/core/src/view/flowBuilder.js` already
configures collectors to sort zoomable x data when x indexing is enabled.
`createVertexRangeIndexer()` in `packages/core/src/gl/vertexRangeIndex.js` uses a
binned vertex index to reduce GPU draw ranges. That vertex index cannot serve
domain extraction directly because marks may emit several vertices per datum.
Viewport domain extraction instead needs datum-level target min/max summaries,
so it uses a separate, flat x block index over collector rows.

## Goals

- Derive quantitative y, color, and size scale domains from data in the current
  positional viewport.
- Exclude peaks in lazy-loaded flanks from genomic signal y-domains.
- Make the behavior work with static and lazy data.
- Debounce both domain calculation and the start of the smooth transition until
  shortly after navigation pauses.
- Preserve existing `zero`, `nice`, `domainMin`, `domainMax`, `domainMid`, scale
  type, and `domainTransition` behavior.
- Support one-dimensional genomic tracks and two-dimensional x/y scatter plots
  with one simple query model.
- Union viewport-derived domains correctly across shared-scale members, layers,
  and facets.
- Avoid dataflow repropagation, mark reconstruction, and GPU buffer updates
  solely for autoscaling.
- Keep settled x-only queries responsive with millions of x-sorted rows.
- Build and maintain an x block index only while an x-sorted collector
  participates in viewport autoscaling; ordinary and unsorted collectors incur
  no index cost.
- Reuse one x block partition when several autoscaled target scales use the same
  collector and x accessors.
- Keep the implementation small enough to understand from the existing
  `ScaleResolution`, `DomainPlanner`, and `Collector` contracts.

## Non-goals

- Recomputing viewport domains on every animation frame.
- Guaranteeing sub-millisecond post-navigation queries for every dataset.
- Applying the x-only fast-path latency budget to unsorted or two-dimensional
  data in the initial implementation; those paths prioritize correctness and
  debounce the exact scan.
- Adding segment trees, interval trees, k-d trees, quadtrees, workers, WebGL
  reductions, or WebGPU compute in the initial implementation.
- Building an x block index speculatively for collectors that do not participate
  in viewport autoscaling.
- Building an order-independent summary index for unsorted data.
- Adding approximate, quantile, clipped, or standard-deviation autoscaling.
- Asking BigWig, Tabix, or other sources for separate viewport statistics.
- Changing lazy-source window sizes, reduction-level selection, or fetch
  debouncing.
- Viewport-autoscaling a zoomable positional scale.
- Accounting for symbol radius, stroke width, or pixel offsets when deciding
  whether a datum is visible. Visibility is based on data-domain positional
  anchors or intervals.
- Exposing debounce duration or an autoscale-specific transition duration in
  the first public API.

## Key decisions

- Expose one opt-in domain source: `domain: { "source": "viewport" }`.
- Infer one or two independent continuous positional constraints from each
  contributing member; reject members with no such constraint.
- Keep scheduling in `ScaleResolution` and use one approximately 150 ms trailing
  debounce for navigation and relevant collector changes.
- Reuse the normal domain-configuration and transition path after calculation.
- Use a flat, approximately 256-row x block index only when the collector is
  already sorted by its x field and visible autoscaling is enabled.
- Use a debounced exact scan for unsorted data, boundary blocks, and y filtering
  in two-dimensional plots.
- Wait for the latest lazy-data viewport to be ready and retain the last
  nonempty domain when a ready viewport contains no values.

## Comparable behavior and provenance

IGV describes autoscaling as dynamically changing a quantitative track's data
range based on data currently in view. It also supports group autoscaling for
multiple tracks. See the
[IGV quantitative data documentation](https://igv.org/doc/desktop/UserGuide/tracks/quantitative_data/).

JBrowse quantitative tracks default to local min/max autoscaling and also
offer global and standard-deviation-based alternatives. See the
[JBrowse quantitative track documentation](https://jbrowse.org/jb2/docs/config_guides/quantitative_track/).

GenomeSpy adopts only the established visible-data semantics. Its declarative
scale integration, debounce scheduling, and collector query are designed for
the existing GenomeSpy architecture. No IGV or JBrowse code will be copied or
closely adapted, so no third-party license notice is required in the
implementation.

## User-facing specification

Add a discriminated domain reference:

```ts
export interface ViewportDomainRef {
  /** Derive the domain from data in the current positional viewport. */
  source: "viewport";
}
```

Extend `Scale.domain` with `ViewportDomainRef`:

```json
{
  "y": {
    "field": "score",
    "type": "quantitative",
    "scale": {
      "domain": { "source": "viewport" }
    }
  }
}
```

Keep the initial object intentionally small. Applicable positional channels are
inferred from each contributing scale member, and the debounce is an internal
default. This avoids public configuration for choices that have not yet shown
a need to vary.

`ViewportDomainRef` selects a data-derived mode; it is not a literal explicit
domain. Consequently, normal data-derived defaults such as including zero
continue to apply. A viewport-domain reference cannot be combined in one shared
resolution with a literal domain, an expression domain, or a selection-linked
domain. Members that omit `domain` may participate in a shared resolution whose
mode is selected by another member's viewport-domain reference. Multiple members
may repeat the same viewport-domain reference. Reject viewport-domain mode for
non-continuous target scales. A view-level scale declaration selects the same
resolution-wide mode and includes all ordinary domain-contributing members.

## Viewport semantics

For each member contributing to a viewport-derived target scale:

1. Reject the target if it is itself a zoomable positional scale.
2. Inspect its primary positional x and y encoders.
3. Exclude the target resolution itself from the viewport constraints. This
   allows a non-zoomable y signal scale to depend on x without depending on its
   own current y-domain.
4. Use the current domains of the remaining continuous positional resolutions
   as visibility constraints. Reject the member if none remain.
5. Include a point when its positional value lies inside every constraint.
6. Include an interval when its primary/secondary positional interval overlaps
   the corresponding viewport domain.
7. Extend the target domain with the same non-inert accessors used by ordinary
   data-domain extraction.

This gives the following behavior:

| Target scale                                      | Positional constraints   |
| ------------------------------------------------- | ------------------------ |
| Non-zoomable y in a genomic signal track          | x                        |
| Quantitative color or size in an x/y scatter plot | x and y                  |
| Non-positional scale in a one-dimensional plot    | x or y, whichever exists |
| Zoomable positional target                        | invalid configuration    |

For a shared target scale, query each member using that member's positional
resolutions and union the results. This supports layers and views whose target
scale is shared even when their positional resolutions differ.

Reversed domains are normalized for containment checks. Locus and index-like
domains use the internal numeric representation already exposed by
`ScaleResolution.getDomain()`. Non-finite target values follow existing domain
array behavior.

Point visibility uses closed bounds: `lo <= value <= hi`. A nonzero interval is
treated as half-open and contributes when `start < hi && end > lo`, matching the
fact that an interval merely touching a viewport edge has no visible width. A
zero-width interval is treated as a point. Apply the same rules independently
to x/x2 and y/y2.

If a fully ready viewport contains no contributing values, retain the last
nonempty target domain. This prevents empty genomic regions from jumping to a
placeholder domain. The initial empty state keeps the existing default until a
nonempty viewport domain becomes available.

## Architecture

### DomainPlanner: domain mode and extraction

`DomainPlanner` remains responsible for interpreting domain sources and
unioning member contributions. Add recognition of `ViewportDomainRef` and a
visible-data extraction path. It must not own timers, event subscriptions, or
lazy-source lifecycle.

Ordinary implicit domains keep using `Collector.getDomain()`. A viewport-domain
scale asks the collector to calculate the accessor domain under member-specific
positional constraints. Configured-domain validation rejects mixed visible and
literal/selection/expression sources in a shared resolution.

Visible mode is configured but data-derived. Update `ScaleResolution` checks
that currently infer explicitness from the mere presence of `scale.domain`,
including `#hasConfiguredDomain()`, `isDomainDefinedExplicitly()`,
`#getActiveMembers()`, and `#finalizeInitialDomainFromData()`. A viewport-domain
member must wait for initialized data, retain normal data-domain defaults such
as `zero` and `nice`, and participate in initial-domain coverage like an
ordinary implicit-domain member.

### ScaleResolution: subscriptions and debounce

`ScaleResolution` already owns scale members, domain subscriptions, and domain
transitions. It should also own the minimal viewport-autoscale scheduling state:

- dependent positional resolutions;
- one trailing timer;
- whether a calculation remains pending because lazy data are not ready.

`DomainPlanner` retains the last nonempty raw visible-data extent because it
already owns raw domain extraction and configured-domain invalidation. Store the
raw union before `zero`, `nice`, `domainMin`, `domainMax`, or `domainMid` are
applied. Reset it when active resolution members, target accessors, or the
configured domain source change; do not reset it merely because navigation
reaches an empty ready viewport.

When a member set or visibility changes, refresh the dependent positional
resolution subscriptions along with the existing derived membership state.
Each x/y domain event marks the viewport domain dirty and schedules one update
after an internal debounce of approximately 150 ms.

Collector invalidation for a viewport-domain target must use this same scheduling
path instead of immediately calling `reconfigureDomain()`. Normally it restarts
the trailing timer. If the timer has already fired and is waiting specifically
for lazy readiness, the collector event calculates immediately once the latest
viewport is ready. This avoids both bypassing the debounce during scrolling and
adding a second quiet period after an awaited lazy load.

When the quiet period has elapsed, call the normal `reconfigureDomain()` path.
The existing `domainTransition` default remains enabled, so a rendered
continuous target scale transitions smoothly to the newly calculated domain.
Do not add a separate transition implementation or duration.

If navigation resumes during a domain transition, let the existing transition
continue. A later debounced target replaces it through the normal transition
machinery. Add explicit transition cancellation only if browser evaluation
shows the intermediate motion is distracting.

### Collector: opt-in x block index and exact query

Add one focused collector operation that calculates a domain from its final
rows using a target accessor and one or two positional constraints. It
must not mutate collector data or invalidate the ordinary full-domain cache.

The first viewport-domain query enables the x block index for its collector. If
the collector's configured sort begins with the primary x field, ascending or
descending, build the index immediately when data are complete; otherwise,
build it when that enabled collector completes. Rely on the collector's sort
configuration; do not scan rows to detect order and do not sort as a side
effect of autoscaling. Invalidate and rebuild enabled indexes with collector
data. Keep them for the collector's lifetime; do not add reference counting or
dynamic release. If the collector is not x-sorted, use the exact full scan and
build no index.

Split each facet batch into consecutive blocks of approximately 256 rows. Keep
the structure flat; do not add a tree over the blocks. Store each block's row
range and x bounds. For interval data, retain the normalized start/end extrema
needed to prove x disjointness or that every row overlaps x. For x-only viewport
queries, also store the configured target accessor min/max per block. Use flat
numeric arrays rather than one object per block.

Multiple y, color, size, or other targets using the same collector and x/x2
accessors reuse the x block partition. Target min/max arrays are built only for
x-only viewport-domain contributions that can merge fully accepted blocks; a
two-dimensional x/y query does not need them because it must inspect y per row.
The structure uses the collector's established x order and does not sort or
reorder data. It is independent of both the mark's GPU vertex index and
`createBinningRangeIndexer()`.

The baseline algorithm is an exact scan over all facet batches:

```text
for each candidate datum:
    if datum overlaps every positional domain:
        extend target domain
```

Query the flat index as follows:

1. Skip a block when its x bounds prove it is disjoint from the x viewport.
2. For an x-only query, merge target min/max when every row in the block is
   provably x-visible.
3. Scan x-boundary blocks exactly.
4. For an x/y query, scan rows in every x-candidate block and apply both x/x2
   and y/y2 overlap predicates before extending the target domain.

This is exact: block metadata are used only when x acceptance or disjointness is
provable, and all remaining decisions use row predicates. Unsorted data bypass
this path completely and use the same exact row predicate over the full batch.
Restricting the index to x-sorted data avoids order-independent or
multidimensional indexing.

With block size 256, one million rows produce about 3,907 blocks and ten million
rows about 39,063. Construction is O(N). An x-only query costs O(N / 256) block
checks plus exact scans of boundary blocks. A two-dimensional query additionally
scans rows in x-candidate blocks, and the unsorted fallback remains O(N). Those
slower correctness paths run only after the debounce. Memory is O(N / 256) for
the x index and each configured x-only target min/max pair.

Do not set the mark's `buildIndex` property, introduce sorting, or reorder
collector data as a side effect. The x block index is an opt-in collector
resource and exists only when viewport autoscaling is configured and the
collector is already x-sorted.

### Lazy-data readiness

Before calculating, verify that upstream lazy data cover the latest positional
domain. Reuse or extract the source-readiness check already implemented in
`packages/core/src/view/dataReadiness.js`; do not create a second readiness
framework.

For a shared target resolution, wait until every active member that contributes
to its visible domain is ready for that member's latest positional viewport,
then calculate one union and start at most one transition. Use the same
configured-visibility and data-domain membership rules as `DomainPlanner`, not a
generic whole-subtree visibility predicate. Static members are ready once their
collectors are complete; inactive members do not block the update.

The event flow is:

```text
positional domain changes
    -> restart trailing quiet-period timer

timer fires
    -> ready: calculate and start normal domain transition
    -> not ready: retain current domain and mark update pending

collector completes
    -> waiting for lazy readiness and latest viewport ready: calculate now
    -> otherwise: restart the trailing quiet-period timer
```

Lazy sources already abort or suppress stale publications. The readiness check
must always use the latest positional domains, so stale loaded windows cannot
produce a target domain. Avoid generation tokens unless tests reveal a race the
existing source and readiness contracts do not cover.

## Example and documentation

Create
`examples/docs/grammar/scale/viewport-autoscale.json` using
`examples/docs/grammar/mark/point/geometric-zoom.json` as its basis rather than
overloading the existing geometric-zoom example with a second teaching goal.

Retain the static 200,000-point sequence, zoomable x-scale, point mark, and
zoom-dependent point-size expression. Reduce the stochastic component of the y
formula from its current `1.618` multiplier to approximately `0.6`, leaving the
sinusoidal structure and occasional deviations easier to distinguish. Add
`domain: { "source": "viewport" }` to the y-scale. The example should make the
delayed smooth y-domain adjustment obvious when zooming into regions with
different local extrema.

Add a concise "Viewport-derived domains" section to `docs/grammar/scale.md`.
Explain that:

- calculation begins after navigation pauses;
- only data in the current positional domains contribute;
- normal domain transitions and scale options still apply;
- an empty ready viewport retains the last nonempty domain;
- visible mode requires an independent continuous positional scale.

The TypeScript `.d.ts` JSDoc remains the schema-derived user-facing reference.
Regenerate schema and documentation artifacts as required.

## Alternatives considered

### Filter the dataflow to the visible viewport

Rejected. Repropagating on navigation would rebuild collectors and GPU buffers,
mix rendering concerns into domain calculation, and perform work while the user
is interacting.

### Recalculate on every positional-domain event

Rejected. Even an indexed query would add work to inertial zoom frames. A
trailing debounce matches the intended interaction: keep the current scale
while navigating, then transition shortly after navigation settles.

### Add a segment tree over the x block index

Deferred. The flat index already reduces an x-only million-row query to a few
thousand block checks plus boundary rows. A tree adds lifecycle and query
complexity and is warranted only if profiling shows that the flat scan is still
a user-visible bottleneck.

### Build a two-dimensional spatial index for scatter plots

Deferred. The x index narrows candidate rows and the debounced exact scan applies
y. This correctness path may be slower, as explicitly accepted for the initial
scatter-plot support. A k-d tree or quadtree is warranted only if later browser
profiling justifies the added complexity.

### Reuse the GPU vertex index

Rejected. Vertex offsets do not map one-to-one to datums across mark types, and
domain extraction belongs to collector/accessor semantics rather than mark
geometry.

### Add source-specific visible statistics

Deferred. BigWig and other indexed formats could answer source-side statistics,
but this would not solve static data and would introduce asynchronous,
source-specific semantics. Query the data that are actually rendered first.

### Expose debounce and transition duration immediately

Deferred. One internal quiet-period default and the existing
`domainTransition` behavior are sufficient to validate the feature. Public
timing knobs can be added later if concrete use cases need them.

## Risks and mitigations

- **A full scan causes a post-navigation pause:** use the flat x block index for
  x-sorted data, debounce exact scans for unsorted and two-dimensional data,
  benchmark both paths, and specialize only if measurements justify more code.
- **Indexing penalizes ordinary scales:** enable and build the x block index only
  for viewport-domain contributions on x-sorted collectors and invalidate it with
  collector data. Unsorted and ordinary collectors retain no index state.
- **Lazy publication bypasses the debounce:** route collector changes for
  viewport-domain scales through the same scheduler as positional events.
- **Stale lazy data changes the domain:** require readiness for the latest
  positional domains immediately before extraction.
- **Circular positional dependency:** reject zoomable positional targets,
  require at least one independent positional constraint, and never subscribe a
  target resolution to itself.
- **Shared members use different viewports:** calculate per member and union;
  do not assume one global x-resolution.
- **Interval boundary errors:** normalize reversed domains and add focused
  point, interval, x2, and y2 tests.
- **Empty viewports jump or collapse:** retain the last nonempty domain.
- **Transitions restart unnecessarily:** compare the configured target with the
  current domain using the existing `reconfigureDomain()` logic.
- **Domain source semantics affect zero/nice defaults:** treat visible domains
  as data-derived, not literal explicit domains, and test existing scale
  configuration behavior.

## KISS audit and required refactoring pass

Once all behavior works, critically evaluate the complete relevant diff before
finalizing it. This is a required implementation phase, not an optional review
note.

The audit must:

1. Inspect `git diff` for the entire feature, including tests, example, docs,
   and generated artifacts.
2. Measure focused production-code size before and after with `git diff --stat`,
   `wc -l`, or equivalent focused counts.
3. List every new class, helper, state flag, cache, and subscription layer and
   state which tested requirement justifies it.
4. Remove or inline abstractions used only once when doing so improves clarity.
5. Delete speculative cancellation, cache-release, multidimensional-index, or
   race machinery that benchmarks and tests do not require.
6. Prefer the one x block-index path plus the exact scan over a family of query
   strategies, and verify that ordinary and unsorted collectors have no index.
7. Re-run focused correctness and browser performance checks after
   simplification.

Added lines are a signal to re-check the design, not an automatic failure. More
code is acceptable only where it clearly establishes the public contract,
correct lifecycle behavior, or representative tests. If critical evaluation
finds that the working implementation is more complex than necessary, refactor
it before the feature is considered complete.

### Implementation audit result

The completed implementation retains one debounce timer, one lazy-readiness
flag, one positional-subscription list, and one map of flat block indexes. Each
directly corresponds to a tested requirement. A final refactor merged the index
configuration and built summaries into the same map entry, removing a parallel
cache and its synchronization path. No cancellation token, worker, tree,
reference counting, or multidimensional index was added.

The KISS review also moved the block-index implementation out of `Collector`
and the viewport-domain policy and scheduler out of the already large scale
orchestrators. Relative to the working implementation, `collector.js` shrank
from 1,010 to 583 lines, `domainPlanner.js` from 943 to 823, and
`scaleResolution.js` from 2,008 to 1,873. The focused modules
the data and scale `viewportDomain.js` modules contain the extracted responsibilities
without adding alternative strategies or lifecycle layers. The split adds
about 90 lines of module-boundary typing and delegation overall, an accepted
tradeoff for keeping collection and scale orchestration readable.

Focused tests cover boundaries, facets, compatible target reuse, reset,
scatter-plot filtering, debounce, transitions, lazy readiness, cycles, and
empty-domain retention.

On a local Node.js benchmark, a settled x-sorted x-only query took about 0.06 ms
for one million rows and had a 0.99 ms p95 for ten million rows. Building the
ten-million-row index took 121 ms and added 1.90 MiB of array buffers. An x/y
query over a 10% x-window had a 15.90 ms p95 for ten million rows, and the
one-million-row unsorted exact scan averaged 9.1 ms. The sorted collector had one
index and the unsorted collector had none. Browser verification with the
200,000-point example confirmed smooth interaction and a settled y-domain change
after wheel zoom.

## Unresolved questions

- Is approximately 150 ms the right internal quiet period across mouse-wheel,
  touchpad, drag-pan, and keyboard navigation? Start there and adjust from
  browser evaluation rather than adding public configuration.

## Implementation plan

### 1. Specify the viewport domain source

Outcome: schema and domain planning recognize
`domain: { "source": "viewport" }`, validate shared-scale conflicts, and retain
data-derived scale defaults.

Affected areas:

- `packages/core/src/spec/scale.d.ts`
- `packages/core/src/scales/domainPlanner.js`
- `packages/core/src/scales/domainPlanner.test.js`
- `packages/core/src/scales/scaleResolution.js`
- `packages/core/src/scales/scaleResolution.domain.test.js`
- `packages/core/src/spec/schema.test.js`

Verification:

- Schema accepts the viewport-domain reference and rejects malformed forms.
- Non-continuous targets reject viewport-domain mode.
- Repeated visible references are compatible in a shared resolution.
- Members without a configured domain can participate in a shared viewport-domain
  resolution.
- A view-level viewport-domain declaration selects the same resolution-wide mode.
- Mixing visible with literal, expression, or selection-driven domain sources
  fails with a contextual error.
- `zero`, `nice`, `domainMin`, `domainMax`, and `domainMid` retain their
  data-derived behavior.
- Visible mode is not reported as an explicit domain and waits for initialized
  data and initial-domain coverage.
- Zoomable positional targets and dependency cycles fail fast.
- A member with no independent continuous positional constraint fails fast.

Documentation and migration: add concise schema-derived JSDoc. No migration is
needed because the mode is opt-in.

Tentative commit: `feat(core): specify viewport-derived scale domains`

### 2. Add exact viewport-domain extraction

Outcome: autoscale-enabled, x-sorted collectors build a flat x block index on
demand, or at completion once enabled. X-only queries skip disjoint blocks,
merge blocks whose rows are all x-visible, and scan other candidates.
Two-dimensional queries scan x-selected rows and apply y exactly. Unsorted
collectors use the debounced exact scan. Collectors without viewport autoscaling
build no index.

Affected areas:

- `packages/core/src/data/collector.js`
- `packages/core/src/data/collector.test.js`
- `packages/core/src/scales/domainPlanner.js`
- `packages/core/src/view/unitView.js` if it is the smallest place to enable the
  collector index from configured scale contributions
- accessor/query helpers only if the existing metadata is insufficient

Verification:

- Points are included at documented viewport boundaries.
- x/x2 and y/y2 intervals use overlap semantics.
- Exact left/right edge cases and zero-width intervals follow the documented
  closed-point and half-open-interval rules.
- Reversed positional domains work.
- Facet batches are unioned.
- The x block-index query and full-scan reference path return identical domains.
- Fully disjoint x blocks are skipped, x-only blocks whose rows are all visible
  merge target min/max, and other x-candidate blocks scan their rows exactly.
- An x/y query scans rows from x-candidate blocks and applies y/y2 exactly.
- A viewport-domain query enables and builds the index when complete and its
  configured sort begins with the x field.
- A collector without viewport-domain contributors builds no index.
- An unsorted collector uses the exact scan and builds no index.
- Eligibility comes from existing collector sort metadata; autoscaling does not
  scan for sortedness or introduce sorting.
- Collector reset or replacement invalidates the index, and completion rebuilds
  an index that was already enabled by a viewport-domain query.
- Compatible y, color, and size targets reuse one x block partition; x-only
  targets retain their own min/max arrays.
- Index construction does not enable the mark's `buildIndex` or reorder
  collector data.
- X-sorted point and interval data use the x block index; unordered data remain
  exact through the full-scan path.
- A zoomable x/y scatter plot filters x candidates by y before extending size
  or color.
- Querying does not reorder data, repropagate collectors, or invalidate the
  ordinary full-domain cache.

Documentation and migration: none in this step.

Tentative commit: `feat(core): query scale domains within the viewport`

### 3. Debounce calculation and transition

Outcome: positional navigation and lazy collector updates schedule one domain
calculation after the quiet period, then use the existing domain transition.

Affected areas:

- `packages/core/src/scales/scaleResolution.js`
- `packages/core/src/scales/scaleResolution.domain.test.js`
- `packages/core/src/view/unitView.js` if collector-domain subscription routing
  needs a viewport-domain distinction
- `packages/core/src/view/dataReadiness.js`
- focused readiness tests

Verification:

- Repeated x/y domain events produce no calculation before the debounce and one
  calculation for the latest viewport afterward.
- Static data updates y, quantitative color, and size domains after navigation.
- A collector publication during scrolling does not bypass the debounce.
- An ordinary collector publication restarts the debounce, while a publication
  awaited for lazy readiness updates immediately once the latest viewport is
  covered.
- A ready lazy loaded flank is excluded immediately after the quiet period.
- An uncovered lazy viewport retains the current domain until the latest data
  are ready.
- A stale lazy window never updates the target domain.
- A shared target waits for all active contributing members, including members
  with different viewports, before applying one union and one transition.
- Mixed static/lazy contributors do not apply a partial union while a required
  lazy member is unready; inactive members do not block readiness.
- Readiness uses configured visibility consistently with data-domain membership;
  a configured-visible contributor is not accidentally omitted by a generic
  effective-visibility filter.
- Empty ready viewports retain the last nonempty raw extent.
- Changing active members, target accessors, or domain-source configuration
  clears the retained extent so removed data cannot leave a stale domain.
- Existing `domainTransition: true` animates and `false` applies immediately.
- Autoscaling does not call collector repropagation or mark buffer-update paths.

Documentation and migration: none in this step.

Tentative commit: `feat(core): debounce viewport autoscale updates`

### 4. Add the example and documentation

Outcome: a self-contained point example visibly demonstrates delayed viewport
autoscaling with less prominent background noise, and the scale grammar
documents the feature.

Affected areas:

- `examples/docs/grammar/scale/viewport-autoscale.json`
- `docs/grammar/scale.md`
- generated schema/docs artifacts and example snapshots as required

Verification:

- The example validates and initializes in the shared example suite.
- A browser smoke test confirms that y remains stable while navigating and
  transitions shortly after navigation pauses.
- Local extrema, rather than off-viewport noise, determine the settled domain.
- Geometric point sizing remains visible and the reduced stochastic multiplier
  makes the signal structure clearer.

Documentation and migration: document the opt-in domain source, inferred
positional constraints, delayed calculation, transition behavior, and empty
viewport behavior. No migration is needed.

Tentative commit: `docs(core): demonstrate viewport autoscaling`

### 5. Benchmark, critically evaluate KISS, and simplify

Outcome: the working result is measured, criticized, and refactored to the
smallest design that preserves the feature contract and acceptable interaction.

Affected areas:

- the complete feature diff
- focused benchmark or profiling harness only if it has lasting value
- any production files whose new structure fails the KISS audit

Verification:

- Profile the docs example and synthetic static datasets with approximately
  1 million, 5 million, and 10 million points.
- Confirm no viewport-domain work occurs continuously during navigation.
- Record x block-index construction time and memory, block checks, boundary-row
  scans, and post-debounce calculation time against the full-scan reference.
- On a recorded reference browser and machine, require warm x-only queries over
  x-sorted point data to complete at p95 within 16 ms for 1 million rows and 50
  ms for 10 million rows. Revisit block size or implementation layout if they do
  not.
- Build the index at completion when it has already been enabled; if the first
  viewport-domain query arrives after completion, build it on that query. For the
  single-facet 10-million-row reference, keep index construction within 250 ms
  and memory below 4 MiB for one x partition plus one target min/max pair on the
  recorded reference machine.
- Confirm that the x block index is built only for x-sorted collectors with
  enabled viewport autoscaling and that compatible targets reuse the x
  partition.
- Confirm that unsorted million-row data take the debounced exact path without
  allocating index state. Benchmark and report unsorted and two-dimensional
  scans, but do not add another index in this initial implementation.
- Confirm no additional lazy-source requests are caused solely by autoscaling.
- Inspect production line-count and diff statistics before and after the
  refactoring pass.
- Re-run focused Vitest suites, example validation, workspace TypeScript checks,
  lint, and the browser smoke test after simplification.

Documentation and migration: update the plan's resolved questions or final
implementation notes if measurements change a documented behavior. No migration
is expected.

Tentative commit: `refactor(core): simplify viewport autoscaling`

## Acceptance criteria

- `domain: { "source": "viewport" }` is a documented, schema-valid opt-in mode
  for continuous data-derived scales.
- A genomic y-scale excludes values outside the visible x-domain even when they
  are present in a larger lazy-loaded window.
- Static data autoscale after positional navigation.
- Quantitative size and color scales in zoomable x/y scatter plots use points
  inside both positional domains.
- Domain calculation and transition start once after the trailing quiet period,
  not during every navigation frame.
- Lazy data update the target only when they cover the latest viewport.
- Shared scales union the viewport-derived contributions of their active
  members only after every active contributor is ready for its own viewport.
- Empty ready viewports retain the last nonempty raw extent; membership,
  accessor, or domain-source changes clear it.
- Existing scale configuration and `domainTransition` semantics are preserved.
- Visible mode remains data-derived throughout initial-domain and explicit-domain
  handling, including `zero` and `nice` defaults.
- Autoscaling does not repropagate data or rebuild GPU buffers.
- The full scan is a correct reference path, and x block-index queries produce
  identical domains with the documented point and half-open interval boundaries.
- The x block index is built only for autoscale-enabled, x-sorted collectors and
  is not built for unsorted collectors or collectors never enabled for viewport
  autoscaling.
- Compatible viewport-autoscaled target scales reuse the x block partition.
- The new documentation example is based on the geometric-zoom point example
  and makes its normal stochastic noise less prominent.
- Warm x-only queries meet the stated 1-million and 10-million-row browser
  budgets, and 10-million-row index construction meets its time and memory
  budgets. Slower unsorted and two-dimensional exact paths remain debounced and
  are reported without adding speculative indexes.
- The completed implementation undergoes the required KISS audit, and any
  unjustified abstractions or code paths are removed or refactored before the
  feature is considered complete.

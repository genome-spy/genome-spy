# Grouping guarantees in the dataflow

Proposed for GenomeSpy Core. The first delivery uses the Epilogos summary
pipeline to verify grouping guarantees and a bounded-memory path through
`stack`. A second delivery applies the same guarantee to `aggregate`.

## Motivation and scope

`categoricalCoverage` emits one row per present category for each span. All rows
of that span are adjacent. `stack` currently buffers a whole facet and
partitions its rows by `groupby` before it lays out each stack. The ephemeral
Epilogos benchmark reduced summary computation by 21–23% by stacking one
consecutive span at a time. The largest group buffer in the 264-profile, 16 Mb
workload was about 303,000 rows. A single span in this recipe has at most 15
rows.

Core's dataflow owns the guarantee. The transforms use their existing `groupby`,
`sort`, and offset settings. The first delivery covers exact contiguous keys.
Deriving guarantees from general sorts, skipping within-group sorts,
incrementally accumulating reductions, and binning wide genomic windows are
separate opportunities.

DataFusion associates ordering properties with operator outputs and uses them to
select algorithms for aggregation and windows. GenomeSpy can start with the
single property needed for consecutive groups.
[DataFusion input ordering](https://docs.rs/datafusion/latest/datafusion/physical_plan/enum.InputOrderMode.html)

## Contract

- An output can guarantee that each equal tuple of named fields occurs in one
  consecutive run within a logical facet. An unfaceted publication is one
  logical partition. Physical file events can occur within a group.
- A producer establishes the guarantee for canonical field paths and a known key
  equality. Start with the finite numeric and string coordinates validated by
  `categoricalCoverage`. Resolve its output aliases before publishing the fact.
  A sort direction or a shorter grouping key requires its own guarantee.
- A node that preserves input order can forward the fact if it also preserves
  the key fields. A filter or clone can forward it directly. A formula or
  ordinary lookup with explicit output fields can forward it when those writes
  are disjoint from the key paths. Distinguish a parsed read path from a literal
  top-level write when checking overlap. Unknown transforms, regrouping, and
  reordering conservatively return unknown.
- Resolve the input fact from the optimized primary edge before processing each
  publication. A plain collector retains the fact with the rows it materializes,
  including the collector inserted before a derived lookup. Cached replay uses
  the fact for that snapshot. An initialized descendant cannot keep relying on a
  former parent after the graph is relinked.
- Keep `FlowBatch` for existing file and facet events. Carry the guarantee once
  per output or snapshot. A per-group event would add dispatch and require
  collectors to store and replay a second set of boundaries for information the
  consumer can read from the rows.
- Track absence of physical file events separately from key contiguity. Coverage
  can establish both facts. Forward the file fact only through nodes that cannot
  introduce physical file events.

A future sort property can establish runs for key prefixes when comparator ties
agree with grouping equality. For example, a numeric sort may tie `1` and `"1"`
even though `stack` groups them separately. SampleView's k-way merge likewise
needs sorted starts in every input list. Coverage establishes its output fact
from its own checks and emission order.

Relevant paths are the
[dataflow architecture](../../packages/core/docs/architecture/views-and-dataflow.md),
[flow builder](../../packages/core/src/view/flowBuilder.js),
[collector](../../packages/core/src/data/collector.js),
[coverage sweep](../../packages/core/src/data/transforms/categoricalCoverage.js),
and [SampleView merge](../../packages/app/src/sampleView/mergeFacets.js).

## Milestone 1 — Stream contiguous stacks

Establish the property at `categoricalCoverage`, preserve it through the
Epilogos path, and consume it in `stack` for an exact matching key within a
facet. Capture the key before writing any output fields. Keep the current run's
rows, then run the existing sort and offset logic on key change, facet change,
or completion. Reuse the current publication, picking identity assignment, and
cache invalidation lifecycle.

Start with paths guaranteed to emit only logical facet events, as coverage
consumes physical file events. Keep file provenance independent of key
contiguity. The existing buffered stack handles file-emitting paths and
uncertified input. To extend eligibility to file-emitting streams, preserve each
row's physical origin through the within-group sort and carry the last emitted
file across runs. In particular, the first file event may occur after rows have
arrived, which can affect the provenance assigned to those earlier rows.
[File replay](../../packages/core/src/data/fileBatchUtils.js)

### Verification

- Compare output rows, their order, and stack bounds with the buffered path.
  Include a negative contribution, tied sort keys, a second run, and the same
  key in the next facet. Assert that a completed run reaches downstream before
  the facet completes. Cover a key overwrite and an unproven repeating key to
  exercise fallback. Keep the existing cross-file sorting regression.
- Use an inline headless spec to exercise coverage, the collector inserted by
  the derived lookup, and stack. Republish the background after a parameter
  change, then verify the primary collector revision, source load count, and
  updated stack bounds. Attach a new consumer with an existing unit view's
  completed collector as its data parent. Verify replay from that collector
  without a source reload. Reuse the patterns in
  [named data scope tests](../../packages/core/src/data/namedDataScope.test.js)
  and
  [flow publication tests](../../packages/core/src/data/flowOutput.push.test.js).
- Check the real ChromHMM demo on initial load, after a cohort change, and after
  switching between S1 and Frequency. Also run the
  [information-offset sequence logo](../../examples/docs/grammar/transform/stack/sequence-logo.json)
  as a buffered-path guard. Check that the summary collector retains facet order
  and picking IDs.
- Compare paired warmed timings for the opening bookmark and the simulated
  264-profile workload. Report the largest stack buffer and the coverage
  collector size separately. The first path should reduce stack buffering to the
  longest run and avoid regrouping work on certified input.

Document the internal contract in the Core dataflow architecture notes and
record the performance change in a Core changeset. Tentative commit
`perf(core): stream stacks over contiguous groups`.

## Milestone 2 — Stream contiguous aggregates

Reuse the property and the existing aggregate evaluators for one certified
single-key group at a time. This reduces the retained input to the largest group
and also works for reducers that need all group values, including exact
quantiles. Preserve the aggregate's first representative of the grouping key,
and its behavior for empty grouped and ungrouped input.

For compound keys, require a proof for every prefix in declaration order.
Full-key runs alone can change observable order. With input
`(A,x), (B,y), (A,z)`, the current nested traversal emits `A/x, A/z, B/y`. That
case is a guard for the general path. The Epilogos background table arrives in
sample order with repeated state keys and is a useful fallback example.

### Verification

- Use a headless grouped input with several contiguous runs, a facet boundary,
  and a physical file boundary inside a group. Compare aggregate output order
  and values with the current implementation. Include an empty group case and
  one reducer that needs the group's values.
- Use
  [aggregate tests](../../packages/core/src/data/transforms/aggregate.test.js)
  to guard compound output order and key interning. Verify a genuinely grouped
  large input reduces buffered rows and gains time. Treat additive per-key
  accumulators for unordered data as a separate design.

Document the eligibility rule beside the internal guarantee and record the
performance change in a Core changeset. Tentative commit
`perf(core): aggregate contiguous groups incrementally`.

## Follow-up decisions

Choose a first sort-derived proof when a workload needs it and the producer can
establish the key equality behind its comparator. For compound aggregate keys,
evaluate whether the next producer can establish every prefix directly or can
derive them from that stronger sort guarantee.

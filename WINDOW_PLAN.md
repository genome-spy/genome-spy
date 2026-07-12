# Window Transform Plan

## Use Case and Rationale

The immediate use case is an indexed FASTA track that displays the reference
sequence and amino-acid translations in all three reading frames on both
strands. The existing `flattenSequence` transform can expand a FASTA sequence
chunk into one row per base, but assembling the overlapping triplets needed for
translation currently requires a new operation.

A sequence-specific chunking transform would solve that example, but it would
encode a narrow operation in the grammar. A general `window` transform is a
better fit. After `flattenSequence`, `lead` operations can add the following two
bases to every row. Each surviving row then anchors one triplet, and its absolute
position modulo three assigns it to a reading frame. The same transform also
supports broadly useful tasks such as ranks, running aggregates, lag/lead
comparisons, and filling values within sorted groups.

Vega already defines a mature window-transform grammar and observable
semantics. GenomeSpy should follow Vega's configured properties, operation
names, defaults, output naming, frame rules, and peer handling where applicable.
The implementation must nevertheless be native to GenomeSpy's data flow:
GenomeSpy propagates complete batches through `FlowNode`s and does not expose
Vega's incremental pulses, tuple change sets, or operator graph.

## High-Level Plan

1. Define a Vega-shaped public specification for the window transform.
2. Implement a batch-oriented `WindowTransform` that partitions and sorts
   buffered rows, computes window results, and emits the original rows in their
   original order.
3. Add window-only operations first and establish the hard semantic cases:
   peers, frames, grouping, overwrites, output ordering, and batch boundaries.
4. Add aggregate window operations using sliding state adapted from Vega's
   implementation rather than repeatedly slicing each frame.
5. Register and document the transform, including explicit notes about
   GenomeSpy's complete-batch execution model.
6. Extend the general `reverse` expression helper to strings and build the
   six-frame FASTA example using `flattenSequence`, `lookup`, `window`, formulas,
   and arrow marks.

## Goals

- Add a general `"window"` transform with Vega-compatible configured
  properties.
- Match Vega semantics for partitioning, sorting, peers, frames, window-only
  operations, aggregate operations, and default output names.
- Recompute complete GenomeSpy flow batches instead of porting Vega's
  incremental pulse machinery.
- Preserve the input row count and input propagation order while calculating
  results in partition sort order.
- Respect file and facet batch boundaries. A window must never cross a facet or
  another explicit flow-batch boundary.
- Integrate with GenomeSpy's clone optimizer and collector replay behavior.
- Keep the implementation efficient enough for lazy genomic windows and other
  interactive data flows.
- Use the six-frame FASTA translation track as an integration example after the
  generic transform is complete.

## Non-Goals

- Do not port Vega's `Dataflow`, `Pulse`, `SortedList`, tuple identity, or
  incremental add/remove handling.
- Do not add FASTA-, codon-, strand-, or sequence-specific behavior to the
  window transform.
- Do not make transform configuration reactive in the first implementation.
- Do not make windows span explicit GenomeSpy flow batches.
- Do not change the existing `aggregate`, `collect`, or `flattenSequence`
  contracts unless a small shared helper clearly reduces duplication.

## Public Transform Contract

The configured properties should use the same names and roles as Vega:

```ts
export interface WindowParams extends TransformParamsBase {
    type: "window";
    sort?: CompareParams;
    groupby?: Field[];
    ops: WindowOp[];
    fields?: (Field | null)[];
    params?: (number | null)[];
    as?: (string | null)[];
    frame?: [number | null, number | null];
    ignorePeers?: boolean;
}
```

The initial operation union should match Vega's current window-only operations:

```text
row_number, rank, dense_rank, percent_rank, cume_dist, ntile,
lag, lead, first_value, last_value, nth_value, prev_value, next_value
```

The completed transform should also accept GenomeSpy's supported aggregate
operations where their semantics match Vega:

```text
count, valid, sum, min, max, mean, q1, median, q3, variance
```

Compatibility details:

- `groupby` omitted or empty means one partition in the current flow batch.
- `sort` uses the existing `CompareParams` shape. Without `sort`, observed row
  order defines the window and rows are not peers.
- `frame` defaults to `[null, 0]`. Bounds are inclusive row offsets; `null`
  means unbounded. Bounds are clamped to the partition.
- `ignorePeers` defaults to `false`. Peer expansion applies only when `sort` is
  defined and only to operations that use the frame.
- `ops`, `fields`, `params`, and `as` are positionally aligned.
- A missing or `null` `as` entry uses Vega's default naming convention: the
  operation name, followed by `_<field>` when the operation has a field.
- Operations that do not use a field accept `null` in `fields`.
- `lag` and `lead` default their offset to one.
- `ntile` and `nth_value` require positive integer parameters.
- Output fields may intentionally overwrite existing fields, as in Vega.
- Invalid operations, invalid frames, missing required fields, and mismatched
  configured array lengths fail during transform construction with clear
  messages. This is intentionally stricter than relying on undefined array
  entries at runtime.

The public JSDoc in `packages/core/src/spec/transform.d.ts` must describe
user-visible semantics and use the repository's `__Default value:__`
convention.

## GenomeSpy Data-Flow Design

### Batch lifecycle

`WindowTransform` should follow the proven buffering pattern in
`AggregateTransform` and the modification behavior in `StackTransform`:

- `handle(datum)` appends the datum to the current buffer.
- `beginBatch(flowBatch)` flushes the preceding non-empty buffer, clears it,
  and then forwards the new batch marker with `super.beginBatch(flowBatch)`.
- `complete()` flushes the final buffer before `super.complete()`.
- `reset()` clears all buffered rows and operation state without emitting data.

Flushing before forwarding the next batch marker is essential. It ensures that
the previous facet's output reaches downstream collectors while that facet is
still active, matching the existing aggregate-transform facet behavior.

### Mutation and cloning

The transform should report `BEHAVIOR_MODIFIES` and write results to buffered
rows. The flow builder already inserts `CloneTransform` before modifying
transforms, and the optimizer preserves clones at branches and below collectors.
This reuses GenomeSpy's single cloning policy instead of cloning every row again
inside the window implementation.

Add a dataflow-level test with a sibling branch to verify that delayed window
writes cannot leak into the sibling. Also test a window below a collector so
collector replay retains immutable stored input.

### Partitioning, sorting, and output order

For each flushed batch:

1. Keep the batch buffer in observed input order.
2. Build partitions using `groupby` field accessors. Use an ordinary `Map` for
   the common single-field case and nested grouping only for composite keys.
   Preserve key types; do not stringify composite keys.
3. Create a stable sorted view of each partition when `sort` is configured.
   Reuse `field` accessors and `vega-util`'s `compare` semantics. Do not reorder
   the original buffer.
4. Compute peer boundaries once per sorted partition.
5. Evaluate every configured operation in sorted partition order.
6. After every partition has been updated, propagate the original buffer in
   observed input order.

Vega's window transform modifies source tuples but does not turn the transform
into a sorting transform. Preserving input propagation order is therefore part
of compatibility, not merely an implementation choice.

### Frame and peer calculation

Use zero-based, half-open internal indices even though configured frame bounds
are inclusive offsets:

```text
start = frame[0] == null ? 0 : clamp(row + frame[0], 0, count)
stop  = frame[1] == null ? count : clamp(row + frame[1] + 1, 0, count)
```

When sorting is active and `ignorePeers` is false, expand `start` and `stop` to
include all rows that compare equal at the corresponding boundary. Precomputed
peer starts and stops avoid repeated bisector searches.

An empty frame is valid. Window value operations return `null` where Vega does;
aggregate operations follow the corresponding aggregate's empty-window result.
Port representative Vega tests to pin these details down instead of inferring
them during implementation.

### Operation compilation

Compile configured operations once in the constructor into fixed update
functions. Each compiled operation should capture its accessor, parameter, and
output field so the per-row loop does not branch on operation names.

Keep window-only operations in a small `windowOps.js` module modeled on Vega's
`WindowOps`. It should operate on a minimal partition context containing:

```text
rows, index, start, stop, comparator, peerStart, peerStop
```

Operation-specific state such as dense rank, previous non-null value, and next
non-null scan position is reset for every partition.

### Aggregate windows

Do not implement aggregate windows by taking `partition.slice(start, stop)` for
every row. Unbounded running frames would become quadratic, which is unsuitable
for genomic data and interactive reloads.

Adapt the useful state-machine idea from Vega's `WindowState`:

- Maintain the preceding and current frame bounds.
- Remove rows that left the frame and add rows that entered it.
- Set aggregate results on the current row after state is updated.
- Share input accessors between multiple aggregate operations on the same
  field.

Reuse the operation names and numeric semantics from GenomeSpy's existing
`aggregateOps.js`, but do not force its whole-array function interface into the
hot path. Window aggregates need add/remove state. Keep this state local to the
window implementation unless a later refactor can simplify both transforms.

For aggregates that require ordered values (`min`, `max`, quartiles, and
median), adapt Vega's tuple-store approach or an equivalent removable ordered
store. Preserve correctness with duplicate values and missing values. Add
focused complexity tests or operation-count assertions for large running
frames; avoid timing-based unit tests.

### Relationship to Vega source

Use these local references during implementation:

- `tmp/vega/packages/vega-transforms/src/Window.js`
- `tmp/vega/packages/vega-transforms/src/util/WindowState.js`
- `tmp/vega/packages/vega-transforms/src/util/WindowOps.js`
- `tmp/vega/packages/vega-transforms/src/util/AggregateOps.js`
- `tmp/vega/packages/vega-transforms/test/window-test.js`

Copy only small, well-understood algorithms that fit GenomeSpy's batch model.
Retain appropriate attribution for adapted code. Do not carry over pulse,
tuple-id, incremental-removal, or sorted-list infrastructure.

## Detailed Implementation Steps

### 1. Lock down the public contract and window-only semantics

Files:

- `packages/core/src/spec/transform.d.ts`
- `packages/core/src/data/transforms/window.js`
- `packages/core/src/data/transforms/windowOps.js`
- `packages/core/src/data/transforms/window.test.js`
- `packages/core/src/data/transforms/transformFactory.js`

Work:

- Add `WindowParams`, `WindowOp`, and the initial window-only operation union.
- Register `window` in the transform factory.
- Validate and normalize aligned configuration arrays once.
- Implement batch buffering, grouping, stable sort views, peer boundaries,
  frames, default field names, and original-order propagation.
- Implement all Vega window-only operations listed above.
- Cover overwriting output fields explicitly.
- Test `reset`, `complete`, file batches, facet batches, empty input, singleton
  partitions, nested field access, composite sorting, and composite grouping.
- Port a focused subset of Vega's window tests rather than copying its entire
  incremental-dataflow suite.

Acceptance criteria:

- The transform matches Vega for representative single- and multi-partition
  window-only cases.
- Sorted calculations do not change downstream row order.
- Peer-aware and row-only frames differ exactly where expected.
- No window crosses a GenomeSpy batch boundary.
- Branch and collector tests prove that mutations are isolated correctly.

Tentative commit:

```text
feat(core): add window transform operations
```

### 2. Add sliding aggregate operations

Files:

- `packages/core/src/data/transforms/windowAggregateOps.js`
- `packages/core/src/data/transforms/window.js`
- `packages/core/src/data/transforms/window.test.js`
- `packages/core/src/spec/transform.d.ts`

Work:

- Extend the `ops` union with supported aggregate operations.
- Add shared per-field sliding state and add/remove accumulators.
- Implement empty-frame, missing-value, duplicate-value, and peer-expanded
  behavior.
- Compare representative results against Vega for bounded, running, centered,
  unbounded, and empty frames.
- Verify that running and moving aggregates do not rescan the entire frame for
  each row.

Acceptance criteria:

- Supported aggregate operations match Vega on the ported fixtures.
- Large running frames use incremental state rather than quadratic slicing.
- Multiple operations on one field reuse input access and stored values.

Tentative commit:

```text
feat(core): add aggregate window operations
```

### 3. Document and expose the transform

Files:

- `docs/grammar/transform/window.md`
- `examples/docs/grammar/transform/window/window-transform.json`
- `mkdocs.yml`
- generated Core schema artifacts as required by the build

Work:

- Document partitions, calculation order versus output order, peer behavior,
  frames, all operations, default names, and batch semantics relevant to users.
- Add a compact example that demonstrates both `lead` and a moving aggregate.
- Add the transform to the grammar navigation.
- Regenerate the schema and verify the `WindowParams` documentation macro.

Acceptance criteria:

- The schema accepts valid Vega-shaped configurations and rejects unsupported
  operations and malformed aligned arrays.
- The documentation example renders and makes frame behavior understandable.

Tentative commit:

```text
docs(core): document the window transform
```

### 4. Generalize string reversal for strand plumbing

Files:

- `packages/core/src/utils/expression.js`
- `packages/core/src/utils/expression.test.js`
- expression documentation if the helper list is explicit

Work:

- Extend the existing `reverse` helper to accept strings while retaining its
  current non-mutating array behavior.
- Reverse strings by Unicode code point and document that behavior.
- Keep nucleotide complementation declarative through a lookup table; do not
  add a biology-specific `reverseComplement` helper.

Tentative commit:

```text
feat(core): support reversing strings in expressions
```

### 5. Validate the motivating six-frame FASTA use case

Files:

- a new JSON example beside
  `examples/docs/genomic-data/examples/indexed-fasta-sequence-track.json`
- a new genomic-data example page under `docs/genomic-data/examples/`
- `mkdocs.yml`

Pipeline:

```text
indexedFasta
  -> flattenSequence
  -> absolute-position and uppercase formulas
  -> nucleotide-complement lookup
  -> window lead(base, 1/2) and lead(complement, 1/2)
  -> filter incomplete terminal triplets
  -> forward- and reverse-codon formulas
  -> genetic-code lookups
  -> three forward and three reverse amino-acid lanes
```

Visualization requirements:

- Keep the reference-base layer from the existing FASTA example as a separate
  branch of the shared lazy source.
- Use `pos % 3` for stable absolute frame lanes when lazy windows change.
- Use `arrow` marks with the `arrow-block-notch` style.
- Use forward and reverse arrow directions for their respective strands.
- Color start and stop codons distinctly and overlay ranged text labels.
- Reuse root-level named datasets for nucleotide complements and the genetic
  code.
- Check whether the style's outside head placement overlaps adjacent codons;
  override only the necessary style properties if visual inspection shows a
  problem.

Acceptance criteria:

- Panning across indexed-FASTA window changes does not reshuffle reading-frame
  lanes.
- Forward and reverse translations agree with known codons.
- The last two bases of each loaded chunk do not produce partial-codon lookup
  rows.
- The example uses the generic window transform and contains no sequence-specific
  window logic.

Tentative commit:

```text
docs(core): add six-frame FASTA translation example
```

## Test Matrix

Permanent unit tests should cover behavior and contracts rather than mirror the
implementation line by line:

- configuration normalization and validation;
- default and explicit output names;
- observed order without sorting;
- stable calculation order with single- and multi-field sorting;
- original downstream order after sorted calculation;
- one, single-field, and composite-key partitions;
- every window-only operation;
- default, bounded, centered, unbounded, and empty frames;
- peers with both values of `ignorePeers`;
- aggregate operations with missing and duplicate values;
- output-field overwrites;
- reset and replay;
- file- and facet-batch isolation;
- branch and upstream-collector mutation isolation;
- the FASTA triplet pipeline with a small inline sequence.

Use focused assertions for individual operation semantics. A compact snapshot
is appropriate for one representative multi-operation fixture once the output
contract is stable.

## Verification Commands

Run incrementally from the repository root:

```text
npx vitest run packages/core/src/data/transforms/window.test.js
npx vitest run packages/core/src/utils/expression.test.js
npm --workspaces run test:tsc --if-present
npm run lint
npm -w @genome-spy/core run build:schema
npm run build:docs
```

For the FASTA example, start the development server and inspect it at several
zoom levels and on both sides of a lazy-window transition. Confirm arrow
geometry, text fitting, frame stability, and translation values in the browser.

## Risks and Decisions to Revisit

- **Aggregate scope:** Ordered removable aggregates are the most complex part.
  Keep them in a separate commit so the correct window-only implementation can
  be reviewed independently.
- **Output overwrite semantics:** Match Vega where practical and pin the chosen
  behavior with tests, especially when a later operation reads a field that an
  earlier operation overwrites.
- **Large partitions:** A window inherently materializes partitions for sorting
  and lead operations. Document this and avoid extra full-size copies beyond
  the batch buffer and partition index arrays.
- **Comparator reuse:** Prefer the established `CompareParams`, `field`, and
  `vega-util.compare` behavior. Extract a shared comparator helper only if doing
  so simplifies both `Collector` and `WindowTransform` without changing string,
  null, or nested-field ordering.
- **Peer indexing:** Precompute peer extents. Repeated scans or bisector work in
  the per-row/per-operation loop would multiply costs unnecessarily.
- **Vega drift:** Record the Vega version or source revision used for semantic
  comparison in implementation comments or tests so later upgrades can be
  evaluated intentionally.

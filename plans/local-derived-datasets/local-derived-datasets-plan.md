# Locally published derived datasets

This draft covers lexical publication for
[issue #714](https://github.com/genome-spy/genome-spy/issues/714).

## Goal and grammar

Let a pipeline publish a table for reuse while its rows continue to later
transforms or marks. In the RPE-1 plot, the label pipeline computes one summary
row per lane and looks up the width and bracket position on each measured gene
row. A named table replaces the previous `row_number` and zero-stride
workaround.

The branch below publishes the maximum measured width per lane. The lookup adds
that width to each original row.

```json
[
  {
    "type": "branch",
    "transform": [
      {
        "type": "aggregate",
        "groupby": ["lane"],
        "fields": ["labelWidth"],
        "ops": ["max"],
        "as": ["laneWidth"]
      },
      { "type": "publish", "dataset": "laneWidths" }
    ]
  },
  {
    "type": "lookup",
    "from": { "name": "laneWidths" },
    "key": "lane",
    "values": ["laneWidth"]
  }
]
```

## Contract and scope

- A string `dataset` declares a table in the publisher's view. A later
  `lookup.from.name` or descendant `data.name` can read it through the existing
  lexical data scope. Names are unique within a view and can be shadowed by a
  descendant. Import instances own their tables independently.
- A publisher captures one unpartitioned table from eager data. Readers receive
  complete results, including empty tables, when the pipeline recomputes.
  Pending and failed inputs follow existing readiness and error reporting.
- Derived tables are read-only. The dataset mutation API continues to accept raw
  named inputs. Direct readers and lookups can use derived tables, including in
  acyclic pipelines that publish further derived tables.

## Implementation

Core resolves names in
[`NamedDataScope`](../../packages/core/src/data/namedDataScope.js).
[`flowBuilder`](../../packages/core/src/view/flowBuilder.js) attaches a
[`DerivedCollector`](../../packages/core/src/data/derivedCollector.js) at the
publisher's position as a side edge. Existing clone rules isolate the captured
rows from later mutations. Named tables with their own transforms also have a
precedent in [Vega data definitions](https://vega.github.io/vega/docs/data/).

A lookup borrows the collector through
[`SideInputBinding`](../../packages/core/src/data/sideInputBinding.js). A cache
on the primary path lets it replay when the table finishes without resetting the
producer. A direct reader attaches downstream of the collector. Both release
their dependencies without pruning the producer's table. Rollback detaches
partially wired readers from the live table.

## Verification

1. Run the focused scope, replay, and lifecycle tests. Check same-input lookups,
   descendant reads, parameter changes, data replacement, empty and failed
   inputs, and disposal. Verify a later mutation of the main row does not change
   the captured row.
2. Build the Core schema and validate the local example. Run Core type checking,
   relevant lint, and release checks. Confirm the local docs and Core minor
   changeset describe the implemented scope.
3. Lay out the
   [private RPE-1 fixture](../../private/staggered-gene-labels/paper-rpe1-derived-datasets.json)
   at two sizes. Verify one derived row per lane, 57 gene labels, and 16 group
   connectors. Change the font size to check that the lane positions update.

The earlier linear-scale fixture produced byte-identical WebGL PNGs against the
original private control at 1280 × 1140 and 900 × 760, including after changing
the font size and line spacing. The current band-scale fixture passed the
headless layout checks at both sizes and repacked from two to three lanes on
resize and to four lanes after increasing the font size. The local docs example,
Core tests, type checking, schema generation, and release checks passed after
the split.

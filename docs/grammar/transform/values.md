# Values

The `"values"` transform projects a field into an array parameter while passing
all input rows onward. For example, it can load precomputed cluster boundaries
from a file or publish boundaries calculated from metadata for an index scale's
[`gapPositions`](../scale.md#grouping-gaps).

## Parameters

SCHEMA ValuesParams

## Output parameters

`param` declares a read-only parameter in the owning view's scope. Do not also
declare it in `params`. Descendant views can read the output in expressions;
ancestors and sibling views need the producer at their common ancestor.

The output starts as an immutable `[]`. Each successfully completed input
publishes an immutable array in input order, including duplicates. An empty
result publishes `[]`, and unchanged arrays do not notify consumers again.
Loading or processing failures retain the last successful value. Missing fields,
non-scalar values, and non-finite numbers cause an error.

Output parameters cannot be changed through the embedding API and are not saved
in bookmarks. They can drive scale and visual expressions. Reading an output in
another data source or transform expression is not supported yet.

## Loading precomputed values

A normal [eager source](../data/eager.md) can load a table of cuts:

```json
{
  "data": {
    "url": "cuts.csv",
    "format": { "parse": { "cut": "number" } }
  },
  "transform": [{ "type": "values", "field": "cut", "param": "cuts" }],
  "scales": {
    "x": {
      "type": "index",
      "domain": [0, 5],
      "gapPositions": { "expr": "cuts" },
      "gapWidth": 10
    }
  }
}
```

The input table could contain `cut` values `2` and `4`. The scale then inserts
gaps before indices 2 and 4. Sorting and deduplication of gap positions are scale
behavior; `"values"` itself preserves the prepared rows' order and duplicates.

Inline, named, sequence, and supported [lazy inputs](../data/lazy.md) can also
publish outputs. Lazy outputs describe the last successfully loaded window,
which may include prefetched data or summary bins.

## Deriving cuts in a branch

A [`"branch"`](branch.md) can filter or summarize metadata for the output while
the main pipeline keeps all rows. In this synthetic heatmap, a slider controls
which cluster boundaries become gaps. All 18 cells remain visible.

EXAMPLE examples/docs/grammar/transform/branch-values.json height=170

The branch uses `window` to compare adjacent cluster labels, then filters
boundaries by strength. The upstream `collect` caches metadata so changing the
ordinary `minimumStrength` parameter replays the branch without reloading data.

## Empty lazy data

A branch can count rows with [`"aggregate"`](aggregate.md), then publish the
count with `"values"`. The output starts at `[]` before any successful load;
`[0]` means a successfully empty result. This BigWig example starts in an empty
region. Change **Region** to see a region with signal.

EXAMPLE examples/docs/grammar/transform/lazy-empty-data.json height=180

The branch summarizes incoming records while the signal layer keeps the
original rows. The message layer has its own singleton row and reads
`recordCounts[0]`, so it remains available when the signal input is empty.

The message describes the last successfully loaded region. While a replacement
is loading or has failed, the previous count and message remain. A record with
a zero signal value still counts as data.

!!! disclaimer ""

    The Forebrain E12.5 R1 H3K27ac track derives from ENCODE file
    [ENCFF549YDI](https://www.encodeproject.org/files/ENCFF549YDI/), experiment
    [ENCSR966AIB](https://www.encodeproject.org/experiments/ENCSR966AIB/), produced
    by the Bing Ren laboratory for [Gorkin et al.
    (2020)](https://doi.org/10.1038/s41586-020-2093-3). The
    [regional extract](https://data.genomespy.app/datasets/encode-mouse-fetal-development-mm10/v4/README.md)
    retains four mm10 windows. The empty example region lies outside them;
    missing data in this extract does not indicate biological absence of H3K27ac.

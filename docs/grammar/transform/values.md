# Values

The `"values"` transform projects a field into an array parameter while passing
all input rows onward. For example, it can load precomputed cluster boundaries
from a file or publish boundaries calculated from metadata for an index scale's
[`gapPositions`](../scale.md#grouping-gaps).

## Parameters

SCHEMA ValuesParams

## Output parameters

A string `param` declares a read-only parameter in the owning view's scope.
Do not also declare that local output in `params`. Descendant views can read
the output in expressions.

To share a child transform's output with its ancestors and siblings, declare
`{ "name": "categories", "output": true }` in the common ancestor's `params`
and use `"param": { "name": "categories", "push": "outer" }` on the transform.
This binds the nearest ancestor declaration with that name. The target must
be a read-only output, with exactly one producer. It is available to expressions
before the child is constructed, and its producer remains active when the
child's presentation is hidden. Replace the producer's data to update the output;
removing the producer requires disposing its owning composition as well.

The output starts as an immutable `[]`. Each successfully completed input
publishes an immutable array in input order, including duplicates. An empty
result publishes `[]`, and unchanged arrays do not notify consumers again.
Loading or processing failures retain the last successful value. Missing fields,
non-scalar values, and non-finite numbers cause an error.

Output parameters cannot be changed through the embedding API and are not saved
in bookmarks. They can drive scale and visual expressions. Outputs used by
another data source or transform follow ordinary reactive updates; there is no
special ordering guarantee between independent pipelines.

Avoid feeding an output back into the pipeline that produces it. Feedback can
also pass through a lazy source's domain or layout, causing repeated loading or
unstable updates. GenomeSpy does not detect these cycles.

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

Inline, named, sequence, and [lazy inputs](../data/lazy.md) can also
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

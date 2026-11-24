# Categorical coverage

The `categoricalCoverage` transform counts overlapping intervals by category.
Use it to summarize categorical tracks, such as chromatin states across samples.

## Input

Intervals are half-open. The start is inclusive and the end is exclusive. Sort
intervals by start within each facet. When using the optional `chrom` field,
supply each chromosome in a single block, sorted by start within that block. Use
gaps or null categories for uncalled regions. Quiescent intervals contribute to
their category.

## Output

The transform emits one row per present category for each span. Like
[`coverage`](coverage.md), coordinate outputs inherit the configured input names
unless renamed with `asStart`, `asEnd`, or `asChrom`. The output includes a
chromosome field when `chrom` is supplied. The `as` array names the three
summary fields in the order shown below.

| Default field | Meaning                                       |
| ------------- | --------------------------------------------- |
| `category`    | One of the categories present in the span.    |
| `count`       | Number of active intervals in that category.  |
| `total`       | Number of active intervals with any category. |

Adjacent spans merge when every category count agrees. Gaps with no calls
produce no rows. Divide `count` by `total` for the fraction of called intervals
in that category. This fraction is a sample frequency when each sample
contributes at most one called interval at each position.

## Parameters

SCHEMA CategoricalCoverageParams

## State frequency example

The upper track shows three samples with synthetic calls. The lower track reads
the `state` field through `category` and uses `as` to share the same color
encoding. Between positions 8 and 10, sample B has a gap, so the stack shows the
frequency among the two called samples. See the [stack transform](stack.md).

EXAMPLE examples/docs/grammar/transform/categorical-coverage/frequency.json

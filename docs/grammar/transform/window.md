# Window

The `"window"` transform calculates values for every input row from a frame of
rows in its partition. It keeps input rows and preserves their observed output
order. Sorting affects calculations only: `"window"` is not a sorting
transform.

## Parameters

SCHEMA WindowParams

## Partitions and order

`groupby` defines independent partitions. For example,
`"groupby": ["sample"]` ensures that a sample's `lead` value never comes from
a different sample. `sort` defines the calculation order within each partition.
Without `sort`, observed input order defines the window and rows are not peers.

The following configuration calculates `nextValue` from the next row in each
sample after sorting by `position`:

```json
{
  "type": "window",
  "groupby": ["sample"],
  "sort": { "field": "position" },
  "ops": ["lead"],
  "fields": ["value"],
  "as": ["nextValue"]
}
```

The resulting rows still propagate in their original order. This matters when a
window calculation is followed by marks or transforms that should retain the
source order.

## Frames and peers

The `frame` contains inclusive offsets relative to the current sorted row.
`[0, 0]` contains only the current row, `[-1, 0]` contains the preceding and
current rows, and `[null, 0]` contains every preceding row and the current row.
`null` makes a bound unbounded. `[null, 0]` is the default.

With a sort order, a frame boundary includes every tied row unless `ignorePeers`
is true. This makes an aggregate such as a running sum agree for tied sort
values. `ignorePeers: true` instead applies exact row offsets.

`lag` and `lead` use the sorted partition order but do not use the frame. Their
offset defaults to one. `ntile` and `nth_value` require a positive integer in
the aligned `params` entry.

## Operations and output fields

`ops`, `fields`, `params`, and `as` are aligned by index. `count` and ranking
operations have no field entry. If an `as` entry is omitted or `null`, the
output name is the operation name followed by `_<field>` when applicable.

| Operation group       | Operations                                                                      |
| --------------------- | ------------------------------------------------------------------------------- |
| Row order and ranking | `row_number`, `rank`, `dense_rank`, `percent_rank`, `cume_dist`, `ntile`        |
| Relative values       | `lag`, `lead`, `prev_value`, `next_value`                                       |
| Frame values          | `first_value`, `last_value`, `nth_value`                                        |
| Aggregates            | `count`, `valid`, `sum`, `min`, `max`, `mean`, `q1`, `median`, `q3`, `variance` |

`prev_value` and `next_value` return the nearest non-null value at or before,
or at or after, the current row. Aggregate operations ignore null, empty-string,
and `NaN` input values. Empty aggregate frames produce the corresponding empty
aggregate result; frame-value operations return `null` when their requested row
is outside the frame.

## Batches

The transform calculates each data-flow batch independently. A window never
crosses a file or facet batch boundary.

## Example

The arrows show `lead` values by pointing from each row to its next row. Filled
blue points are the input values. Open points are the two-row moving mean from
the frame `[-1, 0]`.

EXAMPLE examples/docs/grammar/transform/window/window-transform.json height=170 spechidden

## Six-frame FASTA translation

The _six-frame FASTA translation example_ below sorts flattened bases by genomic
position and uses four `lead` operations to gather the next two bases and
complements for every row.

EXAMPLE examples/docs/genomic-data/examples/indexed-fasta-six-frame-translation.json height=180 spechidden

See [Indexed FASTA Six-Frame
Translation](../../genomic-data/examples/indexed-fasta-six-frame-translation.md)
for a more detailed description of the example and its data sources.

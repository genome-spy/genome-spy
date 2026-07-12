# Window

The `"window"` transform calculates values for every input row from a frame of
rows in its partition. It keeps input rows, including their observed output
order. Sorting affects calculations only.

## Parameters

SCHEMA WindowParams

## Behavior

Use `groupby` to calculate independent partitions and `sort` to define the row
order within each partition. Without `sort`, the observed order defines the
window and rows are not peers.

The `frame` contains inclusive offsets relative to the current sorted row.
`null` makes a bound unbounded. Its default, `[null, 0]`, includes all preceding
rows and the current row. With a sort order, frame boundaries include tied rows
unless `ignorePeers` is true.

`ops`, `fields`, `params`, and `as` are aligned by index. Omit a field for
`count` and ranking operations. If an `as` entry is omitted or `null`, the
output name is the operation name followed by `_<field>` when applicable.

Window-only operations are `row_number`, `rank`, `dense_rank`, `percent_rank`,
`cume_dist`, `ntile`, `lag`, `lead`, `first_value`, `last_value`, `nth_value`,
`prev_value`, and `next_value`. Aggregate operations are `count`, `valid`,
`sum`, `min`, `max`, `mean`, `q1`, `median`, `q3`, and `variance`.

The transform calculates each data-flow batch independently. A window never
crosses a file or facet batch boundary.

## Example

The example calculates the next value in each sample and a two-row moving mean.
The text shows the moving mean; color shows the next value.

EXAMPLE examples/docs/grammar/transform/window/window-transform.json height=170 spechidden

# Join Aggregate

The `joinaggregate` transform adds group statistics to every input row. It is
shorthand for an unsorted [`window`](window.md) with `frame: [null, null]` and
uses the same `groupby`, `fields`, and `as` options.

## Parameters

SCHEMA JoinAggregateParams ops

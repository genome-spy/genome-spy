# Branch

The `"branch"` declaration forks the current input into a separate transform
pipeline. The input can be defined in the view or inherited from an ancestor.
Filters and row mutations in the branch affect that pipeline only; the
main pipeline continues with its original rows. This is useful for calculating
summaries or publishing [`"values"`](values.md) without removing the data used
by marks.

## Parameters

SCHEMA BranchParams

## Tapping the current input

This branch publishes selected positions while the main pipeline retains all
rows and calculates `doubled`:

```json
{
  "transform": [
    {
      "type": "branch",
      "transform": [
        { "type": "filter", "expr": "datum.keep" },
        { "type": "values", "field": "position", "param": "positions" }
      ]
    },
    { "type": "formula", "expr": "datum.score * 2", "as": "doubled" }
  ]
}
```

A branch shares the declaring view's parameter scope. It does not introduce
another view or lexical scope. Its output names must be unique in that scope.
An explicit [`"collect"`](collect.md) can sort the branch's rows or cache them
for replay when a filter depends on an ordinary parameter.

## Example

The [Values example](values.md#deriving-cuts-in-a-branch) calculates cluster gaps
from metadata in a branch while retaining every heatmap cell in the main path.

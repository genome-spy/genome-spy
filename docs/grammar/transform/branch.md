# Branch

The `"branch"` declaration forks the current input into a separate transform
pipeline. The input can be defined in the view or inherited from an ancestor.
Filters and row mutations in the branch affect that pipeline only. The main
pipeline retains its original rows for marks and later transforms. A branch can
publish scalar arrays through [`"values"`](values.md) or a named table through
[`"publish"`](publish.md).

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

A branch uses the declaring view's parameter scope. Its output parameter names
must be unique in that scope. An explicit [`"collect"`](collect.md) can sort the
branch's rows or cache them for replay when a filter depends on an ordinary
parameter.

## Example

The [Values example](values.md#deriving-cuts-in-a-branch) calculates cluster
gaps from metadata in a branch while retaining every heatmap cell in the main
path.

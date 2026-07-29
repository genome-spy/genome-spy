# Cross

The `"cross"` transform forms the Cartesian product of its primary input and a
finite eager foreign data source. It emits one flat row for every pair of
primary and foreign rows.

For example, crossing:

| x |
| - |
| 1 |
| 2 |

with:

| y |
| - |
| A |
| B |
| C |

produces:

| x | y |
| - | - |
| 1 | A |
| 1 | B |
| 1 | C |
| 2 | A |
| 2 | B |
| 2 | C |

Primary-input order is the outer order, and foreign-input order is the inner
order. An empty input on either side produces no rows.

## Parameters

SCHEMA CrossParams

## Foreign Data

`from.data` accepts finite eager data, including inline values, URLs, named
data, and generated sequences. Lazy data sources are not supported because the
complete foreign relation must be available before primary rows are crossed.

Optional transforms in `from.transform` preprocess the foreign data. This
pipeline supports ordinary unary transforms. Transforms that require another
side input are not supported there.

```json
{
  "type": "cross",
  "from": {
    "data": {
      "sequence": { "start": 0, "stop": 3, "as": "y" }
    },
    "transform": [
      {
        "type": "formula",
        "expr": "datum.y * 10",
        "as": "scaledY"
      }
    ]
  }
}
```

## Fields

Each output row is a new shallow object containing all primary fields followed
by all foreign fields. A field name must occur on only one side. The transform
throws an error when primary and foreign data contain a duplicate field name.

Use [`project`](project.md) before crossing to select or rename primary fields.
Use `project` in `from.transform` to select or rename foreign fields.

The transform preserves primary batch boundaries. All foreign rows are treated
as one finite relation; partition-aware foreign matching is not supported.

## Example

The following example crosses two generated sequences and derives a value for
each heatmap cell:

EXAMPLE examples/docs/grammar/transform/cross/cross-heatmap.json height=220

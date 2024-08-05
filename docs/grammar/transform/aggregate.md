# Aggregate

The `"aggregate"` transform summarizes data fields using aggregate functions,
such as `"sum"` or `"max"`. The data can be grouped by one or more fields,
which results in a list of objects with the grouped fields and the aggregate
values.

## Parameters

SCHEMA AggregateParams

### Available aggregate functions

Aggregate functions are applied to the data fields in each group.

- `"count"`: Count the number of records in each group.
- `"valid"`: Count the number of non-null and non-NaN values.
- `"sum"`: Sum the values.
- `"mean"`: Calculate the mean value.
- `"average"`: A synonym for `"mean"`.
- `"median"`: Calculate the median value.
- `"min"`: Find the minimum value.
- `"max"`: Find the maximum value.
- `"variance"`: Calculate the variance.

## Example

Given the following data:

| x      | y   |
| ------ | --- |
| first  | 123 |
| first  | 456 |
| second | 789 |

... and configuration:

```json
{
  "type": "aggregate",
  "groupby": ["x"]
}
```

A new list of data objects is created:

| x      | count |
| ------ | ----- |
| first  | 2     |
| second | 1     |

### Calculating min and max

<div><genome-spy-doc-embed height="152">

```json
{
  "data": {
    "values": [
      { "Category": "A", "Value": 5 },
      { "Category": "A", "Value": 9 },
      { "Category": "A", "Value": 9.5 },
      { "Category": "B", "Value": 3 },
      { "Category": "B", "Value": 5 },
      { "Category": "B", "Value": 7.5 },
      { "Category": "B", "Value": 8 }
    ]
  },

  "encoding": {
    "y": { "field": "Category", "type": "nominal" }
  },

  "layer": [
    {
      "encoding": {
        "x": { "field": "Value", "type": "quantitative" }
      },
      "mark": "point"
    },
    {
      "transform": [
        {
          "type": "aggregate",
          "groupby": ["Category"],
          "fields": ["Value", "Value"],
          "ops": ["min", "max"],
          "as": ["minValue", "maxValue"]
        }
      ],
      "encoding": {
        "x": { "field": "minValue", "type": "quantitative" },
        "x2": { "field": "maxValue" }
      },
      "mark": "rule"
    }
  ]
}
```

</genome-spy-doc-embed></div>

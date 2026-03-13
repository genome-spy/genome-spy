# Aggregate

The `"aggregate"` transform summarizes data fields using aggregate functions
such as `"sum"`, `"median"`, `"q1"`, or `"max"`. The data can be grouped by
one or more fields, which results in a list of objects with the grouped fields
and the aggregate values.

## Parameters

SCHEMA AggregateParams

### Available aggregate functions

Aggregate functions are applied to the data fields in each group.

- `"count"`: Count the number of records in each group.
- `"valid"`: Count the number of non-null and non-NaN values.
- `"sum"`: Sum the values.
- `"min"`: Find the minimum value.
- `"max"`: Find the maximum value.
- `"mean"`: Calculate the mean value.
- `"q1"`: Calculate the first quartile.
- `"median"`: Calculate the median value.
- `"q3"`: Calculate the third quartile.
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

EXAMPLE examples/docs/grammar/transform/aggregate/aggregate-min-max.json height=152

### Building boxplot statistics

The following example uses `"aggregate"` to compute grouped `"min"`, `"q1"`,
`"median"`, `"q3"`, and `"max"` values from the [Palmer Penguins
dataset](https://allisonhorst.github.io/palmerpenguins/) and then layers them
into a boxplot-like view.

EXAMPLE examples/docs/grammar/transform/aggregate/aggregate-boxplot.json height=250 spechidden

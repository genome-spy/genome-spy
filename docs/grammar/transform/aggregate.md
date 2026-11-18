# Aggregate

The `"aggregate"` transform summarizes data fields using aggregate functions
such as `"sum"`, `"median"`, `"q1"`, or `"max"`. The data can be grouped by
one or more fields, which results in a list of objects with the grouped fields
and the aggregate values.

## Parameters

SCHEMA AggregateParams

### Available aggregate functions

Aggregate functions are applied to the data fields in each group.

- `"count"`: Count the number of rows in each group.
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

A new list of rows is created:

| x      | count |
| ------ | ----- |
| first  | 2     |
| second | 1     |

With empty input, an aggregation without `groupby` still produces one summary
row (`{ "count": 0 }` for the default count aggregation). Grouped aggregation
produces no rows.

### Calculating min and max

EXAMPLE examples/docs/grammar/transform/aggregate/aggregate-min-max.json height=152

### Building boxplot statistics

This boxplot shows body mass by species in the
[Palmer Penguins dataset](https://allisonhorst.github.io/palmerpenguins/). A
[`"window"`](window.md) with `frame: [null, null]` adds the quartiles and median
from all measured body masses in each species to every row.

The interquartile range (IQR) is the distance from Q1 to Q3. The fences extend
below Q1 and above Q3 by 1.5 × IQR. The `"aggregate"` transform finds the smallest
and largest observations within those fences for the whiskers. The outlier layer
draws each observation outside the fences as a point.

EXAMPLE examples/docs/grammar/transform/aggregate/aggregate-boxplot.json height=250 spechidden

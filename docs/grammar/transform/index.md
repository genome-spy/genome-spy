# Transforms

Transforms allow for building a pipeline that modifies the data before the data
objects are mapped into marks. They may filter or derive data, adding or
removing fields or data objects.

!!! warning "Departure from Vega-Lite"

    The notation of transforms is different from Vega-Lite to enable more
    straghtforward addition of new operations. Each transform has to be
    specified using an explicit `type` property like in the lower-level
    [Vega](https://vega.github.io/vega/docs/transforms/) visualization grammar.
    Thus, the transform type is not inferred from the presence of
    transform-specific properties.

## Example

The following example uses the [`"filter"`](filter.md) transform to retain
only the rows that match the predicate [expression](../expressions.md).

```json
{
  ...,
  "data": { ... },
  "transform": [
    {
      "type": "filter",
      "expr": "datum.end - datum.start < 5000"
    }
  ],
  ...
}
```

# Transforms

Transforms allow for modifying the data before it is displayed on screen.
They may filter or derive data, adding or removing fields or data objects.

TODO: More about the data flow etc...

## Example

The following example uses the [`filter`](filter.md) transform to retain
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

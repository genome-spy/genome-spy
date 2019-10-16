# Filter

The filter transform removes rows based on an predicate expression.

## Parameters

TODO

## Example

```json
{
    "type": "filter",
    "expr": "datum.p <= 0.05"
}
```

The example above retains all rows for which the field p is less than or
equal to 0.05.

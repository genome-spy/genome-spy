# Filter

The `"filter"` transform removes data objects based on a predicate
[expression](../expressions.md) or a
[selection](../parameters.md#selection-parameters) predicate.

## Parameters

### Predicate Expression

SCHEMA ExprFilterParams

### Selection Predicate

SCHEMA SelectionFilterParams

## Example

### Filtering by a Predicate Expression

```json
{
  "type": "filter",
  "expr": "datum.p <= 0.05"
}
```

The example above passes through all rows for which the field `p` is less than
or equal to 0.05.

### Filtering by a Selection Predicate

Interval selections in GenomeSpy are defined by their data extent along the x
and/or y channels. When filtering data based on a selection, you must explicitly
map the visual channels (x or y) to the corresponding data fields to ensure
correct filtering. This ensures that the filter correctly interprets the
selection in the context of your dataset.

EXAMPLE examples/docs/grammar/transform/filter/selection-predicate-filter.json height=250

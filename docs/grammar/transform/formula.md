# Formula

The `"formula"` transform uses an [expression](../expressions.md) to calculate
and add a new field to each row.

## Parameters

SCHEMA FormulaParams expr as debounce description

## Example

Given the following data:

| x   | y   |
| --- | --- |
| 1   | 2   |
| 3   | 4   |

... and configuration:

```json
{
  "type": "formula",
  "expr": "datum.x + datum.y",
  "as": "z"
}
```

A new field is added:

| x   | y   | z   |
| --- | --- | --- |
| 1   | 2   | 3   |
| 3   | 4   | 7   |

### Using with Parameters

As expressions have access to [parameters](../parameters.md), they can be used
to create dynamic visualizations. The following example uses a formula to
calculate the sum of two sine waves with different wave lengths. The wave
lengths are controlled by the `a` and `b` parameters.

Under the hood, when any of the parameters change, the formula transform finds
the closest [collector](./collect.md) or [data source](../data/index.md) in the
data pipeline and triggers a re-propagation of the data, resulting in a
re-evaluation of the formula expression.

Use `debounce` to delay this reactive replay until the dependencies have
stopped changing for the specified number of milliseconds. It delays only
dependency-triggered replay: parameter updates and new input data remain
immediate. If an input batch completes during the delay, it uses current
parameter values and makes the pending replay unnecessary. The delay does not
wait for an independently scheduled lazy load. Place a
[`collect`](./collect.md) transform before an expensive reactive formula to
cache the rows used for replay.

EXAMPLE examples/docs/grammar/transform/formula/formula-with-parameters.json height=300

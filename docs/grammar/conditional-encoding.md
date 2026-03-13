# Conditional Encoding

Conditional encoding lets an encoding channel switch between alternative
definitions based on a [selection
parameter](./parameters.md#selection-parameters). It is used to highlight the
selected data items and de-emphasize the rest.

The basic pattern is to provide a fallback definition for the channel and one
or more conditional branches in `condition`:

```json
{
  "encoding": {
    "color": {
      "condition": { "param": "brush", "value": "#3a86ff" },
      "value": "#d9d9d9"
    }
  }
}
```

When the selection matches the current datum, GenomeSpy uses the definition
inside `condition`. Otherwise it uses the fallback definition on the channel
itself.

Conditional encoding is available on many visual channels, such as `color`,
`fill`, `stroke`, `opacity`, `fillOpacity`, `strokeOpacity`, `strokeWidth`,
`size`, `shape`, and `angle`.

## With Selection Parameters

Selections are the most common driver for conditional encoding. Point
selections work well for click or hover interactions, while interval
selections are useful for brushing ranges.

EXAMPLE examples/docs/grammar/parameters/point-selection.json height=250

## Empty Selections

For selection parameters, an empty selection matches by default. This is often
useful for filters, but in conditional encoding it can be surprising because
the highlighted style is then applied before the user has selected anything.

Set `empty: false` when the conditional branch should only apply after the
selection contains data:

```json
{
  "encoding": {
    "strokeWidth": {
      "condition": { "param": "select", "value": 2, "empty": false },
      "value": 0
    }
  }
}
```

## Multiple Conditions

You can provide an array of conditional value definitions. They are evaluated
in order, and the channel's main definition acts as the final fallback.

```json
{
  "encoding": {
    "strokeWidth": {
      "condition": [
        { "param": "select", "value": 2, "empty": false },
        { "param": "highlight", "value": 1, "empty": false }
      ],
      "value": 0
    }
  }
}
```

## See Also

- [Marks](./mark/index.md#visual-encoding) for the general encoding model
- [Parameters](./parameters.md) for defining selection and input-bound params

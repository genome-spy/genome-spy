# Conditional Encoding

Conditional encoding lets an encoding channel switch between alternative
definitions based on a [selection
parameter](./parameters.md#selection-parameters). It is used to highlight the
selected rows and de-emphasize the rest.

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

When the selection matches the current row, GenomeSpy uses the definition
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

## Structured Selection Tests

Use a structured test for a selection condition when you want the predicate
to be explicit. A structured singleton has the same behavior as the direct
`param` shorthand:

```json
{
  "encoding": {
    "color": {
      "condition": {
        "test": { "param": "select", "empty": false },
        "value": "#3a86ff"
      },
      "value": "#d9d9d9"
    }
  }
}
```

The direct `param` form remains the concise spelling for a singleton
selection condition. The structured singleton follows the Vega-Lite predicate
shape; GenomeSpy extends it with a flat union of selection names. Use a
selection union when one branch should apply to rows selected by any of several
point or interval selections:

```json
{
  "encoding": {
    "color": {
      "condition": {
        "test": {
          "param": { "or": ["select", "brush"] },
          "empty": true
        },
        "field": "class",
        "type": "nominal"
      },
      "value": "#cbd2d6"
    }
  }
}
```

The branch matches when at least one selection contains the row. With
`empty: true` (the default), it also matches all rows while every selection in
the group is empty. Once any member is active, the union matches rows selected
by any active member. Set `empty: false` inside `test` to keep the fallback
active until one selection is populated. Interval unions allow an active
dimension to constrain the row while inactive dimensions impose no constraint.

The `or` list must contain at least one selection name. A structured group test
is flat; nested tests and condition-level `empty` are not supported. Direct
`param` conditions continue to support `empty` as described above.

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

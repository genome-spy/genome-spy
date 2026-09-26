# Conditional Encoding

Conditional encoding changes a visual channel when a [selection
parameter](./parameters.md#selection-parameters) matches a row. The channel's
own definition is the fallback:

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

Conditional encoding works with `color`, `opacity`, `size`, `shape`, and other
visual channels. Point selections suit clicks and hovering:

EXAMPLE examples/docs/grammar/parameters/point-selection.json height=250

## Empty Selections

An empty selection matches every row by default. Add `"empty": false` to a
condition when its style should apply only after a selection, for example:

```json
{ "param": "select", "empty": false, "value": 2 }
```

## Combining Selections

Use `test` to combine selections with nested `and`, `or`, and `not`. Each leaf
can set its own `empty` policy:

```json
{
  "test": {
    "or": [
      { "param": "hover", "empty": false },
      { "and": [{ "param": "sourceBrush" }, { "param": "targetBrush" }] }
    ]
  },
  "value": "#3a86ff"
}
```

A leaf's `empty` defaults to `true` and is evaluated before the Boolean
operators. A single `"test": { "param": "brush" }` is equivalent to the direct
`"param": "brush"` condition.

A two-axis brush is empty until both intervals are active. Declare a one-axis
brush to select on one axis.

For a simple union, use `param.or` inside `test`:

```json
{
  "test": { "param": { "or": ["select", "brush"] }, "empty": true },
  "value": "#3a86ff"
}
```

The union matches rows in any active selection. With `empty: true` (the
default), it also matches every row while all selections are empty. Set
`empty: false` inside `test` to keep the fallback in that case.

## Reusing Tests in a Unit View

When several channels use the same test, define it once in the unit view's
`predicates` and refer to it from each condition, including `order`:

```json
{
  "mark": "point",
  "predicates": {
    "highlighted": {
      "or": [
        { "param": "hover", "empty": false },
        { "param": "brush", "empty": false }
      ]
    }
  },
  "encoding": {
    "fillOpacity": {
      "condition": { "test": { "ref": "highlighted" }, "value": 1 },
      "value": 0.2
    },
    "order": {
      "condition": { "test": { "ref": "highlighted" }, "value": 1 },
      "value": 0
    }
  }
}
```

Each consuming unit must define names referenced by its encodings, including
inherited encodings. Selection parameters and projected channels resolve in
that unit. Named predicates cannot refer to other named predicates.

## Testing Different Link Endpoints

An interval normally tests the matching positional channel and, on ranged
marks, its second endpoint according to the mark's hit-test mode. Use
`"project": { "x": "x2" }` to test the selected x interval against `x2` alone.
Predicates may test the same selection against different endpoints.

`project` is a GenomeSpy extension. Map every component declared by the
selection to an unconditional field encoding on the same axis and of the same
type. Quantitative, index, and locus types are supported.

In this example, the upper brush tests each link's `x2` (target), and the
lower brush tests `x` (source). Links keep their color when they match both;
an empty brush leaves its endpoint unconstrained.

EXAMPLE examples/docs/grammar/conditional-encoding/endpoint-brushes.json height=200 spechidden

For endpoint brushes, hover, and several conditional channels, see the
[PISA Squid Plot](../examples/genomic-data/bpreveal-pisa-squid.md).

## Multiple Conditions

Conditions in an array are tested in order. The channel's main definition is
the final fallback:

```json
{
  "condition": [
    { "param": "select", "empty": false, "value": 2 },
    { "param": "highlight", "empty": false, "value": 1 }
  ],
  "value": 0
}
```

## See Also

- [Marks](./mark/index.md#visual-encoding) for the general encoding model
- [Parameters](./parameters.md) for defining selection and input-bound params

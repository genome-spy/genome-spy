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

## Combining Selections

Use `test` to combine selection predicates with `and`, `or`, and `not`. The
operators can be nested. Each leaf names a selection and can set its own
`empty` policy:

```json
{
  "encoding": {
    "color": {
      "condition": {
        "test": {
          "or": [
            { "param": "hover", "empty": false },
            {
              "and": [
                { "param": "sourceBrush" },
                { "not": { "param": "excluded", "empty": false } }
              ]
            }
          ]
        },
        "value": "#3a86ff"
      },
      "value": "#d9d9d9"
    }
  }
}
```

A structured singleton, such as `"test": { "param": "brush" }`, behaves like
the direct `param` shorthand. Logical composition and per-leaf `empty` follow
Vega-Lite selection predicates. The default `empty: true` is evaluated for each
leaf before the Boolean operators; set `empty: false` on a leaf when an unused
selection should not satisfy that part of the test.

GenomeSpy also retains its flat union shorthand for an `or` of selection
names:

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

The flat union's `or` list and logical `and`/`or` arrays must be nonempty.
`empty` belongs on leaves or on the flat union, not on the surrounding
condition.

## Reusing Tests in a Unit View

When several channels use the same selection test, define it once in the unit
view's `predicates` and refer to it by name. A reference replaces the whole
`test` in a condition, including a conditional `order` definition:

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

Names are local to the unit view; predicate definitions are not inherited. An
inherited encoding may contain a reference, but each consuming unit must define
that name. Selection parameters and projected channels resolve in the consuming
unit. Definitions cannot refer to other named predicates.

## Testing Different Link Endpoints

An interval selection normally tests the mark's primary positional channel.
On a ranged mark, it also tests the corresponding secondary endpoint according
to the mark's hit-test mode. Use `project` on an interval predicate to test one
specific mark input instead. For example, `"project": { "x": "x2" }` tests
the selected x range against `x2` alone. Two predicates can use the same
selection with different targets.

`project` is a GenomeSpy extension to the Vega-Lite-shaped predicate syntax.
It binds a selection's existing x or y component to the current mark's x,
x2, y, or y2 field. Include every component declared by the interval
selection. The target must be an unconditional field encoding on the same axis
and have exactly the same data type as the selection component. Quantitative,
index, and locus types are supported. Comparisons use raw data values, not
screen coordinates, so different visual ranges or zoom levels do not change
membership. This use-site mapping does not change the selection's stored
interval, and it does not define selection fields.

The example below uses separate source and target brushes. A link matches the
conjunction when its source is inside the source brush and its target is inside
the target brush. Hovering a link also brings it forward. Clear either brush
to let the other brush determine the matching links; clear both to restore all
links.

EXAMPLE examples/docs/grammar/conditional-encoding/endpoint-brushes.json height=270

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

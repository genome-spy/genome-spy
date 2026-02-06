# Parameters

!!! note "Work in progress"

    This page is a work in progress and is incomplete.

Parameters enable various dynamic behaviors in GenomeSpy visualizations, such as
interactive selections, conditional encoding, and data filtering with
[expressions](./expressions.md). They also enable parameterization when
[importing](./import.md) specification fragments from external files or named
templates. Parameters in GenomeSpy are heavily inspired by the
[parameters](https://vega.github.io/vega-lite/docs/parameter.html) concept of
Vega-Lite.

## Examples

### Using Input Bindings

Parameters can be bound to input elements, such as sliders, dropdowns, and
checkboxes. The GenomeSpy Core library shows the input elements below the
visualization. In the GenomeSpy App, the input elements are shown in the [_View
visibility_ menu](../sample-collections/analyzing.md), allowing the
visualization author to provide configuration options to the end
user.

Parameters with input bindings should have a unique `name` within the [import
scope](./import.md#repeating-with-named-templates). While not enforced in core,
this is necessary for bookmarkable state in the GenomeSpy App.

By default, selection parameters and parameters with input bindings are
persisted in the GenomeSpy App's bookmarks and provenance history. Use
`persist: false` to opt out of persistence for ephemeral params (such as hover
selections) or when `encoding.key` is not defined for point selections.

The following example shows how to bind parameters to input elements and use
them to control the size, angle, and text of a text mark.

<div><genome-spy-doc-embed height="250">

```json
{
  "padding": 0,
  "view": { "fill": "#cbeef3" },
  "params": [
    {
      "name": "size",
      "value": 80,
      "bind": { "input": "range", "min": 1, "max": 300 }
    },
    {
      "name": "angle",
      "value": 0,
      "bind": { "input": "range", "min": 0, "max": 360 }
    },
    {
      "name": "text",
      "value": "Params are cool!",
      "bind": {
        "input": "select",
        "options": ["Params are cool!", "GenomeSpy", "Hello", "World"]
      }
    }
  ],

  "data": { "values": [{}] },

  "mark": {
    "type": "text",
    "font": "Lobster",
    "text": { "expr": "text" },
    "size": { "expr": "size" },
    "angle": { "expr": "angle" }
  }
}
```

</genome-spy-doc-embed></div>

### Expressions

Parameters can be based on [expressions](./expressions.md), which can depend on
other parameters. They are automatically re-evaluated when the dependent
parameters change.

<div><genome-spy-doc-embed height="150">

```json
{
  "view": { "stroke": "lightgray" },
  "params": [
    {
      "name": "A",
      "value": 2,
      "bind": { "input": "range", "min": 0, "max": 10, "step": 1 }
    },
    {
      "name": "B",
      "value": 3,
      "bind": { "input": "range", "min": 0, "max": 10, "step": 1 }
    },
    {
      "name": "C",
      "expr": "A * B"
    }
  ],

  "data": { "values": [{}] },

  "mark": {
    "type": "text",
    "size": 30,
    "text": { "expr": "'' + A + ' * ' + B + ' = ' + C" }
  }
}
```

</genome-spy-doc-embed></div>

### Selection parameters

Parameters allow for defining interactive selections, which can be used in
conditional encodings. GenomeSpy compiles the conditional encoding rules into
efficient GPU shader code, enabling fast interactions in very large data sets.

#### Point selection

The following example has been adapted from Vega-Lite's [example
gallery](https://vega.github.io/vega-lite/examples/interactive_bar_select_highlight.html)
with slight modifications (GenomeSpy provides no `"bar"` mark). The
specification below is fully compatible with Vega-Lite. You can select multiple
bars by holding down the `Shift` key.

<div><genome-spy-doc-embed height="250">

```json
{
  "description": "A bar chart with highlighting on hover and selecting on click. (Inspired by Tableau's interaction style.)",

  "data": {
    "values": [
      { "a": "A", "b": 28 },
      { "a": "B", "b": 55 },
      { "a": "C", "b": 43 },
      { "a": "D", "b": 91 },
      { "a": "E", "b": 81 },
      { "a": "F", "b": 53 },
      { "a": "G", "b": 19 },
      { "a": "H", "b": 87 },
      { "a": "I", "b": 52 }
    ]
  },
  "params": [
    {
      "name": "highlight",
      "select": { "type": "point", "on": "pointerover" }
    },
    { "name": "select", "select": "point" }
  ],
  "mark": {
    "type": "rect",
    "fill": "#4C78A8",
    "stroke": "black"
  },
  "encoding": {
    "x": {
      "field": "a",
      "type": "ordinal",
      "scale": { "type": "band", "padding": 0.2 }
    },
    "y": { "field": "b", "type": "quantitative" },
    "fillOpacity": {
      "value": 0.3,
      "condition": { "param": "select", "value": 1 }
    },
    "strokeWidth": {
      "value": 0,
      "condition": [
        { "param": "select", "value": 2, "empty": false },
        { "param": "highlight", "value": 1, "empty": false }
      ]
    }
  }
}
```

</genome-spy-doc-embed></div>

#### Interval selection

Interval selections allow for selecting a range of data points along one or two axes.
By default, the selection is done by holding down the `Shift` key and dragging
the mouse cursor over the data points. The selection can be cleared by clicking
outside the selected area.

<div><genome-spy-doc-embed height="250">

```json
{
  "params": [
    {
      "name": "brush",
      "value": { "x": [2, 4] },
      "select": {
        "type": "interval",
        "encodings": ["x"]
      }
    }
  ],

  "data": { "url": "sincos.csv" },

  "mark": { "type": "point", "size": 100 },

  "encoding": {
    "x": { "field": "x", "type": "quantitative", "scale": { "zoom": true } },
    "y": { "field": "sin", "type": "quantitative" },
    "color": {
      "condition": {
        "param": "brush",
        "value": "#38c"
      },
      "value": "#ddd"
    }
  }
}
```

</genome-spy-doc-embed></div>

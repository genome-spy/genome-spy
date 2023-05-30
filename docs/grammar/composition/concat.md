# View Concatenation

The `vconcat` and `hconcat` composition operators place views side-by-side
either vertically or horizontally. The `vconcat` is practical for building
genomic visualizations with multiple tracks. The `concat` operator with the
`columns` property produces a wrapping grid layout.

The spacing (in pixels) between concatenated views can be adjusted using the
`spacing` property (Default: `10`).

## Example

### Vertical

Using `vconcat` for a vertical layout.

<div><genome-spy-doc-embed>

```json
{
  "data": { "url": "sincos.csv" },

  "spacing": 20,

  "vconcat": [
    {
      "mark": "point",
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "sin", "type": "quantitative" }
      }
    },
    {
      "mark": "point",
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "cos", "type": "quantitative" }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

### Horizontal

Using `hconcat` for a horizontal layout.

<div><genome-spy-doc-embed height="200">

```json
{
  "data": { "url": "sincos.csv" },

  "hconcat": [
    {
      "mark": "point",
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "sin", "type": "quantitative" }
      }
    },
    {
      "mark": "point",
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "cos", "type": "quantitative" }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

### Grid

Using `concat` and `columns` for a grid layout. For simplicity, the same
visualization is used for all panels in the grid.

<div><genome-spy-doc-embed height="400">

```json
{
  "data": { "url": "sincos.csv" },
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "sin", "type": "quantitative" }
  },

  "columns": 3,
  "concat": [
    { "mark": "point" },
    { "mark": "point" },
    { "mark": "point" },
    { "mark": "point" },
    { "mark": "point" },
    { "mark": "point" },
    { "mark": "point" },
    { "mark": "point" },
    { "mark": "point" }
  ]
}
```

</genome-spy-doc-embed></div>

## Child sizing

The concatenation operators mimic the behavior of the CSS
[flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/). The child
views have an absolute minimum size (`px`) in pixels and an unitless `grow`
value that specifies in what proportion the possible remaining space should be
distributed. The remaining space depends on the parent view's size.

In the following example, the left view has a width of `20` px, the center view
has a grow of `1`, and the right view has a grow of `2`. If you resize the web
browser, you can observe that the width of the left view stays constant while
the remaining space is distributed in proportions of 1:2.

<div><genome-spy-doc-embed height="50">

```json
{
  "data": { "values": [{}] },

  "spacing": 10,

  "hconcat": [
    {
      "width": { "px": 20 },
      "mark": "rect"
    },
    {
      "width": { "grow": 1 },
      "mark": "rect"
    },
    {
      "width": { "grow": 2 },
      "mark": "rect"
    }
  ]
}
```

</genome-spy-doc-embed></div>

The size may have both absolute (`px`) and proportional (`grow`) components.
When views are nested, both the absolute and proportional sizes are added up.
Thus, the width of the above example is `{ "px": 40, "grow": 3 }`. The spacing
between the child views is added to the total absolute width.

Views' size properties (`width` and `height`) accept both SizeDef objects and
shorthands. The SizeDef objects contain either or both of `px` and `grow`
properties. Numbers are interpreted as as absolute sizes, and `"container"` is
the same as `{ grow: 1 }`. Undefined sizes generally default to `"container"`.

Concatenation operators can nested flexibly to build complex layouts as in the
following example.

<div><genome-spy-doc-embed height="150">

```json
{
  "data": { "values": [{}] },

  "hconcat": [
    { "mark": "rect" },
    {
      "vconcat": [{ "mark": "rect" }, { "mark": "rect" }]
    }
  ]
}
```

</genome-spy-doc-embed></div>

## Resolve

By default, all channels have independent scales and axes. However, because
track-based layouts that resemble genome browsers are such a common use case,
`vconcat` has a special treatment for the `x` channel: if all child views use
`"locus"` or `"index"` data type on the `x` channel, the scale resolution
defaults to `"shared"`. However, axes are still `"independent"` by default.

### Shared axes

Concatenation operators support shared axes on channels that also have shared
scales. Axis domain line, ticks, and labels are drawn only once for each row or column.
Grid lines are drawn for all participating views.

<div><genome-spy-doc-embed height="350">

```json
{
  "data": { "url": "sincos.csv" },

  "resolve": {
    "scale": { "x": "shared", "y": "shared" },
    "axis": { "x": "shared", "y": "shared" }
  },

  "spacing": 20,

  "encoding": {
    "x": { "field": "x", "type": "quantitative", "axis": { "grid": true } },
    "y": { "field": "sin", "type": "quantitative", "axis": { "grid": true } }
  },

  "columns": 2,

  "concat": [
    { "mark": "point", "view": { "stroke": "lightgray" } },
    { "mark": "point", "view": { "stroke": "lightgray" } },
    { "mark": "point", "view": { "stroke": "lightgray" } },
    { "mark": "point", "view": { "stroke": "lightgray" } }
  ]
}
```

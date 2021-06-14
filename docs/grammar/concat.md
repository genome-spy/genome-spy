# View Concatenation

The `vconcat` and `hconcat` composition operators place views side-by-side
either vertically or horizontally. The `vconcat` is practical for building
genomic visualizations with multiple tracks.

The spacing (in pixels) between concatenated views can be adjusted using the
`spacing` property (Default: `10`).

## Example

### Vertical

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
Thus, the width of the above example is `{ "px": 20, "grow": 3 }`.

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

By default, all channels have independent scales and axes.

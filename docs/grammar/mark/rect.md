# Rect

Rect mark displays each data item as a rectangle.

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 20, "as": "z" }
  },
  "transform": [
    { "type": "formula", "as": "x", "expr": "random()" },
    { "type": "formula", "as": "x2", "expr": "datum.x + random() * 0.3" },
    { "type": "formula", "as": "y", "expr": "random()" },
    { "type": "formula", "as": "y2", "expr": "datum.y + random() * 0.4" }
  ],
  "mark": "rect",
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "x2": { "field": "x2" },
    "y": { "field": "y", "type": "quantitative" },
    "y2": { "field": "y2" },
    "color": { "field": "z", "type": "quantitative" }
  }
}
```

</div>
</div>

## Channels

Rect mark supports the standard [position](../encoding/index.md) channels and
`color` and `opacity` channels and the following:

`squeeze`
: Type: String

    Squeezes a side of the rectangle turning it into a triangle. Valid
    choices: `none` (default), `top`, `right`, `bottom`, `left`.

    **Default value:** `none`

## Properties

`minHeight`
: Type: Number

    The minimum height of a rectangle in pixels. The property clamps rectangles'
    heights.

    **Default value:** `0`

`minWidth`
: Type: Number

    The minimum width of a rectangle in pixels. The property clamps rectangles'
    widths when the viewport is zoomed out.

    This property also reduces flickering of very narrow rectangles, thus, the
    value should generally be at least one.

    **Default value:** `1`

`minOpacity`
: Type: Number

    Clamps the minimum size-dependent opacity. The property does not affect
    the `opacity` channel. Valid values are between `0` and `1`.

    When a rectangle would be smaller than what is specified in `minHeight` and
    `minWidth`, it is faded out proportionally. Example: a rectangle would be
    rendered as one pixel wide, but `minWidth` clamps it to five pixels. The
    rectangle is actually rendered as five pixels wide, but its opacity is
    multiplied by 0.2. With this setting, you can limit the factor to, for
    example, 0.5 to keep the rectangles more clearly visible.

    **Default value:** `0`

`offsetX`
: Type: Number

    Offsets of the x and x2 coordinates in pixels. The offset is applied after
    the viewport scaling and translation.

    **Default value:** `0`

`offsetY`
: Type: Number

    Offsets of the x and x2 coordinates in pixels. The offset is applied after
    the viewport scaling and translation.

    **Default value:** `0`

## Examples

### Heatmap

When used with `band` or `index` scales, the rectangles fill the whole bands
when only the primary positional channel is defined.

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 800, "as": "z" }
  },
  "transform": [
    { "type": "formula", "as": "y", "expr": "floor(datum.z / 40)" },
    { "type": "formula", "as": "x", "expr": "datum.z % 40" },
    {
      "type": "formula",
      "as": "z",
      "expr": "sin(datum.x / 8) + cos(datum.y / 10 - 0.5 + sin(datum.x / 20) * 2)"
    }
  ],
  "mark": "rect",
  "encoding": {
    "x": { "field": "x", "type": "index" },
    "y": { "field": "y", "type": "index" },
    "color": {
      "field": "z",
      "type": "quantitative",
      "scale": {
        "scheme": "magma"
      }
    }
  }
}
```

</div>
</div>

### Bars

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 60, "as": "x" }
  },
  "transform": [
    {
      "type": "formula",
      "expr": "sin((datum.x - 30) / 4) + (datum.x - 30) / 30",
      "as": "y"
    }
  ],
  "mark": "rect",
  "encoding": {
    "x": { "field": "x", "type": "index", "band": 0.9 },
    "y": { "field": "y", "type": "quantitative" },
    "y2": { "datum": 0 },
    "color": {
      "field": "y",
      "type": "quantitative",
      "scale": {
        "type": "threshold",
        "domain": [0],
        "range": ["#ed553b", "#20639b"]
      }
    }
  }
}
```

</div>
</div>

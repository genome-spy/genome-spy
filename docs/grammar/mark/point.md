# Point

Point mark displays each data item as a symbol. Points are often used to create
a scatter plot. In the genomic context, they could represent, for example,
point mutations at genomic loci.

<div><genome-spy-doc-embed height="200">

```json
{
  "data": { "url": "sincos.csv" },
  "mark": "point",
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "sin", "type": "quantitative" },
    "size": { "field": "x", "type": "quantitative" }
  }
}
```

</genome-spy-doc-embed></div>

## Channels

In addition to standard [position](./index.md#channels) channels and
`color`, `opacity`, and `strokeWidth` channels, point mark has the following
channels: `size`, `shape`, `dx`, and `dy`.

## Properties

SCHEMA PointProps

## Examples

### Plenty of points

The example below demonstrates how points can be varied by using
`shape`, `fill`, `size`, `strokeWidth`, and `angle` channels.

<div><genome-spy-doc-embed>

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 160, "as": "z" }
  },

  "transform": [
    { "type": "formula", "expr": "datum.z % 20", "as": "x" },
    { "type": "formula", "expr": "floor(datum.z / 20)", "as": "y" }
  ],

  "mark": {
    "type": "point",
    "stroke": "black"
  },

  "encoding": {
    "x": { "field": "x", "type": "ordinal", "axis": null },
    "y": { "field": "y", "type": "ordinal", "axis": null },
    "shape": { "field": "x", "type": "nominal" },
    "fill": { "field": "x", "type": "nominal" },
    "size": {
      "field": "x",
      "type": "quantitative",
      "scale": { "type": "pow", "exponent": 2, "range": [0, 900] }
    },
    "strokeWidth": {
      "field": "y",
      "type": "quantitative",
      "scale": { "range": [0, 4] }
    },
    "angle": {
      "field": "y",
      "type": "quantitative",
      "scale": { "range": [0, 45] }
    }
  }
}
```

</genome-spy-doc-embed></div>

## Zoom behavior

Although points are infinitely small on the real number line, they have a
specific diameter on the screen. Thus, closely located points tend to overlap
each other. Decreasing the point size reduces the probability of overlap, but
in a zoomed-in view, the plot may become overly sparse.

To control overplotting, the point mark provides two zooming behaviors that
adjust the point size and visibility based on the zoom level.

### Geometric zoom

Geometric zoom automatically changes the size of points as you zoom in or out.
In the example below, the `size` property is set using an
[expression](../expressions.md) that references the `zoomLevel`
[parameter](../parameters.md). The expression `min(0.5 * pow(zoomLevel, 1.5), 200)`
means that as you zoom in, point size increases, but the growth rate is
controlled by the exponent. This helps keep points visible and reduces overlap
at higher zoom levels, while preventing them from becoming too large. You can
adjust the expression to fine-tune how point size responds to zooming for your
specific visualization.

<div><genome-spy-doc-embed>

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 200000, "as": "x" }
  },
  "transform": [
    { "type": "formula", "expr": "random() * 0.682", "as": "u" },
    {
      "type": "formula",
      "expr": "((datum.u % 1e-8 > 5e-9 ? 1 : -1) * (sqrt(-log(max(1e-9, datum.u))) - 0.618)) * 1.618 + sin(datum.x / 10000)",
      "as": "y"
    }
  ],
  "mark": {
    "type": "point",
    "size": { "expr": "min(0.5 * pow(zoomLevel, 1.5), 200)" }
  },
  "encoding": {
    "x": { "field": "x", "type": "quantitative", "scale": { "zoom": true } },
    "y": { "field": "y", "type": "quantitative" },
    "opacity": { "value": 0.6 }
  }
}
```

</genome-spy-doc-embed></div>

!!! tip

    You can use geometric zoom to improve rendering performance. Smaller points
    are faster to render than large points.

### Semantic zoom

The score-based semantic zoom adjusts the point visibility by coupling a score
threshold to current zoom level. The `semanticScore` channel enables the
semantic zoom and specifies the score field. The `semanticZoomFraction` property
controls the fraction of data items to show in the fully zoomed-out view, i.e.,
it specifies the threshold score. The fraction is scaled as the viewport is
zoomed. Thus, if the data is distributed roughly uniformly along the zoomed
axis, roughly constant number of points are visible at all zoom levels. The
score can be _arbitrarily distributed_, as the threshold is computed using
_p_-quantiles.

The example below has 200 000 semi-randomly generated points with an
exponentially distributed score. As the view is zoomed in, new points appear.
Their number in the viewport stays approximately constant until the lowest
possible score has been reached.

<div><genome-spy-doc-embed>

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 200000, "as": "x" }
  },
  "transform": [
    { "type": "formula", "expr": "random() * 0.682", "as": "u" },
    {
      "type": "formula",
      "expr": "((datum.u % 1e-8 > 5e-9 ? 1 : -1) * (sqrt(-log(max(1e-9, datum.u))) - 0.618)) * 1.618",
      "as": "y"
    },
    {
      "type": "formula",
      "expr": "-log(random())",
      "as": "score"
    }
  ],
  "mark": {
    "type": "point",
    "semanticZoomFraction": 0.002
  },
  "encoding": {
    "x": { "field": "x", "type": "quantitative", "scale": { "zoom": true } },
    "y": { "field": "y", "type": "quantitative" },
    "opacity": {
      "field": "score",
      "type": "quantitative",
      "scale": { "range": [0.1, 1] }
    },
    "semanticScore": { "field": "score", "type": "quantitative" },
    "size": { "value": 100 }
  }
}
```

</genome-spy-doc-embed></div>

!!! tip

    The score-based semantic zoom is great for filtering point mutations and
    indels that are scored using [CADD](https://cadd.gs.washington.edu/),
    for example.

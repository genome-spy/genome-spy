# Point

Point mark displays each data item as a symbol. Points are often used to create
a scatter plot. In the genomic context, they could represent, for example,
point mutations at genomic loci.

EXAMPLE examples/docs/grammar/mark/point/point-mark.json height=200

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

EXAMPLE examples/docs/grammar/mark/point/plenty-of-points.json

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

EXAMPLE examples/docs/grammar/mark/point/geometric-zoom.json

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

EXAMPLE examples/docs/grammar/mark/point/semantic-zoom.json

!!! tip

    The score-based semantic zoom is great for filtering point mutations and
    indels that are scored using [CADD](https://cadd.gs.washington.edu/),
    for example.

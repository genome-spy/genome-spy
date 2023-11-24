# Visualization Grammar

Genome browser applications typically couple the visual representations to
specific file formats and provide few customization options. GenomeSpy has a
more abstract approach to visualization, providing combinatorial building blocks
such as [marks](mark/point.md), [transformations](transform/), and
[scales](scale.md). As a result, users can author tailored visualizations that
display the underlying data more effectively.

The concept was first introduced in [The Grammar of
Graphics](https://www.springer.com/gp/book/9780387245447) and developed further
in [ggplot2](https://ggplot2.tidyverse.org/) and
[Vega-Lite](https://vega.github.io/vega-lite/).

!!! note "A dialect of Vega-Lite"

    The visualization grammar of GenomeSpy is a dialect of
    [Vega-Lite](https://vega.github.io/vega-lite/), providing partial
    compatibility. However, the goals of GenomeSpy and Vega-Lite are different –
    GenomeSpy is more domain-specific and primarily intended for the
    visualization and analysis of large datasets containing genomic coordinates.
    Nevertheless, GenomeSpy tries to follow Vega-Lite's grammar where practical,
    and thus, this documentation has several references to its documentation.

## A single view specification

Each view specification must have at least the `data` to be visualized, the
`mark` that will represent the data items, and an `encoding` that specifies how
the fields of data are mapped to the visual channels of the mark. In addition,
an optional `transform` steps allow for modifying the data before they are
encoded into mark instances.

<div><genome-spy-doc-embed height="200">

```json
{
  "data": { "url": "sincos.csv" },
  "transform": [
    { "type": "formula", "expr": "abs(datum.sin)", "as": "abs(sin)" }
  ],
  "mark": "point",
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "abs(sin)", "type": "quantitative" },
    "size": { "field": "x", "type": "quantitative" }
  }
}
```

</genome-spy-doc-embed></div>

### Properties

`data`
: Specifies a [data source](./data/index.md). If omitted, the data source is inherited
from the parent view.

`transform`
: An array of [transformations](./transform/index.md) applied to the data before
visual encoding.

`mark`
: The graphical mark presenting the data objects.

`encoding`
: Specifies how data is encoded using the visual channels.

`name`
: An internal name that can be used for referring the view. For referencing purposes,
the name should be unique within the whole view hierarchy.

`width`
: Width of the view. Check [child sizing](./composition/concat.md#child-sizing) for details.

`height`
: Height of the view. Check [child sizing](./composition/concat.md#child-sizing) for details.

`viewportWidth`
: Width of the scrollable view. Check [child sizing](./composition/concat.md#child-sizing) for details.

`viewportHeight`
: Height of the scrollable view. Check [child sizing](./composition/concat.md#child-sizing) for details.

`view`
: View background. An object with the following [`"rect"`](./mark/rect.md) mark's properties:
`fill`, `stroke`, `strokeWidth`, `fillOpacity`, `strokeOpacity`, and `borderRadius`.

`padding`
: Padding applied to the view. Accepts either a number reprenting pixels or a
PaddingConfig. Example: `padding: { top: 10, right: 20, bottom: 10, left: 20 }`

`title`
: View title. Accepts a string or a
[title specification](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/spec/title.d.ts)
object. N.B.: Currently, GenomeSpy doesn't do bound calculation, and you need to
manually specify proper `padding` for the view to ensure that the title is visible.

`description`
: A description of the view. Can be used for documentation. The description of the
top-level view is shown in the toolbar of the [GenomeSpy _app_](../sample-collections/index.md).

`baseUrl`
: The base URL for relative [URL data sources](./data/index.md). The base URLs are
inherited in the view hierarchy unless overridden with this property. By default,
the top-level view's base URL equals to the visualization specification's base URL.

`opacity`
: Configures a static or dynamic opacity of the view. The latter enables semantic zooming. TODO: Elaborate.

`visible`
: The default visibility of the view. An invisible view is removed from the
layout and not rendered. For context, see
[toggleable view visibility](../sample-collections/visualizing.md#toggleable-view-visibility).

## View composition for more complex visualizations

View [composition](composition/index.md) allows for building more complex
visualizations from multiple single-view specifications. For example, the
[`layer`](composition/layer.md) operator allows creation of custom glyphs and
the [concatenation](composition/concat.md) operators enables stacked layouts
resembling genome browsers with multiple tracks.

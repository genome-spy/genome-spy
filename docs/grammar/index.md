# Visualization Grammar

Genome browser applications typically couple the visual representations to
specific file formats and provide few customization options. GenomeSpy has a
more abstract approach to visualization, providing combinatorial building blocks
such as [marks](mark/index.md), [transformations](transform/), and
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

SCHEMA UnitSpec

## View composition for more complex visualizations

View [composition](composition/index.md) allows for building more complex
visualizations from multiple single-view specifications. For example, the
[`layer`](composition/layer.md) operator allows creation of custom glyphs and
the [concatenation](composition/concat.md) operators enables stacked layouts
resembling genome browsers with multiple tracks.

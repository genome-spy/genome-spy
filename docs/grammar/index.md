# Visualization Grammar

Genome browser applications typically couple the visual representations to
specific file formats and provide few customization options. GenomeSpy has a
more abstract approach to visualization, providing combinatorial building blocks
such as [marks](mark/index.md), [transformations](transform/index.md), and
[scales](scale.md), [axes](axis.md), [titles](title.md), and
[legends](legend.md). As a result,
users can author tailored visualizations that display the underlying data more
effectively.

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

## Unit views

A GenomeSpy specification describes a hierarchy of views. A unit view is a leaf
in the hierarchy that renders data using a graphical [mark](mark/index.md). The
`mark` is the only required property. A unit view can define its own `data`,
`transform`, and `encoding`, or inherit them from an ancestor composition view.
Transforms modify the data before the encoding maps its fields to visual
channels of the mark.

EXAMPLE examples/docs/grammar/index/single-view-specification.json height=200

### Properties

The following reference lists all properties available on unit views. Most are
shared by the different view types and can be used throughout a view hierarchy;
`mark` is specific to unit views.

SCHEMA UnitSpec

## View composition

[Composition views](composition/index.md) arrange child views into a hierarchy.
For example, [`layer`](composition/layer.md) overlays views to create custom
glyphs, while the [concatenation](composition/concat.md) operators arrange views
into tracks or grids. Common properties such as `data`, `transform`, and
`encoding` can be defined on a composition view and inherited by its
descendants.

## Schema-assisted editing

GenomeSpy publishes a JSON Schema that JSON-aware editors can use for
completion, hover documentation, and validation. Add `$schema` to the root of a
Core specification:

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@genome-spy/core/dist/schema.json",
  "data": { "url": "data/example.csv" },
  "mark": "point",
  "encoding": {}
}
```

Use the `@genome-spy/app` schema instead for [sample collection
specifications](../sample-collections/index.md). For reproducible editing, pin
the schema to the same package version as the GenomeSpy runtime by adding
`@VERSION` after the package name. The Playground configures the Core schema
automatically.

The inline examples in this documentation omit `$schema` to keep them concise.
Schema validation checks the structure and configuration values of a
specification, but it cannot verify external resources, the existence of data
fields, or expression behavior.

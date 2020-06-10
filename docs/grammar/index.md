# Visualization Grammar

Genome browsers typically couple the visual representations to specific file
formats and provide few customization options. GenomeSpy has a more abstract
approach to visualization, providing combinatorial building blocks such as
[marks](mark/point.md), [transforms](transform/), and [scales](scale.md).
Users can author novel visualizations that display the underlying data more
effectively. The variety of building blocks is still rather limited, but
already allows for many useful
[visualizations](../genomic-data/examples/ascat.md).

[Ggplot2](https://ggplot2.tidyverse.org/) and
[Vega-Lite](https://vega.github.io/vega-lite/) are two widely used
grammar-based visualization tools.

TODO: Quick introduction to view specifications.

!!! note "A subset of Vega-Lite"

    The visualization grammar of GenomeSpy is a subset and a dialect of
    [Vega-Lite](https://vega.github.io/vega-lite/). However, the goals of
    GenomeSpy and Vega-Lite are different – GenomeSpy is more domain specific
    and is intended for visualizing genomic coordinates. In its current form,
    the grammar of GenomeSpy is limited to specifying the visual encoding and
    certain data transformations. GenomeSpy tries to faithfully follow
    Vega-Lite's grammar where practical. Thus, this documentation has many
    references to its documentation.

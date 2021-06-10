# Visualization Grammar

Genome browsers typically couple the visual representations to specific file
formats and provide few customization options. GenomeSpy has a more abstract
approach to visualization, providing combinatorial building blocks such as
[marks](mark/point.md), [transforms](transform/), and [scales](scale.md).
Users can author novel visualizations that display the underlying data more
effectively.

The concept was first introduced in [The Grammar of
Graphics](https://www.springer.com/gp/book/9780387245447) and developer further
in [ggplot2](https://ggplot2.tidyverse.org/) and
[Vega-Lite](https://vega.github.io/vega-lite/).

TODO: Quick introduction to view specifications.

!!! note "A subset of Vega-Lite"

    The visualization grammar of GenomeSpy is a subset and a dialect of
    [Vega-Lite](https://vega.github.io/vega-lite/). However, the goals of
    GenomeSpy and Vega-Lite are different – GenomeSpy is more domain specific
    and is intended for visualizing large datasets that contain genomic
    coordinates. GenomeSpy tries to faithfully follow Vega-Lite's grammar where
    practical. Thus, this documentation has many references to its
    documentation.

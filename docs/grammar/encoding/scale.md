# Scale

Scales are functions that transform abstract values (e.g., a type of a point
mutation) in the data to visual values (e.g., colors that indicate the type).

By default, GenomeSpy configures scales automatically, based on the data type
(e.g., `ordinal`), visual channel, and the data domain. The defaults may not
always be optimal, and you can configure them by yourself.

GenomeSpy replicates the majority of the [scale types of
Vega-Lite](https://vega.github.io/vega-lite/docs/scale.html). Thus, for the
most parts, its documentation applies to GenomeSpy. However, `bin-linear` and
`bin-ordinal` scales are not supported, as GenomeSpy does not currently
support binning.

TODO: More specific differences, some examples

!!! note "Relation to Vega scales"

    In fact, GenomeSpy uses [Vega scales](https://vega.github.io/vega/docs/scales/),
    which are based on [d3-scale](https://github.com/d3/d3-scale).

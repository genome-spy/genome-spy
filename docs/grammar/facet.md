# Facet

The `facet` operator repeats one child view for groups of data. A shorthand
facet field creates column facets, and a `row`/`column` mapping creates a facet
matrix.

EXAMPLE examples/docs/grammar/facet/anscombe-wrapped.json

## Properties

SCHEMA FacetSpec

## Transforms and Data Scope

Transforms on the facet specification run before grouping. Transforms inside
`spec` run independently for each group. For example, an aggregate without
`groupby` computes one mean per facet:

EXAMPLE examples/docs/grammar/facet/means.json

Child transforms may remove or overwrite the facet fields without changing the
group to which their output belongs. The facet fields are not implicitly added
to aggregate or project output; include them explicitly if later transforms
need them.

Cell membership comes from the input after the outer transforms. A child filter
can leave an empty cell, and an ungrouped count aggregate in that cell produces
zero. An outer filter removes groups before cells are created.

A child with its own `data` uses that dataset in every cell. Lookup tables also
retain their own data scope.

## Initial Limitations

Facets currently use shared scales and axes. Independent per-facet scale domains
and independent axes are not supported.

Legends render once beside the complete facet grid. Interactions inside
individual facet cells are not implemented.

The `columns` property wraps one-dimensional column facets only. It cannot be
used together with `facet.row`.

Explicit `collect.groupby` is unsupported on inherited facet data; collection
and sorting without grouping are supported. The placement transforms
`displace1d`, `filterScoredLabels`, `packLegendLabels`, and `axisLabelLayout`
also reject inherited facet data.

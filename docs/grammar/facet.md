# Facet

The `facet` operator repeats one child view for groups of data. A shorthand
facet field creates column facets, and a `row`/`column` mapping creates a facet
matrix.

EXAMPLE examples/docs/grammar/facet/anscombe-wrapped.json

## Properties

SCHEMA FacetSpec

## Initial Limitations

Facets currently use shared scales and axes. Independent per-facet scale domains
and independent axes are not supported.

The `columns` property wraps one-dimensional column facets only. It cannot be
used together with `facet.row`.

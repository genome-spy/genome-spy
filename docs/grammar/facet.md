# Facet

The `facet` operator repeats one child view for groups of data. A shorthand
facet field creates column facets, and a `row`/`column` mapping creates a facet
matrix.

EXAMPLE examples/docs/grammar/facet/anscombe-wrapped.json

## Properties

SCHEMA FacetSpec

### Facet Fields

SCHEMA FacetFieldDef

Row and column fields can have different orders. For example,
`"row": {"field": "group", "sort": ["control", "treated"]}` puts control
first even if treated occurs first in the data.

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

## Interactions

Picking, tooltips, and point selections follow the pointed cell. Mark hits and
custom tooltip contexts include a `facetId` tuple in row/column order.

Pan and zoom gestures update shared scales across all cells. Their anchor and
pan distance use the pointed cell's plot bounds, including in scrolled facet
viewports. Interval brushes also use the initiating cell's coordinates and
share their selection across cells. Selection parameters have one shared value;
each cell does not have a separate parameter runtime.

Legends render once beside the complete facet grid.

## Initial Limitations

Facets currently use shared scales and repeated axes. Independent per-cell scale
domains, legends, and axes are not supported and produce an error. Layers inside
the repeated plot can still use independent non-positional scales; each layer's
scale spans all facet cells.

Category values are used as labels. Facet field `title`
and configurable headers are not supported. A `title` on the repeated child
still titles each plot.

The `columns` property wraps one-dimensional column facets only. It cannot be
used together with `facet.row`.

Set `viewportWidth` or `viewportHeight` on the facet container to scroll the
grid. Viewports inside the repeated child are not supported and produce an
error.

Explicit `collect.groupby` is unsupported on inherited facet data; collection
and sorting without grouping are supported. The placement transforms
`displace1d`, `filterScoredLabels`, `packLegendLabels`, and `axisLabelLayout`
also reject inherited facet data.

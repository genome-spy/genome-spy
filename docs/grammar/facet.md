# Facet

The `facet` operator repeats one child view for groups of data. A shorthand
facet field creates column facets, and a `row`/`column` mapping creates a facet
matrix.

EXAMPLE examples/docs/grammar/facet/anscombe-wrapped.json

!!! disclaimer ""

    Data: Anscombe's quartet, served unchanged from
    [vega-datasets](https://github.com/vega/vega-datasets).

## Properties

SCHEMA FacetSpec

### Spacing

SCHEMA FacetSpacing

For example, `"spacing": {"row": 10, "column": 20}` gives columns wider gaps
than rows. Hidden headers contribute neither a band nor an adjacent gap.

### Facet Fields

SCHEMA FacetFieldDef

Row and column fields can have different orders. For example,
`"row": {"field": "group", "sort": ["control", "treated"]}` puts control
first even if treated occurs first in the data.

### Field Titles

Each facet field has a shared title that defaults to its field name. For example,
`"column": {"field": "Cylinders"}` displays “Cylinders” once above the complete
grid, outside the category labels. Row titles default to the left.
Set `title` to a string to replace the text or to `null` to hide it.

A title object uses the full [view-title](title.md) placement and styling
options, such as `"title": {"text": "Origin", "orient": "right"}`.
Field titles use `config.title` and named title styles. They reserve space
without changing fixed cell dimensions, and scroll and clip with the grid.

### Headers

SCHEMA FacetHeader

Each facet field can configure its category labels through `header`. For
example, `"column": {"field": "group", "header": null}` hides column labels
and its field title, reclaiming their space while retaining the same facet
cells. `"header": {"labels": false}` hides only category labels, preserving
the field title.

For numeric categories, `"header": {"format": ",.0f"}` displays thousands
separators. Formatting changes labels while preserving category identity and order.

Headers use [view-title](title.md) placement and style properties. Defaults
remain centered above columns and rotated beside rows. For horizontal,
right-aligned row labels, use:

```json
"row": {
  "field": "group",
  "header": { "angle": 0, "align": "right" }
}
```

Named title styles also work: `"header": {"style": "track-title"}` produces
horizontal track labels, while `"header": {"style": "overlay-title"}` places
labels inside the plot. Set `reserve: false` for placement that reserves no
space. Reserved headers keep at least the default 18-pixel band and grow to
fit longer labels. `orient`, `anchor`, `frame`, `offset`, `dx`, and `dy` have
the same meaning as for view titles. Headers scroll and clip with the facet grid.

Matrices keep one label per row or column; column facets with wrapping keep
one label per cell. Overlay placement preserves these label counts.

`config.header` supplies defaults for all headers. `config.headerRow` and
`config.headerColumn` override them for their respective channels. Named
styles override those defaults, and explicit `header` properties override
styles. `header: null` always hides labels. These configuration scopes follow
Vega-Lite's pattern, but properties use GenomeSpy's view-title names, such as
`angle` and `align`, rather than Vega-Lite's `labelAngle` and `labelAlign`.

## Scales and Guides

Scales and legends are shared across cells. Axes appear along the outer edges,
with one horizontal axis per occupied column and one vertical axis per row.
In an incomplete wrapped row, each bottom axis follows the last occupied cell
in its column. Grid lines remain in every cell.

Legends render once beside the complete facet grid. When the facet container
scrolls, its axes move with the grid and are clipped by the viewport.

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

## Differences from Vega-Lite

GenomeSpy supports basic category repetition with a smaller facet grammar:

- Scales, axes, and legends share their resolution across cells. Independent
  per-cell resolution is not supported.
- Faceting uses the explicit `facet` operator. The `row`, `column`, and `facet`
  encoding shortcuts are not supported. Compute binned or temporal categories
  in advance; facet fields do not accept `bin` or `timeUnit`.
- Headers support numeric formatting and view-title placement/styles, but not
  time formatting. Sorting by another field or aggregate is not supported.
- Selection parameters have one shared value across cells. Per-cell selection
  state and Vega-Lite's `union`/`intersect` selection resolution are not supported.

Layers inside the repeated plot can still use independent non-positional
scales; each layer's scale spans all facet cells. A `title` on the repeated
child titles each plot.

## Additional Limitations

The `columns` property wraps one-dimensional column facets only. It cannot be
used together with `facet.row`.

Set `viewportWidth` or `viewportHeight` on the facet container to scroll the
grid. Viewports inside the repeated child are not supported and produce an
error.

Explicit `collect.groupby` is unsupported on inherited facet data; collection
and sorting without grouping are supported. The placement transforms
`displace1d`, `filterScoredLabels`, `packLegendLabels`, and `axisLabelLayout`
also reject inherited facet data.

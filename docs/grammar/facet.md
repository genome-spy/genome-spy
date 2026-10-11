# Facet

The `facet` operator repeats a plot for each category in a dataset, making it
easy to compare groups using the same marks and scales.

## Basic Examples

### Wrapped Plots

EXAMPLE examples/docs/grammar/facet/anscombe-wrapped.json

!!! disclaimer ""

    Data: Anscombe's quartet, served unchanged from
    [vega-datasets](https://github.com/vega/vega-datasets).

### Genomic Tracks

A [BigWig URL template](data/multi-url.md#lazy-bigwig-files) adds a `sample`
field to records from five files. The row facet groups by that field, with
`overlay-title` labels inside the plots.

EXAMPLE examples/docs/grammar/facet/multi-url-bigwig.json height=350

!!! disclaimer ""

    These regional BigWigs retain H3K27ac values from [five released ENCODE
    files](https://www.encodeproject.org/search/?type=File&accession=ENCFF549YDI&accession=ENCFF539MQF&accession=ENCFF587ZRD&accession=ENCFF724HYE&accession=ENCFF896KSI)
    produced by the Bing Ren laboratory for [Gorkin et al.
    (2020)](https://doi.org/10.1038/s41586-020-2093-3). Only the displayed 10 Mb
    mm10 region was retained.

!!! note "Sample Collections in GenomeSpy App"

    For very large datasets, GenomeSpy App's
    [sample views](../sample-collections/visualizing.md#specifying-a-sample-view)
    provide more efficient rendering and interactions than facets. Each layer can
    partition its own data source using the `sample` channel; Core facets partition
    [one shared input](#transforms-and-data-scope). The App displays
    [sample metadata](../sample-collections/metadata-sources.md) alongside tracks
    and supports interactive sorting, filtering, and grouping.
    The [App BigWig example](data/multi-url.md#app-example) shows the same five
    signal tracks using a sample view.

## Defining a Facet

The `facet` property specifies how to group the data, and `spec` defines the plot
repeated for each group. Both properties are required. The facet can declare
shared `data` alongside them or inherit it from a parent view.

| Arrangement | `facet` definition                                               |
| ----------- | ---------------------------------------------------------------- |
| Columns     | `{"field": "group"}` or `{"column": {"field": "group"}}`         |
| Rows        | `{"row": {"field": "group"}}`                                    |
| Matrix      | `{"row": {"field": "Origin"}, "column": {"field": "Cylinders"}}` |

The repeated `spec` can be a single plot, a [layered plot](composition/layer.md),
or an [import](import.md) that resolves to a unit, layer, or multiscale plot.
Concatenations and nested facets are not supported inside `spec`.

Other properties are covered in the [common view reference](index.md#unit-view-reference).

### Facet Fields

Row and column categories can be ordered independently.

SCHEMA FacetFieldDef

## Layout

### Wrapping

Column facets form a single row unless `columns` specifies a positive integer
for wrapping. For example, `"columns": 2` creates rows of at most two plots.
Wrapping cannot be combined with `facet.row`.

### Spacing

The `spacing` property sets gaps between cells: a number sets both directions,
and an object such as `{"row": 10, "column": 20}` sets them separately.
Zero removes the gap; hidden headers add no space.

SCHEMA FacetSpacing

### Sizing and Scrolling

The repeated plot's `width` and `height` determine each cell's size, using the
same [sizing rules as concatenated views](composition/concat.md#child-sizing).
Without fixed cell dimensions, the facets share the available container space.

Set `viewportWidth` or `viewportHeight` on the facet container to scroll the
grid. Headers and axes scroll and clip with it. Child viewports are not supported.

## Headers

Headers combine a shared field title, such as “Origin”, with category labels,
such as “Europe” and “Japan”. Both use [view-title](title.md) styling and
placement. A `title` inside the repeated `spec` labels each plot instead.

SCHEMA FacetHeader labels format

### Category Labels

Set `header` to `null` to hide both labels and the field title, or to
`{"labels": false}` to preserve the title.

Labels default to centered above columns and rotated beside rows. For
horizontal, right-aligned row labels, use:

```json
"row": {
  "field": "group",
  "header": { "angle": 0, "align": "right" }
}
```

Named title styles include `track-title` for horizontal track labels and
`overlay-title` for labels inside the plot.

### Header Defaults

`config.header` supplies shared defaults; `config.headerRow` and
`config.headerColumn` override them per channel. Named styles override config,
and explicit `header` properties override styles.

## Scales and Guides

Scales are shared across cells, with legends drawn once beside the grid. Axes
appear along the outer edges: one horizontal axis per occupied column and one
vertical axis per row. In incomplete wrapped rows, bottom axes follow the last
occupied cell in each column. Grid lines remain in every cell.

Layers can retain separate non-positional scales, each shared across cells.

## Transforms and Data Scope

Transforms on the facet specification run before grouping. Transforms inside
`spec` run independently for each group. For example, an aggregate without
`groupby` computes one mean per facet:

EXAMPLE examples/docs/grammar/facet/means.json

Child transforms can drop facet fields without changing cell membership.
Include those fields in aggregate or project output if later transforms need
them. Child filters can leave empty cells; outer filters remove groups before
cells are created.

A child or layer with its own `data` repeats its result in every cell. That
dataset is not partitioned, even if it contains the facet fields.

## Interactions

Picking and tooltips use the pointed cell's data. Pan and zoom update shared
scales across all cells and also work in the gaps between them. Point and interval
selections also share their state across cells.

## Differences from Vega-Lite

Vega-Lite's facet encoding shortcuts, independent per-cell resolution, time
formatting, and sorting by another field or aggregate are not supported.
Header styling uses view-title names such as `angle` and `align`, rather than
`labelAngle` and `labelAlign`.

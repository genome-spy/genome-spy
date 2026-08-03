# Legend placement ecosystem findings

Visualization packages use several different models for keeping legends near
their source views or collecting them into a centralized location. This
document records how established packages address that concern. It does not
propose a GenomeSpy design or implementation plan.

## Sources

The findings are based on the official documentation of the surveyed packages:

- [ComplexHeatmap legend reference](https://jokergoo.github.io/ComplexHeatmap-reference/book/legends.html)
- [ComplexHeatmap `Legend` API](https://jokergoo.github.io/ComplexHeatmap/reference/Legend.html)
- [patchwork layout guide](https://patchwork.data-imaginist.com/articles/guides/layout.html)
- [patchwork `guide_area()` API](https://patchwork.data-imaginist.com/reference/guide_area.html)
- [cowplot shared-legends vignette](https://wilkelab.org/cowplot/articles/shared_legends.html)
- [cowplot `get_legend()` API](https://wilkelab.org/cowplot/reference/get_legend.html)
- [Matplotlib `Figure.legend()` API](https://matplotlib.org/stable/api/_as_gen/matplotlib.figure.Figure.legend.html)
- [Matplotlib figure API](https://matplotlib.org/stable/api/figure_api.html)
- [Plotly legend documentation](https://plotly.com/python/legend/)
- [Highcharts legend layout](https://api.highcharts.com/highcharts/legend.layout)
- [Highcharts legend alignment](https://api.highcharts.com/highcharts/legend.align.html)
- [Bokeh annotation and legend guide](https://docs.bokeh.org/en/latest/docs/user_guide/basic/annotations.html)

## ComplexHeatmap

ComplexHeatmap treats the complete `HeatmapList` as the owner of legend
layout. Individual heatmaps and simple annotations generate legends, but the
legends are assembled when the complete composition is drawn.

The package provides:

- Separate collections for heatmap and annotation legends.
- Independent placement through `heatmap_legend_side` and
  `annotation_legend_side`.
- `merge_legend = TRUE` for packing the heatmap and annotation legends into a
  single group.
- Automatic packing into multiple columns, or multiple rows when the legends
  are placed at the top or bottom, when the collection would otherwise exceed
  the page.
- Ordering based on the associated heatmap and annotation sides.
- `legend_grouping` for controlling whether annotation legends remain grouped
  separately.
- `heatmap_legend_list` and `annotation_legend_list` for adding manually
  constructed legends.

In this context, merging primarily means collecting distinct legends into one
packed group. It does not require the underlying color mappings to become one
shared mapping.

All legends are represented by the `Legends` class. `packLegend()` combines
individual legends horizontally or vertically into another `Legends` object.
The packed result has a measurable extent and can be drawn at an explicit
position in an R grid viewport. Legend construction, collection, packing, and
final placement are therefore separate operations.

ComplexHeatmap is designed around centralized static composition. Its model
does not need to address local track-by-track defaults, runtime view mutation,
or reactive legend visibility in the same way as GenomeSpy.

## patchwork

Patchwork exposes guide collection as a property of a composition through
`plot_layout(guides = ...)`:

- `"keep"` keeps guides beside their source plots.
- `"collect"` hoists guides into the current composition.
- `"auto"` does not collect at the current level, but permits an enclosing
  composition to collect them.

This policy works through nested compositions. A nested composition can prevent
an outer composition from collecting its guides by selecting `"keep"`.

When guides are collected, patchwork removes duplicates by comparing their
rendered graphical representations. It does not compare only the declarative
scale definitions. Consequently, guides for equivalent data mappings may
remain distinct when their rendered styling differs.

Patchwork also provides `guide_area()`, a placeholder that occupies an ordinary
cell in the composition layout. Collected guides are placed in that cell rather
than at the side selected by the theme. If no guides are collected, the guide
area behaves like an empty spacer.

Guide areas are scoped to their own nesting level. An outer composition cannot
place its collected guides into a guide area inside a nested composition.

Patchwork therefore separates:

- Whether guides may leave their source plot.
- The composition level that collects them.
- The layout area occupied by the collector.
- Deduplication of visually equivalent guides.

## cowplot

Cowplot provides a manual extraction and composition workflow:

1. `get_legend()` extracts a legend from a ggplot as a gtable object.
2. The source plots suppress their local legends.
3. The extracted legend is inserted into `plot_grid()` like another layout
   object.

The extracted legend can occupy a dedicated row, column, or arbitrary position
with explicitly controlled relative size. This provides high layout
flexibility, but the user is responsible for choosing which legend to extract,
suppressing duplicates, and composing the result.

The pattern demonstrates that a legend can be treated as a first-class layout
object. In a reactive browser visualization, literal extraction would also
need to preserve live connections to scales, visibility, parameters, and
interaction state.

## Matplotlib

Matplotlib provides two primary legend ownership levels:

- `Axes.legend()` creates a legend relative to one axes.
- `Figure.legend()` creates a legend relative to the complete figure.

When handles and labels are not supplied explicitly, a figure legend can
discover labeled artists automatically. The caller can also supply an explicit
set of handles and labels.

Figure legends use figure coordinates rather than axes coordinates. With
constrained layout, `outside` location values reserve space beside the subplot
layout. `bbox_to_anchor` provides free placement in an axes- or figure-relative
coordinate system.

Matplotlib therefore expresses local versus centralized ownership directly,
but moving from one to the other is an explicit authoring choice. It does not
provide a patchwork-style named guide area. Authors generally reserve a layout
cell or provide a bounding box manually when a legend needs a dedicated slot.

## Plotly

Plotly uses a figure-level legend by default. Eligible traces and shapes across
the figure contribute items to the primary legend.

Plotly also supports multiple named legend destinations. A trace or shape can
set its `legend` property to `"legend2"`, `"legend3"`, and so on. Each named
collector is configured independently through `layout.legend`,
`layout.legend2`, `layout.legend3`, and corresponding properties.

Each collector can have its own title, orientation, styling, and coordinates.
Position coordinates can be relative to the plotting paper or to the complete
container. Container-relative placement can grow the figure margin so that the
legend does not overlap the plot.

Plotly's `legendgroup` property has a different purpose. It groups legend items
and traces for interactive visibility behavior; it does not select the legend
destination. Destination and interaction grouping are therefore independent:

```text
legend = "legend2"      selects a collector
legendgroup = "groupA"  selects an interaction group
```

The named collector model provides explicit routing, but Plotly's traces
already belong to one figure-level model. It does not have the same nested
resolution ownership problem as GenomeSpy.

## Highcharts

Highcharts normally uses a single chart-level legend. Eligible series from the
chart contribute entries to that collector.

The legend can be aligned within the chart, placed horizontally or vertically,
and configured either to reserve plot space or float over the plot. The
`proximate` layout attempts to place legend items near the series they
represent, providing a local-association alternative within a global legend.

This model is simple for a flat chart containing multiple series, but it does
not provide hierarchical collection, multiple named collectors, or explicit
guide slots.

## Bokeh

Bokeh legends are model objects associated with a plot. Glyph methods can
create them automatically, or authors can manually construct `Legend` and
`LegendItem` objects linked to glyph renderers.

A legend can be placed inside its plot or added to one of the plot's side
layout regions. Its entries can be arranged in multiple rows or columns.

Bokeh does not automatically collect legends across a `gridplot`. A
centralized legend generally requires manual construction from renderers or a
restructured layout. Like cowplot, it demonstrates a movable, first-class
legend object, but collection remains an author responsibility.

## Recurring models

The surveyed packages fall into several broad models:

| Model | Examples | Characteristic |
| --- | --- | --- |
| Local or composition-level collection policy | patchwork | Switches between source-local and ancestor-owned guides |
| Composition-level collector | ComplexHeatmap | Packs many distinct legends for a complete structured visualization |
| Named collector destination | Plotly | Routes contributions into independently positioned legend objects |
| Extracted first-class layout object | cowplot, Matplotlib, Bokeh | Gives the author manual control over legend ownership and placement |
| Single chart-global collector | Highcharts | Collects all series entries in a flat chart model |

## Cross-package observations

### Collection is distinct from scale sharing

ComplexHeatmap can pack legends for independent color mappings into one
collection. Plotly can route unrelated traces into the same named collector.
Neither operation requires the underlying scales or mappings to become shared.

### Collection is distinct from deduplication

Patchwork hoists guides and then removes visually identical ones. ComplexHeatmap
can pack distinct legends without deduplicating them. These are separate
operations even when exposed through similarly named options.

### The collection level is often explicit

Patchwork attaches collection policy to a composition level. Matplotlib makes
the caller choose between axes and figure ownership. ComplexHeatmap centralizes
collection at the `HeatmapList`. These systems identify a concrete layout owner
rather than treating collection as a property of the scale alone.

### Dedicated layout space is a separate concern

Patchwork's `guide_area()` reserves an ordinary composition cell. Cowplot can
insert an extracted legend into any plot-grid cell. Matplotlib can reserve a
GridSpec area or bounding box. These mechanisms distinguish the collector's
contents from the space in which the collector is rendered.

### Packing must respond to available space

ComplexHeatmap automatically creates multiple columns or rows when a legend
collection would exceed the output page. Plotly, Bokeh, Matplotlib, and
Highcharts expose row, column, orientation, or size controls. Central
collection creates a separate packing problem that local one-legend regions
may not encounter.

### Terminology is inconsistent

The surveyed packages use overlapping terms for different operations:

- Vega-Lite merging combines compatible legend definitions into one legend.
- Patchwork collection hoists guides and may deduplicate visually identical
  results.
- ComplexHeatmap's `merge_legend` packs multiple distinct legends into one
  group.
- Plotly routing places contributions into the same named legend collector.

For comparative discussion, the following operations should remain distinct:

- Sharing a scale.
- Combining compatible channel contributions into one legend.
- Collecting complete legends at another layout owner.
- Deduplicating equivalent legends.
- Routing legends to a named destination.
- Packing the legends within that destination.

## Generalized flow

Across the packages, the most complete model can be described without assuming
a particular API:

```text
source view
    |
    | produces a legend contribution
    v
collection policy
    |  keep locally / hoist / route by destination
    v
collector
    |  retain distinct / deduplicate / combine
    v
collector layout
       side / layout area / coordinates / packing / wrapping
```

No single surveyed package implements every stage. Patchwork most clearly
models hierarchical collection and a dedicated layout area. ComplexHeatmap
most directly addresses centralized packing of many bioinformatics legends.
Plotly most directly models multiple named destinations.

## Resolution ownership versus collection

GenomeSpy and Vega-Lite normally place a legend according to its resolution
owner. Independent legends remain with their source views, while a compatible
shared resolution can move a combined legend to a common ancestor. This model
cannot centralize unrelated mappings without changing their semantic
resolution.

Central collection is different: independent legend and scale resolutions stay
unchanged while complete legend boxes are packed by a composition-level layout
owner. Patchwork's `guides = "collect"` is the closest surveyed precedent for
this operation. In an enum whose existing modes are adjectives such as
`"independent"` and `"shared"`, the corresponding GenomeSpy mode can use the
adjective `"collected"` while retaining the same conceptual provenance.

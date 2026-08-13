# Axis

Axes explain how positional channels such as `x` and `y` map data values to
positions. GenomeSpy creates axes automatically for positional field and
expression encodings.

## Configuration

Axis properties are usually placed in the encoding channel that creates the
axis:

```json
{
  "encoding": {
    "x": {
      "field": "position",
      "type": "quantitative",
      "axis": {
        "title": "Position",
        "grid": true
      }
    }
  }
}
```

In composed views, view-level `axes.<channel>` can provide a shared location for
axis properties when the subtree has a unique axis resolution for that channel.
See [Resolution](#resolution).

Set `axis` to `null` on a channel to remove the corresponding axis. In a shared
axis resolution, this removes the shared axis.

```json title="Remove one axis"
{
  "encoding": {
    "x": {
      "field": "position",
      "type": "quantitative",
      "axis": null
    }
  }
}
```

## Placement

The `orient` property controls the side of the plot where the axis is placed.
The default orientation is `"bottom"` for x axes and `"left"` for y axes.

Supported orientations:

- `top`
- `bottom`
- `left`
- `right`

Axes are placed outside the plotting area by default. Set `placement` to
`"inside"` to draw an axis into the plot area instead. An inside axis is
mirrored into the plot: for example, a left-oriented y axis keeps its domain line
at the left plot edge, while ticks and labels extend rightward over the plotted
data.

Inside axes do not reserve external layout space and render above marks by
default. Use `zindex` to override that layering.

EXAMPLE examples/docs/grammar/axis/inside-axis.json height=240

## Titles

Axis titles default to the encoding title. If no encoding title is specified,
GenomeSpy uses the encoded field name or expression. Shared axes concatenate the
unique participant titles.

Set `axis.title` to override the generated title, or to `null` to remove it.

```json
{
  "axis": {
    "title": "Copy number",
    "titlePadding": 8
  }
}
```

Set `titleFit` to `"range"` to constrain the axis title to the axis span. Ranged
titles are squeezed when space is scarce and stay visible longer inside
scrollable viewports, but cannot extend outside the axis span.

## Ticks and Labels

By default, ticks are generated from the scale. Explicit `values` replace them,
while `extraValues` supplement them on continuous scales. When labels overlap,
explicit labels are culled among themselves first, and the survivors take
precedence over generated labels.

EXAMPLE examples/docs/grammar/axis/protein-domain-ticks.json height=90 spechidden

By default, continuous axes cull overlapping labels. Non-zoomable x axes also
align endpoint labels flush with the plot edges. On zoomable x axes, only ticks
at a configured bounded zoom extent are flushed, avoiding label snapping during
zooming. These behaviors support axis-aligned labels; culling a label does not
remove its tick mark.

## Resolution

Axes participate in view
[resolution](./composition/index.md#scale-axis-and-legend-resolution) similarly
to scales and legends. Use `resolve.axis` in composed views to choose whether
child views share one axis or create independent axes.

Shared axis resolution requires the corresponding scale resolution to be shared.
Axis domain line, ticks, and labels are drawn once for each shared row or
column. Grid lines are drawn for all participating views.

```json
{
  "resolve": {
    "scale": { "x": "shared" },
    "axis": { "x": "shared" }
  }
}
```

For shared axis resolutions, axis properties can also be placed at the view level
with `axes.<channel>`:

```json title="View-level axis properties"
{
  "axes": {
    "x": {
      "orient": "bottom",
      "grid": true
    }
  },
  "layer": [
    ...
  ]
}
```

A view-level axis declaration must map to one axis resolution. If the subtree
has multiple independent axes for the same channel, place the declaration
closer to the intended subtree or use local `encoding.<channel>.axis`
properties. Do not mix view-level `axes.<channel>` with participating
channel-level axis properties for the same resolved axis.

When nested view-level axis declarations target the same resolution, the
ancestor declaration shadows the whole descendant declaration; their
properties are not merged. Declarations in separate sibling subtrees remain
ambiguous and cause an error.

## Genome Axis for Loci

The genome axis is a special axis for the `"locus"` scale. It displays
chromosome names and intra-chromosomal coordinates. Chromosome ticks, labels,
grid lines, and alternating chromosome fills can be styled with `chrom*`
properties.

EXAMPLE examples/docs/grammar/axis/genome-axis.json height=150

## Custom Axes

The [`"axisTicks"`](data/lazy.md#axis-ticks) data source provides tick values
and labels for a channel. It can be used to build custom axes or custom
axis-aligned annotations.

The [`"axisGenome"`](data/lazy.md#axis-genome) data source provides the
chromosomes and their sizes for a locus channel. It can be used to build custom
chromosome ticks, bands, or grids.

## Properties

SCHEMA Axis

## Genome Axis Properties

Genome axes support all normal axis properties above, along with the following
genome-specific properties:

SCHEMA GenomeAxis chromTicks chromTickSize chromTickWidth chromTickColor chromTickDash chromTickDashOffset chromLabels chromLabelFont chromLabelFontSize chromLabelFontWeight chromLabelFontStyle chromLabelColor chromLabelPadding chromLabelAlign chromGrid chromGridColor chromGridCap chromGridDash chromGridDashOffset chromGridOpacity chromGridWidth chromGridFillOdd chromGridFillEven

## Styling

Axis defaults can be configured with `config.axis`. More specific config buckets
such as `config.axisX`, `config.axisY`, `config.axisTop`, `config.axisBottom`,
`config.axisLeft`, `config.axisRight`, `config.axisQuantitative`,
`config.axisIndex`, and `config.axisLocus` refine those defaults. A
channel-level axis object overrides the configured defaults for that axis.

Named styles from `config.style` can also be referenced with `axis.style`.

```json
{
  "config": {
    "axis": {
      "domainColor": "black",
      "tickColor": "black",
      "labelFontSize": 11,
      "titleFontSize": 12
    },
    "axisQuantitative": {
      "grid": true,
      "gridColor": "#ddd"
    }
  }
}
```

### Config Properties

SCHEMA AxisConfig

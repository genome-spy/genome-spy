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

## Ticks, Labels, and Grid Lines

Use `tickCount` to set the desired number of ticks on quantitative axes. The
actual number may differ when GenomeSpy chooses nice tick values. `tickCount`
can also be an expression reference. In tick-count expressions, `axisLength` is
the current length of the axis in pixels. Use `tickMinStep` to set the minimum
step between ticks in domain units.

Use `values` to set explicit tick and label values. Use `format` to format
numeric labels with a
[d3-format](https://github.com/d3/d3-format#locale_format) specifier.

Set `ticks` or `labels` to `false` to hide tick marks or labels while keeping
the rest of the axis.

Grid lines are hidden by default in the default theme. Set `grid` to `true` to
show grid lines for an axis. Global grid defaults can be configured with
[`config.axis*`](./config.md#axis-defaults).

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

```json title="View-level axis configuration"
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

A view-level axis config must map to one axis resolution. If the subtree has
multiple independent axes for the same channel, place the config closer to the
intended subtree or use local `encoding.<channel>.axis` settings. Do not mix
view-level `axes.<channel>` with participating channel-level axis config for the
same resolved axis.

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

SCHEMA GenomeAxis

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

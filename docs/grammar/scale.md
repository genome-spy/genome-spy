# Scale

Scales are
[functions](https://observablehq.com/@mkfreeman/animated-scale-diagram) that map
abstract data values (e.g., a type of a point mutation) to visual values (e.g.,
colors that indicate the type).

By default, GenomeSpy configures scales automatically based on the data type
(e.g., `"ordinal"`), the visual channel, and the data domain. As the defaults
may not always be optimal, the scales can be configured explicitly.

```json title="Specifying a scale for a channel"
{
  "encoding": {
    "y": {
      "field": "impact",
      "type": "quantitative",
      "scale": {
        "type": "linear",
        "domain": [0, 1]
      }
    }
  },
  ...
}

```

## Vega-Lite scales

GenomeSpy implements most of the [scale types of
Vega-Lite](https://vega.github.io/vega-lite/docs/scale.html). The aim is to
replicate their behavior identically (unless stated otherwise) in GenomeSpy.
Although that has yet to fully materialize, Vega-Lite's scale documentation
generally applies to GenomeSpy as well.

The supported scales are: `"linear"`, `"pow"`, `"sqrt"`, `"symlog"`, `"log"`,
`"ordinal"`, `"band"`, `"point"`, `"quantize"`, and `"threshold"`. Disabled
scale is supported on quantitative channels such as `x` and `opacity`.

Currently, the following scales are **not** supported: `"time"`, `"utc"`,
`"quantile"`, `"bin-linear"`, `"bin-ordinal"`.

!!! note "Relation to Vega scales"

    In fact, GenomeSpy uses [Vega
    scales](https://vega.github.io/vega/docs/scales/), which are based on
    [d3-scale](https://github.com/d3/d3-scale). However, GenomeSpy has GPU-based
    implementations for the actual scale transformations, ensuring high
    rendering performance.

## GenomeSpy-specific scales

GenomeSpy provides two additional scales that are designed for molecular
sequence data.

### Index scale

The `"index"` scale allows mapping index-based values such as nucleotide or
amino-acid locations to positional visual channels. It has traits from both the
continuous `"linear"` and the discrete `"band"` scale. It is linear and zoomable
but maps indices to the range like the band scale does – each index has its own
band. Properties such as `padding` work just as in the band scale.

The indices must be zero-based, i.e., the counting must start from zero. The
numbering of the axis labels can be adjusted to give an impression of, for
example, one-based indexing.

The index scale is used by default when the _field_ type is `"index"`.

#### Point indices

When only the primary positional channel is defined, marks such as `"rect"` fill
the whole band.

<div><genome-spy-doc-embed height="100" spechidden="true">

```json
{
  "data": {
    "values": [0, 2, 4, 7, 8, 10, 12]
  },
  "encoding": {
    "x": { "field": "data", "type": "index" }
  },
  "layer": [
    {
      "mark": "rect",
      "encoding": {
        "color": { "field": "data", "type": "nominal" }
      }
    },
    {
      "mark": "text",
      "encoding": {
        "text": {
          "field": "data"
        }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

Marks such as `"point"` that do not support the secondary positional channel are
centered.

<div><genome-spy-doc-embed height="100" spechidden="true">

```json
{
  "data": {
    "values": [0, 2, 4, 7, 8, 10, 12]
  },
  "mark": "point",
  "encoding": {
    "x": { "field": "data", "type": "index" },
    "color": { "field": "data", "type": "nominal" },
    "size": { "value": 300 }
  }
}
```

</genome-spy-doc-embed></div>

#### Range indices

When the index scale is used with ranges, e.g., a `"rect"` mark that has both
the `x` and `x2` channels defined, the ranges must be [half
open](http://genome.ucsc.edu/blog/the-ucsc-genome-browser-coordinate-counting-systems/).
For example, if a segment should cover the indices 2, 3, and 4, a half-open
range would be defined as: x = 2 (inclusive), x2 = 5 (exclusive).

<div><genome-spy-doc-embed height="100" spechidden="true">

```json
{
  "data": {
    "values": [
      { "from": 0, "to": 2 },
      { "from": 2, "to": 5 },
      { "from": 8, "to": 9 },
      { "from": 10, "to": 13 }
    ]
  },
  "encoding": {
    "x": { "field": "from", "type": "index" },
    "x2": { "field": "to" }
  },
  "layer": [
    {
      "mark": "rect",
      "encoding": {
        "color": { "field": "from", "type": "nominal" }
      }
    },
    {
      "mark": "text",
      "encoding": {
        "text": {
          "expr": "'[' + datum.from + ', ' + datum.to + ')'"
        }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

#### Adjusting the indexing of axis labels

The index scale expects zero-based indexing. However, it may be desirable to display
the axis labels using one-based indexing. Use the `numberingOffset` property adjust
the label indices.

<div><genome-spy-doc-embed height="100" spechidden="true">

```json
{
  "data": {
    "values": [0, 2, 4, 7, 8, 10, 12]
  },
  "encoding": {
    "x": {
      "field": "data",
      "type": "index",
      "scale": {
        "numberingOffset": 1
      }
    }
  },
  "layer": [
    {
      "mark": "rect",
      "encoding": {
        "color": { "field": "data", "type": "nominal" }
      }
    },
    {
      "mark": "text",
      "encoding": {
        "text": {
          "field": "data"
        }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

### Locus scale

The `"locus"` scale is similar to the `"index"` scale, but provides a genome-aware
axis with concatenated chromosomes. To use the locus scale, a
[genome](../genomic-data/genomic-coordinates.md) must be specified.

The locus scale is used by default when the field type is `"locus"`.

!!! note

    The locus scale does not map the discrete chromosomes onto the concatenated
    axis. It's done by the
    [linearizeGenomicCoordinate](../grammar/transform/linearize-genomic-coordinate.md)
    transform.

#### Specifying the domain

By default, the domain of the locus scale consists of the whole genome. However,
You can specify a custom domain using either linearized or genomic coordinates.
A genomic coordinate consists of a chromosome (`chrom`) and an optional position
(`pos`). The left bound's position defaults to zero, whereas the right bound's
position defaults to the size of the chromosome. Thus, the chromosomes are
inclusive.

For example, chromosomes 3, 4, and 5:

```json
[{ "chrom": "chr3" }, { "chrom": "chr5" }]
```

Only the chromosome 3:

```json
[{ "chrom": "chr3" }]
```

A specific region inside the chromosome 3:

```json
[
  { "chrom": "chr3", "pos": 1000000 },
  { "chrom": "chr3", "pos": 2000000 }
]
```

Somewhere inside the chromosome 1:

```json
[1000000, 2000000]
```

#### Example

<div><genome-spy-doc-embed height="80">

```json
{
  "genome": { "name": "hg38" },
  "data": {
    "values": [
      { "chrom": "chr3", "pos": 134567890 },
      { "chrom": "chr4", "pos": 123456789 },
      { "chrom": "chr9", "pos": 34567890 }
    ]
  },
  "mark": "point",
  "encoding": {
    "x": {
      "chrom": "chrom",
      "pos": "pos",
      "type": "locus",
      "scale": {
        "domain": [{ "chrom": "chr3" }, { "chrom": "chr9" }]
      }
    },
    "size": { "value": 200 }
  }
}
```

</genome-spy-doc-embed></div>

## Zooming and panning

To enable zooming and panning of continuous scales on positional channels, set
the `zoom` scale property to `true`. Example:

```json
{
  "x": {
    "field": "foo",
    "type": "quantitative",
    "scale": {
      "zoom": true
    }
  }
}
```

Both `"index"` and `"locus"` scales are zoomable by default.

### Zoom extent

The zoom `extent` allows you to control how far the scale can be zoomed out or
panned (translated). Zoom extent equals the scale domain by default, except for
the `"locus"` scale, where it includes the whole genome. Example:

```json
{
  ...,
  "scale": {
    "domain": [10, 20],
    "zoom": {
      "extent": [0, 30]
    }
  }
}
```

## Named scales

By giving the scale a name, it can be accessed through the
[API](../api.md#api_getScaleResolutionByName).

```json
{
  ...,
  "scale": {
    "name": "myScale"
  }
}
```

## Axes

Positional channels are usually annotated with axes, which are automatically
generated based on the scale type. However, you can customize the axis by
specifying the `axis` property in the encoding block.

```json
{
  ...,
  "encoding": {
    "x": {
      "field": "foo",
      "type": "quantitative",
      "axis": {
        "title": "My axis title"
      }
    }
  }
}
```

GenomeSpy implements most of Vega-Lite's axis properties. See the [interface
definition](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/spec/axis.d.ts)
for supported properties. TODO: Write a proper documentation.

!!! note "Grid lines"

    Grid lines are hidden by default in GenomeSpy and can be enabled for each
    view using the `grid` property. The default behavior will be configurable
    once GenomeSpy supports themes.

### Genome axis for loci

The genome axis is a special axis for the `"locus"` scale. It displays
chromosome names and the intra-chromosomal coordinates. You can adjust the style
of the chromosome axis and grid using various parameters.

<div><genome-spy-doc-embed height="150">

```json
{
  "genome": { "name": "hg38" },
  "data": { "values": [] },
  "mark": "point",

  "encoding": {
    "x": {
      "chrom": "a",
      "pos": "b",
      "type": "locus",

      "axis": {
        "chromTickColor": "#5F87F5",
        "chromLabelColor": "#E16B67",

        "grid": true,
        "gridColor": "gray",
        "gridOpacity": 0.5,
        "gridDash": [1, 11],

        "chromGrid": true,
        "chromGridDash": [3, 3],
        "chromGridColor": "#5F87F5",
        "chromGridOpacity": 0.7,
        "chromGridFillEven": "#BEFACC",
        "chromGridFillOdd": "#FDFCE8"
      }
    }
  }
}
```

</genome-spy-doc-embed></div>

#### Fully customized axes

You can also disable the genome axis and grid and specify a custom axis instead.
The [`"axisGenome"`](data/lazy.md#axis-genome) data source provides the
chromosomes and their sizes, which can be used to create a custom axes or grids
for a view.

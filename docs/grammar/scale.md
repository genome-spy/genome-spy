# Scale

Scales are
[functions](https://observablehq.com/@mkfreeman/animated-scale-diagram) that map
abstract data values (e.g., a type of a point mutation) to visual values (e.g.,
colors that indicate the type).

By default, GenomeSpy configures scales automatically based on the data type
(e.g., `"ordinal"`), the visual channel, and the data domain. As the defaults
may not always be optimal, the scales can be configured explicitly.

Scale defaults can also be configured globally using `config.scale` and
`config.range`. For example, color defaults by data type can be set with
`nominalColorScheme`, `ordinalColorScheme`, and `quantitativeColorScheme`. See
[Config, Themes, and Styles](./config.md).

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

User-facing two-point domains on index scales are inclusive. For example,
`"domain": [2, 4]` covers the indices 2, 3, and 4. Domains inferred from
observed data also include the last observed index.

#### Point indices

When only the primary positional channel is defined, marks such as `"rect"` fill
the whole band.

EXAMPLE examples/docs/grammar/scale/point-indices-bands.json height=100 spechidden

Marks such as `"point"` that do not support the secondary positional channel are
centered.

EXAMPLE examples/docs/grammar/scale/point-indices-centers.json height=100 spechidden

#### Segment indices

When the index scale is used with segments, e.g., a `"rect"` mark that has both
the `x` and `x2` channels defined, the ranges must be [half
open](http://genome.ucsc.edu/blog/the-ucsc-genome-browser-coordinate-counting-systems/).
For example, if a segment should cover the indices 2, 3, and 4, a half-open
range would be defined as: x = 2 (inclusive), x2 = 5 (exclusive).

Thus, `scale.domain` uses inclusive bounds, whereas ranged mark encodings such
as `x`/`x2` use half-open interval edges directly.

EXAMPLE examples/docs/grammar/scale/range-indices.json height=100 spechidden

#### Adjusting the indexing of axis labels

The index scale expects zero-based indexing. However, it may be desirable to display
the axis labels using one-based indexing. Use the `numberingOffset` property adjust
the label indices.

EXAMPLE examples/docs/grammar/scale/numbering-offset.json height=100 spechidden

### Locus scale

The `"locus"` scale is similar to the `"index"` scale, but provides a
genome-aware axis with concatenated chromosomes. See
[genomic coordinates](../genomic-data/genomic-coordinates.md) for assembly and
coordinate-system details. Locus scales resolve their assembly from
`scale.assembly` or, if omitted, from the root `assembly`. If root `assembly`
is omitted and root `genomes` has exactly one entry, that entry is used as the
default assembly.

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

Two-point locus domains are inclusive and cover both endpoint positions.

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

EXAMPLE examples/docs/grammar/scale/locus-scale-domain.json height=80

## Domain from Selection Parameters

Scale domains can be linked to interval selection parameters:

Use an object-valued `domain`:

```json
{
  "scale": {
    "domain": {
      "param": "brush",
      "initial": [10, 20]
    }
  }
}
```

### Properties

SCHEMA SelectionDomainRef

Clearing the linked interval selection returns the scale to its normal default
or data-derived domain instead of restoring `initial`.

Zoomable linked scales use two-way syncing and do not allow `sync: "oneWay"`.
This affects `"index"` and `"locus"` scales as they are zoomable by default.

For detailed brushing-and-linking guidance and interactive examples, see
[Parameters: Interval selection](./parameters.md#interval-selection).

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

For `"index"` and `"locus"` scales, two-point zoom extents are inclusive.

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
[API](../api.md#named-scales).

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
    view using the `grid` property. Global defaults can be configured with
    [`config.axis*`](./config.md).

### Genome axis for loci

The genome axis is a special axis for the `"locus"` scale. It displays
chromosome names and the intra-chromosomal coordinates. You can adjust the style
of the chromosome axis and grid using various parameters.

EXAMPLE examples/docs/grammar/scale/genome-axis.json height=150

#### Fully customized axes

You can also disable the genome axis and grid and specify a custom axis instead.
The [`"axisGenome"`](data/lazy.md#axis-genome) data source provides the
chromosomes and their sizes, which can be used to create a custom axes or grids
for a view.

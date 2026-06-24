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

In composed views, shared scales can also be configured at the view level. See
[Shared scales in composed views](#shared-scales-in-composed-views).

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

#### Different assemblies

Different positional channels can use locus scales with different assemblies.
For example, a synteny view can use the `x` axis for human `hg38` coordinates
and the `y` axis for mouse `mm10` coordinates by setting `scale.assembly` on
each channel.

EXAMPLE examples/docs/grammar/mark/rule/synteny-hg38-mm10.json height=460

## Domain from Selection Parameters

Scale domains can be linked to interval selection parameters:

Use an object-valued `domain`:

```json
{
  "scale": {
    "zoom": true,
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

Zoomable linked scales automatically synchronize the domain back to the
selection. Non-zoomable linked scales only read the selection. This affects
`"index"` and `"locus"` scales as they are zoomable by default.

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

### Domain transitions

By default, domain updates are applied with a smooth transition when that is
possible. Set `domainTransition` to `false` to apply the new domain
immediately. ExprRef-driven domains default to `domainTransition: false`
unless overridden.

## Shared scales in composed views

The channel-level `scale` property follows the Vega-Lite style: scale settings
are placed inside an encoding channel. This works well for local scale settings
in simple unit views. However, in composed GenomeSpy views, especially
genome-browser-like multi-track views, a shared positional scale often represents
the viewport of the whole subtree. Placing that viewport domain in one child
encoding makes it harder to see which domain controls the composed view.

For example, the channel-level form places the domain inside a child encoding.
This is valid, but it makes a subtree-level setting look local to one
participant:

```json title="Channel-level scale configuration"
{
  "layer": [
    {
      "mark": "rect",
      "encoding": {
        "x": {
          "chrom": "chrom",
          "pos": "start",
          "type": "locus",
          "scale": {
            "domain": [
              { "chrom": "chr15", "pos": 92925000 },
              { "chrom": "chr15", "pos": 92949000 }
            ]
          }
        },
        "x2": {
          "chrom": "chrom",
          "pos": "end"
        }
      }
    },
    {
      "mark": "point",
      "encoding": {
        "x": {
          "chrom": "chrom",
          "pos": "pos",
          "type": "locus"
        }
      }
    }
  ]
}
```

Use view-level `scales` to configure the same shared scale at the subtree that
owns it:

```json title="View-level scale configuration"
{
  "scales": {
    "x": {
      "domain": [
        { "chrom": "chr15", "pos": 92925000 },
        { "chrom": "chr15", "pos": 92949000 }
      ]
    }
  },
  "layer": [
    {
      "mark": "rect",
      "encoding": {
        "x": {
          "chrom": "chrom",
          "pos": "start",
          "type": "locus"
        },
        "x2": {
          "chrom": "chrom",
          "pos": "end"
        }
      }
    },
    {
      "mark": "point",
      "encoding": {
        "x": {
          "chrom": "chrom",
          "pos": "pos",
          "type": "locus"
        }
      }
    }
  ]
}
```

Use [`resolve.scale`](./composition/index.md#scale-axis-and-legend-resolution) to
choose how scales are shared. A view-level `scales.<channel>` entry configures
the shared scale used by that view subtree. If the subtree has multiple
independent scales for the same channel, place `scales.<channel>` closer to the
intended subtree or make the sharing explicit with `resolve.scale`.

Do not mix view-level `scales.<channel>` with participating
`encoding.<channel>.scale` objects for the same shared scale. Keep
`encoding.<channel>.type` on member encodings; it describes the encoded data and
drives default scale type inference.

## Named scales

By giving the scale a name, it can be accessed through the
[API](../api/runtime-state.md#named-scales).

```json
{
  ...,
  "scale": {
    "name": "myScale"
  }
}
```

## Axes

Positional scales are usually annotated with axes. See [Axis](./axis.md) for
axis configuration, resolution, styling, inside placement, and genome axes for
locus scales.

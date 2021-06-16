# Scale

Scales are functions that transform abstract values (e.g., a type of a point
mutation) in the data to visual values (e.g., colors that indicate the type).

By default, GenomeSpy configures scales automatically, based on the data type
(e.g., `ordinal`), visual channel, and the data domain. The defaults may not
always be optimal, and you can configure them by yourself.

## Vega-Lite scales

GenomeSpy implements the majority of the [scale types of
Vega-Lite](https://vega.github.io/vega-lite/docs/scale.html). The aim is to
replicate their behavior identically (unless stated otherwise) in GenomeSpy.
Although that has not yet fully materialized, Vega-Lite's scale documentation
generally applies to GenomeSpy as well.

The supported scales are: `"linear"`, `"pow"`, `"sqrt"`, `"symlog"`, `"log"`,
`"ordinal"`, `"band"`, `"point"`, `"quantize"`, and `"threshold"`.

Currently, the following scales are **not** supported: `"time"`, `"utc"`,
`"quantile"`, `"bin-linear"`, `"bin-ordinal"`, and disabled scale.

!!! note "Relation to Vega scales"

    In fact, GenomeSpy uses [Vega
    scales](https://vega.github.io/vega/docs/scales/), which are based on
    [d3-scale](https://github.com/d3/d3-scale). However, GenomeSpy has GPU-based
    implementations for the actual scale transformations.

## GenomeSpy-specific scales

GenomeSpy provides two scales that are not available in Vega-Lite.

### Index scale

The `index` scale allows for mapping index-based values such as nucleotide or
amino-acid locations to positional visual channels. It has traits from both the
continuous `linear` and the discrete `band` scale. It is linear and zoomable but
maps indices to the range similarly to the band scale – each index has its own
band.

The `index` scale is used by default when the field type is `index`.

#### Point indices

When only the primary positional channel is defined, marks such as `rect` fill
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
          "field": "data",
          "type": "quantitative"
        }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

Marks such as `point` that do not support the secondary positional channel are centered.

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

TODO: Write something

TODO: Fix the bug: segment edges are placed at the center of the bands.

<div><genome-spy-doc-embed height="100" spechidden="true">

```json
{
  "data": {
    "values": [
      { "from": 0, "to": 2 },
      { "from": 2, "to": 7 },
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
          "expr": "'[' + datum.from + ', ' + datum.to + ')'",
          "type": "nominal"
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
the label indices. (TODO: Consider another name like "labelIndexBase")

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
          "field": "data",
          "type": "quantitative"
        }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

### Locus scale

The `locus` scale is similar to the `index` scale, but provides a genome-aware
axis with concatenated chromosomes. To use the locus scale, a
[genome](genomic-data/genomic-coordinates.md) must be specified.

The `locus` scale is used by default when the field type is `locus`.

!!! note

    The locus scale does not map the discrete chromosomes onto the concatenated
    axis. It's done by the
    [linearizeGenomicCoordinate](../grammar/transform/linearize-genomic-coordinate.md)
    transform.

#### Example

<div><genome-spy-doc-embed height="80">

```json
{
  "genome": { "name": "hg38" },
  "data": {
    "values": [
      { "chrom": "chr1", "pos": 234567890 },
      { "chrom": "chr4", "pos": 123456789 },
      { "chrom": "chr9", "pos": 34567890 }
    ]
  },
  "mark": "point",
  "encoding": {
    "x": { "chrom": "chrom", "pos": "pos", "type": "locus" },
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

Both `index` and `locus` scales are zoomable by default.

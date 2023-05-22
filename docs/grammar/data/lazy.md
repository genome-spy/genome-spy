# Lazy Data Sources

_Lazy_ data sources load data on-demand in response to user interactions. Unlike
[eager](eager.md) sources, most lazy data sources support indexing, which offers
the capability to retrieve and load data partially and incrementally, as users
navigate the genome. This is especially useful for very large datasets that are
infeasible to load in their entirety.

!!! note "How it works"

    Lazy data sources observe the scale domains of the view where the data
    source is specified. When the domain changes as a result of an user interaction,
    the data source invokes a request to fetch a new subset of the data. Lazy
    sources need the visual `channel` to be specified, which is used to determine the
    scale to observe. For genomic data sources, the channel defaults to `"x"`.

Lazy data sources are specified using the `lazy` property of the `data` object.
Unlike in eager data, the `type` of the data source must be specified explicitly:

```json title="Example: Specifiying a lazy data source"
{
  "data": {
    "lazy": {
      "type": "bigbed",
      "url": "http://hgdownload.soe.ucsc.edu/gbdb/hg38/encode3/ccre/encodeCcreCombined.bb"
    }
  },
  ...
}
```

## Indexed FASTA

The `"indexedFasta"` source enable fast random access to a reference sequence.
It loads the sequence as three consecutive chuncks that cover and flank the
currently visible region (domain), allowing the user to rapidly pan the view.
The chunks are provided as data objects with the following fields: `chrom`
(string), `start` (integer), and `sequence` (a string of bases).

### Parameters

SCHEMA IndexedFastaData

### Example

The example below shows how to specify a sequence track using an indexed FASTA
file. The sequence chunks are split into separate data objects using the
[`"flattenSequence"`](../transform/flatten-sequence.md) transform, and the final
position of each nucleotide is computed using the
[`"formula"`](../transform/formula.md) transform. Please note that new data are
fetched only when the user zooms into a region smaller than the window size
(default: 7000 bp).

<div><genome-spy-doc-embed height="60" spechidden="true">

```json
{
  "genome": { "name": "hg38" },

  "data": {
    "lazy": {
      "type": "indexedFasta",
      "url": "https://data.genomespy.app/genomes/hg38/hg38.fa"
    }
  },

  "transform": [
    {
      "type": "flattenSequence",
      "field": "sequence",
      "as": ["rawPos", "base"]
    },
    { "type": "formula", "expr": "datum.rawPos + datum.start", "as": "pos" }
  ],

  "encoding": {
    "x": {
      "chrom": "chrom",
      "pos": "pos",
      "type": "locus",
      "scale": {
        "domain": [
          { "chrom": "chr7", "pos": 20003500 },
          { "chrom": "chr7", "pos": 20003540 }
        ]
      }
    },
    "color": {
      "field": "base",
      "type": "nominal",
      "scale": {
        "domain": ["A", "C", "T", "G", "a", "c", "t", "g", "N"],
        "range": [
          "#7BD56C",
          "#FF9B9B",
          "#86BBF1",
          "#FFC56C",
          "#7BD56C",
          "#FF9B9B",
          "#86BBF1",
          "#FFC56C",
          "#E0E0E0"
        ]
      }
    }
  },
  "layer": [
    {
      "mark": "rect"
    },
    {
      "mark": {
        "type": "text",
        "size": 13,
        "fitToBand": true,
        "paddingX": 1.5,
        "paddingY": 1,
        "opacity": 0.7,
        "flushX": false,
        "tooltip": null
      },
      "encoding": {
        "color": { "value": "black" },
        "text": { "field": "base" }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

The data source is based on [GMOD](http://gmod.org/)'s
[indexedfasta-js](https://github.com/GMOD/indexedfasta-js) library.

## BigWig

The `"bigwig"` source enables the retrieval of dense, continuous data, such as
coverage or other signal data stored in BigWig files. It behaves similarly to
the indexed FASTA source, loading the data in chunks that cover and flank the
currently visible region. However, the window size automatically adapts to the
zoom level, and data are fetched in higher resolution when zooming in. The data
source provides data objects with the following fields: `chrom` (string),
`start` (integer), `end` (integer), and `score` (number).

### Parameters

SCHEMA BigWigData

### Example

The example below shows the GC content of the human genome in 5-base windows.
When you zoom in, the resolution of the data automatically increases.

<div><genome-spy-doc-embed height="120" spechidden="true">

```json
{
  "genome": { "name": "hg38" },
  "view": { "stroke": "lightgray" },

  "data": {
    "lazy": {
      "type": "bigwig",
      "url": "https://data.genomespy.app/genomes/hg38/hg38.gc5Base.bw"
    }
  },

  "encoding": {
    "y": {
      "field": "score",
      "type": "quantitative",
      "scale": { "domain": [0, 100] },
      "axis": { "title": "GC (%)", "grid": true, "gridDash": [2, 2] }
    },
    "x": { "chrom": "chrom", "pos": "start", "type": "locus" },
    "x2": { "chrom": "chrom", "pos": "end" }
  },

  "mark": "rect"
}
```

</genome-spy-doc-embed></div>

The data source is based on [GMOD](http://gmod.org/)'s
[bbi-js](https://github.com/GMOD/bbi-js) library.

## BigBed

The `"bigbed"` source enables the retrieval of segmented data, such as annotated
genomic regions stored in BigBed files.

### Parameters

SCHEMA BigBedData

### Example

The example below displays "ENCODE Candidate Cis-Regulatory Elements (cCREs) combined from all cell types" dataset for the hg38 genome.

<div><genome-spy-doc-embed height="70" spechidden="true">

```json
{
  "genome": { "name": "hg38" },
  "view": { "stroke": "lightgray" },

  "data": {
    "lazy": {
      "type": "bigbed",
      "url": "http://hgdownload.soe.ucsc.edu/gbdb/hg38/encode3/ccre/encodeCcreCombined.bb"
    }
  },

  "encoding": {
    "x": {
      "chrom": "chrom",
      "pos": "chromStart",
      "type": "locus",
      "scale": {
        "domain": [
          { "chrom": "chr7", "pos": 66600000 },
          { "chrom": "chr7", "pos": 66800000 }
        ]
      }
    },
    "x2": {
      "chrom": "chrom",
      "pos": "chromEnd"
    },
    "color": {
      "field": "ucscLabel",
      "type": "nominal",
      "scale": {
        "domain": ["prom", "enhP", "enhD", "K4m3", "CTCF"],
        "range": ["#FF0000", "#FFA700", "#FFCD00", "#FFAAAA", "#00B0F0"]
      }
    }
  },

  "mark": "rect"
}
```

</genome-spy-doc-embed></div>

The data source is based on [GMOD](http://gmod.org/)'s
[bbi-js](https://github.com/GMOD/bbi-js) library.

## BAM

The `"bam"` source is very much work in progress but has a low priority. It
currently exposes the reads but provides no handling for variants alleles,
CIGARs, etc. Please send a message to [GitHub
Discussions](https://github.com/genome-spy/genome-spy/discussions) if you are
interested in this feature.

### Parameters

SCHEMA BamData

### Example

<div><genome-spy-doc-embed height="350" spechidden="true">

```json
{
  "genome": { "name": "hg18" },

  "data": {
    "lazy": {
      "type": "bam",
      "url": "https://data.genomespy.app/sample-data/bamExample.bam",
      "windowSize": 30000
    }
  },

  "resolve": { "scale": { "x": "shared" } },

  "spacing": 5,

  "vconcat": [
    {
      "view": { "stroke": "lightgray" },
      "height": 40,

      "transform": [
        {
          "type": "coverage",
          "start": "start",
          "end": "end",
          "as": "coverage",
          "chrom": "chrom"
        }
      ],
      "mark": "rect",
      "encoding": {
        "x": {
          "chrom": "chrom",
          "pos": "start",
          "type": "locus",
          "axis": null
        },
        "x2": { "chrom": "chrom", "pos": "end" },
        "y": { "field": "coverage", "type": "quantitative" }
      }
    },
    {
      "view": { "stroke": "lightgray" },

      "transform": [
        {
          "type": "pileup",
          "start": "start",
          "end": "end",
          "as": "_lane"
        }
      ],

      "encoding": {
        "x": {
          "chrom": "chrom",
          "pos": "start",
          "type": "locus",
          "axis": {},
          "scale": {
            "domain": [
              { "chrom": "chr21", "pos": 33037317 },
              { "chrom": "chr21", "pos": 33039137 }
            ]
          }
        },
        "x2": {
          "chrom": "chrom",
          "pos": "end"
        },
        "y": {
          "field": "_lane",
          "type": "index",
          "scale": {
            "domain": [0, 60],
            "padding": 0.3,
            "reverse": true,
            "zoom": false
          }
        },
        "color": {
          "field": "strand",
          "type": "nominal",
          "scale": {
            "domain": ["+", "-"],
            "range": ["crimson", "orange"]
          }
        }
      },

      "mark": "rect"
    }
  ]
}
```

</genome-spy-doc-embed></div>

The data source is based on [GMOD](http://gmod.org/)'s
[bam-js](https://github.com/GMOD/bam-js) library.

## Axis ticks

The `"axisTicks"` data source generates a set of ticks for the specified channel.
While GenomeSpy internally uses this data source for generating axis ticks, you
also have the flexibility to employ it for creating fully customized axes
according to your requirements. The data source generates data objects with
`value` and `label` fields.

### Parameters

SCHEMA AxisTicksData

### Example

The example below generates approximately three ticks for the `x` axis.

<div><genome-spy-doc-embed height="80" spechidden="true">

```json
{
  "data": {
    "lazy": {
      "type": "axisTicks",
      "channel": "x",
      "axis": {
        "tickCount": 3
      }
    }
  },

  "mark": {
    "type": "text",
    "size": 20,
    "clip": false
  },

  "encoding": {
    "x": {
      "field": "value",
      "type": "quantitative",
      "scale": {
        "domain": [0, 10],
        "zoom": true
      }
    },
    "text": {
      "field": "label"
    }
  }
}
```

</genome-spy-doc-embed></div>

## Axis genome

The `axisGenome` data source, in fact, does not dynamically update data.
However, it provides a convenient access to the genome (chromosomes) of the
given channel, allowing creation of customized chromosome ticks or annotations.
The data source generates data objects with the following fields: `name`, `size`
(in bp), `continuousStart` (linearized coordinate), `continuousEnd`, `odd`
(boolean), and `number` (1-based index).

### Parameters

SCHEMA AxisGenomeData

### Example

<div><genome-spy-doc-embed height="150" spechidden="true">

```json
{
  "genome": { "name": "hg38" },

  "data": {
    "lazy": {
      "type": "axisGenome",
      "channel": "x"
    }
  },

  "encoding": {
    "x": {
      "field": "continuousStart",
      "type": "locus"
    },
    "x2": {
      "field": "continuousEnd"
    },
    "text": {
      "field": "name"
    }
  },

  "layer": [
    {
      "transform": [
        {
          "type": "filter",
          "expr": "datum.odd"
        }
      ],
      "mark": {
        "type": "rect",
        "fill": "#f0f0f0"
      }
    },
    {
      "mark": {
        "type": "text",
        "size": 16,
        "angle": -90,
        "align": "right",
        "baseline": "top",
        "paddingX": 3,
        "paddingY": 5,
        "y": 1
      }
    }
  ]
}
```

</div></genome-spy-doc-embed>

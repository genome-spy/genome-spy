# Dynamic Data Sources

_Dynamic data_ are loaded on-demand in response to user interactions. Unlike
non-indexed [static](static.md) data, dynamic data sources offer the capability
to retrieve and load data incrementally, as users navigate the genome. This is
especially useful for large datasets, such as whole-genome sequencing data.

!!! note "How it works"

    Dynamic data sources observe the scale domains of the view where the data
    source is specified. When the domain changes as a result of an user interaction,
    the data source invokes a request to fetch a new subset of the data. Dynamic
    sources need a visual channel to be specified, which is used to determine the
    scale to observe.

Dynamic data sources are specified using the `dynamic` property of the `data` object.
Unlike in static data, the `type` of the data source must be specified explicitly:

```json title="Example: Specifiying a dynamic data source"
{
  "data": {
    "dynamic": {
      "type": "bigbed",
      "url": "http://hgdownload.soe.ucsc.edu/gbdb/hg38/encode3/ccre/encodeCcreCombined.bb"
    }
  },
  ...
}
```

## Axis and genome ticks

## Indexed FASTA

Indexed FASTA files enable fast random access to a reference sequence. The
`"indexedFasta"` source loads the sequence as three consecutive chuncks that
cover and flank the currently visible region (domain), allowing the user to
rapidly pan the view. The chunks are provided as data objects with the following
fields: `chrom` (string), `start` (integer), and `sequence` (string). The
`sequence` field contains the sequence of the window as a string of nucleotides.

### Parameters

`url`
: Type: `string`

    The URL of the FASTA file.

`indexUrl`
: Type: `string`

    The index URL of the FASTA file.

    **Default value:** `url` + `".fai"`.

`indexUrl` (optional)
: Type: `string`

    The index URL of the FASTA file.

    **Default value:** `url` + `".fai"`.

`windowSize` (optional)
: Type: `number`

    Size of each chunk when fetching the fasta file. Data is only fetched
    when the length of the visible domain smaller than the window size.

    **Default value:** `7000`.

### Example

The example below shows how to specify a sequence track using an indexed FASTA
file. The sequence is split into separate data objects using the
[`"flattenSequence"`](../transform/flatten-sequence.md) transform, and the final
position of each nucleotide is computed using the
[`"formula"`](../transform/formula.md) transform.

<div><genome-spy-doc-embed height="60">

```json
{
  "genome": { "name": "hg38" },

  "data": {
    "dynamic": {
      "type": "indexedFasta",
      "url": "https://igv-genepattern-org.s3.amazonaws.com/genomes/seq/hg38/hg38.fa"
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
    "color": {
      "field": "base",
      "type": "nominal",
      "scale": {
        "type": "ordinal",
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
    },
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

BigWig files are used to store dense, continuous data, such as coverage or other
signal data. The `"bigwig"` source behaves similarly to the indexed FASTA
source, loading the data in chunks that cover and flank the currently visible
region. However, the window size automatically adapts to the zoom level, and
data are fetched in higher resolution when zooming in.

### Parameters

### Example

The example below shows the GC content of the human genome in 5-base windows.

<div><genome-spy-doc-embed height="120">

```json
{
  "genome": { "name": "hg38" },
  "view": { "stroke": "lightgray" },

  "data": {
    "dynamic": {
      "type": "bigwig",
      "url": "https://hgdownload.cse.ucsc.edu/goldenpath/hg38/bigZips/hg38.gc5Base.bw"
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

## BigBeg

### Parameters

### Example

The example below displays "ENCODE Candidate Cis-Regulatory Elements (cCREs) combined from all cell types" dataset for the hg38 genome.

<div><genome-spy-doc-embed height="70">

```json
{
  "genome": { "name": "hg38" },
  "view": { "stroke": "lightgray" },

  "data": {
    "dynamic": {
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

Work in progress.

The data source is based on [GMOD](http://gmod.org/)'s
[bam-js](https://github.com/GMOD/bam-js) library.

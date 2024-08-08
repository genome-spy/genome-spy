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
      "type": "bigwig",
      "url": "https://data.genomespy.app/genomes/hg38/hg38.gc5Base.bw"
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
      "url": "https://data.genomespy.app/sample-data/encodeCcreCombined.hg38.bb"
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

## GFF3

The tabix-based `"gff3"` source enables the retrieval of hierarchical data, such
as genomic annotations stored in GFF3 files. The object format GenomeSpy uses
is described in [gff-js](https://github.com/GMOD/gff-js#object-format)'s
documentation. The [flatten](../transform/flatten.md) and
[project](../transform/project.md) transforms are useful when extracting the
child features and attributes from the hierarchical data structure. See the
example below.

### Parameters

SCHEMA Gff3Data

### Example

The example below displays the human (GRCh38.p13)
[GENCODE](https://www.gencodegenes.org/) v43 annotation dataset. Please note
that the example shows a maximum of ten overlapping features per locus as
vertical scrolling is currently not supported properly.

<div><genome-spy-doc-embed height="360" spechidden="true">

```json
{
  "$schema": "https://unpkg.com/@genome-spy/core/dist/schema.json",

  "genome": { "name": "hg38" },

  "height": { "step": 28 },
  "viewportHeight": "container",

  "view": { "stroke": "lightgray" },

  "data": {
    "lazy": {
      "type": "gff3",
      "url": "https://data.genomespy.app/sample-data/gencode.v43.annotation.sorted.gff3.gz",
      "windowSize": 2000000,
      "debounceDomainChange": 300
    }
  },

  "transform": [
    {
      "type": "flatten"
    },
    {
      "type": "formula",
      "expr": "datum.attributes.gene_name",
      "as": "gene_name"
    },
    {
      "type": "flatten",
      "fields": ["child_features"]
    },
    {
      "type": "flatten",
      "fields": ["child_features"],
      "as": ["child_feature"]
    },
    {
      "type": "project",
      "fields": [
        "gene_name",
        "child_feature.type",
        "child_feature.strand",
        "child_feature.seq_id",
        "child_feature.start",
        "child_feature.end",
        "child_feature.attributes.gene_type",
        "child_feature.attributes.transcript_type",
        "child_feature.attributes.gene_id",
        "child_feature.attributes.transcript_id",
        "child_feature.attributes.transcript_name",
        "child_feature.attributes.tag",
        "source",
        "child_feature.child_features"
      ],
      "as": [
        "gene_name",
        "type",
        "strand",
        "seq_id",
        "start",
        "end",
        "gene_type",
        "transcript_type",
        "gene_id",
        "transcript_id",
        "transcript_name",
        "tag",
        "source",
        "_child_features"
      ]
    },
    {
      "type": "collect",
      "sort": {
        "field": ["seq_id", "start", "transcript_id"]
      }
    },
    {
      "type": "pileup",
      "start": "start",
      "end": "end",
      "as": "_lane"
    }
  ],

  "encoding": {
    "x": {
      "chrom": "seq_id",
      "pos": "start",
      "offset": 1,
      "type": "locus",
      "scale": {
        "domain": [
          { "chrom": "chr5", "pos": 177482500 },
          { "chrom": "chr5", "pos": 177518000 }
        ]
      }
    },
    "x2": {
      "chrom": "seq_id",
      "pos": "end"
    },
    "y": {
      "field": "_lane",
      "type": "index",
      "scale": {
        "zoom": false,
        "reverse": true,
        "domain": [0, 40],
        "padding": 0.5
      },
      "axis": null
    }
  },

  "layer": [
    {
      "name": "gencode-transcript",

      "layer": [
        {
          "name": "gencode-tooltip-trap",
          "title": "GENCODE transcript",
          "mark": {
            "type": "rule",
            "color": "#b0b0b0",
            "opacity": 0,
            "size": 7
          }
        },
        {
          "name": "gencode-transcript-body",
          "mark": {
            "type": "rule",
            "color": "#b0b0b0",
            "tooltip": null
          }
        }
      ]
    },
    {
      "name": "gencode-exons",

      "transform": [
        {
          "type": "flatten",
          "fields": ["_child_features"]
        },
        {
          "type": "flatten",
          "fields": ["_child_features"],
          "as": ["child_feature"]
        },
        {
          "type": "project",
          "fields": [
            "gene_name",
            "_lane",
            "child_feature.type",
            "child_feature.seq_id",
            "child_feature.start",
            "child_feature.end",
            "child_feature.attributes.exon_number",
            "child_feature.attributes.exon_id"
          ],
          "as": [
            "gene_name",
            "_lane",
            "type",
            "seq_id",
            "start",
            "end",
            "exon_number",
            "exon_id"
          ]
        }
      ],

      "layer": [
        {
          "title": "GENCODE exon",

          "transform": [{ "type": "filter", "expr": "datum.type == 'exon'" }],

          "mark": {
            "type": "rect",
            "minWidth": 0.5,
            "minOpacity": 0.5,
            "stroke": "#505050",
            "fill": "#fafafa",
            "strokeWidth": 1.0
          }
        },
        {
          "title": "GENCODE exon",

          "transform": [
            {
              "type": "filter",
              "expr": "datum.type != 'exon' && datum.type != 'start_codon' && datum.type != 'stop_codon'"
            }
          ],

          "mark": {
            "type": "rect",
            "minWidth": 0.5,
            "minOpacity": 0,
            "strokeWidth": 1.0,
            "strokeOpacity": 0.0,
            "stroke": "gray"
          },
          "encoding": {
            "fill": {
              "field": "type",
              "type": "nominal",
              "scale": {
                "domain": ["five_prime_UTR", "CDS", "three_prime_UTR"],
                "range": ["#83bcb6", "#ffbf79", "#d6a5c9"]
              }
            }
          }
        },
        {
          "transform": [
            {
              "type": "filter",
              "expr": "datum.type == 'three_prime_UTR' || datum.type == 'five_prime_UTR'"
            },
            {
              "type": "formula",
              "expr": "datum.type == 'three_prime_UTR' ? \"3'\" : \"5'\"",
              "as": "label"
            }
          ],

          "mark": {
            "type": "text",
            "color": "black",
            "size": 11,
            "opacity": 0.7,
            "paddingX": 2,
            "paddingY": 1.5,
            "tooltip": null
          },

          "encoding": {
            "text": {
              "field": "label"
            }
          }
        }
      ]
    },
    {
      "name": "gencode-transcript-labels",

      "transform": [
        {
          "type": "formula",
          "expr": "(datum.strand == '-' ? '< ' : '') + datum.transcript_name + ' - ' + datum.transcript_id + (datum.strand == '+' ? ' >' : '')",
          "as": "label"
        }
      ],

      "mark": {
        "type": "text",
        "size": 10,
        "yOffset": 12,
        "tooltip": null,
        "color": "#505050"
      },

      "encoding": {
        "text": {
          "field": "label"
        }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

The data source is based on [GMOD](http://gmod.org/)'s
[tabix-js](https://github.com/GMOD/tabix-js) and [gff-js](https://github.com/GMOD/gff-js) libraries.

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

## Axis measure

The `"axisMeasure"` data source generates coordinates for a "measure" 
for the specified channel, which can be used to create a visual clue ("measure") 
for the current zoom level.

This is particularly useful for genome axes, where the measure size, 
combined with the measure label (e.g. "10kb") gives a sense of the zoom level
for the current view, even when other features (e.g. genes, exons) are absent
and the axis ticks labels are long, multiple digits numbers.

The data source generates data objects with these fields:

 - `startPos`: start coordinate of the measure, useful for "rule" or "rect" marks,
 - `centerPos`: center coordinate of the measure, useful for "text" marks showing the measureLabel
 - `endPos`: end coordinate of the measure, useful for "rule" or "rect" marks,
 - `measureDomainSize`: size of the measure in domain units (e.g. linearized chromosomal coordinates),
 - `measurePixelsSize`: size of the measure in pixels, useful for sizing other elements when embedded
 - `measureLabel`: label for the measure, e.g. "10kb"

### Parameters

SCHEMA AxisMeasureData

### Example 1

The example below generates a discreet measure, centered on the `x` axis.

<div><genome-spy-doc-embed height="120" spechidden="true">

```json
{
  "genome": {
    "name": "hg38"
  },
  "vconcat": [
    {
      "height": 40,
      "data": {
        "values": [
          {
            "chrom": "chr3",
            "pos": 134567890
          },
          {
            "chrom": "chr4",
            "pos": 123456789
          },
          {
            "chrom": "chr9",
            "pos": 34567890
          }
        ]
      },
      "mark": "point",
      "encoding": {
        "x": {
          "chrom": "chrom",
          "pos": "pos",
          "type": "locus",
          "scale": {
            "name": "genomeScale",
            "domain": [
              {
                "chrom": "chr3"
              },
              {
                "chrom": "chr9"
              }
            ]
          }
        },
        "size": {
          "value": 200
        }
      }
    },
    {
      "name": "axis_measure",
      "height": 20,
      "data": {
        "lazy": {
          "type": "axisMeasure"
        }
      },
      "layer": [
        {
          "mark": {
            "type": "rule"
          },
          "encoding": {
            "x": {
              "field": "startPos",
              "type": "locus",
              "axis": null
            },
            "y": {
              "value": 0.2
            },
            "y2": {
              "value": 0.8
            }
          }
        },
        {
          "mark": {
            "type": "rule"
          },
          "encoding": {
            "x": {
              "field": "endPos",
              "type": "locus",
              "axis": null
            },
            "y": {
              "value": 0.2
            },
            "y2": {
              "value": 0.8
            }
          }
        },
        {
          "mark": {
            "type": "rule"
          },
          "encoding": {
            "x": {
              "field": "startPos",
              "type": "locus",
              "axis": null
            },
            "x2": {
              "field": "endPos",
              "type": "locus",
              "axis": null
            }
          }
        },
        {
          "mark": {
            "type": "text",
            "align": "center",
            "baseline": "bottom",
            "y": 0.5
          },
          "encoding": {
            "x" : { 
              "field": "centerPos",
              "type": "locus",
              "axis": null
            },
            "text": {
              "field": "measureLabel"
            }
          }
        }
      ]
    }
  ]
}
```

</genome-spy-doc-embed></div>

### Example 2

The example below generates a "bold" measure, aligned to the right edge of the `x` axis 
and with a custom set of measures (5b, 50b, 500b, 5kb, 50kb, etc.).

<div><genome-spy-doc-embed height="120" spechidden="true">

```json
{
  "genome": {
    "name": "hg38"
  },
  "vconcat": [
    {
      "height": 40,
      "data": {
        "values": [
          {
            "chrom": "chr3",
            "pos": 134567890
          },
          {
            "chrom": "chr4",
            "pos": 123456789
          },
          {
            "chrom": "chr9",
            "pos": 34567890
          }
        ]
      },
      "mark": "point",
      "encoding": {
        "x": {
          "chrom": "chrom",
          "pos": "pos",
          "type": "locus",
          "scale": {
            "name": "genomeScale",
            "domain": [
              {
                "chrom": "chr3"
              },
              {
                "chrom": "chr9"
              }
            ]
          }
        },
        "size": {
          "value": 200
        }
      }
    },
    {
      "name": "axis_measure",
      "height": 20,
      "data": {
        "lazy": {
          "type": "axisMeasure",
          "multiplierValue": 5,
          "hideMeasureThreshold": 10,
          "alignMeasure": "right"
        }
      },
      "layer": [
        {
          "mark": {
            "type": "rect",
            "fill": "salmon",
            "opacity": 0.75
          },
          "encoding": {
            "x": {
              "field": "startPos",
              "type": "locus",
              "axis": null
            },
            "x2": {
              "field": "endPos",
              "type": "locus",
              "axis": null
            },
            "y": {
              "value": 0.1
            },
            "y2": {
              "value": 0.9
            }
          }
        },
        {
          "mark": {
            "type": "text",
            "align": "center",
            "baseline": "bottom",
            "opacity": 0.75,
            "y": 0.2
          },
          "encoding": {
            "x" : { 
              "field": "centerPos",
              "type": "locus",
              "axis": null
            },
            "text": {
              "field": "measureLabel"
            }
          }
        }
      ]
    }
  ]
}
```

</genome-spy-doc-embed></div>

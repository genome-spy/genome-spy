---
title: Tracks
---

GenomeSpy resembles genome browsers such as IGV or JBrowse in the sense
that it has a horizontally scrollable viewport and vertically stacked tracks.

## Simple track

Type: `SimpleTrack`

Simple track allows for specifying a custom visualization by using the
[visualization grammar](grammar/grammar.md).

TODO: Trivial usage example

See: TODO: link to the grammar page

## Sample track

Type: `SampleTrack`

Sample track is an extension of the simple track and allows for creation of a
faceted view to the data. The view specification is repeated for subgroups of
the data, e.g. for multiple biological samples.

A group is assigned to a datum by specifying the `sample` channel in mark
encoding:

```javascript
"encoding": {
    ...,
    "sample": {
        "field": "sampleId",
        "type": "nominal"
    }
}
```

By default, the sample identifiers used for grouping are extracted from the data.

TODO: Live example

Additionally, Sample track allows for explicit specification of the samples
along with optional sample-specific attributes such as various clinical data.
The attributes are shown as color-coded columns in the left axis area. The
user can use these attributes to interactively filter and sort the samples.

TODO: Figure, display some example data

The sample-specific data must contain a `sample` column, which identifies the
sample. All other columns are regarded as attributes. By default, the
attribute data types are inferred from the data; numeric attributes are
interpreted as `quantitative` data, all others as `nominal`. To adjust the
data types and [scales](grammar/scale.md), the attributes can be specified
explicitly:

```javascript
{
    "type": "SampleTrack",
    "samples": {
        "data": { "url": "samples.tsv" },
        "attributes": {
            "RIN_Qual": {
                "type": "ordinal",
                "scale": {
                    "domain": [ "<5UQ", "5-7UQ", "5-7R", ">7R", ">7Q" ],
                    "scheme": "orangered"
                }
            },
            ...
        }
    },
    "encoding": { ... },
    ...
}
```

See [Scale](grammar/scale.md) documentation to further blablaa ...

TODO: Link to a full live example

TODO: A note about the difference to band scale

### Sorting samples

Samples can be interactively ordered by sample-specific attributes and the actual data.

#### By sample-specific attributes

You can sort the samples by clicking the labels of the attributes.

TODO: A link to a visualization

#### By the actual data

TODO:

* How to sort
  * Screenshot of the context-menu
* How to specify

### Filtering samples

SampleTrack also allows for interactive filtering of the samples.

TODO:

* Right-click to open a context-menu (screenshot)
* Retain
* Remove
* Retain first of each
* History / backtrack button

## Special tracks

### Genome axis track

Type: `AxisTrack`

Genome axis track displays the chromosome boundaries and intra-chromosomal
coordinates.

### Cytoband track

Type: `CytobandTrack`

Cytoband track displays the cytobands if genome configuration provides them.

### Gene annotations

Type: `GeneTrack`

TODO:

* Union isoforms and scores like in HiGlass
* Prioritized gene symbols
* Tooltip
  * Fetches RefSeq Gene summary
* Context-menu
* Creating the annotation data file
  * Follow https://docs.higlass.io/data_preparation.html#gene-annotation-tracks
  * Use `utils/compressGeneAnnotations.py`

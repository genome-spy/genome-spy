# Basic concepts

## Coordinate system

Just as genome browsers, GenomeSpy has a horizontally scrollable viewport.
The horizontal (x) axis is always quantitative and linear. In other words, it
is used for mapping numeric values to positions on the scrollable viewport.

### Real-valued coordinates


### Genomic coordinates

To support easy visualization of genomic data, GenomeSpy provides a genomic
coordinate system, which maps the discrete chromosomes or contigs onto the
linear axis.

To activate the genomic coordinate system, add `genome` property to the
root level configuration object:

```javascript
{
    "genome": {
        "name": "hg38"
    },
    "tracks": [ ... ]
}
```

Currently, GenomeSpy has built-in support for `hg19` and `hg38` assemblies.

TODO: How to specify custom genomes.

With Genomic coordinate system enabled, you can encode the genomic coordinates
conveniently:

```javascript
"encoding": {
    "x": {
        "chrom": "Chr",
        "pos": "Pos",
        "offset": -1.0,
        "type": "quantitative"
    },
    ...
}
```

The configuration above specifies that the chromosome and the
intra-chromosomal position is read from the `Chr` and `Pos` columns,
respectively. The `offset` property allows for aligning and adjusting for
different coordinate notations: zero or one based, closed or half-open.
The offset is added to the final coordinate.


## Tracks

GenomeSpy resembles genome browsers such as IGV or JBrowse in the sense
that it has a horizontally scrollable viewport and vertically stacked tracks.

### Simple track

Type: `SimpleTrack`

Simple track allows for specifying a custom visualization by using the
visualization grammar.

TODO: Trivial usage example

See: TODO: link to the grammar page

### Sample track

Type: `SampleTrack`

Sample track is an extension of the simple track and allows for creation of a
faceted view to the data. The view specification is repeated for subgroups of
the data, eg. multiple biological samples.

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

The sample-specific data must contain a `sample` column, which identifies the
sample. All other columns are regarded as attributes. By default, the
attribute data types are inferred from the data; numeric attributes are
interpreted as `quantitative` data, all others as `nominal`. To adjust the
data types and scales, the attributes can be specified explicitly:

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

See Scale (TODO: link) documentation to furher 

TODO: Full live example

TODO: A note about the difference to band scale

### Special tracks

#### Genome axis track

Type: `AxisTrack`

Genome axis track displays the chromosome boundaries and intra-chromosomal
coordinates.

#### Cytoband track

Type: `CytobandTrack`

Cytoband track displays the cytobands if genome configuration provides them.

#### Gene annotations

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
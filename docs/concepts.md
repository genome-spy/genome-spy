# Basic concepts

## Coordinate system

### Real-valued coordinates

### Genomic coordinates

## Tracks

GenomeSpy resembles genome browsers such as IGV or JBrowse in the sense
that it has a vertically scrollable viewport and vertically stacked tracks.

### Simple track

Type: `SimpleTrack`

Simple track allows for specifying a custom visualization by using the
visualization grammar.

TODO: Trivial usage example

See: TODO: link to the grammar page

### Sample track

Type: `SampleTrack`

Sample track is an extension of the simple track and allows for creation
of a faceted view to the data. The same view specification is repeated for
subgroups of the data, eg. multiple biological samples.

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

TODO:

* Samples and sample-specific attributes from a file
* User interface
    * Sorting
    * Filtering
* Note about the difference to band scale

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
* Context-menu
* Creating the annotation data file
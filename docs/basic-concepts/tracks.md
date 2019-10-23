# Tracks

GenomeSpy resembles genome browsers such as
[IGV](http://software.broadinstitute.org/software/igv/) or
[JBrowse](https://jbrowse.org) in the sense that it has a horizontally
scrollable viewport and vertically stacked tracks.

Tracks are the basic building block of GenomeSpy visualizations. They allows
for specifying custom visualizations by using the [visualization
grammar](../grammar/index.md). Tracks can be shared and
[imported](#importing-tracks) from external files.

All the tracks share their `x` channel, i.e. the horizontal scale and axis
(see [coordinate systems](./coordinate-system.md)).

To specify a view with one or multiple tracks, define a `tracks` array
in the root configuration object.

## Example

This example specifies a single track:

<div class="embed-example">
<div class="embed-container" style="height: 200px"></div>
<div class="embed-spec">

```json
{
    "tracks": [
        {
            "data": { "url": "../../data/examples/sincos.csv" },
            "mark": "point",
            "encoding": {
                "x": { "field": "x", "type": "quantitative" },
                "y": { "field": "sin", "type": "quantitative" }
            }
        }
    ]
}
```

</div>
</div>

Single tracks need not be explicitly wrapped in the `tracks` array as
GenomeSpy does it for you automatically. The example above can also be
specified more succinctly:

```json
{
    "data": { "url": "../../data/examples/sincos.csv" },
    "mark": "point",
    "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "sin", "type": "quantitative" }
    }
}
```

## Importing tracks

GenomeSpy facilitates reusing views by allowing tracks to be imported from
external specification files. The files can be placed flexibly – it may be
practical to split large specifications into multiple files and place them in
the same directory. On the other hand, if you have created, for example, an
annotation track that you would like the share with the research community,
you can upload the specification file and the associated data on a publicly
accessible web server.

### Named tracks

GenomeSpy provides a few built-in tracks, mainly to support genomic data
exploration. They must be imported by a name. Read more at [special genomic
tracks](#special-genomic-tracks).

Usage:

```json
{
    ...,
    "tracks": [
        ...,
        { "import": { "name": "cytobands" } }
    ]
}
```

### Importing from an URL

You can also import tracks from relative and absolute URLs. Relative URLs
are imported with respect to the current [baseUrl](TODO!).

The imported specification must contain a single or layered view – multiple
tracks in a single imported specification are not currently supported. The
baseUrl of the imported specification is updated to match its directory.
Thus, you can publish a track by placing its specification and data available
in the same directory on a web server.

Usage:

```json
{
    ...,
    "tracks": [
        ...,
        { "import": { "url": "includes/annotations.json" } },
        { "import": { "url": "https://genomespy.app/tracks/cosmic/census_hg38.json" } }
    ]
}
```


## Special genomic tracks

GenomeSpy provides three tracks, that are intended to be used with genomic
data. To add any of these tracks to your view specification, use the
[import](#importing-tracks) directive.

### Genome axis track

Name: `genomeAxis`

Genome axis track displays the chromosome boundaries, names, and
intra-chromosomal coordinates.

### Cytoband track

Name: `cytobands`

Cytoband track displays the cytobands if the [genome
configuration](coordinate-system.md#genomic-coordinates) provides them.

### Gene annotations

Name: `geneAnnotation`

Gene track displays RefSeq gene annotations. As it is impractical to show all
20 000 gene symbols at the same time, gene track uses score-based
prioritization to display only the most popular genes of the currently
visible region. For profound discussion on the popularity metric, read more
in "[The most popular genes in the human
genome](https://www.nature.com/articles/d41586-017-07291-9)" in Nature.

To save some precious screen estate, the isoforms of the genes in the
provided annotation are unioned. Thus, only one "super isoform" of each gene
is shown (there are a few exceptions, though).

Hovering the gene symbols with mouse fetches gene summary information from RefSeq
and displays it in a tooltip. Clicking the right mouse button on a gene symbol
opens a context-menu that provides shortcuts to certain databases for further
information about the gene.

!!! note "How the scoring is actually done"
    * Follow https://docs.higlass.io/data_preparation.html#gene-annotation-tracks
    * Use `utils/compressGeneAnnotations.py` to compress the data.
    * TODO: then what?

### Example

This example displays cytobands, gene annotations, and genomic coordinates
using the `hg38` genome assembly. It also import a COSMIC Cancer Gene Census
track from *genomespy.app* website.

<div class="embed-example">
    <div class="embed-container" style="height: 140px"></div>
    <div class="embed-spec">
```json
{
    "genome": { "name": "hg38" },
    "tracks": [
        { "import": { "name": "cytobands" } },
        { "import": { "name": "geneAnnotation" } },
        { "import": { "url": "https://genomespy.app/tracks/cosmic/census_hg38.json" } },
        { "import": { "name": "genomeAxis" } }
    ]
}
```
    </div>

</div>

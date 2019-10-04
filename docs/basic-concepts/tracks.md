---
title: Tracks
---

GenomeSpy resembles genome browsers such as IGV or JBrowse in the sense
that it has a horizontally scrollable viewport and vertically stacked tracks.
The different track types are documented below.

## Simple track

Type: `SimpleTrack`

Simple track allows for specifying custom visualizations by using the
[visualization grammar](../grammar/index.md).

<div class="embed-example" data-url="../../data/examples/first.json">
    <div class="embed-container"></div>
</div>

## Sample track

Type: `SampleTrack`

Sample track is an extension of the simple track and allows for creation of a
faceted view to the data. The view specification is repeated for subgroups of
the data, e.g. for multiple biological samples. This is also known as
small multiples, conditioning, or trellising.

To specify a field that indicates the subgroup, use the `sample` channel in
mark encoding:

```json
{
    ...,
    "encoding": {
        ...,
        "sample": {
            "field": "sampleId",
            "type": "nominal"
        }
    }
}
```

Sample track of GenomeSpy is analogous to the [Facet
operator](https://vega.github.io/vega-lite/docs/facet.html) of Vega-Lite.
However, Vega-Lite does not support multiple datasets inside the faceted
view. Sample track allows you to visualize multidimensional data, for
instance, copy numbers and point mutations of multiple samples at the same
time.

TODO: Explain how the `sample` channel is resolved.

<div class="embed-example" data-url="../../data/examples/sampletrack.json">
    <div class="embed-container"></div>
</div>

!!! warning "Y axis ticks"
    The Y axis ticks are not available on Sample tracks at the moment.
    Will be fixed at a later time.

!!! note "But we have Band scale?"
    Superficially similar results can be achieved by using Band scale
    on the `y` channel. However, you can not adjust the intra-band 
    y-position, as the `y` channel is already reserved for assigning
    a band for a datum. On the other hand, with Band scale, the
    graphical marks can span multiple bands. You could, for example,
    draw lines between the bands.



### Explicit sample identifiers

By default, the identifiers of the subgroups (samples) are extracted from the
data. However, you can also explicitly specify the sample ids along with
optional sample-specific attributes such as various clinical data. The
attributes are shown as color-coded columns in the left axis area. The user
can use these attributes to interactively filter and sort the samples.

The sample-specific data must contain a `sample` column, which identifies the
sample. All other columns are regarded as attributes. By default, the
attribute data types are inferred from the data; numeric attributes are
interpreted as `quantitative` data, all others as `nominal`. To adjust the
data types and [scales](grammar/scale.md), the attributes can be specified
explicitly:

```json
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

See [Scale](../grammar/scale.md) documentation to further blablaa ...

TODO: Link to a full live example

### Sorting samples

Samples can be interactively ordered by sample-specific attributes and the
actual data.

#### By sample-specific attributes

You can sort the samples by clicking the labels of the attributes.

TODO: A link to a visualization

#### By the actual data

TODO:

* How to sort
  * Screenshot of the context-menu
* How to specify

### Filtering samples

SampleTrack also allows for interactive filtering of the samples. Open a
context-menu by clicking on the attributes with the right mouse button:

![Sample context-menu](../img/sample-context-menu.png)

TODO:

* Explain the menu
* Provide an interactive example right here

### Fisheye tool

Sample track is designed to handle hundreds of samples. In order to see
phenomena that span multiple samples, the whole sample set is shown at the
same time. To focus on a few specific samples, you can activate the fisheye
tool by pressing and holding the `e` key on the keyboard. Shift + `e` leaves
the fisheye activated even after you release the key.

## Special genomic tracks

GenomeSpy provides three tracks, that are intended to be used with genomic data.

### Genome axis track

Type: `AxisTrack`

Genome axis track displays the chromosome boundaries and intra-chromosomal
coordinates.

### Cytoband track

Type: `CytobandTrack`

Cytoband track displays the cytobands if the genome configuration provides them.

### Gene annotations

Type: `GeneTrack`

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
and displays it in a tooltip. Pressing the right mouse button on a gene symbol
opens a context-menu that provides shortcuts to certain databases for further
information about the gene.

!!! note "How the scoring is actually done"
    * Follow https://docs.higlass.io/data_preparation.html#gene-annotation-tracks
    * Use `utils/compressGeneAnnotations.py` to compress the data.

### Example

This example displays cytobands, gene annotations, and genomic coordinates
using the `hg38` genome assembly.

<div class="embed-example">
    <div class="embed-container" style="height: 120px"></div>
    <div class="embed-spec">
```json
{
    "genome": { "name": "hg38" },
    "tracks": [
        { "type": "CytobandTrack" },
        { "type": "GeneTrack" },
        { "type": "AxisTrack" }
    ]
}
```
    </div>

</div>

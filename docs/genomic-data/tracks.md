# Provided Genome Tracks

!!! missing "Outdated information"

    This functionality is currently broken. The annotations must be imported
    from external view specifications.

GenomeSpy provides two tracks, that are intended to be used with genomic
data. To add any of these tracks to your view specification, use the
[import](../grammar/import.md) directive.

## Cytoband track

Name: `cytobands`

Cytoband track displays the cytobands if the [genome
configuration](genomic-coordinates.md) provides them.

## Gene annotations

Name: `geneAnnotation`

Gene track displays [RefSeq gene](https://www.ncbi.nlm.nih.gov/refseq/rsg/)
annotations. As it is impractical to show all 20 000 gene symbols at the same
time, gene track uses score-based prioritization to display only the most
popular genes of the currently visible region. For profound discussion on the
popularity metric, read more in "[The most popular genes in the human
genome](https://www.nature.com/articles/d41586-017-07291-9)" in Nature.

To save some precious screen estate, the isoforms of the genes in the
provided annotation are unioned. Thus, each gene is displayed as a single
"virtual isoform" (there are a few exceptions, though).

Hovering the gene symbols with the mouse pointer fetches gene summary
information from RefSeq and displays it in a tooltip.

!!! note "How the scoring is actually done"

    * Follow https://docs.higlass.io/data_preparation.html#gene-annotation-tracks
    * Use [`utils/compressGeneAnnotations.py`](https://github.com/tuner/genome-spy/blob/master/utils/compressGeneAnnotations.py)
      to compress the `geneAnnotations.bed` file.
    * Save the file as `refSeq_genes_scored_compressed.GENOME_NAME.txt` and
      place it in the [genome directory](genomic-coordinates.md#custom-genomes).

## Example

This example displays cytobands and gene annotations using the `hg38` genome
assembly. It also imports a COSMIC [Cancer Gene
Census](https://cancer.sanger.ac.uk/census) track from _genomespy.app_ website.

```json
{
  "genome": { "name": "hg38" },
  "vconcat": [
    { "import": { "name": "cytobands" } },
    { "import": { "name": "geneAnnotation" } },
    {
      "import": {
        "url": "https://genomespy.app/tracks/cosmic/census_hg38.json"
      }
    }
  ]
}
```

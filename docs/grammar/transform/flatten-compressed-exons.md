# Flatten Compressed Exons

The `"flattenCompressedExons"` transform flattens "delta encoded" exons. The
transform inputs the start coordinate of the gene body and a comma-delimited
string of alternating intron and exon lengths. A new data object is created for
each exon.

This transform is mainly intended to be used with an optimized [gene annotation
track](../../genomic-data/tracks.md#gene-annotations). Read more at an
observable
[notebook](https://observablehq.com/@tuner/annotation-tracks?collection=@tuner/genomespy).

## Parameters

SCHEMA FlattenCompressedExonsParams

## Example

TODO

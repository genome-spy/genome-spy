# Flatten Compressed Exons

The `"flattenCompressedExons"` transform flattens "delta encoded" exons. The
transform inputs the start coordinate of the gene body and a comma-delimited
string of alternating intron and exon lengths. A new data object is created for
each exon.

This transform is mainly intended to be used with an optimized gene annotation
track. Read more at [Annotation
Tracks](https://observablehq.com/@tuner/annotation-tracks?collection=@tuner/genomespy)
notebook.

## Parameters

SCHEMA FlattenCompressedExonsParams

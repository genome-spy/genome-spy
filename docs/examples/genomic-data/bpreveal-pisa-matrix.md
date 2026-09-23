---
title: PISA Interaction Matrix
---

# PISA Interaction Matrix

This interactive example shows base-to-base [PISA
effects](https://doi.org/10.1038/s41467-026-74807-1) around the _Drosophila_
_sog_ enhancer as a two-dimensional interaction matrix, following Figure 2d of
McAnany et al. Rows
are ATAC-seq output positions, columns are input bases, and cell color encodes
the signed effect. Accessibility and contribution-score margin tracks summarize
the corresponding output and input positions.

EXAMPLE examples/docs/examples/genomic-data/bpreveal-pisa-matrix.json height=500 spechidden

!!! disclaimer ""

    This example uses a Parquet extract of the dm6 *sog* locus from the
    [supporting data](https://doi.org/10.5281/zenodo.20318019) for McAnany et al.,
    [*Positional interpretation of cis-regulatory code and nucleosome
    organization with deep learning models*](https://doi.org/10.1038/s41467-026-74807-1),
    prepared with the [GenomeSpy recipe](https://github.com/genome-spy/genomespy-dataset-recipes/tree/main/recipes/bpreveal-pisa).
    The extract is distributed under
    [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html);
    the accessibility model's training data are GEO accession
    [GSE218852](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE218852).

## What to notice

Positive effects are red and negative effects are blue. Pink and green mark
values beyond the central diverging scale. The dashed diagonal identifies cells
where the input and output genomic coordinates are equal, and the pointer ruler
helps trace a row and column through the overview.

Pan and zoom in both dimensions. When cells become large enough to read, their
numeric values appear and the ruler fades away. The labels are produced only for
stable tiles intersecting the visible region, avoiding a text mark for every
cell while the matrix is zoomed out. Zoom in to reveal base-colored sequence
letters in the contribution track below the matrix.

For a link-based view of the strongest relationships, see the [PISA squid
plot](bpreveal-pisa-squid.md).

## GenomeSpy features

This example combines:

- Base-sized `rect` marks on shared two-dimensional [index
  scales](../../grammar/scale.md#index-scale).
- A two-dimensional [ruler parameter](../../grammar/parameters.md#ruler-parameters)
  whose opacity reacts to the zoom-dependent label state.
- Reactive parameters and transforms that materialize text labels by visible
  matrix tile only when the cells are readable.
- Synchronized accessibility and contribution-score margin tracks.
- A multiscale contribution track that changes from bars to a Dynseq logo.
- Eager [Parquet](../../grammar/data/eager.md#parquet) loading for the matrix,
  tracks, and motif intervals.

---
title: PISA Squid Plot
---

# PISA Squid Plot

This interactive example shows base-to-base [PISA
effects](https://doi.org/10.1038/s41467-026-74807-1) around the _Drosophila_
_sog_ enhancer, following Figure 2c of McAnany et al. Each diagonal link joins
an influential input base to an affected ATAC-seq output position. Link color
shows the sign of the effect, while opacity shows its magnitude. Accessibility,
contribution score, and motif tracks provide context on the same genomic scale.

EXAMPLE examples/docs/examples/genomic-data/bpreveal-pisa-squid.json height=440 spechidden

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

Positive effects are red and negative effects are blue. Stronger effects are
more opaque, making the most influential connections stand out without hiding
the surrounding effect structure. Motif intervals are overlaid near the bottom
of the link view.

Shift-drag on Accessibility to select output positions, or on Contribution
score to select input positions. Links matching both active brushes retain
their normal encoding and are drawn above muted links. An empty brush leaves
its endpoint unconstrained. Hovering also highlights a link, including one
outside the brushed regions; links matching neither the brushes nor hover are
muted. With no active brush or hover, all links look normal. Double-click a
track to clear its brush. Pan and zoom normally to inspect the locus at
different scales. Zoom in to reveal base-colored sequence letters in the
contribution track.

The full effect field can also be explored as a dense [PISA interaction
matrix](bpreveal-pisa-matrix.md).

## GenomeSpy features

This example combines:

- [`link`](../../grammar/mark/link.md) marks with a diagonal shape for
  input-to-output effects.
- Independent interval [selection parameters](../../grammar/parameters.md) on
  the Accessibility and Contribution score tracks, projected to opposite link
  endpoints.
- Conditional color, opacity, and draw order to emphasize selected links.
- [Index scales](../../grammar/scale.md#index-scale) for base-resolution tracks.
- A multiscale contribution track that changes from bars to a Dynseq logo.
- Eager [Parquet](../../grammar/data/eager.md#parquet) sources for compact,
  typed browser-side data loading.

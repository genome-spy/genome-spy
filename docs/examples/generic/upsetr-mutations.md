# Set Intersections with an UpSet Plot

An UpSet plot replaces a Venn diagram with aligned views: bars above the matrix
show the sizes of exact intersections, filled matrix cells identify the sets in
each intersection, and horizontal bars show the inclusive size of every set.
This example recreates the five-gene mutation example from
[UpSetR](https://github.com/hms-dbmi/UpSetR#examples) using a declarative
GenomeSpy specification.

EXAMPLE examples/docs/examples/generic/upsetr-mutations.json height=370 spechidden

!!! disclaimer ""

    The visualization loads UpSetR's bundled
    [`mutations.csv`](https://github.com/hms-dbmi/UpSetR/blob/master/inst/extdata/mutations.csv)
    directly from GitHub. UpSetR attributes the data to the TCGA Consortium and
    describes it as mutations in the 100 most frequently mutated genes in a
    glioblastoma multiforme cohort. This example displays PTEN, TP53, EGFR,
    PIK3R1, and RB1.

    The design follows Conway et al., [*UpSetR: an R package for the
    visualization of intersecting sets and their
    properties*](https://doi.org/10.1093/bioinformatics/btx364), and the
    original UpSet technique by Lex et al., [*UpSet: Visualization of
    Intersecting Sets*](https://doi.org/10.1109/TVCG.2014.2346248).

## What to notice

The columns are ordered by intersection size. The first column therefore shows
the most common exact mutation profile rather than the largest individual set.
A dark dot denotes membership in a gene set, and a vertical rule connects the
outermost memberships when a profile contains mutations in multiple genes.

Only observed profiles with at least one selected mutation are shown. Omitting
unobserved profiles keeps the matrix compact and avoids enumerating a power set
whose size grows exponentially with the number of sets.

## From mutation columns to intersection profiles

The source is a wide binary table with one row per patient. `regexFold`
normalizes the five selected gene columns into `(patient, gene, membership)`
rows. The [`setIntersection`](../../grammar/transform/set-intersection.md)
transform then groups patients by exact membership profile and emits one row
for every observed profile and gene. Its output includes the profile size,
degree, bit-string key, set index, and membership flag.

Ordinary downstream transforms keep presentation policy separate from the
intersection calculation. A window sum derives inclusive set sizes, and a
second window operation ranks exact profiles by frequency. The same flattened
table drives all three visible panels.

## Composition and alignment

The plot is a wrapped [`concat`](../../grammar/composition/concat.md) with two
columns. A zero-sized placeholder occupies the upper-left cell, placing the
intersection bars above the matrix and the set-size bars to its left.

The root shares x and y scales, which aligns matrix columns with intersection
bars and matrix rows with set-size bars. The intersection-size panel excludes
its quantitative y scale from the shared resolution, while the set-size panel
similarly excludes its quantitative x scale. This selective exclusion lets the
four children participate in only the scale resolutions that make semantic
sense.

## GenomeSpy features

- [`regexFold`](../../grammar/transform/regex-fold.md) selects and normalizes
  the five binary membership columns.
- [`setIntersection`](../../grammar/transform/set-intersection.md) computes
  observed exact profiles independently of their display order.
- [`window`](../../grammar/transform/window.md) derives inclusive set sizes and
  ranks profiles by frequency.
- Wrapped [`concat`](../../grammar/composition/concat.md) forms the two-by-two
  layout, while selective scale resolution aligns the related panels.
- Layered point, rule, rect, and text marks construct the traditional UpSet
  matrix and bar-chart appearance.

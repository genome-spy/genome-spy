# Set Intersections with an UpSet Plot

An UpSet plot replaces a Venn diagram with aligned views: bars above the matrix
show exact intersection sizes, filled matrix cells identify their sets, and
horizontal bars show inclusive set sizes. This example recreates
[UpSetR's](https://github.com/hms-dbmi/UpSetR#examples) five-gene mutation plot
as a declarative GenomeSpy specification and adds linked hover highlighting to
the otherwise static plot for exploring co-occurring mutations.

EXAMPLE examples/docs/examples/generic/upsetr-mutations.json height=370 spechidden

!!! disclaimer ""

    The design follows Conway et al., [*UpSetR: an R package for the
    visualization of intersecting sets and their
    properties*](https://doi.org/10.1093/bioinformatics/btx364), and the
    original UpSet technique by Lex et al., [*UpSet: Visualization of
    Intersecting Sets*](https://doi.org/10.1109/TVCG.2014.2346248).

    The example loads UpSetR's bundled
    [`mutations.csv`](https://github.com/hms-dbmi/UpSetR/blob/master/inst/extdata/mutations.csv),
    attributed to the TCGA Consortium, and displays PTEN, TP53, EGFR, PIK3R1,
    and RB1.

## Reading and exploring the plot

The columns are ordered by intersection size. The first column therefore shows
the most common exact mutation profile rather than the largest individual set.
A dark dot denotes membership in a gene set, and a vertical rule connects the
outermost memberships when a profile contains mutations in multiple genes.

Move the pointer over a set-size bar or matrix row to highlight every exact
profile containing that gene. A horizontal ruler identifies the hovered set.
Matching points, connecting rules, and intersection-size bars remain dark,
while competing profiles stay visible but muted. This makes co-occurring genes
and their intersection sizes easier to compare without losing context.

Only observed profiles with at least one selected mutation are shown. Omitting
unobserved profiles keeps the matrix compact.

## How it works

The source is a wide binary table with one row per patient.
[`regexFold`](../../grammar/transform/regex-fold.md) normalizes the five selected
gene columns into `(patient, gene, membership)` rows. The
[`setIntersection`](../../grammar/transform/set-intersection.md) transform
groups patients by exact membership profile.
[`window`](../../grammar/transform/window.md) transforms derive inclusive set
sizes and rank the profiles by frequency. The resulting table drives all three
visible panels.

The plot is a wrapped [`concat`](../../grammar/composition/concat.md) with two
columns. Shared scales align the matrix with both bar charts, while selective
scale exclusion keeps their quantitative axes independent. A shared ruler
parameter links hover input from the set-size bars and matrix to the reactive
highlighting.

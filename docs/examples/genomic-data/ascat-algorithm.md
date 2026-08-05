# Interactive ASCAT-like Purity/Ploidy Fitting

Because a bulk tumor sample contains both tumor and normal cells, its observed
LogR and B-allele frequency (BAF) depend on tumor _purity_ and _ploidy_. ASCAT
estimates these parameters using a grid search over candidate combinations,
favoring those that produce allele-specific copy-number estimates close to
nonnegative integers, as described in [Allele-specific copy number analysis of
tumors](https://doi.org/10.1073/pnas.1009843107).

This interactive GenomeSpy example lets you explore how different
purity/ploidy combinations affect the inferred allele-specific copy numbers
and their fit to the observed data.

The top "sunrise" plot shows integer-fit distance over a grid of tumor purity
(`rho`) and tumor ploidy (`psi`). Color shows the mean squared distance on a
logarithmic scale. Blue cells have lower distances, meaning that the included
allele-specific estimates are closer to integer copy numbers.

Click or drag anywhere on the sunrise plot to choose a fit. The readout below
the heatmap evaluates the exact chosen coordinates, and the other panels update
the allele-specific copy numbers and fitted LogR and BAF overlays. The green
cross marks the solution selected by the original ASCAT run for the sample; it
remains fixed when the experimental fitting options change.

The sample dropdown below the visualization switches between several simulated
tumors. Its selection reloads the segment and raw-probe data and recomputes the
sunrise plot and fitted tracks.

EXAMPLE examples/docs/examples/genomic-data/ASCAT-algorithm.json height=920 spechidden

!!! disclaimer ""

    The visualization uses simulated example data from
    [Allele-specific copy number analysis of tumors](https://doi.org/10.1073/pnas.1009843107)
    by Loo et al. and follows the ASCAT method described there. It is an
    explanatory ASCAT-like fit implemented as a GenomeSpy specification. The
    input has already been segmented using ASPCF; this visualization does not
    perform segmentation. The raw LogR and BAF probe values are shown only as
    a reference for the segmented and fitted values.

## What to notice

Look for multiple local minima in the sunrise plot. Different purity/ploidy
combinations can make the inferred copy numbers similarly close to integers, but
a low distance is not necessarily the correct biological solution. For example,
a solution may retain at least one minor-allele copy in every segment, implying
no complete loss of heterozygosity. Whether this is plausible depends on the
tumor. Many low-purity profiles also present a low-distance minima at 100%
purity.

As the ruler moves, the gray mismatch bands show where the inferred major- or
minor-allele copy numbers are farthest from integers. The colored fitted
overlays project the integer copy numbers back into LogR and BAF space. A
mismatch between these overlays and the black observed segment means shows
what the integer-fit distance does not capture.

## Fitting model

The original paper denotes the aberrant cell fraction by `rho` and tumor
ploidy by `psi_t`. It uses `psi = 2 * (1 - rho) + rho * psi_t` for the average
ploidy of the mixed sample. For compactness, the GenomeSpy specification calls
the tumor-ploidy parameter `psi`; thus, its `psi` corresponds to the paper's
`psi_t`.

The global `gamma` slider controls how strongly compressed LogR values are
expanded before copy numbers are calculated. Changing it recomputes the entire
sunrise plot and shows how this choice affects the purity/ploidy grid.

For every segment and candidate pair (`rho`, `psi`), the spec converts the
observed `logRMean` and `bafMean` into raw major- and minor-allele copy-number
estimates. These are Eqs. S7 and S8 in the
[ASCAT Supporting Information](https://www.pnas.org/lookup/suppl/doi:10.1073/pnas.1009843107/-/DCSupplemental/pnas.201009843SI.pdf),
which invert the LogR and BAF mixture model in Eqs. 1 and 2 of the paper:

- `aRaw = (rho - 1 + 2^(logRMean / gamma) * (1 - bafMean) * (2 * (1 - rho) + rho * psi)) / rho`
- `bRaw = (rho - 1 + 2^(logRMean / gamma) * bafMean * (2 * (1 - rho) + rho * psi)) / rho`

Each estimate is rounded to a nonnegative integer. The input BAF values are
mirrored into `[0, 0.5]`, which guarantees that `bRaw` is the minor-allele
estimate. Each segment is weighted by its number of germline-heterozygous
probes. When balanced-segment downweighting is enabled, segments with
`bafMean = 0.5` receive 5% of that weight, matching ASCAT R v3.2.0:

- `weight = nProbes * (bafMean == 0.5 ? 0.05 : 1)`
- `error = weight * (bRaw - max(round(bRaw), 0))^2`
- `meanRoundingError = sum(error) / sum(weight)`
- `score = 100 - 100 * meanRoundingError / 0.25`

The balanced-segment checkbox exposes this weighting choice interactively. It is
especially important for low-purity samples, where many BAF estimates are too
close to 0.5 to distinguish from balanced segments.

Higher scores indicate a better integer fit. The error has no upper limit, so
strongly negative raw copy-number estimates can produce scores below zero.

By default, the visualization follows ASCAT R v3.2.0 and scores only the
minor-allele estimate (`bRaw`). The "Include both alleles in fit" toggle adds
the major-allele error. With balanced-segment weighting enabled, this matches
paper Eq. 3 apart from a constant scaling that does not change the locations of
the minima.

The visualization does not select an optimum: `rho` and `psi` come directly from
the interactive ruler.

The colored overlays in the lower tracks show what the rounded copy-number
states would look like in LogR and BAF space. The rounding follows Eqs. S10 and
S11, while the fitted LogR and BAF values use Eqs. S12 and S13. `gamma` is
applied in both directions so that the calculations remain consistent.

## Sampled grid and exact selection

The sunrise heatmap samples `rho` from `0.10` to `1.05` in steps of `0.01` and
`psi` from `1.00` to `6.00` in steps of `0.05`, matching ASCAT R v3.2.0's
default calculated distance matrix. GenomeSpy builds the grid by combining
every purity/ploidy pair with every segment, calculating the errors, and
summarizing the result for each pair.

The ruler does not snap to the sampled grid. It can select fractional values
between cells, and the score and fitted tracks are calculated directly from
those exact values rather than from the nearest heatmap cell.

## GenomeSpy features

GenomeSpy calculates the analysis in the browser from a declarative
specification rather than loading a precomputed grid. The
[`cross`](../../grammar/transform/cross.md),
[`formula`](../../grammar/transform/formula.md), and
[`aggregate`](../../grammar/transform/aggregate.md) transforms combine every
candidate pair with the segments, evaluate the ASCAT-like equations, and
calculate the probe-weighted distances.

Global [parameters](../../grammar/parameters.md) control `gamma` and the fitting
options. Changing them recomputes the affected data. A two-dimensional
[ruler parameter](../../grammar/parameters.md#ruler-parameters) supplies `rho`
and `psi` to the linked views. It calculates the score and fitted profile at
exact values between sampled grid cells.
[`vconcat`](../../grammar/composition/concat.md) and
[`layer`](../../grammar/composition/layer.md) combine the grid, score,
copy-number, LogR, and BAF views, while the
[`locus` scale](../../grammar/scale.md#locus-scale) aligns the genomic tracks.
No application-specific JavaScript is needed.

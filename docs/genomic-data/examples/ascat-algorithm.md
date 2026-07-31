# Interactive ASCAT-like Purity/Ploidy Fitting

Because a bulk tumor sample contains both tumor and normal cells, its observed
LogR and B-allele frequency (BAF) depend on tumor _purity_ and _ploidy_. ASCAT
estimates these parameters using a grid search over candidate combinations,
favoring those that produce allele-specific copy-number estimates close to
nonnegative integers, as described in [Allele-specific copy number analysis of
tumors](https://doi.org/10.1073/pnas.1009843107).

This example implements that fitting principle in an interactive GenomeSpy
visualization, allowing the exploration of how different purity/ploidy
combinations affect the inferred allele-specific copy numbers and their fit to
the observed data.

The top "sunrise" plot samples integer-fit distance over tumor purity (`rho`)
and tumor ploidy (`psi`). Color encodes mean squared integer-fit distance on a
logarithmic scale; lower distances are blue, indicating that the inferred raw
minor-allele estimates are closer to integer copy numbers, providing a better
fit.

Click or drag anywhere on the sunrise plot to choose a fit. The readout below
the heatmap evaluates the exact chosen coordinates, and the other panels update
the allele-specific copy numbers and fitted LogR and BAF overlays.

The sample dropdown below the visualization switches between several simulated
tumors. Its selection reloads the segment and raw-probe data and recomputes the
sunrise plot and fitted tracks.

The complete analysis is expressed declaratively in GenomeSpy. The specification
constructs the purity/ploidy grid, evaluates the fitting equations over all
segments, aggregates the distance grid, and links the selected solution to the
genomic tracks. No application-specific JavaScript is needed: moving the ruler
or changing `gamma` reactively recomputes the affected dataflow.

EXAMPLE examples/docs/genomic-data/examples/ASCAT-algorithm.json height=870 spechidden

!!! disclaimer ""

    The visualization uses simulated example data from
    [Allele-specific copy number analysis of tumors](https://doi.org/10.1073/pnas.1009843107)
    by Loo et al. and follows the ASCAT method described there. It is an
    explanatory ASCAT-like fit implemented as a GenomeSpy specification.

## What to notice

Look for multiple local minima in the sunrise plot: distinct purity/ploidy
combinations can make the inferred copy numbers similarly close to integers. A
low integer-fit distance is not necessarily the correct biological solution.
For example, a solution may retain at least one minor-allele copy in every
segment, implying no complete loss of heterozygosity in the fitted profile;
whether this is plausible depends on the tumor. Low-purity profiles can also
produce attractive minima near 100% purity. As the ruler moves, the gray
mismatch bands show where the inferred major- or minor-allele copy numbers are
farthest from integers. The colored fitted overlays project the integer copy
numbers back into LogR and BAF space. Disagreement with the black observed
segment means reveals aspects that the minor-allele integer-fit distance alone
does not capture.

## Fitting model

The original paper denotes the aberrant cell fraction by `rho` and tumor
ploidy by `psi_t`. It uses `psi = 2 * (1 - rho) + rho * psi_t` for the average
ploidy of the mixed sample. For compactness, the GenomeSpy specification calls
the tumor-ploidy parameter `psi`; thus, its `psi` corresponds to the paper's
`psi_t`.

The global `gamma` slider controls the decompaction of observed LogR values.
Changing it recomputes the entire sunrise plot, revealing how this modeling
choice affects the purity/ploidy landscape.

For every segment and candidate pair (`rho`, `psi`), the spec converts the
observed `logRMean` and `bafMean` into raw major- and minor-allele copy-number
estimates. These are Eqs. S7 and S8 in the
[ASCAT Supporting Information](https://www.pnas.org/lookup/suppl/doi:10.1073/pnas.1009843107/-/DCSupplemental/pnas.201009843SI.pdf),
obtained by inverting the forward LogR and BAF mixture model in Eqs. 1 and 2
of the paper:

- `aRaw = (rho - 1 + 2^(logRMean / gamma) * (1 - bafMean) * (2 * (1 - rho) + rho * psi)) / rho`
- `bRaw = (rho - 1 + 2^(logRMean / gamma) * bafMean * (2 * (1 - rho) + rho * psi)) / rho`

Each estimate is rounded to a nonnegative integer. The input BAF values are
mirrored into `[0, 0.5]`, which guarantees that `bRaw` is the minor-allele
estimate. The score therefore uses only `bRaw`. Each joint constant run of
segmented LogR and BAF is weighted by its number of germline-heterozygous
probes. When balanced-run downweighting is enabled, runs with `bafMean = 0.5`
receive 5% of that weight, matching ASCAT R v3.2.0:

- `weight = nProbes * (bafMean == 0.5 ? 0.05 : 1)`
- `error = weight * (bRaw - max(round(bRaw), 0))^2`
- `meanRoundingError = sum(error) / sum(weight)`
- `score = 100 - 100 * meanRoundingError / 0.25`

The balanced-run checkbox exposes this weighting choice interactively. It is
especially consequential for low-purity samples, where many BAF estimates are
indistinguishable from 0.5.

Higher scores indicate a better integer fit. Because the error is uncapped,
strongly negative raw copy-number estimates can produce scores below zero.

The objective presented in paper Eq. 3 differs from both ASCAT R v3.2.0 and
this demo. It sums the squared rounding errors of both allele estimates over
germline-heterozygous probes, with weight `1` for allelically biased segments
and `0.05` for balanced segments. ASCAT R v3.2.0 retains those weights but
chooses either `nA` or `nB` for all segments according to which has the smaller
genome-wide sum, and scores only those segment estimates. Its goodness
rescaling and candidate selection contain additional implementation details.
This demo follows the minor-allele approach and uses the already mirrored
`bRaw` directly. Unlike ASCAT R v3.2.0, the demo does not choose an optimum:
`rho` and `psi` come directly from the interactive ruler.

The rounded copy numbers are also projected back into LogR and BAF space. The
colored fitted overlays in the lower tracks therefore show the observable
profile implied by the selected integer states. The rounding follows Eqs. S10
and S11, while the fitted LogR and BAF overlays use Eqs. S12 and S13.
`gamma` is applied in both directions so that they stay consistent.

## Sampled grid and exact selection

The sunrise heatmap samples `rho` from `0.10` to `1.05` in steps of `0.01` and
`psi` from `1.00` to `6.00` in steps of `0.05`, matching ASCAT R v3.2.0's
default calculated distance matrix. GenomeSpy builds the grid by crossing the
two candidate sequences and the finite segment table, calculating the segment
errors, and aggregating by candidate pair.

The ruler is independent of those samples. Its unsnapped quantitative
coordinates can contain fractional values between cells. The selected score
and all fitted tracks are recomputed directly from those exact values rather
than by looking up the nearest heatmap cell.

## GenomeSpy features

This example demonstrates how GenomeSpy can express an interactive analysis,
not just render its results:

- The declarative dataflow performs the analysis. The
  [`cross`](../../grammar/transform/cross.md),
  [`formula`](../../grammar/transform/formula.md), and
  [`aggregate`](../../grammar/transform/aggregate.md) transforms construct the
  candidate grid, evaluate the ASCAT-like equations, and calculate the
  probe-weighted distances.
- Parameters drive reactive computation. A global
  [parameter](../../grammar/parameters.md) exposes `gamma` and the
  balanced-run weighting, while a
  two-dimensional
  [ruler parameter](../../grammar/parameters.md#ruler-parameters) supplies
  `rho` and `psi` to the linked views.
- Selection remains continuous even though the heatmap is sampled. The ruler's
  unsnapped coordinates produce an exact score and fitted profile at any
  position within its domain.
- Parameter space and genome space are coordinated in one specification.
  [`vconcat`](../../grammar/composition/concat.md) and
  [`layer`](../../grammar/composition/layer.md) combine the sunrise, score,
  copy-number, LogR, and BAF views, while the
  [`locus` scale](../../grammar/scale.md#locus-scale) aligns the genomic tracks.

# ASCAT Algorithm in GenomeSpy

This page visualizes the core ASCAT fit for sample `S96` using the same
simulated example data as the companion [ASCAT Copy-Number
Segmentation](ascat.md) page and the method from [Allele-specific copy number
analysis of tumors](https://www.pnas.org/content/107/39/16910). It takes
ASCAT's segmented `logRMean` and `bafMean` values and applies the
purity/ploidy equations directly in the spec. The sliders expose the
aberrant cell fraction (`rho`) and average ploidy (`psi`), the top panel
shows a segment-length-weighted goodness-of-fit proxy, and the middle panel
compares the raw major/minor copy-number estimates with the rounded integers.
The lower panels show the LogR and B-allele frequency tracks that drive the
fit.

Because the input is already segmented, this example does not rerun ASCAT's
ASPCF preprocessing or search over candidate parameter grids. Instead, it
shows how the current `rho` and `psi` values propagate through the equations,
how close the raw estimates are to integer copy numbers, and how the fit score
changes when the parameters move.

EXAMPLE examples/docs/genomic-data/examples/ASCAT-algorithm.json height=600 spechidden

!!! disclaimer ""

    The visualization follows the ASCAT method described in
    [Allele-specific copy number analysis of tumors](https://www.pnas.org/content/107/39/16910)
    by Loo et al. It is a GenomeSpy visualization of the core purity/ploidy
    fit, shown here for the simulated `S96` example data.

## Equations

The spec implements the key ASCAT copy-number equations from the supplement.
The raw major and minor copy-number estimates are given by the supplementary
Eqs. S7 and S8, derived from `logRMean`, `bafMean`, `rho`, and `psi`:

- `aRaw = (rho - 1 + 2^logRMean * (1 - bafMean) * (2 * (1 - rho) + rho * psi)) / rho`
- `bRaw = (rho - 1 + 2^logRMean * bafMean * (2 * (1 - rho) + rho * psi)) / rho`

It then rounds those values to nonnegative integers with `round()` and
`max(0, ...)`, then uses the integer calls to predict the corresponding
`logRMean_ASCAT` and `bafMean_ASCAT` values. That forward calculation makes it
possible to compare the rounded copy-number state back to the observed segment
means and derive the goodness-of-fit proxy from the same distance-to-integer
idea as the paper's Eq. 3, but with segment-length weighting because the
example works on segmented input.

## GenomeSpy Features

This example combines several GenomeSpy capabilities in one spec:

- [Parameters](../../grammar/parameters.md) bind `rho` and `psi` to sliders,
  so the data update interactively.
- [`formula`](../../grammar/transform/formula.md) transforms implement the
  ASCAT equations for raw and rounded copy numbers, error terms, and the
  derived `logRMean` and `bafMean` values.
- [`aggregate`](../../grammar/transform/aggregate.md) computes the
  goodness-of-fit score from the segment-wise rounding error.
- [`vconcat`](../../grammar/composition/concat.md) stacks the summary,
  copy-number, LogR, and BAF views while sharing the same genomic x-axis.
- [`layer`](../../grammar/composition/layer.md) overlays the raw values,
  rounded values, and mismatch bands in the same panel.
- The [`locus` scale](../../grammar/scale.md#locus-scale) keeps the genomic
  coordinate system aligned across tracks.

## What to notice

The copy-number panel shows where the raw major and minor estimates land close
to integer values and where they do not. The gray mismatch bands become more
opaque as the rounding error increases. The fit summary above the panel is
weighted by segment length, so long segments contribute more in the display.
Adjusting `rho` and `psi` changes both the rounded copy numbers and the
goodness-of-fit score.

# ASCAT Copy-Number Segmentation

[Allele-specific copy number analysis of
tumors](https://www.pnas.org/content/107/39/16910) (ASCAT) is a widely used
method for analyzing copy number alterations in cancer genomes. This page
presents ASCAT's simulated example data for sample `S96` and reproduces ASCAT's
segmentation plots with GenomeSpy. The visualization adds zooming, panning, and
tooltips, which makes it easier to assess the segmentation or raw data and the
estimated copy-number changes. The same example is also available in the
Observable notebook [ASCAT Copy-Number
Segmentation](https://observablehq.com/@tuner/ascat-copy-number-segmentation?collection=@tuner/genomespy),
where it is structured a bit differently.

For the core purity/ploidy fit and rounding step, see the companion
[ASCAT Algorithm in GenomeSpy](ascat-algorithm.md) page.

EXAMPLE examples/docs/genomic-data/examples/ASCAT.json height=500 spechidden

!!! disclaimer ""

    The example shows simulated example data for sample `S96` from
    [Allele-specific copy number analysis of tumors](https://www.pnas.org/content/107/39/16910)
    by Loo et al.

## What to notice

The view is built as vertically concatenated tracks that share the same genomic
x-axis, so each locus stays aligned across all panels. The top track shows
allele-specific copy-number estimates, with the minor and major alleles offset
slightly to avoid overlap. The middle track overlays raw LogR probe values with
the segmented mean, and the bottom track does the same for B-allele frequency,
including the mirrored `1 - BAF` line.

## Data wrangling

Even though ASCAT computes start and end positions for the segments in the copy
number profiles, it does not provide them for the raw allele-specific copy
number segmentations. The preprocessing script below runs ASCAT, computes
segmented LogR and BAF means, and writes two TSV files for a single sample:
one for the segments and one for the raw LogR and BAF SNPs.

```R
library(ASCAT)
library(dplyr)
library(magrittr)
library(readr)
library(tibble)

# Choose a sample id.
sampleId <- 96

# Run ASCAT analysis.
ascat.bc = ascat.loadData("Tumor_LogR.txt", "Tumor_BAF.txt",
                          "Germline_LogR.txt", "Germline_BAF.txt")
ascat.bc = ascat.aspcf(ascat.bc)
ascat.output = ascat.runAscat(ascat.bc)

# Join SNP positions to LogR and BAF values.
segmentedSNPs <- as_tibble(ascat.bc$SNPpos, rownames = "SNP") %>%
  rename(chr = chrs) %>%
  left_join(tibble(SNP = rownames(ascat.bc$Tumor_LogR_segmented),
                   logR = ascat.bc$Tumor_LogR_segmented[, sampleId])) %>%
  left_join(tibble(SNP = rownames(ascat.bc$Tumor_BAF_segmented[[sampleId]]),
                   baf = ascat.bc$Tumor_BAF_segmented[[sampleId]])) %>%
  mutate(segmentId = 0)

# Pick the segments of the selected sample and enumerate them.
segments <- ascat.output$segments %>%
  filter(sample == paste0("S", sampleId)) %>%
  mutate(segmentId = row_number())

# Assign each SNP to a segment.
for (i in seq_len(nrow(segmentedSNPs))) {
  segmentedSNPs$segmentId[i] = min(which(
    segmentedSNPs$pos[i] >= segments$startpos &
    segmentedSNPs$pos[i] <= segments$endpos &
    segmentedSNPs$chr[i] == segments$chr
  ))
}

# Join the segments with the LogR and BAF values and write them to a file.
segments %>%
  left_join(segmentedSNPs %>%
              group_by(segmentId) %>%
              summarise(logRMean = mean(logR, na.rm = TRUE),
                        bafMean = mean(baf, na.rm = TRUE),
                        nProbes = n())) %>%
  select(-segmentId) %>%
  mutate_if(is.numeric, round, digits = 3) %>%
  write_tsv(paste0("ascat_segments_S", sampleId, ".tsv"), na = "")

# Write the raw data. Only include BAF for germline homozygous SNPs.
segmentedSNPs %>%
  mutate(segmentedBaf = baf) %>%
  select(-logR, -segmentId, -baf) %>%
  left_join(tibble(SNP = rownames(ascat.bc$Tumor_LogR),
                   logR = ascat.bc$Tumor_LogR[, sampleId])) %>%
  left_join(tibble(SNP = rownames(ascat.bc$Tumor_BAF),
                   baf = ascat.bc$Tumor_BAF[, sampleId])) %>%
  mutate(baf = ifelse(is.na(segmentedBaf), NA, baf)) %>%
  select(-segmentedBaf) %>%
  write_tsv(paste0("ascat_raw_S", sampleId, ".tsv"), na = "")
```

The first five rows from the produced files:

### `ascat_segments_S96.tsv`

| chr | startpos  | endpos    | nMajor | nMinor | logRMean | bafMean |
| --- | --------- | --------- | ------ | ------ | -------- | ------- |
| 1   | 1695590   | 116624361 | 2      | 0      | -0.133   | 0.218   |
| 1   | 116976886 | 120138178 | 2      | 2      | 0.18     | 0.5     |
| 1   | 143133910 | 147896005 | 4      | 1      | 0.373    | 0.301   |
| 1   | 147970991 | 244820741 | 3      | 1      | 0.219    | 0.325   |
| 2   | 385195    | 3254139   | 2      | 0      | -0.109   | 0.244   |

### `ascat_raw_S96.tsv`

| SNP  | chr | pos     | logR    | baf    |
| ---- | --- | ------- | ------- | ------ |
| SNP1 | 1   | 1695590 | -0.0589 | 0.2464 |
| SNP2 | 1   | 2189662 | 0.0293  | 0.2013 |
| SNP3 | 1   | 2393282 | -0.2291 |        |
| SNP4 | 1   | 2414781 | -0.2221 | 0.7504 |
| SNP5 | 1   | 2516275 | -0.0379 |        |

# Visualizing ASCAT profiles

This example visualizes an
[ASCAT](https://www.crick.ac.uk/research/labs/peter-van-loo/software)
profile and an allele-specific copy number segmentation along with the raw
LogR and BAF data.

<div class="embed-example hidden-spec">
<div class="embed-container" style="height: 500px"></div>
<div class="show-spec"><a href="#">Show specification</a></div>
<div class="embed-spec">

```json
{
  "genome": {
    "name": "hg19"
  },

  "baseUrl": "../../../data",

  "data": { "url": "ascat_segments_S96.tsv" },

  "encoding": {
    "x": { "chrom": "chr", "pos": "startpos", "type": "quantitative" },
    "x2": {
      "chrom": "chr",
      "pos": "endpos",
      "offset": 1,
      "type": "quantitative"
    }
  },

  "concat": [
    { "import": { "name": "cytobands" } },

    {
      "name": "copyNumberTrack",
      "plotBackground": "#f7f7f7",
      "layer": [
        {
          "name": "chromGrid",
          "mark": "rule",
          "data": { "name": "chromSizes" },
          "encoding": {
            "x": { "chrom": "name", "pos": "size", "type": "quantitative" },
            "color": { "value": "#d8d8d8" }
          }
        },
        {
          "title": "nMinor",
          "mark": {
            "type": "rule",
            "size": 5.0,
            "minLength": 2.0,
            "yOffset": 3.0
          },
          "encoding": {
            "y": {
              "field": "nMinor",
              "type": "quantitative",
              "scale": {
                "domain": [0, 6],
                "padding": 0.04,
                "clamp": true
              },
              "axis": {
                "tickMinStep": 1.0
              }
            },
            "color": { "value": "#88d27a" }
          }
        },
        {
          "title": "nMajor",
          "mark": {
            "type": "rule",
            "size": 5.0,
            "minLength": 2.0,
            "yOffset": -3.0
          },
          "encoding": {
            "y": {
              "field": "nMajor",
              "type": "quantitative",
              "scale": {
                "domain": [0, 6]
              }
            },
            "color": {
              "field": "nMajor",
              "type": "quantitative",
              "scale": {
                "domain": [0, 6, 16],
                "range": ["#f06850", "#f06850", "#5F0F0F"]
              }
            }
          }
        }
      ]
    },

    {
      "name": "logRTrack",
      "plotBackground": "#f7f7f7",
      "layer": [
        {
          "name": "chromGrid",
          "mark": "rule",
          "data": { "name": "chromSizes" },
          "encoding": {
            "x": { "chrom": "name", "pos": "size", "type": "quantitative" },
            "color": { "value": "#d8d8d8" }
          }
        },
        {
          "data": { "url": "ascat_raw_S96.tsv" },

          "title": "Single probe",

          "mark": {
            "type": "point",
            "geometricZoomBound": 5
          },

          "encoding": {
            "x": {
              "chrom": "chr",
              "pos": "pos",
              "offset": 0.5,
              "type": "quantitative"
            },
            "y": { "field": "logR", "type": "quantitative", "title": null },
            "color": { "value": "#7090c0" },
            "size": { "value": 150 },
            "opacity": { "value": 0.25 },
            "strokeWidth": { "value": 0 }
          }
        },
        {
          "title": "Mean LogR",
          "mark": {
            "type": "rule",
            "size": 3.0,
            "minLength": 3.0
          },
          "encoding": {
            "y": {
              "field": "logRMean",
              "type": "quantitative",
              "title": "LogR"
            },
            "color": { "value": "black" }
          }
        }
      ]
    },

    {
      "name": "bafTrack",
      "plotBackground": "#f7f7f7",

      "layer": [
        {
          "name": "chromGrid",
          "mark": "rule",
          "data": { "name": "chromSizes" },
          "encoding": {
            "x": { "chrom": "name", "pos": "size", "type": "quantitative" },
            "color": { "value": "#d8d8d8" }
          }
        },
        {
          "data": { "url": "ascat_raw_S96.tsv" },

          "transform": [{ "type": "filter", "expr": "datum.baf !== null" }],

          "title": "Single probe",

          "mark": {
            "type": "point",
            "geometricZoomBound": 5
          },

          "encoding": {
            "x": {
              "chrom": "chr",
              "pos": "pos",
              "offset": 0.5,
              "type": "quantitative"
            },
            "y": { "field": "baf", "type": "quantitative", "title": null },
            "color": { "value": "#7090c0" },
            "size": { "value": 150 },
            "opacity": { "value": 0.3 },
            "strokeWidth": { "value": 0 }
          }
        },
        {
          "title": "Mean BAF",
          "mark": {
            "type": "rule",
            "size": 3.0,
            "minLength": 3.0
          },
          "encoding": {
            "y": {
              "field": "bafMean",
              "type": "quantitative",
              "scale": { "domain": [0, 1] },
              "title": "B-allele frequency"
            },
            "color": { "value": "black" }
          }
        },
        {
          "title": "Mean BAF",
          "mark": {
            "type": "rule",
            "size": 3.0,
            "minLength": 3.0
          },
          "encoding": {
            "y": {
              "expr": "1 - datum.bafMean",
              "type": "quantitative",
              "title": null
            },
            "color": { "value": "black" }
          }
        }
      ]
    },

    { "import": { "name": "genomeAxis" } }
  ]
}
```

</div>
</div>

We use the simulated [example
dataset](https://www.crick.ac.uk/sites/default/files/2018-07/exampledata.zip)
from ASCAT's website in this example. Although the dataset uses only 10000
probes, the visualization has been used successfully with over 1.5M SNPs
extracted from WGS data.

TODO: Some explanation and feature highlights:

- View composition
- minLength for rules
- yOffset
- geometric zooming
- plotBackground

## Data wrangling

Even though ASCAT computes start and end positions for the segments in the
copy number profiles, it does not provide them for the raw allele-specific
copy number segmentations. The following R script runs ASCAT, computes
segmented LogR and BAF means, and writes the results for a single sample into
two files, one for the segments and another one for the raw LogR and BAF
SNPs.

```R
library(ASCAT)
library(dplyr)
library(magrittr)
library(readr)
library(tibble)

# Choose an arbitrary sample id
sampleId <- 96

# Run ASCAT analysis
ascat.bc = ascat.loadData("Tumor_LogR.txt", "Tumor_BAF.txt",
                          "Germline_LogR.txt", "Germline_BAF.txt")
ascat.bc = ascat.aspcf(ascat.bc)
ascat.output = ascat.runAscat(ascat.bc)

# Join SNP positions to LogR and BAF values
segmentedSNPs <- as_tibble(ascat.bc$SNPpos, rownames = "SNP") %>%
  rename(chr = chrs) %>%
  left_join(tibble(SNP = rownames(ascat.bc$Tumor_LogR_segmented),
                   logR = ascat.bc$Tumor_LogR_segmented[, sampleId])) %>%
  left_join(tibble(SNP = rownames(ascat.bc$Tumor_BAF_segmented[[sampleId]]),
                   baf = ascat.bc$Tumor_BAF_segmented[[sampleId]])) %>%
  mutate(segmentId = 0)

# Pick the segments of a specific sample and enumerate them
segments <- ascat.output$segments %>%
  filter(sample == paste0("S", sampleId)) %>%
  mutate(segmentId = row_number())

# Assign each SNP a segment
for (i in seq_len(nrow(segmentedSNPs))) {
  segmentedSNPs$segmentId[i] = min(which(
    segmentedSNPs$pos[i] >= segments$startpos &
    segmentedSNPs$pos[i] <= segments$endpos &
    segmentedSNPs$chr[i] == segments$chr
  ))
}

# Join the segments with the LogR and BAF values and write them to a file
segments %>%
  left_join(segmentedSNPs %>%
              group_by(segmentId) %>%
              summarise(logRMean = mean(logR, na.rm = TRUE),
                        bafMean = mean(baf, na.rm = TRUE),
                        nProbes = n())) %>%
  select(-segmentId) %>%
  mutate_if(is.numeric, round, digits = 3) %>%
  write_tsv(paste0("ascat_segments_S", sampleId, ".tsv"), na = "")

# Write the raw data. Only include BAF for SNPs that are germline homozygous
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

### ascat_segments_S96.tsv

| chr | startpos  | endpos    | nMajor | nMinor | logRMean | bafMean |
| --- | --------- | --------- | ------ | ------ | -------- | ------- |
| 1   | 1695590   | 116624361 | 2      | 0      | -0.133   | 0.218   |
| 1   | 116976886 | 120138178 | 2      | 2      | 0.18     | 0.5     |
| 1   | 143133910 | 147896005 | 4      | 1      | 0.373    | 0.301   |
| 1   | 147970991 | 244820741 | 3      | 1      | 0.219    | 0.325   |
| 2   | 385195    | 3254139   | 2      | 0      | -0.109   | 0.244   |

### ascat_raw_S96.tsv

| SNP  | chr | pos     | logR    | baf    |
| ---- | --- | ------- | ------- | ------ |
| SNP1 | 1   | 1695590 | -0.0589 | 0.2464 |
| SNP2 | 1   | 2189662 | 0.0293  | 0.2013 |
| SNP3 | 1   | 2393282 | -0.2291 |
| SNP4 | 1   | 2414781 | -0.2221 | 0.7504 |
| SNP5 | 1   | 2516275 | -0.0379 |

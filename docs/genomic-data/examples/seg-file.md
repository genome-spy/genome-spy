# Visualizing a SEG file

OUTDATED OUTDATED OUTDATED OUTDATED OUTDATED OUTDATED OUTDATED OUTDATED OUTDATED
OUTDATED OUTDATED OUTDATED OUTDATED OUTDATED

These examples visualize segmented data with two different visual encodings.

The example data consists of segmentations for two samples. Each segment has a
chromosome, intra-chromosomal start and end coordinates, and two quantitative
values:

| 'ID                  | chrom | loc.start | loc.end  | num.mark | seg.mean |
| -------------------- | ----- | --------- | -------- | -------- | -------- |
| GenomeWideSNP_416532 | 1     | 51598     | 76187    | 14       | -0.7116  |
| GenomeWideSNP_416532 | 1     | 76204     | 16022502 | 8510     | -0.029   |
| GenomeWideSNP_416532 | 1     | 16026084  | 16026512 | 6        | -2.0424  |
| GenomeWideSNP_416532 | 1     | 16026788  | 17063449 | 424      | -0.1024  |
| ...                  | ...   | ...       | ...      | ...      | ...      |

Data source: https://software.broadinstitute.org/software/igv/SEG

## A simple example

The following example uses a conventional heatmap
([`rect`](../../grammar/rect.md) mark) to display the segments. The color
scale has been configured to match the [Integrative Genomics
Viewer](http://software.broadinstitute.org/software/igv/home).

<div class="embed-example">
    <div class="embed-container" style="height: 100px"></div>
    <div class="embed-spec">

```json
{
  "genome": { "name": "hg18" },

  "concat": [
    { "import": { "name": "cytobands" } },

    {
      "data": {
        "url": "example.seg",
        "format": { "type": "tsv" }
      },

      "mark": "rect",

      "encoding": {
        "x": { "chrom": "chrom", "pos": "loc\\.start", "type": "quantitative" },
        "x2": { "chrom": "chrom", "pos": "loc\\.end" },
        "y": { "field": "\\'ID", "type": "nominal" },
        "color": {
          "field": "seg\\.mean",
          "type": "quantitative",
          "scale": {
            "domain": [-1.5, 1.5],
            "range": ["blue", "white", "red"]
          }
        }
      }
    },

    { "import": { "name": "genomeAxis" } }
  ]
}
```

  </div>
</div>

## An advanced example: emphasizing focal segments

The data contains focal segments that are short and barely visible. Although
zooming reveals them, finding them all requires a lot of effort. The
following example uses an alternative visual encoding for the data,
emphasizing the focal segments.

The quantitative value is encoded as position (height) instead of color.
Focal segments are extracted from the data using the
[`filter`](../../grammar/transform/filter.md) transform and displayed using
[`point`](../../grammar/mark/point.md) mark.

<div class="embed-example hidden-spec">
<div class="embed-container" style="height: 350px"></div>
<div class="show-spec"><a href="#">Show specification</a></div>
<div class="embed-spec">

```json
{
  "genome": {
    "name": "hg18"
  },

  "concat": [
    {
      "import": { "name": "cytobands" }
    },

    {
      "name": "layers",
      "data": {
        "url": "example.seg",
        "format": { "type": "tsv" }
      },
      "encoding": {
        "sample": { "field": "\\'ID", "type": "nominal" },
        "color": {
          "field": "seg\\.mean",
          "type": "quantitative",
          "scale": {
            "type": "threshold",
            "domain": [0],
            "range": ["#2277ff", "#dd4422"]
          }
        },
        "y": {
          "field": "seg\\.mean",
          "type": "quantitative"
        }
      },
      "layer": [
        {
          "mark": {
            "type": "rect",
            "minWidth": 1,
            "minOpacity": 0.2
          },
          "encoding": {
            "x": {
              "chrom": "chrom",
              "pos": "loc\\.start",
              "type": "quantitative"
            },
            "x2": { "chrom": "chrom", "pos": "loc\\.end" }
          }
        },
        {
          "transform": [
            {
              "type": "filter",
              "expr": "datum['loc.end'] - datum['loc.start'] < 8000"
            },
            {
              "type": "formula",
              "expr": "(datum['loc.start'] + datum['loc.end']) / 2",
              "as": "centre"
            }
          ],
          "mark": "point",
          "encoding": {
            "x": {
              "chrom": "chrom",
              "pos": "centre",
              "type": "quantitative"
            },
            "y": {
              "field": "seg\\.mean",
              "type": "quantitative"
            },
            "size": {
              "value": 40
            }
          }
        }
      ]
    },
    {
      "import": { "name": "genomeAxis" }
    }
  ]
}
```

</div>
</div>

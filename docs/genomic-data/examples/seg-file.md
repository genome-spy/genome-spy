# Visualizing a SEG file

TODO: Intro

TODO: About data, it's from https://software.broadinstitute.org/software/igv/SEG

## A simple example

TODO: Explanation

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

TODO: Explanation

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

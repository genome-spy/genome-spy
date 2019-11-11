# Layer

Layering allows for superimposing multiple plots on top of each other. By default,
the layers share their scales and axes, unioning the data domains.

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
  "description": "Lollipop plot example",
  "layer": [
    {
      "name": "Baseline",
      "data": { "values": [0] },
      "mark": "rule",
      "encoding": {
        "y": { "field": "data", "type": "quantitative", "axis": null },
        "color": { "value": "lightgray" }
      }
    },
    {
      "name": "Arrows",

      "data": {
        "sequence": {
          "start": 0,
          "stop": 6.284,
          "step": 0.39269908169,
          "as": "x"
        }
      },

      "transform": [
        { "type": "formula", "expr": "sin(datum.x)", "as": "sin(x)" }
      ],

      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": {
          "field": "sin(x)",
          "type": "quantitative",
          "scale": { "padding": 0.1 }
        },
        "color": { "field": "sin(x)", "type": "quantitative" }
      },

      "layer": [
        {
          "name": "Arrow shafts",

          "mark": {
            "type": "rule",
            "size": 3.0
          }
        },
        {
          "name": "Arrowheads",

          "mark": "point",

          "encoding": {
            "shape": {
              "field": "sin(x)",
              "type": "quantitative",
              "scale": {
                "type": "threshold",
                "domain": [-0.01, 0.01],
                "range": ["triangle-down", "diamond", "triangle-up"]
              }
            },
            "size": { "value": 500 },
            "strokeWidth": { "value": 0 }
          }
        }
      ]
    }
  ]
}
```

</div>
</div>

GenomeSpy replicates the [hierarchical
composition](https://vega.github.io/vega-lite/docs/composition.html) model of
Vega-Lite, although currently, `layer` and [faceting](facet.md) are the only
supported composition operators.

To specify multiple layers, use the `layer` property:

```json
{
  "layer": [
    ...  // Single or layered view specifications
  ]
}
```

The provided array may contain both single view specifications or layered
specifications. In the lollipop plot **example** above, the layered root view
contains the "Baseline" view and the layered "Arrows" view.

The encodings and data that are specified in a layer view propagate to its
descendants. For example, the "Arrow shafts" and "Arrowheads" views inherit
the _sin function_ dataset and the encodings for channels `x`, `y`, and
`color` from their parent, the "Arrows" view.

## Scale resolution

TODO: Some explanation, meanwhile: check
https://vega.github.io/vega-lite/docs/resolve.html

```json
{
  "resolve": {
    // Scale resolution
    "scale": {
      CHANNEL: ...
    }
  }
}
```

### Shared

The example below shows an excerpt of segmented copy number data along with
the raw SNP logR values. The domain of the `y` channel is unioned by default.

<div class="embed-example hidden-spec">
<div class="embed-container" style="height: 300px"></div>
<div class="show-spec"><a href="#">Show specification</a></div>
<div class="embed-spec">

```json
{
  "layer": [
    {
      "data": { "url": "../../data/cnv_chr19_raw.tsv" },
      "title": "Single probe",

      "mark": {
        "type": "point",
        "geometricZoomBound": 9.5
      },

      "encoding": {
        "x": { "field": "Position", "type": "quantitative" },
        "y": { "field": "logR", "type": "quantitative" },
        "color": { "value": "#404068" },
        "size": { "value": 225 },
        "opacity": { "value": 0.25 }
      }
    },
    {
      "data": {
        "url": "../../data/cnv_chr19_segs.tsv"
      },
      "title": "Segment mean",
      "mark": {
        "type": "rule",
        "size": 3.0,
        "minLength": 3.0
      },
      "encoding": {
        "x": { "field": "startpos", "type": "quantitative" },
        "x2": { "field": "endpos" },
        "y": { "field": "segMean", "type": "quantitative" },
        "color": { "value": "#ff4422" }
      }
    }
  ]
}
```

</div>
</div>

### Independent

By specifying that the scales of the `y` channel should remain `independent`,
both layers get their own scales and axes. Obviously, such a configuration makes
no sense with these data.

<div class="embed-example hidden-spec">
<div class="embed-container" style="height: 300px"></div>
<div class="show-spec"><a href="#">Show specification</a></div>
<div class="embed-spec">

```json
{
  "resolve": {
    "scale": {
      "y": "independent"
    }
  },
  "layer": [
    {
      "data": { "url": "../../data/cnv_chr19_raw.tsv" },
      "title": "Single probe",

      "mark": {
        "type": "point",
        "geometricZoomBound": 9.5
      },

      "encoding": {
        "x": { "field": "Position", "type": "quantitative" },
        "y": { "field": "logR", "type": "quantitative" },
        "color": { "value": "#404068" },
        "size": { "value": 225 },
        "opacity": { "value": 0.25 }
      }
    },
    {
      "data": { "url": "../../data/cnv_chr19_segs.tsv" },
      "title": "Segment mean",

      "mark": {
        "type": "rule",
        "size": 3.0,
        "minLength": 3.0
      },

      "encoding": {
        "x": { "field": "startpos", "type": "quantitative" },
        "x2": { "field": "endpos" },
        "y": { "field": "segMean", "type": "quantitative" },
        "color": { "value": "#ff4422" }
      }
    }
  ]
}
```

</div>
</div>

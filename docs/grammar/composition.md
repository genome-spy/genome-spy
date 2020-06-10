# Composing Visualizations

GenomeSpy replicates the [hierarchical
composition](https://vega.github.io/vega-lite/docs/composition.html) model of
Vega-Lite.

TODO: Explain how data and encoding descend in the hierarchy

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
  },
  ...
}
```

### Shared

The example below shows an excerpt of segmented copy number data
[layered](layer.md) with the raw SNP logR values. The domain of the `y`
channel is unioned by default.

<div class="embed-example hidden-spec">
<div class="embed-container" style="height: 300px"></div>
<div class="show-spec"><a href="#">Show specification</a></div>
<div class="embed-spec">

```json
{
  "layer": [
    {
      "data": { "url": "../data/cnv_chr19_raw.tsv" },
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
        "url": "../data/cnv_chr19_segs.tsv"
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
      "data": { "url": "../data/cnv_chr19_raw.tsv" },
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
      "data": { "url": "../data/cnv_chr19_segs.tsv" },
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

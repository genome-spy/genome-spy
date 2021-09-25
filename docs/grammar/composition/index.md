# View composition

GenomeSpy replicates the [hierarchical
composition](https://vega.github.io/vega-lite/docs/composition.html) model of
Vega-Lite. However, only the [concatenation](./concat.md) and
[`layer`](./layer.md) operators are currently supported. GenomeSpy also
provides a [sample faceting](../samples.md) operator that allows interactive
exploration and analysis of up to thousands of samples.

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

<div><genome-spy-doc-embed spechidden>

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
        "x": { "field": "Position", "type": "index" },
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
        "x": { "field": "startpos", "type": "index" },
        "x2": { "field": "endpos" },
        "y": { "field": "segMean", "type": "quantitative" },
        "color": { "value": "#ff4422" }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

### Independent

By specifying that the scales of the `y` channel should remain `independent`,
both layers get their own scales and axes. Obviously, such a configuration makes
no sense with these data.

<div><genome-spy-doc-embed spechidden>

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
        "x": { "field": "Position", "type": "index" },
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
        "x": { "field": "startpos", "type": "index" },
        "x2": { "field": "endpos" },
        "y": { "field": "segMean", "type": "quantitative" },
        "color": { "value": "#ff4422" }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

# View Composition

GenomeSpy replicates the [hierarchical
composition](https://vega.github.io/vega-lite/docs/composition.html) model of
Vega-Lite, and currently provides the [concatenation](./concat.md) and
[`layer`](./layer.md) composition operators in the _core_ library. In addition,
the GenomeSpy _app_ provides a facet operator for visualizing [sample
collections](../../sample-collections/visualizing.md) using a track-based
layout.

The hierarchical model allows for nesting composition operators. For instance,
you could have a visualization with two views side by side, and those views
could contain multiple layered views. The views in the hierarchy inherit
(transformed) `data` and `encoding` from their parents, and in some cases, the
views may also share [scales](../scale.md) and axes with their siblings and
parents. The data and encoding inherited from ancestors can always be overridden
by the descendants.

## Scale and axis resolution

Each visual channel of a view has a scale, which is either `"independent"` or `"shared"`
with other views. For example, sharing the scale on the positional `x` channel links
the zooming interactions of the participanting views through the shared scale domain.
The axes of positional channels can be configured similarly.

The `resolve` property configures the scale and axis resolutions for the view's
children.

```json title="An example of a resolution configuration"
{
  "resolve": {
    "scale": {
      "x": "shared",
      "y": "independent",
      "color": "independent"
    },
    "axis": {
      "x": "shared",
      "y": "independent"
    }
  },
  ...
}
```

### Shared

The example below shows an excerpt of segmented copy number data
[layered](layer.md) on raw SNP logR values. The scale of the `y` channel is
shared by default and the domain is unioned. As the `x` channel's scale is also
shared, the zooming interaction affects both views.

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
        "size": { "value": 225 },
        "opacity": { "value": 0.15 }
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
        "minLength": 3.0,
        "color": "black"
      },
      "encoding": {
        "x": { "field": "startpos", "type": "index" },
        "x2": { "field": "endpos" },
        "y": { "field": "segMean", "type": "quantitative" }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

### Independent

By specifying that the scales of the `y` channel should remain `"independent"`,
both layers get their own scales and axes. Obviously, such a configuration makes
no sense with these data.

<div><genome-spy-doc-embed spechidden>

```json
{
  "resolve": {
    "scale": { "y": "independent" },
    "axis": { "y": "independent" }
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
        "size": { "value": 225 },
        "opacity": { "value": 0.15 }
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
        "minLength": 3.0,
        "color": "black"
      },
      "encoding": {
        "x": { "field": "startpos", "type": "index" },
        "x2": { "field": "endpos" },
        "y": { "field": "segMean", "type": "quantitative" }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>

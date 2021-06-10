# Scale

Scales are functions that transform abstract values (e.g., a type of a point
mutation) in the data to visual values (e.g., colors that indicate the type).

By default, GenomeSpy configures scales automatically, based on the data type
(e.g., `ordinal`), visual channel, and the data domain. The defaults may not
always be optimal, and you can configure them by yourself.

## Vega-Lite scales

GenomeSpy implements the majority of the [scale types of
Vega-Lite](https://vega.github.io/vega-lite/docs/scale.html). The aim is to
replicate their behavior identically (unless stated otherwise) in GenomeSpy.
Although that has not yet fully materialized, Vega-Lite's scale documentation
generally applies to GenomeSpy as well.

Currently, `time`, `utc`, `quantile`, `bin-linear`, `bin-ordinal`, and disabled
scales are **not** supported.

!!! note "Relation to Vega scales"

    In fact, GenomeSpy uses [Vega
    scales](https://vega.github.io/vega/docs/scales/), which are based on
    [d3-scale](https://github.com/d3/d3-scale). However, GenomeSpy has GPU-based
    implementations for the actual scale transformations.

## GenomeSpy-specific scales

GenomeSpy provides two scales that are not available in Vega-Lite.

### Index scale

The `index` scale allows for mapping index-based values such as nucleotide or
amino-acid locations to positional visual channels. It has traits from both the
continuous `linear` and the discrete `band` scale. It is linear and zoomable but
maps indices to the range similarly to the band scale – each index has its own
band.

#### Point indices

When only the primary positional channel is defined, marks such as `rect` fill
the whole band.

<div class="embed-example hidden-spec">
<div class="embed-container" style="height: 100px"></div>
<div class="show-spec"><a href="#">Show specification</a></div>
<div class="embed-spec">

```json
{
  "data": {
    "values": [0, 2, 4, 7, 8, 10, 12]
  },
  "encoding": {
    "x": { "field": "data", "type": "index" }
  },
  "layer": [
    {
      "mark": "rect",
      "encoding": {
        "color": { "field": "data", "type": "nominal" }
      }
    },
    {
      "mark": "text",
      "encoding": {
        "text": {
          "field": "data",
          "type": "quantitative"
        }
      }
    }
  ]
}
```

</div>
</div>

Marks such as `point` that do not support the secondary positional channel are centered.

<div class="embed-example hidden-spec">
<div class="embed-container" style="height: 100px"></div>
<div class="show-spec"><a href="#">Show specification</a></div>
<div class="embed-spec">

```json
{
  "data": {
    "values": [0, 2, 4, 7, 8, 10, 12]
  },
  "mark": "point",
  "encoding": {
    "x": { "field": "data", "type": "index" },
    "color": { "field": "data", "type": "nominal" },
    "size": { "value": 300 }
  }
}
```

</div>
</div>

#### Range indices

TODO: Write something

TODO: Fix the bug

<div class="embed-example hidden-spec">
<div class="embed-container" style="height: 100px"></div>
<div class="show-spec"><a href="#">Show specification</a></div>
<div class="embed-spec">

```json
{
  "data": {
    "values": [
      { "from": 0, "to": 2 },
      { "from": 2, "to": 7 },
      { "from": 8, "to": 9 },
      { "from": 10, "to": 13 }
    ]
  },
  "encoding": {
    "x": { "field": "from", "type": "index" },
    "x2": { "field": "to" }
  },
  "layer": [
    {
      "mark": "rect",
      "encoding": {
        "color": { "field": "from", "type": "nominal" }
      }
    },
    {
      "mark": "text",
      "encoding": {
        "text": {
          "expr": "'[' + datum.from + ', ' + datum.to + ')'",
          "type": "nominal"
        }
      }
    }
  ]
}
```

</div>
</div>

#### Adjusting the indexing of axis labels

The index scale expects zero-based indexing. However, it may be desirable to display
the axis labels using one-based indexing. Use the `numberingOffset` property adjust
the label indices. (TODO: Consider another name like "labelIndexBase")

<div class="embed-example hidden-spec">
<div class="embed-container" style="height: 100px"></div>
<div class="show-spec"><a href="#">Show specification</a></div>
<div class="embed-spec">

```json
{
  "data": {
    "values": [0, 2, 4, 7, 8, 10, 12]
  },
  "encoding": {
    "x": {
      "field": "data",
      "type": "index",
      "scale": {
        "numberingOffset": 1
      }
    }
  },
  "layer": [
    {
      "mark": "rect",
      "encoding": {
        "color": { "field": "data", "type": "nominal" }
      }
    },
    {
      "mark": "text",
      "encoding": {
        "text": {
          "field": "data",
          "type": "quantitative"
        }
      }
    }
  ]
}
```

</div>
</div>

### Locus scale

Locus scale extends the index scale with chromosomes. Blablaa.

## Zooming and panning

To enable zooming and panning of continuous scales on positional channels, set
the `zoom` scale property to `true`. Example:

```json
{
  "x": {
    "field": "foo",
    "type": "quantitative",
    "scale": {
      "zoom": true
    }
  }
}
```

`index` and `locus` scales are zoomable by default.

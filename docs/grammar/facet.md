# Faceting Multiple Samples

Faceting repeats the view specification for subgroups of the data, e.g., for
multiple biological samples. This is also known as small multiples,
conditioning, or trellising.

GenomeSpy displays each subgroup as a subtrack. To create a faceted
visualization, use the `sample` channel in mark encoding to specify the field
denoting the subgroup:

```json
{
  ...,
  "encoding": {
    ...,
    "sample": {
      "field": "sampleId",
      "type": "nominal"
    }
  }
}
```

!!! note "Subtle differences"

    The `sample` channel of GenomeSpy is analogous to the [row
    channel](https://vega.github.io/vega-lite/docs/facet.html) of Vega-Lite –
    each subset is displayed as a row. However, in GenomeSpy, a special
    type of track gathers the sample identifiers from the view hierarchy
    and creates an own virtual subtrack for each sample. The behavior is more flexible
    since it allows for creating multiple layers, each with a different
    dataset. Thus, a faceted view can display multidimensional data,
    for instance, copy numbers and point mutations of multiple samples at the
    same time.

The example below displays a faceted visualization. The subgroups, A, B, and C,
are displayed as subtracks.

<div class="embed-example hidden-spec">
<div class="embed-container" style="height: 250px; margin-top: 0"></div>
<div class="show-spec"><a href="#">Show specification</a></div>
<div class="embed-spec">

```json
{
  "data": {
    "values": [
      { "sample": "A", "x": 1 },
      { "sample": "A", "x": 2 },
      { "sample": "A", "x": 5 },
      { "sample": "A", "x": 3 },
      { "sample": "B", "x": 8 },
      { "sample": "B", "x": 6 },
      { "sample": "B", "x": 9 },
      { "sample": "B", "x": 3 },
      { "sample": "C", "x": 9 },
      { "sample": "C", "x": 2 },
      { "sample": "C", "x": 3 },
      { "sample": "C", "x": 5 }
    ]
  },

  "transform": [
    {
      "type": "stack",
      "field": "x",
      "groupby": ["sample"],
      "offset": "normalize",
      "as": ["from", "to"]
    }
  ],

  "mark": "rect",

  "encoding": {
    "sample": { "field": "sample", "type": "nominal" },
    "y": { "value": 0 },
    "y2": { "value": 1 },
    "x": { "field": "from", "type": "quantitative" },
    "x2": { "field": "to" },
    "color": { "field": "x", "type": "nominal" }
  }
}
```

</div>
</div>

!!! warning "Y axis ticks"

    The Y axis ticks are not available on Sample tracks at the moment.
    Will be fixed at a later time.

!!! note "But we have Band scale?"

    Superficially similar results can be achieved by using [Band scale](encoding/scale.md)
    on the `y` channel. However, you can not adjust the intra-band
    y-position, as the `y` channel is already reserved for assigning
    a band for a datum. On the other hand, with Band scale, the
    graphical marks can span multiple bands. You could, for example,
    draw lines between the bands.

## Explicit sample identifiers and attributes

By default, the identifiers of the samples (subgroups) are extracted from the
data. However, you can also explicitly specify the sample ids along with
optional sample-specific attributes such as various clinical data. The
attributes are shown as color-coded columns in the left axis area. The user
can use these attributes to interactively [filter](#filtering-samples) and
[sort](#sorting-samples) the samples.

The associated data must contain a `sample` column, which identifies the
sample. All other columns are regarded as attributes. By default, the
attribute data types are inferred from the data; numeric attributes are
interpreted as `quantitative` data, all others as `nominal`. To adjust the
data types and [scales](encoding/scale.md), the attributes can be specified
explicitly:

```json
{
  "samples": {
    "data": { "url": "samples.tsv" },
    "attributes": {
      "RIN_Qual": {
        "type": "ordinal",
        "scale": {
          "domain": [ "<5UQ", "5-7UQ", "5-7R", ">7R", ">7Q" ],
          "scheme": "orangered"
        }
      },
      ...
    }
  },
  "encoding": {
    "sample": { "field": "sampleId", "type": "nominal" }
    ...
  },
  ...
}
```

See [Scale](encoding/scale.md) documentation to further blablaa ...

TODO: Link to a full live example

## Sorting samples

Samples can be interactively sorted by sample-specific attributes and the
actual data.

### By sample-specific attributes

You can sort the samples by clicking the labels of the attributes.

TODO: A link to a visualization

### By the actual data

TODO:

- How to sort
  - Screenshot of the context-menu
- How to specify

## Filtering samples

SampleTrack also allows for interactive filtering of the samples. To filter,
open a context-menu by clicking on the attributes with the right mouse
button:

![Sample context-menu](../img/sample-context-menu.png)

Retain first sample of each
: Your data may have, for example, multiple samples from each patient.
However, you might want to study only the "best" or "worst" samples
from each patient and compare them with each other. This action
groups the samples by the chosen attribute and drops all but the topmost
sample of each group. Thus, you can first sort the samples by an attribute
that ranks them and then retain only the top ranked
samples.

Retain
: TODO

Remove
: TODO

GenomeSpy maintains a history of the visible samples and their orders. To
return to the previous state, click the backtrack (TODO: picture) button or
press the backspace key on the keyboard.

TODO: Provide an interactive example right here

## Zooming with Fisheye

GenomeSpy is designed to handle hundreds of concurrently visible samples. In
order to see phenomena that span multiple samples, the whole sample set is
shown at the same time. To focus on a few specific samples, you can activate
the fisheye tool by pressing and holding the `e` key on the keyboard. Shift +
`e` leaves the fisheye activated even after you release the key. You can try
it in the example below:

<div class="embed-example hidden-spec">
<div class="embed-container" style="height: 300px"></div>
<div class="show-spec"><a href="#">Show specification</a></div>
<div class="embed-spec">

```json
{
  "data": {
    "sequence": {
      "start": 0,
      "stop": 1000
    }
  },

  "transform": [
    {
      "type": "formula",
      "expr": "'sample-' + floor(random() * 100)",
      "as": "sample"
    },
    {
      "type": "formula",
      "expr": "floor(random() * 20)",
      "as": "x"
    },
    {
      "type": "stack",
      "field": "x",
      "groupby": ["sample"],
      "offset": "normalize",
      "sort": { "field": "x" }
    }
  ],

  "mark": "rect",

  "encoding": {
    "sample": { "field": "sample", "type": "nominal" },
    "x": { "field": "y0", "type": "quantitative" },
    "x2": { "field": "y1", "type": "quantitative" },
    "color": { "field": "x", "type": "quantitative" }
  }
}
```

</div>
</div>

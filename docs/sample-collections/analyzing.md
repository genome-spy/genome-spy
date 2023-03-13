# Analyzing Sample Collections

!!! note "End-User Documentation"

    This page is mainly intended for end users who analyze sample collections
    interactively using the GenomeSpy app.

## Interactions

### Peeking

GenomeSpy is designed to handle up to thousands of concurrently visible samples.
In order to see phenomena that span multiple samples, the whole sample set is
shown at the same time. To focus on a few specific samples, you can activate the
peek tool by pressing and holding the `e` key on the keyboard.

TODO: Video

<div style="display: none">

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

### Sorting

Samples can be interactively sorted by sample-specific attributes and the
actual data.

#### By sample-specific attributes

You can sort the samples by clicking the labels of the attributes.

TODO: A link to a visualization

#### By the actual data

TODO:

- How to sort
  - Screenshot of the context-menu
- How to specify

### Grouping

TODO

### Filtering

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

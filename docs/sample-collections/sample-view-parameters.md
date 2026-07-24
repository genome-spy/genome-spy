# Sample View Parameters

!!! note "Developer Documentation"

    This page is intended for users who develop tailored visualizations
    using the GenomeSpy app.

Sample view provides dynamic parameters for expressions in its child
specifications and data sources. These parameters react to the current layout
and sample-collection state.

## Sample height

The `height` parameter contains the height in pixels of one sample row. It is
available in the repeated child `spec`. The height depends on the number of
samples and the height of the sample view. It also changes when the end user
[peeks samples](analyzing.md#peeking-samples).

To adapt the maximum size of [`"point"`](../grammar/mark/point.md) marks to the
sample height, use a dynamic [scale](../grammar/scale.md) range for the `size`
channel. This example uses [expressions](../grammar/expressions.md) and `height`
to adjust the point size:

```json title="Dynamic point sizes"
"encoding": {
  "size": {
    "field": "VAF",
    "type": "quantitative",
    "scale": {
      "domain": [0, 1],
      "range": [
        { "expr": "0" },
        { "expr": "pow(clamp(height * 0.65, 2, 18), 2)" }
      ]
    }
  },
  ...
}
```

Multiplying `height` by `0.65` leaves padding above and below the points. The
`clamp` function limits the diameter to 2–18 pixels. Because the `size` channel
encodes area rather than diameter, the expression squares the value. The
[PARPiCL](https://genomespy.app/examples/?spec=PARPiCL/parpicl.json) example
uses this technique.

## Visible samples

`visibleSamples` contains the identifiers of samples currently visible in the
sample hierarchy. It reflects filtering and grouping state, but not transient
viewport closeup state.

```json title="Using visibleSamples"
{
  "expr": "visibleSamples"
}
```

`visibleSampleMetadata` provides metadata values for the currently visible
samples. Use bracket access for full metadata paths or dot access for simple
hierarchical names:

```json title="Using visibleSampleMetadata"
{
  "expr": "visibleSampleMetadata['Clinical/patientId']"
}
```

```json title="Dot access for hierarchical metadata"
{
  "expr": "visibleSampleMetadata.Clinical.patientId"
}
```

These parameters are useful with
[URL templates and multiple files](../grammar/data/multi-url.md) to load only
the per-sample, per-patient, or per-cohort-partition files relevant to the
current sample set.

Aggregate tracks also receive a `sampleCount` parameter. See
[Aggregating Samples](aggregating-samples.md#sample-count).

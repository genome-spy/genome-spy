# Visualizing Sample Collections

!!! note "Developer Documentation"

    This page is intended for users who develop tailored visualizations
    using the GenomeSpy app.

## Getting started

You can use the following HTML template to create a web page for your
visualization. The template loads the app from a content delivery network
and the visualization specification from a separate `spec.json` file placed
in the same directory. See the [getting started](../getting-started.md#local-or-remote-web-server)
page for more information.

SNIPPET sample-collections/app-module-spec-file.html

For a complete example, check the
[website-examples](https://github.com/genome-spy/website-examples/blob/master/index.html)
repository on GitHub.

When developing sample-collection visualizations locally, use the
[Inspector](../api/inspector.md) from the three-dot menu in the App toolbar to
inspect the live view hierarchy, dataflow, params, and scale/axis/legend
resolutions.

## Specifying a Sample View

The GenomeSpy app extends the core library with a new view composition operator
that allows visualization of multiple samples. In this context, a _sample_ means
a set of data objects representing an organism, a piece of tissue, a cell line,
a single cell, etc. Each sample gets its own track in the visualization, and the
behavior resembles the _facet_ operator of Vega-Lite. However, there are subtle
differences in the behavior.

A sample view is defined by the `samples` and `spec` properties. To assign a
track for a data object, define a sample-identifier field using the `sample`
channel. More complex visualizations can be created using the
[`layer`](../grammar/composition/layer.md) operator. Each composed view may have
a different data source, enabling concurrent visualization of multiple data
types. For instance, the bottom layer could display segmented copy-number data,
while the top layer might show single-nucleotide variants.

```json
{
  "samples": {
    // Optional sample identifiers and label settings
    ...
  },
  "metadata": {
    // Optional metadata sources and metadata matrix layout
    ...
  },
  "spec": {
    // A single or layer specification
    ...,
    "encoding": {
      ...,
      // The sample channel identifies the track
      "sample": {
        "field": "sampleId"
      }
    }
  }
}
```

!!! note "But we have Band scale?"

    Superficially similar results can be achieved by using the
    ["band"](../grammar/scale.md) scale on the `y` channel. However, you can not
    adjust the intra-band y-position, as the `y` channel is already reserved for
    assigning a band for a datum. On the other hand, with the band scale, the
    graphical marks can span multiple bands. You could, for example, draw lines
    between the bands.

### Implicit sample identifiers

By default, GenomeSpy extracts sample identifiers from the field encoded with
the `sample` channel, and each sample gets its own track.

#### Example

This example displays four segments for each of three samples. The required
`samples` object is empty, so GenomeSpy derives the samples and their order
from the `sample` field in the data.

EXAMPLE examples/app/samples.json runtime=app height=200

### Defining sample identity

Use `samples.identity` when you want to define the sample order, display names,
or the complete sample set independently from the visualized data.

```json title="Explicit sample identity"
{
  "samples": {
    "identity": {
      "data": { "url": "samples.tsv" },
      "idField": "sample",
      "displayNameField": "displayName"
    }
  },
  ...
}
```

This configuration reads sample ids and display names from `samples.tsv`.
Sample metadata, like clinical attributes, has to be provided separately in a
[`metadata`](metadata-sources.md) source.

The following properties configure `samples.identity`:

APP_SCHEMA SampleIdentityDef

#### Example

The example below defines three samples and their display names with inline identity
data.

EXAMPLE examples/app/samples-identity.json runtime=app height=200

### Showing sample y-axes

Sample views can show vertical axes for the repeated sample plots when the
child `spec` defines a y-axis. By default, the axis is repeated for every
visible sample whose row is tall enough. Dense views hide the axes automatically
to avoid clutter.

The sample view property that enables and disables this behavior is:

APP_SCHEMA SampleSpec sampleYAxis

When `sampleYAxis` is enabled, the following properties configure how sample
y-axes are shown:

APP_SCHEMA SampleYAxisDef mode minSampleHeight

### Adjusting sample labels

The `samples` object controls sample labels. For example, to increase the
sample label font size, use the following configuration:

```json title="Adjusting font sizes"
{
  "samples": {
    ...,
    "labelFontSize": 12
  },
  ...
}
```

The following properties allow for fine-grained control of the font styles:

APP_SCHEMA SampleDef labelFont labelFontSize labelFontWeight labelFontStyle labelAlign

In addition, the following sample label properties are supported:

APP_SCHEMA SampleDef labelTitle labelLength

Sample row and group layout can be adjusted with the `sampleLayout` property:

APP_SCHEMA SampleSpec sampleLayout

APP_SCHEMA SampleLayoutDef sampleHeight groupSpacing peekGroupSpacing sampleSpacingFactor

Metadata attribute label and matrix layout properties are documented in
[Configuring Metadata Sources](metadata-sources.md#metadata-configuration).

For runtime parameters that respond to the sample layout and current sample
set, see [Sample View Parameters](sample-view-parameters.md). For summary
tracks across samples or sample groups, see
[Aggregating Samples](aggregating-samples.md).

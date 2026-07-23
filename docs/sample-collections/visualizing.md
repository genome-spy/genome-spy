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

### Handling variable sample heights

The height of a single sample depend on the number of samples and the height of
the sample view. Moreover, the end user can
[toggle](./analyzing.md#peeking-samples) between a bird's eye view and a closeup
view making the height very dynamic.

To adapt the maximum size of [`"point"`](../grammar/mark/point.md) marks to the
height of the samples, you need to specify a dynamic
[scale](../grammar/scale.md) range for the `size` channel. The following example
demonstrates how to use [expressions](../grammar/expressions.md) and the
`height` [parameter](../grammar/parameters.md) to adjust the point size:

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

In this example, the `height` parameter, provided by the sample view, contains
the height of a single sample. By multiplying it with `0.65`, the points get
some padding at the top and bottom. To prevent the points from becoming too
small or excessively large, the `clamp` function is used to limit the point's
diameter to a minimum of `2` and a maximum of `18` pixels. As the `size` channel
encodes the _area_, not the diameter of the points, the `pow` function is used
to square the value. The technique shown here is used in the
[PARPiCL](https://genomespy.app/examples/?spec=PARPiCL/parpicl.json) example.

### Visible sample parameters { #visible-sample-parameters }

Sample view exposes parameters that describe the currently visible samples.
These are mainly useful in advanced cohort visualizations where data sources
should react to the current sample set.

`visibleSamples` contains the identifiers of samples that are currently visible
in the sample hierarchy. It is based on filtering and grouping state, but not on
transient viewport closeup state.

```json title="Using visibleSamples"
{
  "expr": "visibleSamples"
}
```

`visibleSampleMetadata` provides metadata values for the currently visible
samples. Use bracket access for full metadata paths, or dot access for simple
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

These parameters are often used with
[URL templates and multiple files](../grammar/data/multi-url.md) to load
per-sample, per-patient, or per-cohort-partition files only for the currently
relevant samples.

### Aggregation

`aggregateSamples` adds one or more summary tracks to a sample view. Use it when
you want to compare patterns across sample subgroups in addition to inspecting
individual samples.

In the GenomeSpy [paper](https://doi.org/10.1093/gigascience/giae040), the
summary track is used as a copy-number landscape above the main heatmap. The
summary is computed separately for each visible group, which makes recurrent
amplification and deletion patterns easier to compare between subgroups.

Each entry in `aggregateSamples` is a normal unit or layer spec. It may define
its own `transform`, `encoding`, `params`, etc. sections. GenomeSpy prepends a
`mergeFacets` transform automatically and removes the `sample` channel from the
summary encoding.

Use the provided `sampleCount` parameter to normalize summary values by the
number of samples in the current group.

This example shows the per-sample segments with aggregate amplification and
deletion tracks. The embedded toolbar supports undoing and redoing interactions.

EXAMPLE examples/app/copy-numbers.json runtime=app height=300 spechidden

Related examples:

- [`expression-zscores.json`](/docs/examples/app/expression-zscores.json)
- [Spec from the GenomeSpy paper](https://github.com/HautaniemiLab/genomespy-paper-2024-spec/blob/main/cnv-segments.json)

## Bookmarking

With the GenomeSpy app, users can save the current visualization state,
including scale domains and view visibilities, as bookmarks. These bookmarks are
stored in the
[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
of the user's web browser. Each database is unique to an
[origin](https://developer.mozilla.org/en-US/docs/Glossary/Origin), which
typically refers to the hostname and domain of the web server hosting the
visualization. Since the server may host multiple visualizations, each
visualization must have a unique ID assigned to it. To enable bookmarking,
simply add the `specId` property with an arbitrary but unique string value to
the top-level view. Example:

```json
{
  "specId": "My example visualization",

  "vconcat": { ... },
  ...
}
```

### Pre-defined bookmarks and bookmark tour

You may want to provide users with a few pre-defined bookmarks that showcase
interesting findings from the data. Since bookmarks support Markdown-formatted
notes, you can also explain the implications of the findings and present
essential background information.

The _remote bookmarks_ feature allows for storing bookmarks in a JSON file on a
web server and provides them to users through the bookmark menu. In addition,
you can optionally enable the `tour` function, which automatically opens the
first bookmark in the file and allows the user navigate the tour using
previous/next buttons.

#### Enabling remote bookmarks

```json title="View specification"
{
  "bookmarks": {
    "remote": {
      "url": "tour.json",
      "tour": true
    }
  },

  "vconcat": { ... },
  ...
}
```

The `remote` object accepts the following properties:

APP_SCHEMA RemoteBookmarkConfig url initialBookmark tour afterTourBookmark

#### The bookmark file

The remote bookmark file consists of an array of bookmark objects. The easiest
way to create such bookmark objects is to create a bookmark in the app and
choose _Share_ from the submenu (:fontawesome-solid-ellipsis-vertical:) of the
bookmark item. The sharing dialog provides the bookmark in a URL-encoded format
and as a JSON object. Just copy-paste the JSON object into the bookmark file to
make it available to all users. A simplified example:

```json title="Bookmark file (tour.json)"
[
  {
    "name": "First bookmark",
    "actions": [ ... ],
    ...
  },
  {
    "name": "Second bookmark",
    "actions": [ ... ],
    ...
  }
]
```

!!! tip "Providing the user with an initial state"

    If you want to provide the user with an initial state comprising specific
    actions performed on the samples, a particular visible genomic region, etc.,
    you can create a bookmark with the desired settings and set the
    `initialBookmark` property to the bookmark's name. See the documentation
    above for details.

## Toggleable View Visibility

When working with a complex visualization that includes multiple tracks and
extensive metadata, it may not always be necessary to display all views
simultaneously. GenomeSpy App allows for interactive toggling of the visibility
of nodes within the view hierarchy. This visibility state is also included in
shareable links and bookmarks, allowing users to easily access their preferred
configurations.

Toggleable visibility requires each view to have an explicit unique `name`.
GenomeSpy uses the name to address visibility state in bookmarks and shared
state, and to keep views unambiguous within the import scope.

Views have two properties for controlling the visibility:

APP_SCHEMA AppUnitSpec visible configurableVisibility

Use object-form `configurableVisibility` to make views mutually exclusive in the
menu. Views that share the same `group` in the same import scope are shown as
radio buttons:

```json
{
  "name": "rawCoverage",
  "configurableVisibility": { "group": "coverageMode" },
  ...
}
```

## Actions

The app provides context-menu actions for sorting, filtering, grouping, and
other sample-collection operations. For an overview, see
[Analyzing Sample Collections](analyzing.md).

Actions in sample collections also require each view to have an explicit unique
`name`. GenomeSpy uses the name to address the view in action definitions and
to replay those actions from bookmarks, shared state, and provenance history.

## Search

The location/search field in the toolbar allows users to quickly navigate to
features in the data. To make features searchable, use the `search` channel
on marks that represent the searchable data objects.

`search` accepts either a single field definition or an array of field
definitions. When multiple fields are provided, a datum matches if any of the
fields matches the entered term (case-insensitive exact match).

Examples:

```json
{
  ...,
  "mark": "rect",
  "encoding": {
    "search": {
      "field": "geneSymbol"
    },
    ...,
  },
  ...
}
```

```json
{
  ...,
  "mark": "rect",
  "encoding": {
    "search": [
      { "field": "geneSymbol" },
      { "field": "geneId" },
      { "field": "alias" }
    ],
    ...,
  },
  ...
}
```

## A practical example

!!! warning "Work in progress"

    This part of the documentation is still under construction.  For a live
    example, check the
    [PARPiCL](https://github.com/genome-spy/website-examples/tree/master/PARPiCL)
    visualization, which is also available for [interactive
    exploration](https://genomespy.app/examples/?spec=PARPiCL/parpicl.json)

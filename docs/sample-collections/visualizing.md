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

```html
<!DOCTYPE html>
<html>
  <head>
    <title>GenomeSpy</title>
    <link
      rel="stylesheet"
      type="text/css"
      href="https://cdn.jsdelivr.net/npm/@genome-spy/app@0.51.x/dist/style.css"
    />
  </head>
  <body>
    <script
      type="text/javascript"
      src="https://cdn.jsdelivr.net/npm/@genome-spy/app@0.51.x"
    ></script>

    <script>
      genomeSpyApp.embed(document.body, "spec.json", {});
    </script>
  </body>
</html>
```

For a complete example, check the
[website-examples](https://github.com/genome-spy/website-examples/blob/master/index.html)
repository on GitHub.

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
    // Optional sample identifiers and metadata
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

!!! warning "Y axis ticks"

    The Y axis ticks are not available in sample views at the moment.
    Will be fixed at a later time. However, they would not be particularly
    practical with high number of samples.

!!! note "But we have Band scale?"

    Superficially similar results can be achieved by using the
    ["band"](../grammar/scale.md) scale on the `y` channel. However, you can not
    adjust the intra-band y-position, as the `y` channel is already reserved for
    assigning a band for a datum. On the other hand, with the band scale, the
    graphical marks can span multiple bands. You could, for example, draw lines
    between the bands.

### Implicit sample identifiers

By default, the identifiers of the samples are extracted from the
data, and each sample gets its own track.

### Explicit sample identifiers and metadata attributes

Genomic data is commonly supplemented with metadata that contains various
clinical and computational annotations. To show such metadata alongside the
genomic data as a color-coded heat map, you can provide a
[`data`](../grammar/data/eager.md) source with sample identifiers and metadata
columns.

```json title="Explicit sample identifiers"
{
  "samples": {
    "data": { "url": "samples.tsv" }
  },
  "spec": {
    ...
  }
}
```

The data source must have a `sample` field matching the sample identifiers used
in the genomic data. In addition, an optional `displayName` field can be
provided if the sample names should be shown, for example, in a shortened form.
All other fields are shown as metadata attributes, and their data types are
inferred automatically from the data: numeric attributes are interpreted as
`"quantitative"` data, all others as `"nominal"`.

An example of a metadata file (`samples.tsv`):

| sample             | displayName   | treatment | ploidy | purity |
| ------------------ | ------------- | --------- | ------ | ------ |
| EOC52_pPer_DNA4    | EOC52_pPer    | NACT      | 3.37   | 0.29   |
| EOC702_pOme1_DNA1  | EOC702_pOme1  | PDS       | 3.74   | 0.155  |
| EOC912_p2Bow2_DNA1 | EOC912_p2Bow2 | PDS       | 3.29   | 0.53   |

#### Specifying data types of metadata attributes

To adjust the data types, [scales](../grammar/scale.md), and default visibility
of the attributes, they can be specified explicitly using the `attributes`
object, as shown in the example below:

```json title="Specifying a purity attribute"
{
  "samples": {
    "data": { "url": "samples.tsv" },
    "attributes": {
      "purity": {
        "type": "quantitative",
        "scale": {
          "domain": [0, 1],
          "scheme": "yellowgreenblue"
        },
        "barScale": { },
        "visible": false
      },
      ...
    }
  },
  ...
}
```

The `scale` property specifies a scale for the `color` channel used to encode
the values on the metadata heatmap. The optional `barScale` property enables
positional encoding, changing the heatmap cells into a horizontal bar chart. The
`visible` property configures the default visibility for the attribute.

### Adjusting font sizes, etc.

The `samples` object can also be used to adjust the font sizes, etc. of the
metadata attributes. For example, to increase the font sizes of the sample and
attribute labels, use the following configuration:

```json title="Adjusting font sizes"
{
  "samples": {
    ...,
    "labelFontSize": 12,
    "attributeLabelFontSize": 10
  },
  ...
}
```

The following properties allow for fine-grained control of the font styles:
`labelFont`, `labelFontSize`, `labelFontWeight`, `labelFontStyle`, `labelAlign`,
`attributeLabelFont`, `attributeLabelFontSize`, `attributeLabelFontWeight`, `attributeLabelFontStyle`.

In addition, the following properties are supported:

`labelTitleText`
: The title of the sample labels.

    **Default value:** `"Sample name"`

`labelLength`
: The space allocated for the sample labels in pixels.

    **Default value:** `140`

`labelAlign`
: The horizontal alignment of the text. One of `"left"`, `"center"`, or `"right"`.

    **Default value:** `"left"`

`attributeSize`
: Default size (width) of the metadata attribute columns. Can be configured per attribute using the `attributes` property.

    **Default value:** `10`

`attributeLabelAngle`
: Angle to be added to the default label angle (-90).

    **Default value:** `0`

`attributeSpacing`
: Spacing between attribute columns in pixels.

    **Default value:** `1`

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

### Aggregation

TODO

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

`url` (string)
: A URL to the remote bookmark file.

`initialBookmark` (string)
: Name of the bookmark that should be loaded as the initial state. The bookmark
description dialog is shown only if the `tour` property is set to `true`.

`tour` (boolean, optional)
: Should the user be shown a tour of the remote bookmarks when the visualization
is launched? If the `initialBookmark` property is not defined, the tour starts
from the first bookmark.

    **Default:** `false`

`afterTourBookmark` (string, optional)
: Name of the bookmark that should be loaded when the user ends the tour.
If `null`, the dialog will be closed and the current state is retained.
If undefined, the default state without any performed actions will be loaded.

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
simultaneously. The GenomeSpy app offers users the ability to toggle the
visibility of nodes within the view hierarchy. This visibility state is also
included in shareable links and bookmarks, allowing users to easily access their
preferred configurations.

Views have two properties for controlling the visibility:

`visible` (boolean)
: If true, the view is visible. This property can be used to set the default visibility.

     **Default:** `true`

`configurableVisibility` (boolean)
: If true, the visibility is configurable from a menu in the app

    Configurability requires that the view has an explicitly specified `name`
    that is *unique* within the view specification.

    **Default:** `false` for children of `layer`, `true` for others

## Search

The location/search field in the toolbar allows users to quickly navigate to
features in the data. To make features searchable, use the `search` channel
on marks that represent the searchable data objects. Example:

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

## A practical example

!!! warning "Work in progress"

    This part of the documentation is still under construction.  For a live
    example, check the
    [PARPiCL](https://github.com/genome-spy/website-examples/tree/master/PARPiCL)
    visualization, which is also available for [interactive
    exploration](https://genomespy.app/examples/?spec=PARPiCL/parpicl.json)

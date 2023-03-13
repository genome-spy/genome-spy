# Visualizing Sample Collections

!!! note "Developer Documentation"

    This page is intended for users who develop tailored visualizations
    using the GenomeSpy app.

## Getting started

The app has its own NPM package. To get started, follow the generic [Getting
Started](../getting-started.md#html-template) documentation, but replace the
`@genome-spy/core` package with the `@genome-spy/app` package, and use
`genomeSpyApp.embed(...)` instead of `genomeSpyEmbed.embed(...)`.

For a complete example, check the
[website-examples](https://github.com/genome-spy/website-examples/blob/master/index.html)
repository on GitHub.

## Specifying a Sample View

The GenomeSpy app extends the core library with a new view composition operator
that allows visualization of multiple samples. In this context, a _sample_ means
a set of data objects representing an organsm, a piece of tissue, cell line,
single cell, etc. Each sample gets its own track in the visualization, and the
behavior resembles the _facet_ operator of Vega-Lite. However, there are subtle
differences in the behavior.

A sample view is defined by the `samples` and `spec` properties. To assign a
track for a data object, define a sample-identifier field using the `sample`
channel. More complex visualizations can be created using the
[`layer`](../grammar/composition/layer.md) operator. Each of the composed views
may have a different data source, enabling concurrent visualization of multiple
data types. For instance, the bottom layer could display segmented copy-number
data while the top layer might show single-nucleotide variants.

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
        "field": "sampleId",
        "type": "nominal"
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
data.

### Explicit sample identifiers and metadata attributes

Genomic data is commonly supplemented with metadata that contains various
clinical and computational annotations. To show such metadata alongside the
genomic data as a color-coded heat map, you can provide a
[`data`](../grammar/data.md) source with sample identifiers and metadata
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
in the genomic data. An optional `displayName` field can be provided if the
sample names should be shown, for example, in a shortened form. All other
fields are shown as metadata attributes, and their data types are inferred
automatically from the data: numeric attributes are interpreted as
`"quantitative"` data, all others as `"nominal"`.

Example of a metadata source (`samples.tsv`):

| sample | displayName | patient | tissueSite | breaks |
| ------ | ----------- | ------- | ---------- | ------ |
| TODO   | TODO        | TODO    | TODO       | TODO   |

#### Specifying data types of metadata attributes

To adjust the data types and [scales](../grammar/scale.md) of the attributes,
they can be specified explicitly using the `attributes` object as shown in the
example below:

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
  ...
}
```

### Aggregation

TODO

## Bookmarking

TODO

## Search

TODO

## A practical example

!!! warning "Work in progress"

    This part of the documentation is under construction and some features are
    still a bit unstable. For a live example, check the
    [PARPiCL](https://genomespy.app/examples/?spec=PARPiCL/parpicl.json)
    visualization.

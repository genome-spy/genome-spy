# The Grammar of Graphics

The visualization grammar of GenomeSpy is a subset and a dialect of
[Vega-Lite](https://vega.github.io/vega-lite/). However, the goals of
GenomeSpy and Vega-Lite are different – GenomeSpy is more domain-specific and
is intended for visualizing genomic coordinates. In its current form, the
grammar of GenomeSpy is limited to specifying visual encoding and certain data
transformations. GenomeSpy tries to faithfully follow Vega-Lite's grammar
where practical. Thus, this documentation has many references to Vega-Lite's
documentation.

## View Specification

## Data input

GenomeSpy inputs tabular data as *CSV*, *TSV*, or *JSON* files. Currently,
common bioinformatic data formats such as *BED* or *BigWig* are not directly
supported. They must be first converted into one of the tabular formats above.

TODO: Add an example of URL data here

With the exception of the geographical formats and generators, data
specification of GenomeSpy identical to Vega-Lite's
[data](https://vega.github.io/vega-lite/docs/data.html) property.

## Transformation

### Flatten Delimited

### Formula

### Gather

### Regex Match

TODO: Rename to Regex Extract

### Stack

### Filter

TODO: make SimpleFilter compatible with VL's Filter

## Encoding

## Marks

## Scales

## Guides (axes)

## View composition

### Layer

    * Resolve

## Expression

TODO
Subset of https://github.com/vega/vega/tree/master/packages/vega-expression

---
title: GenomeSpy Visualization Grammar
---

# Visualization Grammar

GenomeSpy Core uses a declarative visualization grammar, not a set of predefined
chart templates. Its JSON specifications describe which data to use, how to
display it, and how views fit together. This lets you create genome tracks and
other views tailored to your data without writing drawing commands. If you work
in Python, [GenomeSpy for Python](https://genomespy.app/genome-spy-python/)
builds the same specifications from Python chart definitions.

The grammar combines [data sources](data/index.md),
[transformations](transform/index.md), [marks](mark/index.md),
[scales](scale.md), [axes](axis.md), [titles](title.md), and
[legends](legend.md). Data consists of rows with named fields. Transformations
filter, derive, or summarize rows before encodings map fields, values, and
expressions to visual channels. Scales translate data values into visual values,
marks render the results, and axes and legends describe the scales.

!!! note "A grammar based on Vega-Lite"

    GenomeSpy's visualization grammar is based on
    [Vega-Lite](https://vega.github.io/vega-lite/) and follows its concepts and
    syntax where practical, providing partial specification compatibility. The
    implementation is independent and designed for visualizing and analyzing
    large datasets containing genomic coordinates. This documentation links to
    the Vega-Lite documentation where the same grammar concepts apply.

    The grammar-of-graphics approach was introduced in [The Grammar of
    Graphics](https://www.springer.com/gp/book/9780387245447) and developed
    further in [ggplot2](https://ggplot2.tidyverse.org/) and Vega-Lite.

## Unit views

A GenomeSpy specification describes a hierarchy of views. A unit view is a leaf
in the hierarchy that renders rows using a graphical [mark](mark/index.md). The
`mark` is its only required property. A unit view can define its own `data`,
`transform`, and `encoding`, or inherit them from an ancestor composition view.

EXAMPLE examples/docs/grammar/index/single-view-specification.json height=200

## View hierarchy and composition

The root of a specification can be a unit view or a composition view. It can
also define settings for the whole specification, including
[genome assemblies](genomic-coordinates.md), [themes and
configuration](config.md), the background, and the base URL for external
resources.

[Composition views](composition/index.md) arrange child views into a hierarchy.
For example, [`layer`](composition/layer.md) overlays views to create custom
glyphs, while the [concatenation](composition/concat.md) operators arrange views
into tracks or grids. Common properties such as `data`, `transform`, and
`encoding` can be defined on a composition view and inherited by its
descendants.

## Parameters and interaction

[Parameters](parameters.md) add values, input controls, and interactive
selections to a specification. [Expressions](expressions.md) can derive values
from parameters and drive [mark properties](mark/index.md#properties), while
[conditional encodings](conditional-encoding.md) and transformations can
respond to parameter values and selections. This allows interaction to change
visual properties and data while preserving the declarative specification
model.

## Schema-assisted editing

Misspelled properties, invalid values, and settings in the wrong place are easy
to overlook in a specification. A JSON-aware editor can catch many of these
errors as you type. It can also suggest available properties and show their
documentation.

A schema is a machine-readable description of the properties and values that a
specification accepts. Enable these editor features by adding `$schema` to the
root of a Core specification:

SNIPPET grammar/core-schema-spec.json

Major-version URLs are recommended because they follow compatible releases.
Minor (`v1.2.json`) and exact (`v1.2.3.json`) URLs are available when tighter
reproducibility is needed. Update the URL when upgrading to a new major version.
Schemas are also available from jsDelivr and unpkg.

GenomeSpy App specifications use a different schema; see [Visualizing Sample
Collections](../sample-collections/visualizing.md#schema-assisted-editing).

VS Code supports JSON schemas without an extension. Its [JSON
documentation](https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings)
also explains how to associate schemas through workspace or user settings.

The Playground selects the Core schema automatically, and inline documentation
examples omit `$schema`. Schema validation cannot verify external resources,
data fields, or expression behavior.

The Playground also underlines declarations with reported loading failures,
missing encoding fields, invalid expressions (including syntax errors and unknown
parameter names), duplicate parameter names, missing `push: "outer"` targets, or
transform construction failures such as invalid regular expressions. These checks
run as the visualization loads and executes. Flat field mappings and static
top-level `datum` references in expressions require the property to exist on every
processed row, even if its value is `undefined` or `null`. Nested properties and
computed expression keys are not checked.

## Unit view reference

The following reference lists all properties available on unit views. Most are
shared by the different view types and can be used throughout a view hierarchy;
`mark` is specific to unit views.

SCHEMA UnitSpec

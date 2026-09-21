---
title: GenomeSpy Visualization Grammar
---

# Visualization Grammar

Genome browser applications typically couple the visual representations to
specific file formats and provide few customization options. GenomeSpy instead
uses declarative JSON specifications: you describe the data and its visual
representation rather than issue drawing commands.

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

GenomeSpy publishes a JSON Schema that JSON-aware editors can use for
completion, hover documentation, and validation. Add `$schema` to the root of a
Core specification:

SNIPPET grammar/core-schema-spec.json

Use the `@genome-spy/app` schema instead for [sample collection
specifications](../sample-collections/index.md), using the corresponding
`https://genomespy.app/schema/app/v<major>.json` URL. The major-version URL is
recommended for normal use: compatible schema improvements are published at
the same URL, while a new major remains opt-in. Minor-version and exact-version
URLs are also available as `v<major>.<minor>.json` and
`v<major>.<minor>.<patch>.json` when a project needs tighter reproducibility.

The schema files are also included in the npm packages and can be loaded from
jsDelivr. Existing unversioned jsDelivr and unpkg URLs remain supported, but
they follow the selected npm package version rather than GenomeSpy's public
major-version policy. The Playground configures the current Core development
schema automatically, including when a spec uses its current major-version URL.

During the remaining 0.x releases, the `v0.json` alias follows the compatible
late-v0 grammar used to prepare GenomeSpy 1.0. When upgrading the runtime from
0.x to 1.x, update `v0.json` to `v1.json` as well. The 1.0 grammar remains
compatible with late v0, but additions made during 1.x are exposed only by the
v1 schema.

The inline examples in this documentation omit `$schema` to keep them concise.
Schema validation checks the structure and configuration values of a
specification, but it cannot verify external resources, the existence of data
fields, or expression behavior.

## Unit view reference

The following reference lists all properties available on unit views. Most are
shared by the different view types and can be used throughout a view hierarchy;
`mark` is specific to unit views.

SCHEMA UnitSpec

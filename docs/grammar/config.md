# Global Config, Themes, and Styles

GenomeSpy supports visual defaults through `config`, built-in theme selection
through `theme`, and reusable named buckets through `config.style`. The key
idea is that configuration is hierarchical: it can be defined at the root, on
nested views, and at import sites, which makes it practical for large
visualizations composed of multiple panels, tracks, and reusable imported
subtrees that each need their own local defaults while still fitting into a
shared overall design.

## Quick example

The example below configures quantitative axes to show grid lines, changes
point defaults, and defines a reusable style bucket for the view background.

EXAMPLE examples/docs/grammar/config/config-overview.json height=220

## Properties

SCHEMA GenomeSpyConfig

## Theme, Config, and Style

Use `theme` when you want a broad preset for the whole visualization. Use
`config` when you want defaults for a scope. Use `style` when the same visual
treatment should be referenced by name from marks, axes, titles, or views.

## Built-in themes

GenomeSpy currently supports these built-in themes:

- `genomespy`
- `vegalite`
- `quartz`
- `dark`
- `fivethirtyeight`
- `urbaninstitute`

The `genomespy` theme is the default GenomeSpy look. The `vegalite` theme
follows Vega-Lite defaults where GenomeSpy supports the same features. The
Vega-inspired themes are based on `vegalite`.

Theme selection is root-only. Specs can choose one of the built-in themes.

EXAMPLE examples/docs/grammar/config/theme.json height=220

## Config scopes

Config can appear in the root spec, in any view, and at an import site. Scopes
are merged from outermost to innermost, so the closest scope wins.

For imports, import-site config is merged before the imported spec's own root
config. This allows imported tracks to stay self-contained while still fitting
their host visualization.

Explicit local properties still override resolved defaults. For example,
`mark.color` or `encoding.x.axis.tickColor` wins over inherited config.

## Resolution order

The effective order is:

1. internal defaults
2. built-in default theme
3. [embed-level theme override](../api.md#theme-config)
4. root `theme`
5. root `config`
6. ancestor view `config`
7. import-site `config`
8. imported root `config`
9. local view `config`
10. explicit local properties

## Mark defaults

Mark defaults come first from `config.mark`, then from a mark-type bucket such
as `config.point`, `config.rect`, `config.rule`, or `config.tick`, and then
from style buckets.

For example,
`config.style.point` affects point marks even when `mark.style` is omitted.

## Axis defaults

Axis defaults come from `config.axis` and then from more specific buckets such
as `config.axisX`, `config.axisTop`, or `config.axisQuantitative`. Axis styles
can be provided by config buckets and by explicit `axis.style` references in
channel definitions.

See also [Scale](./scale.md).

## Scale defaults

Scale defaults come from `config.scale` and `config.range`.

`config.scale` provides shared defaults and data-type-specific buckets such as
`nominal`, `ordinal`, `quantitative`, `index`, and `locus`. Color scheme
defaults can be configured with `nominalColorScheme`, `ordinalColorScheme`, and
`quantitativeColorScheme`.

Named ranges such as `"shape"`, `"size"`, `"angle"`, `"heatmap"`, `"ramp"`, and
`"diverging"` are resolved through `config.range`.

GenomeSpy keeps positional scale ranges as an internal invariant, so explicit
or configured positional `range` values are ignored.

See also [Scale](./scale.md).

## Title and view defaults

Title defaults come from `config.title` and from style buckets. If `title.style`
is omitted, GenomeSpy applies the default `"group-title"` style name.
GenomeSpy also provides built-in title styles such as `"track-title"` and
`"overlay-title"` for common layout patterns.

View background defaults come from `config.view` and from styles referenced by
`view.style`. GenomeSpy also supports the implicit `"cell"` style model for view
backgrounds.

EXAMPLE examples/docs/grammar/config/title-styles.json height=280

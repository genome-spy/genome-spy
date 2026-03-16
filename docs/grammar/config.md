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

This is roughly similar to choosing a design system, defining scoped defaults,
and then using reusable class-like tokens. The analogy is only partial:
GenomeSpy has no selector matching and no selector specificity. Precedence is
fixed by the config resolution model.

## Built-in themes

GenomeSpy currently supports these built-in themes:

- `genomespy`
- `vegalite`
- `quartz`
- `dark`
- `fivethirtyeight`
- `urbaninstitute`

The `genomespy` theme preserves GenomeSpy defaults. The `vegalite` theme is a
best-effort mapping of Vega-Lite defaults for overlapping features. The
Vega-inspired themes are layered on top of `vegalite`.

Theme selection is currently root-only. GenomeSpy supports selecting built-in
themes, but not defining custom named themes inside the spec.

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
3. embed-level theme override, if provided
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

GenomeSpy also supports an implicit mark-type style layer. For example,
`config.style.point` affects point marks even when `mark.style` is omitted.

The `"tick"` mark shares its renderer implementation with `"rule"`, but it is a
first-class mark in the config model. That means `config.tick` and
`config.style.tick` apply to ticks, while `config.rule` applies to rules.

## Axis defaults

Axis defaults come from `config.axis` and then from more specific buckets such
as `config.axisX`, `config.axisTop`, or `config.axisQuantitative`. Axis styles
can be provided by config buckets and by explicit `axis.style` references in
channel definitions.

Shared axes use deterministic merge ordering, so the result no longer depends
on registration order.

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
is omitted, GenomeSpy can use the implicit `"group-title"` style fallback.

View background defaults come from `config.view` and from styles referenced by
`view.style`. GenomeSpy also supports the implicit `"cell"` style model for view
backgrounds.

## Examples

- `examples/core/config/config-basic.json`
- `examples/core/config/config-scoped-view.json`
- `examples/core/config/config-imported-track.json`
- `examples/core/config/config-import-override.json`
- `examples/core/config/config-scale-schemes-by-type.json`
- `examples/core/config/config-theme-comparison-bars.json`
- `examples/core/config/config-crazy-theme-style-showcase.json`

# Global Config, Themes, and Styles

GenomeSpy supports a Vega-Lite-like configuration model for controlling visual
defaults. Instead of repeating the same axis, mark, scale, title, and view
settings in every spec fragment, you can move them into `config`. GenomeSpy
also supports built-in `theme` selection and reusable named `style` buckets.

Unlike Vega-Lite, configuration in GenomeSpy is hierarchical. A root
visualization can define defaults for the whole view tree, and nested views or
import sites can narrow those defaults for a subtree.

## Mental Model

GenomeSpy has three related mechanisms that serve different purposes.

`theme` selects a broad visual preset for the whole visualization. It is useful
when you want a recognizable overall look such as the default GenomeSpy theme,
a Vega-Lite-like theme, or one of the built-in Vega-inspired themes.

`config` defines defaults for a scope. Use it when you want to say that all
quantitative axes in some subtree should have grid lines, or that all point
marks inside a reusable track should be unfilled by default.

`style` defines named reusable property buckets inside `config.style`. Use it
when the same visual treatment should be referenced from multiple marks, axes,
titles, or view backgrounds.

An approximate CSS analogy can be helpful: `theme` is like choosing a design
system, `config` is like scoped default rules, and `style` is like reusable
class-like tokens. The analogy is limited, though. GenomeSpy has no selector
matching and no selector specificity; precedence is fixed by the config
resolution model.

## Theme Selection

Theme selection is supported at the root specification. The currently supported
built-in themes are:

- `genomespy`
- `vegalite`
- `quartz`
- `dark`
- `fivethirtyeight`
- `urbaninstitute`

The `genomespy` theme preserves GenomeSpy's default behavior. The `vegalite`
theme is a best-effort attempt to match Vega-Lite defaults where the feature
sets overlap. The Vega-inspired themes are layered on top of `vegalite`, so
they reuse the same general design direction and override the supported parts.

Some themes also define a default root canvas `background`. An explicit
root-level `background` property still has higher precedence.

!!! note

    GenomeSpy currently supports selecting built-in themes, but not defining
    custom named themes inside the spec. For now, new appearances should be
    built using built-in `theme` together with `config` and `style`.

## Config Scopes

Config can appear in three places: the root spec, any view, and an import site.
Those scopes are merged from outermost to innermost. In practice, this means
that a reusable imported track can define sensible defaults for itself, while a
host specification can still adapt the surrounding context.

When multiple config scopes contribute values for the same property, the
closest scope wins. After that, explicit local properties in the spec still
override config-derived defaults. For example, a local `mark.color` or
`encoding.x.axis.tickColor` always wins over inherited config.

For imports, the import-site config is merged before the imported spec's own
root config. This keeps imported tracks self-contained while still allowing the
host visualization to provide context-level defaults.

## Theme, Config, and Style Together

A practical way to think about the layers is to start broad and then get more
specific. Choose a root `theme` first if you want one. Then use `config` to set
policy-like defaults for a scope. Finally, use `style` for repeated visual
treatments that should be referenced by name. Explicit properties should be
reserved for local exceptions.

This distinction matters because `theme` and `style` are not interchangeable.
A theme may contain style buckets as part of its config, but `style` remains
the mechanism that marks, axes, titles, and view backgrounds actually reference.
In other words, `theme` selects a preset configuration, whereas `style` is part
of that configuration.

## Mark Defaults

Mark defaults are resolved from `config.mark`, then from the mark-type bucket
such as `config.point`, `config.rect`, or `config.tick`, and then from style
buckets. GenomeSpy also follows a Vega-Lite-like pattern where
`config.style.<markType>` acts as an implicit style layer even if `mark.style`
is not specified explicitly.

The `"tick"` mark shares its renderer implementation with `"rule"`, but it is a
first-class mark in the config model. That means `config.tick` and
`config.style.tick` apply to ticks, while `config.rule` applies to rules.

See:

- `examples/core/config/config-basic.json`
- `examples/core/config/config-scoped-view.json`

## Axis Defaults

Axis defaults are read from `config.axis` and then refined through more
specific buckets such as `config.axisX`, `config.axisY`, orient-specific
buckets, and type-specific buckets like `config.axisQuantitative`.

Axis styles can come both from config buckets and from explicit axis `style`
references in channel definitions. Explicit `encoding.<channel>.axis` values
still override config-derived defaults.

When a shared axis has conflicting settings from sibling views, GenomeSpy uses a
deterministic merge order based on stable view paths. This avoids
registration-order dependence, although conflicting explicit values still
follow a first-value-wins rule with a warning.

## Scale Defaults

Scale defaults are configured through `config.scale` and `config.range`.
`config.scale` provides shared defaults and data-type-specific buckets such as
`nominal`, `ordinal`, `quantitative`, `index`, and `locus`.

Color scheme defaults can be configured by data type using
`nominalColorScheme`, `ordinalColorScheme`, and `quantitativeColorScheme`.
Named scale ranges such as `"shape"`, `"size"`, `"angle"`, `"heatmap"`,
`"ramp"`, and `"diverging"` are resolved through `config.range`.

GenomeSpy keeps a few scale invariants outside theming. In particular,
positional channels always use the unit range `[0, 1]` internally, so explicit
or configured positional `range` values are ignored.

See:

- `examples/core/config/config-scale-schemes-by-type.json`

## Title and View Defaults

Title defaults come from `config.title` and from style buckets. If `title.style`
is omitted, GenomeSpy uses an implicit `"group-title"` style fallback when one
is available. This mirrors the style-first direction used elsewhere in the
config system.

View background defaults come from `config.view` and from styles referenced by
`view.style`. When no explicit view style is given, GenomeSpy can also use the
implicit `"cell"` style model for view backgrounds.

As with other domains, explicit local `title` and `view` properties override the
resolved defaults.

## Examples

The following examples cover the most important configuration patterns:

- `examples/core/config/config-basic.json`
- `examples/core/config/config-scoped-view.json`
- `examples/core/config/config-imported-track.json`
- `examples/core/config/config-import-override.json`
- `examples/core/config/config-theme-comparison-bars.json`
- `examples/core/config/config-crazy-theme-style-showcase.json`

## Properties

SCHEMA GenomeSpyConfig

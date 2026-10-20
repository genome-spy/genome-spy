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

## Named styles and resets

Named styles are defined under `config.style` and referenced with a `style`
property. Style references add reusable defaults before the object that
references them, so explicit properties still win.

Some guide config objects, such as axes and legends, can inherit styles from
more general config buckets. Set `style` to `null` in a deeper scope to clear
those inherited style defaults without clearing other inherited properties:

```json
{
  "config": {
    "legendTrack": {
      "style": null
    }
  }
}
```

This is useful when a broad default style applies to most of a visualization
but a subtree should keep the other defaults while using unstyled axes or
legends.

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
remaining themes are loosely adapted from
[vega-themes](https://github.com/vega/vega-themes).

Only `genomespy` follows CSS appearance settings. Other named themes supply
fixed colors and backgrounds.

Theme selection is root-only. Specs can choose one of the built-in themes.

EXAMPLE examples/docs/grammar/config/theme.json height=420

## Reactive colors

Colors in mark properties, axes, chromosome guides, legends, titles, and view
backgrounds can use [expressions](./expressions.md). An object-valued
[parameter](./parameters.md) can group these colors into a palette. Updating
the palette changes an initialized visualization without reloading its data or
resetting zoom and selections.

### Default theme palette

The default `genomespy` theme stays light unless the host page opts into dark
mode through CSS `color-scheme`. Its canvas stays transparent in both modes, so
the host page must supply a matching surface.

The [light and dark mode embedding example](https://genomespy.app/docs/api/embed-examples/darkMode/)
demonstrates automatic switching and CSS customization.

A page that supports both modes can enable automatic browser preference changes:

```css
:root {
  color-scheme: light dark;
  background: light-dark(white, #19212a);
}
```

Set `color-scheme: light` or `color-scheme: dark` to force one mode. Tooltips
follow the same mode and respect `--genome-spy-foreground`.

Override these inherited CSS custom properties to customize the palette:

| CSS property                   | Used for                                                      | Light       | Dark        |
| ------------------------------ | ------------------------------------------------------------- | ----------- | ----------- |
| `--genome-spy-foreground`      | Text, titles, rules, links, transcript arrows, brush outlines | `black`     | `#e5ebf1`   |
| `--genome-spy-stroke`          | Axis domains, ticks, chromosome grids                         | `gray`      | `#a0adba`   |
| `--genome-spy-grid`            | Ordinary grid lines                                           | `lightgray` | `#3a4653`   |
| `--genome-spy-chromosome-tick` | Chromosome boundary ticks                                     | `#989898`   | `#b0bdca`   |
| `--genome-spy-symbol-stroke`   | Legend symbol outlines                                        | `#888`      | `#c0cbd6`   |
| `--genome-spy-background`      | Canvas and default export background                          | transparent | transparent |

```css
#plot {
  --genome-spy-foreground: light-dark(#352719, #f4e4cf);
  --genome-spy-grid: light-dark(#ded2c0, #5e4c37);
}
```

CSS colors must resolve to named colors, hex, RGB, or HSL. CSS Color 4 values
such as `oklch()` and `color(display-p3 ...)` are unsupported.

Browser preference changes and container or ancestor attribute changes refresh
the palette automatically. Other CSS changes, such as replacing a stylesheet,
require [`api.refreshStyles()`](../api/runtime-state.md#updating-appearance).

For programmatic control through the `defaultThemeColors` parameter, see
[Updating appearance](../api/runtime-state.md#updating-appearance).

### Canvas and view backgrounds

The root `background` controls the entire canvas, while `view.fill` and
`config.view.fill` control individual view backgrounds. An explicit root
background overrides the theme background. A background expression can return
`null` for transparency.

See [Image export](../api/instance.md#exporting-raster-images) for export
background options.

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
3. [embed-level theme override](../api/embed-options.md#theme-config)
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
channel definitions. Set `axis.style` to `null` to clear inherited axis styles
in a channel definition.

See also [Axis](./axis.md).

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

See also [Titles](./title.md).

View background defaults come from `config.view` and from styles referenced by
`view.style`. GenomeSpy also supports the implicit `"cell"` style model for view
backgrounds.

## View size defaults

`config.view` can define default sizes for views that do not specify `width` or
`height` directly. These defaults follow Vega-Lite's continuous/discrete split:

SCHEMA ViewConfig continuousWidth discreteWidth continuousHeight discreteHeight step

`discreteWidth` and `discreteHeight` can be fixed pixel values or step objects:

```json
{
  "config": {
    "view": {
      "continuousWidth": 300,
      "continuousHeight": 300,
      "discreteWidth": { "step": 20 },
      "discreteHeight": { "step": 20 }
    }
  }
}
```

If these properties are omitted, GenomeSpy keeps its default `"container"`
sizing behavior. See [child sizing](./composition/concat.md#child-sizing) for
details about `"container"` and other size shorthands.

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
the host page must supply a matching surface. Explicit colors and data color
scales retain their normal precedence.

The [light and dark mode embedding example](https://genomespy.app/docs/api/embed-examples/darkMode/)
demonstrates automatic switching and CSS customization.

A page that supports both modes can enable automatic browser preference changes:

```css
:root {
  color-scheme: light dark;
  background: light-dark(white, #19212a);
}
```

GenomeSpy inherits this setting from its container and ancestors. An unset or
`normal` scheme stays light, regardless of browser preference. An explicit
`color-scheme: light` or `color-scheme: dark` forces that mode. The host remains
responsible for styling its own background. Tooltips follow the same scheme
and use an opaque light or dark surface. Their text also respects
`--genome-spy-foreground`.

Override any of these inherited CSS custom properties to customize individual
roles. The defaults use `light-dark()` and preserve the existing light colors:

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

GenomeSpy resolves CSS variables and `light-dark()` through the browser. Colors
must resolve to values supported by its color parser: named colors, hex, RGB,
or HSL. Modern CSS Color 4 results such as `oklch()` and `color(display-p3 ...)`
are rejected; supply an RGB or HSL alternative.

Browser preference changes and attributes changed on the container or its
ancestors refresh the palette automatically, without polling. After replacing
a stylesheet or making another CSS change outside those events, call
[`api.refreshStyles()`](../api/runtime-state.md#updating-appearance).

The resolved colors populate the root `defaultThemeColors` parameter, with
fields `foreground`, `stroke`, `grid`, `chromosomeTick`, `symbolStroke`, and
`background`. A transparent background is represented by `null`. The palette
does not add view fills or borders where none are configured. Headless renders
use deterministic light defaults. GenomeSpy App keeps its existing light scheme
to match its UI surfaces.

For exclusive programmatic control, declare `defaultThemeColors` in the root
`params`. This opts out of automatic CSS updates and replaces the complete
palette:

```json
{
  "params": [
    {
      "name": "defaultThemeColors",
      "value": {
        "foreground": "#eeeeee",
        "stroke": "#aaaaaa",
        "grid": "#444444",
        "chromosomeTick": "#999999",
        "symbolStroke": "#bbbbbb",
        "background": null
      }
    }
  ]
}
```

An authored expression parameter can compute the palette instead; it follows
the usual read-only parameter API. Descendant views can shadow
`defaultThemeColors` through normal parameter scoping. The root canvas
background continues to use the root palette.

Other named presets supply fixed colors and backgrounds; they do not follow
CSS mode changes. For example, `dark` is a fixed appearance. A root `theme`
takes precedence over an embed-level `theme` option.

### Canvas and view backgrounds

The root `background` controls the entire canvas, while `view.fill` and
`config.view.fill` control individual view backgrounds. An explicit root
background takes precedence over a selected preset's background, which takes
precedence over `defaultThemeColors.background` in the default theme. Fixed
named presets without their own background stay transparent. When no background
color is configured, the canvas is transparent and exports default to white.

A root background expression uses the root parameter scope. When it resolves
to `null`, the canvas is transparent even if the palette or preset provides an
opaque background. An explicit export `background` overrides the resolved
default, including `null` for transparent output.

See [Updating appearance](../api/runtime-state.md#updating-appearance) for
publishing palettes from an embedding application.

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

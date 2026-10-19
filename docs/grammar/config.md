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

The default `genomespy` theme reads neutral colors from an automatically
initialized root parameter named `themeColors`:

| Field            | Used for                                                                     | Default       |
| ---------------- | ---------------------------------------------------------------------------- | ------------- |
| `foreground`     | Text, titles, facet headers, rules, links, transcript arrows, brush outlines | `"black"`     |
| `stroke`         | Axis domains, ticks, chromosome grids                                        | `"gray"`      |
| `grid`           | Ordinary grid lines                                                          | `"lightgray"` |
| `chromosomeTick` | Chromosome boundary ticks                                                    | `"#989898"`   |
| `symbolStroke`   | Default legend symbol outlines                                               | `"#888"`      |
| `background`     | Canvas and default export background                                         | `null`        |

Publish a complete palette through
[`api.params.get("themeColors")`](../api/runtime-state.md#updating-appearance)
to update these defaults. The blue default mark color and data color scales
keep their colors. The palette does not add view fills or borders where none
are configured.

To choose the initial palette, declare `themeColors` in the root `params`.
This declaration replaces the built-in declaration and must supply every field:

```json
{
  "params": [
    {
      "name": "themeColors",
      "value": {
        "foreground": "#eeeeee",
        "stroke": "#aaaaaa",
        "grid": "#444444",
        "chromosomeTick": "#999999",
        "symbolStroke": "#bbbbbb",
        "background": "#181818"
      }
    }
  ]
}
```

An authored expression parameter can compute the palette instead; it follows
the usual read-only parameter API.
Descendant views can shadow `themeColors` through normal parameter scoping.
The root canvas background continues to use the root palette.

Explicit specification and configuration colors keep their normal precedence.
Other named presets supply fixed colors that override the reactive defaults;
the `dark` preset is a fixed appearance, whereas `themeColors` supports live
switching. A root `theme` also takes precedence over an embed-level `theme`
option.

### Custom palette parameters

An authored palette can use a different name and set of fields. For example,
add the following properties to the root specification:

```json
{
  "params": [
    {
      "name": "uiColors",
      "value": {
        "foreground": "#222222",
        "stroke": "#808080",
        "grid": "#dddddd",
        "background": "#ffffff"
      }
    }
  ],
  "background": { "expr": "uiColors.background" },
  "config": {
    "text": { "color": { "expr": "uiColors.foreground" } },
    "axis": {
      "labelColor": { "expr": "uiColors.foreground" },
      "titleColor": { "expr": "uiColors.foreground" },
      "domainColor": { "expr": "uiColors.stroke" },
      "tickColor": { "expr": "uiColors.stroke" },
      "gridColor": { "expr": "uiColors.grid" }
    },
    "legend": {
      "labelColor": { "expr": "uiColors.foreground" },
      "titleColor": { "expr": "uiColors.foreground" }
    }
  }
}
```

`uiColors` is an authored parameter; its name and fields are chosen by the
specification author. The example maps selected defaults, and other colors can
reference the same palette. Explicit mark and encoding colors retain their
normal precedence.

### Canvas and view backgrounds

The root `background` controls the entire canvas, while `view.fill` and
`config.view.fill` control individual view backgrounds. An explicit root
background takes precedence over a selected preset's background, which takes
precedence over `themeColors.background`. When no background color is
configured, the canvas is transparent and exports default to white.

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

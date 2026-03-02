# Global Config, Themes, And Styles

GenomeSpy supports Vega-Lite-like defaulting with `config`, plus built-in `theme`
selection and reusable `style` buckets.

Unlike Vega-Lite, configuration is **hierarchical** in GenomeSpy: `config` and
`theme` can appear at multiple levels of the view hierarchy.

## Mental Model

Use this model when deciding which mechanism to use:

- `theme`: select a broad visual preset for a subtree
- `config`: set subtree defaults for marks, axes, scales, titles, view background, etc.
- `style`: define reusable named property buckets, then opt into them from marks/axes/title/view

### CSS Analogy (Approximate)

For visualization developers, a CSS analogy can help:

- `theme` is like choosing a base design system stylesheet
- `config` is like scoped default rules for a subtree
- `style` is like reusable class-like tokens
- explicit properties in a spec are like inline styles

Important differences from CSS:

- no selector matching
- no selector specificity
- no dynamic cascade by selector order
- precedence is fixed by GenomeSpy's config resolution order

## Built-In Theme Selection

GenomeSpy supports a hierarchical built-in `theme` selector at view scopes.
Supported built-in themes are currently:

- `genomespy` (default behavior)
- `vegalite` (best-effort Vega-Lite-like defaults for overlapping properties)
- `quartz` (best-effort port from Vega theme)
- `dark` (best-effort port from Vega theme)
- `fivethirtyeight` (best-effort port from Vega theme)
- `urbaninstitute` (best-effort port from Vega theme)

The Vega-theme-inspired presets (`quartz`, `dark`, `fivethirtyeight`, `urbaninstitute`) are applied as overrides on top of `vegalite`.
At the root scope, these themes can also provide a default canvas `background` color.
An explicit root-level `background` property still has higher precedence.

!!! note
    Selecting a theme in the spec is supported, but **defining custom named
    themes inside the spec is not yet supported**.
    For now, use built-in `theme` names and/or regular `config` + `style` objects.

You can define config in:

- the root spec (`RootSpec.config`)
- any view (`ViewSpecBase.config`)
- import sites (`ImportSpec.config`)

The closest scope wins.

## Which One Should I Use?

- Use `theme` when you want a broad, recognizable look for a whole subtree.
- Use `config` when you want to tune defaults for a specific subtree.
- Use `style` when you want reusable visual tokens (for example `axisMuted`, `trackTitle`, `cell`).

Typical pattern:

1. Choose a subtree `theme`.
2. Add subtree `config` for local policy decisions.
3. Define/apply `style` buckets for repeated visual details.
4. Use explicit mark/axis/title/view properties only for final local overrides.

## Resolution Order

For a view, config scopes are merged from farthest to nearest:

1. Internal defaults
2. Built-in theme (current-behavior theme)
3. User theme (`embed(..., { theme })`)
4. Root `spec.theme`
5. Root `spec.config`
6. Ancestor view `theme` / `config` (root to parent)
7. Import-site `theme` / `config` (if any)
8. Imported root `theme` / `config` (if any)
9. View-local `theme` / `config`

Then explicit local properties still win, for example `mark.color` or
`encoding.x.axis.tickColor`.

## Mark Defaults

Mark defaults are resolved from:

1. `config.mark`
2. `config.<markType>` (for example `config.point`)
3. implicit `config.style.<markType>` (for example `config.style.point`)
4. `config.style[...]` referenced by `mark.style` (later style names win)
5. explicit mark properties

See examples:

- `packages/core/examples/config/config-basic.json`
- `packages/core/examples/config/config-scoped-view.json`

## Axis Defaults

Axis defaults are resolved from axis buckets:

- `config.axis`
- channel buckets (`config.axisX`, `config.axisY`)
- orient buckets (`config.axisTop`, `config.axisBottom`, `config.axisLeft`, `config.axisRight`)
- type buckets (`config.axisNominal`, `config.axisOrdinal`, `config.axisQuantitative`, `config.axisIndex`, `config.axisLocus`)
- styles referenced by axis buckets (for example `config.axisX.style: "foo"`)
- `config.style[...]` referenced by `encoding.<channel>.axis.style` (later style names win)

Explicit `encoding.<channel>.axis` values override config buckets.

For shared axes/scales with conflicting sibling properties, GenomeSpy now uses
a deterministic merge order based on stable view path + channel ordering. This
removes registration-order dependence, but conflicting values still follow
"first value wins" semantics with a warning.

## Scale Defaults

Scale defaults use a similar model to Vega-Lite:

- `config.scale`
- type buckets inside `config.scale` (`nominal`, `ordinal`, `quantitative`, `index`, `locus`)
- `config.range` for channel defaults such as `shape`, `size`, and `angle`

By-type color scheme defaults can be configured with:

- `config.scale.nominalColorScheme`
- `config.scale.ordinalColorScheme`
- `config.scale.quantitativeColorScheme`

`index` and `locus` are positional data types, so they do not have color-scheme keys.

Additional scale policy notes:

- `config.scale.zoom` sets the default zoom behavior baseline.
- `config.scale.clamp` sets the default clamp baseline (for example for opacity scales).
- Named scale ranges in `encoding.<channel>.scale.range` are resolved through `config.range` (`"shape"`, `"size"`, `"angle"`, `"heatmap"`, `"ramp"`, `"diverging"`).
- Positional channels (`x`, `y`) always use unit range `[0, 1]` internally. This is an invariant and explicit/configured positional `range` values are ignored.

Example:

- `packages/core/examples/config/config-scale-schemes-by-type.json`

## Title And View Defaults

Title defaults are read from:

- `config.title`
- implicit `config.style.group-title` fallback when `title.style` is omitted
- named styles in `config.style` (for example `track-title`, `overlay`)

View background defaults are read from:

- `config.view`
- implicit `config.style.cell` fallback
- named styles in `config.style` selected with `view.style`

Explicit `title` and `view` properties override config defaults.

## Styles vs Themes

`theme` and `style` are intentionally different:

- `theme` selects a full preset configuration for a subtree.
- `style` contains fine-grained named buckets inside `config.style`.

A theme may define style buckets as part of its config. However, style buckets
remain the mechanism that mark/axis/title/view `style` references resolve to.

## Import-Specific Behavior

For imports, the import-site config is merged **before** the imported spec's own
root config. This keeps imported tracks self-contained while still allowing
context-level theming.

Examples:

- `packages/core/examples/config/config-imported-track.json`
- `packages/core/examples/config/config-import-override.json`

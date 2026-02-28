# Global Config And Themes

GenomeSpy supports a Vega-Lite-like `config` object for setting reusable defaults.

Unlike Vega-Lite, config is **hierarchical** in GenomeSpy: `config` can appear at
multiple levels of the view hierarchy.

GenomeSpy also supports a hierarchical built-in `theme` selector at view scopes.
Supported built-in themes are currently:

- `genomespy` (default behavior)
- `vegalite` (best-effort Vega-Lite-like defaults for overlapping properties)

You can define config in:

- the root spec (`RootSpec.config`)
- any view (`ViewSpecBase.config`)
- import sites (`ImportSpec.config`)

The closest scope wins.

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

## Import-Specific Behavior

For imports, the import-site config is merged **before** the imported spec's own
root config. This keeps imported tracks self-contained while still allowing
context-level theming.

Examples:

- `packages/core/examples/config/config-imported-track.json`
- `packages/core/examples/config/config-import-override.json`

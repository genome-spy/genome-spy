# Config Migration Plan

## Goal

Move hardcoded visual defaults into a structured config system that is:

- familiar to Vega-Lite users where features overlap
- flexible enough for GenomeSpy's hierarchical view and import model
- backward-compatible for existing specs by default

This branch focused on config, themes, and styles in GenomeSpy Core. It did not try to implement every Vega-Lite behavior change.

## Status

Overall status: foundational migration complete.

What is implemented:

- hierarchical `config` scopes
  - root config
  - nested view config
  - import-site config
  - imported subtree root config
- built-in themes
  - `genomespy`
  - `vegalite`
  - `quartz`
  - `dark`
  - `fivethirtyeight`
  - `urbaninstitute`
- root-level `theme` selection
- `config.style` plumbing for reusable named style buckets
- config-driven defaults for:
  - mark
  - axis
  - scale
  - title
  - view
- Vega-Lite-like quantitative color default logic using `config.range`
- named scale ranges through `config.range`
- documentation and examples
- tests for precedence and regression coverage

Current verification status:

- `npm -ws run test:tsc --if-present` passes
- `npm test` passes
- `npm run build:docs` passes

## Key Decisions

### 1. One public config object, modular internal defaults

GenomeSpy now exposes one public config model, but the internal defaults remain organized near their subsystems.

Important files:

- `packages/core/src/config/defaultConfig.js`
- `packages/core/src/config/defaults/markDefaults.js`
- `packages/core/src/config/defaults/axisDefaults.js`
- `packages/core/src/config/defaults/scaleDefaults.js`
- `packages/core/src/config/defaults/titleDefaults.js`
- `packages/core/src/config/defaults/viewDefaults.js`

### 2. Hierarchical config, nearest scope wins

Effective config is resolved from outermost to innermost scope. The closest config wins.

Order in practice:

1. internal defaults
2. built-in default theme
3. embed-level theme override
4. root `theme`
5. root `config`
6. ancestor view `config`
7. import-site `config`
8. imported root `config`
9. local view `config`
10. explicit local properties

### 3. Theme selection is root-only

Subtree theme selection was explored and then removed.

Reason:

- it made whole-visualization theming harder to control
- it blurred the distinction between theme and scoped config
- the same use cases are better handled through hierarchical `config` and `style`

### 4. GenomeSpy-specific semantics stay first-class

This migration intentionally did not try to hide GenomeSpy-specific features behind an “extension” model.

Examples:

- `index` and `locus` scale types
- genome axis properties
- import-site config
- hierarchical config resolution

## Implemented Areas

### Config surface

Implemented config buckets include:

- `view`
- `mark`
- mark-type buckets such as `point`, `rect`, `rule`, `tick`, `text`, `link`
- `axis` and specialized axis buckets
- `scale`
- `range`
- `title`
- `style`

### Themes

Built-in themes are defined in:

- `packages/core/src/config/themes.js`

Theme docs and examples:

- `docs/grammar/config.md`
- `examples/docs/grammar/config/`
- `examples/core/config/`

### Styles

Implemented style behavior includes:

- explicit `style` references for marks, axes, titles, and views
- implicit mark-type style augmentation
  - for example `config.style.point`
- implicit title style fallback
  - `group-title`
- implicit view background style model
  - `cell`
- built-in title styles
  - `group-title`
  - `track-title`
  - `overlay-title`
- compatibility alias
  - `overlay`

Note:

`config.style` is a flat namespace. Style names are global within a config scope, not partitioned by domain.

### Scale defaults

Implemented scale-related config work includes:

- type-specific scale config buckets
  - `nominal`, `ordinal`, `quantitative`, `index`, `locus`
- color scheme defaults
  - `nominalColorScheme`
  - `ordinalColorScheme`
  - `quantitativeColorScheme`
- named range resolution through `config.range`
  - `shape`
  - `size`
  - `angle`
  - `heatmap`
  - `ramp`
  - `diverging`
- Vega-Lite-like quantitative color default selection
  - `domainMid` -> `diverging`
  - rect-like heatmaps -> `heatmap`
  - other quantitative color encodings -> `ramp`

## Documentation And Examples

Primary docs:

- `docs/grammar/config.md`

Docs examples:

- `examples/docs/grammar/config/config-overview.json`
- `examples/docs/grammar/config/theme.json`
- `examples/docs/grammar/config/title-styles.json`

Core examples:

- `examples/core/config/`

## Deferred Or Out Of Scope

These were intentionally left out of this branch.

### 1. Spec-defined custom theme registries

Not implemented:

- `config.themes`
- named custom theme selection from spec scopes

Reason:

- it complicates global theming
- it overlaps conceptually with scoped config and styles
- it is not necessary for the core migration

### 2. Subtree theme selection

Not implemented.

Reason:

- rejected as a design direction during this branch
- subtree-specific appearance should come from scoped `config` and `style`

### 3. Vega-Lite-like discrete positional scale inference

Not implemented.

This includes future work such as:

- choosing between `band` and `point` for nominal/ordinal positional scales based on mark type
- merging shared `point` and `band` scale requests more like Vega-Lite
- future bar-mark-specific band padding behavior

Follow-up notes were added to:

- `packages/core/src/scales/scaleRules.js`
- `packages/core/src/scales/scalePropsResolver.js`
- `packages/core/src/scales/scaleResolution.js`
- `packages/core/src/config/defaults/scaleDefaults.js`

### 4. Future `bar` mark

Not implemented.

Expected direction:

- `bar` as a rect-backed mark with its own config bucket and style bucket
- bar-specific band padding similar to Vega-Lite
- keep `rect` and `bar` visually distinct by default

### 5. Transparent color support

Still a follow-up item.

There is already a code note about supporting CSS `transparent` more consistently in GPU rendering.

## Remaining Follow-Up Work

These are the only meaningful open items directly related to this branch.

### 1. Vega-Lite theme parity polish

The `vegalite` theme is intentionally overlap-only and best-effort.

Possible future polish:

- more fine-grained mark defaults where GenomeSpy supports them
- more exact guide/title/view defaults where useful
- parity review against Vega-Lite defaults as GenomeSpy gains new marks

### 2. Minor docs cleanup outside config

The docs build still reports an unrelated warning:

- `docs/grammar/scale.md` links to a missing anchor in `docs/api.md`

This does not block the config migration, but it is still worth cleaning up.

### 3. Opportunistic hardcoded-default cleanup

If later work touches visual defaulting paths, continue moving ad hoc visual constants into config/style where practical.

Keep runtime invariants out of style/config when they are not visual policy.

## Files To Start From Later

If this work is resumed, these are the main entry points.

Config resolution:

- `packages/core/src/config/resolveConfig.js`
- `packages/core/src/config/defaultConfig.js`
- `packages/core/src/config/mergeConfig.js`
- `packages/core/src/config/themes.js`

Domain-specific config helpers:

- `packages/core/src/config/markConfig.js`
- `packages/core/src/config/axisConfig.js`
- `packages/core/src/config/scaleConfig.js`
- `packages/core/src/config/titleConfig.js`
- `packages/core/src/config/viewConfig.js`

Scale follow-up:

- `packages/core/src/scales/scaleRules.js`
- `packages/core/src/scales/scalePropsResolver.js`
- `packages/core/src/scales/scaleResolution.js`

Docs and schema:

- `docs/grammar/config.md`
- `packages/core/src/spec/config.d.ts`
- `utils/markdown_extension/extension/extension.py`

## Acceptance Summary

This migration should be considered complete for its intended scope when the following remain true:

- existing specs render as before unless they opt into new config/theme/style features
- users can define broad defaults with `theme`, scoped defaults with `config`, and reusable named buckets with `config.style`
- imported and nested views resolve config predictably
- supported overlapping features feel familiar to Vega-Lite users
- GenomeSpy-specific semantics remain part of the same model

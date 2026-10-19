# Reactive appearance and automatic default colors

Status: complete. The reactive foundation, automatic CSS-backed Core appearance,
and four-mode embedding example are implemented and verified.

## Goals and contracts

- An ordinary browser embed follows browser light/dark preference immediately
  and after initialization, with no palette setup by its caller.
- The default canvas remains transparent in **both** modes. Existing export
  fallback remains white. Only an explicitly supplied background changes that.
- Polling is forbidden: no timers, recurring animation callbacks, per-render
  CSS reads, or document-wide subtree observation for appearance detection.
- The default theme consumes `defaultThemeColors`, renamed from the unreleased
  `themeColors` contract. Rename the public type/module/helpers consistently;
  retain no compatibility alias. Other themes may reference it explicitly, but
  automatic background fallback applies only to the default theme; named presets such as `vegalite` and `dark` keep their fixed colors.
- CSS custom properties customize individual roles. Public properties are
  `--genome-spy-foreground`, `--genome-spy-stroke`, `--genome-spy-grid`,
  `--genome-spy-chromosome-tick`, `--genome-spy-symbol-stroke`, and
  `--genome-spy-background`. Inherited overrides must work; local library
  declarations must not mask values set on a host ancestor.
- CSS `color-scheme` on the container or inherited from its host can force light
  or dark. With the normal/unset scheme, GenomeSpy follows browser preference.
  Scoped stylesheet defaults use `light-dark()`; a non-rendering probe resolves
  these and authored `var()` colors into renderer-compatible RGB strings.
- The five neutral defaults preserve the existing light appearance. Dark values
  match the existing example's neutral roles. Background defaults to transparent,
  normalized to the palette's existing `null` sentinel rather than introducing
  an opaque fill. Explicit root/export backgrounds retain precedence.
- An explicitly authored root `defaultThemeColors` declaration opts out of CSS
  ownership, including expression declarations. Descendant lexical shadows
  remain unchanged. Manual writes to the automatic parameter last until the next
  CSS refresh; callers needing exclusive control author the declaration.
- Headless rendering retains deterministic light defaults and no browser APIs.
- Palette publication uses the existing parameter graph and renderer paths;
  preserve zoom, selections, data palettes, and draw-scoped Canvas caching.

## Existing foundation

Implemented on `codex/dark-mode`: live guide/legend/background color expressions,
source-scoped legend bindings, initialized palette validation, default-theme
neutral roles, reactive selection-brush outlines through `selection-brush`, and
Canvas evaluation caching for a synchronous mark draw. Fixed presets keep their
colors. Root background readers serve rendering and all export backends.

Baseline verification: 539 test files, 5,110 tests passing (one skip, two todos),
workspace types, lint, schema/docs builds, and browser checks. Core JavaScript
against master `b34836e8319e844ccecbc713e4f4fb6b3403575f`: +438/-125 non-comment
production lines, net +313. The current example contains 198 source lines.
No shader, GPU attribute, or texture was added. No timing speedup is claimed.

## Architecture and event ownership

The browser bridge belongs beside `genomeSpy/containerUi.js`, owned by
`GenomeSpyBase` initialization/destruction. `ViewFactory` continues to supply the
ordinary root declaration before wrapping and guide creation. After hierarchy
preparation, seed the browser-resolved value before dataflow initialization and
the first rendered frame; refresh after asynchronous startup as needed through
normal event delivery. Headless bootstrap remains DOM-independent.

Use one hidden probe subtree, with role-specific color properties resolving
stylesheet defaults and optional public overrides. If the container's computed
`color-scheme` is `normal`, the probe uses `light dark`; otherwise it inherits
the host scheme. Read concrete computed colors, normalize them with the existing
color parser, compare all six roles, and publish only a changed complete object. Accept resolved
named/hex/RGB/HSL colors supported by the existing parser; reject unsupported
computed CSS Color 4 syntax with a clear error rather than adding conversion
machinery. Track factory-created declarations with a WeakSet so imported roots
and implicit wrappers preserve authored ownership.

Subscribe to the browser's `prefers-color-scheme` change event. A
`MutationObserver` observes attributes on the container and each composed
ancestor individually, without `subtree`; this covers host class, style, and
attribute toggles without watching the visualization DOM. No polling or
observation of every stylesheet. A public `api.refreshStyles()` performs the
same synchronous refresh after stylesheet replacement or changes outside that
observation boundary. Finalization disconnects the observer, media listener,
and probe before disposing the parameter runtime. Async observer/media errors
use Core's existing runtime error reporter. Refresh after finalization rejects.
Embeds are initialized in their intended DOM location; automatic reparenting
support is outside scope.

## Design evidence and alternatives

- CSS `color-scheme` plus `light-dark()` supplies mode selection without a new
  theme-selection system: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/light-dark
- ECharts likewise separates explicit themes from runtime switching driven by
  browser preference: https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/
- MutationObserver observes DOM changes, not arbitrary computed-style changes:
  https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
- No code is copied or closely adapted from these projects.
- Keeping the entire CSS bridge in each embedder was discarded because it
  prevents automatic behavior and duplicates palette conversion and lifecycle.
- A general live theme/config replacement API and arbitrary stylesheet tracking
  remain outside scope. Lifetime-constant parameters remain a separate issue:
  https://github.com/genome-spy/genome-spy/issues/585

## Milestones and review gates

### 1. Automatic CSS-backed default appearance

- [x] Review this plan with an independent subagent, including App/Core embeds,
      lifecycle, scoped CSS inheritance, transparent export behavior, and SLOC.
- [x] Rename the palette contract, add scoped CSS defaults and the browser
      bridge, and expose `refreshStyles()` through common Core/App embed APIs.
- [x] Keep authored palette ownership and headless behavior explicit; ensure
      named presets remain fixed even as CSS changes the automatic palette.
- [x] Update the existing changeset and palette/API documentation.
- [x] Verify focused headless contracts and browser-only integration behavior:
      OS changes, ancestor/local attribute toggles, CSS overrides and refresh,
      inherited/forced schemes, transparent background, explicit overrides,
      separate embeds, finalization, and no repeated reads on ordinary draws.

Tentative commit: `feat(core): follow CSS and browser appearance automatically`.

### 2. A clear four-mode embedding example and integration verification

- [x] Replace manual palette wiring with plain `embed`; keep useful comments.
- [x] Offer System, Light, Dark, and Custom. The custom option applies a warm
      cream/brown CSS palette to demonstrate individual property overrides.
      Default modes leave the canvas transparent; the page supplies its surface.
- [x] Remove stale claims and retain zoom/brush instructions. Do not add export
      controls, persistence settings, pagehide cleanup, or unrelated features.
- [x] Verify initial/repeated switches with a zoomed domain and active brush on
      the same canvas, browser preference changes, and custom CSS overrides.
- [x] Run appropriate regression suites, all workspace types, lint, schema/docs,
      example build, and release checks. Measure final production SLOC and update
      this plan with outcomes. No quantitative CPU/GPU speedup claim.

Tentative commit: `feat(embed-examples): demonstrate automatic and custom appearance`.

## Risks and acceptance boundaries

The browser is the authority for resolving CSS colors; normalize supported RGB
results before sending values into renderers. Independent review accepted the
architecture; its ownership, color compatibility, named-background precedence,
and failure-cleanup findings are incorporated above. Browser tests must use the actual
scoped stylesheet and embed path, not mocked CSS resolution. Preserve local and
inherited custom properties and avoid self-triggering observer feedback.
Changes outside browser preference events and the observed ancestor attributes
need `refreshStyles()`; this boundary must be documented. No permanent work runs
between appearance events. Test the common App API and launch failure cleanup,
not only successful Core examples. Temporary plan files must be reconciled and
retired before PR creation, as required by repository workflow.

## Automatic appearance milestone outcome

The bridge is 104 source lines, including comments, with six probe swatches,
one preference listener, and one observer of ancestor attributes. Browser
coverage passes on Canvas, WebGL, and WebGPU using the real stylesheet. It
verifies zero CSS reads and zero palette publications during an ordinary
parameter-driven draw, alongside ownership, mode/override, export, interaction,
and failure/finalization contracts. No shader or GPU resource changes were made.

The final full unit suite passes 539 files and 5,119 tests (one existing skip
and two todos), including the font readiness regression. All
workspace types, lint, schema and API docs generation, docs build, example build,
and release checks pass. The existing release group remains a minor update.

Browser failure testing exposed an early WebGL default-font rejection after
aborted startup. The font manager now marks the pending promise handled while
preserving its original rejection for readiness callers. The App's existing
light UI explicitly declares `color-scheme: light` so the transparent Core plot
matches its surface; a real App embed verifies light colors under a dark host
and the shared `refreshStyles()` API. Full App dark UI styling remains outside
scope.

## Four-mode example and final outcome

The example uses plain `embed(container, plotSpec)`. Its 33-line JavaScript only
connects the host selector and status label; Core owns palette initialization
and subsequent updates. CSS supplies System/Light/Dark page surfaces and a
cream/brown Custom appearance through inherited public overrides. The default
canvas remains transparent in every example mode.

A browser run exercised the actual example with real wheel zooming and
Shift-drag brushing, repeated switches through all four modes, and browser
preference changes. Canvas identity, point geometry and data colors, and the
active selection remain unchanged. The example production build, workspace
types, lint, schema/API docs generation, clean docs build, and release checks
pass. The repeatable Core browser command is
`npm -w @genome-spy/core run test:appearance` (Canvas, WebGL, WebGPU).

Final Core runtime JavaScript against local master
`b34836e8319e844ccecbc713e4f4fb6b3403575f`: +575/-125 non-comment production
lines, net +450, excluding tests and declarations. This revision adds net 137
Core production lines over the prior branch milestone. The complete example
contains 166 source lines across HTML, JavaScript, and SCSS, down from 198.
The additional CSS resolution and comparison runs only on supported appearance
events or explicit refresh; ordinary rendering adds no CSS reads. GPU shaders,
attributes, textures, and draw behavior are unchanged. No timing speedup is
claimed.

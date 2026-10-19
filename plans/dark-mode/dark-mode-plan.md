# Reactive appearance and dark mode

Status: investigation and proposal; implementation has not started.

## Recommendation

Use GenomeSpy's existing parameter and expression runtime for appearance colors.
Keep browser preference detection and application theme policy in the embedding
application. CSS custom properties can supply the colors, with a small JavaScript
bridge publishing a complete palette into one object-valued parameter.

First complete the public color-expression contract, including the root canvas
background. A custom theme can then use an ordinary authored root parameter with
no new runtime API. For convenient adjustment of the default GenomeSpy appearance,
make its neutral defaults consume a documented, initialized root palette parameter.
Do not introduce a general mutable theme/configuration system for this feature.

The proposed default parameter name is `themeColors`; it is tentative until the
public naming and collision policy is reviewed. Examples below distinguish
existing mechanisms from proposed grammar and default-theme behavior.

## Goals and non-goals

- An initialized visualization changes appearance when its host publishes new
  colors, without re-embedding, reloading data, or resetting navigation/selections.
- The host can follow `prefers-color-scheme`, an application override, or CSS
  properties scoped to each visualization container.
- Ordinary marks, titles/subtitles, axes, chromosome guides, legends, view
  decorations, and canvas/export backgrounds use the same settled colors.
- Explicit spec/config/encoding colors keep their existing precedence. Data
  palettes are unchanged unless the author deliberately parameterizes them.
- Preserve the existing initial light appearance and transparent-screen/white-export
  defaults when appearance adaptation is not configured.
- Canvas2D evaluates a palette color once per synchronous mark draw and reuses it
  across that draw's instances, while observing new values on subsequent draws.

Full App dark-mode styling, automatic recoloring of arbitrary data palettes,
arbitrary live config replacement, CSS Color 4 support, color transitions, and
observing every possible stylesheet change are outside the initial scope.
Lifetime-constant parameter declarations are a separate optimization tracked in
[#585](https://github.com/genome-spy/genome-spy/issues/585); draw-scoped caching
must also work with the mutable palette used for live dark-mode switching.

## Current implementation

### Config is assembled once, but expression values can remain live

`packages/core/src/genomeSpyBase.js` assembles base config in `#createViewContext()`.
The order is internal defaults, default GenomeSpy theme, embed `options.theme`,
and root `spec.theme`. Root/subtree config and component-specific styles then
participate in the existing resolution rules. `options.theme` is a config object;
`spec.theme` selects built-in presets. Neither is a live theme setter.

`packages/core/src/config/themes.js` and `config/defaults/` contain literal neutral
colors. Config merging does not inherently prevent reactivity: mark config values
become encoding values, and `ExprRef` objects survive that conversion.

`MarkPropsBase`/fill/stroke properties and title colors already support expressions.
WebGL binds uniform color expressions and updates their values without rebuilding
data buffers or shaders. Canvas2D/SVG use live CPU encoders. The experimental WebGPU
adapter observes semantic mark revisions. Scale range entries can also be
expressions; there is no need for a second palette propagation mechanism.

Relevant files:

- `packages/core/src/config/markConfig.js`
- `packages/core/src/marks/mark.js`, especially `initializeEncoders()`
- `packages/core/src/rendering/webgl/marks/webGlMark.js`
- `packages/core/src/rendering/canvas2d/canvas2DViewRenderingContext.js`
- `packages/core/src/rendering/svg/svgAttributes.js`
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`

### Most guide colors are already forwarded to ordinary marks

Axis/domain/tick/label colors in `view/axisView.js`, grid colors in
`view/axisGridView.js`, title colors in `view/titleView.js`, legend colors in
`view/legendView.js`, and view fill/stroke in `view/gridView/gridChild.js` mostly
pass directly into generated marks.

However, `spec/axis.d.ts`, `spec/legend.d.ts`, and `spec/decoration.d.ts` declare many
of these colors as strings only. Widening them to `string | ExprRef` and updating
the schema should expose much of the existing mechanism, but legends also need
a runtime fix. `view/gridView/gridChildLegends.js:resolveLegendProps()` activates
every top-level expression into scalar getters before constructing the legend.
Generated marks copy the initial paint values, while the change callback only
handles `disable`. Consequently legend title/label/symbol colors remain stale.
Keep paint expressions live separately from existing legend
layout/orientation/disable handling. Their evaluation scope also matters:
`resolveLegendProps()` uses `definition.view.paramRuntime`, while generated legend
internals force local `width`/`height` parameters in `legendView.js`. Forwarding raw
expressions would make source-view layout references observe legend dimensions.
Reuse `ViewParamRuntime.registerScopedExpression()` to preserve the source scope
and existing lifecycle ownership.

There is a second legend boundary in `gridChildLegends.js`:
`createInheritedSymbolStyle()` and `applyConstantMarkColorStyle()` inherit source
mark `color`/`fill`/`stroke` only when they are literal strings. Converting neutral
mark defaults to expressions would drop those colors from size legends, causing
rule/link symbols to use the base legend stroke instead of the source foreground.
Preserve expression-valued source styling and its original runtime as well as
expressions authored directly on the legend.

Transparent legend base colors also have a literal special case, and decorations
are created based on their initial configured presence. Initial support should
use concrete opaque colors and existing opacity properties; changing palette
values must not require adding/removing generated views.

### Root canvas background is a genuine runtime gap

`spec/root.d.ts` accepts a literal background string.
`genomeSpy/canvasBackground.js` reads that string or static built-in theme
backgrounds. `genomeSpyBase.js` supplies this separately to live rendering and
exports; it is not part of ordinary generated mark styling.

WebGL additionally captures the clear color while computing layout in
`rendering/webgl/renderCoordinator.js`. A new getter value plus a render request
alone is insufficient unless that cached clear-color path is updated. Canvas2D
and WebGPU consult their background getter during rendering.

The screen is transparent by default, while `getExportBackground()` falls back
to white. Light text over a CSS-only dark canvas surface would therefore export
onto white unless the exporter receives an explicit dark background.

### Parameter ingress already exists

`api.params.get("uiColors").setValue(nextPalette)` uses the authored top-level
scope. Object-valued parameters and lexical inheritance already work. Replace
the object rather than mutating its fields: one write publishes one coherent
palette and avoids needing a new public batch API.

Parameters must be registered declarations to appear through this namespace
(`paramRuntime/embedParamApi.js`). Allocating an internal setter alone does not
provide the public capability. `view/viewFactory.js` also wraps some root specs;
the authored top-level scope can be a child of `implicitRoot`.

Appearance is environment state: declare palette parameters with `persist: false`
so App provenance/bookmarks do not restore an old host appearance.

### The static dark preset has incomplete coverage

The preset inherits black `group-title`/`group-subtitle` styles and legend title
colors from the Vega-Lite base. Title styles can override its white `title.color`.
Chromosome label defaults remain black, as do default links and the
`arrow-transcript` style. These must be included in the color audit; changing
only `config.text.color` and ordinary axis labels is insufficient.

### Investigation verification

Two temporary Vitest tests using the real headless engine and SVG export passed,
and were removed after investigation. They confirmed that replacing one palette
after initialization changes plain text, axis labels/title/domain/grid, view
title/subtitle, and view background fill/stroke. They also confirmed that legend
title/labels/symbol stroke/opacity remain at their initial expression values, and
that the dark preset's group title renders black. GPU/browser behavior above is
based on source inspection; no browser smoke test was performed for this proposal.

## Solution options

| Option                                            | Benefits                                                                                                          | Costs and limits                                                                                                                         | Assessment                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Authored root palette plus config expressions     | Uses current parameter API; host controls policy; smallest implementation                                         | Author/embedding helper supplies palette declaration and complete config mapping; public color types and root background need completion | Implement the underlying contract first                                |
| Default semantic palette parameter                | Default appearance becomes adjustable through one existing parameter handle; specs need no repeated theme mapping | Requires explicit initialization, naming, overriding, persistence, and root-scope policy                                                 | Recommended convenience after the contract works                       |
| General `config.params`, like Vega config signals | Self-contained custom themes can declare arbitrary reactive defaults                                              | New grammar, name-based merge rules, root ownership, and collision contracts                                                             | Defer unless independently needed                                      |
| CSS values directly in every color property       | Attractive author syntax, such as `var(--gs-foreground)`                                                          | GPU parsers lack DOM/CSS context; needs resolution, invalidation, and export policy across backends                                      | Avoid for initial implementation                                       |
| Replace/reinitialize the theme or visualization   | Reuses static presets                                                                                             | Rebuilding can reset interaction state and repeat initialization/data work; changing `spec.theme` also changes sizing/fonts/styles       | Fallback for hosts already rebuilding, unsuitable as the main solution |

CSS filters/inversion would also change data colors and cannot express a deliberate
neutral palette; they do not satisfy the goal.

## Proposed contracts

### 1. Complete expression support at the existing boundaries

Allow expressions on the color properties of axes, chromosome guides, legends,
and view decoration fills/strokes/shadows, following mark/title conventions.
Bind them through the generated marks that already own their lifecycle.
Fix both legend paint paths in `gridChildLegends.js`: legend property resolution
and inherited source-mark colors. Bind expressions in their original source
runtime through the existing scoped-expression mechanism before generated marks
consume them: legend properties use `definition.view.paramRuntime`, while inherited
mark styles use the contributing `sourceView.paramRuntime` selected by existing
scale-member ordering. These owners can differ for collected legends.
Generated views own the derived bindings and dispose them normally;
their local `width`/`height` must not change the expression's meaning. Keep explicit
legend overrides, filled/unfilled mapping, conflicting-color-scale neutralization,
and scale-driven symbol channels authoritative. Also cover the
currently runtime-accepted expression-valued symbol opacity; its public type is
still number-only.

Allow `RootSpec.background` to be a color expression. Evaluate it in the authored
root parameter scope and share the resolved current value between screen rendering
and raster/SVG exports. An explicit root expression resolving to null overrides
preset/palette backgrounds for a transparent screen; exports still use the existing
white fallback unless export `options.background` is explicitly null. Preserve
static named-theme background precedence when no explicit root background is given.

For the default palette convenience, a configured opaque palette background is
also eligible as the default canvas/export background; an explicit root background
or selected preset background still wins. A null palette background preserves
legacy behavior. This precedence must be implemented in one resolution path.

### 2. Default neutral palette

Use semantic roles such as foreground, secondary foreground, stroke, grid,
border, and background. Finalize the exact role list by auditing existing shades:
do not collapse distinct chromosome/symbol strokes just to reduce the key count.
The background role is nullable; mark color roles remain concrete opaque colors.

Map ordinary text/rules/links, guide labels/titles/strokes, title styles, and
relevant built-in mark styles to these roles. Do not turn the default blue mark
color, genomic/data categories, or sequential/diverging scales into neutral colors.
Absent view fills/strokes remain absent; a palette does not create new decorations.
Rule/link size legends must inherit the expression-valued foreground at initial
render and after palette updates, preserving the current source-style precedence.

Initialize one ordinary configured declaration in the authored top-level scope,
before guides or marks bind expressions. Prepare this declaration before the
factory constructs the authored root and its optional wrapper; looking up the
completed top-level view afterward is too late. The default is ephemeral. Merge this
single built-in default with authored root declarations before registration: an
explicit same-named declaration replaces the default once. Descendant shadowing
follows normal lexical rules. A user-computed palette is read-only through the API,
as other computed parameters are today. An authored replacement supplies the full
palette rather than implicitly merging object fields. Do not register inherited defaults in
every view or introduce a separate reactive store.

Existing named presets retain their literal color choices unless deliberately
converted. Document that explicit preset/config colors override the reactive
default, including the existing precedence of `spec.theme` over `options.theme`.
Repair the dark preset's inherited black colors as part of its deliberate audit;
converting every branded preset into light/dark variants is separate work.

### 3. Canvas2D draw-scoped color evaluation

Extend the existing rectangle fill/stroke hoisting pattern to palette-backed
colors in the other Canvas2D painters under `rendering/canvas2d/renderers/`.
Initially cover literals and direct reads of settled palette parameters, including
scoped aliases. Evaluate eligible colors and convert them to paint strings once
before the instance loop, then reuse the values. Use the final
`encoder.constant` metadata to distinguish datum-independent encoders from
data-dependent and conditional selection encoders; inspecting an individual
constant branch is insufficient.

Keep snapshots local to one synchronous painter invocation. Each facet occurrence
or order pass gets its own snapshot, and the next draw reads current parameter
and scale values again. Existing invalidation schedules the next repaint; no
persistent cache, additional listeners, or cross-frame invalidation machinery is
needed. Skip evaluation for empty draw ranges. Reuse current paint-style caching
to avoid assigning identical Canvas fill/stroke styles repeatedly.

`encoder.constant` describes datum independence, not purity. Palette-field lookups
are safe to hoist. Volatile expressions such as `random()`/`now()`, and expressions
with uncertain repeatability, retain their existing evaluation path. This change
does not require general purity analysis or change volatile-expression semantics.
Data-dependent colors, conditional selections, and per-instance opacity/fading
remain live.

This changes palette evaluation cost from once per visible instance to once per
eligible color per draw. Normal painting still visits visible instances. GPU
rendering and lifetime-constant parameter support are unaffected.

### 4. Host CSS/browser bridge

This illustrates the proposed default palette interface; it is not available today.
The initial documented hook vocabulary should match the finalized palette fields.

```css
.genomespy-host {
  --gs-foreground: #000;
  --gs-secondary-foreground: #333;
  --gs-stroke: #808080;
  --gs-grid: #d3d3d3;
  --gs-border: #ddd;
  --gs-background: #fff;
}

@media (prefers-color-scheme: dark) {
  .genomespy-host {
    --gs-foreground: #eee;
    --gs-secondary-foreground: #bbb;
    --gs-stroke: #aaa;
    --gs-grid: #444;
    --gs-border: #666;
    --gs-background: #181818;
  }
}
```

```js
// Proposed built-in declaration. An authored uiColors parameter can use the
// same existing API once its config expressions are supplied explicitly.
const colors = api.params.get("themeColors");
const preference = matchMedia("(prefers-color-scheme: dark)");

function syncColors() {
  const css = getComputedStyle(container);
  const read = (name) => css.getPropertyValue("--gs-" + name).trim();
  colors.setValue({
    foreground: read("foreground"),
    secondaryForeground: read("secondary-foreground"),
    stroke: read("stroke"),
    grid: read("grid"),
    border: read("border"),
    background: read("background"),
  });
}

preference.addEventListener("change", syncColors);
syncColors();

// The host also calls syncColors() after its explicit theme toggle.
// During teardown, remove the listener before api.finalize().
```

Read the initial CSS palette before embedding and use it as the root declaration's
initial value when avoiding a light first frame matters. Re-read after embedding
when connecting the listener so a change during initialization is not missed.
Only fully specified palettes are published; missing/invalid CSS is an embedding
boundary error, not a silent renderer fallback.

Start with hex, named colors, or legacy RGB syntax supported by GenomeSpy's color
parsers. Raw custom-property text can still contain `light-dark()`, `currentColor`,
or other unresolved/contextual values. `getComputedStyle(...).getPropertyValue()`
does not guarantee a parser-compatible color, and even computed color properties
can serialize modern color spaces. A general CSS color normalization service is
separate scope.

`matchMedia` handles browser/OS preference changes. Hosts with explicit theme
selection call the same synchronization function themselves; their CSS can use
classes or data attributes to give that selection precedence. There is no general
computed-style-change event. Avoid polling and a document-wide MutationObserver.

An embedding helper can package this recipe if repetition warrants it. Core does
not need a media observer or automatic policy. React's `onEmbed` and doc embeds'
connect/disconnect lifecycle provide suitable integration points. Inherited custom
properties also cross doc embeds' shadow boundary.

### 5. Required embedding example

Add a dedicated example under `packages/embed-examples/src/darkMode/`, following
the package's page/module/style conventions. Link it from `src/index.html` and
register its page in `vite.config.js` so the package smoke build includes it.

Provide visible Light, Dark, and System controls and show the resolved mode.
Explicit Light/Dark selection overrides the OS preference and always works on
the same initialized embed; System follows preference changes automatically.
Use CSS custom properties and the public palette API for both paths, with
listener cleanup and initial values that avoid flashing the wrong appearance.

Use inline data so an external dataset cannot prevent the demonstration. Include
representative titles, ordinary/chromosome guides, legends, rule/link symbols,
and view/canvas backgrounds, alongside stable data colors and an explicit
annotation color. Style the host controls and surface for both modes. Include
zoom and selection interactions so switching modes visibly preserves state.

## Comparable designs and browser references

- [Vega configuration signals](https://vega.github.io/vega/docs/config/#signals)
  demonstrate reactive style variables declared alongside configuration. Its
  [View API](https://vega.github.io/vega/docs/api/view/#view_signal) updates signals,
  and its background can also be signal-driven. This supports reusing GenomeSpy's
  existing expression model rather than adding a second theming runtime.
- [Chart.js color defaults](https://www.chartjs.org/docs/latest/general/colors.html)
  distinguish text, borders, and backgrounds. [Apache ECharts themes](https://echarts.apache.org/handbook/en/concepts/style/)
  illustrate initialization-time presets, a different concern from live palette
  ingress.
- [MediaQueryList change events](https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/change_event)
  provide browser preference notifications. [Computed styles](https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle)
  expose CSS values, including their color serialization limitations.

These are design comparisons. No external implementation code is copied or
closely adapted, so there is no new third-party code/license dependency.

## Milestones and review gates

1. **Complete reactive color and background support.** Update the relevant Core
   spec types/schema, guide/decoration consumers where necessary, and one shared
   resolved background path. Preserve legend-property and inherited source-style
   expressions in their original scopes. Synchronize WebGL's cached clear color.
   Hoist eligible Canvas2D palette colors once per draw using local snapshots,
   retaining data/selection-dependent paths and refreshing on every invocation.
   Verify an authored palette through real generated guides, Canvas2D/SVG, WebGL, and the
   WebGPU adapter. Cover explicit background/export overrides and transparent
   defaults. Document color expressions and the authored-palette recipe; add the
   appropriate Core changeset. Tentative commit:
   `feat(core): support reactive guide and canvas background colors`.

2. **Expose reactive default neutral colors.** Register the single root declaration,
   map default colors/styles, and audit the dark preset. Verify wrapped unit/layer
   roots and concat roots, existing precedence, explicit palette declarations,
   descendant shadowing, unchanged authored/data colors, ephemeral state, and
   rule/link size legends matching their source marks before and after updates.
   Document the palette API and collision policy; add/update the Core changeset.
   Tentative commit: `feat(core): expose a reactive default theme palette`.

3. **Deliver the light/dark embedding example.** Add the required `darkMode` page,
   module, and styles to `packages/embed-examples`, its catalog, and Vite inputs.
   Demonstrate explicit Light/Dark overrides and System mode on one initialized
   visualization, with CSS hooks, listener teardown, and correct initial values.
   Connect documentation embeds to the site's actual theme-toggle mechanism if
   desired; keep full App restyling separate. Verify two containers with different
   palettes and reconnect/unmount behavior. Run the package's `build:smoke` and
   `test:tsc` checks, document the browser/CSS contract, and record release impact
   for changed integration packages as appropriate. Tentative commit:
   `feat(embed-examples): demonstrate automatic dark mode`.

Review the shared grammar/background contract after milestone 1, and the public
palette/root-scope policy in milestone 2. Combine the embedding example review
with final integration; avoid separate review gates for routine documentation.

## Verification and acceptance criteria

- A focused headless spec exercises text, title/subtitle, ordinary/locus axes,
  grids, categorical/gradient legends, a view fill/stroke, and neutral mark styles.
  Publish one new palette, await propagation, and assert representative emitted
  SVG colors. Keep assertions about visible behavior rather than generated shape.
- For local and collected legends, use paint expressions referencing source-view
  `width`/`height` and palettes with different values in legend-definition and
  contributing-mark scopes. Give generated legend internals different dimensions
  and verify both property and inherited-style expressions retain their source.
  Include title, label, symbol, and runtime-accepted symbol-opacity consumers.
- Extend the existing rule/link size-legend cases in `gridViewLegend.test.js` with
  reactive source `color`, and add a point size legend with reactive `fill`/`stroke`.
  Check initial appearance and palette updates, filled/unfilled mapping, explicit
  legend overrides, and preservation of scale-driven channels and neutralization.
- Extend `canvas2DViewRenderingContext.test.js`'s existing constant-encoder cases
  to cover palette colors in the additional painters. Verify one evaluation per
  eligible color per nonempty draw, correct first/last drawn colors, and fresh
  values after changing the palette and repainting. Cover facets/order passes,
  data-dependent colors, selection-conditional colors, and volatile expressions
  that retain per-instance evaluation. Prefer representative cases over a new
  painter-by-property test matrix.
- Preserve a representative explicit red annotation and data color scale while
  changing the neutral palette. Preserve default light appearance and preset/config
  precedence; include regressions for the dark preset's black text inheritance.
- A browser test changes preference after initialization and verifies live text,
  guides, and canvas background on WebGL and Canvas2D, plus WebGPU where available.
  Verify the next frame, subsequent zoom/pan, and SVG/PNG export after the change.
- Use representative real specs such as `examples/docs/grammar/config/theme.json`
  and a chromosome-axis example selected from the current examples. Retain zoom
  domain, selections, and loaded data across switches; check a docs embed as well
  as the standalone host.
- Test custom CSS/theme toggles separately from preference changes. Unmount/finalize
  removes host listeners, and multiple embeds do not share mutable palette state.
- Browser-smoke the new `embed-examples` page with both light and dark emulated OS
  preferences. Repeatedly select Light → Dark → Light without re-embedding, verify
  current guide/legend/background colors, and compare zoom domains and selections
  before and after. Check System mode responds to a subsequent preference change,
  while an explicit override remains authoritative. Verify exports in both modes
  and navigation from the built example catalog.
- Run focused Vitest suites with `--reporter=agent`, relevant TypeScript/schema
  checks, and browser smoke checks. Use `test-genomespy-views`,
  `debug-genomespy-web`, `write-genomespy-docs`, and `write-genomespy-changeset` for
  the corresponding implementation work. Full tests are appropriate once shared
  root/background/default contracts change.

## Risks and questions to resolve before implementation

- Final public palette name and treatment of existing same-named user parameters.
  Do not accidentally override an unrelated parameter or make anonymous internal
  parameters public. Validate the chosen root declaration before consumers bind.
- The exact small role vocabulary and whether milestone 2 is wanted immediately
  or the authored-palette solution is sufficient for the first release. The
  recommendation is to include the default convenience after milestone 1 proves
  the contract, while deferring general `config.params`.
- How many named presets to convert deliberately. Preserving their current
  identity is the default; an OS mode does not implicitly switch to `theme: dark`.
- Neutral-token colors do not guarantee readable user-authored data palettes.
  Adapting those is a separate author decision, using existing range expressions.
- Core tooltips/loading messages contain light CSS colors. Give those UI elements
  appropriate custom properties in the host integration work if they are included
  in the advertised dark-mode experience; full App CSS remains separate.

Before PR delivery, reconcile completed/discarded tasks and retire this temporary
plan according to the repository workflow.

# GenomeSpy Inspector Plan

Issue: <https://github.com/genome-spy/genome-spy/issues/420>

## Goal

Build a DevTools-like inspector for debugging GenomeSpy view hierarchies,
resolution wiring, reactive parameters, encodings, marks, layout, and dataflow.
The first implementation should be an opt-in App development tool. Playground
integration should follow once the App plugin shape is stable, and direct Core
embed integration should come last. The final design should still be usable
from Core, App, and Playground without increasing the default runtime bundle.

The inspector should feel like browser DevTools: a tree on the left, selected
object details on the right, search and filters at the top, and cross-links
between the hierarchy, resolutions, params, and dataflow.

## Requirements From Issue 420

- Provide a package or module available in Core, App, and Playground.
- Integrate with App first, Playground second, and direct Core embed last.
- Use `LitElement` for web components.
- Show the view hierarchy in a DOM-inspector style tree.
- Inspect encodings, scale/axis/legend resolutions, reactive parameters, and
  dataflow.
- Show which views and channels participate in each resolution.
- Eventually replace the current App dataflow inspector.
- For unit views, show mark props and related mark state.
- Support two hierarchy modes:
  - user-authored views only
  - all views, including implicit chrome such as axes, legends, titles, grid
    children, and guide containers
- Keep the tool allowed to be heavy because it is opt-in.

## User Workflows

### Inspect Why A View Looks Wrong

1. Open the inspector from the App toolbar. Later versions can expose the same
   inspector from Playground and Core embed hosts.
2. Select a view from the tree or click a view on the canvas in inspect mode.
3. Read the selected view's effective encodings, mark type, visible state,
   layout bounds, data initialization state, and contributing params.
4. Hover tree nodes to highlight the matching canvas area.
5. Copy the view selector or path for use in tests, specs, or debugging notes.

### Debug Resolution Sharing

1. Open the Resolutions panel.
2. Select channel `x`, `color`, `shape`, etc.
3. See each scale, axis, and legend resolution with its name, host view, type,
   current domain, range, zoomability, and members.
4. Select a resolution to highlight all participating views in the tree.
5. Select a member to jump to the owning view and channel.

### Debug Missing Data

1. Open the Dataflow panel.
2. Inspect data sources, transforms, collectors, propagated counts, completion
   state, and the first propagated datum preview.
3. Select a flow node to see its owning view, parameters, domain-sensitive scale
   channels, and downstream collectors.
4. Jump from a collector to the view that consumes it.

### Debug Parameters And Expressions

1. Select a view and open the Params tab.
2. See local parameter declarations, local runtime values, inherited values,
   selection params, layout params, and derived expression params.
3. Identify shadowing and `push: "outer"` behavior.
4. Subscribe to value changes while the panel is open and show a small change
   indicator.

## UI Design

Use a dockable side panel by default. App should use `AppUiRegistry` side
panels in the initial version. Later Playground and Core hosts can render the
same element into a right dock or a floating panel.

```
+ GenomeSpy DevTools -------------------------------------------------------+
| [Elements] [Resolutions] [Dataflow] [Params] [Events]    refresh auto  x  |
+-------------------------------+------------------------------------------+
| Search views/channels/params  | View: root/tracks/cnv                    |
| Mode: [x] Authored [ ] All    | Type unit  Mark rect  Visible yes         |
|                               | Selector { scope: [], view: "cnv" }       |
| v root            grid        |                                          |
|   v tracks        vconcat     | [Summary] [Encodings] [Resolutions] [...] |
|     > overview    unit rect   | Encoding channel table                   |
|     v detail      layer       | channel field  type    scale axis legend |
|       - cnv       unit rect   | x       start  locus   R:x   A:x  -      |
|       - segments  unit rule   | y       sample nominal R:y   A:y  -      |
|   > guides        chrome      | color   cn     nominal R:color - L:color |
+-------------------------------+------------------------------------------+
| Breadcrumb: root > tracks > detail > cnv        Highlight selected views  |
+--------------------------------------------------------------------------+
```

### Elements Panel

Left side:

- Tree rows show name, type, mark type, chrome badge, visibility badge, data
  initialization badge, and small resolution chips.
- Search filters by name, selector, path, mark type, channel, field, parameter
  name, resolution id, or dataflow node label.
- Mode toggle:
  - `Authored`: hides views marked by `isChromeView(view)`.
  - `All`: shows every runtime layout view and labels chrome nodes.
- Optional layout/data parent toggle. The default tree is the layout hierarchy.
  Data parent links should be shown in details first, then as a second tree mode
  if needed.

Right side tabs for selected view:

- `Summary`: path, selector, type, class name, name/default name, visibility,
  layout/data parent, configured size, viewport size, rendered bounds, opacity,
  data initialization state.
- `Spec`: compact JSON view of the authored or generated spec. Show inherited
  effective config in a separate collapsed section.
- `Encodings`: channel table with field/expr/value, type, scale/axis/legend
  resolution ids, domain contribution, and accessor metadata.
- `Resolutions`: scale/axis/legend memberships involving this view.
- `Params`: local declarations, local runtime values, inherited params used by
  expressions, and selection values.
- `Dataflow`: data source, transforms, collector, flow stats, and links to the
  global Dataflow panel.
- `Mark`: mark type, initialized encoder channels, mark props, search fields,
  picking support, and data counts.
- `Layout`: facet coords, scroll state when available, overhang/padding, and
  last rendered bounds.

### Resolutions Panel

Show three grouped tables: scales, axes, legends.

Scale resolution rows:

- id, channel, name, host view, type, resolved scale type, current domain,
  complex domain when available, range, zoomable, zoomed, member count, active
  member count.

Scale member rows:

- view path, selector, member channel, field/expr, type, contributes to domain,
  visibility, data initialization state, explicit scale config, resolution
  channel if present.

Axis and legend rows:

- id, channel, title, member count, visible non-chrome member state, associated
  scale resolution id, config source, generated definitions for legends.

Selecting any row should:

- select the resolution in the detail pane
- highlight participating views in the hierarchy
- offer "Jump to owner view" and "Copy debug id"

### Dataflow Panel

This replaces `DataFlowInspectorDialog` over time. The current dialog already
shows sources, transforms, propagated counts, first datum, params, and owning
view path. The new panel should preserve those capabilities and add:

- stable flow node ids
- links to owning views
- collector membership and observer counts
- completed/disposed/initialized state
- domain-sensitive scale channels
- hidden subtree and lazy loading state
- datum preview truncation and optional redaction

### Params Panel

The global Params panel groups params by view scope. The selected view Params
tab shows only the local scope and inherited resolution chain.

Columns:

- view path, name, kind (`base`, `selection`, `derived`, `layout`, `push`),
  current value preview, declaration source, expression, writable state,
  bookmarkable selector when available.

### Events Panel

Add this later. It should show recent layout, dataflow, param, and resolution
events. Keep it read-only and capped to avoid unbounded memory use.

### Component Style

Implement inspector UI pieces as `LitElement` web components, following the
component patterns already used in App and Playground. Good local references
include:

- `packages/app/src/components/generic/multiSelect.js`
- `packages/app/src/components/generic/uploadDropZone.js`
- `packages/app/src/components/generic/dataGrid.js`
- `packages/playground/src/filePane.js`
- `packages/playground/src/examplePicker.js`

Use those components as implementation inspiration, not as visual styling
requirements. The inspector can have its own dense DevTools-like look, but it
should keep the same basic code shape:

- import `LitElement`, `html`, `css`, and `nothing` from `lit` as needed
- define reactive inputs with `static properties`
- keep internal UI state in `{ state: true }` properties
- use `static styles` for shadow-DOM components
- use `createRenderRoot()` only when the host needs light-DOM integration with
  existing global App or Playground styles
- dispatch typed custom events for selection, refresh, and panel actions
- register elements explicitly with `customElements.define(...)`
- use JSDoc typedefs for public properties and event payloads
- keep component files focused; put snapshot/session logic outside Lit
  components

## Architecture

### Package

Create a new workspace package:

```
packages/inspector/
  src/index.js
  src/inspectorPlugin.js
  src/core/createInspectorSession.js
  src/core/snapshots.js
  src/components/inspectorPanel.js
  src/components/viewTree.js
  src/components/detailsPane.js
  src/components/resolutionPanel.js
  src/components/dataflowPanel.js
  src/styles/inspector.scss
```

Package name: `@genome-spy/inspector`.

Keep it separate from Core and App so the default Core/App bundles do not gain
the inspector UI. The package may depend on `@genome-spy/core`, Lit, and
FontAwesome or a small local icon set. Its web components should extend
`LitElement`. It should not depend on Redux or App internals except through the
App host adapter.

Most new code should live in this package. Core and App changes should be
limited to small hooks that expose runtime state or host UI attachment points
that the plugin cannot obtain cleanly otherwise.

### Host Integration

Use an app-agent-like plugin pattern for the initial App integration:

```js
import { genomeSpyInspector } from "@genome-spy/inspector";

await embed(document.body, spec, {
    plugins: [genomeSpyInspector()],
});
```

Initial host support:

- App host: the existing `App` object with `app.genomeSpy`, `app.ui`, toolbar
  registration, and side panel registration.

Deferred host support:

- Playground host: add a direct adapter in `packages/playground/src/index.js`
  after the App plugin is useful. Prefer a small local adapter over adding a
  general Core plugin system just to support Playground.
- Core host: add a direct Core embed integration last, only after the host
  contract has been proven in App and Playground.

Core currently does not have App-style plugin installation. Do not add a Core
plugin hook in the initial version. When Core support is implemented, keep the
host seam small:

```ts
export interface GenomeSpyPluginHost {
    genomeSpy: GenomeSpy;
    container: HTMLElement;
}

export interface GenomeSpyPlugin {
    name?: string;
    install(host: GenomeSpyPluginHost): void | (() => void) | Promise<void | (() => void)>;
}
```

If Core adds `EmbedOptions.plugins`, update App's plugin types to use a shared
base contract so `app-agent` remains compatible. The App host should extend the
Core host rather than define a conflicting plugin contract.

### Minimal Hook Policy

The inspector will need a few hooks in Core and App because some useful state is
private by design. Keep those hooks deliberately small:

- No inspector UI, Lit components, styles, or panel logic in Core or App.
- No broad "give me everything" runtime escape hatch.
- Prefer plain debug snapshot objects, immutable arrays, and unsubscribe
  functions over exposing mutable internals.
- Add hooks only where the plugin cannot derive the state from existing public
  APIs, existing view traversal, or existing App UI registries.
- Keep App hooks host-oriented: toolbar registration, side-panel attachment,
  access to the current `GenomeSpy` instance, and canvas highlighting.
- Keep Core hooks runtime-oriented: view/resolution/dataflow/param debug state,
  layout events, and object-to-debug-id mapping support where needed.
- Gate optional heavy collection behind the plugin session, not behind default
  Core/App startup paths.
- Load Core debug helper modules with dynamic `import()` from the inspector
  package so debug-only code is fetched and evaluated only when the inspector
  is opened.
- Avoid new transitive dependencies in Core and App for inspector-only
  behavior.

### Inspector Session

The UI should never read random private fields directly. Create an
`InspectorSession` that owns live object identity, snapshots, and refresh
subscriptions.

Responsibilities:

- assign stable debug ids with `WeakMap`s for views, resolutions, params, and
  flow nodes
- build immutable snapshots for rendering
- map selected snapshot ids back to live objects while they are alive
- subscribe to relevant runtime events
- throttle refreshes with `requestAnimationFrame`
- dispose all subscriptions when the plugin is removed

Identity model:

```ts
type DebugId = string;

interface InspectorSnapshot {
    epoch: number;
    rootViewId: DebugId;
    views: ViewDebugNode[];
    scaleResolutions: ScaleResolutionDebugNode[];
    axisResolutions: AxisResolutionDebugNode[];
    legendResolutions: LegendResolutionDebugNode[];
    dataflow: DataflowDebugForest;
}
```

Use ids such as `v1`, `s3`, `a2`, `l4`, `f17`. They are stable for the current
embed lifetime only.

### Core Debug Snapshot API

Eventually add explicit debug-facing helpers under `packages/core/src/debug/`.
The inspector package should load these helpers with dynamic `import()` when an
inspector session starts, not through the normal Core entry point. These helpers
may use internal classes, but the UI package should consume structured
snapshots rather than open-ended internals. Add only the helpers needed by the
App-first inspector phase; leave deeper hooks for later panels.

Proposed modules:

- `viewDebugSnapshot.js`
- `resolutionDebugSnapshot.js`
- `dataflowDebugSnapshot.js`
- `paramDebugSnapshot.js`
- `markDebugSnapshot.js`

Some internals require small debug methods because ECMAScript private fields
cannot be inspected outside their class:

- `ScaleResolution.getDebugState()`
  - members, active members, data domain members, host view, view-level scale
    config, name, channel, type, resolved scale props, domain, complex domain,
    range, zoom state.
- `AxisResolution.getDebugState()`
  - members, scale resolution, title, axis props, view-level axis config,
    visible non-chrome state.
- `LegendResolution.getDebugState()`
  - members, legend definitions, view-level legend config, visible non-chrome
    state.
- `ViewParamRuntime.getDebugState()`
  - scope-local refs, configured params, current values, writable/derived kind.
- `FlowNode.getDebugState()`
  - label, stats, children, parent, initialized/disposed/completed state,
    params, owning view if present.

Keep these methods documented as internal debugging APIs. They should return
plain objects or iterables, not mutable collections that let the inspector
modify runtime state.

### Refresh And Event Sources

Initial refresh can be manual plus auto-refresh on runtime broadcasts:

- `layoutComputed`: refresh layout bounds and rendered hierarchy state.
- `layout`: optional later event for before/after layout.
- `dataFlowBuilt`: refresh dataflow tree.
- `subtreeDataReady`: refresh flow stats and lazy data state.
- scale resolution `domain` and `range` events: refresh resolution details.
- param subscriptions: subscribe only for params displayed in the selected view
  or global Params panel to avoid excessive listener churn.

The first version can include an Auto Refresh toggle and a manual refresh
button. Details that are expensive or data-heavy should load lazily when the
corresponding tab is opened.

### Canvas Highlight And Selection

Use the existing `viewRoot.context.highlightView(view)` for hover and selected
view highlighting. Support selecting a view from the tree in the first version.

Add canvas inspect mode later:

- toolbar pointer icon toggles inspect mode
- moving over the canvas selects the deepest hit view or current hover view
- clicking pins the selection
- Esc exits inspect mode

This may need a Core debug hook from `InteractionController` or picking state.
Avoid reimplementing hit testing in the inspector.

## Data Handling And Safety

The inspector can expose sensitive data because GenomeSpy often renders genomic
and clinical data. Make the following defaults conservative:

- datum previews are truncated
- arrays show length and first few items
- objects show only the first N keys unless expanded
- copying raw previews requires an explicit action
- no network requests
- no persistence unless the user explicitly exports a snapshot

## Migration From The Old Dataflow Dialog

The old App `DataFlowInspectorDialog` has been replaced by the Dataflow panel in
`@genome-spy/inspector`. The App overflow menu now gets its Inspector item from
the plugin, and the legacy dialog/export path has been removed.

## Implementation Phases

### Phase 1: App Read-Only Hierarchy Inspector

Tentative commit: `feat(inspector): add app hierarchy inspector`
Status: Implemented.

- Add `@genome-spy/inspector` package.
- Add `InspectorSession` inside the plugin package.
- Add view snapshot builder with authored/all chrome modes.
- Add App toolbar button and side panel integration through existing App plugin
  and `AppUiRegistry` mechanisms.
- Add only the minimal App/Core hooks required for App hierarchy inspection.
- Support selecting tree nodes, hover highlight, summary tab, spec tab, and
  layout bounds.
- Add focused Vitest coverage for snapshot builders.

### Phase 2: App Resolutions And Encodings

Tentative commit: `feat(inspector): inspect resolutions and encodings`
Status: Implemented.

- Add debug methods for scale, axis, and legend resolutions.
- Add Encodings and Resolutions tabs.
- Add global Resolutions panel.
- Show resolution membership chips in the tree.
- Add tests that verify shared and independent resolution membership with
  representative layout specs.

### Phase 3: App Dataflow Replacement

Tentative commit: `feat(inspector): replace app dataflow inspector`
Status: Implemented.

- Add dataflow snapshot builder.
- Add Dataflow panel with current dialog parity.
- Link flow nodes to views and collectors.
- Add datum preview truncation.
- Update App menu fallback behavior.

### Phase 4: App Params And Mark Details

Tentative commit: `feat(inspector): inspect params and marks`
Status: Implemented.

- Add `ViewParamRuntime.getDebugState()`.
- Add selected-view and global Params panels.
- Add `markDebugSnapshot` for UnitView marks.
- Show mark props, initialized encoding channels, search fields, and data
  counts where available.

### Phase 5: Playground Integration

Tentative commit: `feat(playground): add inspector integration`

- Add a Playground toolbar entry that opens the same inspector panel.
- Reuse the App-proven plugin session and components.
- Use a small Playground host adapter instead of changing Core embed APIs unless
  that becomes awkward.
- Add a Playground smoke test or Playwright test after the UI is wired.

### Phase 6: Core Embed Integration

Tentative commit: `feat(core): add inspector host integration`

- Add direct Core embed support after App and Playground have validated the host
  contract.
- Consider `EmbedOptions.plugins` or a dedicated debug installer only at this
  point.
- Keep the Core host API limited to `genomeSpy`, `container`, lifecycle
  disposal, and optional UI attachment.

### Phase 7: Inspect Mode And Event Timeline

Tentative commit: `feat(inspector): add inspect mode and event timeline`

- Add canvas inspect mode.
- Add recent event timeline.
- Add snapshot export/import for bug reports.
- Consider a real Chrome DevTools extension only after the in-page inspector is
  stable. A browser extension would need a page bridge anyway, while the
  in-page plugin can access live ESM objects directly.

## Testing Strategy

- Unit test snapshot builders close to Core code.
- Use `specToLayout(...)` or `renderToLayout(...)` for layout-oriented snapshot
  tests.
- Add focused tests for:
  - authored vs all-chrome view modes
  - view selectors and anonymous runtime nodes
  - shared vs independent scale/axis/legend resolutions
  - hidden/lazy subtree data initialization state
  - dataflow node stats and owner view links
  - param shadowing and `push: "outer"`
- Add App plugin tests for toolbar registration and disposer cleanup.
- Add Playground and Core host tests only when those integrations are added.

## Open Questions

- Should Core expose a general plugin hook, or should the inspector use a
  dedicated debug installer for Core when Core integration eventually starts?
- Should debug snapshot APIs be exported as `@genome-spy/core/debug` or remain
  package-internal and consumed through package subpath exports?
- Are all implicit chrome views consistently marked with `markViewAsChrome`?
  If not, audit axes, legends, titles, grid children, separators, backgrounds,
  and selection overlays before relying on the authored/all toggle.
- How much mutable behavior should the inspector allow? The first version should
  be read-only except for highlighting and zoom-to-view convenience actions.
- Should snapshot export include data previews by default? The safer default is
  metadata only, with an explicit include-data option.

## Recommended First Cut

Start with a read-only side panel that works in App:

1. `@genome-spy/inspector` package with `LitElement` components.
2. `InspectorSession` and a view snapshot builder.
3. App plugin installation through the existing `plugins` option.
4. App toolbar and side-panel wiring through existing App UI registry APIs.
5. A narrow dynamically imported Core debug snapshot module for views,
   selectors, chrome state, layout bounds, visibility, data initialization
   state, and current resolutions by id.

That first cut gives immediate value for hierarchy debugging while keeping the
harder resolution, param, and dataflow internals behind explicit follow-up
phases. Playground should be the next host after App, and direct Core embed
support should wait until the host contract has settled.

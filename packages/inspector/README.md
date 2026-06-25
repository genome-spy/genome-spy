# @genome-spy/inspector

The inspector is a DevTools-like side panel for looking at GenomeSpy runtime
state while developing or debugging visualizations. It shows the view hierarchy,
encodings, scale/axis/legend resolutions, dataflow, params, and unit mark state.
The goal is to make the live runtime easier to understand without adding debug
UI or heavy inspection code to the default Core or App bundles.

This package is currently experimental. The initial implementation was largely
vibe-coded with Codex and should be treated as a useful development tool rather
than a stable public API.

## Package Integrations

### App

GenomeSpy App uses the inspector through the App plugin surface:

```js
import { genomeSpyInspector } from "@genome-spy/inspector";

await embed(element, spec, {
  plugins: [genomeSpyInspector()],
});
```

In the App development single-page entry, the inspector is installed
automatically so it is available from the App overflow menu during local
development.

The plugin uses App UI hooks to register a menu item and a side panel. It also
registers an inspector launcher so App-side development commands can open this
panel directly to a specific inspector view.

### Playground

GenomeSpy Playground depends on this package directly. The Playground toolbar
has an Inspector button that replaces the editor/file pane with the inspector,
so the plot and inspector are visible side by side.

Playground uses the embeddable panel API:

```js
import { createInspectorPanel } from "@genome-spy/inspector";

const inspector = await createInspectorPanel({
  getRootView: () => embedResult.getDebugViewRoot(),
});

inspectorContainer.append(inspector.panel);
await inspector.session.refresh();
```

The inspector is refreshed after Playground rebuilds the Core embed from the
current editor contents.

### Core Embeds

Core does not load the inspector by itself. Applications that embed Core can
install this package and attach the inspector only in development builds or
behind their own debug UI.

The Core embed result exposes a small debug hook:

```js
const api = await embed(element, spec);

api.getDebugViewRoot();
```

That hook gives the inspector access to the live root view without adding a
plugin system or loading debug UI into Core.

For quick integration, use the floating overlay helper:

```js
import { embed } from "@genome-spy/core";
import { attachInspectorOverlay } from "@genome-spy/inspector";

const api = await embed(element, spec);

await attachInspectorOverlay({
  getRootView: () => api.getDebugViewRoot(),
});
```

For applications with their own panels or split layouts, use
`createInspectorPanel(...)` instead and place the returned `panel` element in
the application UI.

See the embed example:
[Inspector overlay](../embed-examples/src/inspectorOverlay.html)
([source](../embed-examples/src/inspectorOverlay.js)).

## Architecture

The inspector is centered around `InspectorSession`, which reads the live
runtime through a small host object:

```ts
interface InspectorHost {
  getRootView(): object | undefined;
  highlightView?(view: object | null): void;
}
```

The session dynamically imports Core debug snapshot helpers from
`@genome-spy/core/debug/...` when it refreshes. This keeps debug-only collection
code out of normal startup paths.

`GsInspectorPanel` is a LitElement component that renders a session snapshot.
`createInspectorPanel(...)` wires a session to the panel. App, Playground, and
Core embed examples all use the same session and panel components, with only
small host adapters around them.

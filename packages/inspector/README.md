# @genome-spy/inspector

The inspector is a DevTools-like side panel for looking at GenomeSpy runtime
state while developing or debugging visualizations. It shows the view hierarchy,
encodings, scale/axis/legend resolutions, dataflow, params, and unit mark state.
The goal is to make the live runtime easier to understand without adding debug
UI or heavy inspection code to the default Core or App bundles.

The initial implementation was largely vibe-coded with Codex. The tool is
usable for development work, but the package API may still change as the
integration points are refined.

## Package Integrations

### App

GenomeSpy App uses the inspector through the App plugin surface:

```js
import { appInspector } from "@genome-spy/inspector";

await embed(element, spec, {
  plugins: [appInspector()],
});
```

In the App development single-page entry, the inspector is installed
automatically so it is available from the three-dot menu in the App toolbar
during local development.

The plugin uses App UI hooks to register a menu item and a side panel.

### Playground

GenomeSpy Playground depends on this package directly. The Playground toolbar
has an Inspector button that replaces the editor/file pane with the inspector,
so the plot and inspector are visible side by side.

Playground uses the embeddable panel API:

```js
import { createInspectorPanel } from "@genome-spy/inspector";

const inspector = await createInspectorPanel(embedResult.debug);

inspectorContainer.append(inspector.panel);
await inspector.session.refresh();
```

The inspector is refreshed after Playground rebuilds the Core embed from the
current editor contents.

### Core Embeds

Core does not load the inspector by itself. Applications that embed Core can
install this package and attach the inspector only in development builds or
behind their own debug UI.

The Core embed result exposes a small debug object:

```js
const api = await embed(element, spec);

api.debug.getViewRoot();
```

That object gives the inspector access to the live root view and the matching
Core debug helpers without adding a plugin system or loading debug UI into Core.

For quick integration, use the floating overlay helper:

```js
import { embed } from "@genome-spy/core";
import { attachInspectorOverlay } from "@genome-spy/inspector";

const api = await embed(element, spec);

await attachInspectorOverlay(api.debug);
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
  getViewRoot(): object | undefined;
  getModules(): Promise<InspectorDebugModules>;
}
```

The session loads Core debug snapshot helpers when it refreshes. App provides
this object as `app.debug`, and Core embeds expose the same shape as
`api.debug`. This keeps the inspector on the same Core runtime that owns the
live views.

`GsInspectorPanel` is a LitElement component that renders a session snapshot.
`createInspectorPanel(...)` wires a session to the panel. App, Playground, and
Core embed examples all use the same session and panel components, with only
small host adapters around them.

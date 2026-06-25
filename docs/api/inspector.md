# Inspector

The GenomeSpy Inspector is a developer tool for looking at the live runtime
state of a visualization. It shows the view hierarchy, encodings,
scale/axis/legend resolutions, dataflow, params, and unit mark state.

Use the inspector when a visualization does not behave as expected and the
specification alone does not explain the runtime state. Typical use cases
include checking which views were created, how scales are shared, which params
exist, and where data objects flow through transforms.

## App

GenomeSpy App includes the inspector in local development builds. Open it from
the three-dot menu in the App toolbar while developing sample-collection
visualizations.

The App integration uses the inspector package as an App plugin. Applications
that embed App directly can install the plugin explicitly:

```js
import { embed } from "@genome-spy/app";
import { genomeSpyInspector } from "@genome-spy/inspector";

await embed(element, spec, {
  plugins: [genomeSpyInspector()],
});
```

## Playground

GenomeSpy Playground includes an Inspector button in the toolbar. The button
replaces the editor/file pane with the inspector, so the plot and inspector are
visible side by side.

The Playground integration uses the embeddable panel API from
`@genome-spy/inspector`.

## Core Embeds

Core does not load the inspector by itself. Applications that embed Core can
install `@genome-spy/inspector` and attach the inspector from their own debug
UI.

The Core embed result exposes `getDebugViewRoot()`, which gives the inspector
access to the live internal root view:

```js
import { embed } from "@genome-spy/core";
import { attachInspectorOverlay } from "@genome-spy/inspector";

const api = await embed(element, spec);

const inspector = await attachInspectorOverlay({
  getRootView: () => api.getDebugViewRoot(),
});

// Later, when the host page is destroyed:
inspector.dispose();
api.finalize();
```

For applications with their own panels or split layouts, use
`createInspectorPanel(...)` instead and place the returned `panel` element in
the application UI.

See the
[inspector overlay example](https://github.com/genome-spy/genome-spy/blob/master/packages/embed-examples/src/inspectorOverlay.html)
for a complete Core embed.

## Dataflow Debugging

The Dataflow panel shows the structure of the data flow, the parameters of each
node, the number of propagated data objects, and a preview of the first data
object that passes through the node.

This is useful for debugging transforms, lazy data loading, and views whose
marks are missing because no data reaches the mark.

## Debug Scope

The inspector reads internal runtime objects through small debug hooks. Debug
ids are session-local and should not be stored in application state or shared
links.

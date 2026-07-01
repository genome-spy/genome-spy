# Inspector

The GenomeSpy Inspector is a developer tool for looking at the live runtime
state of a visualization. It shows the view hierarchy, encodings,
scale/axis/legend resolutions, dataflow, params, and unit mark state.

Use the inspector when a visualization does not behave as expected and the
specification alone does not explain the runtime state. Typical use cases
include checking which views were created, how scales are shared, which params
exist, and where data objects flow through transforms.

## App

To use the inspector in GenomeSpy App, load the App and Inspector bundles,
initialize App with the inspector plugin, and open the inspector from the
three-dot menu in the App toolbar.

SNIPPET sample-collections/app-module-spec-file-inspector.html

This is the inspector-enabled variant of the App template used in
[Visualizing Sample Collections](../sample-collections/visualizing.md).

Bundled applications that install App through npm can add the inspector plugin
explicitly:

```js
import { embed } from "@genome-spy/app";
import { appInspector } from "@genome-spy/inspector";

await embed(element, spec, {
  plugins: [appInspector()],
});
```

## Playground

GenomeSpy [Playground](https://genomespy.app/playground) includes an Inspector
button in the toolbar. The button replaces the editor/file pane with the
inspector, so the plot and inspector are visible side by side.

## Core Embeds

Core does not load the inspector by itself. Applications that embed Core can
install `@genome-spy/inspector` and attach the inspector from their own debug
UI.

The Core embed result exposes `api.debug`, which gives the inspector access to
the live internal root view and loads debug helpers from the same Core runtime:

```js
import { embed } from "@genome-spy/core";
import { attachInspectorOverlay } from "@genome-spy/inspector";

const api = await embed(element, spec);

const inspector = await attachInspectorOverlay(api.debug);

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

## Debug Scope

The inspector reads internal runtime objects through small debug hooks. Debug
ids are session-local and should not be stored in application state or shared
links.

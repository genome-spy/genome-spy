---
title: Embedding GenomeSpy in Web Applications
---

# Embedding GenomeSpy

## Embedding

See the [getting started](../getting-started.md) page.
For specifications stored as JSON files, turn on [editor suggestions and error
checking](../grammar/index.md#schema-assisted-editing) to catch many common
mistakes before the specification reaches the browser.

## Entry points

Core and App provide separate `embed` entry points. Core also offers a minimal
entry point for choosing its runtime modules explicitly.

### Default

`@genome-spy/core` is the default entry point. It includes the standard
GenomeSpy runtime and the built-in data source and format registrations.

```js
import { embed } from "@genome-spy/core";

const spec = {
  // view specification
};

const api = await embed(document.body, spec);
```

### Minimal

`@genome-spy/core/minimal` provides the same `embed` API without built-in
renderers or optional data loaders. Import at least one live renderer and any
data source or format modules you need explicitly:

```js
import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import "@genome-spy/core/data/formats/parquet.js";
import "@genome-spy/core/data/sources/lazy/bigBedSource.js";

const spec = {
  // view specification that uses the lazy bigBed source
};

const api = await embed(document.body, spec);
```

See
the [full runtime entry point](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/genomeSpy.js)
for the complete list of optional modules.

The `webgl.js` import enables WebGL2. The `canvas.js` import enables Canvas2D.
Import `svg.js` when using SVG export. You can omit
any renderer capability the host application does not use; Core reports the
required import if an unavailable capability is requested.

### App

`@genome-spy/app` adds the sample collection interface, toolbar, metadata controls,
and undo/redo to Core. It accepts [sample collection specifications](../sample-collections/visualizing.md):

```js
import { embed } from "@genome-spy/app";

const api = await embed(container, sampleSpec, { embedMode: "embedded" });
```

Embedded mode keeps local interaction controls without owning the page URL or
bookmark storage. The default `"standalone"` mode also manages URL state and
bookmarks. Existing static App specifications, including their root `specId` and
bookmark configuration, continue to work.

## API object

The `embed` function returns a promise that resolves into an object that
provides the current public API. The API is documented in the [interface
definition](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/types/embedApi.d.ts).

If loading or initializing the visualization fails, the promise rejects with the
original error and any initialized resources are released. The error is also
shown in the container. An `onError` callback can provide its own error display;
return `true` to suppress the default display. This applies to both Core and App
embeds.

Errors during reactive updates, including debounced updates, also reach
`onError` or the default error display. Reporting preserves the original
exception and rejects pending propagation barriers. Continued use of a failed
instance is not guaranteed; finalize it and embed again to start fresh.

For applications that edit or generate specifications, see
[linking errors to source declarations](./editor-integration.md).

For practical examples of using the API, explore the
[live embed examples](https://genomespy.app/docs/api/embed-examples/) or browse
their source in the
[embed-examples package](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples).

The embed API includes `api.events`, `api.params`, and `api.views`. Use
`api.events` for synchronous canvas input, `api.params` for top-level state, and
the `params` and `marks` namespaces on view handles for view-scoped state and
interaction. These namespaces return unsubscribe functions and are disconnected
by `finalize()`.

## Replacing App sample collections

An App can start without a SampleView and attach one later through `api.views`.
Keep a persistent concat with a fixed assembly and an explicit shared locus scale.
Independent annotation siblings can stay in that concat while the SampleView is
removed and recreated. App supports one active SampleView.

```js
import { embed } from "@genome-spy/app";

const api = await embed(container, {
  name: "tracks",
  assembly: "hg38",
  scales: { x: { name: "locus", type: "locus", zoom: true } },
  resolve: { scale: { x: "shared" } },
  vconcat: [], // Independent annotation tracks can go here.
});
const tracks = api.views.get({ scope: [], view: "tracks" });
let cohort;

// The host supplies a SampleSpec compatible with the fixed assembly.
async function openCohort(nextSampleSpec, persistenceContext = null) {
  if (cohort) {
    await api.views.remove(cohort);
    cohort = undefined;
    // The host can now revoke blob URLs belonging to the removed cohort.
  }
  await api.setPersistenceContext(persistenceContext);
  cohort = await api.views.insert(tracks, nextSampleSpec);
}
```

Await each replacement before starting another. Removing a cohort clears its
metadata, grouping, filters, selections, and undo/redo history. The operation is
not undoable. Surviving annotations, their loaded data, and the current locus stay
in place. If the next insertion fails, its partial resources are released and the
App remains empty and ready for another insertion. Keep host-owned blob URLs valid
until awaited removal or failed-insertion cleanup finishes.

`setPersistenceContext` changes source-specific bookmark identity without
recreating App or changing cohort data. Pass `null` to disable source bookmarks,
or provide a context such as:

```js
await openCohort(nextSampleSpec, {
  specId: "dataset-b",
  baseUrl: "https://example.org/dataset-b/",
  remoteBookmarks: { url: "bookmarks.json" },
});
```

A remote bookmark URL must be absolute or have an explicit `baseUrl`. Relative
bookmark content resolves from the remote bookmark file's directory. Detachment
clears the previous source context; insertion does not configure persistence or
automatically restore a bookmark. Embedded mode continues to leave page URL and
bookmark ownership to the host.

## Optional controls

`attachControls` mounts an explicit, ordered list of controls. It provides
styles and hover/focus visibility but does not register renderers.

```js
import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/svg.js";
import {
  attachControls,
  pngButton,
  svgButton,
  fullWindowButton,
} from "@genome-spy/core/controls";

const container = document.getElementById("plot");
const api = await embed(container, spec);
const controls = attachControls(container, api, {
  controls: [pngButton({ filename: "plot" }), svgButton(), fullWindowButton()],
});

// Before replacing or removing the embed:
controls.dispose();
api.finalize();
```

| Option       | Purpose                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `controls`   | Required list of control definitions, in display order.                                                                |
| `placement`  | `"inside"` (default), `"top"`, or `"bottom"`.                                                                          |
| `visibility` | `"hover"` or `"always"`. Defaults to hover inside, always for top/bottom. Devices without hover keep controls visible. |
| `onError`    | Error callback; errors and SVG warnings also appear beside the buttons.                                                |

`pngButton` and `svgButton` accept two options:

- `filename`: the download name without an extension; defaults to `"genomespy"`.
- `exportOptions`: settings passed to the [image export API](./instance.md#exporting-raster-images).

`button({ label, onClick })` adds a custom text button. The label also serves as
its accessible name and hover title. Set `icon` to an SVG or HTML element for an
icon button. An optional `title` overrides the hover tooltip.

See the [commented example](https://github.com/genome-spy/genome-spy/blob/master/packages/embed-examples/src/controls/index.js)
for custom actions, or the [Control contract](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/controls.js)
for controls with their own lifecycle.

`genomeSpyButton()` adds a favicon link to the GenomeSpy website, opening in a new tab.
The Inspector package also provides an [inspectorButton()](./inspector.md#core-embeds).

All placements attach to the same container without changing its size.
Top/bottom controls sit outside it: provide space (e.g. `margin-block: 48px`)
and allow overflow. Inside controls overlay the plot.

## Debugging embeds

Use the [Inspector](./inspector.md) to inspect the live view hierarchy,
resolutions, params, and dataflow of embedded visualizations. Core embeds can
attach the inspector through the `@genome-spy/inspector` package.

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

When embedding GenomeSpy into a web application, you can choose between two
entry points for importing the `embed` function.

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

## API object

The `embed` function returns a promise that resolves into an object that
provides the current public API. The API is documented in the [interface
definition](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/types/embedApi.d.ts).

For practical examples of using the API, explore the
[live embed examples](https://genomespy.app/docs/api/embed-examples/) or browse
their source in the
[embed-examples package](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples).

The embed API includes `api.events`, `api.params`, and `api.views`. Use
`api.events` for synchronous canvas input, `api.params` for top-level state, and
the `params` and `marks` namespaces on view handles for view-scoped state and
interaction. These namespaces return unsubscribe functions and are disconnected
by `finalize()`.

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

## Recording plot videos (experimental)

`recordButton()` adds a Record/Stop control that downloads a silent WebM video
of the visible plot. It captures pan, zoom, selections, animations, and data
updates. Transparent areas are flattened onto white. HTML tooltips, menus,
Inspector, controls, and the mouse pointer are excluded.

```js
import { attachControls, recordButton } from "@genome-spy/core/controls";

const controls = attachControls(container, api, {
  controls: [recordButton({ filename: "plot" })],
});
```

With a bundler, import only the controls you use. Tree shaking excludes the
recording implementation when `recordButton` and `startRecording` are unused;
adding only PNG/SVG buttons does not include it. Conditionally hiding a recording
button at runtime still includes its functionality. The dedicated
`@genome-spy/core/recording` entrypoint also exports `recordButton` and
`startRecording`.

For direct webpage use, the prebuilt controls bundle excludes recording. Load the
separate recording addon as shown in the browser examples below.

The red circle starts recording. The Stop button shows the seconds remaining,
without a recording message over the plot. A Pause button appears alongside it;
while paused it becomes Resume, and the countdown freezes. Paused time and view
changes made during the pause are omitted from the video. Resuming continues from
the current plot state; stopping while paused downloads the clip already captured.
Hover over each button for its action label.

The filename omits the extension and defaults to `"genomespy"`. Record again after
stopping to create another clip. Dispose the controls before finalizing the embed.

This proof of concept targets desktop Chrome with WebGL, Canvas2D, and WebGPU
(on hardware that supports it). It uses WebM/VP8, targets 30 frames per second,
and retains the canvas's pixel dimensions, including device pixel ratio. Other
browser/format combinations are not validated. Recording adds a canvas copy for
each visible paint and encoding work; performance depends on plot size and hardware.

Each embed permits one active recording. Recording stops and downloads at
60 seconds of active recording or approximately 64 MiB of encoded chunks. These limits do not bound
all browser/encoder memory. Resizing the canvas or hiding the tab cancels and
discards the clip with an explanation. Removing the controls or finalizing the
embed also discards an active clip. Keep the tab visible and the plot size fixed
until the download finishes. Very short recordings may report that no frames
were captured.

For custom controls, the experimental API returns a session:

```js
import { startRecording } from "@genome-spy/core/recording";

const session = startRecording(api);
// Observe automatic completion, cancellation, and errors immediately.
session.finished.then(handleVideoBlob, handleRecordingError);

// Optional: pause while adjusting the view, then resume.
session.pause();
// ...adjust the view...
session.resume();

// Later: stop and finish encoding, or cancel and discard.
await session.stop(); // Returns the same Blob as session.finished.
// session.cancel();
```

`session.paused` reports the pause state and `session.remainingMs` reports the
remaining active time. `finished` also resolves at the duration or size limit. It rejects on recording
errors and cancellations; explicit cancellation or embed finalization uses an
`AbortError`. The API returns the Blob without downloading it. The Record control
handles downloads automatically. The API and its limits may change after the PoC.

### Recording on a webpage without a bundler

The prebuilt browser files keep controls and recording separate from Core:

| Feature   | ESM file          | UMD file and global                   |
| --------- | ----------------- | ------------------------------------- |
| Core      | `index.es.js`     | `index.js` → `genomeSpyEmbed`         |
| Controls  | `controls.es.js`  | `controls.js` → `genomeSpyControls`   |
| Recording | `recording.es.js` | `recording.js` → `genomeSpyRecording` |

Serve the entire `dist/bundle/` directory, including its renderer chunks, from
one release. The examples below assume it is hosted at `/genomespy/` and that
`container` and `spec` are your plot element and specification. These new add-on
files must be present in the build you serve; older releases do not provide them.

**ESM:** import Core normally and load the add-ons only when enabling recording.
Neither add-on imports a second Core runtime.

```js
import { embed } from "/genomespy/index.es.js";

const api = await embed(container, spec);

// Call when your page enables recording controls.
async function addRecordingControls() {
  const [{ attachControls }, { recordButton }] = await Promise.all([
    import("/genomespy/controls.es.js"),
    import("/genomespy/recording.es.js"),
  ]);
  return attachControls(container, api, { controls: [recordButton()] });
}

// Retain the result and dispose it before finalizing the embed.
const controls = await addRecordingControls();
```

Omit the call when recording is not needed; no recording file is fetched.
For custom UI, the recording module also exports `startRecording(api)`.

**UMD:** include the two add-on scripts explicitly after Core. Omitting them
keeps their code out of the page; the Core UMD file does not include them.

```html
<script src="/genomespy/index.js"></script>
<script src="/genomespy/controls.js"></script>
<script src="/genomespy/recording.js"></script>
<script>
  async function showPlot(container, spec) {
    const api = await genomeSpyEmbed.embed(container, spec);
    const controls = genomeSpyControls.attachControls(container, api, {
      controls: [genomeSpyRecording.recordButton()],
    });
    return { api, controls };
  }
</script>
```

A script loader may also load the add-ons after embedding; they attach to the
existing embed. Both formats support the same recording behavior and limits.
The published Core browser bundles include WebGL and Canvas2D; the experimental
WebGPU renderer remains a development capability.

For applications selecting prebuilt files through package exports, the matching
entry points are `@genome-spy/core/browser`,
`@genome-spy/core/browser/controls`, and `@genome-spy/core/browser/recording`.
The source entry points remain unchanged for applications using a bundler.

## Debugging embeds

Use the [Inspector](./inspector.md) to inspect the live view hierarchy,
resolutions, params, and dataflow of embedded visualizations. Core embeds can
attach the inspector through the `@genome-spy/inspector` package.

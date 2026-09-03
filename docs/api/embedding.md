# Embedding and Entry Points

## Embedding

See the [getting started](../getting-started.md) page.

## Entry points

When embedding GenomeSpy into a web application, you can choose between two
entry points for importing the `embed` function:

`@genome-spy/core` is the default entry point. It includes the standard
GenomeSpy runtime and the built-in data source and format registrations.

`@genome-spy/core/minimal` provides the same `embed` API without built-in
renderers or optional data loaders. Import at least one live renderer and any
data source or format modules you need explicitly:

```js
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/data/formats/parquet.js";
import "@genome-spy/core/data/sources/lazy/bigBedSource.js";

const spec = {
  // view specification that uses the lazy bigBed source
};

const api = await embed(document.body, spec);
```

The `webgl.js` import enables WebGL2. The `canvas.js` import enables Canvas2D
with software datum picking, plus a fallback for raster export and hybrid SVG
rasterization. Software picking is included automatically and needs no separate
import. Import `@genome-spy/core/rendering/svg.js` when using SVG export or
analysis. You can omit any renderer capability the host application does not
use; Core reports the required import if an unavailable capability is
requested.

## API object

The `embed` function returns a promise that resolves into an object that
provides the current public API. The API is documented in the [interface
definition](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/types/embedApi.d.ts).

For practical examples of using the API, check the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package.

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

See the [commented example](https://github.com/genome-spy/genome-spy/blob/master/packages/embed-examples/src/controls.js)
for custom actions, or the [Control contract](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/controls.js)
for controls with their own lifecycle.

The Inspector package also provides an [inspectorButton()](./inspector.md#core-embeds).

All placements attach to the same container without changing its size.
Top/bottom controls sit outside it: provide space (e.g. `margin-block: 48px`)
and allow overflow. Inside controls overlay the plot.

## Debugging embeds

Use the [Inspector](./inspector.md) to inspect the live view hierarchy,
resolutions, params, and dataflow of embedded visualizations. Core embeds can
attach the inspector through the `@genome-spy/inspector` package.

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

## Debugging embeds

Use the [Inspector](./inspector.md) to inspect the live view hierarchy,
resolutions, params, and dataflow of embedded visualizations. Core embeds can
attach the inspector through the `@genome-spy/inspector` package.

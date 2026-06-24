# JavaScript API

The public JavaScript API is currently quite minimal.

## Embedding

See the [getting started](./getting-started.md) page.

## Entry points

When embedding GenomeSpy into a web application, you can choose between two
entry points for importing the `embed` function:

`@genome-spy/core` is the default entry point. It includes the standard
GenomeSpy runtime and the built-in data source and format registrations.

`@genome-spy/core/minimal` provides the same `embed` API without the built-in
loaders. Import the data source and format modules you need explicitly:

```js
import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/data/formats/parquet.js";
import "@genome-spy/core/data/sources/lazy/bigBedSource.js";
```

## The API

The `embed` function returns a promise that resolves into an object that
provides the current public API. The API is documented in the [interface
definition](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/types/embedApi.d.ts).

For practical examples of using the API, check the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package. The
[view mutation example](https://github.com/genome-spy/genome-spy/blob/master/packages/embed-examples/src/viewMutationApi.js)
demonstrates adding, removing, reordering, and positioning external controls
next to live views.

## View hierarchy

The `views` API inspects and controls the live layout hierarchy of an embedded
GenomeSpy instance. It supports addressing views, reading their rendered layout
bounds, listening for layout updates, and adding, removing, or reordering child
views in mutable container views such as concat and layer views.

The hierarchy exposed by the API matches the layout tree derived from the
visualization spec. The root may be an implicit layout container, for example
when a root unit view is wrapped to provide axes, titles, or other guides. Use
`api.views.root()` to inspect the actual runtime root.

Views can be addressed with:

- `"root"` for the runtime root layout view
- a `ViewHandle` returned by the API
- a selector such as `{ scope: [], view: "tracks" }`

When inserting the same spec multiple times, pass `scope` to make each instance
independently addressable:

```js
const tracks = api.views.get({ scope: [], view: "tracks" });

const summary = await api.views.insert(tracks, summaryTrackSpec, {
  scope: "sample-1-summary",
});

const summaryView = api.views.get({
  scope: ["sample-1-summary"],
  view: "summary",
});
```

Mutation methods are asynchronous. Await the returned promise before using the
new hierarchy. Handles remain stable while their views are live; after removing
a subtree, `handle.isAlive()` returns `false`.

Use `getLayoutBounds()` to position external UI relative to a view. Bounds are
reported in CSS pixels in the embedded GenomeSpy canvas coordinate space.
Convert them to DOM coordinates when the external UI does not share the same
positioning origin. The method returns `undefined` until the view has been
rendered or when the address cannot be resolved:

```js
const bounds = api.views.getLayoutBounds(summary);
```

Use `subscribeToLayout()` to update external UI after GenomeSpy has recomputed
view bounds. The method returns an unsubscribe function:

```js
const unsubscribe = api.views.subscribeToLayout(() => {
  const bounds = api.views.getLayoutBounds(summary);
});
```

Use `move()` to reorder a view within its current parent. The destination
`index` is evaluated after temporarily removing the target from its parent:

```js
await api.views.move(summary, { index: 0 });
```

Use `transaction()` to apply ordered mutations while deferring layout work until
the outer transaction finishes:

```js
await api.views.transaction(async (views) => {
  const inserted = await views.insert(tracks, summaryTrackSpec, {
    scope: "sample-2-summary",
  });

  await views.move(inserted, { index: 0 });
});
```

The initial mutation API does not move views between different parent
containers.

## Embed options

The `embed` function accepts an optional options object.

## Named data

Named data sources allow data to be provided at runtime instead of loading it
from a URL or embedding it directly in the specification. In the view
specification, declare a named data source with the `data.name` property:

```json
{
  "data": {
    "name": "myResults"
  },
  ...
}
```

There are two ways to provide the data:

### `updateNamedData()`

Use `updateNamedData(name, data)` when your application provides updated data
explicitly.

```js
const api = await embed("#container", spec);

api.updateNamedData("myResults", [
  { x: 1, y: 2 },
  { x: 2, y: 3 },
]);
```

### `namedDataProvider`

Use the `namedDataProvider` embed option when GenomeSpy should load named data
on demand.

```js
const api = await embed("#container", spec, {
  namedDataProvider(name) {
    if (name == "myResults") {
      return [
        { x: 1, y: 2 },
        { x: 2, y: 3 },
      ];
    }
  },
});
```

If `updateNamedData(name)` is called without the second argument, GenomeSpy
retrieves the data from the provider instead.

Named data can be updated dynamically, but it does not automatically react to
user interactions. For practical examples, see the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package.

### Named data provider

See [Named data](#named-data).

### Theme config

Use the `theme` embed option to provide global defaults without modifying the
specification itself:

```js
embed(container, spec, {
  theme: {
    mark: { color: "#1f77b4" },
    point: { size: 80 },
    scale: { nominalColorScheme: "set2" },
  },
});
```

Theme config is merged before `spec.config`, so spec-local config and explicit
properties still take precedence.

See also [Config, Themes, and Styles](./grammar/config.md).

### Named scales

Named scales can be accessed through `getScaleResolutionByName()`. To define a
named scale in a spec, set `scale.name`. See [Scale](./grammar/scale.md).

### Parameters

Named parameters can be accessed through `getParam()`. The returned handle can
read and write the parameter value and subscribe to changes:

```js
const api = await embed(container, spec);
const threshold = api.getParam("threshold");

console.log(threshold.getValue());
threshold.setValue(5);

const unsubscribe = threshold.subscribe((value) => {
  console.log("threshold changed", value);
});
```

Variable parameters and interval selections can be read and written. Use
`intervalSelection()` to construct interval selection values:

```js
import { embed, intervalSelection } from "@genome-spy/core";

const brush = api.getParam("brush");
brush.setValue(intervalSelection({ x: [10, 20] }));
```

Current limitations:

- Parameters are addressed by name only. If the name resolves to multiple
  independent parameters, `getParam()` throws an ambiguity error.
- Computed `expr` parameters are readable but cannot be written.
- Point selections are readable but cannot be written through the API because
  valid values require GenomeSpy-generated datum ids.
- Projected selections are not supported.

For examples, see the `paramApi` and `brushLinkingApi` pages in the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package.

### Custom tooltip handlers

GenomeSpy provides two built-in tooltip handlers.

The
[`default`](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/tooltip/dataTooltipHandler.js)
handler displays the underlying datum's properties in a table. Property names
starting with an underscore are omitted. The values are formatted for
readability.

When positional channels use a `"locus"` scale, the default handler also shows
derived genomic rows before raw rows:

- `Coordinate` for single positions
- `Interval` for genomic ranges
- `Endpoint 1` / `Endpoint 2` for two independent endpoints
- `X ...` / `Y ...` prefixes when both axes contribute genomic rows

Raw source fields are hidden only when the mapping from source fields to
linearized coordinates can be verified for the hovered datum.

The
[`refseqgene`](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/tooltip/refseqGeneTooltipHandler.js)
handler fetches a summary description for a gene symbol using the
[Entrez](https://www.ncbi.nlm.nih.gov/home/develop/api/) API. For an example,
see the RefSeq gene track in
[this notebook](https://observablehq.com/@tuner/annotation-tracks).
Custom search terms can be provided through the `params` property.

Handlers are functions that receive the hovered mark's underlying datum and
return a promise that resolves to a string, HTMLElement, or lit-html
[TemplateResult](https://lit.dev/docs/libraries/standalone-templates/).

The function signature:

```ts
export type TooltipHandler = (
  datum: Record<string, any>,
  mark: Mark,
  /** Optional parameters from the view specification */
  params?: TooltipHandlerParams,
  /** Optional precomputed context */
  context?: TooltipContext
) => Promise<string | TemplateResult | HTMLElement>;
```

`TooltipContext` may include:

- `genomicRows`: derived genomic rows
- `hiddenRowKeys`: raw row keys hidden by the default handler
- `flattenDatumRows()`: utility for flattening datum fields
- formatting utilities such as `formatGenomicLocus()` and
  `formatGenomicInterval()`

The `default` handler accepts optional genomic display mode configuration in
`params`:

```json
{
  "genomicCoordinates": {
    "x": { "mode": "auto" },
    "y": { "mode": "disabled" }
  }
}
```

Supported `mode` values:

- `"auto"` (default)
- `"locus"`
- `"interval"`
- `"endpoints"`
- `"disabled"`

Use the `tooltipHandlers` option to register custom handlers or override the
default. See the example below.

#### Examples

Overriding the `default` handler:

```js
import { html } from "lit-html";

const options = {
  tooltipHandlers: {
    default: async (datum, mark, props) => html`
      The datum has
      <strong>${Object.keys(datum).length}</strong> attributes!
    `,
  },
};

embed(container, spec, options);
```

To use a specific (custom) handler in a view specification:

```json
{
  "mark": {
    "type": "point",
    "tooltip": {
      "handler": "myhandler",
      "params": {
        "custom": "param"
      }
    }
  },
  ...
}
```

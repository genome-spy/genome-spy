# JavaScript API

The public JavaScript API is currently quite minimal.

## Embedding

See the [getting started](./getting-started.md) page.

## The API

The `embed` function returns a promise that resolves into an object that
provides the current public API. The API is documented in the [interface
definition](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/types/embedApi.d.ts).

For practical examples on using the API, check the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package.

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

Use `updateNamedData(name, data)` when your application pushes updated data
explicitly.

```js
const api = await embed("#container", spec);

api.updateNamedData("myResults", [
  { x: 1, y: 2 },
  { x: 2, y: 3 },
]);
```

### `namedDataProvider`

Use the `namedDataProvider` embed option when GenomeSpy should pull named data
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
user interactions. For practical examples, check the
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

### Custom tooltip handlers

GenomeSpy provides two built-in tooltip handlers.

The
[`default`](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/tooltip/dataTooltipHandler.js)
handler displays the underlying datum's properties in a table. Property names
starting with an underscore are omitted. The values are formatted nicely.

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
check the RefSeq gene track in
[this notebook](https://observablehq.com/@tuner/annotation-tracks).
Custom search terms can be provided through the `params` property.

Handlers are functions that receive the hovered mark's underlying datum and
return a promise that resolves into a string, HTMLElement, or lit-html
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

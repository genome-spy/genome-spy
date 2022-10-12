# JavaScript API

The public JavaScript API is currently quite minimal.

## Embedding

See the [getting started](./getting-started.md) page.

## The API

The `embed` function returns a promise that resolves into an object that
provides the current public API. The API is documented in the [interface
definition](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/embedApi.d.ts).

For practical examples on using the API, check the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package.

## Embed options

The `embed` function accepts an optional options object.

### Named data provider

See the API definition.

### Custom tooltip handlers

GenomeSpy provides two built-in tooltip handlers.

The
[`default`](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/tooltip/dataTooltipHandler.js)
handler displays the underlying datum's properties in a table. Property names
starting with an underscore are omitted. The values are formatted nicely.

The
[`refseqgene`](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/tooltip/refseqGeneTooltipHandler.js)
handler fetches a summary description for a gene symbol using the
[Entrez](https://www.ncbi.nlm.nih.gov/home/develop/api/) API. For an example,
check the RefSeq gene track in
[this notebook](https://observablehq.com/@tuner/annotation-tracks).

Handlers are functions that receive the hovered mark's underlying datum and
return a promise that resolves into a string, HTMLElement, or lit-html
[TemplateResult](https://lit.dev/docs/libraries/standalone-templates/).

The function signature:

```ts
export type TooltipHandler = (
  datum: Record<string, any>,
  mark: Mark,
  /** Optional parameters from the view specification */
  params?: Record<string, any>
) => Promise<string | TemplateResult | HTMLElement>;
```

Use the `tooltipHandlers` option to register custom handlers or override the
default. See the example below.

#### Examples

Overriding the `default` handler:

```js
import { html } from "lit-html";

const options = {
  tooltipHandlers: {
    default: async (datum, mark, props) =>
      html`
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

# JavaScript API

The JavaScipt API is currently quite minimal.

## Embedding

See the [getting started](./getting-started.md) page.

## Methods in the result object

The `embed` function returns a promise that resolves into an object that provides
the current public API. The following methods are currently exposed:

<a name="api_finalize" href="#api_finalize">#</a>
api.<b>finalize</b>()

Releases all resources and unregisters event listeners, etc.

<a name="api_addEventListener" href="#api_addEventListener">#</a>
api.<b>addEventListener</b>(<i>type</i>, <i>callback</i>)

Adds an event listener, which is called when the user interacts with a mark
instance. Currently, only `"click"` events are supported. The callback receives
an event object as its first (and only) parameter. Its `datum` property
contains the datum that the user interacted with.

## Embed options

### Custom tooltip handlers

GenomeSpy provides two built-in tooltip handlers.

The
[`default`](https://github.com/tuner/genome-spy/blob/master/packages/genome-spy/src/utils/tooltip/dataTooltipHandler.js)
handler displays the underlying datum's properties in a table. Property names
starting with an underscore are omitted. The values are formatted nicely.

The
[`refseqgene`](https://github.com/tuner/genome-spy/blob/master/packages/genome-spy/src/utils/tooltip/refseqGeneTooltipHandler.js)
handler fetches a summary description for a gene symbol using the
[Entrez](https://www.ncbi.nlm.nih.gov/home/develop/api/) API. For an example,
check the RefSeq gene track in
[this notebook](https://observablehq.com/@tuner/annotation-tracks).

Handlers are functions that receive the hovered mark's underlying datum and
return a promise that resolves into a lit-html
[TemplateResult](https://lit.dev/docs/libraries/standalone-templates/).

The function signature:

```ts
export type TooltipHandler = (
  datum: Record<string, any>,
  mark: Mark,
  /** Optional parameters from the view specification */
  params?: Record<string, any>
) => Promise<TemplateResult>;
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
      `
  }
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

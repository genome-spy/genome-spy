# Embed Options

The `embed` function accepts an optional options object.

## Rendering backend

GenomeSpy uses WebGL2 when available. The default `renderer: "auto"` setting
falls back to the Canvas2D compatibility renderer when WebGL2 initialization
fails and reports the fallback once in the browser console.

Select Canvas2D explicitly on restricted desktops where browser policy blocks
WebGL:

```js
const api = await embed(container, spec, {
  renderer: "canvas",
});
```

`renderer: "canvas"` does not request a WebGL or WebGPU context.
`renderer: "webgl"` requires WebGL2 and reports an error instead of falling
back. Canvas2D may still be accelerated internally by the browser, so the
setting does not guarantee that the browser uses no GPU hardware.

Canvas2D supports live layout, axes, legends, zooming, panning, dynamic data,
visibility changes, and PNG export. It projects geometry on the CPU and
repaints the full Canvas surface immediately. It is intended as a compatibility
mode; dense views can be slower than WebGL.

### Canvas2D limitations

- Datum picking is disabled. Data tooltips, datum clicks, hover-dependent mark
  behavior, and point-selection hit testing are unavailable. Coordinate-based
  view and scale interactions continue to work. Instance-level click events
  report `datum: null`.
- Text uses browser-native Canvas fonts. Metrics, rasterization, and
  antialiasing can differ from WebGL and SVG output, especially when a requested
  font is unavailable.
- Some specialized effects, including rectangle hatches and shadows, are
  approximated or ignored. GenomeSpy reports a deduplicated console warning
  when this occurs.

Raster export uses the active rendering backend. A Canvas2D embed therefore
exports PNG images without WebGL. See [Instance, Events, and
Export](./instance.md) for export options.

## Theme config

The `theme` embed option provides global defaults without modifying the
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

See also [Config, Themes, and Styles](../grammar/config.md).

## Custom tooltip handlers

GenomeSpy provides two built-in tooltip handlers.

The
[`default`](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/tooltip/dataTooltipHandler.js)
handler displays the underlying datum's properties in a table. Property names
starting with an underscore are omitted. The values are formatted for
readability.

Specs can choose which rows the `default` handler shows with
`encoding.tooltip`. If the channel is omitted, the handler shows the hovered
datum's properties. If the channel is `null`, raw datum rows are hidden for that
mark. Each row can be a field, expression, datum, or value definition.

```json
{
  "mark": "point",
  "encoding": {
    "x": { "field": "position", "type": "quantitative" },
    "y": { "field": "score", "type": "quantitative" },
    "tooltip": [
      { "field": "sample", "title": "Sample" },
      { "field": "score", "title": "Score", "format": ".2f" },
      { "expr": "datum.score > 10 ? 'high' : 'low'", "title": "Class" }
    ]
  }
}
```

`mark.tooltip` selects or disables the tooltip handler. `encoding.tooltip`
selects the rows passed to the default handler.

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

- `tooltipRows`: rows selected by `encoding.tooltip`
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

The `tooltipHandlers` option registers custom handlers or overrides the default.
See the example below.

### Examples

Overriding the `default` handler:

```js
import { html } from "lit-html";

const options = {
  tooltipHandlers: {
    default: async (datum, mark, params) => html`
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

## Styling tooltips

The built-in tooltip element has the `gs-tooltip` class. Use this class
to customize its appearance in the embedding page. The `sticky` class is added
while a tooltip is pinned open.

```css
.gs-tooltip {
  --background-color: white;
  --font-size: 14px;
}
```

The class is namespaced to avoid conflicts with tooltip styles from CSS
frameworks such as Bootstrap.

# Runtime State

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

Call `updateNamedData(name, data)` when your application provides updated data
explicitly.

```js
const api = await embed("#container", spec);

api.updateNamedData("myResults", [
  { x: 1, y: 2 },
  { x: 2, y: 3 },
]);
```

### `namedDataProvider`

The `namedDataProvider` embed option lets GenomeSpy load named data on demand.

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

## Named scales

A scale resolution is the scale instance shared by one or more view encodings.
Composition settings determine whether child views share a scale resolution or
use independent ones. See
[Scale, Axis, and Legend Resolution](../grammar/composition/index.md#scale-axis-and-legend-resolution).

Name a scale resolution with `scale.name` to access it from the embed API with
`getScaleResolutionByName(name)`. The name identifies the resolved scale, not an
individual view encoding. Shared encodings can use the same `scale.name`, while
independent scale resolutions must have unique names.

`getScaleResolutionByName(name)` returns `undefined` when the name is not
registered.

Named scales are useful when host application code needs to read the current
domain, zoom a view programmatically, or synchronize domains between embedded
GenomeSpy instances. See also [Scale](../grammar/scale.md).

```json
{
  "encoding": {
    "x": {
      "field": "x",
      "type": "quantitative",
      "scale": {
        "name": "detailScale",
        "domain": [0, 100],
        "zoom": true
      }
    }
  }
}
```

```js
const detailScale = api.getScaleResolutionByName("detailScale");
if (!detailScale) {
  throw new Error("Missing named scale: detailScale");
}

console.log(detailScale.getDomain());

await detailScale.zoomTo([25, 50]);
```

### Domains

`getDomain()` returns the current domain used by the scale. For locus scales,
this is the linearized numeric domain.

`getComplexDomain()` returns the current domain converted back to complex
domain values when available, such as genomic loci for locus scales. See
[Specifying the domain](../grammar/scale.md#specifying-the-domain) for locus
domain syntax.

```js
const genomeScale = api.getScaleResolutionByName("genomeScale");
if (!genomeScale) {
  throw new Error("Missing named scale: genomeScale");
}

console.log(genomeScale.getDomain());
console.log(genomeScale.getComplexDomain());
```

For a locus scale, `zoomTo()` accepts either a linearized numeric interval or a
complex genomic interval:

```js
await genomeScale.zoomTo([{ chrom: "chr8" }, { chrom: "chr10" }]);
await genomeScale.zoomTo([400_000_000, 500_000_000]);
```

Pass `{ duration: true }` or `{ duration: milliseconds }` to animate the zoom:

```js
await genomeScale.zoomTo([{ chrom: "chr1" }, { chrom: "chrM" }], {
  duration: true,
});
```

### Domain events

Named scales emit a `"domain"` event when their domain changes. Listen to the
event when external UI must reflect zoom or pan state:

```js
const genomeScale = api.getScaleResolutionByName("genomeScale");
if (!genomeScale) {
  throw new Error("Missing named scale: genomeScale");
}

const listener = (event) => {
  console.log(event.scaleResolution.getComplexDomain());
};

genomeScale.addEventListener("domain", listener);
```

Remove listeners when they are no longer needed:

```js
genomeScale.removeEventListener("domain", listener);
```

Domain events can also drive application-level linking. For example, a brush
parameter in one embed can call `zoomTo()` on a named scale in another embed.

For examples, see the `scaleApi`, `brushLinkingApi`, and `linkedEmbeds` pages
in the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package.

## Parameters

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

Variable parameters and interval selections can be read and written.
`intervalSelection()` constructs interval selection values:

```js
import { embed, intervalSelection } from "@genome-spy/core";

const brush = api.getParam("brush");
brush.setValue(intervalSelection({ x: [10, 20] }));
```

Current limitations:

- Parameters are addressed by name only. If the name resolves to multiple
  independent parameters, `getParam()` throws an ambiguity error.
- Parameters declared with `push: "outer"` are resolved as aliases of the
  outer parameter they write to.
- Computed `expr` parameters are readable but cannot be written.
- Point selections are readable but cannot be written through the API because
  valid values require GenomeSpy-generated datum ids.
- Projected selections are not supported.

For spec-side parameter behavior, including input bindings, selections, and
`push: "outer"` for linking scale domains, see
[Parameters](../grammar/parameters.md).

For examples, see the `paramApi` and `brushLinkingApi` pages in the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package.

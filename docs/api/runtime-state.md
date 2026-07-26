# Runtime State

## Named data

Named data sources allow data to be provided at runtime instead of loading it
from a URL. Declare the dataset in the view that owns it and reference it with
`data.name`:

```json
{
  "name": "resultsOwner",
  "datasets": {
    "myResults": []
  },
  "data": {
    "name": "myResults"
  },
  ...
}
```

`datasets` declarations are lexically scoped through the data-parent
hierarchy. Descendants can reference an ancestor's declaration, while a
descendant declaration with the same name shadows it. Repeated import instances
therefore own independent datasets.

### Updating named data

Resolve the declaring view and call `setNamedData()` on its handle:

```js
const api = await embed("#container", spec);
const owner = api.views.get({
  scope: [],
  view: "resultsOwner",
});

owner.setNamedData("myResults", [
  { x: 1, y: 2 },
  { x: 2, y: 3 },
]);
```

The handle must represent the exact view containing the `datasets` property.
Calling `setNamedData()` on a descendant does not modify an ancestor's dataset.
This makes ownership explicit when the same name occurs in multiple subtrees.

`resetNamedData()` removes the runtime override and restores the values from
the declaration:

```js
owner.resetNamedData("myResults");
```

To avoid an initially empty dataset, a host can place initial rows in the
JavaScript specification before embedding:

```js
spec.datasets.myResults = initialRows;
const api = await embed("#container", spec);
```

Named data can be updated dynamically, but it does not automatically react to
user interactions. For practical examples, see the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package.

### Deprecated global APIs

`api.updateNamedData(name, data)` and the `namedDataProvider` embed option are
deprecated. They use embed-wide name lookup, which cannot address repeated or
shadowed declarations reliably.

Existing integrations may continue using them during the compatibility period.
A global update throws when the name identifies multiple scoped datasets.
Migrate by adding a `datasets` declaration to the intended owner and calling
`setNamedData()` or `resetNamedData()` through that view's handle.

Undeclared `data.name` references also retain their embed-wide fallback
behavior temporarily. New specifications should declare every named dataset
explicitly.

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

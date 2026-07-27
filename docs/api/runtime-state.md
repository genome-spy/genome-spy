# Runtime State

## Named data

Named data sources allow data to be provided at runtime instead of loading it
from a URL. Declare every named dataset in the `datasets` property of the view
that owns it, and reference it with `data.name`:

```json
{
  "datasets": {
    "myResults": []
  },
  "data": {
    "name": "myResults"
  },
  ...
}
```

`datasets` declarations are lexically scoped through nested views. A view can
reference a dataset declared on itself or an enclosing view. A more deeply
nested declaration with the same name shadows the enclosing declaration.
Repeated import instances therefore own independent datasets. The declaration
establishes the owner used for scoped runtime updates.

### Updating named data

Use the embed-level `datasets` API for a dataset declared by the top-level input
specification:

```js
const api = await embed("#container", spec);

api.datasets.set("myResults", [
  { x: 1, y: 2 },
  { x: 2, y: 3 },
]);
```

`api.datasets` always targets the top-level authored specification, even when
GenomeSpy adds an implicit layout wrapper. It never searches nested views by
name.

For a declaration in a nested or imported view, use the exact declaring view's
`datasets` API:

```js
const owner = api.views.get({
  scope: ["translationA"],
  view: "translationA",
});

owner.datasets.set("geneticCode", rows);
```

Updates do not search ancestors or descendants. Exact ownership keeps updates
unambiguous when multiple subtrees use the same dataset name.

`datasets.reset()` removes the runtime override and restores the values from
the declaration:

```js
api.datasets.reset("myResults");
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
`api.datasets.set()` or `api.datasets.reset()` for a top-level declaration, or
the owning view handle's `datasets` methods for a nested declaration.

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

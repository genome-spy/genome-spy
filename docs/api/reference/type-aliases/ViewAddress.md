[GenomeSpy Core API](../index.md) / ViewAddress

# Type Alias: ViewAddress

> **ViewAddress** = [`ViewHandle`](../interfaces/ViewHandle.md) \| `ViewSelector` \| `"root"`

Address of a view in the live layout hierarchy.

Use a `ViewSelector` to resolve an authored, named view within import or
insertion scopes. Selectors cannot reliably identify anonymous views,
repeated instances, or one particular dynamically inserted instance. Use a
`ViewHandle` for the exact live view returned by this API, including those
cases. Use `"root"` to address the root view.

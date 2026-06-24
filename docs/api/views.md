# View Hierarchy

The `views` API exposes the live layout hierarchy of an embedded GenomeSpy
instance. It can inspect views, read rendered bounds for external UI, and mutate
children of supported container views.

The hierarchy matches the layout tree derived from the visualization spec.
GenomeSpy may add an implicit root layout container, for example when a root
unit view needs space for axes, titles, or other guides. Use
`api.views.root()` to inspect the actual runtime root.

## Addressing views

Most `views` methods accept a view address. A view can be addressed with:

- `"root"` for the runtime root layout view
- a `ViewHandle` returned by the API
- a selector such as `{ scope: [], view: "tracks" }`

Use a handle after resolving, inserting, or traversing views through the API.
Use a selector for durable references to named views, especially when the same
spec or template may appear more than once.

`api.views.get(address)` resolves an address and throws if it cannot be
resolved. `api.views.resolve(address)` returns `undefined` instead.

```js
const root = api.views.root();
const tracks = api.views.get({ scope: [], view: "tracks" });

console.log(root.children());
console.log(tracks.parent());
```

## Selector scopes

A selector scope is a namespace for addressing named views. The root namespace
is `[]`, so `{ scope: [], view: "tracks" }` resolves a view named `"tracks"` in
the top-level spec.

Scopes are created by named import instances and by
[`insert(..., { scope })`](#inserting-views).
In an import spec, `name` overrides the imported view's own name and creates the
scope for addressing descendant views. See
[Importing Views](../grammar/import.md#repeating-with-named-templates) for
import-specific details.

A scope does not replace a descendant view's own `name`; it is the path used to
reach the namespace that contains the view.

For example, if a track spec named `"signalTrack"` is inserted with
`scope: "sample-1-signal"`, the inserted view can be addressed as:

```js
api.views.get({
  scope: ["sample-1-signal"],
  view: "signalTrack",
});
```

Nested scopes are written from outermost to innermost:

```js
api.views.get({
  scope: ["panelA", "innerA"],
  view: "coverage",
});
```

Use scopes when the same spec, template, or imported view can appear more than
once. Each scope name must be unique within its parent scope. View names only
need to be unambiguous within the selected scope.

## Inspecting the hierarchy

A `ViewHandle` is a live reference to a view. It exposes the view's `id`,
`name`, selector, public type, parent, and current children.

```js
const tracks = api.views.get({ scope: [], view: "tracks" });

for (const child of tracks.children()) {
  console.log(child.name, child.type, child.selector);
}
```

Handles remain stable while their views are live. After removing a subtree,
`handle.isAlive()` returns `false`.

```js
if (tracks.isAlive()) {
  console.log(tracks.children().length);
}
```

## Reading layout bounds

`getLayoutBounds()` returns the rendered bounds of a view for positioning
external UI. Bounds are reported in CSS pixels in the embedded GenomeSpy canvas
coordinate space. Convert them to DOM coordinates when the external UI does not
share the same positioning origin.

The method returns `undefined` until the view has been rendered or when the
address cannot be resolved:

```js
const bounds = api.views.getLayoutBounds({ scope: [], view: "tracks" });
```

`subscribeToLayout()` runs a callback after GenomeSpy has recomputed view
bounds, which is useful for updating external UI. The method returns an
unsubscribe function:

```js
const unsubscribe = api.views.subscribeToLayout(() => {
  const bounds = api.views.getLayoutBounds(tracks);
});
```

## Mutating views

Mutation methods are asynchronous because view creation, imports, dataflow
initialization, data loading, guide rebuilding, and layout updates may all be
involved. Await the returned promise before using the new hierarchy.

### Inserting views

`insert(parent, spec, options)` adds a child view under a mutable container. The
parent must be a concat or layer view. The inserted value is a view spec or an
import spec, the same kind of object that appears inside `vconcat`, `hconcat`,
or `layer` in a visualization specification.

When inserting the same spec multiple times, pass `scope` to create a selector
namespace for each inserted subtree:

```js
const signalTrackSpec = {
  name: "signalTrack",
  data: {
    // ...
  },
  mark: "point",
  encoding: {
    // ...
  },
};

const tracks = api.views.get({ scope: [], view: "tracks" });

const signalTrack = await api.views.insert(tracks, signalTrackSpec, {
  scope: "sample-1-signal",
});

const sameSignalTrack = api.views.get({
  scope: ["sample-1-signal"],
  view: "signalTrack",
});
```

Pass `index` to insert at a specific child position. If omitted, the new child
is appended.

```js
await api.views.insert(tracks, signalTrackSpec, {
  index: 0,
  scope: "sample-2-signal",
});
```

### Removing views

`remove(target)` removes a view and disposes its subtree. Removing the root view
is not supported.

```js
await api.views.remove(signalTrack);

console.log(signalTrack.isAlive()); // false
```

### Moving views

`move()` reorders a view within its current parent. The destination `index` is
evaluated after temporarily removing the target from its parent:

```js
await api.views.move(signalTrack, { index: 0 });
```

The mutation API does not move views between different parent containers.

### Transactions

`transaction()` applies ordered mutations while deferring layout work until the
outer transaction finishes:

```js
await api.views.transaction(async (views) => {
  const inserted = await views.insert(tracks, signalTrackSpec, {
    scope: "sample-3-signal",
  });

  await views.move(inserted, { index: 0 });
});
```

The
[view mutation example](https://github.com/genome-spy/genome-spy/blob/master/packages/embed-examples/src/viewMutationApi.js)
demonstrates adding, removing, reordering, and positioning external controls
next to live views.

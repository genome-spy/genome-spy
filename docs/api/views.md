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

## Marks and scoped interaction

Each handle exposes `marks` for interaction with marks in that view's subtree.
Mark events use the current confirmed pointer hit and are synchronous; they do
not start a new pick or wait for GPU readback. Rapid clicks can therefore be
missed when no confirmed hover hit exists. Hosts that need an answer can call
`pick()` from a native event subscription after synchronously preventing the
browser default.

```js
const track = api.views.get({ scope: [], view: "track" });

const stopHover = track.marks.observeHover((hit) => {
  inspector.textContent = hit ? JSON.stringify(hit.datum) : "No mark";
});

const stopClick = track.marks.subscribe("click", ({ hit }) => {
  inspect(hit.view, hit.datum);
});

const result = await track.marks.pick({ x: 120, y: 80 });
if (result.status === "hit") {
  inspect(result.hit.view, result.hit.datum);
}
```

`pick()` returns `hit`, `empty`, or `invalidated`. A query is invalidated when
the scene changes or the embed is finalized while it is pending. `MarkHit.view`
is the canonical unit handle, `uniqueId` is the existing picking ID for the
current scene, and `datum` is a detached shallow copy without the internal ID.
Nested datum values are not deep-cloned.

## Parameters and selections

`api.params` starts at the authored top-level specification, while
`view.params` starts at that view's lexical scope. Both expose the nearest
declaration and distinguish a child selection that writes to an outer value
from the outer declaration itself.

```js
const brush = track.params.getSelection("brush");
const stopBrush = brush.subscribe((snapshot) => updateForm(snapshot), {
  delivery: "commit",
});

if (brush.type === "interval" && brush.contains({ x: 120, y: 80 })) {
  brush.clear();
}
```

Selection snapshots are detached plain objects. Interval snapshots contain
numeric domain ranges and `null` for unset channels. Point snapshots contain
zero or more detached row objects. `active` means the selection is nonempty.
Subscriptions are future-only and default to `delivery: "change"`; committed
interval delivery fires after a completed brush or changed programmatic write.
Cancellation and disposal do not create a commit. Call `clear()` to cancel an
active brush and publish the cleared state once when it changed.

For a runnable browser form and notebook bridge, see the `annotationEditor` and
`selectionForm` pages in the [embed examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples).

## Updating named data

Use `api.datasets` for declarations in the top-level input specification. For a
declaration in a nested or imported view, resolve the exact declaring view:

```js
const owner = api.views.get({
  scope: ["translationA"],
  view: "translationA",
});

owner.datasets.set("geneticCode", rows);
owner.datasets.reset("geneticCode");
```

Descendants can reference the declaration, but updates do not search ancestors.
Use the declaring view's handle so that repeated imports and nested subtrees
remain independent.

See [Runtime State](runtime-state.md#named-data) for declarations, initial data,
and migration from the deprecated global APIs.

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

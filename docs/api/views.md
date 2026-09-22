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

## Describing and reading a track

Load the optional query module when an application needs track metadata or
bounded row inspection. Create it with the embedded instance's view API:

```js
const { createViewQuery } = await import("@genome-spy/core/view-query");
const query = createViewQuery(api.views);
```

Core and the query module must come from the same installed Core module instance.
This works with the default, minimal and full module entry points. Mixing a
standalone `@genome-spy/core/browser` bundle with a separately bundled query
module is not supported. Core does not load or include the query module unless
the application imports it.

`query.describe(address)` returns detached title, description, authored and inherited encoding,
data readiness and collector `dataRevision` metadata (null without a collector). Encoding excludes mark defaults and runtime
adjustments. `dataReady` reports unit-view data readiness for the current viewport;
it is false for containers. A unit view also supports bounded reads of its loaded,
transformed rows:

```js
const track = api.views.get({ scope: [], view: "track" });
console.log(query.describe(track));
const result = query.readData(track, { limit: 100 });
console.log(result.rows, result.truncated, result.rowsExamined);
```

Query methods accept a handle from this embed, a scoped selector, or
`"root"`. A selector resolves the current view on each call; a handle continues
to refer to its original view and becomes stale when that view is removed.

The limit must be an integer from 0 to 1000. A read examines at most `limit + 1`
rows, including lookahead for truncation. Rows follow the current data collector
order and include derived fields, excluding Core picking identifiers. Nested
values are detached using structured cloning; non-cloneable values and
shared-memory buffers throw. This also applies to buffers nested in maps, sets,
or typed arrays. Metadata rejects shared memory as well. Source getters run during
cloning; reads expect trusted data. The row limit does not bound an individual
row's byte size or the time spent cloning it.

The returned scope is `loaded-transformed`. Navigation does not filter eager
loaded rows by the viewport. A non-truncated result means all currently loaded
transformed rows were returned; it does not establish full source coverage for
lazy data. Reads reject unready data, containers, stale handles, and multiple
facet batches, including empty batches. Readiness concerns data, not completion
of a rendered frame.
Query operations reject a finalized embed with `staleEmbed` and a removed
handle with `staleHandle`. A successful read has no separate `ready` flag.
Bounded reads serve inspection and small examples; repeated reads are not an
API for computing statistics over a large collection.

## Querying the current slice

`query.queryData()` filters loaded transformed data to the current data-space
viewport **before** limiting returned rows or computing aggregates. Navigate or
set an interval selection, wait for data readiness, then query the relevant axes:

```js
const result = await query.queryData(track, {
  channels: ["x"],
  limit: 10,
  fields: ["logR"],
  aggregate: [
    { op: "count", as: "count" },
    { op: "mean", field: "logR", as: "meanLogR" },
  ],
  signal: controller.signal,
});
console.log(result.rows, result.aggregates, result.scope);
```

The limit (0–1000) bounds output rows, not the matching population. `rowsExamined`
counts all visited loaded rows; `rowsMatched` counts all rows in the slice.
`truncated` concerns only row output; aggregates use every matching loaded row.
Setting `limit: 0` computes aggregates without copying any source rows.
Operations `count`, `valid`, `sum`, `min`, `max`, `mean` and `variance` share the
aggregate transform's numeric semantics. Undefined results, such as an empty
mean, are returned as null. Count includes rows with missing field values;
`valid` counts numeric values using the existing aggregate operation. Min/max
retain input values (including nonnumeric values) exactly as the transform does;
all returned aggregate values are detached and shared memory is rejected.

Each requested axis uses its captured numeric or locus scale domain. Points use
half-open containment; ranged positions overlap the half-open slice. Equal
endpoints use point containment, including the scalar axis of a rule. Locus values
are already linearized by Core, including encoding offsets. Optional
`selection: "region"` intersects the viewport with the named interval parameter
in the queried view's scope. Inactive dimensions do not constrain active ones;
a wholly cleared selection matches no rows. Selection axes
not listed in `channels` still constrain the result. This is a data-space query;
it does not account for pixel occlusion, clipping or mark size.

The result records domains, selection state, collector revision and the
`loaded-transformed` data scope. Source coverage remains `unknown`: readiness for
the viewport does not prove full source coverage. The query rejects unready data,
multiple facet batches and positions expressed with dynamic expressions or
conditional encodings. Ordinary field and numeric datum positions use Core's
normalized mark accessors; categorical and pixel-valued positions are unsupported.

Scanning yields cooperatively and rejects cancellation, removed views, data
publications, readiness changes or changed scope. Matching row references are
buffered for the existing aggregate operations, whose final computation is
synchronous. Output cloning and each aggregate pass are not hard-preemptible;
this API does not promise constant-memory or hard real-time execution. It never
reports a partial scan as an exact answer.

## Accessing a view's scales

`track.getScaleResolution(channel)` returns the view's resolved scale, including
unnamed scales, or `undefined` if absent. It accepts scale-backed encoding
channels such as `x`, `y`, `color` and `size`; secondary channels such as `x2`
resolve the primary scale. Invalid channels, including the internal `sample`
channel, throw. This accessor stays on the handle and does not require the query
module. It rejects removed handles and finalized embeds. Check `isZoomable()`
before using a scale for navigation. This is the same
[scale API](runtime-state.md#named-scales) used for named scales. Its locus `zoomTo()`
input has an inclusive upper endpoint; `getDomain()` reports the internal
half-open domain. For example, `zoomTo([100, 299])` displays `[100, 300)`.
Named positions outside their chromosome and reversed genomic intervals reject
before navigation. An upper endpoint `{ chrom: "chr2", pos: -1 }` denotes the
boundary immediately before chr2; this preserves half-open intervals ending at
chr2 position zero when adapting to inclusive endpoints.

## Marks and scoped interaction

Each handle exposes `marks` for interaction with marks in that view's subtree.
Mark events pick the event coordinates before invoking the listener. GPU-backed
readback can make delivery asynchronous, and the callback is skipped if the
scene or owning view/embed is invalidated before the pick completes. See
[Interaction events](./instance.md#interaction-events) for native canvas input
and browser default cancellation.

```js
const track = api.views.get({ scope: [], view: "track" });

const stopHover = track.marks.observeHover((hit) => {
  inspector.textContent = hit ? JSON.stringify(hit.datum) : "No mark";
});

const stopClick = track.marks.subscribe("click", async ({ hit }) => {
  inspect(hit.view, hit.datum);
});

api.events.subscribe("contextmenu", (event) => {
  event.sourceEvent.preventDefault();
  event.preventViewDefault();
  void openContextMenu(event.sourceEvent, event.point);
});

async function openContextMenu(sourceEvent, point) {
  const result = await track.marks.pick(point);
  if (result.status !== "hit") {
    return;
  }
  inspect(result.hit.view, result.hit.datum);
  showMenuAt(sourceEvent.clientX, sourceEvent.clientY);
}
```

`pick()` returns `hit`, `empty`, or `invalidated`. A query is invalidated when
the scene changes or the embed is finalized while it is pending. `MarkHit.view`
identifies the unit view that owns the mark, `uniqueId` identifies the mark in
the rendered scene, and `datum` is a detached shallow copy without the internal
ID. Nested datum values are not deep-cloned.

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

See [Parameters](runtime-state.md#parameters) for selection snapshot shape,
subscription delivery, and clearing behavior.

For a runnable browser form and notebook bridge, see the `annotationEditor` and
`selectionForm` pages in the [embed examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples).

## Updating named data

Use `api.datasets` for declarations in the top-level specification and
`ViewHandle.datasets` for declarations owned by nested views. The exact-owner
rule means updates do not search ancestors or descendants. See
[Runtime State](runtime-state.md#named-data) for declarations, loading, reset,
initial data, and migration from the deprecated global APIs.

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
[view mutation example](https://github.com/genome-spy/genome-spy/blob/master/packages/embed-examples/src/viewMutationApi/index.js)
demonstrates adding, removing, reordering, and positioning external controls
next to live views.

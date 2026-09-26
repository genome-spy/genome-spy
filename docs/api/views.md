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

Before offering a query control, assess its exact axes and optional selection:

```js
const scope = { channels: ["y"], selection: "region" };
const assessment = query.assessQuery(track, scope);
if (assessment.status === "ready") {
  const result = await query.queryData(track, { ...scope, limit: 10 });
}
```

Assessment shares query preparation without scanning rows or triggering loading.
`pending` means data is not ready and support is not yet established; `unsupported`
includes a reason such as `multiple-facets` or `unsupported-position`. Support is
specific to this scope, including axes added by a selection. A cleared selection
retains its empty-result semantics. Invalid requests, stale handles and unexpected
errors throw normally. Assessment does not validate aggregate fields or guarantee
row cloneability. Execution always checks again because chart state may change.

A numeric `limit` is a nonnegative safe integer bounding output rows, not the
matching population. Use `limit: null` to return all output rows in one result.
Complete results consume memory proportional to their size; callers choose any
transport or presentation budget. Neither mode loads data outside the current sources. `rowsExamined`
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
`selection: "region"` also requires each row to match the named interval selection
in the queried view's scope, using Core's shared selection predicate (half-open
point containment and the mark's range hit-test policy). A ranged
row can overlap the viewport and selection in different places; the two regions
do not need to overlap each other.
Active selection axes must also have continuous numeric or locus scales.
A partially or wholly cleared selection matches no rows. Selection axes
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
buffered for the existing aggregate operations. The query yields and revalidates
its scope between aggregate passes, but output cloning and each individual pass
are synchronous and not hard-preemptible. This API does not promise
constant-memory or hard real-time execution. It never reports a partial scan as
an exact answer.

### Analyzing a scoped table

An optional `analysis` pipeline filters, groups or ranks the entire matching
loaded population before the output limit. Supply `fields` to disclose its input
columns. Analysis cannot be combined with the separate `aggregate` option.

```js
const result = await query.queryData(track, {
  channels: ["x"],
  fields: ["group", "score", "position"],
  limit: 100,
  analysis: [
    { type: "filter", field: "score", op: "gt", value: 2, absolute: true },
    {
      type: "aggregate",
      groupby: ["group"],
      fields: [null, "position", "position"],
      ops: ["count", "min", "max"],
      as: ["count", "start", "end"],
    },
  ],
});
```

Numeric filters support `gt`, `gte`, `lt`, `lte`, `eq` and `neq`, with optional
`absolute: true`. Only finite numeric values match; null, missing values, strings,
NaN and infinities do not match, including for `neq`. Thresholds must be finite.
Aggregate stages use the operations described above, with aligned `fields`, `ops`
and `as` arrays. A count field may be null. `groupby` is optional. No matching
rows produce no aggregate rows, following the existing aggregate transform.

A `window` stage supports `row_number` and `count`, with required full-partition
`frame: [null, null]`, optional `groupby`, and optional `sort: {field, order}`.
Sort fields and orders accept a scalar or aligned arrays; order is `ascending`
by default or `descending`. For example, assign row numbers ordered by a score
and then filter row number to one to select a representative in each group.
Include `count` in the same window to retain the group's population before
representative filtering. Window transforms preserve input output order; sorting
controls ranks, not the order of returned rows. Equal sort keys use stable input
order; specify a secondary field for another tie policy. Sorting uses Core's
comparator, including null ordering; a preceding numeric filter can exclude
invalid score values before ranking.

Grouping and sorting require scalar string, boolean, finite number or null
values. Missing grouping/sort values become null. Group rows follow first-seen
group order. Every stage may reference only disclosed input columns or preceding
output columns. An aggregate stage replaces the table with its grouping columns
and named outputs. A window stage retains columns and adds unique output names;
its output names cannot overwrite existing columns. Aggregate output names cannot
overwrite grouping columns. Private metadata and prototype-related output names
are rejected. Missing disclosed input values become null. Input field paths, such as
`nested.score`, become literal column names in this table; use that exact string
in subsequent stages.

`rowsMatched` remains the number of source rows in the captured slice.
`outputRows` counts the analysis output before limiting, and `truncated` reports
whether that table was limited. `scope.analysis` records the detached pipeline.
An empty pipeline returns the projected input table with the same metadata.
Analysis operates on detached rows and cannot mutate the visualization's data.
All results retain the captured viewport and unknown source coverage. The query
rechecks cancellation and scope between transform passes; each pass remains
synchronous, with no hard real-time or constant-memory guarantee.

### Annotating queried points

`query.assessAnnotations(track)` reports whether a point track supports temporary
visual annotations. The initial contract accepts one facet with unconditional
numeric or locus positions. Ranged, displaced, conditional and parameter-dependent
point geometry and expression-driven mark properties are unsupported. An annotation adds a text label, optional connector
and/or colored outline; it preserves the original mark colors and data.

```js
const result = await query.queryData(track, {
  channels: ["x", "y"],
  fields: ["name", "score"],
  limit: 20,
  includeAnnotationTargets: true,
});

await query.annotations.replace({
  targets: result.annotationTargets.map((reference, i) => ({
    reference,
    text: String(result.rows[i].name),
  })),
  emphasis: "purple", // purple, orange or blue; omit for labels alone
  connectors: true,
});

await query.annotations.clear();
```

References are opaque, separate from disclosed values, and aligned with returned
rows. Filters and window/rank analysis preserve references; aggregation cannot
produce point targets. A truncated result supplies targets for its preview only.
Use `limit: null` to obtain references for the complete query output. Annotation
sets have no fixed target-count ceiling; rendering cost and label overlap grow
with the number of targets.
The next successful target-producing query expires previous references, while an
already applied set remains visible. Ordinary queries do not expire references.

Annotations follow pan, zoom and resize and clip to the source plotting area.
A new source publication or view removal clears the applied set. `inspect()` returns
`activeTargets`, `sourceRevision` and `invalidated`. Invalid replacement arguments
leave the previous valid set unchanged. An abort before commit prevents publication;
after commit the applied set remains. Clear and disposal prevent unfinished older
replacements from publishing.

Replacement and clear promises resolve after Core submits the updated rendering
commands. This does not promise browser paint completion or animated transitions.
Generated point, rule and text marks do not change scale domains, source collectors,
measurement queries, legends or normal picking. Labels currently have fixed offsets;
there is no automatic collision avoidance.

Query clients created from the same `api.views` share one annotation controller.
`dispose()` releases its references, subscriptions and generated marks; disposing
one client therefore ends annotation use for those clients. Creating a new query
client afterward creates a fresh controller. Embed finalization also disposes it.

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

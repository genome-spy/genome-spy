# Views, Layout, Dataflow, and Lifecycle

## View system and layout

- `View` (`src/view/view.js`) is the base class for layout sizing and caching,
  scale/axis resolution references, parameter scoping and registration, tree
  traversal, and broadcasting.
- `ViewFactory` (`src/view/viewFactory.js`) creates view subclasses from the
  specification shape:
  - `UnitView` owns a mark and arranges its placement.
  - `LayerView`, `ConcatView`, and `GridView` compose layout.
- `UnitView` (`src/view/unitView.js`) creates a `Mark` such as rect, point, rule,
  link, or text; connects encodings to scales, selections, and axes; and
  unregisters scale/axis resolution members when disposed. Rendering backends
  may register their own cleanup callbacks with the view, but retained renderer
  state is not stored on the unit view or mark.

Construction establishes authored views and their resolutions. Startup then
calls `initializeViewGuides`: attach view-level scale/axis/legend properties,
ensure referenced assemblies, and invoke each container's `syncGuideViews` hook.
Generated UnitViews resolve their encodings in their constructors. Configuration
and dataflow initialization follow this guide phase. Dynamic insertion prepares
the new subtree's guides before refreshing parent hosts. Raw headless hierarchy
construction intentionally stops before the guide phase for preflight inspection.

Decorative chrome participates in scales but never contributes axes or legends.
The resolution planner enforces this before guide registration. Container chrome
is marked before its children are constructed; directly constructed UnitViews
use the internal `chrome` option so their eager resolution sees the same policy.

Layout sizing uses `View.getSize()` and `getViewportSize()` with a cached
`size/*` property namespace:

- Sizes can be fixed (`px`), growing (`grow`), or step-based (`{ step }`).
- Step sizing depends on scale domains. Domain changes must invalidate cached
  sizes so parent layout recomputes.
- Views created through `createOrImportView` register step-size invalidation
  eagerly. Directly created views, such as App's `SampleGroupView`, must register
  it explicitly.
- Size invalidation clears the view's size cache and those of its layout
  ancestors.

Surrounds and their implicit side concats align exported plotting intervals.
`getAlignment(channel)` measures an anchor `SizeDef` and fixed before/after
structural insets; `getAlignmentCoords(channel)` exposes the arranged interval.
Nested panels and internal spacing are included in `getOverhang()`, so ordinary
concats size and align the exported central plots. Structural overhang retains
its reservation when chrome overhang is suppressed. Growing outer arms resolve
their thickness using the parent's flex growth allocation. Their growth weights
remain in separate margin slots, leaving the center's plot weight unchanged.
Guide spans derive from allocated rectangles and measured insets, so guide
arrangement does not depend on whether child content has already been arranged.
Nested bounds may overlap in empty corners; derived plot/guide footprints
support collision validation and input routing without a retained scene graph.

`View.arrange()` performs a full depth-first traversal. Views update their
layout-owned state and emit ordered placements into a private recorder. A
successful traversal produces a completed `LayoutResult`, which a rendering
backend consumes without re-entering the view hierarchy. Canvas-size settling
publishes only the final valid result.

The result is an ephemeral boundary, not a retained scene graph. It has no
stable placement keys, dirty state, or backend resources. Rendering hooks,
mark preparation, clipping, culling, picking, and drawing run when a backend
consumes the result; layout parameters and coordinates update only during
arrangement.

## Dataflow graph

- `src/view/flowBuilder.js` constructs a graph of `FlowNode` instances by
  traversing the data-parent tree, which may differ from the layout tree.
- Root nodes are data sources under `src/data/sources/`.
- Transforms live under `src/data/transforms/`.
- Terminal collectors are implemented by `src/data/collector.js`.
- Flow-node behavior flags describe whether nodes clone, modify, or collect
  data: `BEHAVIOR_CLONES`, `BEHAVIOR_MODIFIES`, and `BEHAVIOR_COLLECTS`.
- `Collector` materializes data, supports grouping and sorting, and provides
  indexed lookups such as unique-ID lookup for picking.
- Explicit facet views insert a grouped input collector after outer transforms.
  Child transforms receive contiguous facet batches through one static graph;
  terminal collectors preserve the batch identity even when fields are dropped.
  The input collector owns cell membership, including cells emptied by child
  filters. Child-owned sources and auxiliary relations keep their own scope.
- Facet batches delimit logical reductions and partition-local state. File
  batches delimit homogeneous physical row shapes inside a facet and do not
  restart its reduction. Collectors and buffered row-preserving transforms retain
  file provenance across grouping, sorting, and replay. Whole-flow reset and
  completion retain their publication meaning; identifiers span all facets.
- Parameter-driven Filter/Formula replay uses the shared reactive runtime's
  streaming update queue. Replay roots are the actual optimized upstream
  collectors/sources; synchronous ancestors subsume pending descendant replays.
  Inline, sequence, and named source replay uses synchronous loading so row errors
  reach that propagation boundary. Async sources retain their request lifecycle.
  See `reactivity.md` for coherent observer, failure/retry, and disposal semantics.
- Eager `UrlSource` loads use a source-local counter: once a replacement load
  starts, older loads cannot publish rows, status or completion. Disposal also
  prevents publication. Superseded fetched content skips parsing; async parser
  results are checked again before publication. Reset still occurs at load start; this does not introduce
  retained pending data, cancellation, or a shared async scheduler.
- Descriptor-backed windowed sources cache handles independently of requests.
  A URL change synchronously invalidates readiness, while one request signal
  guards normalization, handle acquisition, interval loading, publication, and
  status. Descriptor errors surface when a visible window is requested.
- Sources publish transform outputs when `complete()` finishes a successful
  snapshot. Completion that only clears rows or finishes a failed load uses
  `complete(false)`; publication also requires ready and successful side inputs. A `branch` forks
  the current input while keeping its owning view's parameter scope and
  preserving the main rows. See `reactivity.md` for publication and feedback
  boundaries.
- `src/data/dataReadiness.js` walks the actual optimized primary path and
  `FlowNode.dataDependencies` side edges. `SideInputBinding` owns observation and
  consumed revisions for declared collectors. It binds during `initializeOnce()`,
  after optimization, and unsubscribes before consumer-owned auxiliary pruning.
  Lookup/cross declare their inputs and retain only their relation-specific caches.
  View ownership is not a dependency graph: an inherited lookup affects its
  descendants but not an overriding data branch.
- Side-input consumers call `consumeDataDependencies()` during batch/index
  preparation, including skipped pending batches. Completion can consume available
  inputs for an empty primary; it cannot certify a newer revision than the one
  used for nonempty output. `areDataDependenciesAvailable()` supplies availability
  policy; coordinate lookup includes current viewport coverage. Pending output
  may complete an empty stream while remaining unready.
- New side revisions enqueue primary replay. Transforms compare cache revisions
  during batch preparation and rebuild only when needed, including implicit
  lookup fields. The binding handles readiness and replay without a separate
  cache-invalidation hook. An unchanged cached-side replay does nothing when
  output is current, but can release a pending publication once coverage becomes
  available. Self lookup has no side binding. Cross prepares once per primary
  batch even for empty foreign relations; cache revisions and consumption are
  recorded after successful preparation.
- Replay jobs declare pending publishers of their side collectors as prerequisites.
  These run first in the existing streaming queue, regardless of primary-tree
  depth or enqueue order. The builder rejects nested auxiliary joins, and the
  optimizer keeps auxiliary collectors terminal; collector revision timing is
  unchanged. Data still streams and replays in full, without tuple change sets.

## Subtree initialization and readiness

- `initializeViewSubtree` initializes dataflow for a newly added subtree.
- `loadViewSubtreeData` resolves its sources and emits `subtreeDataReady`.
- `src/view/dataReadiness.js` supplies `buildReadinessRequest`,
  `isSubtreeReady`, `isSubtreeLazyReady`, and `awaitSubtreeLazyReady`. Lazy
  waiting re-checks readiness after output and dependency collector completion.
  Entirely eager branches are ignored by lazy-only waits; eager primary data
  with a lazy side input still waits for recomputed output. Aborted or failed
  waits remove their subscriptions.
- Initial contribution readiness requires meaningful publication, including
  empty results. Dummy lazy startup completion is pending. Current viewport
  readiness additionally uses each lazy source's coverage policy. Windowed
  sources publish coverage and rows atomically; Tabix preserves physical file
  batches at that same boundary.
- Scale initial finalization uses contribution readiness independently of
  effective-domain availability. Partial domains remain available to rendering
  and lazy requests; readiness never gates creation of the scale itself.
- Startup initialization is visibility-aware. Hidden subtrees skip dataflow and
  mark wiring until `initializeVisibleViewData` initializes them after a
  visibility change. Read-only transform outputs pushed to an active ancestor
  keep their producer paths initialized even when the producer presentation is
  hidden. Other hidden siblings remain deferred.
- Hidden views do not contribute to shared scale domains until initialized, so
  a domain may expand when a subtree becomes visible.
- Collector observers update semantic mark data and schedule rendering. A
  retained backend synchronizes its own buffers from collector and mark
  revisions when it next prepares or paints the mark.
- Views track `none`, `pending`, or `ready` data initialization state to prevent
  duplicate flow nodes and collectors.
- Disposing a subtree prunes its flow branches so orphaned nodes and unused data
  sources do not remain.
  A shared output producer cannot be removed while its output owner survives;
  mutation preflight rejects that operation before changing guides or hierarchy.

## Scale domain ownership

`DomainRuntime` owns the displayed domain, reset target, initial reference,
loaded data extent, and active transition identity. `ScaleResolution` resolves
shared configuration and rebinds inputs when participation changes. `domainLifecycle.js` decides
updates from normalized snapshots before the live scale is changed. Its initial
phase distinguishes collecting, early interaction, and complete readiness;
interaction protects the display without ending reference collection.

All scale kinds compile expression dependencies, accessors and viewport topology
in `domainInputs.js`. Subtree initialization binds each affected resolution once
after installing all encoders. The binding owns collector subscriptions and
uses the same accessors for domain extraction and invalidation, deduplicating
shared collector keys and suppressing inferred-domain feedback. Rebinding or
disposal removes those subscriptions. App metadata needs no explicit domain
refresh after publication. Pure functions in `domainPlanner.js` validate configured
sources and combine domains; bootstrap and unbound `getDataDomain()` queries use
the same readers without creating another state owner. `ScaleInstanceManager`
normalizes candidates on a working scale, maintains categorical index mapping,
applies properties/ranges through a graph-owned mapping operation, and mirrors
committed domains. Mapping helpers consume the operation's stable output ref.
External `scale.domain(value)`
calls submit immediate owner updates; they do not bypass the commit path.
`ScaleInteractionController` retains coordinate conversion, zoom mathematics,
and validation, submitting navigation to the same owner. Reset uses the current
configured/default target, separately from the initial reference and data extent.

Domain events describe effective display changes, including intermediate
animation frames. Internal zoom-level and axis-tick inputs publish during domain
jobs, including unchanged-display reference/extent progress. Source completion
batches synchronous fan-out; initialization freezes the settled reference before
observer effects. Immediate rendering uses this same settled boundary. Initial lazy requests still start
through the existing post-load layout notifications. Current viewport coverage
gates viewport candidates without reopening initial readiness. UnitView retains
a small subtree-ready selection synchronization bridge: domain-inert linked
scales have no collector publication to seed their initial brush.

Axis auto-extent measurement checks the displayed domain directly: categorical
domains must be nonempty, and continuous domains must contain only finite
values with at least two distinct values. Usable partial domains can size labels while other
contributors are pending. Empty or degenerate domains cannot permanently enlarge
the grow-only extent. The deprecated public `isDomainInitialized()` query retains
its historical placeholder heuristic for embedding compatibility; it is not used
as an internal readiness or axis-measurement condition.

## Axis ownership

An `AxisResolution` references its scale and placement host directly.
`resolve.axis` controls placement; the scale must be available at that host or
an ancestor. Encoding members contribute options, titles, and visibility.
The axis lives until its host or scale is disposed. Explicitly typed scales
and their shared axes survive an empty container; encoding-inferred scales
disappear when their last member is removed.

## Interaction gesture ownership

Document-level mouse drags use `startDocumentDrag`, which owns temporary DOM
listeners and balanced hover suspension. The initiating controller or view owns
the returned cancellation function and invokes it on disposal. Cancellation
cleans up without applying release-only effects such as selection commits,
pan inertia, or ruler clearing. Callers retain coordinate mapping and gesture
state; the routing `GridView` owns pan sessions across child and gap surfaces.

## Dynamic view lifecycle

- Public mutations share one queue. An optional internal host callback encloses
  each operation and the outer transaction before layout suppression begins and
  after it ends; App uses this boundary for cohort lifecycle policy.
- Failed parallel construction settles all children and disposes successful
  siblings before rejecting. A factory also disposes a returned view whose child
  initialization fails; constructors own cleanup until they return an instance.
- Windowed URL sources abort publication and retain a local disposal-completion
  promise. Mutation cleanup waits for disposed sources' pending handle acquisitions
  and handle closure while preserving shared sources. Figwig reader closure cancels
  pending queries; ordinary view/dataflow disposal remains synchronous.
- Prefer `ViewFactory.createOrImportView`; some App views are still constructed
  directly and need equivalent lifecycle wiring.
- `src/data/flowInit.js` owns `initializeViewSubtree` and
  `loadViewSubtreeData`. It initializes encoders and semantic mark data but does
  not create, update, or finalize renderer resources.
- `src/genomeSpy/viewDataInit.js` centralizes visibility-triggered data
  initialization and should run after visibility state changes.
- `disposeSubtree` walks post-order, unregisters resolution members, and prunes
  dataflow branches.
- `configureViewOpacity` runs in a separate post-resolution pass because dynamic
  opacity depends on resolved scales.

## Evolving dataflow concerns

These are current fragilities and design questions rather than settled
contracts:

- A future dataflow may operate on columnar batches, enabling a more direct
  Arrow/Parquet to transforms to GPU-buffer pipeline. New transforms and
  internal contracts should avoid unnecessarily coupling grammar semantics to
  mutable JavaScript row objects.
- A targeted propagation/load mode may eventually populate collectors for
  dynamic insertions without re-propagating existing branches and causing
  redundant updates and renders.
- `FlowNode.initialize()` serves both graph initialization and some per-batch
  fast-path rebuilds. Graph-level callers must use `initializeOnce()`.
- `Collector` is both a cache and a fan-out boundary; downstream mutation
  behavior depends on its completion and re-propagation semantics.
- Data sources do not yet have a persistent loaded/dirty lifecycle contract, so
  dynamic flows must decide explicitly between reload and re-propagation.
- Dependencies are implicit in view/data-parent traversal. The graph cannot yet
  state that only one branch needs new data.
- Categorical domains, indexers, and encodings are tightly coupled and
  order-sensitive when domains change during the lifecycle.

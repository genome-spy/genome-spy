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

## Subtree initialization and readiness

- `initializeViewSubtree` initializes dataflow for a newly added subtree.
- `loadViewSubtreeData` resolves its sources and emits `subtreeDataReady`.
- `src/view/dataReadiness.js` supplies `buildReadinessRequest`,
  `isSubtreeReady`, `isSubtreeLazyReady`, and `awaitSubtreeLazyReady`. Lazy
  waiting re-checks readiness after collector completion.
- Startup initialization is visibility-aware. Hidden subtrees skip dataflow and
  mark wiring until `initializeVisibleViewData` initializes them after a
  visibility change.
- Hidden views do not contribute to shared scale domains until initialized, so
  a domain may expand when a subtree becomes visible.
- Collector observers update semantic mark data and schedule rendering. A
  retained backend synchronizes its own buffers from collector and mark
  revisions when it next prepares or paints the mark.
- Views track `none`, `pending`, or `ready` data initialization state to prevent
  duplicate flow nodes and collectors.
- Disposing a subtree prunes its flow branches so orphaned nodes and unused data
  sources do not remain.

## Dynamic view lifecycle

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

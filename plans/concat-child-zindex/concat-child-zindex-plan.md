# View Child Z-Index

## Summary

Add a static numeric `zindex` property to view specifications. Composition
containers render immediate children in ascending `zindex` order while keeping
declaration order as the stable tie-breaker. Layout, dataflow, scale resolution,
view traversal, and mutation indices continue to use declaration order.

This makes the middle protein view in
`examples/core/layout/grid/concat_zindex_lollipops.json` render after both
lollipop views. Its backbone and domain marks then cover the extended stem
endpoints from above and below.

The proposal deliberately treats sibling view ordering separately from the
existing decoration `zindex`, which controls whether parent-owned chrome is
drawn before or after view content.

## Problem

The reproduction has three `vconcat` children in semantic layout order:

1. upper lollipops;
2. protein backbone and domains;
3. lower lollipops.

The stems use `y2Offset` to extend into the protein track. The upper stems are
drawn before the protein and look attached to it. The lower stems are drawn
after the protein and visibly cover it. Reordering the concat array cannot fix
the overlap because array order also determines layout position.

There is currently no view-level render-order override:

- `ViewSpecBase` in `packages/core/src/spec/view.d.ts` has no `zindex`.
- `LayerView.render()` in `packages/core/src/view/layerView.js` renders children
  in array order. `propagateInteraction()` visits the same array in reverse.
- `GridView.render()` in `packages/core/src/view/gridView/gridView.js` builds
  child content callbacks in grid order and invokes them in that order.
- `GridView` already has a separate decoration queue. Axes, legends,
  backgrounds, titles, separators, rulers, scrollbars, and selection brushes
  are split into underlays (`zindex <= 0`) and overlays (`zindex > 0`) around
  all direct child content.
- `BufferedViewRenderingContext` preserves the collected order when it builds
  WebGL draw batches. Picking uses the same view traversal, so changing child
  collection order changes both visible and picking draw order.

## Goals

- Let a concat child render above or below its siblings without changing its
  layout position.
- Give `layer`, `vconcat`, `hconcat`, and wrapping `concat` the same simple
  sibling-order rule.
- Preserve current output when `zindex` is omitted.
- Keep equal values deterministic and compatible with declaration order.
- Let an import site control the z-index of an imported child.
- Keep the implementation local to composition rendering and interaction.

## Non-goals

- Data-driven or expression-driven view z-index.
- Reordering layout cells, view hierarchy traversal, scale/axis/legend
  resolution, dataflow branches, names, or mutation API indices.
- Ordering across different parents or flattening nested compositions into one
  global display list.
- Making marks that overflow a concat cell receive pointer events outside that
  cell's interaction surface.
- Replacing or unifying the existing decoration z-index system.
- Adding per-datum z-index. That is a separate mark-ordering concern.

## Comparable behavior and provenance

Vega is the closest established model. A Vega mark definition, including a
group mark, can have a numeric `zindex`; higher-valued sibling mark sets render
later. Vega's scenegraph performs an ascending stable sort by `zindex` and the
original item index. See the [Vega mark documentation](https://vega.github.io/vega/docs/marks/)
and the corresponding
[`visit.js` implementation](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-scenegraph/src/util/visit.js).
Vega group marks establish nested visualizations, so the rule is local to a
sibling group rather than global across the hierarchy; see the
[Vega group mark documentation](https://vega.github.io/vega/docs/marks/group/).

Vega-Lite compiles concat children to Vega group marks in declaration order but
does not expose a view-child z-index. This is visible in
`tmp/vega-lite/src/compile/concat.ts` at local revision
`f0e76dfc7efa720817249f612f66599e2ca5ead4`; its documented composition model
also separates layering from concatenation. GenomeSpy needs the additional
override because it intentionally permits marks to overhang adjacent tracks.

The proposed semantics are based on Vega's sibling ordering, but no Vega code
needs to be copied. Both Vega and Vega-Lite use the BSD 3-Clause license, which
is compatible with GenomeSpy's MIT license if a later implementation does adapt
code more closely.

## Specification

Add this user-facing property to `ViewSpecBase`:

```ts
/**
 * Z-order among sibling views in a composition. Higher values render later.
 * Views with equal values render in declaration order. This does not affect
 * layout order.
 *
 * __Default value:__ `0`
 */
zindex?: number;
```

Use a finite static number, consistent with the existing decoration types. Do
not restrict it to integers: fractional and negative values are useful for
insertion between authored bands, and the current GenomeSpy decoration API
already accepts `number`.

Add the same optional property to `ImportSpec`. At an import site it overrides
the imported root's value, including `0`. `applyParamsToImportedSpec()` should
apply it alongside `name` and `visible`. Without this override, a reusable
import would have to encode assumptions about unknown siblings.

The completed reproduction uses:

```json
{
  "name": "protein",
  "zindex": 1,
  "height": 30,
  "layer": []
}
```

The two lollipop siblings use the default `0`, so their layout remains upper,
protein, lower while their content renders upper, lower, protein.

## Rendering semantics

At each composition boundary, render immediate children in ascending
`zindex`, using declaration order for ties. The sort is local and
non-destructive: never mutate the container's stored child array or the
authored spec array.

Add `View.getZindex()` returning `this.spec.zindex ?? 0`. Both composition
implementations can sort shallow copies using that method:

- `LayerView.render()` renders a z-sorted copy of `#children`.
- `GridView.render()` z-sorts the prepared child `renderItems` only when it
  appends the child content callbacks. Coordinates and all grid calculations
  remain in declaration order.

Modern `Array.prototype.toSorted()` is stable and already used in Core. It
keeps this implementation small and preserves equal-z declaration order
without an explicit index field.

Nested containers remain atomic at their parent's boundary. A nested child
fully renders its own subtree when its callback runs; descendant z-indices do
not escape that child.

### Decorations

Keep `GridView`'s current parent-owned decoration phases:

1. all underlay decorations;
2. z-sorted direct child content;
3. all overlay decorations.

This is the smallest compatible rule and avoids assigning incomparable meaning
to two existing concepts:

- view `zindex`: order among sibling view contents;
- decoration `zindex`: before/after placement relative to the containing
  grid's content phase.

Consequently, an overlay axis or title still renders above every direct child,
and a default background fill still renders below every direct child. Nested
chrome that is rendered inside a child moves with that child's render callback.
Document this distinction; do not build a global scenegraph-style queue merely
to interleave parent-owned chrome with children.

### Picking and interaction

Visible and picking rendering already share view traversal, so they receive the
same z-sorted order.

For `LayerView`, use the reverse of the z-sorted render order in
`propagateInteraction()`. This preserves the existing topmost-first contract
when overlapping layers handle an event.

For `GridView`, retain coordinate-based interaction routing. Concat children
own separate layout cells even when an unclipped mark visually overflows into a
neighbor. Changing that ownership would affect zooming, scrolling, axes, and
gap interactions and is not required for the lollipop use case.

## Dynamic children and invalidation

Compute render order from current children when rendering rather than caching
it. Existing `addChildSpec()`, `removeChildAt()`, and `moveChildAt()` operations
then work without extra invalidation state:

- insertion/removal immediately participates in the next render;
- moving a child changes the stable tie-breaker and layout position;
- indices and spec arrays retain authored/layout order.

The initial feature does not add a runtime setter for `zindex`. A later mutation
API can request a render after updating the spec if such an API becomes useful.

## Alternatives considered

### Reorder the concat array

Rejected because the array simultaneously defines layout order. It cannot put
the middle cell at the end of render order while keeping it in the middle of
the layout.

### Support only concat children

Rejected because `zindex` is a composition concept, and layer children already
have the same ordering need. A common view property and two small render-order
changes are simpler than composition-specific syntax.

### Add z-index only to marks

Rejected because marks in different concat children do not share one unit or
layer container. It would also force the protein's internal marks to know about
the outer composition.

### Interleave all content and chrome in one global queue

Deferred. It could model Vega groups more completely, but it would complicate
shared axes, legends, separators, rulers, scrollbars, clipping, and existing
decoration defaults. The lollipop use case only requires child content order.

### Restructure the visualization as overlapping layers

Rejected as a workaround. The three tracks need concat layout, track sizing,
and shared scale behavior. A grammar feature should not require duplicating
that layout manually.

## Risks and mitigations

- **Equal-z regressions:** rely on stable `toSorted()` and add explicit tests
  proving unchanged declaration order.
- **Picking differs from visible output:** exercise both normal and picking
  render contexts with the same expected child order.
- **Interaction reaches a covered layer first:** reverse the same sorted order
  in `LayerView.propagateInteraction()`.
- **Chrome expectations are ambiguous:** document that parent-owned decoration
  phases remain outside sibling content ordering and test this boundary.
- **Imports cannot be composed locally:** add an explicit `ImportSpec.zindex`
  override and a factory test.
- **A sort enters a hot render path:** child counts are normally small, the
  operation allocates one shallow copy per composition render, and no
  per-frame mark or datum allocation is introduced. If profiling later shows a
  problem, cache only the order and invalidate it on child/z-index changes.

## Unresolved questions

None for the initial static feature. Expression-driven z-index and finer chrome
interleaving should be separate proposals backed by concrete use cases.

## Implementation plan

### 1. Specify view ordering

Outcome: `zindex` is accepted on all view specs and at import sites, with clear
sibling-local semantics and a default of `0`.

Affected areas:

- `packages/core/src/spec/view.d.ts`
- `packages/core/src/view/view.js`
- `packages/core/src/view/viewFactory.js`
- schema tests and import override tests

Verification:

- TypeScript/schema validation accepts positive, zero, negative, and
  fractional values.
- An import-site `zindex: 0` overrides a nonzero imported root.

Documentation and migration: no migration; omitted values preserve current
behavior. Regenerate schema/docs artifacts as required.

Tentative commit: `feat(core): add view zindex specification`

### 2. Order layer and concat content

Outcome: layer and concat children render by stable sibling z-index without
changing layout or hierarchy order.

Affected areas:

- `packages/core/src/view/layerView.js`
- `packages/core/src/view/layerView.test.js`
- `packages/core/src/view/gridView/gridView.js`
- `packages/core/src/view/gridView/gridView.test.js`

Verification:

- Default and equal z-indices preserve declaration order.
- Negative/default/positive values render in ascending order.
- The same concat test still reports children in declaration order through the
  hierarchy and layout APIs.
- Parent-owned underlays and overlays retain their current phases.
- Layer interaction propagation is topmost-first after sorting.
- Normal and picking collection use the same order.

Documentation and migration: none in this step.

Tentative commit: `feat(core): order composition children by zindex`

### 3. Complete the example and user documentation

Outcome: the reproduction becomes a passing demonstration by adding
`"zindex": 1` to the protein child, and the grammar documents view ordering.

Affected areas:

- `examples/core/layout/grid/concat_zindex_lollipops.json`
- `packages/core/__snapshots__/examples.test.js.snap`
- `docs/grammar/composition/concat.md`
- `docs/grammar/composition/layer.md`

Verification:

- The example initializes and validates against the generated schema.
- A browser smoke check shows both stem endpoint sets hidden by the protein
  backbone/domains.
- Focused Core tests, workspace TypeScript checks, and lint pass.

Documentation and migration: add concise examples for stable sibling order and
clarify that layout order is unchanged. No migration is needed.

Tentative commit: `docs(core): demonstrate composition child zindex`

## Acceptance criteria

- `zindex` is a documented optional property of all Core view specs and import
  sites, defaulting to `0`.
- Immediate children of `layer`, `vconcat`, `hconcat`, and wrapping `concat`
  render in ascending z-index with stable declaration-order ties.
- The protein child can remain second in `vconcat` while rendering after both
  lollipop children.
- Layout coordinates, hierarchy traversal, dataflow, resolution, child API
  indices, and default rendering remain unchanged.
- Layer interactions are dispatched topmost-first using the same ordering.
- Concat interaction ownership remains cell-based.
- Existing decoration underlay/overlay behavior remains unchanged and is
  documented distinctly from view sibling ordering.
- Schema, focused unit tests, example initialization, TypeScript checks, lint,
  and a visual browser smoke test pass.

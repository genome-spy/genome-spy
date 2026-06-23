# Public View Mutation API Plan

## Context

Issue [#419](https://github.com/genome-spy/genome-spy/issues/419) asks for the
existing internal view hierarchy mutation APIs to be stabilized and exposed
through the `embed()` result. The API should support adding unit views and full
subtrees, removing subtrees, and eventually reordering children without leaving
stale dataflow, scale, guide, legend, parameter, or graphics references.

`MUTATION_ACID_TEST_PLAN.md` frames the risk: dynamic hierarchy mutation,
visibility-aware lazy initialization, scale resolution updates, and in-flight
data loading interact in timing-sensitive ways. The public API should therefore
be a small lifecycle-enforcing surface rather than direct exposure of internal
view classes.

## Use Case Examples

### Genome browser custom tracks

A genome browser embeds a base specification with a named track container, such
as `{ scope: [], view: "tracks" }`. The host application provides templates for
common genomic file types and visual representations, such as BED annotation
tracks, BigWig signal tracks, VCF variant tracks, segment tracks, and paired-end
link tracks.

When the user adds a local or remote dataset, the application chooses the
matching template, supplies the dataset URL or named data source through params,
and inserts a new track into the track container:

```ts
const tracks = api.views.get({ scope: [], view: "tracks" });

const track = await api.views.insert(
  tracks,
  {
    import: { template: "bigwigSignalTrack" },
    params: {
      url: "https://example.org/sample.bw",
      title: "Sample signal",
    },
  },
  { scope: "sampleSignal" }
);
```

The user can then remove the track or rearrange it relative to other tracks:

```ts
await api.views.move(track, { index: 1 });
await api.views.remove(track);
```

The inserted scope makes repeated template instances independently addressable.
For example, inner views named `signal` can be addressed as
`{ scope: ["sampleSignal"], view: "signal" }` even when the same template has
been inserted many times. The same pattern should work when the host
application already has an ordinary `ViewSpec` object instead of an import
template.

### Temporary analysis overlays

An application may add a transient overlay track for a selection, search result,
or quality-control calculation, then remove it immediately when the user
cancels the action. This requires insertion and cancellation to leave no stale
dataflow branches, resolution members, guide views, params, or event listeners.

### Saved layouts and user workspaces

A host application may restore a user-specific workspace by replaying a set of
track insertions and reorder operations after embedding. The same operations
should be usable later for interactive editing, so the API should keep backing
spec order, live hierarchy order, and selector scopes consistent.

## Current Findings

The internal mutation path already exists:

- `ConcatView.addChildSpec()` and `ConcatView.removeChildAt()` route through
  `ContainerMutationHelper`.
- `LayerView.addChildSpec()` and `LayerView.removeChildAt()` use the same
  helper.
- `GridView` owns the low-level child insertion/removal primitives and shared
  guide views.
- `ContainerMutationHelper` handles create/import, spec list updates,
  view-level scale/axis/legend config reattachment, assembly preflight,
  opacity configuration, subtree dataflow initialization, data loading,
  graphics finalization, size invalidation, and layout reflow.

The public `embed()` result currently exposes params, named data, named scale
resolutions, lazy-data waiting, canvas helpers, event listeners, and finalizing.
It has no view hierarchy mutation surface.

Selectors already support import scopes with the shape:

```ts
interface ViewSelector {
  scope: string[];
  view: string;
}
```

Named import instances are registered as selector scopes. For example, adding
the same imported template twice as `panelA` and `panelB` lets callers address
inner views as `{ scope: ["panelA"], view: "coverage" }` and
`{ scope: ["panelB"], view: "coverage" }`.

Selectors are durable and useful for bookmarkable/provenance state, but they
only address explicitly named views that satisfy selector uniqueness
constraints. They are not enough for anonymous containers or for follow-up
operations on newly inserted views.

## Recommended Public API

Expose a namespaced mutation API on `EmbedResult`:

```ts
const api = await embed(container, spec);

const tracks = api.views.get({ scope: [], view: "tracks" });

const inserted = await api.views.insert(tracks, coverageTrackSpec, {
  scope: "sampleA",
});

await api.views.move(inserted, { index: 0 });
await api.views.remove(inserted);
```

Type sketch:

```ts
interface EmbedResult {
  views: ViewMutationApi;
}

type ViewAddress = ViewHandle | ViewSelector | "root";

interface ViewMutationApi {
  root(): ViewHandle;
  resolve(address: ViewAddress): ViewHandle | undefined;
  get(address: ViewAddress): ViewHandle;
  insert(
    parent: ViewAddress,
    spec: ViewSpec | ImportSpec,
    options?: InsertOptions
  ): Promise<ViewHandle>;
  remove(target: ViewAddress): Promise<void>;
  move(target: ViewAddress, options: { index: number }): Promise<ViewHandle>;
  transaction<T>(
    callback: (views: ViewMutationApi) => T | Promise<T>
  ): Promise<T>;
}

interface InsertOptions {
  index?: number;
  scope?: string | null;
}

interface ViewHandle {
  readonly id: string;
  readonly name: string | undefined;
  readonly selector: ViewSelector | undefined;
  readonly type: "unit" | "layer" | "concat" | "grid" | "unknown";
  isAlive(): boolean;
  parent(): ViewHandle | undefined;
  children(): ViewHandle[];
}
```

The API should return handles instead of internal `View` instances. A handle is
a live reference with a stable runtime id and explicit liveness checks. It can
expose selector metadata when available, but it must not expose mutable internal
view objects.

## Addressing Model

Use three address forms, each with a distinct purpose:

- `ViewSelector`: durable address for named views inside import scopes. This is
  the right shape for bookmarks, provenance, saved UI state, and app-agent
  references.
- `ViewHandle`: live runtime address returned by `root()`, `get()`, `resolve()`,
  and `insert()`. This is the right shape for newly inserted or anonymous views.
- `"root"`: explicit shortcut for the current root view.

Do not make index paths a primary public address in the initial API. Structural
paths are convenient for diagnostics but unstable under insertion and reorder.
Handles cover anonymous views without pretending structural paths are durable.

## Scope Support

Scopes should be available for both ordinary `ViewSpec` objects and
`ImportSpec` objects. The public mutation API should treat a scope as
mutation-time instance metadata, not as something that only exists because the
spec came through the import grammar.

This lets API users keep a reusable spec object and add it multiple times with
different scopes:

```ts
await api.views.insert(tracks, coverageTrackSpec, {
  scope: "tumorA",
});

await api.views.insert(tracks, coverageTrackSpec, {
  scope: "tumorB",
});
```

If `coverageTrackSpec` contains a named inner view such as `coverage`, callers
can address the inserted instances as `{ scope: ["tumorA"], view: "coverage" }`
and `{ scope: ["tumorB"], view: "coverage" }`.

The same option should work for imported specs:

```ts
await api.views.insert(
  tracks,
  {
    import: { template: "track" },
    params: { sample: "A" },
  },
  { scope: "tumorA" }
);

await api.views.insert(
  tracks,
  {
    import: { template: "track" },
    params: { sample: "B" },
  },
  { scope: "tumorB" }
);
```

`ImportSpec.name` should remain supported because the grammar already defines it
as both the imported root view name and selector scope name. For the public
mutation API, `options.scope` should be the preferred way to create an instance
scope because it also works for ordinary specs and does not require changing the
root view name embedded in a reusable spec.

If both `ImportSpec.name` and `options.scope` are provided, the API should
either require them to match or throw. Silent precedence would make selector
addresses hard to reason about.

For direct `ViewSpec` inputs, the mutation API should clone the spec before
insertion. This prevents accidental shared mutable spec state when callers add
the same object multiple times. `options.scope` should register the created
subtree root as a scope root after creation. It should not overwrite
`spec.name`; the scope is an address namespace, while `name` remains the view's
explicit name.

## Container Support

Initial support should cover the existing dynamic containers:

- `ConcatView`: insertion, removal, same-parent reorder.
- `LayerView`: insertion, removal, same-parent reorder.

Unsupported containers should fail fast with a clear error such as:

```text
View "foo" does not support child mutation.
```

Moving a view to another branch should not be part of the initial API. It needs
new decisions around data parent changes, param scope changes, scale resolution
membership, and inherited config/data/encoding semantics.

## Lifecycle Requirements

All public mutations should go through one lifecycle coordinator instead of
calling container methods directly from the API wrapper.

Insertion should:

1. Resolve the parent address to a mutable container.
2. Clone direct specs and pass import specs through `createOrImportView`.
3. Register `options.scope` on the created subtree root when provided.
4. Insert the backing spec and view in the same relative order.
5. Attach view-level scale, axis, and legend configs.
6. Ensure assemblies before scale/encoder-dependent initialization.
7. Configure view opacity.
8. Initialize visible subtree dataflow and graphics.
9. Populate new collectors by reload or repropagation.
10. Refresh guide/chrome artifacts.
11. Invalidate size/layout, compute layout, and request render.
12. Return a live `ViewHandle`.

Removal should:

1. Resolve the target address to a live child view.
2. Reject root removal.
3. Clear affected view-level configs before disposal.
4. Remove the view and backing spec from its parent.
5. Dispose the subtree in post-order.
6. Prune dataflow branches and unused data sources.
7. Reattach view-level configs.
8. Refresh guide/chrome artifacts.
9. Invalidate size/layout, compute layout, and request render.
10. Mark the removed handle dead.

Reorder should:

1. Resolve the target to a live child view.
2. Require same-parent reorder only.
3. Update the parent container child list and backing spec list without disposal.
4. Refresh guide/chrome artifacts and affected cached resolution-derived values.
5. Invalidate size/layout, compute layout, and request render.

Reorder must not rebuild dataflow, dispose collectors, or reload data. However,
it can affect layout, axis placement, legend order, and deterministic resolution
member ordering because resolution merges are based on view path strings.

## Data Loading Strategy

The current dynamic insert helper loads the subtree sources directly. Before
making this public, reuse the smarter visibility path from
`initializeVisibleViewData`:

- If the inserted visible view inherits from a completed ancestor collector,
  repropagate the collector instead of reloading the source.
- If a needed source is currently loading, queue a reload so new branches receive
  complete data propagation.
- If the inserted subtree owns a data source, load that source.

This avoids both extra reloads and missed rows during in-flight loading.

## Guide And Legend Refresh

The internal dynamic path should treat guide/chrome refresh as one lifecycle
step. `ConcatView` currently refreshes shared axes after add/remove, while
`GridView.createAxes()` refreshes both shared axes and shared legends during
initial setup. Public mutation should not require callers to know those details.

Add a container-level method or helper such as `refreshGuideViews()` that covers:

- shared axes
- gridline/axis views owned by grid children
- shared legends
- local legend regions
- separator/layout decorations where relevant

## Error Handling And Transactions

The public API should be fail-fast and transactional at the operation level.

If insertion fails after partial commit, roll back by removing the inserted
view/spec, disposing the subtree, refreshing configs/guides, and rethrowing.

`transaction()` should batch several operations and defer layout/render requests
until the end. It does not need full rollback in the first version, but it
should preserve operation ordering and ensure final lifecycle cleanup runs once.

All public errors should include enough context to debug:

- unresolved selector
- unsupported parent/container type
- out-of-range index
- stale/dead handle
- root removal attempt
- move across parents, if attempted

## Acid Test Coverage

The acid tests should cover the draft scenarios in
`MUTATION_ACID_TEST_PLAN.md` and add API-level cases:

- Insert the same template import twice with different names and resolve both
  import scopes.
- Insert the same direct `ViewSpec` twice with different `options.scope` values
  and resolve both scoped instances.
- Insert the same direct `ViewSpec` object twice and verify no shared spec
  mutation.
- Remove an inserted subtree and verify old handles are dead.
- Reorder inside concat and layer containers without collector disposal or data
  reload.
- Insert during an in-flight shared source load and verify the new collector
  receives data.
- Remove a subtree and verify no stale scale, axis, or legend members remain.
- Apply a complex mutation sequence, cancel it immediately, await
  stabilization, and verify the normalized internal hierarchy snapshot matches
  the pre-mutation baseline.
- Reinsert a removed subtree with shared scales and axes.
- Toggle visibility of a hidden inserted subtree with chrom/pos encodings.
- Verify axis/gridline/legend views render after add/remove/reorder.
- Verify encoders never see chrom/pos channel defs after linearization.

Prefer focused Vitest suites close to the lifecycle code, plus a small acid-test
harness that can drive ordered mutations and inspect stable invariants.

## Suggested Implementation Steps

1. Add public types to `packages/core/src/types/embedApi.d.ts`.
2. Add `packages/core/src/view/viewMutationApi.js` with handle creation,
   address resolution, operation serialization, and public error shaping.
3. Attach `views: createViewMutationApi(genomeSpy)` in `embedFactory.js`.
4. Generalize import scope registration so inserted ordinary specs can also
   become scope roots through `options.scope`.
5. Refactor container mutation lifecycle so public operations call one
   coordinator.
6. Add same-parent reorder support to `ConcatView`, `LayerView`, and shared
   helper code.
7. Add guide/chrome refresh helper that covers axes and legends consistently.
8. Replace naive insertion loading with reload/repropagation logic compatible
   with `initializeVisibleViewData`.
9. Add focused unit tests for API behavior and lifecycle invariants.
10. Expand the acid-test plan into executable mutation scenarios.
11. Document the public API in `docs/api.md` once the behavior is stable.

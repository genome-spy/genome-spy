# Core WebGPU integration

This directory adapts GenomeSpy Core's view, mark, scale, selection, and layout
semantics to the retained `@genome-spy/webgpu-renderer` package. It is an
experimental rendering backend, not a second visualization runtime.

Core owns grammar interpretation, dataflow, scale resolution, layout,
occurrence order, facet topology, and interaction semantics. The renderer owns
WebGPU pipelines, buffers, textures, bind groups, picking attachments, and
their retained lifetimes. Code in this directory uses only the renderer's
documented package entry points and does not depend on its WGSL or resource
layouts.

See the [Core rendering architecture](../../../docs/architecture/rendering.md)
for the backend-neutral lifecycle and the
[renderer README](../../../../webgpu-renderer/README.md) for the low-level API.

## Frame flow

1. `WebGpuRenderCoordinator.computeLayout()` produces a completed
   `LayoutResult` after canvas sizing has settled.
2. The coordinator consumes that result once to compile an adapter-owned
   `WebGpuViewRenderingContext` frame plan. The plan retains view-hook order,
   logical marks, occurrence order, immutable layout options, and placement
   ownership; it is replaced by the next completed layout.
3. A visible or picking pass reuses the plan, invokes `onBeforeRender()` once
   per participating view, synchronizes dirty packed data and mark resources,
   and resolves live visibility and placement geometry without replaying the
   `LayoutResult`. Existing Core scale and parameter notifications advance a
   small per-mark resource revision so unrelated marks bypass slot scanning.
4. `webGpuMarkAdapter.js` translates Core encoders, resolved scales,
   selections, properties, and typed series into a renderer mark definition and
   configuration. The plan caches this shape until packed data or an
   expression-backed series changes; scale, opacity, uniform, scalar, and
   selection leaves stay live. Unsupported behavior fails here with a
   contextual error.
5. `WebGpuSurface` creates or updates one retained renderer handle per logical
   mark, resolves renderer-owned placement sets, appends ordered draw commands,
   and submits the frame.

Normal and picking passes share the same frame plan, ranges, placements, and
order. A completed picking frame is reused for pointer reads until layout,
rendering, data, or retained state invalidates it.

## Performance invariants

The retained frame path exists to keep ordinary interaction work proportional
to the state that changed. Preserve these invariants when refactoring it:

- A normal or picking paint must not replay `LayoutResult` or reconstruct mark
  occurrences. Only a completed layout replaces the frame plan.
- Stable packed data and expression revisions must preserve mark-configuration
  identity. That identity proves that series references are unchanged, while
  live scale, opacity, value, scalar, and selection leaves are checked through
  renderer slots and immutable snapshots.
- Existing scale and parameter notifications provide per-mark dirty revisions.
  Marks backed by selections remain conservatively dirty until Core exposes a
  complete selection-change notification contract; do not add a parallel
  dependency graph solely for this adapter.
- Navigation updates scale domains. Closeup transitions and scrolling may also
  replace non-uniform placement geometry. Keep those application semantics out
  of the generic renderer and continue using `PlacementSource` as the boundary.
- Full placement-geometry updates are intentional and have measured as a minor
  interaction cost. Do not replace them with an application-specific common
  offset or another shortcut without new profiling evidence.

The interaction benchmark under `packages/core/scripts/` is the regression
gate for these decisions. In layout-free interaction cases, its structural
counters should continue to report no layout replay or occurrence
reconstruction, and retained-mark checks should stay limited to dirty marks.
See `packages/core/scripts/README.md` for the command and interpretation rules.

## Retained state and lifetime

Core mark identity is the retained resource key. Repeated occurrences and
facets reuse the same renderer mark instead of duplicating pipelines or data.
Compatible changes update series, scale, value, scalar, and selection slots in
one batch. Packed-data/config revisions, scale and parameter notifications, and
view-opacity changes select the marks that need synchronization.
`WebGpuSurface` then compares those marks' live leaves against immutable
snapshots, so reusing the same config object does not suppress updates.
Changing the renderer definition recreates the handle.

Collector data revision and placement topology control packed-series caches.
Layout-only geometry changes update placement resources without repacking
stable mark data.

Resource lifetime follows Core ownership, not frame participation. Disposing a
mark's owning view releases its renderer handle and generated placement source.
Disposing a renderer-neutral `PlacementSource` releases the backend resource
derived from it. Empty, filtered, clipped, or offscreen frames keep still-owned
resources alive. Finalizing the surface releases everything that remains.

## Placement and facets

Repeated ordinary occurrences receive an adapter-owned placement source.
Sample facets and other layout producers may supply an explicit
renderer-neutral `PlacementSource` containing complete topology and normalized
`[x, y, width, height]` rectangles.

The context supports two forms through the same renderer placement contract:

- draw-level indices select facet-specific packed ranges and allow Core to omit
  zero-area or offscreen occurrences; and
- per-instance `facetIndex` values keep compatible labels and metadata in one
  coalesced draw.

Active occurrences never define packed facet topology. Complete placement
membership determines stable dense indices and collector ranges, so filtering,
sorting, closeup, peek, undo, and redo can change presentation without
recreating mark resources.

## Files

| File                            | Responsibility                                                     |
| ------------------------------- | ------------------------------------------------------------------ |
| `index.js`                      | Creates the backend and exposes surface, coordinator, and picking. |
| `webGpuRenderCoordinator.js`    | Settles layout and coordinates visible and picking passes.         |
| `webGpuViewRenderingContext.js` | Compiles and executes the retained Core frame plan.                |
| `webGpuMarkAdapter.js`          | Translates Core marks and encoders to renderer definitions.        |
| `webGpuSurface.js`              | Owns the canvas integration and retained renderer handles.         |

Tests are colocated with these modules. Run the focused suite with:

```sh
npx vitest run packages/core/src/rendering/webgpu --reporter=agent
```

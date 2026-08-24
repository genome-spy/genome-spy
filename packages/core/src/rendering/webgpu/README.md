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
2. A visible or picking pass replays that result into a fresh
   `WebGpuViewRenderingContext`; the view hierarchy is not traversed again.
3. The context collects occurrences in paint order, groups them by logical Core
   mark, packs collector batches, and resolves viewports, clips, visible ranges,
   instance ranges, and placements.
4. `webGpuMarkAdapter.js` translates Core encoders, resolved scales,
   selections, properties, and typed series into a renderer mark definition and
   configuration. Unsupported behavior fails here with a contextual error.
5. `WebGpuSurface` creates or updates one retained renderer handle per logical
   mark, resolves renderer-owned placement sets, appends ordered draw commands,
   and submits the frame.

Normal and picking collection use the same translation, ranges, placements,
and order. A completed picking frame is reused for pointer reads until layout,
rendering, data, or retained state invalidates it.

## Retained state and lifetime

Core mark identity is the retained resource key. Repeated occurrences and
facets reuse the same renderer mark instead of duplicating pipelines or data.
Compatible changes update series, scale, value, scalar, and selection slots in
one batch; changing the renderer definition recreates the handle.

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
| `webGpuViewRenderingContext.js` | Collects, packs, culls, and orders mark occurrences.               |
| `webGpuMarkAdapter.js`          | Translates Core marks and encoders to renderer definitions.        |
| `webGpuSurface.js`              | Owns the canvas integration and retained renderer handles.         |

Tests are colocated with these modules. Run the focused suite with:

```sh
npx vitest run packages/core/src/rendering/webgpu --reporter=agent
```

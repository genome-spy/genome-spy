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
   and refreshes stable materialized draw geometry without replaying the
   `LayoutResult`. Existing Core scale and parameter notifications advance
   small per-mark revisions so unrelated marks bypass slot scanning.
4. `webGpuMarkData.js` owns collector/topology packing and occurrence ranges.
   Its cache is independent of renderer configuration and resources. Eligible
   sorted point and rectangle ranges also retain a binned x index over their
   packed instance spans.
5. `webGpuMarkAdapter.js` translates Core encoders, resolved scales,
   selections, properties, and typed series into a renderer mark definition and
   configuration. The plan caches this shape until packed data or an
   expression-backed series changes; scale, semantic property, scalar,
   and selection leaves stay live. Unsupported behavior fails here with a
   contextual error.
6. The frame plan owns one stable plain draw command per occurrence.
   Before submission, the adapter resolves the guarded live x domain and
   refreshes `firstInstance` and `instanceCount` in place. `WebGpuSurface`
   attaches retained mark and placement handles, appends ordered draws and
   render groups, and submits the frame without rebuilding draw envelopes.

Normal and picking passes share the same frame plan, ranges, placements, and
order. A completed picking frame is reused for pointer reads until layout,
rendering, data, or retained state invalidates it.

## Compositing intent

Core derives two renderer-neutral groups from the completed view traversal.
Views whose local opacity differs from one isolate their ordered descendants;
the renderer applies that opacity once when compositing the group. Mark alpha
therefore stays independent of ancestor opacity. Nested views produce nested
groups, while picking remains a flat single-sampled draw list.

Four-sample coverage is limited to undecorated `rect` marks packed through a
source-backed `sample` channel or the sample-facet `facetIndex` channel. This
includes copy-number segments and both foreground and missing-value metadata
rectangles. Points, text, ordinary rectangles, and rectangles with strokes,
rounded corners, shadows, or hatches stay on the direct single-sample path. A
placement-indexed retained mark is one draw and therefore one resolve,
regardless of its number of sample facets.

`EmbedResult.debug.getWebGpuFramePlanSummary()` exposes serializable group
bounds, sample counts, opacities, mark types, and view paths for development
checks without exposing renderer resources. Development canvases mirror the
same JSON in `data-webgpu-frame-plan` for browser smoke tests. WebGL continues
to consume effective per-mark opacity and receives no render-group behavior.

## Raster export

Full PNG and hybrid SVG rasterization reuse the live renderer's device, mark
handles, placement sets, and pipelines through a detached canvas target. Each
target has independent logical dimensions, backing dimensions, and device
pixel ratio; export therefore compiles a fresh layout instead of stretching
the live canvas. The live coordinator retains its frame plan and redraws after
the export restores the view hierarchy's live layout.

Hybrid SVG keeps run discovery, placeholders, cropping, and document order in
the SVG renderer. WebGPU receives one mark predicate per run, clears the
export-sized target transparently, waits for the queue, and embeds the cropped
PNG into the existing placeholder. Asynchronous raster and SVG exports are
serialized because they synchronize shared retained mark configuration.

## Performance invariants

The retained frame path exists to keep ordinary interaction work proportional
to the state that changed. Preserve these invariants when refactoring it:

- A normal or picking paint must not replay `LayoutResult` or reconstruct mark
  occurrences. Only a completed layout replaces the frame plan.
- Stable packed data and expression revisions must preserve mark-configuration
  identity. That identity proves that series references are unchanged, while
  live scale, value, property, scalar, and selection leaves are checked through
  renderer slots and immutable snapshots. Local view opacity is frame group
  state and does not dirty mark resources. Core never names built-in shader
  uniforms.
- Existing scale, parameter, and selection notifications provide per-mark dirty
  revisions. Keep that dependency tracking in Core marks rather than adding a
  parallel graph solely for this adapter.
- X-domain navigation queries stable packed-range indexes without repacking
  series or uploading buffers. Visible and picking passes use the same
  one-viewport query guard.
- Navigation updates scale domains. Closeup transitions and scrolling may also
  replace non-uniform placement geometry. Keep those application semantics out
  of the generic renderer and continue using `PlacementSource` as the boundary.
- Full placement-geometry updates are intentional and have measured as a minor
  interaction cost. Do not replace them with an application-specific common
  offset or another shortcut without new profiling evidence.
- Closure-backed Core rectangles remain transitional inputs to the frame plan,
  but they never cross `WebGpuSurface`. Until their producers expose complete
  geometry revisions, refresh their stable numeric viewport, scissor, culling,
  and generated-placement records in place after `onBeforeRender()`.

The interaction benchmark under `packages/core/scripts/` is the regression
gate for these decisions. In layout-free interaction cases, its structural
counters should continue to report no layout replay or occurrence
reconstruction, and retained-mark checks should stay limited to dirty marks.
See `packages/core/scripts/README.md` for the command and interpretation rules.

## Retained state and lifetime

Core mark identity is the retained resource key. Repeated occurrences and
facets reuse the same renderer mark instead of duplicating pipelines or data.
Compatible changes update series, scale, value, semantic property, scalar, and
selection slots in one batch. Packed-data/config revisions plus scale and
parameter notifications select the marks that need synchronization.
`WebGpuSurface` compiles scale, value, semantic-property, and
scalar leaves into a flat list of direct slot updates when configuration shape
changes. Dirty paints iterate that list without rediscovering configuration
structure; immutable snapshots still detect in-place array changes. Selection
slots retain their separate type-specific synchronization. Changing the
renderer definition recreates the handle.

Collector data revision and placement topology control packed-series caches.
Layout-only geometry changes update placement resources without repacking
stable mark data. Draw-command, viewport, scissor, visible-range, and placement
envelope identity remains stable between paints; mutable numeric fields are
refreshed before culling and submission.

Resource lifetime follows Core ownership, not frame participation. Disposing a
mark's owning view releases its renderer handle and generated placement source.
Disposing a renderer-neutral `PlacementSource` releases the backend resource
derived from it. Empty, filtered, clipped, or offscreen frames keep still-owned
resources alive. Finalizing the surface releases everything that remains.

An unexpected device loss is terminal for the current Core instance. The
surface forwards the renderer's `onDeviceLoss` notification through Core's
existing `EmbedOptions.onError` and default message-box path exactly once; it
does not recreate the renderer or fall back to another backend. Intentional
surface finalization suppresses the notification.

Each retained mark supplies the renderer with a diagnostic owner in the form
`<unit-view path> [<Core mark type>]`. GPU resource labels append their role to
that owner, making validation errors and captures traceable to explicit Core
view names or their generated fallbacks. The Core mark type is retained even
when several Core marks share one low-level renderer definition.

## Placement and facets

Repeated ordinary occurrences receive an adapter-owned placement source.
Sample facets and other layout producers may supply an explicit
renderer-neutral `PlacementSource` containing complete topology and normalized
`[x, y, width, height]` rectangles.

The context supports two forms through the same renderer placement contract:

- draw-level indices select facet-specific packed ranges and allow Core to omit
  zero-area or offscreen occurrences; and
- per-instance placement indices keep compatible sample-faceted marks in one
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
| `webGpuMarkData.js`             | Packs collector topology and resolves occurrence ranges.           |
| `webGpuMarkAdapter.js`          | Translates Core marks and encoders to renderer definitions.        |
| `webGpuSurface.js`              | Owns the canvas integration and retained renderer handles.         |

Tests are colocated with these modules. Run the focused suite with:

```sh
npx vitest run packages/core/src/rendering/webgpu --reporter=agent
```

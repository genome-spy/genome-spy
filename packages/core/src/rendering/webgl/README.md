# Legacy WebGL renderer

This directory contains GenomeSpy Core's legacy WebGL2 renderer. It remains a
production backend during the transition to WebGPU with Canvas2D fallback, but
it is intentionally isolated so it can eventually be deleted as one module.

The implementation is dynamically imported by `../renderingBackend.js`.
Shared Core modules must not import TWGL, GLSL, `WebGLHelper`, WebGL mark
delegates, or renderer resource types. The compatibility UMD bundle still
inlines dynamic modules because its format cannot emit runtime chunks.

## Backend boundary

`index.js` is the module entry point. It constructs the WebGL surface and its
private resource owner, then exposes only the capabilities understood by
`RenderingBackend`:

- live rendering and picking;
- full-canvas and raster export;
- selective rasterization for hybrid SVG export;
- font bitmap preparation; and
- renderer-specific mark diagnostics.

Raster export and hybrid SVG rasterization receive the already-selected
backend through this capability boundary. This module does not select or
initialize another renderer.

## Initialization and lifetime

When `webgl` is selected, `renderingBackend.js` dynamically imports this
directory's `index.js`. The entry point creates one `WebGLHelper` and one
`WebGLRendererResources` for the lifetime of the backend. The helper creates
the canvas, WebGL2 context, picking framebuffer, size observer, and global GL
state; the resource owner registers itself as the helper's resource finalizer.
The returned backend capabilities all close over this same pair, so live
rendering and export share mark programs, buffers, fonts, and scale textures.

Mark resources are created lazily, when a buffered context first encounters a
drawable semantic mark:

1. `WebGLRendererResources` creates a type-specific delegate and records a
   `compiling` entry keyed by the semantic mark.
2. It retains the mark's scale resolutions and registers a disposer on the
   owning `UnitView`.
3. Delegate initialization starts all required shader programs. Only after all
   missing programs have been started are they finalized and entries marked
   `ready`.
4. The entry records its collector identity and data, configuration, and
   encoded-data revisions. Later frames upload vertex data only when one of
   those values changes.

Text bitmap decoding may proceed in parallel with mark initialization. Font
textures are cached by bitmap URL in the resource owner and are therefore also
shared by live rendering and export.

## Frame flow

1. `RenderCoordinator` computes a completed `LayoutResult` and creates separate
   buffered contexts for visible and picking passes.
2. `BufferedViewRenderingContext` records semantic marks and their occurrences
   without attaching renderer state to the marks.
3. `WebGLRendererResources` owns one retained WebGL delegate per logical mark.
   It starts all missing shader programs before finalizing them, then
   synchronizes vertex data from collector, mark-configuration, and encoded-data
   revisions.
4. The buffered context resolves each delegate once while compiling the ordered
   draw batch. Subsequent paints reuse direct callbacks while checking that the
   adapter entry is still live and drawable.
5. Normal and picking paints synchronize retained entries before drawing.

Canvas export and hybrid SVG raster runs construct their own buffered contexts
but use the same resource owner and preparation rules as live rendering.

## Resource ownership

Semantic marks own configuration, encoders, data semantics, hit testing, and
backend-neutral rendering revisions. They do not own WebGL delegates or expose
graphics lifecycle methods.

`WebGLRendererResources` owns mark delegates, scale-resolution subscriptions,
range-texture coordination, and font textures. A delegate is released through
its owning `UnitView` disposer. Failed initialization releases partial
resources, and failed shader finalization also releases retained scale
subscriptions.

There are two intentionally separate kinds of scale subscriptions. The
resource owner reference-counts subscriptions that refresh shared range
textures. Individual delegates track their own domain and range listeners for
updating uniforms, and remove them when disposed. Buffered draw batches retain
entry identities rather than owning delegates; they check that an entry is
still active before drawing, so releasing a mark also makes older batches
harmless.

`WebGLHelper` owns the canvas, context-global textures, cached shaders, picking
framebuffer, placement resources, and size observers. Finalizing the surface
first disposes the mark resource owner and then releases the remaining helper
resources. Cleanup is idempotent because view disposal and backend disposal may
occur in either order.

Normal view teardown calls `releaseMark` through the `UnitView` disposer. Full
GenomeSpy destruction first disposes the view subtree and then calls
`surface.finalize()`. The latter releases any remaining delegates and font
textures before deleting helper-owned textures, shaders, picking attachments,
observers, and the canvas. Launch failures use the same surface finalizer, and
all cleanup paths tolerate being called more than once.

## Directory map

| Path                              | Responsibility                                      |
| --------------------------------- | --------------------------------------------------- |
| `index.js`                        | Creates the backend and exposes its capabilities.   |
| `rendererResources.js`            | Owns retained mark entries, fonts, and scale links. |
| `renderCoordinator.js`            | Settles layout and coordinates render passes.       |
| `bufferedViewRenderingContext.js` | Compiles and executes ordered WebGL batches.        |
| `canvasExport.js`                 | Renders full-canvas and raster exports.             |
| `svgRasterizer.js`                | Renders selected hybrid SVG runs.                   |
| `marks/`                          | Implements legacy mark delegates and GLSL setup.    |
| `gl/`                             | Implements WebGL helpers, shaders, and vertex data. |
| `types.d.ts`                      | Defines WebGL-private lifecycle types.              |

## Change constraints

- Keep every TWGL and GLSL dependency under this directory.
- Preserve shader source, attribute layouts, draw ordering, picking IDs, and
  buffer-reuse behavior unless a change explicitly targets them.
- Keep retained state behind `WebGLRendererResources`; do not restore delegate
  forwarding to semantic marks, dataflow, scales, fonts, or shared contexts.
- Prefer direct legacy code over a new common renderer abstraction. WebGPU and
  Canvas2D do not implement this retained lifecycle.
- Do not change the WebGPU renderer or its Core adapter to accommodate WebGL.

Focused tests can be run with:

```sh
npx vitest run packages/core/src/rendering/webgl packages/core/src/marks \
  --reporter=agent
```

See the [Core rendering architecture](../../../docs/architecture/rendering.md)
for the backend-neutral lifecycle and migration boundary.

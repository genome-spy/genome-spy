# Rendering, Shaders, and Resources

## Arrangement and rendering

Rendering starts with two backend-neutral stages:

1. A full `View.arrange()` traversal computes view coordinates and produces a
   completed `LayoutResult` containing ordered view and mark placements.
2. A backend consumes that result. Canvas2D and SVG draw while consuming it;
   WebGL builds optimized normal and picking batches and draws them afterward.

Arrangement receives the logical viewport and device pixel ratio because layout
uses both for pixel alignment. The result contains placement order and current
layout references, but no backend resources or retained placement identity.
Canvas2D retains the latest live result for repainting. WebGL consumes and
discards it after building fresh batches.

Zoom and pan update scale domains and rerun rendering. Vertex buffers update
only when data changes.

### Renderer-neutral placement sources

Views that lay out repeated panels may publish a `PlacementSource`: an
immutable snapshot containing complete placement topology and normalized
`[x, y, width, height]` rectangles. Geometry-only updates advance the geometry
revision while retaining the topology; topology changes replace both together.
Backends resolve the source into their own representation, and disposal only
releases those derived resources. App and Core layout code do not own WebGL or
WebGPU resources. This keeps filtering and presentation changes separate from
the complete membership used to index retained mark data.

## Rendering contexts and scheduling

- WebGL's `BufferedViewRenderingContext`
  (`src/rendering/webgl/bufferedViewRenderingContext.js`) buffers mark
  placements and builds an ordered batch behind the renderer boundary.
- `CompositeViewRenderingContext` combines contexts, including picking.
- `LayoutResult.collectRenderCommands()` replays placements into a context
  without traversing the view hierarchy again.
- The WebGL context records semantic marks and placements, then asks its private
  adapter to prepare and synchronize retained delegates before compiling draw
  callbacks. The ordered batch resolves each delegate once and minimizes state
  changes across paints.
- `Animator` (`src/utils/animator.js`) centralizes render requests. Many reactive
  updates call `animator.requestRender()` directly.

## Renderer organization

Modular rendering implementations live under `src/rendering/`:

- `canvas2d/` owns the live compatibility surface, immediate drawing, and PNG
  export.
- `svg/` owns structured SVG export and SVG-specific definitions.
- `immediate/` projects, constructs, and culls mark occurrences shared by
  Canvas2D and SVG. It must not depend on a rendering backend.
- `webgl/` owns the legacy WebGL surface, TWGL and GLSL implementation, mark GPU
  delegates, batching, picking, and rasterization.
- `webgpu/` is the development-only Core adapter for the separate WebGPU
  renderer package.
- `renderingModuleRegistry.js` holds opt-in loaders without importing renderer
  implementations.
- `renderingBackend.js` selects a registered live surface and exposes
  rendering, export, and optional picking capabilities.

The full entrypoint registers dynamically imported WebGL, Canvas2D, and SVG
modules. The minimal entrypoint registers none of them; applications enable
only the capabilities they use through public side-effect imports. Automatic
selection tries registered WebGL first and then registered Canvas2D. Explicit
Canvas2D and WebGPU selection does not initialize WebGL. An explicit WebGL
failure is reported.

Semantic marks remain under `src/marks/`. They own configuration, encoders,
data, facet semantics, and rendering revisions. WebGL's private adapter owns one
retained delegate per logical mark and releases it through the owning view's
disposer registry. WebGL programs, buffers, textures, and draw callbacks never
become shared mark state or cross through `ViewContext`.

SVG hybrid export counts visible instances and selects contiguous paint-order
runs within the SVG subsystem. It asks the selected backend for an optional
selective rasterization capability and may fall through to detached Canvas2D.
Run selection, image placeholders, cropping, and document ordering remain
SVG-owned. Export never initializes an unselected GPU backend.

The ESM build preserves these dynamic boundaries. Its minimal entry chunk and
complete chunk graph exclude unregistered renderers. UMD is a compatibility
artifact and inlines dynamic modules because its format cannot emit runtime
chunks.

## Shader generation and programs

- Shaders are generated dynamically from encodings and scales.
- GLSL generation lives in
  `src/rendering/webgl/gl/glslScaleGenerator.js` and
  `src/rendering/webgl/gl/includes/*.glsl`.
- Encoders generate attribute declarations, scale mappings, conditional
  encodings, and selection predicates.
- `WebGLHelper.compileShader`
  (`src/rendering/webgl/gl/webGLHelper.js`) centralizes compilation. Normalized
  source keys cache shaders, and link time checks compilation errors.
- WebGL mark delegates create and link programs through twgl.js and configure
  static/dynamic uniforms, view/mark uniform blocks, vertex arrays, and buffers.

## GPU and CPU resources

### Context and global state

`WebGLHelper` owns the canvas and WebGL2 context, including extension setup,
defaults, premultiplied-alpha blending, the picking framebuffer, and
device-pixel-ratio scaling. Surface finalization first disposes the WebGL mark
adapter and then releases helper-owned textures, cached shaders, picking
attachments, size observers, and the canvas.

### Buffers and geometry

- WebGL delegates create vertex buffers per mark and per attribute through TWGL.
- `updateBufferInfo` uses sub-data-style updates when capacity allows and
  reallocates when new data exceeds the allocation.
- Each WebGL delegate keeps a `rangeMap` from facets to vertex ranges for
  efficient batch rendering.

### Textures and picking

- Textures represent color ramps and discrete schemes
  (`src/rendering/webgl/gl/colorUtils.js`), multi-point selections, and
  offscreen picking data.
- The WebGL adapter prepares font textures from renderer-neutral bitmap URLs and
  subscribes to the scale resolutions used by its retained marks. Font and
  range textures are not stored in semantic fonts, marks, or scale planning.
- Picking renders into a dedicated framebuffer owned by `WebGLHelper`.
- Marks can opt out of picking; some render only into the picking target.

## WebGPU migration implications

WebGL-specific behavior is concentrated under `src/rendering/webgl/`. WebGL and
WebGPU remain independently selectable while the transition is incomplete.
Both consume the same semantic marks but own their GPU implementations and
resource lifetimes. WebGPU consumes each settled `LayoutResult` once to compile
an adapter-owned frame plan that preserves placement order across paints.
Ordinary visible and picking passes reuse that plan while retaining compatible
pipelines, buffers, textures, and bind groups.

The WebGL directory is intentionally a deletion boundary. A migration can
retain the dataflow, view hierarchy, semantic marks, and encoding logic while
replacing:

- `WebGLHelper` with WebGPU device and surface setup
- TWGL buffer/texture operations with WebGPU resources
- GLSL compilation/linking with WGSL render-pipeline creation
- The picking framebuffer with an offscreen WebGPU render pass

Do not make WebGPU emulate WebGL resource layouts or depend on the
immediate-mode CPU projection layer. Shared Core exposes semantic marks,
rendering revisions, completed layout results, and optional backend
capabilities, but no retained-mark lifecycle.

### WebGPU integration boundary

Core accesses `@genome-spy/webgpu-renderer` only from `src/rendering/webgpu/`
through the documented package root and built-in `marks/*` and `scales/*`
subpaths. The adapter may translate Core encoders, resolved scales, traversal,
and view coordinates into renderer configs and frame state. It must not import
renderer implementation modules, instantiate mark programs, inspect definition
internals, or depend on WGSL and GPU resource layouts.

The renderer is unpublished and Core is its sole consumer. This boundary is a
design hypothesis, not a compatibility constraint. When integration exposes an
insufficient abstraction, unclear ownership, unnecessary work, or an obstacle
to optimization, document the problem explicitly and propose a breaking API
improvement. Prefer improving the generic renderer contract over accumulating
Core-only workarounds, while keeping Core grammar and view types out of the
renderer package.

The adapter consumes a completed layout into one retained frame plan before
submitting WebGPU draws. The plan keeps ordered view hooks, logical marks,
occurrence ranges, immutable layout options, and placement ownership without
becoming a second view hierarchy. Visible and picking passes share it. The
adapter packs collector batches once per logical mark and retains one renderer
handle. Repeated ordinary marks use an adapter-owned placement source, while
renderer-neutral placement sources remain owned by their Core or App layout
producer. Neither an empty draw list nor offscreen placement releases retained
resources; mark/view and placement-source disposal do.

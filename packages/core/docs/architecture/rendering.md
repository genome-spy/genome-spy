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

- `BufferedViewRenderingContext`
  (`src/view/renderingContext/bufferedViewRenderingContext.js`) buffers mark
  placements and builds an ordered batch.
- `CompositeViewRenderingContext` combines contexts, including picking.
- `LayoutResult.collectRenderCommands()` replays placements into a context
  without traversing the view hierarchy again.
- Contexts call `mark.render()` during consumption to obtain draw callbacks,
  which the WebGL batch executes while minimizing state changes.
- `Animator` (`src/utils/animator.js`) centralizes render requests. Many reactive
  updates call `animator.requestRender()` directly.

## Renderer organization

Modular rendering implementations live under `src/rendering/`:

- `canvas2d/` owns the live compatibility surface, immediate drawing, and PNG
  export.
- `svg/` owns structured SVG export and SVG-specific definitions.
- `immediate/` projects, constructs, and culls mark occurrences shared by
  Canvas2D and SVG. It must not depend on a rendering backend.
- `renderingBackend.js` selects the live surface and exposes rendering, export,
  and optional picking capabilities.

The existing WebGL implementation remains split between `src/marks/` and
`src/gl/`. This is a transitional exception: WebGL code is not extracted into
a modular renderer before it is replaced. The experimental WebGPU integration
lives under `src/rendering/webgpu/`; `@genome-spy/webgpu-renderer` owns its
pipelines, buffers, textures, bind groups, and per-mark resources rather than
storing WebGPU state in Core marks.

SVG hybrid export counts visible instances and selects contiguous paint-order
runs within the SVG subsystem. Its nested `svg/raster/webgl.js` adapter may use
the existing buffered WebGL renderer to rasterize selected runs. This lazy leaf
is the only intended SVG-to-WebGL dependency; run selection, image
placeholders, cropping, and document ordering remain SVG-owned.

## Shader generation and programs

- Shaders are generated dynamically from encodings and scales.
- GLSL generation lives in `src/gl/glslScaleGenerator.js` and
  `src/gl/includes/*.glsl`.
- Encoders generate attribute declarations, scale mappings, conditional
  encodings, and selection predicates.
- `WebGLHelper.compileShader` (`src/gl/webGLHelper.js`) centralizes compilation.
  Normalized source keys cache shaders, and link time checks compilation errors.
- Marks create and link programs through twgl.js and configure static/dynamic
  uniforms, view/mark uniform blocks, vertex arrays, and buffers.

## GPU and CPU resources

### Context and global state

`WebGLHelper` owns the canvas and WebGL2 context, including extension setup,
defaults, premultiplied-alpha blending, the picking framebuffer, and
device-pixel-ratio scaling.

### Buffers and geometry

- Marks create vertex buffers per mark and per attribute through TWGL.
- `updateBufferInfo` uses sub-data-style updates when capacity allows and
  reallocates when new data exceeds the allocation.
- Each mark keeps a `rangeMap` from facets to vertex ranges for efficient batch
  rendering.

### Textures and picking

- Textures represent color ramps and discrete schemes
  (`src/gl/colorUtils.js`), multi-point selections, and offscreen picking data.
- Picking renders into a dedicated framebuffer owned by `WebGLHelper`.
- Marks can opt out of picking; some render only into the picking target.

## WebGPU migration implications

WebGL-specific behavior is concentrated in `src/gl/`, mark buffer/program code
under `src/marks/`, and render-context batch execution. WebGL and a modular
WebGPU renderer may coexist while the transition is incomplete. During that
period, WebGL continues to call `mark.render()`, while WebGPU dispatches marks
through renderer-owned implementations and resources. WebGPU may consume the
latest `LayoutResult` on each paint to preserve placement order while retaining
compatible pipelines, buffers, textures, and bind groups between frames. Core
does not prescribe those resource lifetimes. A migration can retain the
dataflow, view hierarchy, mark abstraction, and encoding logic while replacing:

- `WebGLHelper` with WebGPU device and surface setup
- TWGL buffer/texture operations with WebGPU resources
- GLSL compilation/linking with WGSL render-pipeline creation
- The picking framebuffer with an offscreen WebGPU render pass

Do not make WebGPU emulate `glHelper` or depend on the immediate-mode CPU
projection layer. Existing `glHelper` access remains a legacy WebGL escape
hatch until WebGL-specific mark code is deleted.

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

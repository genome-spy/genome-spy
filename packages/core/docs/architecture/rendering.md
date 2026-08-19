# Rendering, Shaders, and Resources

## Two-phase rendering

1. The layout phase computes view coordinates and hierarchy and builds an
   optimized render batch that minimizes state changes.
2. The rendering phase executes the batch by binding programs, setting uniforms,
   and drawing.

Zoom and pan update scale domains and rerun rendering. Vertex buffers update
only when data changes.

## Rendering contexts and scheduling

- `BufferedViewRenderingContext`
  (`src/view/renderingContext/bufferedViewRenderingContext.js`) buffers mark
  render calls and builds an ordered batch.
- `CompositeViewRenderingContext` combines contexts, including picking.
- Contexts call `mark.render()` to obtain draw callbacks, which the batch
  executes while minimizing state changes.
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
a modular renderer before it is replaced. A future WebGPU implementation
belongs under `src/rendering/webgpu/` and should own its pipelines, buffers,
textures, bind groups, and per-mark resource maps rather than storing WebGPU
state in marks.

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
through renderer-owned implementations and resources. A migration can retain
the dataflow, view hierarchy, mark abstraction, and encoding logic while
replacing:

- `WebGLHelper` with WebGPU device and surface setup
- TWGL buffer/texture operations with WebGPU resources
- GLSL compilation/linking with WGSL render-pipeline creation
- The picking framebuffer with an offscreen WebGPU render pass

Do not make WebGPU emulate `glHelper` or depend on the immediate-mode CPU
projection layer. Existing `glHelper` access remains a legacy WebGL escape
hatch until WebGL-specific mark code is deleted.

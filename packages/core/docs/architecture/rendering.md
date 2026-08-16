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
under `src/marks/`, and render-context batch execution. A migration can retain
the dataflow, view hierarchy, mark abstraction, encoding logic, and the general
shader-generation approach while replacing:

- `WebGLHelper` with WebGPU device and surface setup
- TWGL buffer/texture operations with WebGPU resources
- GLSL compilation/linking with WGSL render-pipeline creation
- The picking framebuffer with an offscreen WebGPU render pass

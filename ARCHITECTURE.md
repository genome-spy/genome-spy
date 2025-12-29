# GenomeSpy Core Architecture (WebGL)

This document summarizes the `packages/core` architecture with an emphasis on
WebGL usage: rendering pipeline, shader management, resource handling, and key
design patterns.

## Scope

- Focused on `packages/core`
- WebGL 2.0 rendering (no scene graph, no three.js)
- Covers architecture, dataflow, rendering, shaders, and resources

## High-Level Architecture

- Entry point is `packages/core/src/index.js` which exports `embed()` and
  `GenomeSpy`.
- `GenomeSpy` (`packages/core/src/genomeSpy.js`) is the central orchestrator:
  builds view hierarchy, constructs/optimizes dataflow, manages rendering
  contexts, and schedules animation.
- The system is divided into:
  - View hierarchy (layout, scales, axes, interactions)
  - Dataflow graph (sources, transforms, collectors)
  - Rendering pipeline (WebGL context + mark rendering)
  - Reactivity (params + expressions)

## View System and Layout

- `View` (`packages/core/src/view/view.js`) is the base class handling:
  - Layout sizing and caching
  - Scale and axis resolution references
  - Param mediation and scoped params
  - Tree traversal and broadcasting
- `ViewFactory` (`packages/core/src/view/viewFactory.js`) instantiates view
  subclasses based on spec shape:
  - `UnitView` -> renders marks
  - `LayerView`, `ConcatView`, `GridView` -> compose layout
- `UnitView` (`packages/core/src/view/unitView.js`) instantiates a `Mark`
  (rect/point/rule/link/text) and connects encodings to scales, selections, and
  axes.

## Dataflow Architecture

- Dataflow is a graph of `FlowNode` instances.
- Built in `packages/core/src/view/flowBuilder.js` by traversing the data-parent
  tree (not necessarily the layout tree).
- Root nodes are data sources; terminal nodes are collectors:
  - Sources: `packages/core/src/data/sources`
  - Transforms: `packages/core/src/data/transforms`
  - Collector: `packages/core/src/data/collector.js`
- `FlowNode` behaviors are marked as:
  - `BEHAVIOR_CLONES` (clone data)
  - `BEHAVIOR_MODIFIES` (mutate data)
  - `BEHAVIOR_COLLECTS` (materialize and reuse)
- `Collector` stores materialized data, supports grouping/sorting, and provides
  fast lookups (including unique-id indexing for picking).

## Rendering Pipeline

### Two-phase rendering model

1. Layout phase
   - Compute view coordinates and layout hierarchy.
   - Build an optimized render batch that minimizes state changes.
2. Rendering phase
   - Execute batch: bind programs, set uniforms, draw.
   - Zoom/pan updates scale domains and re-runs rendering only; vertex buffers
     update only when data changes.

### Rendering contexts

- `BufferedViewRenderingContext` buffers mark render calls and builds an ordered
  batch (`packages/core/src/view/renderingContext/bufferedViewRenderingContext.js`).
- `CompositeViewRenderingContext` composes multiple contexts (e.g., picking).
- Contexts call `mark.render()` to get draw callbacks, which are executed in
  the batch with minimized state changes.

### Animation and scheduling

- `Animator` (`packages/core/src/utils/animator.js`) centralizes render requests.
- Many reactive updates call `animator.requestRender()` directly.

## Shader Management

### Dynamic GLSL generation

- Shaders are dynamically generated based on encoding and scales.
- GLSL generation lives in:
  - `packages/core/src/gl/glslScaleGenerator.js`
  - `packages/core/src/gl/includes/*.glsl`
- Encoders generate:
  - Attribute declarations
  - Scale mappings
  - Conditional encodings
  - Selection predicates

### Shader compilation and caching

- Shader compilation is centralized in `WebGLHelper.compileShader`
  (`packages/core/src/gl/webGLHelper.js`).
- Shader sources are cached by a normalized source key; compilation errors are
  checked at link time.

### Program setup

- Marks create and link programs via `twgl.js`.
- Each mark sets:
  - Static and dynamic uniforms
  - Uniform blocks (view/mark)
  - Vertex arrays and buffers

## Resource Handling (GPU & CPU)

### WebGL context and global state

- `WebGLHelper` owns the canvas and WebGL2 context:
  - Extension setup and defaults
  - Blend configuration (premultiplied alpha)
  - Picking framebuffer and DPR scaling

### Buffers and geometry

- Marks create vertex buffers per mark and per attribute via TWGL.
- Buffer updates:
  - `updateBufferInfo` uses `bufferSubData`-style updates when possible.
  - Full reallocation happens if data exceeds the allocated size.
- Each mark maintains a `rangeMap` to map facets to vertex ranges for efficient
  batched rendering.

### Textures

- Textures are used for:
  - Color ramps and discrete color schemes (`packages/core/src/gl/colorUtils.js`)
  - Selection textures for multi-point selection
  - Picking buffers (offscreen framebuffer)

### Picking

- Picking uses a dedicated offscreen framebuffer in `WebGLHelper`.
- Marks can opt in/out of picking; some marks only render into picking buffer.

## Reactivity and Expression System

- Params are managed per view in `ParamMediator`.
- Expressions are parsed/compiled using `vega-expression` and bound to param
  values via generated accessors.
- Expression changes trigger:
  - Render requests (e.g., mark uniforms, opacity)
  - Dataflow repropagation (e.g., `filter`, `formula`)
  - Data reloads (e.g., URL-based sources)
- `activateExprRefProps` turns ExprRef properties into getters and batches
  updates via microtasks.

## Key Design Patterns

- **Grammar-based declarative spec**:
  - Specifications define views, marks, encodings, transforms, and scales.
- **Dataflow graph**:
  - Data sources + transforms + collectors form a re-evaluable pipeline.
- **GPU-first rendering**:
  - GPU handles scale transforms and rendering; CPU avoids building scene graphs.
- **Batched rendering**:
  - Render calls are sorted and batched to reduce WebGL state changes.
- **Param hierarchy**:
  - Scoped param lookup via view hierarchy; expressions automatically attach
    listeners to upstream params.

## Notable Technical Decisions

- **No scene graph**:
  - Avoids CPU-heavy scene graph rebuilding; updates are pushed to GPU buffers.
- **Dynamic shader generation**:
  - Enables flexible encodings and selections without manual shader authoring.
- **WebGL 2.0 requirement**:
  - Uses WebGL2 features and extensions; improves performance and precision.
- **Selection implemented in GPU**:
  - Interval selections mapped to uniforms; multi-point selections use textures.

## WebGPU Migration Implications

- WebGL abstractions are localized in:
  - `packages/core/src/gl` (context, textures, shader generation)
  - `packages/core/src/marks` (buffer creation, program usage)
  - Rendering contexts (batch execution and state changes)
- Migration strategy can preserve:
  - Dataflow + view hierarchy
  - Mark abstraction and encoding logic
  - Shader generation logic (replace GLSL with WGSL generator)
- Key replacement areas:
  - `WebGLHelper` -> WebGPU device/surface setup
  - TWGL usage -> WebGPU buffer/texture creation
  - Shader compilation/linking -> WGSL pipeline creation
  - Picking framebuffer -> WebGPU render pass to offscreen texture

The detailed plan now lives in
`packages/webgpu-renderer/MIGRATION_PLAN.md`.

## Quick Pointers

- Entry: `packages/core/src/index.js`
- Orchestrator: `packages/core/src/genomeSpy.js`
- View hierarchy: `packages/core/src/view/*`
- Dataflow: `packages/core/src/data/*`
- Marks and shaders: `packages/core/src/marks/*`, `packages/core/src/gl/*`

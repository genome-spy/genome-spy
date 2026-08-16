# GenomeSpy Core Architecture

GenomeSpy Core is a WebGL2 declarative visualization library without a scene
graph or three.js. Paths in this document and the linked Core architecture
documents are relative to `packages/core/`.

It coordinates four major systems:

- A view hierarchy for layout, scales, axes, and interactions
- A dataflow graph of sources, transforms, and collectors
- A GPU-first rendering pipeline built around marks and batched draw callbacks
- Scoped parameters and expressions for reactivity

## Entry and orchestration

- `src/index.js` exports `embed()` and `GenomeSpy`.
- `src/genomeSpy.js` is the central orchestrator. It builds the view hierarchy,
  initializes subtree dataflows, manages rendering contexts, and schedules
  animation.

## Architecture topics

- Views, layout, dataflow, readiness, and dynamic lifecycle:
  `docs/architecture/views-and-dataflow.md`
- Rendering pipeline, shader management, CPU/GPU resources, picking, and WebGPU
  implications: `docs/architecture/rendering.md`
- Scoped parameters, expression binding, and propagation:
  `docs/architecture/reactivity.md`

## Key design patterns

- **Grammar-based declarative specification:** specifications define views,
  marks, encodings, transforms, and scales.
- **Dataflow graph:** sources, transforms, and collectors form a re-evaluable
  pipeline.
- **GPU-first rendering:** the GPU performs scale transforms and rendering while
  the CPU avoids building a scene graph.
- **Batched rendering:** render calls are ordered to reduce WebGL state changes.
- **Parameter hierarchy:** scoped lookup follows view/data-parent ancestry;
  expressions attach owner-scoped listeners to upstream parameters.

## Notable decisions

- **No scene graph:** avoids CPU-heavy scene-graph rebuilding and pushes updates
  into GPU buffers.
- **Dynamic shader generation:** supports flexible encodings and selections
  without manually authored shader variants.
- **WebGL2 requirement:** uses WebGL2 features and extensions for performance and
  precision.
- **GPU selections:** interval selections use uniforms and multi-point
  selections use textures.

## Quick pointers

- Entry: `src/index.js`
- Orchestrator: `src/genomeSpy.js`
- View hierarchy: `src/view/`
- Dataflow: `src/data/`
- Marks: `src/marks/`
- WebGL and shaders: `src/gl/`
- Parameters: `src/paramRuntime/`

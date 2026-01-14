# GenomeSpy

GenomeSpy is a high-performance, web-based visual analytics toolkit for genomic
data. It combines a declarative visualization grammar with a custom GPU-
accelerated rendering engine to provide smooth interaction with large,
heterogeneous datasets, including copy number profiles, structural variants,
mutations, and metadata across cohorts. The project includes a modular core and
a schema-driven specification format.

GenomeSpy Core provides building blocks such as marks, scales, axes, and data
transforms, inspired by Vega/Vega-Lite. GenomeSpy App is a higher-level
interactive application for cohort analysis, built on the Core with provenance-
aware interactions.

## Tech stack in use

- Fully client-side application using modern web technologies
- JavaScript (Modern ESNext) typed with JSDoc
- TypeScript for more complex type definitions and JSON Schema generation
- Monorepo managed with lerna-lite

### Core

- WebGL rendering via twgl.js
- JSON Schema built from TypeScript types
- Application state is maintained in the view hierarchy
  - Data flow (built from FlowNode objects) handles data input and transformation
  - ScaleResolution collects views that share scales and initializes the scales
  - ParamMediator manages reactive parameters (signals)

### App

- Embeds GenomeSpy Core for rendering
- State management with Redux Toolkit (including provenance tracking)
- UI components with Lit
- Iconography with FontAwesome
- No external CSS frameworks or component libraries

### Testing

- Unit tests with Vitest
- Tests live next to code, with `.test.` in the filename
- When writing tests, add a short comment for non-obvious test setup/intent.

### Running tests and linting

- From repo root, run the full unit suite: `npm test`
- Run a focused Vitest suite: `npx vitest run packages/app/src/sampleView/sampleView.test.js`
- TypeScript checks for workspaces (if present): `npm -ws run test:tsc --if-present`
- Lint the workspace sources: `npm run lint`

## Project and code guidelines

- Always use type hints in any language which supports them
- JavaScript/TypeScript files should use JSDoc for type annotations
- Use a blank line between adjacent members with JSDoc; skip it for the first member in a block
- JavaScript is indented with 4 spaces, no tabs
- WGSL code should be indented with 4 spaces, no tabs
- JSON files are indented with 2 spaces, no tabs
- Use modern ESNext syntax (async/await, arrow functions, destructuring, spread)
- Use Array.from instead of spread when converting NodeList to Array
- Prefer const over let unless reassignment is needed
- Use offensive, not defensive coding style
  - Rely on types and type checking instead of runtime checks
  - Fail fast on unexpected inputs
  - Avoid unnecessary null/undefined checks and optional chaining
  - Validate inputs at application boundaries only
- Prefer explicit `else` blocks over early-return branches when both paths are
  similarly likely.
- Prefer explicit contracts over implicit behavior (e.g., require domains for ordinal/band)
- Prefer explicit, readable string concatenation over template literals for
  trivial concatenation.
- Avoid optional or nullable state unless it has a clear semantic meaning
- Use JSDoc blocks to capture intent when logic is non-obvious
- Prefer single-source-of-truth data structures; derive secondary views via helpers
- Keep WGSL in template strings prefixed with `/* wgsl */` for highlighting
- When branching on enums (e.g., selection types), use explicit `if/else` or
  `switch` structures that cover all cases and fail loudly on unknown values.
- Use `Map`/`WeakMap` when identity matters; default to empty maps rather than
  optional maps.
- Fail fast with clear error messages; avoid silent fallbacks.
- Use consistent naming: classes use `PascalCase` (`FooView`), files use
  `camelCase` (`fooView.js`), and related types share the same stem.
- Avoid per-frame allocations in rendering and dataflow hot paths; reuse arrays
  and maps when possible.
- Avoid ad hoc `console` logging in core hot paths; use a centralized logger if
  logging is necessary.
- Keep tests close to the code, and add a short intent comment for non-obvious
  setup.
- Prefer using iterator helpers (`map`, `filter`, `flatMap`) on iterables
  instead of converting them to arrays first.

## Architecture and rendering notes (from paper + supplementary)

- GenomeSpy uses a GPU-accelerated rendering architecture built on WebGL 2.0.
- Mark classes (rect, point, etc.) build vertex buffers from raw data and
  generate shader code that maps data to visual channels via scale functions.
- Rendering is a two-phase pipeline:
  - Layout phase traverses the view hierarchy, computes view coordinates, builds
    an optimized render batch, and reorders operations to minimize WebGL state
    changes.
  - Rendering phase executes the batch (shader swaps, uniforms, draw calls).
- Zoom/pan updates scale domains and re-runs only the rendering phase; vertex
  buffers update only when data changes.
- Although the grammar resembles Vega-Lite, rendering differs from Vega's CPU
  dataflow + scene graph approach; GenomeSpy prioritizes smooth interaction over
  large genomic datasets.

## Core architecture overview (packages/core)

- Entry point is `packages/core/src/index.js` which exports `embed()` and
  `GenomeSpy` (`packages/core/src/genomeSpy.js`).
- `GenomeSpy` owns the lifecycle: spec parsing, view creation, dataflow build +
  optimization, layout passes, rendering contexts, picking, interaction, and
  animation scheduling.
- Views are built from specs via `packages/core/src/view/viewFactory.js` into a
  tree of `View` subclasses (`packages/core/src/view/view.js`).
- `UnitView` instantiates a `Mark` (rect, point, rule, link, text) and resolves
  scales/axes/selections for the unit spec.
- Dataflow is a graph of `FlowNode` instances created by
  `packages/core/src/view/flowBuilder.js`, rooted at data sources and ending in
  collectors. Transforms live under `packages/core/src/data/transforms`.
- Scale and axis sharing is handled by `ScaleResolution` and `AxisResolution`
  under `packages/core/src/view`.
- Rendering is done via view rendering contexts under
  `packages/core/src/view/renderingContext`, with buffering/batching to minimize
  state changes.

## WebGL usage details (for future WebGPU migration)

- WebGL 2.0 only; context creation and global setup is in
  `packages/core/src/gl/webGLHelper.js` (canvas creation, extensions, blending,
  picking framebuffer, DPR scaling).
- Marks are the GPU abstraction: each mark builds vertex buffers from data and
  generates GLSL shader code that maps encodings to visual channels using scale
  functions (`packages/core/src/marks/mark.js`,
  `packages/core/src/gl/glslScaleGenerator.js`).
- TWGL is used as the thin WebGL wrapper for buffers, programs, VAOs, and
  uniforms. There is no scene graph; rendering is driven by buffered batches.
- Rendering contexts collect mark render callbacks into a batch and then execute
  the batch with minimal WebGL state changes
  (`packages/core/src/view/renderingContext/bufferedViewRenderingContext.js`).
- Picking uses an offscreen framebuffer and a dedicated picking render pass.
- Textures are used for color schemes, discrete scales, and selection textures
  (see `packages/core/src/gl/colorUtils.js` and selection handling).

## Dataflow overview

- Dataflow is a graph of `FlowNode` instances rooted at data sources and ending
  in collectors, managed by `packages/core/src/data/dataFlow.js`.
- Flow nodes describe behavior (clone/modify/collect) and propagate data through
  children, with per-node stats for basic introspection.
- `packages/core/src/view/flowBuilder.js` walks the data-parent view tree to
  build the flow graph, inserting transforms and collectors as needed.
- Data sources live under `packages/core/src/data/sources`; transforms under
  `packages/core/src/data/transforms`.
- `packages/core/src/data/flowOptimizer.js` can restructure the graph to share
  sources/transforms and reduce redundant work.

## Params, expressions, and reactivity

- Each `View` owns a `ParamMediator` that forms a hierarchy via `dataParent`,
  allowing scoped params and lookup up the tree (`packages/core/src/view/view.js`
  and `packages/core/src/view/paramMediator.js`).
- Params can be literal values, expressions, or selections. `registerParam`
  allocates setters, sets initial values, and wires selection defaults.
- Expressions are parsed/compiled with `vega-expression`
  (`packages/core/src/utils/expression.js`). A compiled expression exposes
  its referenced globals, and `ParamMediator.createExpression` binds those
  globals to param getters and registers listeners on each dependent param.
- `activateExprRefProps` turns ExprRef-valued props into getters, batching
  listener callbacks with microtasks.

### How changes propagate

- Rendering: many ExprRefs register listeners that call
  `context.animator.requestRender()` (e.g., mark uniforms, opacity, semantic
  zoom, selection textures).
- Dataflow: data transforms with expressions (e.g., `filter`, `formula`,
  `measureText`) call `repropagate()` on change; collectors then re-run
  downstream propagation.
- Data sources with ExprRef params (e.g., `url`, `lazy` sources) re-run `load()`
  on change via `activateExprRefProps`.
- Scale ranges can depend on expressions; `ScaleResolution` registers listeners
  and requests render when range/domain changes.

### Notes for a future signals migration

- `ParamMediator` is already signal-like: it holds values, provides setters, and
  supports subscriptions per param. A Preact signals port could map each param
  to a signal and swap `paramListeners` for signal subscriptions.
- Expression evaluation currently uses explicit listener wiring; signals could
  replace this with derived/computed signals, but you’ll need to preserve:
  - scoped param lookup (dataParent hierarchy),
  - expression global resolution,
  - repropagation triggers for dataflow nodes,
  - render scheduling (Animator).

## Research context and capabilities (from the paper)

- Grammar-based toolkit for authoring tailored, interactive genomic
  visualizations and embedding them in web apps/pages.
- Demonstrated with 753 ovarian cancer samples (DECIDER trial), including
  interactive cohort exploration and clinically actionable variant inspection.
- Key interaction patterns include:
  - Rapid bird's-eye-to-close-up transitions for large sample collections
  - Incremental, reversible actions with provenance
  - Score-based semantic zoom to reduce overplotting while preserving signal
  - Data summarization tracks (e.g., copy number summaries)

## Project structure

- `packages/core`: GenomeSpy Core library
- `packages/app`: GenomeSpy Application
- `docs`: Documentation site source files

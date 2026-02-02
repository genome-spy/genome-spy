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
  builds view hierarchy, initializes subtree dataflows, manages rendering
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
  axes. It also unregisters scale/axis resolution members on dispose.
- Layout sizing uses `View.getSize()`/`getViewportSize()` with a cached
  `size/*` property cache:
  - Sizes can be fixed (`px`), grow (`grow`), or step-based (`{ step }`).
  - Step-based sizing depends on scale domains; when the domain changes, cached
    sizes must be invalidated so parent layout recomputes correctly.
  - Step-size invalidation is registered eagerly for views created via
    `createOrImportView`, and must be registered manually for views constructed
    directly (e.g., app-side `SampleGroupView`).
  - Invalidating size clears the `size` cache for the view and its layout
    ancestors so layouts upstream recalculate.

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
- Subtree initialization (`initializeViewSubtree`) can be applied to newly
  added view subtrees, and subtree data loading (`loadViewSubtreeData`) emits
  a `subtreeDataReady` broadcast after sources resolve.
- Initialization is visibility-aware: hidden subtrees skip dataflow + mark
  wiring at startup and are initialized later via
  `initializeVisibleViewData` when visibility changes.
- Hidden views do not contribute to shared scale domains until they are
  initialized; domains can expand when a subtree becomes visible.
- Views track data initialization state (`none`/`pending`/`ready`) so lazy
  initialization does not duplicate flow nodes or collectors.
- Flow branches are pruned when subtrees are disposed to avoid orphaned nodes
  and unused data sources.
- TODO: Consider a targeted propagation/load mode for dynamic insertions so new
  collectors can be populated without re-propagating data through existing
  branches (avoid redundant updates and re-renders without caching data).
- Observed issues and fragilities to keep in mind as the system becomes more
  dynamic:
  - `FlowNode.initialize()` is used for both graph-level init and some per-batch
    fast-path rebuilds; callers must use `initializeOnce()` for graph-level init.
  - `Collector` is both cache and fan-out boundary; downstream mutations depend
    on its completion state and repropagation behavior.
  - Data sources lack a persistent “loaded/dirty” lifecycle contract; reload vs
    repropagate needs explicit decisions in dynamic flows.
  - Dependency tracking is implicit (view/dataParent traversal); the flow graph
    cannot yet describe “only this branch needs new data.”
  - Categorical domains/indexers/encodings are tightly coupled and order-sensitive,
    which can surface as correctness issues if domains change mid-lifecycle.

## View Lifecycle (Dynamic Mutation)

- View creation uses `ViewFactory.createOrImportView` when possible, but some
  app-side views are still instantiated directly.
- Subtree lifecycle helpers live in `packages/core/src/data/flowInit.js`:
  `initializeViewSubtree`, `loadViewSubtreeData`, and `finalizeSubtreeGraphics`.
- Visibility-triggered data init is centralized in
  `packages/core/src/genomeSpy/viewDataInit.js` and should be invoked after
  visibility state changes (e.g., app view settings toggles).
- Disposal is subtree-aware: `disposeSubtree` walks post-order, unregisters
  resolution members, and prunes dataflow branches.
- View opacity is configured in a separate post-resolve pass
  (`configureViewOpacity`) because dynamic opacity depends on resolved scales.

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

## Research context and capabilities

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

App-specific architecture now lives in `packages/app/APP_ARCHITECTURE.md`.

## Embedding & example frontends

- `packages/doc-embed` provides a `<genome-spy-doc-embed>` web component that
  upgrades Markdown `<code>` blocks into live specs; the README describes the
  transformation and ties into the MkDocs extension pipeline
  (`packages/doc-embed/README.md#L1`).
- `packages/embed-examples` gathers standalone HTML/JS pages that cover shared
  scale domains, dynamic data updates, FASTA data, named data providers, and the
  React wrapper; the index page lists each scenario and imports `@genome-spy/core`
  to exercise those embedding APIs (`packages/embed-examples/src/index.html#L1`).
- `packages/react-component/src/main.js#L1` is the tiny React integration that
  calls `embed` inside a hook, captures the resulting API, and cleans it up on
  unmount, making GenomeSpy easy to reuse inside React applications.
- `packages/playground` is the interactive spec editor used in the docs and site;
  `packages/playground/src/index.js#L1` renders the Lit-powered split-pane editor,
  loads `defaultspec.json`, and re-embeds the Core library whenever the spec or
  options change, making it a useful experimental sandbox for the grammar.

## Documentation site resources

- The MkDocs sources in `docs/` (e.g., `docs/index.md#L1`, `docs/getting-started.md`, `docs/grammar/`) host the canonical tutorials, grammar reference, data examples, and schema (`docs/genome-spy-schema.json`).
- `mkdocs.yml#L1` configures the build (site metadata, theme/custom theme,
  plugin stack, markdown extensions, extra JS/CSS, navigation, and custom theme
  directory), so the file is the entry point to customizing and rebuilding the
  documentation site.
- `custom_theme/`, `docs/stylesheets/`, and `site/` hold the theming overrides,
  extra CSS, and the generated site output (`site/index.html`, `site/api`, etc.),
  which helps anyone who needs to tweak how documentation examples render or
  deploy the static site.

## Quick Pointers

- Entry: `packages/core/src/index.js`
- Orchestrator: `packages/core/src/genomeSpy.js`
- View hierarchy: `packages/core/src/view/*`
- Dataflow: `packages/core/src/data/*`
- Marks and shaders: `packages/core/src/marks/*`, `packages/core/src/gl/*`

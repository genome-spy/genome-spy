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
- When removing a function/class, also remove its JSDoc block to avoid orphaned docs
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

## Commit conventions

- The repo follows Conventional Commits; prefix commit messages with the relevant type (e.g., `feat:`, `fix:`).
- Use the monorepo package name as the scope (e.g., `core`, `app`) when the change touches a specific workspace.
- An example message: `feat(app): cool new feature`.
- When working in a feature branch, it's okay to use more casual commit messages; scope can be omitted.

## Architecture pointers

Essential architectural topics live in `ARCHITECTURE.md`. Refer to that file for the details listed below:

- High-level architecture, view hierarchy, and dataflow (Core orchestrator, view factory, flow builder, resolution management, lifecycle, mutations, and quick subtree helpers)
- Rendering pipeline (two-phase layout + render, contexts, batches, animator coordination, picking, WebGL resources, shaders, textures)
- Reactivity and expressions (ParamMediator, expressions, expression propagation, ExprRef activation, future signals migration notes)
- WebGPU migration implications and research context (why WebGL2, selection strategy, research goals, key interaction patterns)
- Project layout plus Core/App entry points and Redux/provenance pathways in `packages/app`

This doc is now the single source of architectural truth; AGENTS now only highlight where to find these topics.

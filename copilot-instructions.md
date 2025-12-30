# GenomeSpy

GenomeSpy is a high-performance, web-based visual analytics toolkit for genomic
data. It combines a declarative visualization grammar with a custom
GPU-accelerated rendering engine to provide smooth interaction with large,
heterogeneous datasets, including copy number profiles, structural variants,
mutations, and metadata across cohorts. The project includes a modular core and
a schema-driven specification format.

GenomeSpy Core is designed to make it easy to build customized visualizations
for genomic and other data types. It provides fundamental building blocks, such
as graphical marks, scales, axes, and data transforms, inspired by Vega and
Vega-Lite.

GenomeSpy App is a higher-level visual analytics application built on top of the
Core. It enables interactive exploration of genomic datasets across large sample
collections. The App supports filtering, sorting, and grouping samples by
metadata attributes, and it integrates multiple genomic data types commonly used
in cancer genomics. It also includes a provenance system that records and
visualizes the user’s analysis history.

## Tech stack in use

- Fully client-side application using modern web technologies
- JavaScript (Modern ESNext) typed with JSDoc
- TypeScript for more complex type definitions and JSON Schema generation
- Monorepo managed with [lerna-lite](https://github.com/lerna-lite/lerna-lite)

### Core

- WebGL rendering via [twgl.js](https://twgljs.org/)
- JSON Schema built from the TypeScript types
- Application state is maintained in the view hierarchy
  - Data flow (built from `FlowNode` objects) handles data input and transformation
  - `ScaleResolution` collects views that share scales and initializes the actual scales
  - `ParamMediator` manages reactive parameters, which are like signals in Vega

### App

- Embeds GenomeSpy Core for rendering
- State management with [Redux Toolkit](https://redux-toolkit.js.org/)
- UI components with [Lit](https://lit.dev/)
- Iconography with [FontAwesome](https://fontawesome.com/)
- No external CSS frameworks or component libraries

### Testing

- Unit tests with [Vitest](https://vitest.dev/)
- Testing could be more comprehensive

## Project and code guidelines

- Always use type hints in any language which supports them
- JavaScript/TypeScript files should use JSDoc for type annotations
- Use a blank line between adjacent members with JSDoc; skip it for the first member in a block
- JavasScript is indented with 4 spaces, no tabs
- WGSL code should be indented with 4 spaces, no tabs
- JSON files are indented with 2 spaces, no tabs
- Use modern ESNext syntax (e.g., `async`/`await`, arrow functions, destructuring, spread operator)
- Array.from instead of spread operator for NodeList to Array conversion
- Prefer `const` over `let` unless reassignment is needed
- Use offensive, not defensive coding style
  - Rely on types and type checking instead of runtime checks.
  - Fail fast on unexpected inputs.
  - Avoid unnecessary checks for `null`/`undefined` if the type system guarantees presence.
  - Avoid excessive validation and error handling for internal functions.
  - Validate inputs at the application boundary (e.g., user inputs, external data sources).
  - Avoid excessive use of optional chaining (`?.`) and nullish coalescing (`??`).
- Tests should be placed in the same folder as the code they test, with `.test.` in the filename.

## Project structure

- `packages/core`: GenomeSpy Core library
- `packages/app`: GenomeSpy Application
- `docs`: Documentation site source files

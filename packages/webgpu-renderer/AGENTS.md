# WebGPU Renderer (package notes)

This package is a low-level WebGPU renderer extracted from GenomeSpy. It is
developed around the current and planned rendering needs of
`@genome-spy/core` (referred to below as Core) while remaining independently
usable.

New capabilities are typically implemented and validated through a
renderer-generic API before Core exposes them through its adapter and
visualization grammar. The planned Core integration supplies the motivating use
case and acceptance criteria. Public APIs, documentation, and examples must be
usable without Core. External use cases are welcome when they align with this
architecture; do not expand the package into a general charting, interaction,
layout, or graphics framework merely for completeness.

This package is unpublished work in progress. The experimental Core WebGPU
adapter is its sole consumer. Large refactors are welcome; the API can be broken
freely and old hooks should be removed instead of preserved for compatibility.

Treat Core integration as design feedback. If the API causes awkward adapter
workarounds, unclear ownership, unnecessary allocation, or prevents useful
optimization, state the shortcoming explicitly and propose or implement a
better renderer contract. Do not contort Core merely to preserve the current
API. Keep improvements generic: the renderer must not import Core types or
reproduce Core's visualization grammar.

The renderer is still exploratory: there are guiding goals but the exact
implementation is open to iteration. Prioritize a clear, extensible
architecture while keeping render-time hot paths minimal and optimized.

Keep `README.md` written for a broad audience so external users can understand
it without GenomeSpy context.

## Coding style & conventions

Follow the monorepo-wide conventions in `AGENTS.md`.

## Architecture touchpoints

- Scale system:
  - Definitions live in `src/marks/scales/defs/*` and export `ScaleDef`
    metadata plus a WGSL snippet.
  - Public scale factories live in `src/scales/*`; renderer internals consume
    the attached definitions directly without a production registry.
  - Validation/normalization lives in `src/marks/scales/scaleValidation.js`,
    `src/marks/scales/scaleStops.js`, and `src/marks/scales/ordinalDomain.js`.
  - WGSL assembly happens in `src/marks/scales/scaleWgsl.js` with shared
    helpers in `src/wgsl/scaleCommon.wgsl.js`.
  - Codegen/emit helpers live in `src/marks/scales/scalePipeline.js`,
    `src/marks/scales/scaleCodegen.js`, and `src/marks/scales/scaleEmitUtils.js`.
- Shader building:
  - `src/marks/shaders/markShaderBuilder.js` stitches scale WGSL, accessors,
    buffers, and mark code.
  - `src/marks/shaders/channelAnalysis.js` and `channelIR.js` drive channel and
    scale wiring.
- Program/resource layer:
  - `src/marks/programs` contains `BaseProgram` plus
    `pipelineBuilder.js`, `bindGroupBuilder.js`, `channelConfigResolver.js`,
    `scaleResources.js`, `selectionResources.js`, `seriesBuffers.js`, and
    `packedSeriesLayout.js`.
- Packed series:
  - Series are packed into f32/u32 storage buffers; dedupe behavior must remain
    consistent across updates.

## Commit messages

- Use conventional commits style (see `AGENTS.md`).

- When working in a feature branch (i.e., not "main" or "master"),
  ignore the scope in commit messages unless the change is large and
  affects multiple parts of the monorepo.

## Testing

- Types: `npm -w @genome-spy/webgpu-renderer run test:tsc`
- Unit tests: `npx vitest --run --config vitest.config.js --root packages/webgpu-renderer`
- Lint: `npx eslint packages/webgpu-renderer/`
- GPU tests (Playwright): `npm -w @genome-spy/webgpu-renderer run test:gpu`

## Storybook examples

- Treat Storybook as an executable showcase of the renderer's key public
  features. A substantial visual API or rendering capability should add or
  update a focused story unless an existing story already demonstrates it
  clearly.
- Keep stories renderer-generic. Use typed arrays, renderer handles, draw
  commands, viewports, and clips directly; do not import Core types or reproduce
  GenomeSpy grammar, views, facets, or interaction modes.
- Prefer stories that show realistic composition, retained updates, reuse, and
  cleanup over isolated static output. Add controls when they materially expose
  dynamic behavior or edge cases.
- Reuse the scene runner and example modules under `stories/` and `examples/`.
  Stories complement unit and GPU tests; they do not replace behavioral
  assertions.
- Build Storybook when adding or changing stories:
  `npm -w @genome-spy/webgpu-renderer run build-storybook`.

## Migration plan

- Track ongoing work in `packages/webgpu-renderer/MIGRATION_PLAN.md` and update
  it when new phases start or finish.

# WebGPU Renderer (package notes)

This package is a low-level WebGPU renderer extracted from GenomeSpy. It is
designed to be usable outside the monorepo, but it currently lives here so it
can track GenomeSpy’s requirements.

This package is a work in progress and nothing in the monorepo depends on it
yet. Large refactors are welcome; the API can be broken freely and old hooks
should be removed instead of preserved for compatibility.

The renderer is still exploratory: there are guiding goals but the exact
implementation is open to iteration. Prioritize a clear, extensible
architecture while keeping render-time hot paths minimal and optimized.

Although the renderer is driven by GenomeSpy’s needs, keep `README.md` written
for a broad audience so external users can understand it without GenomeSpy
context.

## Coding style & conventions

Follow the monorepo-wide conventions in `AGENTS.md`.

## Architecture touchpoints

- Scale system:
  - Definitions live in `src/marks/scales/defs/*` and export `ScaleDef`
    metadata plus a WGSL snippet.
  - Registry/helpers live in `src/marks/scales/scaleDefs.js` and
    `src/marks/scales/scaleUtils.js`.
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

## Commit messages- Use conventional commits style (see `AGENTS.md`).

- When working in a feature branch (i.e., not "main" or "master"),
  ignore the scope in commit messages unless the change is large and
  affects multiple parts of the monorepo.

## Testing

- Types: `npm -w @genome-spy/webgpu-renderer run test:tsc`
- Unit tests: `npx vitest --run --config vitest.config.js --root packages/webgpu-renderer`
- Lint: `npx eslint packages/webgpu-renderer/`
- GPU tests (Playwright): `npm -w @genome-spy/webgpu-renderer run test:gpu`

## Migration plan

- Track ongoing work in `packages/webgpu-renderer/MIGRATION_PLAN.md` and update
  it when new phases start or finish.

## Open questions / to clarify

- Should we expose additional scale validation helpers as a public API?
- When adding new marks, which parts of the mark API should be considered
  stable vs. experimental?

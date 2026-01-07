# WebGPU Renderer (package notes)

This package is a low-level WebGPU renderer extracted from GenomeSpy. It is
designed to be usable outside the monorepo, but it currently lives here so it
can track GenomeSpy’s requirements.

This package is a work in progress and nothing in the monorepo depends on it
yet. Large refactors are welcome; do not keep legacy compatibility hacks just
to preserve earlier APIs.

The renderer is still exploratory: there are guiding goals but the exact
implementation is open to iteration. Prioritize a clear, extensible
architecture while keeping render-time hot paths minimal and optimized.

## Coding style & conventions

Follow the monorepo-wide conventions in `AGENTS.md`.

## Architecture touchpoints

- Scale system:
  - Each scale lives in `src/marks/scales/defs/*` and owns its WGSL snippet,
    validation hook, and emit function.
  - Shared WGSL helpers live in `src/wgsl/scaleCommon.wgsl.js`.
  - WGSL prelude is assembled via `src/marks/scales/scaleWgsl.js`.
- Shader building:
  - `markShaderBuilder.js` stitches scale WGSL, accessors, buffers, and mark code.
- Packed series:
  - Series are packed into f32/u32 storage buffers; dedupe behavior must remain
    consistent across updates.

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

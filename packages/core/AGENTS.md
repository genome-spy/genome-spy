# GenomeSpy Core

## Architecture and workflows

- Read `ARCHITECTURE.md` and only the linked architecture document relevant to
  the affected subsystem.
- Use the repository `test-genomespy-views` skill for generated specifications,
  rendered hierarchy inspection, and layout snapshots.
- Use the repository `write-genomespy-docs` skill when changing specification
  types or user-visible grammar behavior.

## Core-specific rules

- Core is a WebGL2 rendering library built around a view hierarchy, dataflow
  graph, scale resolutions, and scoped parameter runtimes. Preserve the
  separation among those systems.
- Keep WGSL in template strings prefixed with `/* wgsl */` and indent it with
  four spaces.
- Avoid allocations in per-frame rendering and dataflow hot paths. Reuse arrays
  and maps when possible.
- Do not add ad hoc `console` logging in hot paths. Use a centralized logger when
  logging is necessary.
- Prefer explicit scale contracts, including required domains for ordinal and
  band scales.
- Keep `@genome-spy/webgpu-renderer` imports inside `src/rendering/webgpu/` and
  use only its documented root, mark, and scale entry points. Do not import its
  implementation modules or inspect definition internals.
- Treat WebGPU integration friction as evidence about the unpublished renderer
  API. State inadequate contracts explicitly and propose improvements instead
  of accumulating Core-side workarounds solely to preserve the current API.
- Views normally created through `ViewFactory.createOrImportView` receive
  lifecycle wiring that directly constructed views may need to register
  explicitly. Check the view/dataflow architecture before adding direct view
  construction.

## Testing

- Keep tests next to their implementation.
- Use `packages/core/layout.test.js` and
  `packages/core/src/view/layoutSnapshot.test.js` as layout-snapshot examples.
- Prefer `specToLayout(...)` and `renderToLayout(...)` from
  `packages/core/src/view/testUtils.js` over ad hoc layout scripts.

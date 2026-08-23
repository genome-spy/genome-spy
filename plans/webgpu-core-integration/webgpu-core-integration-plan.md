# WebGPU/Core integration plan

Status: Active follow-up — 209/212 Core/docs examples pass; faceted work is
authorized and App sample coverage is being added

Date: 2026-08-21

Scope: `packages/core`, `packages/webgpu-renderer`, `packages/app`, and JSON
examples under `examples/core/`, `examples/docs/`, plus focused
`examples/app/` sample-facet coverage.

This temporary plan records the remaining integration work. Completed
implementation details are represented by the current coverage totals and Git
history; this file should be reconciled and removed before merge.

Layout 2.0 Phase 1 is already merged on `master` as the completed
`View.arrange()` -> `LayoutResult` -> backend collection lifecycle. Add the
small renderer-neutral placement contract on `master` with WebGL, Canvas2D, and
SVG coverage, then merge it into `webgpu` before implementing renderer
placement resources and shaders. Later Layout 2.0 drafts were discarded as
implementation plans and are not prerequisites.

## Current checkpoint

The reusable runner is
`packages/core/scripts/runWebGpuExamples.mjs`. It discovers both example trees,
runs WebGPU or WebGL, captures browser and rendering failures, checks for empty
canvases, saves screenshots, writes `summary.json` and `failure-report.md`, and
supports individual paths, `--match`, and `--compare-webgl`. Its artifacts live
under the ignored `output/webgpu-core/` directory.

The current inventory is 212 examples: 102 core and 110 docs. Core is 102/102
with no empty canvases. Docs is 107/110; the three remaining cases are listed
below. Visual parity work is tracked separately in the focused table below.

## Prioritized remaining failures and deferred work

| Priority | Example or area                                                      | Root cause / status                                                                                                                         | Follow-up                                                                                                                                   |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | `examples/docs/grammar/composition/concat/shared-axes.json`          | Repeated `rule` occurrences require retained data reuse and occurrence placement; WebGL renders them correctly.                             | Implement Milestones 2–3 of the facet parity plan and rerun both renderers.                                                                 |
| P1       | `examples/docs/grammar/mark/link/link-shapes-and-orientations.json`  | Same repeated-occurrence limitation; the first failure is an axis-domain rule, not a missing link shape.                                    | Resolve the shared occurrence contract before changing link programs.                                                                       |
| P2       | `examples/docs/grammar/mark/arrow/arrow-playground.json`             | The screenshot harness gives both renderers a zero-height canvas; WebGPU additionally rejects the non-positive renderer height.             | Fix the example/harness sizing contract and rerun both renderers.                                                                           |
| P1       | `examples/docs/examples/genomic-data/pik3ca-tcga-brca-lollipop.json` | Angled text `dx`/`dy` placement still differs after a direct local-transform attempt made the result worse.                                 | Build a one-label angle/offset fixture and reconcile glyph bearings, angle convention, and units.                                           |
| P1       | Faceted and sample-faceted rendering                                 | Authorized. WebGPU rejects both range-mode `sampleFacetRenderingOptions` and texture-mode `facetIndex`; about 2,000 samples must be viable. | Publish renderer-neutral CPU placement; use one WebGPU resource with CPU-pruned draw indices for ranges and per-instance indices otherwise. |
| P1       | `examples/app/expression-zscores.json`                               | The first failure is the sample-label `text` mark's `facetIndex`; the heatmap also uses range-mode sample batches.                          | Add the unified sample-placement path plus deterministic App WebGPU smoke coverage.                                                         |

## Verified coverage

| Renderer                | Selection                                                    | Passed | Failed | Empty canvases | Last verified |
| ----------------------- | ------------------------------------------------------------ | -----: | -----: | -------------: | ------------- |
| WebGPU                  | `examples/core/**`                                           |    102 |      0 |              0 | 2026-08-21    |
| WebGPU                  | `examples/docs/**`                                           |    107 |      3 |              3 | 2026-08-21    |
| WebGL comparison        | Docs failure selections                                      |     11 |      1 |              1 | 2026-08-21    |
| WebGPU/WebGL comparison | `examples/core/genomic/bedBlocks.json` at extreme locus zoom |  1 / 1 |  0 / 0 |          0 / 0 | 2026-08-21    |
| WebGPU/WebGL comparison | `examples/core/layout/grid/concat_zindex_lollipops.json`     |  1 / 1 |  0 / 0 |          0 / 0 | 2026-08-21    |

The initial core sweep found 20 failures and empty-canvas cases across ordinal
positions, categorical channels, arrows, links, offsets, and piecewise colors.
Those are fixed. The initial docs errors in text colors, locus labels, arrow
picking, and scissors are also fixed; only the three cases above remain.

## Completed work retained as a short record

- The runner, ignored artifact layout, and WebGPU renderer selection are in
  place.
- Core positional and categorical translation, colors, links, arrows,
  rectangles, shadows, text, sequence logos, and dynamic view bounds now pass
  the functional and focused visual checks.
- WebGPU follows the current GLSL behavior for link geometry, repeated
  arrowheads, ranged-text viewport flushing, and high-zoom locus labels.
- The z-index lollipop comparison found and fixed a continuous reversed-Y range
  mismatch; WebGPU now places the lower lollipops like WebGL.
- The renderer now has explicit ordered draws, retained updates, invalidation,
  deterministic destruction, multi-channel interval selections, and scalar
  visibility predicates. The detailed API notes remain in the companion files.

## Temporary artifacts and acceptance

Screenshots, logs, reports, and runner output are diagnostic only and must not
be committed. Only runner/configuration changes, source changes, and this plan
belong in Git.

The integration work is ready to retire when every selected Core/docs/App
example passes or each remaining failure has an explicit owner, priority,
WebGL comparison, root cause, and follow-up design. Before merge, reconcile the
rows and remove this temporary plan and its companion plans in a later commit.

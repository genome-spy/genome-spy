# WebGPU/Core integration plan

Status: Complete and reconciled; ready to retire.

Date: 2026-08-21

Final reconciliation: 2026-08-24

The retained WebGPU renderer is integrated through Core's backend boundary.
Detailed implementation and measurement evidence remains in Git history; this
record exists only to close the former work before deletion.

## Completed outcomes

- Core translates marks, scales, selections, supported mark-property
  expressions, placement, and completed layout occurrences through documented
  renderer entry points.
- Repeated ordinary and sample-faceted occurrences retain one renderer mark,
  use generic placement sets, preserve ordered ranges, and share normal and
  picking state.
- Draw-level sample ranges are visibility-pruned by Core; indexed labels and
  metadata retain the coalesced path.
- Placement topology covers complete sample membership and survives filtering,
  sorting, undo, redo, closeup, peek, and frames with no visible occurrences.
- App sample-layout code owns renderer-neutral CPU placement. WebGL and WebGPU
  own and dispose their derived resources.

## Former failure disposition

- Shared-axis and link examples pass after repeated-occurrence packing.
- The arrow playground's backend-neutral zero-height sizing case was isolated
  and corrected.
- The PIK3CA lollipop example passes the functional inventory. Fine text raster
  differences remain a renderer parity item rather than an integration block.
- Faceted and sample-faceted rendering is complete, including the repository-
  owned 2,000-sample fixture.
- The expression-zscores App example passes WebGPU/WebGL screenshots and
  same-datum picking at DPR 1 and 2.

## Final verification

- All 212 recursively discovered Core/docs examples have passing WebGPU
  evidence.
- All six recursively discovered App examples pass the deterministic
  WebGPU/WebGL comparison.
- The high-cardinality App fixture, focused normal/picking tests, renderer GPU
  suite, workspace type checks, Storybook build, and lint passed at completion.

The remaining package-level parity and cleanup work is tracked only in
`packages/webgpu-renderer/MIGRATION_PLAN.md`. No incomplete integration task
remains, so this plan can be deleted in the next commit with its companion
temporary plans.

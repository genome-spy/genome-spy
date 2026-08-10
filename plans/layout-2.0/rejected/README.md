# Rejected Layout 2.0 Attempt

The documents in this folder describe the second Layout 2.0 implementation
attempt on branch `perf/layout-2.0`. They are preserved as design history and
must not be treated as the current implementation plan.

## Why the attempt was rejected

The branch tried to solve too many concerns together:

- lifecycle instrumentation and removal of the misleading `View.render()`;
- retained layout commands and closure-backed geometry slots;
- normal and picking batch retention;
- layout, scene, and presentation generations;
- axis-aware size and layout invalidation;
- per-instance layout input snapshots;
- clean-subtree skipping and scrollable boundary roots; and
- explicit structural scene invalidation.

Although the tests passed and individual ideas worked, their interactions made
the architecture harder to understand. Layout subtree reuse initially depended
on ranges in an ordered render-command list. Later changes separated those
concerns, but the accumulated state and invalidation rules remained too large for
a performance optimization that was not driven by a demonstrated bottleneck.

## What was learned

- Layout, command collection, and drawing are real separate lifecycle phases.
- Render batches do not inherently need rebuilding when only coordinates change.
- Stable view/facet/role identity is more reliable than traversal position or
  serialized keys.
- Partial size invalidation and subtree-scoped recomputation can reduce work,
  but need explicit local dependency rules and a forced-full correctness oracle.
- Scrollable viewport dimensions can act as axis-specific layout boundaries.
- Structural render membership must be invalidated explicitly rather than
  inferred through generic command comparison.
- The dynamic `Rectangle` graph and SampleView peek are prior art for retained
  presentation, but their closure and per-frame costs deserve measurement.
- Combining all of the above in one or two PRs violates KISS and makes critical
  review difficult.

The current roadmap starts again from `master`, keeps full layout as the
correctness baseline, and introduces one independently reviewable concept per
phase. See [the current summary plan](../layout-2.0-plan.md).

# Packed-renderer lasso qualification

Date: 2026-10-14. An isolated local worktree applied these pending changes onto
the packed renderer at `509ff43ee`:

- [#563](https://github.com/genome-spy/genome-spy/pull/563),
  `b55f65ae98846e1be1ed99369df5ce4c36b35b14`: renderer lasso utilities.
- [#564](https://github.com/genome-spy/genome-spy/pull/564),
  `70ec2d51cd5129e57acf13b2d32b8e44fc2bbf70`: Core integration and the native
  fixtures used by [#562](https://github.com/genome-spy/genome-spy/pull/562).

The PR refs were not changed. The qualification checkout was archived with a
recoverable Git snapshot; its source identity is
`/Users/klavikka/.codex/worktrees/webgpu-lasso-qualification/genome-spy`.
Local patches are retained under `output/pr563-rebased-renderer.patch` and
`output/pr563-pr564-qualified-stack.patch`. The renderer patch excludes the
temporary audit import used only to force default limits during qualification.

## Rebase adjustments

- Keep the packed resource roles and the template's generated WGSL and actual
  compute-binding count. Use the shared global/mark uniform descriptors with
  compute visibility for point capture. Selection and atlas metadata remain
  vertex-only.
- Combine owned selection capacity checks with #563's borrowed-buffer and
  explicit-activity branches. Preserve CPU/GPU replacement, active-empty,
  `takeTable()`, and caller ownership.
- Retain current point-position clamping inside the shared `getPointCenter`
  helper used by analytic points, path points, and capture. This also reconciles
  master changes predating the packing work.
- The old overflow fixture's categorical scene now fits: two compute-visible
  source bindings plus three capture outputs use 5/8. Verify successful capture
  first, then exercise the rejection boundary separately. Update old Core test
  mocks to supply the current encoder contract.

These adjustments are recorded for carrying the tested rebase onto the review
stack after the packing changes are integrated.

## Results

All 12 affected renderer GPU tests passed with forced defaults and no skips.
They cover point capture/nonlinear centers, GPU snapshots, borrowed tables,
containment, hash collisions, ownership transfer, density, and interactions.
The 39 focused Core tests for surface caching, render coordination, membership,
and region control passed. Core and renderer TypeScript checks passed.

Native Shift-drag checks used Chromium/Metal with default count and byte limits:

| Scenario                                    | Committed selection       | Preview ID reads | Release ID reads | Navigation                          |
| ------------------------------------------- | ------------------------- | ---------------: | ---------------: | ----------------------------------- |
| Linked log/sqrt plots and filtered consumer | A and C; filtered count 2 |                0 |                1 | membership unchanged; no extra read |
| 10M points with density display             | 38,479 rows               |                0 |                1 | membership unchanged; no extra read |
| 10M points with ordinary colors             | 38,481 rows               |                0 |                1 | membership unchanged; no extra read |

The two dense gestures were separate pointer runs, not a pixel-parity comparison.
Source, rotated linked plot, and filtered consumer borrowed the **same buffer**
through live preview and commit. Screenshots confirmed selected and unselected
points in both linked plots and two rows in the filtered plot.

A further linked-view lifecycle check passed: Escape restored the committed
selection without another ID read, a zero-match query remained `ready` with
zero rows, and double-click produced `cleared`. No GPU validation errors occurred.

The native 10M table bound exactly 134,217,728 bytes (128 MiB), and standalone
containment used all eight compute storage bindings. Keep the table independently
bound and retain that compute budget. Larger data may require the supported
byte limits negotiated at normal startup. Packing does not change table lifetime,
copy requirements, or the number of independently bound selections.

Ignored local evidence:

- `output/webgpu-lasso-native-qualification.json`
- `output/webgpu-lasso-linked-lifecycle.json`
- `output/webgpu-native-linked-selected.png`
- `output/webgpu-native-10m-density.png`
- `output/webgpu-native-10m-points.png`

Qualification covers these renderer/Core paths. App persistence in #565 and
real-cell UMAP preparation were outside this run.

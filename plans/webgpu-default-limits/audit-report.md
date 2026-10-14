# Default-limit WebGPU audit after buffer packing

Date: 2026-10-14. Runtime audit revision: `509ff43ee`, including scale/gap
packing, mixed-series packing, startup byte negotiation, and the font startup
fix. Subsequent verification-fixture and debug-metadata changes do not alter
uploads, shaders, or rendering. Environment: macOS arm64, Playwright Chromium,
headless, ANGLE Metal, DPR 1.

**237/238 examples pass. No binding-limit failures remain.** All 13 previously
failing font examples still pass. The only failure is the pre-existing
zero-height arrow playground canvas.

| Inventory | Passed | Failed | Total |
| --------- | -----: | -----: | ----: |
| core      |    113 |      0 |   113 |
| docs      |    124 |      1 |   125 |
| Total     |    237 |      1 |   238 |

Every example created an actual default-limit device: 8 storage buffers per
shader stage, 4 bind groups, 128 MiB per storage binding, and 256 MiB per buffer
allocation. The audit recorded normal startup's supported byte requests and
removed them before native device creation. Remote data was enabled; no
specifications were skipped.

## Resolved binding pressure

Peak counts cover each complete example, including its generated guides.
All five formerly failing specs now render without removing encodings,
selection behavior, shapes, placement, or picking.

| Specification                                                                         | Before | After | Result |
| ------------------------------------------------------------------------------------- | -----: | ----: | ------ |
| [redundant-encoding.json](../../examples/core/legends/redundant-encoding.json)        |    9/8 |   4/8 | passed |
| [point.json](../../examples/core/marks/point/point.json)                              |    9/8 |   3/8 | passed |
| [point2d.json](../../examples/core/marks/point/point2d.json)                          |    9/8 |   4/8 | passed |
| [tcga-ov-gistic.json](../../examples/docs/examples/genomic-data/tcga-ov-gistic.json)  |    9/8 |   5/8 | passed |
| [plenty-of-points.json](../../examples/docs/grammar/mark/point/plenty-of-points.json) |    9/8 |   3/8 | passed |

Both grouped-bar examples fell from 8/8 to 5/8. No example now reaches 80% of
the storage-binding count limit. Scale/gap tables share one mark-owned binding;
all series scalar types share another. Multi-selection tables remain separate.
The `point2d.json` screenshot was inspected: points, category colors, shapes,
axes, and legend are visible.

## Remaining failure and resource peaks

[arrow-playground.json](../../examples/docs/grammar/mark/arrow/arrow-playground.json)
creates a 500 × 0 canvas and an invalid swapchain texture. This reproduces the
original baseline failure and is outside the buffer-packing change.

| Limit                            | Largest observed use | Device default |
| -------------------------------- | -------------------: | -------------: |
| maxStorageBuffersPerShaderStage  |                    5 |              8 |
| maxBindGroups                    |                    3 |              4 |
| maxBindingsPerBindGroup          |                    9 |          1,000 |
| maxStorageBufferBindingSize      |           10,830,020 |    134,217,728 |
| maxBufferSize                    |           10,830,020 |    268,435,456 |
| maxUniformBufferBindingSize      |                  912 |         65,536 |
| maxUniformBuffersPerShaderStage  |                    2 |             12 |
| maxSampledTexturesPerShaderStage |                    2 |             16 |
| maxSamplersPerShaderStage        |                    2 |             16 |

Packing raises the largest individual series binding from the previous
8,664,016-byte peak. These examples still have ample byte capacity. Huge mixed
series can exceed baseline capacity; normal startup negotiates supported byte
limits, and allocation/update boundaries report contextual capacity errors.

## Integration verification

- Full repository unit suite: 4,938 passed, 1 skipped, 2 todo; 525 files passed.
- Renderer integration GPU matrix: 66 passed, covering all affected mark
  families, generated scales, precision, selection predicates, order, and scopes.
- Earlier focused point/text/placement/gap/series matrix: 17 passed. The separate
  160 MB mixed-series GPU test passed with exact first/last ID picking, default
  binding counts, and negotiated byte limits of 4,294,967,292.
- Public Core API smoke on WebGPU and WebGL: named-data growth, zoom, PNG export,
  vector SVG, and hybrid SVG passed. WebGPU used forced defaults and reported
  no validation errors. Each backend exported 55 vector elements and one
  rasterized SVG run.
- Renderer/Core TypeScript, lint, formatting, tree-shaking/package export,
  and Changesets policy checks passed. The existing empty fragment records no
  release impact for this unpublished-renderer/tooling work; other release
  fragments still schedule the fixed package group for 1.2.0.

Pre-existing GPU fixtures were reconciled with the documented half-open
interval contract. A wide-arrowhead fixture sampled a point inside the head as
if it were outside; this reproduced with the pre-packing renderer at both DPRs.
It now checks that interior point and an additional exterior point. These are
fixture corrections, with no changes to interval or arrow rendering semantics.

The [lasso-stack qualification](lasso-qualification.md) records the isolated
#563/#564 rebase, shared GPU-table borrowing, native linked-view lifecycle, and
both 10-million-point scenarios at forced default limits.

## Reproduction and local evidence

```sh
node packages/core/scripts/runWebGpuExamples.mjs --all \
    --output-dir output/webgpu-packed-default-limits
```

Ignored machine artifacts:

- `output/webgpu-packed-default-limits/summary.json`, `failure-report.md`, and
  screenshots: the complete current default-limit audit.
- `output/webgpu-packed-exports.json`: Core update/zoom/export checks.
- `output/webgpu-lasso-native-qualification.json` and
  `output/webgpu-lasso-linked-lifecycle.json`: native lasso checks.
- `output/webgpu-default-limits-font-fix/`: the pre-packing 232/238 baseline.

This audit covers initial rendering and visible lazy data. It does not exhaust
all interactions, hidden tracks, future viewports, pixel parity, texture
capacity, or total GPU memory. Auto-layout compute pipelines receive GPU
validation but their inferred binding counts are not reflected by the audit.

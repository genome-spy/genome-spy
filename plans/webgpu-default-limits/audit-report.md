# Default-limit WebGPU example audit after the font startup fix

Date: 2026-10-14. Baseline checkout: `22d005a08`, with the default-limit reset,
audit tooling, and font startup fix applied. Environment: macOS arm64,
Playwright Chromium, headless, ANGLE Metal, DPR 1.

**232/238 examples pass. All 13 previous font-preparation failures now pass.**
The remaining 6 failures are 5 storage-binding limit violations and the known
zero-height arrow playground canvas. Every example created a default-limit
device with 8 storage buffers per shader stage and 4 bind groups. No explicit
`requiredLimits` were requested; remote data was enabled and no specs were skipped.

| Inventory | Passed | Failed | Total |
| --------- | -----: | -----: | ----: |
| core      |    110 |      3 |   113 |
| docs      |    122 |      3 |   125 |
| Total     |    232 |      6 |   238 |

## Startup fix and comparison

Core now suppresses drawing through `renderAll()` while launch preparation is
pending. Layout may still respond to resize and scheduled reflow. Successful
launch requests a fresh frame after fonts and initial data are prepared, and
normal resize rendering resumes. The fix uses existing launch state rather
than adding another readiness flag or silently substituting fonts.

The initial sweep returned 218 passes and 20 failures: 13 font-preparation
failures, 5 storage-limit failures, one zero-height canvas, and one aborted
remote request. All 13 font failures are resolved in this complete rerun.
The formerly aborted `dynseq-spi1-bqtl.json` request also passed, as it did in
the earlier focused recheck; that observation is separate from the font fix.

| Previously failing font example                                                                                                                                            | Rerun  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [examples/core/marks/rule/rules.json](../../examples/core/marks/rule/rules.json)                                                                                           | passed |
| [examples/core/scales/parameterized_range_test.json](../../examples/core/scales/parameterized_range_test.json)                                                             | passed |
| [examples/core/scales/threshold_test.json](../../examples/core/scales/threshold_test.json)                                                                                 | passed |
| [examples/core/techniques/geometric_zoom_expr.json](../../examples/core/techniques/geometric_zoom_expr.json)                                                               | passed |
| [examples/core/techniques/semantic_zoom.json](../../examples/core/techniques/semantic_zoom.json)                                                                           | passed |
| [examples/docs/examples/genomic-data/bpreveal-pisa-matrix.json](../../examples/docs/examples/genomic-data/bpreveal-pisa-matrix.json)                                       | passed |
| [examples/docs/examples/genomic-data/bpreveal-pisa-squid.json](../../examples/docs/examples/genomic-data/bpreveal-pisa-squid.json)                                         | passed |
| [examples/docs/grammar/facet/multi-url-bigwig.json](../../examples/docs/grammar/facet/multi-url-bigwig.json)                                                               | passed |
| [examples/docs/grammar/index/single-view-specification.json](../../examples/docs/grammar/index/single-view-specification.json)                                             | passed |
| [examples/docs/grammar/mark/point/point-mark.json](../../examples/docs/grammar/mark/point/point-mark.json)                                                                 | passed |
| [examples/docs/grammar/mark/point/semantic-zoom.json](../../examples/docs/grammar/mark/point/semantic-zoom.json)                                                           | passed |
| [examples/docs/grammar/scale/shared-scale-expression.json](../../examples/docs/grammar/scale/shared-scale-expression.json)                                                 | passed |
| [examples/docs/grammar/transform/displace2d/bubble-health-income-annotations.json](../../examples/docs/grammar/transform/displace2d/bubble-health-income-annotations.json) | passed |

The `multi-url-bigwig.json` screenshot was also visually inspected: all five
BigWig tracks, facet labels, axes, and the facet title are visible.

## Remaining failing specifications

| Specification                                                                                                            | Failure                                       |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| [examples/core/legends/redundant-encoding.json](../../examples/core/legends/redundant-encoding.json)                     | 9/8 vertex storage bindings                   |
| [examples/core/marks/point/point.json](../../examples/core/marks/point/point.json)                                       | 9/8 vertex storage bindings                   |
| [examples/core/marks/point/point2d.json](../../examples/core/marks/point/point2d.json)                                   | 9/8 vertex storage bindings                   |
| [examples/docs/examples/genomic-data/tcga-ov-gistic.json](../../examples/docs/examples/genomic-data/tcga-ov-gistic.json) | 9/8 vertex storage bindings                   |
| [examples/docs/grammar/mark/arrow/arrow-playground.json](../../examples/docs/grammar/mark/arrow/arrow-playground.json)   | Zero-height canvas: 500 × 0 swapchain texture |
| [examples/docs/grammar/mark/point/plenty-of-points.json](../../examples/docs/grammar/mark/point/plenty-of-points.json)   | 9/8 vertex storage bindings                   |

## Storage bindings near or above the limit

Counts include all explicit bind groups and use shader-stage visibility.
All peaks below are in the vertex stage. No example content was simplified
to avoid resource limits.

| Specification                                                                                                                                | Peak / default | Rerun result |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------: | ------------ |
| [examples/core/legends/redundant-encoding.json](../../examples/core/legends/redundant-encoding.json)                                         |            9/8 | failed       |
| [examples/core/legends/region-wrapping.json](../../examples/core/legends/region-wrapping.json)                                               |            7/8 | passed       |
| [examples/core/marks/point/point.json](../../examples/core/marks/point/point.json)                                                           |            9/8 | failed       |
| [examples/core/marks/point/point2d.json](../../examples/core/marks/point/point2d.json)                                                       |            9/8 | failed       |
| [examples/core/marks/rect/grouped-bars-layered.json](../../examples/core/marks/rect/grouped-bars-layered.json)                               |            8/8 | passed       |
| [examples/docs/examples/generic/upsetr-mutations.json](../../examples/docs/examples/generic/upsetr-mutations.json)                           |            7/8 | passed       |
| [examples/docs/examples/genomic-data/dynseq-spi1-bqtl.json](../../examples/docs/examples/genomic-data/dynseq-spi1-bqtl.json)                 |            7/8 | passed       |
| [examples/docs/examples/genomic-data/msa.json](../../examples/docs/examples/genomic-data/msa.json)                                           |            7/8 | passed       |
| [examples/docs/examples/genomic-data/tcga-ov-gistic.json](../../examples/docs/examples/genomic-data/tcga-ov-gistic.json)                     |            9/8 | failed       |
| [examples/docs/grammar/axis/genome-axis.json](../../examples/docs/grammar/axis/genome-axis.json)                                             |            7/8 | passed       |
| [examples/docs/grammar/mark/point/plenty-of-points.json](../../examples/docs/grammar/mark/point/plenty-of-points.json)                       |            9/8 | failed       |
| [examples/docs/grammar/mark/rect/grouped-bars.json](../../examples/docs/grammar/mark/rect/grouped-bars.json)                                 |            8/8 | passed       |
| [examples/docs/grammar/mark/text/sequence-logo.json](../../examples/docs/grammar/mark/text/sequence-logo.json)                               |            7/8 | passed       |
| [examples/docs/grammar/mark/text/text-mark.json](../../examples/docs/grammar/mark/text/text-mark.json)                                       |            7/8 | passed       |
| [examples/docs/grammar/transform/set-intersection/co-mutation.json](../../examples/docs/grammar/transform/set-intersection/co-mutation.json) |            7/8 | passed       |
| [examples/docs/grammar/transform/stack/sequence-logo.json](../../examples/docs/grammar/transform/stack/sequence-logo.json)                   |            7/8 | passed       |

Two grouped-bar specs use all 8 storage bindings; nine further specs use 7.
The [resource-packing mitigation design](webgpu-default-limits-plan.md) remains
proposed and unimplemented. Font readiness no longer prevents those examples
from reaching their complete initial resource layouts.

## Other observed resource peaks

| Limit                            | Largest observed use | Device default |
| -------------------------------- | -------------------: | -------------: |
| maxBindGroups                    |                    3 |              4 |
| maxBindingsPerBindGroup          |                   12 |          1,000 |
| maxUniformBuffersPerShaderStage  |                    2 |             12 |
| maxSampledTexturesPerShaderStage |                    2 |             16 |
| maxSamplersPerShaderStage        |                    2 |             16 |
| maxStorageBufferBindingSize      |            8,664,016 |    134,217,728 |
| maxUniformBufferBindingSize      |                  912 |         65,536 |
| maxBufferSize                    |            8,664,016 |    268,435,456 |

## Reproduction and evidence

```sh
node packages/core/scripts/runWebGpuExamples.mjs --all \
    --output-dir output/webgpu-default-limits-font-fix
```

- Current full diagnostics: `output/webgpu-default-limits-font-fix/failure-report.md`.
- Current per-example limits, layouts, errors, and buffer peaks:
  `output/webgpu-default-limits-font-fix/summary.json`.
- Current screenshots: `output/webgpu-default-limits-font-fix/*.png`.
- Before-fix baseline: `output/webgpu-default-limits/summary.json`.
- Three-example WebGPU fix smoke: `output/webgpu-default-limits-font-fix-smoke/`.
- Three-example WebGL smoke: `output/webgl-font-fix-smoke/`.

This audit covers initial rendering and visible lazy data. It does not exhaust
interaction states, hidden tracks, future viewports, pixel parity, texture
dimensions, or total GPU memory. Auto-layout compute pipelines receive default
device validation but their inferred layouts are not counted in headroom metrics.

## Change verification

- Current Core/docs schema validation: 238/238 passed before the runtime fix;
  specifications and schema are unchanged.
- Related unit tests: 105/105 passed, including the new paused-font regression
  for resize, scheduled drawing, first post-startup frame, and subsequent resize.
- Focused WebGPU smoke: 3/3 passed; WebGL smoke: 3/3 passed.
- Core TypeScript check, targeted ESLint, formatting, and diff checks passed.
- Changeset policy check passed. The shared Core startup fix has a patch note.
  Existing minor fragments keep the fixed package group scheduled for 1.2.0.

The startup fix adds 6 lines to `genomeSpyBase.js` (1,011 to 1,017) and 54 lines
of regression coverage. It adds no runtime readiness state beyond the existing
launch flag. The earlier default-limit reset removes 6 renderer lines; the
repeatable audit tooling remains outside rendering hot paths.

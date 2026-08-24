# Interaction performance benchmark

`runWebGpuInteractionBenchmark.mjs` is a generic App benchmark driver. It
accepts any App specification path and does not require or copy the private
MCCA fixture into tracked files.

Run the authoritative matrix from a headed Chromium window on the reference
machine:

```sh
node packages/core/scripts/runWebGpuInteractionBenchmark.mjs \
    --spec private/MCCA-visualization/web/specs/spec.json \
    --control-spec examples/app/first.json \
    --filter-selector '[data-benchmark-filter]' \
    --sort-selector '[data-benchmark-sort]'
```

The default matrix uses fresh browser contexts, counterbalances renderer order,
runs five repetitions, covers all seven interaction cases, and records DPR 1
and DPR 2. Use `--server-url` to point at a production-like build served by a
separate process. Use `--headless` only for diagnostics; headless or
SwiftShader results are marked non-authoritative. The non-macOS launch path
does not request SwiftShader, so the actual adapter must be inspected in the
JSON output before drawing conclusions.

Each cell writes a low-overhead in-page cadence summary, private profiler
phase/counter data, and (unless `--no-trace` is supplied) a Playwright trace to
`output/webgpu-interaction-benchmark/`, which is ignored by Git. The cadence
stream is authoritative for frame pacing. Traces provide call-stack, GC, and
browser compositor evidence but can perturb scheduling.

The profiler is activated only when the harness receives `profile=1`. Its
shared symbol is private to the benchmark and it is inert during ordinary
application use. It records layout replay, mark configuration and retained
resource synchronization, placement computation/source/validation copies and
uploads, draw normalization and globals, command encoding/submission, GPU
resource creation, draw counts, and picking where the browser exposes those
counters.

`baseline.md` is generated from `summary.json`. Before optimizing, retain the
same-backend A/A noise bound and use the fixed practical equivalence tolerance
`max(5%, A/A relative noise bound)`. Do not use software-rendered WebGPU or
headless results as final performance evidence.

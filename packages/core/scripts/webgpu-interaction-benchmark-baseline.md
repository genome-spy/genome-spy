# WebGPU interaction benchmark baseline

This is the tracked Milestone 1 report location. Machine-specific JSON and
traces are generated under `output/webgpu-interaction-benchmark/` and ignored
by Git. Generate the report with:

```sh
node packages/core/scripts/runWebGpuInteractionBenchmark.mjs \
    --spec private/MCCA-visualization/web/specs/spec.json
```

The report must be regenerated on the reference headed Chromium setup before
using it as performance evidence. The driver fixes the practical equivalence
tolerance before optimization as `max(5%, same-backend A/A relative noise
bound)`, records a bootstrap interval for the WebGPU/WebGL CPU-time ratio, and
labels software or headless runs as non-authoritative.

Milestone 1 establishes the measurement contract and harness. No authoritative
MCCA result is embedded here because the fixture and machine-specific traces
are private, and a result from a different adapter, display, or power state
would be misleading. The generated report records the environment, all seven
interaction cases, DPR sensitivity, control visualization, A/A variability,
dominant measured phase/counter costs, and separate measurement versus
inference notes.

The benchmark does not implement retained frame plans, scrolling shortcuts, or
navigation smoothing. Those remain Milestones 2–5 decisions informed by the
recorded evidence.

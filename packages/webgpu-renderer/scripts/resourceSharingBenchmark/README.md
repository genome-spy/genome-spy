# WebGPU resource-sharing benchmark

The benchmark creates 500 rect marks and 500 text marks by default. It compares
the normal renderer against a benchmark-only control that bypasses
program-template and immutable-font-resource sharing. No product feature flag
is involved.

For each mode, it records mark initialization as both synchronous JavaScript
time and time until submitted GPU work settles. It then renders the same marks
in two orders: all rects followed by all texts, and alternating rect and text
marks. Rendering reports JavaScript frame cost, serial GPU-completed frame
time, and `requestAnimationFrame` cadence. The three metrics are kept separate
because command encoding cost and observable frame rate are not the same
measurement.

Run headed Chrome for authoritative hardware-backed results:

```sh
npm -w @genome-spy/webgpu-renderer run benchmark:resources
```

Use `--headless` only for diagnostics. Increase the stress level with
`--count 1000` when 500 marks of each type do not separate the compared modes.
Raw results are written under the ignored repository `output/` directory.

The checked-in reference measurements and interpretation are in
[`baseline.md`](./baseline.md).

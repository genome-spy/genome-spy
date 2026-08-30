# WebGPU resource-sharing benchmark baseline

Recorded on 2026-08-30 in headed Chrome 151 on Apple Metal 3. The benchmark
used a fresh Chrome/GPU process for every cell and three repetitions. Raw JSON
is generated under the ignored repository `output/` directory.

The shared mode is the normal renderer. The unshared control bypasses the
private program-template and immutable-font-resource caches without adding a
product flag. Both modes retain lazy picking, and the benchmark performs only
visible rendering. Renderer/device creation and font download/decode happen
before the initialization timer.

Each mark contains one small visible item. Thus, 500 per type means 500 rect
marks, 500 text marks, and 1,000 draw commands per frame. The text marks use the
real 512 by 512 Lato atlas. Every render-order cell gets a fresh renderer so one
order cannot warm or perturb the other.

## 500 rect and 500 text marks

| Metric | Shared | Unshared |
| --- | ---: | ---: |
| Initialization, JavaScript median | 70.0 ms | 199.8 ms |
| Initialization, GPU-settled median | 83.4 ms | 447.7 ms |
| Shader modules | 2 | 1,000 |
| Visible pipelines | 2 | 1,000 |
| Font atlas textures | 1 | 500 |
| Grouped cadence | 60.0 fps | 60.0 fps |
| Grouped JavaScript frame median | 0.8 ms | 1.0 ms |
| Grouped GPU-settled frame median | 1.5 ms | 1.7 ms |
| Alternating cadence | 60.0 fps | 60.0 fps |
| Alternating JavaScript frame median | 0.9 ms | 1.0 ms |
| Alternating GPU-settled frame median | 1.8 ms | 1.8 ms |

Sharing reduced synchronous initialization by 65% and time through submitted
GPU work by 81%. It also avoided 499 MiB of duplicate RGBA atlas allocation,
excluding texture padding and driver overhead.

## 1,000 rect and 1,000 text marks

The higher stress level was run because 500 marks of each type did not separate
observable frame cadence.

| Metric | Shared | Unshared |
| --- | ---: | ---: |
| Initialization, JavaScript median | 123.6 ms | 375.7 ms |
| Initialization, GPU-settled median | 141.9 ms | 847.2 ms |
| Shader modules | 2 | 2,000 |
| Visible pipelines | 2 | 2,000 |
| Font atlas textures | 1 | 1,000 |
| Grouped cadence | 60.0 fps | 60.0 fps |
| Grouped JavaScript frame median | 1.1 ms | 1.1 ms |
| Grouped GPU-settled frame median | 3.6 ms | 3.5 ms |
| Alternating cadence | 60.0 fps | 60.0 fps |
| Alternating JavaScript frame median | 1.1 ms | 1.0 ms |
| Alternating GPU-settled frame median | 3.1 ms | 3.7 ms |

Initialization retained the same scaling result: 67% less JavaScript time and
83% less time through GPU settlement. Rendering differences were small,
inconsistent between grouped and alternating orders, and did not affect the
display-capped frame rate.

## Conclusion

The sharing work is justified by initialization time and resource count, not
by steady-state frame rate. It turns shader modules, visible pipelines, and
font atlas textures from O(mark count) into O(program or font variants) in this
path. Once marks exist, per-mark bind groups and draw calls remain, so neither
pipeline sharing nor draw ordering materially changes sustained rendering in
this benchmark.

Reproduce the default matrix from the repository root with:

```sh
npm -w @genome-spy/webgpu-renderer run benchmark:resources
```

Use `--count 1000` for the higher stress level.

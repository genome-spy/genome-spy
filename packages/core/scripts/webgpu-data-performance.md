# WebGPU data preparation performance

Measured on 2026-10-14 with headed Chrome 155, ANGLE Metal on Apple M5, DPR 1,
and forced default WebGPU limits. Baseline: `1045fbebb`. Optimized:
`da1a413cf`. These are development-server measurements on one native adapter.

## Reproduction

Start the repository development server with `npm start`, then run:

```sh
node packages/core/scripts/runWebGpuDataBenchmark.mjs \
    --output output/webgpu-data-benchmark/summary.json
```

The driver embeds Core directly. The synthetic dataset contains 1,500,000
objects with two numeric positions and three categorical colors. Two A/B warmups
precede five counterbalanced measured runs. Modules and fonts are warm; each run
creates a fresh embed/device with an empty named dataset. Initial population and replacement both include propagation
and sorting, extraction, index construction, packing/upload, and rendering.
Data generation, network transfer, and file decoding are excluded.

Completion waits for two animation frames and a WebGPU queue fence or WebGL
`finish()`. The profiler's preparation, configuration, and resource phases
overlap; they must not be summed. The JSON includes individual samples and GPU
validation/default-limit observations.

## Median results

Times are milliseconds. Preparation includes extraction, indexing, and GPU
resource synchronization. Configuration includes channel extraction.

| Operation                   | Baseline WebGL | Baseline WebGPU | Optimized WebGL | Optimized WebGPU |
| --------------------------- | -------------: | --------------: | --------------: | ---------------: |
| Initial preparation         |          275.4 |           618.8 |           282.8 |            154.5 |
| Initial configuration       |              — |           495.6 |               — |             96.2 |
| Initial packing/upload      |              — |            11.3 |               — |              7.3 |
| Initial completed frame     |          794.9 |          1195.1 |           828.2 |            745.1 |
| Replacement preparation     |          273.7 |           595.1 |           293.0 |            160.3 |
| Replacement completed frame |          760.0 |          1169.4 |           824.6 |            763.8 |
| Navigation completed frame  |           18.9 |            37.9 |            21.9 |             17.8 |

WebGPU preparation falls by 75%, and time to the initial completed frame falls
by 38%. The optimized completed-frame medians are 10% faster than WebGL for
initial population and 7% faster for replacement. Browser scheduling, driver
work, and allocation introduce substantial variation: initial completed-frame
samples span 663–1009 ms for WebGL and 722–800 ms for WebGPU. These measurements
establish parity for this workload on the reference adapter, rather than a
performance guarantee across devices or datasets.

At 1,000 rows, initial preparation is 0.2 ms for WebGL and 1.2 ms for WebGPU;
replacement preparation is 0.2/0.4 ms. Replacement and navigation complete in
33.3 ms for both backends. Initial completed-frame medians are 16.2/29.9 ms,
where frame scheduling dominates; initial population also creates a pipeline.

Navigation performs no channel extraction, index construction, or full-series
upload in either dataset size. Every optimized measured WebGPU run has zero
validation errors and keeps buffer capacity and binding counts at defaults.

## Implementation and verification

Preallocated indexed filling replaces typed-array mapping and temporary JS
arrays. Large batches receive independent callback call sites, using the same
optimization principle as WebGL's existing ArrayBuilder. The same 30-line batch
helper speeds up x-index construction. Scalar packing avoids the inner component
loop. Field-series caching, expression reevaluation, numeric validation, exact
u32 identifiers, and high-precision/vector representations retain their contracts.

An independent renderer change uses four-vertex triangle strips for analytic
and SVG point quads. Both triangles retain their original coverage and instance
ordering; rendering and picking use the same vertex count. Existing data APIs,
buffer ownership, borrowed selection tables, and binding counts are unchanged.
The production-source change is 84 net raw lines across seven files.

Verification includes 4,947 passing unit tests, all workspace type checks, lint,
and 33 native GPU tests covering point shapes, transparency across the shared
diagonal, picking, strokes, rotation, clamping, conditional order, and packed
series. Large-batch tests cover cache invalidation, expression reevaluation,
validation at the batch tail, exact picking IDs, and conservative point/range
x indexes.

The standard Core screenshot-harness audit passes 237/238 examples: all 113 Core
specs and 124/125 docs specs. The only failure is the existing
`examples/docs/grammar/mark/arrow/arrow-playground.json` zero-height canvas
(500 × 0), with consequent swapchain validation errors. This matches the merged
baseline audit; no new rendering or binding-limit failures were introduced.
The same inventory also passes through the App screenshot harness, 238/238,
where the arrow playground receives a nonzero canvas height.

Both inventories force WebGPU's default byte capacities and binding counts.
Peak explicit pipeline usage is 5/8 storage bindings and 3/4 bind groups; the
largest storage binding is 10,830,020 bytes against the 128 MiB default.

Reproduce the standard Core audit with:

```sh
node packages/core/scripts/runWebGpuExamples.mjs --all \
    --output-dir output/webgpu-data-benchmark/core-default-limit-audit
```

Detailed local output is in `output/webgpu-data-benchmark/`; generated results
and screenshots are ignored by Git. The App-harness run additionally uses
`--server-url http://127.0.0.1:8080` against the repository development server.

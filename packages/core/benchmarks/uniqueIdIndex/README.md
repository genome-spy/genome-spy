# Unique-ID indexing study

Standalone candidates and measurements. See [REPORT.md](REPORT.md) for the
historical study that preceded the production optimization. The original source
is frozen in `baselineRadixSort.js`; its hash matches the recorded baseline.
The `production` candidate measures the current implementation separately.

Run from the repository root with the repository's installed dependencies:

```sh
node packages/core/benchmarks/uniqueIdIndex/buildWasm.mjs
npx vitest run --config packages/core/benchmarks/uniqueIdIndex/vitest.config.js --reporter=agent
node packages/core/benchmarks/uniqueIdIndex/run.mjs
node packages/core/benchmarks/uniqueIdIndex/summarize.mjs
node packages/core/benchmarks/uniqueIdIndex/browser.mjs
node packages/core/benchmarks/uniqueIdIndex/summarize.mjs packages/core/benchmarks/uniqueIdIndex/results/chromium.jsonl
```

The recorded 20M shortlist, the seven-trial browser width check, and report/chart
generation can be reproduced with:

```sh
node packages/core/benchmarks/uniqueIdIndex/run.mjs --sizes=20000000 --scenarios=shuffled --candidates=baseline,typed8,typed11,pairs8,wasm8,blocks --indexBudgetMiB=1536 --output=packages/core/benchmarks/uniqueIdIndex/results/node20m.jsonl
node packages/core/benchmarks/uniqueIdIndex/summarize.mjs packages/core/benchmarks/uniqueIdIndex/results/node20m.jsonl
node packages/core/benchmarks/uniqueIdIndex/browser.mjs --sizes=10000000 --scenarios=shuffled --candidates=typed8,typed11 --repeats=7 --output=packages/core/benchmarks/uniqueIdIndex/results/chromiumWidth.jsonl
node packages/core/benchmarks/uniqueIdIndex/summarize.mjs packages/core/benchmarks/uniqueIdIndex/results/chromiumWidth.jsonl
node packages/core/benchmarks/uniqueIdIndex/run.mjs --sizes=10000000 --scenarios=shuffled --candidates=typed11,blocks,hash70 --queries=262144 --output=packages/core/benchmarks/uniqueIdIndex/results/nodeLookup.jsonl
node packages/core/benchmarks/uniqueIdIndex/summarize.mjs packages/core/benchmarks/uniqueIdIndex/results/nodeLookup.jsonl
node packages/core/benchmarks/uniqueIdIndex/plot.mjs
node packages/core/benchmarks/uniqueIdIndex/writeReport.mjs
npx prettier --write packages/core/benchmarks/uniqueIdIndex/REPORT.md
```

The browser options filter its focused matrix; the Node runner accepts the full
scenario/candidate matrix. `writeReport.mjs` updates marked result sections and
preserves the explanatory prose. Charts use the installed D3 scales and SVG;
no additional plotting dependencies are required.

`results/environment.json` records Emscripten/LLVM versions, the generated Wasm
module's size/hash, build-source hashes, and hashes of the unchanged production
sources. The generated Wasm module measured here was 1186 bytes.

The production follow-up in the report uses this focused comparison. Its raw
metadata records the frozen baseline and current production hashes separately:

```sh
node packages/core/benchmarks/uniqueIdIndex/run.mjs --sizes=1000000,10000000 --scenarios=sorted,shuffled,largeIntegers --candidates=baseline,typed11,production --output=packages/core/benchmarks/uniqueIdIndex/results/production.jsonl
node packages/core/benchmarks/uniqueIdIndex/summarize.mjs packages/core/benchmarks/uniqueIdIndex/results/production.jsonl
```

The separate value-sort follow-up compares the default `radixSort()` with the
frozen original at 1M and 10M values, including sorted, shuffled, and large
safe-integer inputs:

```sh
node packages/core/benchmarks/uniqueIdIndex/valueSort.mjs
```

It writes `results/valueSort.json` with raw trials, medians/MAD, and source
hashes. Each candidate/workload runs in a fresh process; data generation and
per-trial input copies are outside timing. Sorting includes all allocations and
the final copy from typed scratch when needed to return the ordinary input
array. The returned array's order and length are checked after timing.

`buildWasm.mjs` needs Emscripten (`emcc` on PATH). It queries the bundled LLVM
compiler and builds a freestanding scalar Wasm module without Emscripten runtime
or a writable system cache. The generated `radix.wasm` is ignored. A missing
toolchain is a visible error; Wasm is never silently replaced with JavaScript.
To measure only JavaScript, explicitly exclude `wasm8` with `--candidates`.
The correctness suite intentionally requires the built module to test all
candidates. It has its own Vitest configuration and does not change normal tests.

The browser run uses the repository's installed `playwright` library and its
Chromium binary. Install that binary with `npx playwright install chromium` if
needed. It uses a temporary localhost Vite server, fresh pages, and the same
construction and lookup functions as Node. Close other CPU-heavy jobs before
either benchmark. Run Node and browser measurements sequentially.

For a shorter rerun or a selected comparison:

```sh
node packages/core/benchmarks/uniqueIdIndex/run.mjs --sizes=10000,100000,1000000 --scenarios=sorted,shuffled,retain1,sparseBlocks,largeIntegers --candidates=baseline,array4,array8,typed4,typed8,typed11,pairs8,blocks,hybridBlocks,hash50,hash70,hash85,wasm8 --repeats=5 --output=/private/tmp/unique-id-rerun.jsonl
node packages/core/benchmarks/uniqueIdIndex/summarize.mjs /private/tmp/unique-id-rerun.jsonl
```

Options use `--name=value`. Defaults: 10K, 100K, 1M and 10M **retained** rows;
all 13 scenarios and 16 candidates (including current production); three
repetitions; seed 20261014; 8192
queries per mode; 768 MiB projected index allocation budget. `--seed`,
`--queries`, and `--indexBudgetMiB` are configurable. Sizes are capped at 20M;
larger experiments require reviewing the resource guard. The guard estimates
index allocations, not total process memory: input rows, V8, and OS allocation
overhead also consume memory. A 4 GiB V8 old-space cap is a last bound, not a
promise that a process cannot exhaust available system memory. Large runs are
serial. Map is limited to 1M rows. Skipped cells and failures are written to JSONL.

The runner overwrites its chosen result file, then appends each completed cell
so interrupted runs retain their evidence. `summarize.mjs` generates CSV and
summary JSON from even a partial run. Recorded raw samples include construction
times, memory checkpoints, GC events during construction, all lookup checksums,
and Wasm phase timings. Summary statistics are median, min, max, and median
absolute deviation (MAD); three samples do not establish confidence intervals.

`retainedDeltaBytes` and `peakObservedDeltaBytes` count `heapUsed + arrayBuffers`.
`external` is recorded but not added, because it includes typed-array storage
already counted by `arrayBuffers`. This V8 version omits Wasm linear memory
from both counters; the explicit Wasm byte model must also be consulted. Observed
peaks are allocation-checkpoint lower bounds. Process RSS high-water marks
include input/setup and cannot be interpreted as exact index-only peaks.
Payload byte models exclude JS object/Map overhead, ordinary-array spare
capacity, and GC metadata. Map payloads and hybrid construction payloads are
null (unmodeled), with actual allocation deltas still measured. Recorded Node
metadata documents correcting those model-only fields after measurement;
timings, memory counters and GC samples are untouched. See the report for these
limits and measured values.

Successful queries are random physical rows; integer misses use absent block
gaps, filtered-out neighbors, or reserved/out-of-range IDs. Mixed queries are
50% hits. `same` repeats one ID; `nearby` queries a numeric 64-ID window and may
include misses after filtering. Each timing runs batches for at least 8 ms and
consumes positions in a checksum. Raw/full checksums must agree. Full sorted
lookup reproduces Collector's d3/facet lookup procedure and is cross-checked
against real collectors in tests. Direct/hash full lookup also resolves the
position through the current facet directory to the row object.

The default random-query batch is reused and can become cache-hot. The separate
262,144-query run checks sensitivity to a larger working set. Neither measures
single-query cold-cache latency; consult both before estimating lookup savings.

Data generation and unrelated-field comparison sorting are outside construction
timing. Index-specific ID extraction, allocation, conversion, Wasm copying and
output extraction are inside. Explicit GC occurs before construction and after
construction for retained-memory measurements; naturally occurring GC remains
inside construction timing. Warmup uses four separate 12K-row datasets (512
rows for dense-block/uniform warmup to bound allocation). No index from a
previous trial is intentionally retained. Small measured memory deltas can be
noisy; exact typed-array payloads remain useful at those sizes.

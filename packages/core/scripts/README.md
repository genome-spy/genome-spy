# Browser rendering checks

Run focused browser checks directly from the repository root:

```sh
node packages/core/scripts/testDefaultThemeStyles.mjs
node packages/core/scripts/testArrowWebGL.mjs
node packages/core/scripts/testRuleOutlines.mjs
node packages/core/scripts/testOrthogonalLinks.mjs
node packages/core/scripts/testDendrogramRenderers.mjs
node packages/core/scripts/testCategoricalDomains.mjs
```

Each script manages its own development server on port 4174. Run them one at a
time. The cross-renderer checks use installed Chrome with the native GPU; the
arrow check uses Playwright Chromium with SwiftShader.

# WebGPU example audit

Run all shared Core and docs specifications with default WebGPU limits:

```sh
npm -w @genome-spy/core run smoke:examples:webgpu
```

The runner records supported startup buffer-size requests and forces both byte
limits back to WebGPU defaults. It rejects every other explicit limit, including
binding-count overrides, and rejects unsupported byte requests before forcing
defaults. It collects uncaptured GPU validation errors, waits for visible lazy
data, and checks canvas screenshots.
`output/webgpu-core/summary.json` includes device defaults, per-stage binding
counts across explicit pipeline layouts, and buffer allocation/binding peaks.
`failure-report.md` lists failures and peaks at or above 80% of the defaults.
Auto-layout compute pipelines receive normal GPU validation but do not have
reflected binding counts in the headroom report. Initial-state smoke checks do
not exhaust interactions, hidden views, future lazy data, or visual parity.

Use `--output-dir`, `--match`, or explicit example paths for focused runs.

# Data preparation benchmark

With the repository development server running (`npm start`), compare WebGL and
WebGPU using a generated scatterplot of 1.5 million JavaScript objects:

```sh
node packages/core/scripts/runWebGpuDataBenchmark.mjs
```

The driver uses headed Chrome on the native GPU, DPR 1, two A/B warmups, and five
counterbalanced measured runs. It embeds Core directly and measures initial
named-dataset population, replacement, and navigation separately. Data generation
happens outside timing; each fresh embed starts with an empty dataset. This
isolates row propagation, channel extraction, index construction, packing/upload, and rendering from
network loading, decoding, and initial module/font loading. Completion waits for
two animation frames and a WebGPU queue fence or WebGL `finish()`.

Results in `output/webgpu-data-benchmark/summary.json` include environment,
per-run timings, profiler phases/counters, and the default-limit audit. GPU
validation errors fail the run, as does rebuilding/uploading series during
navigation. `preparation` measures WebGL point preparation/upload or WebGPU mark
translation, including index construction and retained resource synchronization.
`configuration` includes channel extraction; `resources` includes packing/upload.
These phases overlap and must not be added together.

Use `--rows 1000` for a small-data check, `--runs 7` for longer measurements,
`--server URL` for another development server, and `--output PATH` to retain
before/after results. `--headless` is diagnostic; inspect the actual adapter and
use native headed runs for performance conclusions. The benchmark forces buffer
sizes and binding counts to WebGPU defaults, like the example audit above.

See [recorded data preparation results](webgpu-data-performance.md) for the
reference measurements and validation.

# Interaction performance benchmark

`runWebGpuInteractionBenchmark.mjs` is a generic App benchmark driver. It
accepts any App specification path and does not require or copy the private
MCCA fixture into tracked files.

Run the authoritative matrix from a headed Chromium window on the reference
machine:

```sh
node packages/core/scripts/runWebGpuInteractionBenchmark.mjs \
    --spec private/MCCA-visualization/web/specs/spec.json \
    --control-spec examples/app/samples.json \
    --filter-selector '[data-benchmark-filter]' \
    --sort-selector '[data-benchmark-sort]'
```

The default matrix uses fresh browser contexts, counterbalances renderer order,
runs five repetitions, covers all six interaction cases, and records DPR 1.
Add `--sensitivity-dpr 2` only when investigating work that may scale with
pixel count, such as rasterization, attachment traffic, or pixel-sized uploads.
Use `--server-url` to point at a production-like build served by a separate
process. Use `--headless` only for diagnostics; headless or SwiftShader results
are marked non-authoritative. The non-macOS launch path does not request
SwiftShader, so the actual adapter must be inspected in the JSON output before
drawing conclusions.

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

Keyboard cases focus and hover the real visualization canvas before sending
Playwright keyboard events, verify the received `KeyboardEvent.code`, and
reject unchanged scale domains or closeup state. Each applicable case must
capture at least three normal render frames. Cases requiring SampleView
closeup state are explicitly marked inapplicable for subjects that do not
provide it. The `layoutReplay` phase means collecting render commands from an
existing `LayoutResult`; actual view arrangement is recorded separately as
`layout`.

Horizontal WASD pan uses an unmeasured keyboard-zoom setup step first, so the
initial full-domain clamp cannot turn the pan into a no-op.

`baseline.md` is generated from `summary.json`. Before optimizing, retain the
same-backend A/A noise bound and use the fixed practical equivalence tolerance
`max(5%, A/A relative noise bound)`. Do not use software-rendered WebGPU or
headless results as final performance evidence.

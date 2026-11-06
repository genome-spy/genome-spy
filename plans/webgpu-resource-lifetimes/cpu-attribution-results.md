# WebGPU scale CPU attribution

Measured November 5, 2026, against the stacked Core/App runtime at
`721b33fda76ace9384e77b91ea153a611370d1ba`. This records the early performance
gate in the [resource-lifetime proposal](webgpu-resource-lifetimes-plan.md). No
production code or renderer API was changed.

## Decision

The broad shared-scale implementation has not passed its performance gate. One
row-band scale really does fan out to 59 logical marks, but the captures do not
isolate a substantial removable CPU cost. The sparse diagnostic puts the entire
metadata resource-update envelope near 10% of instrumented CPU; that includes
local values, resource checks and diagnostic overhead. It is neither a
scale-only percentage nor a predicted saving.

Keep the current API and leave shared resources as the separate feature tracked
by [#698](https://github.com/genome-spy/genome-spy/issues/698). Attribution does
not reject a bounded shared-band experiment: after explicit API approval, a
Core/App prototype and an uninstrumented CPU comparison could resolve its
benefit. Do not start the full scale/shader rewrite from these numbers alone.

## Scene and validation

- Existing App stress fixture: 1,536 samples, 24 groups, 32 metadata columns,
  grouped summaries and 32 segments per sample; 106 unit views.
- Native Apple M5 / Metal WebGPU, Chrome `157.0.8103.39`, 1,240 × 740 browser
  viewport and 1,200 × 700 application frame.
- Existing native CDP input sequence: 24 overview wheel events, two horizontal
  drags with 96 moves in total, E-held closeup, 24 vertical wheel events and
  release. Natural settling is included in each roughly 16.4-second window.
- Fourteen measured windows across diagnostic/control modes, plus warmups. All
  passed sample identity/membership and grouping checks, actual zoom/pan/
  row-scroll movement, settled state, closed closeup and browser/loading error
  checks. Initial screenshots were byte-identical across all six modes.
- No camera or rendering API mutations drive the interactions. Core profiling,
  JavaScript CPU sampling and allocation sampling were disabled. Instrumentation
  used temporary browser response transforms; repository runtime files stayed
  byte-identical to the starting commit.

## CPU method and observer effect

Synchronous trace marker pairs carry Chrome's `tts` thread CPU timestamps. CPU
deltas use `tts`; elapsed `ts` only determines ordering. The analyzer checks one
renderer thread, balanced scopes and monotonic clocks. Root CPU deltas agree
with CDP `Performance` in `threadTicks` mode within 0.7 ms for tracing-only and
sparse captures, and within 3.3 ms for coarse captures. The fine pilot differs
by 0.7 ms. Sampled resource envelopes do not nest within one another.

The original-source controls route the same modules/imports without changing
their bodies. The tracing-only control has only outer interaction/calibration
markers. The sparse parent-only mode wraps `Surface.updateMark` with a
deterministic pseudo-random 1/8 selection; the seven other routed modules have
original bodies. The detailed mode additionally times grouped binding work and
deferred flushes in selected calls. The coarse mode times all retained resource
updates and larger rendering phases, with changed-writer counters.

| Mode                              | Measured windows | Main-thread CPU per window (ms) | Mean (ms) |
| --------------------------------- | ---------------: | ------------------------------- | --------: |
| Original source, no trace         |                2 | 985.069, 970.686                |   977.878 |
| Original source, outer trace only |                2 | 940.516, 1016.556               |   978.536 |
| Sparse whole-update scopes        |                3 | 1063.067, 1031.286, 1032.859    |  1042.404 |
| Sparse nested detail              |                3 | 1101.415, 1096.180, 1154.130    |  1117.242 |
| Coarse scopes and counters        |                3 | 1311.947, 1343.273, 1333.917    |  1329.712 |
| Fine pilot                        |                1 | 1646.098                        |  1646.098 |

Sparse parent-only instrumentation increases the mean by 6.6% relative to the
fresh normal control; nested detail increases it by 14.3%, and coarse scopes by
36.0%. Fine instrumentation was rejected for timing attribution. These are
limited sequential controls, not an alternating implementation comparison or
precise causal estimates of overhead. Similar normal/tracing-only means do not
establish that tracing is universally free.

Empty-marker calibration varied around 4–11 microseconds per measured pair. Do
not subtract a constant calibration from real calls. Extrapolating sparse inner
scopes also extrapolates their marker cost; their microsecond scale makes them
unsuitable for claiming a precise scale-only CPU percentage.

## What changes during navigation

All three coarse captures report the same metadata classification:

| Metadata update batch                | Count | Share |
| ------------------------------------ | ----: | ----: |
| Only shared-band writers changed     | 1,416 |   30% |
| Shared band and local values changed | 3,304 |   70% |
| Total                                | 4,720 |  100% |

These batches occur during row closeup/scroll. Actual shared row-band writes are
`viewport` (9,440) and `gapWidth` (6,608). There are 59 distinct logical mark
consumers; draw occurrences are not additional scale owners. Another shared
x-band scale has two consumers but no relevant navigation writes.

There are zero domain-map, palette/range-texture or gap-table rebuilds during
these warmed interactions. Sharing those tables can still reduce storage and
work on cold/domain-changing paths, which this capture does not measure.

The mixed batches contain real local row-geometry changes. Metadata marks use
dynamic `yOffset`/`y2Offset` from `_sampleRowInset`
(`packages/app/src/sampleView/metadata/metadataView.js:869–870,932–933`); sample
labels also depend on inset and band fit
(`packages/app/src/sampleView/sampleLabelView.js:258–261`). SampleView publishes
inset/step alongside viewport/gap changes
(`packages/app/src/sampleView/sampleView.js:1101–1133`). Sharing scale state can
remove duplicated band preparation and shrink payloads, but cannot eliminate the
mixed uploads or local observers under the current translation. Those batch
shares are not CPU shares or a general ceiling on future gains; changing the
row-geometry contract would be a different experiment. Scale sharing also does
not remove draw occurrence preparation, global packing or command encoding.

## CPU attribution and limits

The primary sparse parent-only captures select 595, 562 and 612 of the 4,720
metadata updates. Multiplying each sampled inclusive CPU sum by eight gives:

| Capture | Extrapolated metadata envelope (ms) | Share of instrumented root CPU |
| ------- | ----------------------------------: | -----------------------------: |
| 0       |                             108.792 |                        10.228% |
| 1       |                             106.192 |                        10.292% |
| 2       |                             107.096 |                        10.364% |

This uses the inverse-selection-probability estimator, not the alternative
total-count × sample-mean estimator. The deterministic sampler uses different
seeds between captures; it is not an independent random sample supporting an
unqualified confidence interval. The selected-call envelope includes the full
original `updateMark` body: mark/cache checks, all binding discovery and local
value work, scale setters and deferred commits. It is broader than pure scale
work, but observer effects prevent treating it as a mathematical upper bound on
uninstrumented cost or possible gains.

For context, the coarse diagnostic separates larger phases as follows. These
times include the substantially higher observer cost shown above. Inclusive rows
overlap and must not be added together.

| Phase                                                | CPU across three captures (ms) |
| ---------------------------------------------------- | ------------------------------ |
| Core replay, inclusive of resource sync/hooks/bounds | 489.097–512.647                |
| Core replay self, excluding nested named phases      | 257.607–264.742                |
| All retained resource synchronization                | 163.069–177.150                |
| Command encoding                                     | 162.518–167.547                |
| Renderer normalization                               | 79.027–83.215                  |
| Per-occurrence global packing/upload                 | 58.969–59.293                  |
| Core mapping production                              | 8.125–8.574                    |
| Core mapping application                             | 4.344–4.547                    |

The evidence confirms duplicated scale fan-out and substantial work elsewhere.
It does not provide an uncontaminated pure-scale fraction, demonstrate a
shared-resource speedup, or independently clear the prepared-frame gate. Cold
loading, filtering, sorting/domain reordering and export are outside this warmed
navigation measurement.

## Local artifacts and cleanup

Artifacts are under the upper worktree's ignored
`/private/tmp/genomespy-pr660-testing/output/sample-view-band-benchmark/`.
Prefixes are `sampleview-scale-cpu-` followed by `pilot`, `coarse`,
`trace-control`, `normal-control`, `sampled` or `sampled-detail`. Each contains
metadata, source manifests, setup, results and the initial screenshot;
instrumented modes also contain traces/counts. Offline analyses are named
`<prefix>-<round>-analysis.json`.

Metadata records runtime head, source/served hashes, driver hash, machine and
input parameters. Its inherited free-text interpretation mentions a 1000-us V8
diagnostic; that description does not apply here. The driver sets trace
`enableSampling: false`, and `cpuSamplingIntervalUs` is null. Attribution uses
thread CPU timestamps, with no V8 profiles in these captures.

Temporary scripts are `/private/tmp/webgpu-scale-cpu-attribution.mjs`,
`/private/tmp/scale-cpu-attribution-instrumentation.mjs`,
`/private/tmp/analyze-scale-cpu-trace.mjs` and
`/private/tmp/summarize-scale-cpu-attribution.mjs`; the aggregate is
`/private/tmp/scale-cpu-attribution-summary.json`. The helper/driver evolved
between modes. Their current versions represent the final detailed capture;
earlier exact helper runtime versions were not separately archived. Source and
served-body hashes preserve identity checks, not a complete reproducible archive
of every earlier instrumentation version.

All initial screenshots have SHA-256
`c739c53622d5394deb31bb99551ef5e68bd27962d5bfe5fdb08d9330731e7e58`. The owned
port-4173 server was stopped and its temporary `private` symlink removed. Both
worktrees retain their original runtime code and renderer API.

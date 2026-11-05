# Text composition cost assessment

Status: diagnostic reference for the blocking review of #671, 2026-11-05. This
branch contains temporary reproduction material only. It does not change
renderer source and is not a production merge candidate.

## Decision

Do not replace all ordinary text with the current label-wide path. On the
available integrated Apple M5, visually comparable cases have meaningful GPU
cost increases, alongside additional preparation, uploads and sampled
allocations. The apparent dense-case gain has materially different output and is
not a fair speedup comparison. This does not reject every possible
label-composition design.

Keep #671/#672 as drafts. #695 isolates fillOpacity on the existing glyph path;
#691 now depends on #679/#695 and contains no #671 architecture history. Sharp
glyph expansion, protection of neighboring fills, common opacity and the
rendering architecture remain separate decisions. No opaque shortcut, Core flag,
overlap classifier or runtime renderer switch is justified by these
measurements.

## Frozen sources and workloads

- Baseline: #670, `8e3d66cf6d35dc5b5073a56bd8137f8479a1bf9d`.
- Candidate: #671, `aff20e18445a9e6794a2291011e6c0f269f7f64e`.
- Unmodified renderer source in both checkouts; same DefaultFont.ttf.
- Apple M5 10-core integrated GPU; Chrome 156.0.8078.80, Apple/Metal-3. System
  inventory exposes no discrete GPU; no discrete-GPU conclusion is made.
- Explicit 1280x900 logical canvas and DPR 1/2; five warmups, forty
  alternating-order pairs per timing mode. Every measured scope validates.

| Workload | Labels | Emitted glyphs | Notes                                                       |
| -------- | -----: | -------------: | ----------------------------------------------------------- |
| short    |   1000 |           9000 | Nine-glyph GenomeSpy; ordinary unstroked text               |
| stroked  |   1000 |           9000 | Same nine glyphs; baseline width 4, candidate 2             |
| long     |    128 |          36864 | 288 glyphs per label                                        |
| spaced   |    256 |            512 | A, 100 spaces, V: only two glyph quads per label            |
| dense    |    256 |          16384 | 64 coincident W glyphs via supported negative letterSpacing |

Replacement alternates content from the same warmed glyph set. Dense text
alternates 63/64 glyphs; the resource table uses phase 0 (64). All anchors are
inside the viewport; visible ink, bounds and emitted counts are checked. The
spaced case emits exactly two glyphs. Dense glyph X offsets coincide within 1e-6
layout pixels. Both relevant shader variants and glyph sets are warmed.

## Visual compatibility is separate

The fixed comparison gate is two stored premultiplied RGBA bytes. It measures
agreement with the old implementation, not independent correctness of the new
geometry. No tolerance was changed after seeing results.

| Workload | DPR | Maximum byte difference | Channels over 2 | Interpretation                    |
| -------- | --: | ----------------------: | --------------: | --------------------------------- |
| short    |   1 |                       3 |             250 | Ordinary comparison fails         |
| stroked  |   1 |                     203 |         1154821 | Unqualified stroke geometry/order |
| long     |   1 |                       3 |              20 | Ordinary comparison fails         |
| spaced   |   1 |                       1 |               0 | Within comparison gate            |
| dense    |   1 |                     233 |          137216 | Different dense composition       |
| short    |   2 |                       1 |               0 | Within comparison gate            |
| stroked  |   2 |                     255 |         2197440 | Unqualified stroke geometry/order |
| long     |   2 |                       2 |               0 | Within comparison gate            |
| spaced   |   2 |                       1 |               0 | Within comparison gate            |
| dense    |   2 |                     233 |          277376 | Different dense composition       |

The stroked adjustment matches nominal outer width only approximately: #671 also
changes round/sharp geometry and paint ordering. Dense output differs because
old repeated AA coverage accumulates while the label path resolves it once.
Neither case supports a quality-equivalent performance claim. The small ordinary
DPR1 differences also remain explicit; only four controls pass this gate.

## CPU preparation and uploads

CPU intervals use uninstrumented devices and exclude queue draining. Creation
measures createMark only; destruction is outside its interval. Replacement uses
complete public series payloads. Queue-completion wall time is recorded
separately in the generated raw CPU results and is not GPU timing. Direct layout
and lookup calls are attribution microbenchmarks, not additive pieces of a
synthetic total.

| Workload | DPR | Replace median ms, old → label | Replace p95 ms, old → label | Lookup median ms | Replace upload bytes, old → label |
| -------- | --: | -----------------------------: | --------------------------: | ---------------: | --------------------------------: |
| short    |   1 |                      1.0 → 1.4 |                   1.1 → 1.6 |              0.4 |                 164,256 → 292,256 |
| stroked  |   1 |                      1.0 → 1.4 |                   1.1 → 1.5 |              0.4 |                 308,256 → 292,256 |
| long     |   1 |                      3.7 → 4.8 |                   3.8 → 5.0 |              1.0 |                 592,640 → 940,288 |
| spaced   |   1 |                      2.2 → 2.4 |                   2.4 → 2.6 |              0.1 |                   13,376 → 30,784 |
| dense    |   1 |                      1.6 → 1.9 |                   1.7 → 2.0 |              0.3 |                 267,296 → 409,632 |
| short    |   2 |                      1.0 → 1.4 |                   1.1 → 1.5 |              0.4 |                 164,256 → 292,256 |
| stroked  |   2 |                      1.1 → 1.4 |                   1.1 → 1.5 |              0.4 |                 308,256 → 292,256 |
| long     |   2 |                      3.7 → 4.8 |                   3.9 → 4.9 |              1.0 |                 592,640 → 940,288 |
| spaced   |   2 |                      2.2 → 2.3 |                   2.4 → 2.5 |              0.1 |                   13,376 → 30,784 |
| dense    |   2 |                      1.6 → 1.9 |                   1.7 → 2.0 |              0.3 |                 267,296 → 409,632 |

Uploads/resources come from a separate device with the existing renderer
profiler enabled; those timings are not performance results. Plain creation uses
five buffers on the old path and seven on the label path (stroked: six → seven).
Pipeline-cache hits confirm warmed program reuse. Every unchanged repaint writes
the same 256-byte draw-global block on both paths; it does not rebuild/upload
the lookup. CPU timer quantization limits interpretation of sub-0.1ms
operations.

## Sampled allocation / GC diagnostics

A separate CDP run samples V8 allocations at 4 KiB, including objects collected
during twenty actual replacements. These are estimates of JS allocations, not
exact allocated bytes; native/GPU backing allocation is unmeasured. Sampled heap
profiles retain source attribution; heap and backing-storage snapshots provide
aggregate usage. Traced GC observations belong to this profiled run and are not
application timing claims.

| Workload | DPR | Sampled JS MB per replace, old → label | Candidate lookup MB per replace | GC events over 20 replacements, old → label |
| -------- | --: | -------------------------------------: | ------------------------------: | ------------------------------------------: |
| short    |   1 |                            1.53 → 2.61 |                            0.98 |                                     22 → 28 |
| stroked  |   1 |                            1.52 → 2.58 |                            1.05 |                                     20 → 31 |
| long     |   1 |                            6.06 → 9.15 |                            2.94 |                                     24 → 27 |
| spaced   |   1 |                            1.72 → 1.91 |                            0.20 |                                     35 → 42 |
| dense    |   1 |                            2.77 → 3.61 |                            0.90 |                                     18 → 24 |
| short    |   2 |                            1.52 → 2.56 |                            1.01 |                                     24 → 30 |
| stroked  |   2 |                            1.54 → 2.57 |                            1.05 |                                     20 → 27 |
| long     |   2 |                            6.08 → 9.08 |                            2.92 |                                     24 → 23 |
| spaced   |   2 |                            1.72 → 1.91 |                            0.19 |                                     35 → 42 |
| dense    |   2 |                            2.82 → 3.59 |                            0.89 |                                     19 → 26 |

## GPU work

Timestamp queries bracket the actual single main render pass. Query resolution
and readback are outside that interval. Shader code is unchanged; native API
wrappers add timestamp descriptors and capture draw arguments. These are whole-
pass times, not isolated vertex or fragment cycle measurements.

| Workload | DPR | GPU median ms, old → label | GPU p95 ms, old → label |
| -------- | --: | -------------------------: | ----------------------: |
| short    |   1 |              1.056 → 1.282 |           2.076 → 2.490 |
| stroked  |   1 |              2.041 → 1.910 |           2.794 → 2.707 |
| long     |   1 |              2.744 → 2.519 |           3.151 → 3.269 |
| spaced   |   1 |              0.067 → 0.263 |           0.219 → 0.293 |
| dense    |   1 |              2.551 → 2.639 |           3.179 → 3.441 |
| short    |   2 |              1.550 → 2.885 |           2.334 → 4.005 |
| stroked  |   2 |              2.380 → 3.068 |           3.352 → 3.670 |
| long     |   2 |              2.453 → 3.540 |           3.060 → 4.087 |
| spaced   |   2 |              0.124 → 0.902 |           0.254 → 1.481 |
| dense    |   2 |              3.440 → 2.912 |           4.296 → 3.845 |

Draw capture observes six vertices per rectangle, not four. For 128 long labels
the old path submits 36,864 glyph instances and the new path 128 label
instances, both in one draw. The label vertex shader still scans 288 glyphs for
each of its six invocations: 221,184 logical loop iterations. This is
source-derived logical work verified against draw arguments, not observed memory
transactions or cycles.

Maximum stored lookup-list lengths are 4 for short labels, 5 for long labels, 1
for spaced labels and 64 for dense labels. These are input bin statistics, not
observed per-fragment candidate/sample counts. The spaced GPU increase is
consistent with processing the enclosing rectangle and its gaps, but timestamps
do not attribute that increase to a specific stage. No atomic-instrumented
shader timings or unsupported fixed-candidate bound are used.

## Reproduce

Use an existing development checkout with the repository dependencies and
Chrome. The lockfile is unchanged; no additional packages are needed. Prepare
two separate detached worktrees named baseline and candidate under an absolute
directory, with dependencies installed using the repository's normal development
setup:

```sh
git worktree add --detach /tmp/text-cost-pair/baseline 8e3d66cf6d35dc5b5073a56bd8137f8479a1bf9d
git worktree add --detach /tmp/text-cost-pair/candidate aff20e18445a9e6794a2291011e6c0f269f7f64e
node plans/text-composition-cost/scripts/preflight.mjs /tmp/text-cost-pair
node plans/text-composition-cost/scripts/cpu.mjs /tmp/text-cost-pair
node plans/text-composition-cost/scripts/allocations.mjs /tmp/text-cost-pair
node plans/text-composition-cost/scripts/gpu.mjs /tmp/text-cost-pair
```

Run stages sequentially, without other GPU/performance jobs. Ports 4791/4792
must be free. Scripts verify source revisions and served shader source, warm
fixtures, validate results and clean up their servers/browser. CPU
instrumentation is on separate devices; allocations are on separate profiled
runs. GPU timestamps need the optional timestamp-query feature. Metal is
selected on macOS; other machines must record their actual backend and do not
inherit the M5 conclusions.

The report includes every workload. Scripts write raw samples, sampled profiles
and heap/backing-storage usage to the pair directory outside the repository.
Local evidence also retains the initial invalid-fixture logs. The first warmup
had a text and series count mismatch and the first readback width was not
row-aligned; neither is evidence about the renderer. Initial diagnostic runs
lacking explicit final validation-scope reads are retained; the reported
CPU/allocation runs check every scope. No production test or tolerance was
changed.

## Architectural follow-up

- [x] Freeze public sources and verify workload/output differences.
- [x] Separate CPU preparation, upload/resource counts and sampled
      allocation/GC.
- [x] Record whole-pass GPU timestamps, draw arguments and lookup-list
      statistics.
- [ ] Qualify sharp union-exterior strokes and protection of neighboring fill
      against independent geometry references; old output is not that oracle.
- [ ] Define a focused composition approach and retained eligibility/lifecycle
      before considering any ordinary fast path or renderer switching.
- [ ] Reassess costs on comparable target output; seek other GPUs when
      available.
- [ ] Retire temporary plans/scripts before any production merge. This support
      branch itself must not be merged.

The spatial-list technique has established analogues in
[Nehab and Hoppe (2008)](https://www.microsoft.com/en-us/research/wp-content/uploads/2008/08/NehHop08.pdf).
[Slug](https://sluglibrary.com/) normally keeps per-glyph quads and can use
tighter bounding polygons. Those references explain the design space; they do
not qualify this implementation, and no external implementation is copied here.

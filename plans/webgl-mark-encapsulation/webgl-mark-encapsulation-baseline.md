# WebGL mark encapsulation baseline

## Starting point

- Revision: `4175209017a1aa072aa3c85b81fb45c88b930eeb`
- Renderer: WebGL
- Browser device-pixel ratio: 1
- Date: 2026-08-28

## Core thumbnails

The complete WebGL capture refreshed all tracked thumbnails. The same 22
specifications containing `random()` differed from the previous capture. The
same `examples/core/marks/rule/rules.json` stress example failed to return a
PNG after exceeding a WebGL texture dimension. No other example failed.

The refreshed random thumbnails remain uncommitted during implementation and
must not be treated as deterministic acceptance references.

## Large App captures

Both required specifications passed at a 1920 x 1080 frame and DPR 1 with no
console errors, page errors, request failures, or rendering failures:

- `private/genomespy-paper-2024-spec/spec.json`
- `private/MCCA-visualization/web/specs/spec.json`

Artifacts and the machine-readable summary are under the ignored directory
`output/webgl-mark-encapsulation-baseline-1920x1080/`.

## WebGL interaction performance

The headed hardware-backed WebGL-only matrix completed authoritatively:

- 60 samples total;
- 50 passed;
- 10 expected inapplicable closeup cases for the control specification;
- 0 failed;
- every applicable median animation cadence was 16.6 or 16.7 ms; and
- every applicable cell recorded one interval over 33.3 ms.

The generated report retains the previously fixed 100% coarse CPU-equivalence
bound. Final evaluation must also compare cadence, long-frame counts, profiler
phases/counters, correctness controls, and traces rather than relying on that
bound alone.

Artifacts are under the ignored directory
`output/webgl-mark-encapsulation-baseline/`.

## Final acceptance results

The complete post-refactor WebGL capture had the same single failure as the
baseline: `examples/core/marks/rule/rules.json` did not return a PNG after
exceeding the texture dimension. All other examples passed. The only 22
tracked thumbnail changes again belong to specifications containing
`random()`; every deterministic thumbnail remained byte-identical.

Both 1920 x 1080 App captures passed without console errors, page errors,
request failures, or rendering failures. Pixel differences against the
baseline were confined to the bottom-right timing/status text. Plot content,
legends, and axes matched. Artifacts are under
`output/webgl-mark-encapsulation-current-1920x1080/`.

The repeated headed WebGL interaction matrix again reported 50 passes, 10
expected inapplicable cases, and no failures. Applicable cadence medians
remained 16.6 or 16.7 ms, with one interval over 33.3 ms in each applicable
cell. Artifacts are under `output/webgl-mark-encapsulation-current/`.

A representative Canvas2D point-mark smoke passed. The hardware-backed
WebGPU example harness also passed the same point-mark example; no WebGPU
benchmark was run. No file in either WebGPU directory changed.

The full unit suite passed. Lint passed. TypeScript and declaration generation
retain only the recorded `gff-nostream` `GFF3Feature` declaration failure.
Minimal-bundle verification passed and retained the dynamic WebGL chunk.

Compared with the previous dynamic-WebGL build, the compatibility UMD grew
from 1,283.68 kB to 1,286.39 kB (gzip 474.93 kB to 475.88 kB). The production
ESM entry decreased from 607.84 kB to 606.72 kB (gzip 212.65 kB to 212.30 kB),
while the dynamically imported WebGL chunk grew from 166.87 kB to 172.37 kB
(gzip 45.63 kB to 47.17 kB). The UMD increase is approximately 0.2% and is not
material for this ownership refactor.

The source, test, and internal-documentation diff contains 874 insertions and
680 deletions before adding this acceptance record. Most growth is in the
private WebGL adapter and its focused tests; semantic `Mark` and the unused
retained rendering context lost 248 lines together.

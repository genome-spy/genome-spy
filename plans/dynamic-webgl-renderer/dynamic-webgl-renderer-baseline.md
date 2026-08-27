# Dynamic WebGL renderer baseline

This record captures the pre-refactor rendering and performance baseline for
the implementation plan. Generated benchmark traces and private App images are
kept in ignored `output/` directories.

## Environment

- Baseline revision: `56aa0b33667f408a31e2225603f1817024dfa720`
- Branch: `codex/dynamic-webgl-renderer`
- Date: 2026-08-27
- OS: macOS 26.5.1 (25F80), arm64
- Node.js: 24.13.1
- npm: 11.8.0
- Playwright package: 1.61.1
- Playwright CLI: 1.62.1
- Vite: 8.1.5
- Screenshot and benchmark DPR: 1

## Core screenshots

Both complete passes used explicit WebGL selection:

```sh
npm -w @genome-spy/core run capture:screenshots -- \
  --all --overwrite --renderer webgl --timeout-ms 120000
```

- Both passes discovered the same 214 sibling PNGs.
- 192 images were byte-identical between the two passes.
- The 22 differing images all have a matching specification that calls
  `random()`; no deterministic specification differed.
- Both passes had the same single failure:
  `examples/core/marks/rule/rules.json` could not return a PNG data URL after
  WebGL reported an out-of-range texture dimension. This is the existing
  10,000-rule stress example, and its previously tracked PNG remained in place.
- Benign existing warnings included Lit development mode, deprecated root
  `genome`, conflicting configured scale ranges, and Chromium ReadPixels stalls.

The refreshed run-two PNGs are the accepted pre-refactor sibling baselines.

## Private App screenshots

The existing 1200 x 700 App harness rendered both examples successfully, but
visual inspection showed that lower tracks and labels were constrained. The
runner and harness therefore gained configurable frame dimensions while
preserving 1200 x 700 defaults. The accepted captures use:

```sh
node packages/core/scripts/runWebGpuExamples.mjs \
  --scope app --renderer webgl --dpr 1 \
  --width 1920 --height 1080 --timeout-ms 120000 \
  --output-dir output/webgl-app-baseline-1920x1080 \
  private/genomespy-paper-2024-spec/spec.json \
  private/MCCA-visualization/web/specs/spec.json
```

| Specification   |    Visible canvas | Backing canvas | Colors | Non-dominant pixels |
| --------------- | ----------------: | -------------: | -----: | ------------------: |
| GenomeSpy paper | 1854.36 x 1004.44 |    1920 x 1040 |    674 |              49.26% |
| MCCA            | 1866.15 x 1010.83 |    1920 x 1040 |    693 |              52.40% |

Both captures passed with no console errors, page errors, request failures, or
rendering failures. Visual inspection confirmed complete lower tracks and
labels. The only console warning was Lit development mode.

## Normal App interaction checks

Both private specifications were opened in the normal App at 1920 x 1080 with
`renderer=webgl`. Introductory tours were closed before testing.

| Check                   | GenomeSpy paper                      | MCCA                                            |
| ----------------------- | ------------------------------------ | ----------------------------------------------- |
| Initial domain          | `chr1:1-chrM:16,569`                 | `chr1:1-chrM:16,299`                            |
| Domain after wheel zoom | `chr5:40,598,592-chr11:84,326,866`   | `chr6:71,246,938-chr13:7,656,622`               |
| Domain after drag pan   | `chr4:133,538,221-chr10:120,849,362` | `chr5:127,093,858-chr12:31,797,879`             |
| Hover/picking           | Short variant at `chr6:149,683,195`  | Copy-ratio interval `chr6:3,072,138-73,885,849` |
| Resize                  | 1920 x 1040 to 1600 x 860            | 1920 x 1040 to 1600 x 860                       |
| Wheel/scroll stability  | No errors                            | No errors                                       |

The paper tooltip included the selected variant's REF, ALT, filter, CADD, and
functional category. The MCCA tooltip included the selected interval, sample,
and log2 copy ratio. Neither page emitted browser errors during the checks.

## Bundle and import graph

The pre-refactor production build reported:

| Artifact                           |         Raw |      Gzip |
| ---------------------------------- | ----------: | --------: |
| UMD `dist/bundle/index.js`         | 1,276.41 kB | 473.21 kB |
| ESM `dist/bundle/index.es.js`      |   730.03 kB | 246.87 kB |
| Minimal ESM verification bundle    |   705.21 kB | 240.08 kB |
| Production ESM verification bundle |   730.06 kB | 246.89 kB |

`verify:bundle:minimal` passed, but it does not yet assert the intended WebGL
boundary. The production ESM entry statically contains legacy WebGL code.

The WebGL-heavy source inventory contains 44 modules:

- `packages/core/src/gl`: 20 files, 122,987 bytes, 4,123 lines
- WebGL mark implementations and GLSL: 24 files, 111,890 bytes, 3,849 lines

Six shared bridge files account for another 38,559 bytes and 1,276 lines:

- `src/genomeSpy/renderCoordinator.js`
- `src/genomeSpy/canvasExport.js`
- `src/fonts/bmFontManager.js`
- `src/fonts/textMetrics.js`
- `src/view/renderingContext/bufferedViewRenderingContext.js`
- `src/rendering/svg/raster/webgl.js`

The existing `webgl-*.js` output chunk contains only the SVG raster leaf, not
the live renderer. Future bundle assertions must reject synchronous imports of
`src/gl`, TWGL, GLSL, and WebGL mark modules; require a dynamic WebGL chunk; and
verify that Canvas/SVG-only initialization does not request it. UMD remains an
intentional inline compatibility artifact.

The normal Core build emitted the bundle sizes above and then hit the existing
declaration error that `gff-nostream` has no exported `GFF3Feature` member.
That unrelated type-generation failure is a known baseline limitation.

## Interaction performance

The authoritative headed Chromium matrix used the private MCCA specification,
the small App control specification, both renderers as counterbalanced
environmental controls, five repetitions, all six interaction cases, DPR 1,
and Chromium traces. WebGPU is not modified and its results are not an
acceptance target for this project.

```sh
node packages/core/scripts/runWebGpuInteractionBenchmark.mjs \
  --spec private/MCCA-visualization/web/specs/spec.json \
  --control-spec examples/app/samples.json \
  --renderer both --headed \
  --output-dir output/webgl-interaction-baseline-corrected
```

The first diagnostic matrix exposed a harness error: horizontal drag began at
the full genomic domain and dragged toward a clamped boundary, so neither
renderer could change the domain. The benchmark now performs the same untimed
zoom preparation already used by horizontal keyboard pan. The corrected
matrix then completed authoritatively:

- 120 samples: 100 passed, 20 inapplicable, 0 failed
- all six MCCA cases passed in all five runs on both renderers
- the two closeup cases were correctly inapplicable to the small control spec
- repeated closeup, hover/picking after motion, and resize controls passed
- optional filter/sort controls were omitted because the requested selectors
  do not exist in the MCCA or App sources
- output: 102 files and 1.4 GB, including `summary.json`, `baseline.md`, and
  Chromium traces

Chromium 149 reported the WebGL adapter as `ANGLE Metal Renderer: Apple M5` and
the WebGPU adapter as Apple `metal-3`. Both used a 1200 x 700 viewport and DPR 1.

Every reported median rAF interval was 16.6 or 16.7 ms. WebGL samples normally
had one interval over 33.3 ms; some WebGPU wheel/zoom samples had two. The
median profiled-frame WebGPU/WebGL ratio was 1.000x with a bootstrap 95% interval
of 1.000x to 1.143x.

The benchmark's specified `max(5%, same-backend A/A relative noise bound)`
formula produces a 100% CPU tolerance. Its maximum-based bound is dominated by
a few very small profiled-frame samples changing from about 1 ms to 2 ms; the
relative median noise is 0%. Preserve the measured 100% value for a like-for-like
final report, but do not use it alone as the performance gate. Final acceptance
must also preserve cadence medians, gap counts, interaction correctness, and
the relevant phase/counter trends. A consistent regression in those signals
requires investigation even when it falls inside the coarse CPU bound.

## Final verification

Final verification used the completed implementation on 2026-08-28. No file
under `packages/webgpu-renderer/` or `packages/core/src/rendering/webgpu/`
changed. WebGPU issue
[#483](https://github.com/genome-spy/genome-spy/issues/483) remains open with
the `webgpu` and `enhancement` labels for separate hybrid-SVG work.

### Visual and live-browser parity

The complete WebGL Core screenshot suite was repeated on the final hot path:

- all 192 deterministic PNGs were byte-identical to the accepted baseline;
- the same 22 specifications containing `random()` produced nondeterministic
  PNGs and were restored to the accepted baseline; and
- the same `examples/core/marks/rule/rules.json` stress example was the only
  harness failure, with its tracked PNG unchanged.

Both private App examples passed a final 1920 x 1080 WebGL capture in
`output/webgl-app-final-1920x1080`. They reported no console errors, page
errors, request failures, or rendering failures. Pixel differences from the
baseline were confined to the bottom-right ready/status text; plots, axes,
legends, layout, and data marks were unchanged.

| Specification   | Normalized RGB MAE | Pixels over 32 | Difference bounds           |
| --------------- | -----------------: | -------------: | --------------------------- |
| GenomeSpy paper |           0.05483% |       0.12510% | 264 x 13 status-text region |
| MCCA            |           0.04175% |       0.08724% | 265 x 23 status-text region |

The normal App checks were also repeated at 1920 x 1080. The paper example
zoomed and panned, picked the known `chr6:149,683,195` LATS1 stopgain variant,
and resized to a 1600 x 860 canvas. MCCA zoomed to
`chr5:40,421,529-chr11:67,208,093`, panned again, picked copy-ratio interval
`chr6:27,275,120-149,583,656`, and resized successfully. The browser error log
remained empty.

### Bundle and compatibility checks

The final production ESM is 607.84 kB (212.65 kB gzip) and its separate dynamic
WebGL chunk is 166.87 kB (45.63 kB gzip). The compatibility UMD is 1,283.68 kB
(474.93 kB gzip). `verify:bundle:minimal` proves that WebGL, TWGL, and GLSL are
absent from the synchronous ESM graph and that the WebGL chunk remains
reachable dynamically. Runtime network checks confirmed that Canvas2D and SVG
export do not request the WebGL module, while explicit WebGL selection does.

Canvas2D and WebGPU representative render smokes passed. The WebGPU check was
render-only; no WebGPU performance benchmark was run after the refactor.

The full Vitest suite passed 3,591 tests in 434 files, with one skipped and two
todo tests. Lint passed. Workspace TypeScript checking and Core declaration
generation reached only the recorded pre-existing `gff-nostream` missing
`GFF3Feature` declaration; bundle generation itself completed. No new typing,
lint, test, or bundle failure remains.

### WebGL interaction performance

The final headed hardware-backed WebGL-only matrix is in
`output/webgl-dynamic-refactored-hotpath`:

- 60 samples: 50 passed, 10 correctly inapplicable control closeup samples,
  and 0 failed;
- every applicable cell retained a 16.7 ms median animation cadence and one
  interval above 33.3 ms;
- MCCA normal-render medians were 0.6-0.7 ms and picking medians were
  0.7-1.2 ms, stable or lower than baseline except for timer-scale noise; and
- repeated closeup, hover/picking after motion, and resize controls passed.

The final run is authoritative on Chrome 149 with the Apple M5 ANGLE Metal
WebGL adapter, a 1200 x 700 viewport, DPR 1, five repetitions, and traces. Its
measured same-backend A/A bound was 33.3%; the precommitted acceptance bound
remains the baseline's 100%.

The small control spec consistently measured about 0.03-0.04 ms more render
work per frame than baseline after extraction. Resolving the delegate once in
the buffered batch removed the avoidable semantic-mark hop but did not change
that signal, identifying it as fixed delegate-boundary overhead rather than
per-instance work. It remains well below one millisecond, does not affect
cadence or long-frame counts, and is not present as a material regression in
the representative MCCA workload. Neither baseline nor final summaries emit
the `layout` or `layoutReplay` phase, so those phases are not claimed as a
measured comparison.

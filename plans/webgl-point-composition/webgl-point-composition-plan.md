# WebGL point fill/stroke composition

Status: bounded actual-renderer proof complete; implementation not started.
Base: fresh master 22cc6b69. Related: #604, #474 and WebGPU point PR #623.
No new dependencies. This slice completes neither issue.

## Architecture and contract

Follow ARCHITECTURE.md, packages/core/ARCHITECTURE.md and its rendering document.
Core PointMark (src/marks/point.js and markUtils.js) owns channels, normalization
and datum identity. The private WebGL point delegate (src/rendering/webgl/marks/point.js) owns GLSL,
gl.POINTS geometry and picking submission. Both ordinary and line-only shapes share
packages/core/src/rendering/webgl/marks/point.fragment.glsl. Keep the fix
there if proof supports it; do not change common.glsl's distanceToColor because
arrows and other consumers have separate geometry contracts.

Current ordinary-shape paint uses a stroke/fill replacement mix. Inward strokes
shift the supplied distance by half-width. The nominal shape distance already
exists before that shift. Resolve centered/inside Ci/Cf/Co from it using #604's
premultiplied formula, retaining the no-stroke path and existing gradient paint.
Use this established issue formula rather than an effects/composition framework.
No borrowed implementation or additional dependency is needed.

x/+ are stroke-only arms, not bordered filled shapes. Preserve crossShape's
vHalfStrokeWidth geometry, X rotation/length, stroke paint selection and fill
fallback, including field-driven mixed shape marks. Retain their original
single-paint coverage. Keep the vertex shader's strokeOpacity-zero width rule.

Do not change the existing picking branch, minimum-picking policy, vertex
padding, scale/parameter handling, resources or occurrence ordering. Actual
visible edge paint changes are intended; existing datum hits must be retained.
The unchanged Core WebGPU adapter and Canvas/SVG paths are outside this slice.

Core markUtils and the vertex shader currently fold common opacity into paints.
That broader contract needs a separate coordinated normalization change; this
slice tests independent fill/stroke opacity and does not claim common-opacity
parity. Also defer strokeAlign/outside API, x/+ redesign, tiny-size attenuation,
point-size limits, rule/text/arrow work and all unrelated shader cleanup.

## One coherent milestone

Outcome: correct existing centered/inward ordinary-point composition while
preserving x/+ thickness/fallback and picking. Tentative commit:
`fix(core): preserve point fill beneath transparent strokes`.

Expected delivery: point.fragment.glsl, one focused real-browser regression file
in packages/playground/tests/ (the existing Core rendering integration path),
one patch changeset, and only necessary test/snapshot adjustments. Target 3-5 delivery files and <=280 added
raw lines excluding this temporary plan. Stop and revise if vertex geometry or
shared normalization must change. No generic test infrastructure to hide size.
No public grammar/docs migration is needed for a rendering bug correction.

## Proof and implementation gates

- [x] Capture actual Core embed -> WebGL live RGBA at DPR1/2 on master,
  for centered/inward circle and square, opaque/translucent/transparent stroke,
  zero width and transparent fill. WebGL RGB color channels cannot represent
  RGBA-alpha-zero stroke; use strokeOpacity-zero and null stroke without
  expanding color normalization. Use independent expected coverage math.
- [x] Run a browser-only experimental fragment replacement through the SAME
  production pipeline, not a standalone approximation. Do not edit production
  sources. Qualify thin subpixel borders and inward outer fringes (<=2/255
  tolerance for stable straight/analytic samples). Preserve nominal fill when
  strokeOpacity is zero; distinguish transparent color normalization behavior.
- [x] Record full-image x/+ controls at widths1/4 and null-stroke fill fallback,
  visible stroke precedence and transparent stroke; candidate must be identical
  at DPR1/2. Include field-driven mixtures, live width/shape/data updates,
  rotation, clipping and original datum picks before/after.
- [x] Check ordinary shape interior/outer picks, inward policy and minimum
  picking size without requiring a new hit policy. Keep raw buffers and hashes
  outside Git for later implementation comparison.
- [x] Representative rotated circle/triangle gradient interiors preserve paint.
  Field-driven mixed occurrences retain images and datum identity after updates.
  Shared shader sources, arrows and rectangles are untouched.
- [ ] During implementation add an overlapping occurrence-order assertion and
  a nested-viewport clipping case; this bounded proof covers canvas-edge clipping
  and existing picks, not the full placement matrix.
- [x] Compare paired same-device CPU submit through synchronous pixel readback after
  warmup: 1k/100k points, circles/mixed shapes, stroke widths0/1, DPR1/2.
  Investigate any median increase beyond max(10%,0.2ms); record hardware/browser
  and single-device limitations. No new draws/vertices/resources/allocations.
- [x] Reconcile bounded proof results before implementation.
- [ ] Implement only after the plan/review gate. The permanent behavioral
  regressions must fail master and pass candidate, exercise public APIs and
  preserve the controls above without duplicating unchanged coverage.

Implementation validation later: focused Core browser tests with zero skips,
relevant point normalization/delegate tests and shader snapshots, Core types and
lint, release checks. Review related tests for redundant shader-text assertions.
Patch Core changeset required. Keep WebGPU PR #623 and WebGL rectangle PR #622
independent. Retire this temporary plan before merge. No PR at planning stage.

## Bounded actual-renderer proof (2026-10-28)

Fresh master 22cc6b69; Chrome156.0.8078.73. Two runs at DPR1/2:
ANGLE Metal on Apple M5 and ANGLE SwiftShader Vulkan. Both use public Core
embed -> normalization/scales -> private WebGL delegate -> live framebuffer
readPixels, plus public view.marks.pick and live parameter/dataset APIs.
PreserveDrawingBuffer is enabled only for observation. The experiment intercepts
one imported point.fragment.glsl module in the browser and substitutes a local
fragment candidate. All repository production sources remain untouched.

Independent oracle: take nominal distance d, Cf=clamp(.5-d*DPR), then centered
Ci/Co use +/- half width and inward Ci uses full width with Co=Cf. Resolve
premultiplied red fill/blue stroke using #604's overlap formula. Chosen sizes
make gl_PointSize integer so hardware point-coordinate rounding does not obscure
the sample. For centered w=.25/DPR, diameter=16-w*k (k=1 circle, sqrt(3) square).
Data x=31.5+.5/DPR and y=32.5-.5/DPR compensate Core's half-pixel offset and
upward quantitative y scale. Read physical pixel (40*DPR,32*DPR), so local
p=(8,0). Centered Cf=.5-.125*k, Ci=Cf-.125, Co=Cf+.125. Inward diameter16,
w=.25/DPR gives Ci=.25,Cf=Co=.5. Width1/DPR gives Ci=0,Cf=Co=.5.
Tolerance remains <=2/255; no shader-distance diagnostic is used as the oracle.

| Representative case | Master RGBA | Experiment RGBA / target |
| --- | --- | --- |
| Circle thin centered, opaque | [0,0,128,128] | [64,0,64,128] |
| Circle thin centered, stroke opacity .5 | [0,0,64,64] | [80,0,32,112] |
| Square thin centered, opaque | [0,0,104,104] | [40,0,64,104] |
| Inward thin, opaque, either shape | [0,0,128,128] | [64,0,64,128] |
| Inward outer fringe, stroke opacity .5 | [0,0,64,64] | [64,0,64,128] |

All 24 candidate sample comparisons pass on each backend. The matrix covers separate fractional fill/stroke opacity, empty fill,
wide inward stroke and no-stroke controls. StrokeOpacity-zero versus zero width
is whole-image identical. All expected sample cases fail master and pass the
experiment. Hardware samples are exact; software differs by at most 1/255.
No page errors or GL errors. Backing size follows DPR.

At each DPR 12 x/+ full-image controls cover widths1/4, null-stroke fill fallback,
visible-stroke precedence and strokeOpacity-zero with inward toggled. Every
candidate buffer and datum pick equals master exactly. Two retained mixed-shape
stages use circle/x/+/triangle, update width and rotation, replace shape/data
with new identities, and touch the clipped canvas edge; images and picks remain
identical. A small circle with minPickingSize12 retains its image and picks.
Rotated gradient circle/triangle interiors and their picks are preserved. The
ordinary circle/square pick probes include interior, nominal edge, outer band
and empty space. Existing inward hit policy is preserved rather than corrected
incidentally; full alignment-dependent picking belongs to later #604 work.

Performance: 800x400 logical canvas, 1k/100k points, circle/mixed table,
width0/1, DPR1/2; five warmups then 30 alternating paired samples per case.
Actual draws are asserted every timed frame. Measure Core renderAll through
synchronous one-pixel framebuffer readback, draining prior work first. All 16
median deltas are within max(10%,0.2ms): largest increase about 0.1ms; the largest
scene is 3.2ms before/after (100k mixed, DPR2, width1). This is a bounded local
comparison, not a portable throughput guarantee. An earlier gl.finish-only
measurement returned zero-resolution timings and was discarded; it is not
performance evidence. Final timing ran without the pixel-proof workloads.

Artifacts live outside Git in chat-local webgl-point-plan-proof/ (runner,
experimental shader, hardware/software results, raw RGBA controls, source
snapshots and performance runner/results). Temporary runner directory:
/private/tmp/genomespy-webgl-point-proof/. Keep these measurements as the
baseline for subsequent production implementation; do not ship interception
machinery or benchmark scripts. No new packages or lockfile changes.

## Implementation decision

The proof supports a fragment-local correction and no geometry/picking changes.
Retain line-only single-paint coverage explicitly; keep common.glsl and the
vertex shader unchanged. Expected runtime change is about 20 added lines;
reserve the rest of the <=280-line budget for actual-renderer regressions and
the Core patch changeset. Reconcile exact size before a PR. Independent plan
review is not yet requested; implementation and PR opening are not part of this
planning task. Remaining permanent integration assertions above are explicit
implementation gates, not claims of completed proof coverage.

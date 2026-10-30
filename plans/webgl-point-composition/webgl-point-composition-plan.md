# WebGL point fill/stroke composition

Status: scoped implementation and reviews complete; maintainer LGTM and original-head CI pass.
Base: fresh master 22cc6b69. Related: #604, #474 and WebGPU point PR #623.
No new dependencies. This slice completes neither issue.

## Architecture and contract

Follow ARCHITECTURE.md, packages/core/ARCHITECTURE.md and its rendering document.
Core PointMark (src/marks/point.js and markUtils.js) owns channels, normalization
and datum identity. The private WebGL point delegate
(src/rendering/webgl/marks/point.js) owns GLSL, gl.POINTS geometry and picking
submission. Both ordinary and line-only shapes share
packages/core/src/rendering/webgl/marks/point.fragment.glsl. Keep the fix local; do not change common.glsl's distanceToColor because
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
one patch changeset, and only necessary test/snapshot adjustments. Target 3-5
delivery files and <=380 added raw lines excluding this temporary plan. Stop and
revise if vertex geometry or shared normalization must change. No generic test infrastructure to hide size.
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
- [x] Permanent regressions add overlapping occurrence order and clipping inside
  a nested viewport with an adjacent empty view. The original bounded proof
  covered only canvas-edge clipping; these exercise the real integration path.
- [x] Compare paired same-device CPU submit through synchronous pixel readback after
  warmup: 1k/100k points, circles/mixed shapes, stroke widths0/1, DPR1/2.
  Investigate any median increase beyond max(10%,0.2ms); record hardware/browser
  and single-device limitations. No new draws/vertices/resources/allocations.
- [x] Reconcile bounded proof results before implementation.
- [x] Implement after the plan/review gate and closure of both proof gaps. The permanent behavioral
  regressions must fail master and pass candidate, exercise public APIs and
  preserve the controls above without duplicating unchanged coverage.

Implementation validation later: focused Core browser tests with zero skips,
relevant point normalization/delegate tests and shader snapshots, Core types and
lint, release checks. Review related tests for redundant shader-text assertions.
Patch Core changeset required. Keep WebGPU PR #623 and WebGL rectangle PR #622
independent. Retire this temporary plan before merge. No PR opened; report the exact delivery size first.

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

All 36 candidate pixel comparisons pass on each backend after the review-gap
rerun below. The matrix covers separate fractional fill/stroke opacity, empty
fill, wide inward stroke and no-stroke controls. StrokeOpacity-zero versus zero
width is whole-image identical. All expected sample cases fail master and pass the
experiment. Hardware samples are exact; software differs by at most 1/255.
No page errors or GL errors. Backing size follows DPR.

At each DPR 12 x/+ full-image controls cover widths1/4, null-stroke fill fallback,
visible-stroke precedence and strokeOpacity-zero with inward toggled. Every
candidate buffer and datum pick equals master exactly. Two retained mixed-shape
stages use circle/x/+/triangle, update width and rotation, replace shape/data
with new identities, and touch the clipped canvas edge; images and picks remain
identical. A small circle with minPickingSize12 retains its image and picks,
including an explicit hit outside visible paint in the enlarged picking area.
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

The proof and implementation support a fragment-local correction and no
geometry/picking changes.
Retain line-only single-paint coverage explicitly; keep common.glsl and the
vertex shader unchanged. Actual runtime diff is +10/-6 non-comment shader lines (net +4);
reserve the rest of the <=380-line budget for actual-renderer regressions and
the Core patch changeset. Reconcile exact size before a PR. Two independent Sol
plan/proof reviews found no architecture or shader-correctness blocker. Their
two proof-quality findings are closed below; no additional implementation scope
is needed. Implementation is now authorized and the permanent integration
assertions above pass. A PR remains unopened pending the exact-size report.

## Review-gap closure and rerun (2026-10-28)

Both Sol reviewers supported the fragment-local design and preservation of x/+,
shared helpers, geometry and resource ownership. Their two proof findings were:
wide-half was captured without a numeric paint assertion, and the minimum-size
picking control did not probe the expanded hit region. Neither required a new
production path, dependency or API. The original estimate was <=280 added
lines; the implementation checkpoint below records its later evidence-based
revision for the permanent browser test setup.

The temporary runner now asserts wide inward stroke colors at three locations
for circle and square, DPR1/2. Width20 exceeds the radius8 interior, so Ci=0.
At center/local x6, Cf=Co=1: opaque red beneath half-opacity blue must give
[128,0,128,255]. At the nominal outer fringe, Cf=Co=.5: expected
[64,0,64,128]. These expectations come from paint-over and coverage math;
the center/interior assertions do not rely on candidate shader output. Master
instead gives [0,0,128,128] internally and [0,0,64,64] at the fringe, so the new
checks expose lost underlying fill for a band wider than the entire shape.

The minimum-picking control now asserts original datum A at (32,32) and (35,32),
and an empty result at (39,32), on master and experiment. Its size4 circle has
nominal radius1. The (35,32) pixel is explicitly asserted to be [0,0,0,0] in the
visible framebuffer, while public picking must return A with minPickingSize12.
This proves an actual expanded hit beyond paint, not merely center/remote parity.
The full minimum-control image and these picks also remain equal to master.

Reran the complete actual Core embed/readback/picking proof on hardware Metal
and software SwiftShader at DPR1/2. Each backend now has 36 numeric candidate
pixel assertions: the prior 24, four wide-fringe and eight wide center/interior
checks. All pass within the unchanged <=2/255 tolerance; hardware is exact and
software's overall maximum error is 1/255. All wide samples are exact on both.
No page/GL errors; all x/+ full-image/fallback/width and retained mixed-shape
controls still pass, including unchanged datum identity and minimum picking.

The candidate GLSL and baseline production source hashes are unchanged from the
prior proof, so the earlier 16-case synchronized performance comparison remains
applicable. Only temporary runner assertions/observations and this plan changed.
The updated runner/results and original pre-review evidence are retained in the
chat-local artifact directory. At that proof checkpoint no production code, dependencies or lockfiles
changed. Overlap ordering and nested-viewport clipping were later added as permanent
implementation tests above.


## Implementation scope checkpoint

Before production edits, the permanent browser regression consolidates paint,
line-shape controls, minimum picking, overlap order and nested clipping into one
retained Core renderer per DPR. Its real embed/readback setup is larger than the
initial test estimate. Revise the added-line delivery target from 280 to 380,
still 3-5 files, rather than dropping the reviewed behavioral gates or hiding
setup in generic machinery. Production scope remains one fragment shader,
about a dozen added lines; no geometry, picking, shared helper or dependencies.
The exact final test is replayed against the archived master shader to
establish its pixel failure through the same Core path.


## Production implementation checkpoint

Only point.fragment.glsl changes runtime behavior. Compute nominal coverage once
and use it directly for no-stroke and x/+ single-paint output; ordinary shapes
with positive width resolve nested coverage. This is algebraically the existing
zero-band distanceToColor result, without an extra line-shape branch. The
actual production comparison below qualifies the simplification. The vertex
shader, picking branch, common.glsl, normalization, buffers, resource lifetimes,
arrows, rectangles and WebGPU sources remain untouched.

The new pointComposition.playwright.js runs one retained public Core embed per
DPR, with real parameter and dataset updates, RGBA readback and public picking.
It covers both ordinary distances, centered/inward thin bands, translucent
stroke, empty fill, wide inward center/interior/fringe, transparent stroke,
x/+ width and fill fallback versus stroke precedence, minimum picking beyond
visible paint, mixed-shape updates/rotation, adjacent-viewport clipping and
last-datum overlap paint/pick identity. No shader interception is shipped.

The field-driven shape fixture uses an explicit ordinal domain/range and no
legend, as does its color mapping. Initial proof mixtures used scale:null with
raw shape names; equal buffers there were baseline compatibility evidence, not
proof of the intended silhouettes. Final production/control comparisons use
explicit mappings and therefore qualify the actual mixed shape geometry. No
production workaround or unrelated color/shape behavior change is introduced.

All 36 candidate pixel samples pass against master on both Metal and SwiftShader
at DPR1/2 (hardware exact, software max 1/255). Production loads unchanged source
modules; only the baseline page substitutes the archived master point fragment.
All x/+ full-image controls, gradient interiors, minimum-picking and mixed datum
picks remain equal to master. Sources other than the point fragment retain
baseline hashes. This also qualifies direct single-paint coverage for line
shapes. All 16 final performance cases meet max(10%,0.2ms), largest increase
about 0.1ms; 100k mixed at DPR2/width1 is 4.1 to 3.9ms. Timing methodology and
single-device limits remain as recorded above.

The permanent regressions pass at DPR1/2 in the existing browser suite; relevant
116 WebGL/point unit tests and Core types pass. Exactly three existing point
shader snapshots update; no new shader-text assertions are added. A Core patch
changeset records the observable blending correction. release:check passes;
release:status remains minor for the fixed release group because master already
contains minor fragments. Root lint and separate browser-test lint pass. All 10 focused/neighboring
browser tests pass with zero skips. The exact permanent regression is also
replayed on Metal and SwiftShader at DPR1/2: master paint expectations fail,
implementation pixels and all compatibility controls pass. Keep the temporary plan for
review and retire it before merge.

Delivery is four files: point fragment, browser regression, three refreshed
point entries in one snapshot file, and one Core patch changeset. Benchmark and
baseline comparison runners stay outside Git in chat-local
webgl-point-implementation/. No dependencies or package/lockfile edits.


Final exact delivery against base 22cc6b69: 4 files, +378/-24 raw lines.
Runtime fragment +10/-6 (net +4), browser regression +329, generated snapshot
entries +30/-18, patch changeset +9. Runtime changes contain no comments or
blank-only additions; counts exclude tests, snapshots and release/plan prose.
The revised 380-added-line budget is met. The temporary plan is additional and
must be removed before merge; report its final separate count at PR delivery.
Production fix commit: b9d2e9de. Local checks and two independent Sol
implementation reviews are complete, with no actionable findings. Reviewers
inspected sources and saved results without independently rerunning browsers.
Remote CI passed on c8da5a11. The maintainer approved PR #624 and requested plan
retirement before merge. Every scoped implementation/proof gate is complete;
common-opacity normalization, shared alignment and broader native/picking parity
remain separate #604 work. Retire this reconciled plan before squash merge.

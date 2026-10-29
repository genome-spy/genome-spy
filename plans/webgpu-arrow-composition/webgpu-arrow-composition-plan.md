# WebGPU arrow fill/stroke composition

Status: implementation and final qualification complete; no PR opened.
Base: fresh master 22cc6b69. Part of #604; independent of PRs #622-#624; no stacking on their branches.
No new dependencies. Future merges use squash.

## Native ownership and small outcome

Start at ARCHITECTURE.md and Core rendering architecture. ArrowMark owns Core
normalization and semantic encoders; webGpuMarkAdapter.createArrowConfig passes
those values to the renderer's public arrowMark. ArrowProgram owns the existing
union distance, topology, bounds, paint and retained resources. Keep the
correction in arrowProgram.js's local distanceToColor. No shared helper,
Core-specific branch, CPU geometry, extra draw/layer/resource or new vocabulary.

Current shader mixes/replaces fill with stroke in the centered band. Use the
existing negative-inside logical-pixel union distance d to derive nested
Ci=coverage(-d-w/2), Cf=coverage(-d), Co=coverage(w/2-d), then #604's
premultiplied three-region paint resolve. Retain the existing width-zero fast
path. Paint opacity is separate from coverage; renderer semantic-scope opacity
is applied afterward. Core common-opacity normalization remains separate.
The issue's existing formula is the proven design; no imported code is needed.

Open heads are finite filled arm polygons with thickness derived from size,
not triangle interiors. Preserve their hollow geometry, headStrokeWidth,
head placement, notch, repetition, directions, min-size/stem constraints and
all vertex calculations. The border's corrected AA/paint pixels may change;
no-stroke images and opaque silhouette support must remain unchanged.

Picking uses the same shade() and color.a>0 policy. Preserve this policy,
geometry and datum identity. A transparent stroke currently removes nominal
fill and therefore can remove legitimate fill hits; restoring those visible
fill hits is intended. Do not promise byte-identical pick buffers for a broken
transparent-band case, or add a separate picking-distance path to conceal it.
Require unchanged opaque hit support and original IDs, actual positive head
hits and open-hole/outside misses. No new hit beyond actual paint support.

## One delivery milestone

Correct existing centered arrow paint while preserving open-head geometry and
interaction. Tentative commit: fix(webgpu-renderer): preserve arrow fill beneath
translucent strokes. Expected 3-4 delivery files: local shader, focused actual-GPU
regressions, existing arrow example if needed and migration backlog note. Initial
target <=250 added raw lines excluding this temporary plan. Reconcile size
before PR; revise scope if verification cannot fit, rather than adding a generic
test framework. This unpublished renderer-only contribution needs no release
fragment; a later Core/WebGL fix needs its own patch note.

Existing arrow-definition GPU tests cover geometry/picks. Complement them with
numeric paint assertions and representative retained interactions, not another
configuration matrix. Build/smoke the existing arrow story if edited. Before
implementation confirm backend ownership, Core consumer and invariants below;
run relevant unit/GPU/type/lint/release checks for delivery. Retain the plan in
a draft and retire before merge. Do not open a PR during this planning task.

## Proof gates before production changes

- [x] Submit actual public createRenderer/arrowMark, render to rgba8unorm and
  read submitted texture bytes at DPR1/2. Baseline and browser-only experimental
  arrowProgram module must use the same production compilation/submission path.
- [x] Independent straight-stem expectations for centered subpixel bands,
  opaque/translucent fill/stroke, transparent fill and width0/very-wide bands.
  Keep <=2-byte tolerance. Include numeric wide-stroke interior/edge assertions.
- [x] Alpha-zero stroke and strokeOpacity0 preserve nominal fill versus width0
  in an explicitly stable geometry/repetition regime. Characterize any existing
  repeat-footprint coupling instead of claiming universal geometry independence.
- [x] Triangle and open heads: width0 full images identical; opaque painted
  support identical; positive arm/head and stem IDs and open-hole/outside misses
  asserted at DPR1/2. Include a repeated open head and bidirectional/reverse
  controls. Distinguish geometry preservation from corrected AA/paint changes.
- [x] Retained paint/series/direction updates, overlap order, clipping, scope
  opacity and zero-length culling use representative actual rendering/picking.
  Shared shade picking must return original IDs for newly revealed nominal fill.
- [x] Paired same-device render through queue completion, 5warmups/30alternating
  samples, 1k/100k arrows, triangle/open heads, width0/1, DPR1/2. Investigate
  median increases beyond max(10%,0.2ms); no concurrent GPU proof workloads.
- [x] Inspect WebGL's actual Core embed path. Reproduce paint defect with
  numeric stem samples and open/filled head controls at DPR1/2. No WebGL
  implementation in this slice; shared distanceToColor consumers must not be
  modified globally. Record differences in paint-alpha picking policy.
- [x] Reconcile results, limitations and exact first-PR scope before coding.

Non-goals: strokeAlign/outside/inward APIs, Core grammar/normalization, native
Canvas/SVG/text effects, point/rectangle changes, min-size/zero-size or repeat
geometry redesign, picking-policy changes or dependencies. Preserve geometry;
if proof requires changing it, stop and revise the split before implementation.

## Bounded proof results (2026-10-29)

Chrome156.0.8078.73, Apple/Metal-3, public createRenderer + arrowMark, 64x64
logical canvas, DPR1/2, rgba8unorm submitted texture readback. The baseline
imports production sources. The experiment substitutes exactly one arrowProgram
module containing the local paint-helper replacement; every vertex, distance,
resource and picking implementation still uses the production path. Candidate
runtime estimate was +6/-2 WGSL lines; that bounded proof left sources untouched.

Independent stem oracle: endpoints(8,cy)..(56,cy), cy=32+.5/DPR, size=8-.25/DPR,
w=.25/DPR, sample physical(32*DPR,36*DPR). This is away from heads/notches,
with d=.125/DPR and Ci=.25,Cf=.375,Co=.5. Premultiplied red fill and blue stroke
have explicit independent opacities. For width20,size8, Ci=0 everywhere inside;
Cf=Co=1 at center, while the nominal edge has Cf=.5,Co=1. No candidate-distance
readback is used to calculate expected colors.

| Sample | Master RGBA | Experiment / target RGBA |
| --- | --- | --- |
| Thin centered, opaque | [0,0,128,128] | [64,0,64,128] |
| Thin centered, stroke alpha .5 | [0,0,64,64] | [80,0,32,112] |
| Fill alpha .8, stroke alpha .5 | [0,0,64,64] | [64,0,32,96] |
| Empty fill, stroke alpha .5 | [0,0,64,64] | [0,0,32,32] |
| Wide centered, edge | [0,0,128,128] | [64,0,128,191] |
| Wide centered, center | [0,0,128,128] | [128,0,128,255] |
| Thin opaque with semantic scope opacity .5 | [0,0,64,64] | [32,0,32,64] |

All 14 candidate numeric samples are exact (tolerance remains <=2/255). Master
fails each expected sample. No browser/GPU validation errors. Alpha-zero stroke
and strokeOpacity0 preserve the width0 image within 1 byte for triangle heads
with a stem and open heads with/without stems. The stable repeated open-head fixture is
exact. Width0 full-image hashes match master throughout the controls.

Six geometry controls cover filled forward and open forward/reverse/both,
repeated and outside heads. Their opaque alpha>0 support and queried IDs match
master; positive arm hits and empty open-hole/outside probes have explicit
expected 77/null values at both DPRs, not just baseline equality. A half-width
scissor retains left/reverse arms and excludes right arms as expected. Two
retained series keep IDs 81/82 after direction/paint replacement and a live
triangle-to-open property update; clipping removes the second row's pick.
Overlapping replacements paint green last and return original ID 82. A live
zero-length arrow becomes empty and unpickable, as before.

Picking clarification is measured: with width4 and alpha-zero stroke, old
shading loses legitimate nominal-fill hits. The experiment restores 77 exactly
where the width0 reference returns 77, while preserving empty holes/outside.
Do not call these restored hits an unchanged pick-buffer result or change the
shared alpha>0 policy. Opaque supports/IDs remain unchanged.

### Existing repeat-layout limit

With open heads, size8, headWidth2, interval8..56 and headSpacing3, transparent
width4 matches width0 exactly. At headSpacing1, spacing is clamped to the
stroke-dependent repeat footprint. Even the corrected paint resolve therefore
has whole-image difference 255 from width0: stroke width changes nominal repeat
layout before fragment painting. This is preexisting geometry coupling. Keep
it explicit, retain current layout in this slice, and do not add a special
transparency branch to hide it. A later geometry slice must resolve full #604
nominal-fill independence for tightly packed repeated heads.

### Performance

Public render through queue.onSubmittedWorkDone; 800x400 logical canvas,
1k/100k arrows, triangle/open heads, forward/reverse/both rows, width0/1, DPR1/2.
Five warmups then 30 alternating paired samples per case; both page variants use
the same retained API and no concurrent proof workloads. All 16 deltas meet
max(10%,0.2ms). Largest increase: 100k open,DPR2,width1,5.4->5.7ms (~5.6%,
budget 0.54ms). Triangle same scale 5.4->5.0ms; other deltas<=0.1ms. These are
bounded same-browser/device lower medians (sample 15 of 30), not cross-driver throughput guarantees.
No extra draw, vertex, resource, attachment or per-frame allocation is proposed.

## WebGL inspection and actual-path baseline

Core embed -> registered WebGL -> live framebuffer/picking reproduces all five
paint defects above at DPR1/2 on Metal and software SwiftShader (20 samples).
The sampled current pixels exactly match WebGPU's bad baseline. Transparent
width4 also removes fill relative to width0 for filled/open controls. Explicit
head-interior hits and clear open-hole/outside misses are retained as baseline
controls; no WebGL source is changed or candidate installed.

WebGL calls shared common.glsl.distanceToColor; do not repair that helper
globally, because other mark families are independently scoped. Its picking
branch uses geometric d<halfWidth rather than WebGPU's shade-alpha test and has
an existing AA-fringe limitation. A separate WebGL arrow follow-up must preserve
that supported policy and use its own Core browser regression and patch note.
It must not change point/rectangle shaders or depend on PR #622/#624. This
baseline check is not WebGL implementation or performance qualification.

## Concrete first PR and remaining gates

Four intended delivery files: arrowProgram.js, focused arrow paint GPU tests,
one translucent-stroke setting in the existing arrowScene if useful, and a
short migration-backlog update. Keep the initial <=250-added-line target;
measure before opening a PR. Reuse current shape distances and existing
premultiplied paint; replace only the centered branch of local distanceToColor.
No alignment API, shared framework, geometry/picking workaround or dependencies.

The bounded proof is complete. The local shader correction and permanent GPU
regressions are implemented. Four focused GPU tests pass without skips at DPR1/2,
including the existing geometry suite. All 313 renderer unit tests, renderer
types/lint and release-policy checks pass. Final production proof/performance
and the existing story build/smoke also pass as recorded below. No independent review was requested for this implementation.
Keep the repeat-layout limitation visible.
No PR opened. Temporary runners, raw RGBA controls, source hashes/snapshots and
results are retained outside Git in chat-local webgpu-arrow-plan-proof/.

## Implementation boundary

The explicit plan request did not include independent review; the user has now
authorized implementation after the completed bounded proof. Keep the proven
local helper replacement. Permanent GPU tests complement existing arrow geometry
coverage with numeric paint, stable transparent fill, live open-head/direction
updates, hole/arm IDs, clipping and zero-length checks. Generic occurrence-order
machinery is unchanged and remains qualified by the bounded integration proof;
do not duplicate that full fixture merely to mirror every proof observation.

## Implementation checkpoint

Master fails both new numeric paint regressions by 64 bytes in a channel. The
corrected production helper passes the independent pixel expectations and the
transparent-fill, original-ID, hollow-head, clipping and zero-length controls.
No geometry, resource, API or picking policy was changed.

The preexisting geometry suite also failed on untouched master: (12,10) samples
empty space outside the left head's diagonal while expecting ID41. Move that
positive probe to (18,14) inside the upper wing, preserving the asserted ID.
Both unchanged master and the corrected shader pass this probe at DPR1/2. This
one-line fixture correction makes five delivery files instead of the original
four; keep the <=250 added-line target. Avoid unrelated formatting changes.

Release assessment: unpublished WebGPU prototype only; no new fragment. Release
policy is valid; existing unrelated fragments still schedule the eight-package
fixed group's minor release. No package/dependency/lockfile modifications.

## Final production qualification

The final source equals the proven helper replacement byte for byte. A fresh
actual-path run serves the candidate normally and substitutes archived master
only for the baseline. All 14 independent numeric samples are exact; width-zero
images, opaque support, original IDs, retained series/paint/direction updates,
open holes, occurrence order and clipping pass with no GPU/browser errors.
The documented tight-repeat geometry limit remains; no workaround was added.

All 16 paired performance cases meet max(10%,0.2ms), with 5 warmups and 30
alternating samples and no concurrent GPU work. Largest increase is about .1ms:
100k arrows, DPR2, width1, triangle/open, 4.5->4.6ms (budget .45ms).

The existing arrow scene now uses strokeOpacity .5. Storybook builds and its
built arrow story completes GPU setup and renders at DPR1/2 with correct backing
sizes and no application/validation console errors. The static harness supplies
an empty favicon; generated build artifacts stay outside Git. Existing build
chunk-size warnings are unchanged. Renderer lint/types, 313 unit tests, four
focused GPU tests (zero skips), formatting, diff checks and release checks pass.

Exact cumulative diff from 22cc6b69, excluding this temporary plan: five files,
+245/-3 raw lines, net +242. Runtime shader alone is +6/-2, net +4. The additional
geometry test file changes one probe, qualified independently against master.
Final production artifacts are retained outside Git in chat-local
webgpu-arrow-implementation-proof/. No dependencies, Core, WebGL, points or
rectangles changed. Plan remains for review on the branch and must be retired
before squash merge. No PR opened.

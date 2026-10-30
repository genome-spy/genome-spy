# WebGPU point antialiasing composition

Status: implementation and local qualification complete; PR not opened.
Implemented on fresh master a29f81c4, separate from WebGL PR #622.
Both point shader paths use combined paint coverage. No new dependencies.
Related: #604 and #474; this slice completes neither issue.

## Native contract and ownership

Follow ARCHITECTURE.md, packages/core/docs/architecture/rendering.md and renderer
AGENTS.md. Public pointMark chooses pointProgram.js for fixed circles and
pathPointProgram.js for named/mixed/custom shapes. Core's
createPointShapeConfig maps constant circles to the former and data-driven
shape tables (including circles) to the latter. Both programs must participate.

Unlike rectangles before #621, points already preserve fill under transparent
stroke. Both shade functions instead multiply paint by independent fill/stroke
coverage and source-over those layers. That is not #604's combined coverage
resolve. For example, nominal coverage .75 and centered quarter-pixel stroke
with inner/outer coverages .625/.875 produces alpha .8125 with two opaque paints
instead of .875. Inward strokes can likewise over-cover the outer AA fringe.
The bounded baseline GPU proof below confirms both defects before coding.

Use each shader's existing distance, gradient-adjusted premultiplied paints and
inward/centered offsets to obtain nested Ci/Cf/Co, then resolve:
`Ci*F + (Cf-Ci)*(S + (1-S.a)*F) + (Co-Cf)*S`.
F/S include paint opacity and premultiplication; Ci <= Cf <= Co. Inward uses
Co=Cf and a full-width inner offset; centered uses half-width offsets. At zero
width all coverages coincide; alpha-zero stroke reduces to Cf*F.
Retain distance units (logical pixels vs atlas device pixels), topology, bounds,
MSDF limits, atlas lifecycle and shared picking path. Remove unused sourceOver
helpers if replaced. A short local formula in each shader is preferable to a
new composition framework or a generic module without a concrete need.

Core marks/point.js and markUtils.js own color/fill/stroke normalization. The
adapter passes existing encoders and inwardStroke. No grammar, normalization,
channel, alignment property, adapter workaround or dependency changes here.
Core's legacy opacity normalization can feed both paint opacities. Do not
claim this slice solves that shared authoring contract: renderer paint opacities
remain independent, while semantic scope opacity is applied after composition.

## One coherent milestone

Outcome: accurate existing centered/inward point paint coverage in both point
programs, with actual-renderer regressions and a focused existing point example.
Tentative commit: fix(webgpu-renderer): resolve point fill and stroke coverage together.
Consumers: standalone pointMark and unchanged experimental Core adapter.
Update MIGRATION_PLAN.md with remaining Core/other-backend work at delivery.
Unpublished renderer-only changes need no release fragment; verify policy then.

Non-goals: outside alignment, strokeAlign/inwardStroke migration, atlas or shape
geometry changes, changing x/+ thickness/fallback, negative/zero-size redesign,
Core API/scales/legends, other marks, Canvas/SVG/WebGL parity or new dependencies.
Current x/+ are finite filled paths in pointShapes.js, not stroke-width-defined
arms. Preserve their geometry, arm thickness, paint fallback, dispatch and
occurrence identity, while applying the same AA correction as other path shapes.
Exact existing AA pixels are not a compatibility gate. Full #474 arm-thickness
semantics remain unresolved; baseline preservation is not cross-renderer parity.

## Success criteria and proof budget

- [x] First demonstrate the AA-opacity defect on the actual public renderer at
  DPR 1/2, for a fixed analytic circle and a path-backed straight boundary.
- [x] Analytic premultiplied pixel expectations qualify centered/inward strokes,
  fractional widths/positions, opaque/translucent paints and transparent fill.
  Include an inward outer fringe and a centered thin-band boundary. Tolerance
  <=2/255 for analytic/straight samples; justify atlas-specific tolerance from
  measured distance precision rather than silently widening it.
- [x] In the established unclamped geometry regime, whole-shape transparent
  strokes preserve nominal fill versus zero-width baseline; test RGBA alpha-zero
  and strokeOpacity-zero separately. First characterize the preexisting tiny/
  wide-stroke UV-clamping limitation and require no new regression there.
  Universal equality would require a separate geometry slice, not a workaround.
- [x] One retained mixed-shape mark includes circle, triangle and x/+ instances.
  Check shape/paint series updates, rotated asymmetric shape, occurrence order,
  inwardStroke live change, clipping and datum-preserving picking. Reuse existing
  coverage where it protects these contracts; avoid a Cartesian test matrix.
- [x] Existing gradients and stroke-width/atlas-spread limits remain valid;
  representative checks include small symbols with wide inward/centered bands.
- [x] Semantic scope opacity applies once after combined paint. Keep this claim
  separate from Core's deferred common mark-opacity normalization.
- [x] No additional vertices, draw calls, attachments, atlas rebuilds or
  per-frame allocations. Measure paired same-device CPU-submit-to-GPU-completion
  medians for 1k/100k circles and a mixed path table at DPR 1/2, after atlas warmup.
  Investigate increases beyond max(10%, 0.2ms), reporting driver/machine limits.
- [x] Focused GPU tests pass with zero skips; relevant renderer unit tests,
  renderer types/lint, example build/smoke and release checks pass. Review related
  shader-string tests and replace overlapping assertions with behavioral proof.

Reviewed estimate: 4-6 files, roughly 30-60 changed runtime lines plus 150-230
new test lines; target <=320 added raw lines excluding this temporary plan.
Actual delivery is 5 files, +302/-42 raw lines: shaders +19/-42, behavioral
tests +278, example +1 and migration backlog +4. Tests exceed the initial
per-file estimate while total delivery stays within budget. No generic test
machinery was introduced. Report the temporary plan separately before any PR.

Gates: if either shader cannot express nested coverages within current distance
and atlas limits, or Core compatibility requires changing paint normalization
or x/+ arm geometry, stop and revise the split before implementation. Keep that
work explicit rather than introducing compatibility branches. Check that the
independently useful renderer correction does not newly regress Core inputs.

## Independent plan review

Two Sol reviewers confirm this renderer-only correction fits existing ownership.
Both shader routes must use the same coverage semantics. Preserve x/+ geometry,
not the buggy AA pixels. The path vertex shader clamps atlas UVs before
interpolation (pathPointProgram.js:171-179); width-expanded tiny shapes can
therefore distort nominal fill even when stroke RGBA alpha is zero. This is a
preexisting geometry limitation, not something paint resolution can repair.
Measure fixed square size4, center(32,32), width8, DPR1, RGBA-alpha-zero stroke;
compare width0 and strokeOpacity0. Repeat DPR2 to bound the observation. Before
production edits, also measure analytic-circle and straight-path AA cases.
Keep runners/results outside Git and record exact browser, inputs and pixels.
Do not infer full atlas qualification or cross-renderer parity from this proof.

Plan review is complete. Before merge reconcile every incomplete item,
commit that record, then remove this temporary plan in a later commit.

## Bounded baseline GPU results (2026-10-28)

Eight public-pointMark cases: circle/square x centered/inward x DPR1/2.
Source master cdb38551; Chrome156.0.8078.73, Apple Metal-3, rgba8unorm texture
readback. Existing workspace browser tooling; no dependencies or production edits.
The runner records source hashes, exact f32-friendly inputs, sample positions,
pixels and expected results. Zero browser errors and zero GPU validation errors.

| Case | Current premultiplied RGBA bytes | #604 target bytes |
| --- | --- | --- |
| Centered thin band, Cf=.75, Ci=.625, Co=.875 | [143,0,64,207] | [159,0,64,223] |
| Inward outer fringe, Cf=Co=.5, Ci=0 | [64,0,128,191] | [0,0,128,128] |

Both routes and DPRs match these current samples to <=1/255. Fixed circle uses
size272.25/264.0625 and width.25/.125 for the centered case at DPR1/2; inward
uses size256 and width1/.5. Center32+.5/DPR; sample(40*DPR,32*DPR).
The analytic target bytes are requirements, not pixels from an implemented fix.

Whole-image ordinary circle/square controls (size256, width4) are byte-identical
to zero-width baseline for RGBA-alpha-zero and strokeOpacity-zero, both DPRs.
The tiny square fixture (size4, width8, center32) confirms preexisting UV distortion:
sample(33*DPR,32*DPR) changes from [0,0,0,0] to [193,0,0,193] at DPR1 and
[198,0,0,198] at DPR2 with RGBA-alpha-zero stroke. Those are also maximum whole-
image channel differences. strokeOpacity-zero remains byte-identical to baseline.
Paint resolution cannot repair this geometry error; do not expand this slice.

Proof artifacts: chat-local gpu-point-plan-proof/{proof.mjs,results.json,README.md}
plus source snapshots; disposable runner /private/tmp/genomespy-point-proof/.
This establishes the defect and small implementation boundary, not candidate
correctness, performance or a universal atlas precision guarantee. No candidate
shader was installed and no test or production package was changed. Later actual
GPU regressions must qualify the implemented correction and no new tiny-case
regression. Keep the existing <=320-line delivery budget and no-dependency rule.

## Implementation checkpoint

Fresh base: master a29f81c4. Both point fragment shaders now resolve nested
paint coverage locally. Default/no-stroke samples skip border math. Existing
sourceOver helpers are removed; no vertex, atlas, normalization, resource,
bounds, gradient, picking machinery or public-input changes are made.

Two permanent DPR1/2 GPU tests fail against master by 16/255 on the centered
analytic target, then pass with the correction. Cover analytic circle and
path-square centered/inward paint, partial paint opacity, transparent fill,
scoped opacity, full-image transparent-stroke controls and the unchanged tiny
square baseline. One mixed circle/triangle/x/+ mark proves live stroke and
shape replacement, inward updates, rotated geometry, clipped picks and final
occurrence color/identity. Shape probes avoid the old antialiasing fringe.

All 22 focused GPU tests pass with zero skips, including existing gradient,
rotation, acute-bound, atlas-sharing and pathological-width contracts. The
313 renderer unit tests, types, lint and release checks pass. Vertex-focused
source-string tests were reviewed; they are unchanged by this fragment-only
correction, and no new shader-text assertions are added. No release fragment is
needed for unpublished renderer-only work; existing master fragments remain minor.

The existing PathPoints story uses half-opacity stroke to make overlap visible.
Storybook builds; the built story renders and cleans up in Chrome without page
errors. The unchanged Core WebGPU adapter's 74 unit tests also pass.

## Candidate performance and delivery qualification

Chrome156.0.8078.73 with Metal WebGPU on the same local machine; baseline is
master a29f81c4. Public renderer.render through queue.onSubmittedWorkDone,
800x400 logical canvas, DPR1/2, 1k/100k points, fixed circles or mixed
circle/triangle/x/+ table, width0/1. Atlas generation precedes five warmups;
30 alternating paired samples per case. All 16 median deltas meet the reviewed
max(10%, 0.2ms) budget. Baseline/candidate medians range 0.4-5.2ms, with largest
increase 0.1ms (4.1 to 4.2ms, 100k mixed points, DPR1, width1). DPR2's same case
is 5.2 to 5.1ms. This is a bounded single-browser/device comparison, not a
cross-device performance guarantee. No extra vertices, draws, attachments,
atlas rebuilds or per-frame allocations are introduced by the fragment changes.

Permanent tests exercise the submitted render/picking textures, including both
shader routes, rather than shader text. Geometry and normalization deferrals
above remain explicit. The final production shader diff is +19/-42 non-comment
lines (net -23); the example adds one line. No package manifests or locks change.
Local qualification is complete. Two independent Sol implementation reviewers
found no actionable architecture, simplicity, shader-path or scope issues. Both
reviewed downstream dispatch and shared picking; neither independently reran GPU
validation (one local server bind attempt was blocked). The existing 22 passing
GPU tests remain runtime evidence. Remote CI remains a PR delivery gate. No PR opened. Keep this temporary plan until reviewed, then
reconcile and retire it before merge.

Candidate artifacts: chat-local gpu-point-composition/ contains the performance
runner/results, built-story smoke result/screenshot and shader/test snapshots.
Temporary build/proof artifacts stay outside Git.

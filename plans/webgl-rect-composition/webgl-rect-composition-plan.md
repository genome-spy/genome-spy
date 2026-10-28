# WebGL rectangle paint composition

Status: proposed follow-up to merged #621, requested by maintainer in
issuecomment-6475866489. Implementation verified on the actual WebGL path; performance qualification pending.
No new dependencies.
Separate from the existing point-composition plan and branch. Related to #604.
Planning base: master a29f81c4 after #621; no runtime code changed.

## Architectural fit and scope

Start at ARCHITECTURE.md, Core ARCHITECTURE.md and rendering architecture.
Core's WebGL rectangle delegate owns its two shaders and existing encoded paints.
The CPU mark owns grammar/scales/parameters; WebGLMark owns GPU resources.
No dataflow, normalization, shared state or resource-lifecycle changes are needed.

rect.fragment.glsl calls common.glsl's distanceToColor, which replaces fill
with stroke. That helper is also called by point.fragment.glsl and
arrow.fragment.glsl. Leave common.glsl and those consumers byte-for-byte
unchanged. Implement the corrected resolve locally in rect.fragment.glsl;
carry shared opacity separately through rect.vertex.glsl. A small local formula
is intentional isolation, not a new shared abstraction or compatibility branch.

Retain nominal rectangle distance before hatch modifies stroke-band distance.
With premultiplied paints F/S, resolve nested coverage using #604:
Ci*F + (Cf-Ci)*(S + (1-S.a)*F) + (Co-Cf)*S.
For today's centered geometry, inner/outer offsets are strokeWidth/2. Hatches
may change Ci; nominal Cf and outer Co remain defined by the rectangle itself.
At width0 all coverages coincide; transparent stroke preserves nominal fill.

The vertex shader currently multiplies both paints by opaFactor, which contains
uViewOpacity and minimum-size compensation. Separate paint alpha from that
factor. Let Q=opaFactor*resolvedPaint; output Q+(1-Q.a)*background. This
intentionally corrects shadow visibility through translucent foreground paint.
Preserve the existing shadow kernel, support condition, offsets and
uShadowOpacity*uViewOpacity treatment, plus WebGL's effective-view-opacity fallback.
Keep the trivial unadorned path equivalent.
Do not claim that this makes shadow grouping identical to WebGPU semantic scopes.
Core's legacy mark-opacity normalization into paint channels remains unchanged.

One coherent milestone: rectangle-only shader correction plus real spec-to-WebGL
browser regressions, neighboring mark guards and a Core patch Changeset.
Tentative commit: fix(core): preserve WebGL rectangle fill beneath translucent strokes.

Non-goals: points/arrows/shared color helper, new alignment options, grammar or
legacy opacity normalization, point x/+ geometry, shadow/picking policy changes,
Canvas/SVG/WebGPU changes, new passes/buffers/textures or per-frame allocations.

## Proof and success criteria

- [x] Before production edits, reproduce transparent-stroke fill loss using a
  small actual Core spec with renderer:webgl, then record baseline point/arrow
  output on the same browser/device. No mocked shader/pixel implementation.
- [ ] Transparent and half-transparent stroke preserve nominal fill and correctly
  overlap it; opaque internal transitions have no background seam. Qualify sharp
  and rounded corners, fractional positions and subpixel/wide bands at DPR1/2
  using selected analytic premultiplied pixels (tolerance <=2/255, justified for
  the actual WebGL precision/export path before adopting it).
- [ ] Keep nominal fill beneath transparent hatch paint. Cover one hatch case
  and a stroke-over-shadow sample; retain existing shadow behavior elsewhere.
- [ ] Test minWidth, minHeight and minOpacity floor, plus fractional view opacity:
  shared paint attenuation applies once. Exercise retained paint changes and a
  two-occurrence overlap through api.params handles and api.datasets.set().
  Dataset set returns void; wait for rendered pixel changes, not its return value.
- [ ] Rectangle clipping, positional offsets, minimum-size expansion and picking
  identity/policy retain their existing behavior; shadows do not acquire a new
  picking contract. Keep picking based on the existing hatch-modified
  d<vHalfStrokeWidth, not nominal-fill distance or resolved alpha. Characterize
  the existing outside-threshold fallthrough to ordinary paint before coding;
  test positive datum IDs plus outside/subpixel-fringe/shadow-only no-hit samples
  with tooltip:false. Do not silently broaden this into a picking-policy fix.
  The plain-rectangle geometry and fast path stay intact.
- [ ] Points and arrows: common.glsl and both mark shaders have zero diff;
  existing generated point/arrow snapshots stay unchanged. Before/after actual
  pixels and picks are identical for representative filled/inward/line-only
  x/+ point cases and filled/open-arrow heads, including fractional opacity.
  Reuse a compact fixture, not another exhaustive shape matrix.
- [ ] Existing playground/tests/embedSelection.playwright.js demonstrates the
  public embed/selection/export browser harness. Add focused coverage alongside
  that harness, explicitly selecting WebGL and DPR1/2. Verify visible live output
  and characterize supported WebGL raster export separately. One keyed two-row
  rectangle scene plus six disjoint point/arrow controls suffices. Real-compile
  plain, rounded-only, stroked and shadow-only variants: mocked shader snapshots
  cannot prove varying linkage. Screenshots alone are not correctness proof.
- [ ] Run relevant rectangle/unit/shader suites, browser regressions with no
  skips, Core types/lint, schema check only if grammar unexpectedly changes
  (which requires re-scoping), and release policy/status. Update only rectangle
  shader snapshots if needed; do not regenerate point/arrow expectations.
- [ ] Measure paired warmed rendering at 1k/100k plain/decorated rectangles,
  DPR1/2 on one browser/device. Investigate median increases beyond max(10%,0.2ms).
  Use explicit GPU completion (e.g. gl.finish for bounded external measurement),
  not requestAnimationFrame spacing or CPU submission alone. No extra geometry,
  passes, resources or per-frame allocations.

## Delivery boundary

Estimate: 5-7 delivery files, 40-70 changed runtime lines and 150-220 focused test
lines, plus minimal rectangle snapshot updates and one @genome-spy/core patch
Changeset. Target <=350 added raw lines including snapshots, excluding this plan.
Report exact raw/runtime/test/snapshot counts before opening a PR; re-scope before
exceeding the budget. The patch fragment describes corrected observable rectangle
transparency; existing fixed-group release intent may already be minor.

If preserving points/arrows requires editing the shared helper, or correct
rectangle opacity requires a broader normalization/shadow redesign, revise the
split before coding. Do not slip a shared refactor into this follow-up. Keep
other #604 outcomes open. Review the bounded plan before substantial work when
requested; reconcile and retire it under the planning skill before merge.

## Independent review findings

Both Sol reviews confirm rectangle-local ownership, unchanged common helper and
neighboring shaders, and a plausible five-file minimum. No shared abstraction or
new dependency is justified. Before coding: specify paint-over-shadow weighting,
measure live and exported alpha separately, prove positive picks/retained updates,
and save temporary paired-baseline neighbor pixels including edge strips. Existing
snapshots are isolation guards, not proof that browser shader variants link.
Keep the <=350 added-line budget, avoid new full shader snapshots or a test framework.

## Bounded baseline proof (2026-10-28)

Source master a29f81c4, Chrome156.0.8078.73, native Metal launch, DPR1/2.
Public Core minimal embed with explicit WebGL registration; actual inline specs,
parameter/data APIs and public positive picking. Temporary live readback requests
preserveDrawingBuffer, retaining antialiasing and premultiplied alpha. Assert
actual 64x64/128x128 buffers. Launch with Chrome's device-scale flag as well as
context DPR: context-only emulation gave a wrong observed backing size here.
Runners, JSON, source hashes/snapshots and raw RGBA buffers live outside Git in
chat artifacts webgl-rect-plan-proof/ and /private/tmp/genomespy-webgl-rect-proof/.

Both DPRs reproduce the defect at a fully covered inward-band pixel:

| Paint case | Actual premultiplied RGBA | Required resolved paint |
| --- | --- | --- |
| Zero-width stroke | [255,0,0,255] | [255,0,0,255] |
| Transparent blue stroke | [0,0,0,0] | [255,0,0,255] |
| Half-opacity blue stroke | [0,0,128,128] | [128,0,128,255] |

Live half-alpha red is [128,0,0,128]. Public PNG export decodes as straight
[128,0,0,128], normalizing to premultiplied [64,0,0,128]. That existing export
alpha difference is characterized, not fixed or used as a live pixel oracle.
Opaque/fractional paint baselines are exact on the selected interior samples;
<=2/255 edge tolerance still needs calibration against candidate edge cases.

Plain, rounded-only, stroked and shadow-only variants compile/render without
WebGL errors at both DPRs. Additional thin-stroke, transparent hatch, stroke/
shadow overlap, minWidth, minOpacity floor and fractional view-opacity baselines
are recorded. minWidth fade gives [0,0,128,128]; minOpacity=.75 gives
[0,0,191,191]. Shadow-only green is [0,127,0,127]; the half-blue foreground band
currently hides it ([0,0,128,128]), consistent with the old replacement helper.

Positive picks identify datum A, then B after public dataset replacement; moved
pixels clear and parameter updates visibly change paints. The selected outside,
subpixel-fringe and shadow-only picks are empty. This does not establish that
all raw picking fallthrough cases are safe; no picking-policy fix is included.

Six separate neighbor controls (filled/inward points, x/+, filled/open arrows)
at DPR1/2 have full live RGBA snapshots and expected positive/outside picks.
All twelve buffers and picks match on repeat. Common helper and all point/arrow
sources match master hashes. These are baselines for exact comparison after
implementation, not a claim that an unimplemented candidate has passed.
Zero browser page errors and zero WebGL errors. No production/test/dependency
files changed; no candidate shader or performance proof was introduced.

Next: implement only the bounded rectangle shader correction after authorization,
then prove candidate output, compare neighbor baselines, and add permanent tests.
Keep export/picking risk outside scope and the <=350 added-line delivery budget.

## Implementation checkpoint

The correction is confined to rect.vertex/fragment.glsl. Nested paint coverage
uses the nominal rectangle distance and hatch-modified inner distance. A carried
vOpacityFactor applies view/minimum-size attenuation once after paint resolve;
the plain path uses the same factor without SDF coverage. Shadow kernel/support
and geometric picking branch remain unchanged. No shared helper, point/arrow
shader, resource, topology or grammar changes.

Permanent public-Core browser regressions run on software WebGL at DPR1/2;
actual backing sizes are asserted. Tests failed on master (255/255 transparent
fill loss), then passed after the correction. Cover full-image transparent paint,
sharp/rounded shapes, thin/wide bands, hatches, minWidth/minHeight/minOpacity,
view opacity, shadow overlap, live parameter/data updates and positive picks.
A two-occurrence crossing verifies occurrence order; the external candidate
proof additionally verifies removal of moved geometry.

112 focused WebGL unit tests pass, including all point/arrow shader snapshots.
The updated snapshot named "point selection example" contains the generated
rectangle brush, not a point shader. Core types, test lint and release checks
pass after restoring the already-declared lockfile dependencies locally.
Candidate replay matches all twelve saved point/arrow buffers and picks exactly,
plus shared/neighbor shader hashes. No manifest or lockfile changes.
Core patch Changeset is included; existing fixed-group fragments still schedule
an overall minor release. Remaining checks: performance, final exact size and PR
review. No PR opened. Temporary proof artifacts remain outside Git.

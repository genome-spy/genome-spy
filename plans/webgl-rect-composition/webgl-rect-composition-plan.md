# WebGL rectangle paint composition

Status: proposed follow-up to merged #621, requested by maintainer in
issuecomment-6475866489. Plan only; no production edits or new dependencies.
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
factor. Multiply combined fill/stroke once before the existing shadow background
resolve; keep the trivial unadorned path equivalent. Preserve shadow geometry,
its existing uViewOpacity treatment and WebGL's effective-view-opacity fallback.
Do not claim that this makes shadow grouping identical to WebGPU semantic scopes.
Core's legacy mark-opacity normalization into paint channels remains unchanged.

One coherent milestone: rectangle-only shader correction plus real spec-to-WebGL
browser regressions, neighboring mark guards and a Core patch Changeset.
Tentative commit: fix(core): preserve WebGL rectangle fill beneath translucent strokes.

Non-goals: points/arrows/shared color helper, new alignment options, grammar or
legacy opacity normalization, point x/+ geometry, shadow/picking policy changes,
Canvas/SVG/WebGPU changes, new passes/buffers/textures or per-frame allocations.

## Proof and success criteria

- [ ] Before production edits, reproduce transparent-stroke fill loss using a
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
  two-occurrence overlap through real parameter/data updates, not shader mirrors.
- [ ] Rectangle clipping, positional offsets, minimum-size expansion and picking
  identity/policy retain their existing behavior; shadows do not acquire a new
  picking contract. The plain-rectangle geometry and fast path stay intact.
- [ ] Points and arrows: common.glsl and both mark shaders have zero diff;
  existing generated point/arrow snapshots stay unchanged. Before/after actual
  pixels and picks are identical for representative filled/inward/line-only
  x/+ point cases and filled/open-arrow heads, including fractional opacity.
  Reuse a compact fixture, not another exhaustive shape matrix.
- [ ] Existing playground/tests/embedSelection.playwright.js demonstrates the
  public embed/selection/export browser harness. Add focused coverage alongside
  that harness, explicitly selecting WebGL and DPR1/2. Verify visible live output
  and supported WebGL raster export; screenshots alone are not correctness proof.
- [ ] Run relevant rectangle/unit/shader suites, browser regressions with no
  skips, Core types/lint, schema check only if grammar unexpectedly changes
  (which requires re-scoping), and release policy/status. Update only rectangle
  shader snapshots if needed; do not regenerate point/arrow expectations.
- [ ] Measure paired warmed rendering at 1k/100k plain/decorated rectangles,
  DPR1/2 on one browser/device. Investigate median increases beyond max(10%,0.2ms).
  No extra geometry, passes, resources or per-frame allocations.

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

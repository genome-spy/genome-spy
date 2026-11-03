# Shared rule strokes: native Canvas decision and implementation scope

Status: shared paint wiring implemented on `codex/core-rule-stroke`; integration
qualification in progress, no implementation PR opened. PR #644 is the separate explicit-fill
prerequisite, based at `0feee7824`.

Requirements: [#604](https://github.com/genome-spy/genome-spy/issues/604).
Accepted Canvas decision:
[#646](https://github.com/genome-spy/genome-spy/issues/646#issuecomment-6604214445).

## Contract and architectural fit

Use existing `fill`, `fillOpacity`, `stroke`, `strokeWidth` and `strokeOpacity`
channels/properties. `size` remains nominal body thickness. Explicit fill wins
against the existing color fallback. No outline-specific vocabulary, dependencies,
extra logical marks or generic effects machinery. Preserve ordinary ticks and
other mark families.

The maintainer decision supersedes strict Canvas coverage for **rule borders
only**. Canvas constructs a projected centerline once, paints the wider stroke,
then paints the nominal body. Keep both paints adjacent in occurrence order.
Absent/transparent borders preserve the original body; nonpositive body sizes
stay hidden. Retain the no-border single-paint path.

Accepted Canvas differences, for live rendering and Canvas-backed export:

- Native edge antialiasing/composition, without a promised one-pixel bound.
- The border can show through a translucent body throughout its interior.
- Common per-rule opacity on both paints can change combined color/alpha.
  Existing view-level opacity composition remains in use.
- Native caps/dashes approximate the effect; butt endpoints and dash cuts need
  not receive complete silhouette borders.
- Width expansion approximates outside alignment even for future inside/center
  requests. Exact alignment remains a GPU requirement.

WebGL/WebGPU still require shared-coverage composition, including finite end/dash
borders and correct thin-body compensation. SVG remains vector-only, with the
previously accepted internal antialiasing hairline limitation. The Canvas decision
introduces no new SVG exception.

Ownership and affected consumers:

- `marks/rule.js` owns paint normalization, scale identity and reactive encoders.
  Specification types/defaults/schema and rule guides consume that contract.
- `rendering/immediate/marks/rule.js` owns native endpoint projection,
  minimum-length completion and conservative culling. Reuse its single visitor.
- `rendering/canvas2d/renderers/rule.js` owns the adjacent native paints.
  No scratch surfaces, isolation, custom contour/dash machinery or readback.
- `rendering/canvas2d/picking/renderers/index.js` extends its existing rule path
  for visible border extent without another traversal or picking pass.
- SVG owns vector elements/definitions; WebGL owns finite-ribbon shaders,
  retained buffers and GPU picking. Core's WebGPU adapter uses only public
  renderer channels. Fix renderer math in its owner, not via adapter opacity.
- Conservative export/culling bounds and picking must include visible border
  extent; preserve clipping, view opacity and occurrence order.

Architecture sources: root/Core `ARCHITECTURE.md`, Core rendering architecture,
semantic RuleMark, native visitor/painters/software picking, WebGL rule shaders,
Core `webGpuMarkAdapter.js` and standalone `ruleProgram.js`. Backend resources
remain inside their existing boundaries; no CPU scene graph or retained datum
geometry.

## Bounded native Canvas proof: passed

Temporary source copy of `0feee7824`, using real Core embedding, projection,
Canvas live rendering and PNG export. Replaced only the temporary Canvas painter
with two native strokes, retaining the earlier prototype channel/default and
conservative-culling wiring. This is not a production implementation. All source,
runners and raw results are outside Git in this chat's artifact directory under
`rule-border-native-proof/`; no project dependencies were installed.

Chrome 156, DPR 1, tested with Metal and with GPU/accelerated Canvas disabled:

- Opaque nominal red body and blue exterior retain their intended paint/size.
- Transparent stroke opacity and transparent CSS border paint each match the
  original unoutlined export byte-for-byte. Unoutlined and tick exports also
  match their original controls byte-for-byte.
- A half-transparent red body over an opaque blue border gives the accepted
  purple interior. Common opacity 0.5 gives combined alpha about 192, rather
  than pretending to match GPU composition.
- Crossing occurrences in both orders preserve the later body and border.
- Zero-size rules remain hidden; native round/square ends and dash gaps render.
- An offscreen centerline with a visible outside band survives native culling.

The initial cap assertion mistakenly sampled inside the nominal cap; moving it
outside the body confirmed the intended blue border. No painter change or
rendering tolerance relaxation was needed.

### Cost and interaction

1,000 short diagonal rules, 512x512, DPR 1. Warm medians: 21 synchronous
repaints and nine PNG exports, original baseline measured before/after.

| Configuration                   | Original repaint / PNG | Candidate without border | Candidate with border |
| ------------------------------- | ---------------------: | -----------------------: | --------------------: |
| Metal                           |          0.2 / 16.7 ms |            0.2 / 16.7 ms |         0.3 / 16.3 ms |
| GPU/accelerated Canvas disabled |          0.2 / 16.6 ms |            0.2 / 16.7 ms |         0.3 / 16.7 ms |

Both configurations pass existing gates: unchanged no-border cost within
max(10%, 0.2 ms); outlined repaint/export at most twice baseline plus 1/2 ms.
Repaint is CPU submission time; PNG is wall time including encoding/scheduling.
Do not interpret the PNG difference as a speedup or these values as GPU timing.

Live pan/zoom used the public named-scale `zoomTo` API with immediate rendering,
alternating full, panned and zoomed domains. Thirty measured transitions after
ten warmups per case, again 1,000 rules:

| Configuration                   | Original CPU median / p95 | Outlined CPU median / p95 | Original next-frame p95 | Outlined next-frame p95 |
| ------------------------------- | ------------------------: | ------------------------: | ----------------------: | ----------------------: |
| Metal                           |              1.5 / 1.7 ms |              2.0 / 2.2 ms |                 18.1 ms |                 18.9 ms |
| GPU/accelerated Canvas disabled |              0.4 / 0.5 ms |              0.8 / 2.0 ms |                 17.1 ms |                 18.5 ms |

Next-frame timing includes browser scheduling, not GPU completion. Separate runs
showed CPU timing variability; do not compare Metal/software as a platform ranking.
The tested fallback workload remained responsive. Larger production datasets,
other browsers, DPR 2 and more complex compositions are not qualified by this
bounded proof. Picking was traced but not yet extended/tested; the culling probe
does not establish picking correctness. No permanent configuration matrix follows.

## Smallest coherent implementation and success criteria

Implement outside rule strokes through the existing shared paint API, covering
all supported consumers before exposing the grammar. Keep PR #644 independent.
Inside/center and shared legacy alignment normalization remain a later shared
contract change; do not introduce a rule-only alignment property in this slice.

1. Close the remaining concrete renderer gaps: finite outside end/dash coverage
   in WebGL, WebGPU thin-body compensation that currently fades the border, and
   vector SVG geometry including dotted round-cap patterns. Reuse existing
   backend representations; no new generic contour/effects system. Qualify one
   representative actual-path case per distinct risk before promoting candidates.
2. Wire semantic channels/defaults, native two-stroke Canvas, GPU/SVG consumers
   and conservative bounds/picking together. Preserve color fallback, paint scale
   identity, conditions/expressions, nominal body size, zero-size hiding, ticks,
   no-border appearance, minLength and existing clipping/dash semantics.
3. Extend existing regression coverage for distinct contracts: transparent border,
   translucent composition, a crossing order, border-only picking/culling, thin
   GPU body with opaque border, and vector-only SVG. Use actual rendering paths
   for pixel contracts. Avoid duplicating every case across backend/config matrices.
4. Document native limitations and add one Core minor Changeset. Show exact diff
   size before opening the PR; review architecture/simplicity at the shared API
   and final integration boundary. Tentative commit:
   `feat(core): add outside strokes to rule bodies`.

Stop if the complete consumer path requires a much larger abstraction or fails a
cost gate. Re-scope explicitly rather than silently dropping a consumer or
relaxing GPU/SVG contracts. No unrelated point/rectangle/arrow/text features.

## Historical evidence: rejected strict Canvas candidates

Previous results remain archived unchanged and in plan history at `7d5b0999d`.
They do not constrain the newly accepted approximate Canvas implementation.

- Separate ring rasterization failed 8/12 cap/rotation seam checks (alpha 192
  rather than 255 inside an opaque outer shape). Readback changed rasterization
  and masked failures; flush/readback/filter tricks were rejected.
- A one-dimensional contour union was promising for selected positive-length
  dashes but discarded zero-on spans, so it did not support dotted round caps.
  Do not promote that helper as general dash geometry.
- Initial SVG proof covered only twelve horizontal butt-cap paint exports,
  not caps, rotation or dash unions. Three reviewers corrected this claim and
  rejected treating the neighboring WebGL butt-AA defect as a prerequisite.
- Shared-mask complement/add/complement arithmetic was exact for all 32,896
  nested 8-bit coverage pairs and passed 440 minimal actual-path comparisons.
  Its three-surface realization cost 217.3 ms repaint / 439.6 ms PNG versus
  0.2 / 16.7 ms unoutlined, decisively failing the same provisional gates.
  These failures reject those implementations, not mathematical feasibility.

No release impact from this plan/proof-only branch. Retire this temporary plan
before any implementation PR is merged, following the planning skill.

## Implementation progress

- Shared channels/defaults and `filled` color routing are wired; body `size` and
  border width are now distinct native occurrence fields. Ticks retain their
  previous channels and paint behavior.
- Native Canvas uses adjacent strokes and the existing paint-alpha cache. The
  shared immediate visitor expands conservative culling only for visible border
  paint; existing software picking expands in the same traversal.
- SVG-specific native contours and a luminance cutout keep overlapping dash caps
  unioned by nonzero fill. The outside stroke uses native round joins. No generic
  contour union, image or filter was introduced. Actual SVG end/dash qualification
  remains in progress under the accepted internal-edge limitation.
- WebGL keeps its existing nominal/no-border path and four-vertex occurrence;
  outside borders use finite shared coverage with a backend-owned interval lookup.
  WebGPU receives only public paint channels. Thin-width compensation is applied
  separately to each geometric boundary, preserving nominal body coverage while
  avoiding global border fading. Narrow and wide physical-pixel checks pass.
- Initial actual Core export/picking checks pass on Canvas/WebGL/WebGPU at DPR
  1/2. Invisible WebGPU borders no longer enlarge the picking quad. Headless
  regressions cover CSS-alpha border removal, datum identity and offscreen-border
  culling; broader composed/end/dash checks and final cost/static checks remain.
- Follow-up verification must include the existing fill/tick regression and
  standalone rule GPU tests. Shared alignment migration and other marks remain
  out of scope. No dependency or manifest changes.

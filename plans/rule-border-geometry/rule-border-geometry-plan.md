# Rule border geometry: bounded design and proof

Status: qualification in progress; no production implementation.
Base: `0feee7824` (the reviewed fill prerequisite in PR #644, pending review).
Requirement: https://github.com/genome-spy/genome-spy/issues/604 .

## Scope and architectural fit

Determine whether an outside border around a straight rule ribbon has a small,
correct native implementation before exposing more Core grammar. Keep PR #644
unchanged. Only this plan is tracked; prototypes and measurements stay outside
Git. No dependencies, point/rectangle/arrow/text work, generic effects framework,
retained CPU scene graph or production API changes.

- Semantic marks own the existing fill/stroke channels, normalization and
  parameter/scale identity. A future border uses size for the nominal body,
  strokeWidth for the full band, and separate paint/common opacity.
- `rendering/immediate/marks/rule.js` owns native projected endpoints,
  minimum-length completion and culling. Small native rule-contour geometry
  belongs beside it; it must not own Canvas, SVG or GPU resources.
- Canvas owns scratch surfaces and occurrence isolation; SVG owns vector
  elements and definitions; WebGL owns its finite-ribbon SDF/quad and picking.
  The Core WebGPU adapter consumes only public renderer channels. Existing
  standalone rule shading is a reference, not an implementation to import.
- All backend consumers and export/picking bounds are required before shipping
  rule borders. Do not shrink the first public API PR by dropping a consumer.
- Sources: root/Core ARCHITECTURE.md and rendering.md; RuleMark; native rule
  projection/painters; WebGL rule shaders; Core WebGPU adapter; standalone
  RuleProgram and rule-definition.gpu.test.js.

## Geometry decisions to qualify

For a solid rule, the nominal shape is its finite rectangle (butt/square caps)
or capsule (round caps). Outside expansion is the Euclidean offset by the
border width. It surrounds the ends and corners as well as the sides; changing
only the centerline width is insufficient. Nominal fill stays independent.

For the initial proof, construct a nominal contour and its expanded contour.
A disjoint outside ring plus the unchanged nominal fill can represent the
required paints. Canvas must resolve them in an isolated occurrence with
additive coverage, then composite once. Ordinary source-over at an internal
antialiased edge is not the coverage equation. Test the isolated additive
candidate rather than assuming compound paths rasterize complementarily.
Keep the existing no-border fast path intact. Scratch allocation and sizing
remain a backend concern; do not retain a shape object per user datum.

SVG uses native vector contours and occurrence opacity. Retain the previously
accepted one-output-pixel internal antialiasing hairline limit; no implicit
rasterization, filters or new SVG composition experiment.

Dash contours need special scrutiny: expanded neighbors can overlap. A path
with multiple outer/inner contours is not automatically a union. Also verify
current cap/dash semantics across backends before choosing a canonical contour.
Do not silently change ordinary dashed rules to fit the border implementation.

Primary comparison sources: SVG 2 painting/stroke-shape rules
(https://www.w3.org/TR/SVG/painting), HTML Canvas
(https://html.spec.whatwg.org/multipage/canvas.html), and compositing operators
(https://www.w3.org/TR/compositing-1/). Study the contracts; copy no external code.

## Bounded qualification

Use a temporary copy of the current Core source, normal public embedding,
projection and actual Canvas/SVG/WebGPU rendering. Temporary painter/channel
changes are candidates, not a production implementation. Record their limits.

- Representative solids: all three caps; fractional placement and width;
  red fill/blue border with opaque and fractional paint opacity; zero-alpha
  stroke preserving fill; zero/nonpositive size remaining hidden.
- Dash probes: separated fragments and fragments whose outside bands overlap;
  phase and end caps. Compare ordinary unbordered output before proposing changes.
- Composition: crossing occurrences in both paint orders and common opacity.
- Numeric coverage checks at DPR 1/2; use exact horizontal rectangle area and
  existing renderer controls where appropriate. Do not hide geometric errors
  behind screenshot tolerances. Native and SDF outer-edge AA need not be
  byte-identical, but silhouette/paint and seam claims must have direct evidence.
- A bounded 1,000-rule timing check for a candidate that passes correctness:
  unchanged no-border repaint/export within max(10%, 0.2 ms) of baseline;
  provisional outlined repaint/export ceiling 2x baseline plus 1/2 ms,
  respectively. Measure warm repeated runs; do not raise a failed gate.

Stop at decisive counterexamples or a qualified candidate. Do not build a
benchmark framework, broaden into all alignment modes, or add permanent tests
before the production contract is selected.

## Delivery gate

Report the qualified geometry, falsified alternatives, actual-path results,
remaining blockers and one coherent first implementation scope/size. A proof
that fails its geometry/composition gate is not ready to become an API PR.
For a passing design, propose focused permanent regressions, docs/minor release
impact and a tentative commit: `feat(core): add outside strokes to rule bodies`.
Inside/center and shared legacy alignment normalization need their own bounded
contract decision before exposure; no temporary rule-specific vocabulary.

## Qualification result

Bounded proof complete on Chrome/Metal, DPR 1/2, six actual renderer contexts.
No production code changes. The full source candidates and numeric results are
archived outside Git at `rule-border-proof/` in this chat's artifact directory.

### Geometry and paint evidence

A one-dimensional union of equal rounded intervals constructs the native
silhouette for straight rules and their dashes. Outside expansion commutes with
union, so nominal and expanded contours can be constructed independently.
An even-odd ring is valid only after forming each union; overlapping individual
outer/hole contours are not a valid substitute. Selected wide-border probes
preserve red interiors, paint the closed gap blue, and retain a genuine gap
when the dash spacing is larger. This is promising geometry, not full renderer
qualification.

For straight horizontal edges, 24/24 numeric paint samples pass the outside
coverage equation across Canvas and WebGPU at DPR 1/2: opaque, fractional fill,
fractional stroke, common opacity, transparent stroke and subpixel border.
The oracle uses unbordered coverage from the same actual backend to avoid
assuming identical layout pixel alignment. SVG stays vector-only in its 12
representative exports and shows the already accepted internal hairline.

Canvas fails the broader strict gate: only 4/12 cap/rotation seam cases pass.
At an opaque shared edge that is fully inside the expanded contour, several
rotated or round-cap pixels have alpha 192 rather than 255. Separate paint
canvases, contour clips, and synchronous OffscreenCanvas image snapshots do not
provide a qualified solution. A pixel-readback diagnostic changes rasterization
and makes these cases appear to pass; it is explicitly rejected. Final results
contain no painter readback. Do not promote these candidates or add flush/filter
tricks, supersampling, or per-datum retained surfaces to make them pass.

The earlier Canvas rectangle PNG budget has not been relaxed. The candidate
failed correctness, so performance, crossing-order, clipping/picking expansion
and broader browser qualification were not pursued. No outline API PR is ready.

### Existing backend findings

- Native Canvas/SVG cap every dash; current WebGL/WebGPU apply caps to the whole
  ribbon and cut internal dash ends flat. Actual unbordered probes confirm the
  difference. Preserve current behavior while designing; do not silently select
  a different nominal silhouette only when a border is visible.
- For a half-physical-pixel body with an opaque four-physical-pixel outside
  stroke, WebGPU's maximum alpha is 128 rather than 255 at both DPRs. Its thin
  body compensation currently multiplies the complete result. This belongs in
  renderer coverage math, not a Core adapter opacity workaround. A fix must also
  preserve the existing no-stroke/transparent-stroke body appearance.
- WebGL butt ends use quad rasterization rather than finite SDF end coverage.
  Eight physical phase samples produce repeated coarse alpha steps; native and
  WebGPU end coverage changes at each fractional phase. MSAA supplies some
  intermediate coverage, so the current result is not strictly binary.

## Small independently useful first PR candidate

Before exposing rule borders, a bounded WebGL butt-end AA correction is a
coherent GPU geometry prerequisite and works without PR #644's API addition.
It would touch only the existing rule vertex/fragment shaders, a focused actual
rendering regression using the existing Core runner, and a patch Changeset.
Estimated runtime change: 20-40 lines; approximately 80-120 test lines. Measure
the exact diff after qualification rather than treating this as a size promise.

Scope: extend the visible quad for end AA and shade the finite butt boundary;
keep six vertices, size/thin-body policy, cap/minLength positions and dash phase.
Picking must retain its existing geometric extent and datum IDs. Preserve
round/square caps and ticks. No fill/stroke API, native painter, shared resource
or dependency changes. Tentative commit:
`fix(core): antialias WebGL rule butt ends`.

Success: actual fractional endpoint coverage at DPR 1/2 on hardware and software
WebGL, preserved neighboring cap/dash/minLength/tick/picking behavior, and no
meaningful regression against the stated no-border performance budget. This
candidate is proposed, not implemented. Native strict composition and the dash
cap parity decision remain explicit blockers for the later public border PR.

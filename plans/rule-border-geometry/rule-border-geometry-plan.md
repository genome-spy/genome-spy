# Rule border geometry: bounded design and proof

Status: bounded qualification complete; native candidate rejected; no production implementation.
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

A one-dimensional union of equal rounded intervals is a promising construction
for straight rules and positive-length dash fragments. Outside expansion
commutes with union, so nominal and expanded contours can be constructed
independently.
An even-odd ring is valid only after forming each union; overlapping individual
outer/hole contours are not a valid substitute. Selected wide-border probes
preserve red interiors, paint the closed gap blue, and retain a genuine gap
when the dash spacing is larger. This is promising geometry, not full renderer
qualification. The prototype discards zero-length painted spans: for example,
`intervals(40, 4, "round", [0, 8], 0)` returns no intervals. It therefore cannot
represent native dotted round-cap strokes. Zero-on dashes were not included in
the browser probes; the omission was confirmed directly in the interval helper,
not with an additional browser test. Do not promote the prototype as a general
dash implementation. Preserve the archived source and results as evidence of
this rejected candidate.

For straight horizontal edges, 24/24 numeric paint samples pass the outside
coverage equation across Canvas and WebGPU at DPR 1/2: opaque, fractional fill,
fractional stroke, common opacity, transparent stroke and subpixel border.
The oracle uses unbordered coverage from the same actual backend to avoid
assuming identical layout pixel alignment. SVG stays vector-only in twelve
horizontal butt-cap paint exports (six paint cases at two DPRs), which show the
already accepted internal hairline. SVG cap/rotation, dash-union and ordinary
dash-cap behavior were not tested by this runner. These exports do not qualify
SVG geometry generally.

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

- Actual unbordered probes confirm that Canvas caps every dash, whereas current
  WebGL/WebGPU cap the whole ribbon and cut internal dash ends flat. SVG 2's
  stroke-shape specification also describes caps on dashes, but the runner did
  not independently verify SVG's ordinary dashed output. Preserve current
  behavior while designing; do not silently select a different nominal
  silhouette only when a border is visible.
- For a half-physical-pixel body with an opaque four-physical-pixel outside
  stroke, WebGPU's maximum alpha is 128 rather than 255 at both DPRs. Its thin
  body compensation currently multiplies the complete result. This belongs in
  renderer coverage math, not a Core adapter opacity workaround. A fix must also
  preserve the existing no-stroke/transparent-stroke body appearance.
- WebGL butt ends use quad rasterization rather than finite SDF end coverage.
  Eight physical phase samples produce repeated coarse alpha steps; native and
  WebGPU end coverage changes at each fractional phase. MSAA supplies some
  intermediate coverage, so the current result is not strictly binary.

## Next decision for the outline work

No border implementation PR is qualified. Keep the work focused on strict
native composition: before another experiment, describe how one representation
will produce consistent shared-edge coverage for both paints, with synchronous
Canvas rendering and backend-owned resources. A single rotated solid rule with
fractional paint opacity and an opaque internal-edge check is sufficient for
its first gate. Do not recreate the six-context matrix or add more rendering
machinery before that gate passes. No new representation is currently selected;
the existing negative result stands until a concrete alternative is justified.

Only after this coverage gate passes should the work return to complete dash
geometry (including zero-on dotted patterns), occurrence order, bounds/picking,
SVG limits and performance. Existing correctness and PNG budgets remain intact.
Do not expose a partial API, change native/GPU cap semantics implicitly, or
relax strict Canvas coverage to manufacture a small PR.

## Optional independent rendering defect

WebGL's coarse butt-end coverage is a separately observed rendering defect.
A finite SDF correction could be useful independently, but the proof does not
establish it as a required prerequisite or the next step for rule outlines. It
resolves none of the native composition, dash-cap or WebGPU thin-border issues.
Do not start that fix as the default continuation of this plan. Any separate
proposal must justify its user-visible benefit and verify picking, ticks,
minLength, dash phase and performance on its own merits; no implementation or
size commitment is made here.

## Review reconciliation

Three independent reviews supported stopping the failed candidate and the
existing ownership boundaries. Applied their findings: removed the unsupported
butt-AA prerequisite and size estimate, narrowed the dash-geometry claim to the
positive-length cases actually probed, documented the dotted-pattern omission,
and stated the exact SVG test scope. The raw archived source and numeric results
remain unchanged. This is a planning/evidence correction with no release impact.

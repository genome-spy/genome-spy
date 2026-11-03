# Rule stroke alignment

## Scope and architectural fit

Follow-up to #649 (base 219355912); do not modify or push its branch. Part of
#604. RuleMark owns the grammar and resolved property, existing backend paths
own geometry/resources. No dependencies, new channels, scene graph, masks on
Canvas, or changes to points, rectangles, arrows, text or ticks.

Expose `strokeAlign: "inside" | "center" | "outside" | ExprRef` on RuleProps,
using a reusable declaration for the eventual other mark families. Default
outside. Do not advertise unsupported alignment on other marks or migrate
point inwardStroke in this slice. Existing property/config/expression machinery
remains the single source of truth.

Sources: ARCHITECTURE.md; packages/core/docs/architecture/rendering.md;
packages/core/src/marks/rule.js; rendering/{webgl,webgpu,immediate,canvas2d,svg};
packages/webgpu-renderer/src/marks/programs/ruleProgram.js; #604; maintainer
resolution in #646 comment 6604214445.

WebGPU already implements the numeric inside/center/outside contract. Wire Core
through its public rule configuration. Extend WebGL's existing ribbon coverage
with inner/fill/outer boundaries and the same premultiplied composition, keeping
common opacity outside paint overlap. Zero/transparent strokes preserve the
nominal body; oversized inside bands consume the interior without negative
geometry. Reuse the existing mark uniform and revision mechanisms.

Canvas explicitly retains its existing outside-style two-stroke approximation
for every requested alignment, including its existing visible bounds/picking.
No Canvas painter changes are needed. SVG must remain vector-only, preserving
its accepted internal antialiasing hairline exception. Proposed SVG path: nominal
fill first, centered contour stroke for center; doubled contour stroke clipped
to nominal fill for inside; existing outside mask for outside. Confirm native
contour behavior with overlapping round dash caps before selecting this path;
do not silently broaden the SVG exception. The bounded follow-up selected the
SVG-only analytic boundary of collinear dash caps in the existing rulePath
builder: merge square intervals and trace equal-radius round-cap intersections.
This is not a generic polygon union or shared geometry abstraction.

Reference design: #604's full-band width table and Ci/Cf/Co composition; existing
standalone WebGPU implementation from #615. No third-party code is introduced.

## Success criteria and verification

- Full band width w: inside (in w/out 0), center (in w/2/out w/2), outside
  (in 0/out w). Defaults and no-border/tick rendering remain unchanged.
- Parameter updates and config/property precedence use existing owners.
- GPU inside/center paint overlap preserves transparent/translucent fill and
  stroke semantics and applies common opacity once. Bounds/picking cover the
  actual outward extent; conservative culling must not hide visible borders.
- Native Canvas keeps exactly the agreed approximation; nominal size/position,
  border order and picking are unchanged. SVG preserves vector-only output and
  contour semantics, caps and dash phase within its agreed AA exception.
- Actual Core export/picking checks at DPR 1/2, using the existing
  scripts/testRenderers.mjs runner. Independent expected colors/extents at body,
  band, butt endpoints and dash cuts; thin/oversized widths; null stroke;
  reactive alignment. Reuse/extend testRuleStroke rather than another harness.
- Headless SVG contract tests for reactive alignment, width and paint order.
- Focused suites, Core types/lint/schema generation and release checks. Existing
  GPU rule tests and original outside stroke checks remain green.

## Milestones

1. Bounded native proof and independent plan review before production changes.
   Exercise actual Canvas export with inside/center requests (same raster as
   outside) and SVG contour approach including overlap. If the SVG approach
   fails, revise scope/design before implementation; no production workaround.
2. Implement one coherent rule-alignment slice across grammar, GPU adapters and
   shaders, vector SVG and conservative bounds/picking. Update rule docs and a
   separate Core minor Changeset; no other mark migration. Tentative commit:
   `feat(core): support aligned strokes on rule bodies`.
3. Verify real rendering, review final architecture and diff, reconcile and
   retire this plan before PR delivery. Show incremental size against #649;
   do not open a PR without the user's request.

## Status

- [x] Independent plan review: owner/boundary choices accepted. Reviewer caught
  internal SVG dash contours; analytic collinear boundary approved as the
  smallest vector-only correction, retaining phase and zero-on circles.
- [x] Native Canvas/SVG bounded proof in isolated /private/tmp checkout, using
  public Core embed/export at DPR 1/2. Initial center candidate exposed blue
  internal square-dash edges (expected red); analytic union removed them.
  Solid butt, overlapping square [8,2] and overlapping round [0,4] dashes
  preserve red union interiors; translucent inside/center bands blend purple.
  Round boundary samples include native antialiasing and are not treated as
  fully covered paint samples. Canvas raster arrays are identical for all three
  requested alignments. Canvas painter and its interactive cost are unchanged.
- [x] Implementation, regression coverage and documentation. Default outside;
  Core WebGPU public channel mapping; WebGL inner/fill/outer coverage and
  post-composition opacity; SVG native union boundary and inside mask. Canvas
  painter/picking unchanged. Shared immediate culling remains conservatively
  outside-sized, so native bounds cannot hide borders. No other mark changes.
- [x] Final independent review: no blocking architecture/correctness findings.
  Reviewer requested qualifying the six-pixel example as outside alignment;
  corrected. No generic geometry helper or forwarding abstraction was added.
- [x] Verification: actual Core raster/export/picking checks at DPR 1/2 pass for
  all live backends and vector SVG, including original outside regressions.
  Subpixel inside/center checks derive nominal coverage from the unoutlined
  export, avoiding assumptions about layout snapping. Original rule/tick browser
  checks and all three standalone WebGPU rule GPU tests also pass.
  312 focused tests across 29 files pass (SVG, adapter, configuration/precedence,
  Canvas picking). Core types, targeted ESLint/Prettier, schema generation,
  generated documentation type index and release checks pass. Release plan is
  a Core minor bump propagated through the configured fixed group.
- [ ] Final exact diff, commit and plan retirement before PR delivery.

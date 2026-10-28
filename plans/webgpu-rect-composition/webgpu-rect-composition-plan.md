# WebGPU rectangle paint composition

Status: implementing bounded shader correction. Branch starts at master cdb38551.
Part of #604; independently useful correction to existing centered strokes.

## Scope and architectural fit

Owner: `packages/webgpu-renderer/src/marks/programs/rectProgram.js`.
Follow repository ARCHITECTURE.md, Core rendering architecture and renderer
AGENTS.md. The experimental Core adapter remains a consumer of the same public
rectangle inputs. No Core grammar, alignment API or backend-neutral state changes.

Current `distanceToColor` replaces fill with stroke in the centered band.
Transparent stroke therefore erases nominal fill. Replace that paint resolve
with #604's nested coverage and premultiplied overlap formula, retaining the
existing rectangle distance, centered extent and renderer-owned resources.
Compose shadow behind the resolved occurrence and preserve existing semantic
scope opacity ownership. No new helpers/framework unless duplication warrants it.

One milestone: fix existing centered rectangle composition, qualify actual GPU
output and retained updates, and show the behavior in an existing rectangle
example if it cannot already be inspected. Tentative commit:
`fix(webgpu-renderer): preserve rectangle fill beneath translucent strokes`.

Non-goals: alignment options, rule/text/point/arrow changes, inwardStroke mapping,
Canvas/SVG/WebGL changes, public Core API, new dependencies, geometry rewrites,
new passes, textures, resources or per-frame allocation.

## Success criteria

- [x] With stroke alpha zero, nominal fill matches the zero-width-stroke render
  at representative edges/corners and interiors, including fractional positions.
- [x] Half-transparent centered strokes blend over original fill in the inward
  band; outward band contains only stroke. Opaque internal transitions have no
  background seam. Compare actual pixels against analytic premultiplied results
  at DPR 1/2, with at most 2/255 error per output channel.
- [x] Cover sharp and rounded rectangles, distinct corner radii, subpixel widths,
  widths exceeding the interior, transparent fill and zero-width strokes.
  Representative cases rather than a combinatorial matrix.
- [x] Existing view/scope opacity applies once; two overlapping occurrences
  retain paint order. Retained scalar/series paint updates reach visible output.
- [x] Picking retains current datum identity, geometry, threshold; test interior, stroke band and outside samples. Existing generic
  picking uses shaded alpha, including shadows. Shadow exclusion is deferred
  #604 work, not an existing contract to claim here.
- [x] Plain adjacent rectangles keep their existing edge-AA fast path and have
  no new seams. Existing shadow/hatch examples retain their intended geometry
  and appearance except the explicitly corrected translucent-paint behavior.
- [x] No extra vertices, draw calls, attachments or render-time allocations.
  Compare before/after on the same browser/device with alternating samples:
  1k and 100k plain and stroked rectangles, DPR 1/2. Investigate a median increase
  exceeding max(10%, 0.2ms); do not expand architecture to meet a noisy sample.
- [x] Five focused GPU tests run without skips; renderer unit tests, types and lint
  pass. Storybook build and built Basic-story smoke pass. CI is a delivery gate
  before merge, not run yet because this branch has not been pushed.

## Boundaries and gates

Hatching currently modifies the distance before paint resolution; shadows use
stroke width and background coverage. Trace those two interactions before coding.
If correct composition requires redesigning hatch geometry, shadow semantics or
picking policy, stop and revise scope rather than silently adding those features.
First add a focused failing actual-renderer regression for transparent stroke;
then implement the smallest shader correction and qualify neighboring cases.
No shader-string assertions or tests duplicating shader code as their oracle.

Estimated delivery: 3-6 files, 20-60 changed production lines and 120-250 test
lines, target <=300 added raw lines excluding this temporary plan. This is a
review budget, not a measured diff. Report exact size before opening the PR;
re-scope first if production changes exceed 60 lines or delivery exceeds 300.
Update renderer MIGRATION_PLAN.md with the completed bounded outcome. Unpublished
renderer-only work needs no release fragment; verify release policy at delivery.
Keep #604 open and make remaining alignment/backend work explicit in PR notes.
Retire this plan under the planning skill before merge.

Reproduction: actual GPU DPR 1/2 tests fail against master with up to 255/255
fill loss under transparent strokes. Hatching requires separate nominal-fill
and stroke-band distances; retain its existing geometry and stroke placement.

## Implementation outcome

Minimal correction stays in the existing paint helper: nominal fill distance
is retained before hatch cuts, stroke resolves over fill, and the combined paint
resolves over the existing shadow background. Geometry, fast-path selection,
resources, drawing and picking code remain unchanged. Generic alpha-based picking
now correctly sees the restored fill beneath a transparent stroke. Existing
shadow-only picking remains a documented follow-up. No dependencies changed.

The existing Basic story animates stroke opacity alongside width and corners.
Permanent tests cover DPR 1/2, whole-image transparent-stroke equivalence (maximum
observed rounding error 1/255; tolerance 2/255), analytic sharp and circular-corner
paint samples, transparent fill, hatch paint, scoped opacity, retained scalar
and series updates, overlap order, picking and visible shadow. Existing adjacent
rectangle/group and large-index picking regressions also pass. Remove the old
shader-string specialization assertion: real GPU tests now cover plain and
retained decorated paths, while unit tests retain configuration-mode contracts.

Performance: Chrome 156, 800x400, five warmups/30 alternating paired samples,
CPU submission through GPU completion. 1k plain/stroked medians unchanged at
0.5ms (DPR 1) and 0.7/0.8ms (DPR 2). 100k plain medians 2.3->2.3ms / 2.7->2.8ms;
stroked medians 1.8->1.9ms / 2.2->2.2ms. All deltas satisfy the stated budget.
These are same-machine samples, not cross-driver guarantees. Disposable runners,
baseline source, results and screenshot: /private/tmp/genomespy-rect-proof/.

Release assessment: unpublished renderer only, no fragment needed. release:check
passes; existing master fragments schedule the eight-package fixed-group minor.
No public Core API, alignment or other-backend promise is made by this PR.

Implementation committed in two focused commits. Exact delivery diff against
master cdb38551: five files, +264/-35 raw lines. Non-comment runtime source and
example: +13/-6 (net +7). This temporary plan is additional to delivery size.
Pending delivery: obtain review and report size before opening a PR.
Retain this plan for draft discussion; reconcile and remove it before merge.

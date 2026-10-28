# WebGPU rectangle paint composition

Status: completed and approved for merge, 2026-10-28. Branch starts at master cdb38551.
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
- [x] Existing view/scope opacity and minimum-size fading each apply once; two overlapping occurrences
  retain paint order. Retained scalar/series paint updates reach visible output.
- [x] Picking retains current datum identity, geometry, threshold; test interior, stroke band and outside samples. Existing generic
  picking uses shaded alpha, including shadows. Shadow exclusion is deferred
  #604 work, not an existing contract to claim here.
- [x] Plain rectangles keep their unchanged edge-AA fast path. Existing tests
  qualify group opacity and an isolated retained edge, not visible adjacent seams.
  Shadow-overlap and hatch-paint samples qualify the corrected paint behavior.
- [x] No extra vertices, draw calls, attachments or render-time allocations.
  Compare before/after on the same browser/device with alternating samples:
  1k and 100k plain and stroked rectangles, DPR 1/2. Investigate a median increase
  exceeding max(10%, 0.2ms); do not expand architecture to meet a noisy sample.
- [x] Five focused GPU tests run without skips; renderer unit tests, types and lint
  pass. Storybook build and built Basic-story smoke pass. All three CI checks
  passed on 0fdb66fd; repeat for the plan-removal head before merge.

## Boundaries and gates

Hatching currently modifies the distance before paint resolution; shadows use
stroke width and background coverage. Trace those two interactions before coding.
If correct composition requires redesigning hatch geometry, shadow semantics or
picking policy, stop and revise scope rather than silently adding those features.
First add a focused failing actual-renderer regression for transparent stroke;
then implement the smallest shader correction and qualify neighboring cases.
No shader-string assertions or tests duplicating shader code as their oracle.

Estimated delivery: 3-6 files, 20-60 changed production lines and up to 290 test
lines, revised target <=320 added raw lines excluding this temporary plan. This is a
review budget, not a measured diff. Report exact size before opening the PR;
re-scope first if production changes exceed 60 lines or delivery exceeds 320.
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
rectangle/group and large-index picking regressions also pass; the latter
verifies datum identity rather than visible seam pixels. Remove the old
shader-string specialization assertion: real GPU tests now cover plain and
retained decorated paths, while unit tests retain configuration-mode contracts.

Final review-fix performance: Chrome 156, 800x400, five warmups/30 alternating
paired samples, CPU submission through GPU completion. 1k plain/stroked medians
0.4/0.5ms unchanged at DPR 1; DPR 2 plain 0.4->0.5ms and stroked 0.4ms unchanged.
100k plain medians 1.9->2.0ms / 2.1->2.1ms; stroked medians 1.7->1.7ms /
1.7->1.8ms. All deltas satisfy the stated budget.
These are same-machine samples, not cross-driver guarantees. Disposable runners,
baseline source, results and screenshot: /private/tmp/genomespy-rect-proof/.

Release assessment: unpublished renderer only, no fragment needed. release:check
passes; existing master fragments schedule the eight-package fixed-group minor.
No public Core API, alignment or other-backend promise is made by this PR.

Original implementation is in two focused commits. Review-fix delivery diff
against master cdb38551: five files, +312/-38 raw lines. This temporary plan is
additional to delivery size. Runtime additions remain limited to the existing shader and example.
Both Sol reviewers re-reviewed the correction and report no remaining blockers.
Delivery size was reported before PR #621 opened; recording is attached.
Maintainer accepts the result and requests WebGL in a separate PR. User explicitly
authorizes cleanup and merge. All implementation tasks are complete. Remaining
Core/alignment/backend/shadow-picking work is deferred from this slice, not an
unfinished PR task. Remove this reconciled plan in the next commit, then await
cleanup-head CI and merge. The WebGL follow-up and point plan remain separate.

## Review correction

Both Sol reviewers confirm architectural fit and identify minimum-size fading
as a blocker. Carry opaFactor separately from paint alpha, multiply the resolved
fill/stroke once, then composite the existing shadow behind it. Preserve the
plain path's fade and shadow treatment. GPU regressions fail before the change
and pass after it for minWidth and minHeight at DPR 1/2. Retained series coverage
now updates stroke paint on decorated geometry; shadow overlap is checked against
its actual shadow-only background. Tighten adjacent-seam claims rather than
claim unperformed qualification. Budget rises from 300 to 320 added raw lines
for this review correction and focused proof, with no feature/API expansion.
Final checks pass: five GPU tests (zero skips), 313 unit tests, renderer types
and lint, Storybook build and release policy. Bounded performance also passes.
The corrected built Basic story is smoke-tested before committing.

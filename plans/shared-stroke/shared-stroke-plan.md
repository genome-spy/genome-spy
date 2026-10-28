# Shared rule paints: PR #615 review reconciliation

Status: maintainer requests implemented and locally verified, 2026-10-28.
No new dependencies. The user authorized combining solid and dashed work in
#615, with exact size reported before pushing. The separate dash-plan branch
and disposable prototypes remain historical reference, not another delivery PR.

## Architecture and corrected geometry

Follow `ARCHITECTURE.md`, Core's rendering architecture and renderer AGENTS.md.
Geometry, interval textures, shaders and picking remain renderer-owned. Core
only maps its existing rule/tick color encoder to fill. No Core grammar, CPU
scene graph, per-datum dash expansion, new pass or resource lifecycle is added.

The maintainer identifies hard butt clipping as a bug. The 54-vertex perimeter
mesh and its exact legacy-pixel gate are discarded. All rules use six vertices
and true signed distance to finite rectangles or clipped round capsules.
Distance offsets round convex corners consistently, including cap/dash cuts.
A flat span avoids endpoint drift from summing interpolated distances. Periodic
lookup canonicalizes a wrapped phase that rounds to its period back to zero.

Existing paints, size as body thickness, per-paint/common opacity, alignments,
retained inputs, occurrence order and shared picking follow #604. Transparent
strokes reveal the corrected nominal SDF fill. Hard butt/dash boundaries now
have antialiased coverage. Zero/negative sizes and all-off patterns stay hidden.

Dash data remains one immutable program-owned integer texture. Two neighboring
finite intervals are necessary when a containing interval clips empty at an
exact endpoint. A short decoder owns its byte layout. Maximum-period 256 is
stored correctly instead of wrapping a byte to zero. The bounded maximum atlas
is 525,312 bytes rather than 65,792; no pattern data is rebuilt per frame.

## Review requests and synchronization

- [x] SDF butt ends and simpler vertices (`discussion_r4398512480`). Commit
  `12d99413`; replace hard-clipping expectations with analytic SDF samples.
- [x] Dashed borders instead of rejection (`discussion_r4398542914`). Commit
  `e77b4c82`; qualify all finite cuts using the same distance/composition path.
- [x] Combined controlled story (`discussion_r4398568005`). Commit `91052bad`;
  one retained mark exposes paint, width, cap, alignment, dash and phase controls.
- [x] Two independent Sol reviews of the combined implementation. Fix their
  standalone cleanup finding, verify control redraws through the real UI, and
  close dashed conditional/scalar/placement coverage gaps. Final geometry
  review finds no concrete issue in the flat-span, wrap or zero-border fast path.

The old dash proof's nominal-pixel contract is superseded. Its representation
was requalified against independent SDF contours. No miter-limit API or generic
geometry machinery is introduced. Existing shader-string tests are removed;
CPU wire-contract tests and actual renderer output cover the relevant behavior.

## Verification and limits

- [x] 314 renderer unit tests and 74 Core adapter tests.
- [x] Four actual GPU tests, zero skips, DPR 1/2: antialiased butt/cap boundaries,
  all alignments, thin/nonpositive sizes, translucent/common paint opacity,
  transparent strokes, acute clipped-cap distance, finite dashes, retained
  scalar/series phase/pattern changes, selection-driven stroke paint, crossing
  order, clamped placement/clipping and border/gap picking.
- [x] Independent external contour matrix: 219 occurrences × 72 variants =
  15,768 comparisons, zero failed cases, maximum error 1.167/255. Construct the
  oracle from actual f32 input coordinates. Adaptive subdivision bounds arc
  chord error, not universal post-clipping error near tangency. The analytic
  acute-cut fixture independently fixes the required corner-distance contract.
- [x] Workspace types; renderer lint, package build/tree shaking/packing;
  Storybook build; real controls change rendered pixels; standalone Rules →
  other example switching releases resources without errors.
- [x] Release checks. No new fragment for unpublished renderer/experimental
  adapter work. Existing master fragments already schedule a fixed-group minor.
- [x] Report exact size, push review commits and update PR metadata.
- [x] All three CI checks passed on `61b77790`. Maintainer approved on
  2026-10-28: "LGTM. Feel free to merge."
- [x] Reconcile this plan for retirement. Remove it in the next commit before
  merging; the user explicitly authorized cleanup and merge.

Final bounded timing, Chrome 156 / Apple Metal-3, CPU submission through GPU
completion, five warmups/30 paired samples: solid 100k DPR-2 borders improve
16.2 → 2.5ms median. Corrected unbordered SDF costs 2.3ms vs old hard clipping's
1.7ms in that stress scene. Dashed 100k DPR-2 borders measure 3.0ms; the 1k
representative scene is 0.4–0.6ms. These are bounded samples, not cross-driver or
all-workload guarantees. Source/runner/results/recording stay outside Git in
this chat's `gpu-rule-review615/` artifacts.

Combined delivery against `origin/master`: 16 files, +817/-159 raw lines
(net +658), excluding this plan. Tests and type smoke account for 505 added
lines. Non-comment runtime including examples/stories is +243/-119 (net +124);
production source alone is +152/-95 (net +57). The former solid-only 500-raw-line
allocation is superseded by the explicitly combined review scope; runtime
remains within 250 added non-comment lines. Report the plan's additional size
separately before pushing. No unrelated features or dependency changes.

Full #604 Core grammar, inwardStroke mapping, scales/legends, WebGL/native parity,
other filled families, schema/docs and eventual Core minor release remain deferred.
This PR does not complete those requirements.

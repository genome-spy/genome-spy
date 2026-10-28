# Shared rule paints: PR #615 review reconciliation

Status: addressing maintainer review, 2026-10-28. No new dependencies.

## Corrected architecture and geometry

The maintainer identifies hard-clipped butt ends as a bug, not compatibility to
preserve. Discard the 3x3 perimeter mesh and its 54 vertices. Use six vertices
and signed-distance coverage at every finite rule boundary, including butt ends.
Keep geometry/shaders/resources in the existing renderer; Core only translates
its existing rule/tick color encoder to fill. No new Core grammar or framework.

Existing paint channels, size as body thickness, separate paint/common opacity,
alignment extents, retained inputs, occurrence order and shared picking still
follow #604. Transparent strokes preserve the corrected nominal SDF fill, not
legacy hard-clipped pixels. Square/butt rectangles and round capsules use true
signed distance; outside offsets round convex corners consistently.

## Review requests and synchronization

- [ ] Replace the mesh with an antialiased SDF body and simplify vertex handling
  (`discussion_r4398512480`). Replace regressions that enshrine hard clipping.
- [ ] Implement dashed borders instead of rejecting them (`discussion_r4398542914`).
  Incorporate the separately proven immutable interval representation only after
  requalifying it against corrected SDF nominal coverage. Old exact-baseline
  pixel gates are superseded; all geometry must use the same distance contract.
- [ ] One combined Rules story with controls for paints, alignment, caps, dashes
  and phase (`discussion_r4398568005`). No separate solid/dashed demo handles.

The user authorized combining solid and dashed renderer work in #615.
Report the revised exact size before pushing the combined scope. Keep the dash-plan branch and its evidence as reference.

The earlier two-Sol dash review found the atlas ownership/size reasonable. Before
using that proof as a gate, make the runner reject nonzero failure counts, bound
oracle precision, and add an analytic acute cap/dash-cut case. Document the
selected Euclidean offset/join contract, interval layout and two-neighbor need;
keep a short authoritative interval decoder in the existing dash WGSL module.
No miter-limit API or generic geometry machinery is justified.

## Delivery gates

Use actual GPU readbacks and picking: antialiased butt ends, all caps/alignments,
thin/nonpositive sizes, translucent paints/common opacity, transparent strokes,
finite/partial dashes, acute cuts, phase/pattern and conditional input updates,
crossings, placement/clipping/zoom and the maximum-period correction. Test the
corrected shape contract; do not keep assertions for the rejected hard clipping.
Run focused units/GPU, workspace types/lint, builds, interactive story smoke,
performance through GPU completion, release assessment and exact diff counts.

The previous 500-added-line delivery budget and PR metadata must be reconciled
with the accepted scope before pushing. Keep commits focused and reversible.
This is unpublished renderer/experimental adapter work; no release fragment is
expected. Reassess the actual final diff. Temporary plans must be reconciled,
committed and removed in a later commit before merge.

Full #604 Core grammar, legacy inwardStroke mapping, scales/legends, WebGL/native
parity and other filled families remain deferred. This PR does not complete them.

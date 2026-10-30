# WebGL arrow paint composition

Status: bounded correctness/performance proof passes on fresh master e0571a73.
Implementation, focused checks and two independent reviews complete; no PR opened.
Part of #604, following WebGPU arrow #625. No new dependencies. Squash merges.

## Architecture and outcome

ARCHITECTURE.md routes this correction to Core's rendering architecture.
Semantic ArrowMark owns encoders/configuration; the private WebGL arrow delegate
owns its fragment shader and resources. Existing arrow.vertex.glsl supplies
premultiplied fill/stroke paints; arrow.fragment.glsl owns the union distance.
Use #604's Ci/Cf/Co paint resolve locally in that fragment shader. Keep the
width-zero path. Do not change common.glsl: other mark consumers are separate.
No new grammar, alignment property, CPU geometry, draw, buffer or abstraction.
Core ArrowMark, delegate ownership, occurrence order and disposal stay intact.

Preserve finite open-head arm polygons and size-derived thickness, holes,
placement, repetition, directions, caps/notches, minimum-size/stem constraints
and every vertex calculation. WebGL's existing geometric d<halfStroke picking
policy differs from WebGPU's shade-alpha test; retain it and original datum IDs.
Do not copy the WebGPU picking policy or promise identical fringe paint bytes.
Common opacity is currently folded into both paints upstream. Its normalization
is a separate #604 task, not part of this local correction.

## One small delivery milestone

Fix centered arrow paint beneath translucent/transparent strokes using existing
negative-inside logical-pixel distance. Derive Ci=coverage(-d-halfWidth),
Cf=coverage(-d), Co=coverage(halfWidth-d); combine premultiplied paint with
Ci*F + (Cf-Ci)*(S+(1-S.a)*F) + (Co-Cf)*S. This is the issue's reference formula;
no external implementation is copied.

Provisional delivery: four files, <=250 added raw lines excluding this plan:
local arrow fragment, one focused actual-Core browser regression, affected
arrow shader snapshot entries, and one Core patch Changeset. Inspect snapshot
impact before committing to that budget. Prefer representative cases over a
configuration matrix. Use an existing arrow example for browser smoke; no new
showcase/control framework. Tentative commit: fix(core): preserve WebGL arrow
fill beneath translucent strokes. No dependency on pending point PR #624.

## Proof and success criteria

- [x] Public Core embed -> live WebGL draw -> framebuffer readback; baseline
  and browser-only candidate use actual compilation/submission, DPR1/2 on
  hardware Metal and software SwiftShader. No repository shader edits in proof.
- [x] Independent thin/wide stem color oracles, both paint opacities and empty
  fill, <=2-byte tolerance. Width-zero and transparent stroke preserve nominal
  fill in stable geometry; compare RGBA images, not shader source text.
- [x] Triangle/open heads, positive interior hits and clear hole/outside misses;
  forward/reverse/both directions, stable repeats and clipped/outside placement.
  Verify datum identity and unchanged supported geometric picking behavior.
- [x] Representative live parameter/data updates, overlap order, clipping and
  zero-length culling use actual render/pick paths. Keep existing geometry limits
  explicit instead of adding opacity-dependent geometry workarounds.
- [x] Bounded same-device timing: 1k/100k arrows, triangle/open, width0/1,
  DPR1/2; five warmups/30 alternating pairs, actual draw through synchronous
  framebuffer completion. Investigate increases above max(10%,0.2ms).
- [x] Preserve point/rectangle outputs: no shared helper, vertex or other-mark
  edits. Inspect composed shader snapshots for unrelated changes.

Tightly packed repeat layout already depends on stroke width in WebGL as in
WebGPU. Keep its stable-spacing transparency proof and characterize the limit;
do not claim full nominal-geometry independence for that case. Geometric picking
has a preexisting AA-fringe limitation; test positive interiors and clear misses.
No new alignments, common-opacity fix, native/text work or resource changes.

## Delivery gates

Review the bounded evidence and scope before production implementation. Then
add a focused regression that fails master, implement the local resolve, run
relevant Core shader/arrow tests, browser checks on both backends, types, lint,
Core build and release validation. Use planning/delivery/release skills. Preserve
meaningful existing tests; do not add source-text assertions or duplicate the
entire proof in permanent tests. Independent implementation reviewers are run
when requested. Show exact diff before opening a PR. Keep plan updated in draft
review, reconcile and retire it before squash merge.

## Bounded proof results (2026-10-30)

The browser-only candidate changes the local fragment resolve by +10/-7 lines.
Public Core embed, production shader generation and actual WebGL submission are
used throughout; only the arrow fragment module is intercepted for the candidate.
At that proof stage, production files on disk were unchanged. No geometry or
picking branch is edited by the candidate.

Hardware Metal/Apple M5 and software SwiftShader, DPR1/2: all 24 independent
premultiplied color samples match the thin/wide stem oracles exactly (<=2-byte
budget). Baseline fails those paint expectations. Transparent width4 preserves
width0 fill within the byte budget in stable geometry. Width0 image hashes and
opaque alpha support match baseline for triangle, forward/reverse/both open,
stable repeated and outside-head controls. Positive original IDs and clear empty
centers/outside probes pass. Live parameter/data replacement preserves the new
record ID; a zero-length replacement is empty and unpickable.

Two adjacent views verify actual clipping: overlapping arrows end beyond the
first view, but its neighbor remains transparent. Reversing dataset order changes
both the top color and picked ID as expected. These checks pass for baseline and
candidate on both backends/DPRs. A near-boundary reverse-head probe legitimately
enters the painted stroke at width1 on DPR1; the explicit clear-miss control uses
the empty center instead of asserting that real stroke coverage must stay empty.
Tight repeated-head spacing still changes nominal layout with stroke width;
transparent candidate-vs-width0 differences are 255, matching the existing limit.
No opacity-specific layout workaround is proposed. No browser/WebGL errors.

All 16 hardware paired performance cases meet max(10%,0.2ms), using five warmups
and 30 alternating pairs. Actual Core renderAll submits draws (verified) through
synchronous 1-pixel framebuffer readback; prior GPU work is drained first. At
100k arrows/DPR2/width1, triangle 5.3->5.5ms and open 5.4->5.6ms; largest median
increase is about .2ms. These are single-device/browser measurements, not a
cross-driver throughput guarantee. Software WebGL qualifies correctness only.

The four-file/<=250-added-line delivery target remains provisional until the
permanent browser test and snapshot diff are measured. Add a Core patch fragment
for implementation; this plan-only contribution has no release impact. The
runtime correction is independently useful and does not require pending #624.
Proof runners, candidate, raw buffers and JSON evidence are retained outside Git
in chat-local webgl-arrow-proof/. Review this plan/proof before production edits.

## Implementation checkpoint

The final 212-line browser regression fails master at DPR1/2 (64-byte channel
error) and passes the local correction: independent thin/wide colors, separate
paint opacities, transparent filled/open-head images and open-head interior,
hole and outside IDs. It uses public Core embed, live parameter updates and
submitted framebuffer readback. Keep the broader proof matrix outside Git.

All 35 focused arrow/generated-shader unit tests pass. Exactly two arrow snapshot
entries change; point/rectangle snapshots, shared helper, vertex and picking code
are untouched. Runtime is +10/-7; the complete delivery target is four files,
+249/-21 raw lines (212 browser, 20 snapshot, 10 shader, 7 patch note additions).
Types, lint, Core build, release validation and existing-example smoke pass.

## Final delivery qualification

The committed runtime matches the bounded candidate byte for byte. Permanent
SwiftShader browser regressions pass at DPR1/2, including asserted 64x64/128x128
backing sizes. Match existing per-DPR browser launch configuration: context-only
DPR emulation does not set native ResizeObserver device-pixel boxes correctly.
All 35 focused unit tests pass; exactly two arrow snapshots change. Existing
arrow-playground and arrow_direction examples pass the standard Core smoke check.

Core types, production bundles, schema/declaration build, targeted lint,
formatting and release validation pass. The initial FigWig type errors came from
installed 0.1.0 versus locked 0.2.3; restoring the existing lockfile installation
cleared them. No dependency, package or lockfile edits are included. The patch
fragment covers this Core fix; unrelated fragments retain the aggregate minor
release. No additional benchmark or custom framework is added to the repository.

Exact delivery: four files, +249/-21 raw lines, net +228. Runtime +10/-7;
212-line browser regression, two snapshot updates +20/-14, seven-line patch note.
The temporary plan is separate. Retire it before squash merge. Common opacity,
tight repeat layout and aligned stroke APIs remain explicit #604 follow-ups.
Two independent Sol implementation reviews found no actionable issues. No PR opened.


## Independent implementation reviews

Architecture/simplicity and rendering-correctness reviewers both inspected
e0571a73..6ac7ecf2 and reported no actionable findings. Native fragment ownership,
open-head geometry, size-derived arm thickness, the width-zero path and geometric
picking remain intact. No dependency, shared-helper, vertex or other-mark changes
were found. The correctness reviewer independently passed all 35 focused unit
tests and both actual WebGL browser tests at DPR1/2, including physical backing
sizes, paint pixels, transparent images and original-ID arm/hole/outside probes.
Saved hardware/software proof and timing evidence were reviewed; no benchmark
was repeated. No production edits were needed following review. Plan retirement
before squash merge remains required.

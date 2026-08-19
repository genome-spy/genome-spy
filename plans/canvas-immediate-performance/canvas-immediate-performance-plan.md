# Canvas Immediate-Mode Performance Plan

## Status

In progress. Steps 1–5 are complete; Steps 6–7 have not started.

## Background

The Canvas2D renderer projects mark instances on the CPU whenever zooming or
panning changes a scale domain. Profiling the Canvas-rendered MSA example
(`examples/docs/examples/genomic-data/msa.json`) shows that native Canvas paint
calls are not the main bottleneck at its initial zoom level. Most sampled time
is spent repeatedly resolving mark properties and repeating projection setup
inside datum loops.

The example expands to about 143,900 rows. A representative automated
zoom-and-pan profile took about 12.2 seconds of main-thread time and attributed
substantial self time to `propertyCoalescer.get`, `encodePosition`,
`encodeNumber`, `projectRange`, dynamic `Rectangle` accessors, and
`scaleIndex`. Font-family formatting was also repeated for every visible text
instance.

These costs are mostly invariant within one mark traversal. They should be
resolved once at the traversal boundary while preserving the current
Canvas2D/SVG shared immediate-mode architecture.

## Goals

- Remove per-instance `propertyCoalescer` access from the text rendering hot
  path.
- Construct Canvas font-family and font-style state once per text-mark
  traversal, changing `context.font` only when encoded size changes.
- Prepare coordinate and positional-encoding state once per profiled text/rect
  traversal instead of rediscovering scale type, band placement, and dynamic
  layout coordinates for every datum.
- Reprofile after projection preparation and simplify repeated `scaleIndex`
  arithmetic only if it remains material.
- Hoist genuinely constant numeric encoders used by the profiled text and rect
  paths when this can be done locally and clearly.
- Preserve identical Canvas2D and SVG geometry, culling, layout, and paint
  semantics.
- Demonstrate a material reduction in MSA zoom/pan JavaScript time without
  substantially increasing production-code complexity.

## Non-goals

- Do not add a CPU-side x index, visible-range data slicing, persistent
  per-datum caches, or data reordering.
- Do not change WebGL rendering or move WebGL code out of marks.
- Do not add picking to Canvas2D.
- Do not load web fonts or change the A-Frame/native-font metric relationship.
- Do not redesign `propertyCoalescer` globally. Hot renderers should stop
  consulting it per datum; unrelated call sites may continue using it.
- Do not introduce a generalized renderer execution plan, invalidation graph,
  cache registry, or new class hierarchy.
- Do not add setter-invalidated coefficient caching to `scaleIndex` without new
  profiling evidence after projection preparation.
- Do not add a permanent browser benchmark harness unless manual measurements
  prove too unstable to guide the work.

## Key decisions

### Resolve invariants at traversal boundaries

Mark properties, current layout coordinates, current scale coefficients, and
constant encoder values may change between renders but remain stable during a
single synchronous mark traversal. Resolve them once immediately before the
datum loop. Do not persist them on marks or add invalidation machinery.

### Keep shared projection backend-neutral

Projection preparation belongs in `rendering/immediate/markEncoding.js` and
may be used by both Canvas2D and SVG. It must not import either backend. Keep at
most one small prepared-axis record or closure and use it in applicable
immediate-mark visitors. Keep the existing helpers for non-mark cold callers,
including SVG legend gradients.

### Profile before changing scaleIndex

Prepared projection should first remove the extra per-datum `step()` and
`bandwidth()` queries made by `encodePosition`. Reprofile after that change. If
`scaleIndex` remains material, first apply the smallest local optimization:
calculate `step` once inside each scale-function call and reuse it for start and
bandwidth arithmetic. Do not add persistent coefficients or setter invalidation
unless that simpler change is still insufficient and separately justified.

### Prefer local specialization over a framework

Use encoder metadata such as `encoder.constant` only where profiling shows a
hot repeated read. A scalar and an explicit branch are preferable to a generic
memoization layer. Do not cache data-dependent color, text, or positional
results across frames.

### Treat simplicity as an acceptance condition

- Add no new production class and preferably no new production module.
- Allow at most one small shared projection-preparation abstraction, scoped to
  applicable immediate-mark visitors.
- Remove callback indirection when possible.
- Measure production line count before and after every step. Any meaningful
  net growth must be justified by deleted repeated work and clearer ownership.
- Reject a profile-driven optimization that is not visible in repeated
  profiles. A user-requested consistency migration may instead be accepted
  when it reuses the existing abstraction, removes per-datum setup or
  allocation, and keeps the datum loop easy to follow.

## Alternatives considered

### CPU x index

Restricting traversal to the visible x range could provide the largest MSA
speedup, but it changes data access and indexing ownership more broadly. It is
explicitly deferred.

### Flatten all mark properties at construction

Replacing `propertyCoalescer` globally would affect configuration defaults,
dynamic getters, expressions, and WebGL initialization. The focused traversal
snapshot removes the measured cost with much less risk.

### Persistent prepared-render state

Caching prepared state on marks would require invalidation for scale, layout,
parameter, configuration, and font changes. Per-traversal preparation is cheap,
explicit, and cannot become stale.

### Persistent scaleIndex coefficients

Recomputing cached coefficients from every scale setter could eliminate one
remaining division per encoded position, but it broadens state semantics and
may conflict with accidental in-place mutation of the array returned by
`range()`. Prepared projection and a local common-subexpression reduction are
simpler first steps. Persistent coefficient caching is deferred unless a later
profile justifies it.

### Per-datum encoded-value caches

Caching stable paint and geometry values could avoid more encoder work, but it
would duplicate graphics-data lifecycle concerns and require invalidation.
This plan only hoists values already declared constant across data.

## Review and commit protocol

Each numbered step is a hard gate:

1. Implement only that step and run its focused tests and measurements.
2. Ask a fresh subagent to review correctness, KISS, naming, dependency
   direction, production line growth, and possible simplifications.
3. Commit the reviewed primary change with the tentative Conventional Commit
   message or a justified refinement.
4. Apply only review fixes that improve correctness or simplicity, verify them,
   and commit them separately.
5. Proceed to the next step only after the primary and any review-fix commits
   are complete.

## Implementation steps

### Step 1: Hoist text-mark and Canvas font state

#### Intended outcome

- Extend the already-resolved text-property record with alignment and baseline
  so `visitTextInstances` never reads them through `mark.properties` inside the
  datum loop.
- Require both Canvas2D and SVG to consume the resolved alignment and baseline.
- Snapshot Canvas font family, style, weight, alignment, and baseline once per
  `renderTextCanvas` call.
- Build a font shorthand only when the encoded size changes.
- Remove the per-instance `setFont` callback and the per-instance fill-style
  setter callback; keep the state-change checks direct and readable.
- Preserve the shared native font fallback and sequence-logo baseline behavior.

#### Affected areas

- `packages/core/src/rendering/immediate/marks/text.js`
- `packages/core/src/rendering/canvas2d/renderers/text.js`
- `packages/core/src/rendering/svg/renderers/text.js`
- Focused Canvas2D, SVG, and native-text tests

#### Verification

- Focused Canvas2D and SVG text suites.
- A recording-context regression check that identical text sizes cause only one
  Canvas font assignment. Do not add production instrumentation or permanent
  proxy getter-count tests.
- Real-browser MSA profile using the same zoom/pan gesture sequence; confirm
  `propertyCoalescer.get`, `createNativeFontFamily`, and `formatFontFamily` are
  absent or negligible under the text datum loop.
- `git diff --stat`, lint, formatting, and minimal-bundle verification.

#### Documentation or migration work

None. Rendering behavior and public APIs remain unchanged.

#### Tentative commit

`perf(core): hoist Canvas text state`

### Step 2: Hoist constant text and rect encoders

#### Intended outcome

- Evaluate constant encoders once per traversal when they are otherwise read
  for every row before culling.
- Initially limit this to text `size`/`angle` and rect
  `strokeWidth`/`fillOpacity`.
- Keep paint-only opacity encoders unchanged unless later profiling still shows
  them as material.
- Prefer a few local scalars and explicit branches over a generic encoder cache
  or reader framework.

#### Affected areas

- `packages/core/src/rendering/immediate/marks/text.js`
- `packages/core/src/rendering/immediate/marks/rect.js`
- Focused immediate, Canvas2D, and SVG renderer tests

#### Verification

- Behavior tests for both constant and data-dependent variants of each selected
  encoder, including changes between separate renders.
- Repeat the MSA profile and confirm targeted `encodeNumber` work is reduced
  without increasing visitor complexity or overall duration.
- `git diff --stat`, focused tests, lint, and formatting.

#### Documentation or migration work

None. Encoder semantics and public APIs remain unchanged.

#### Tentative commit

`perf(core): hoist constant immediate encoders`

### Step 3: Prepare text/rect projection once per traversal

#### Intended outcome

- Materialize current coordinate origin and span once for each mark traversal.
- Prepare primary/secondary position encoding, band adjustment, and constant
  offsets once per axis.
- Make the datum loop perform only the data-dependent encoder call and simple
  projection arithmetic.
- Use the prepared path only in text and rect. Keep existing range helpers for
  cold marks and SVG legend gradients rather than broadening the refactor.
- Require this abstraction to earn its added surface through a repeatable
  targeted profile reduction.

#### Affected areas

- `packages/core/src/rendering/immediate/markEncoding.js`
- Text and rect immediate mark visitors
- Focused immediate, Canvas2D, and SVG renderer tests

#### Verification

- Add a small focused `markEncoding` projection suite covering continuous,
  band, point, index, and locus scales; primary/secondary offsets; reversed
  ranges; custom `band`; and constant/data-dependent encoders.
- Focused Canvas2D and SVG mark suites to prove shared geometry is unchanged.
- MSA profile confirming reduced `encodePosition`, `encodeNumber`,
  `projectRange`, dynamic `viewCoords`, and rectangle/text visitor self time.
- Inspect generated/structured SVG tests for unchanged output.
- `git diff --stat`, lint, formatting, full unit suite, TypeScript check, and
  minimal-bundle verification.

#### Documentation or migration work

Update `packages/core/src/rendering/README.md` only if the shared immediate-mode
boundary needs clarification. No public migration is expected.

#### Tentative commit

`perf(core): prepare immediate mark projection`

### Step 4: Conditionally simplify scaleIndex arithmetic

#### Intended outcome

- Reprofile after Step 3 and retain this step only if `scaleIndex` application
  remains a material hot spot.
- Compute `step` once within `scaleFunction` and reuse it for start and signed
  bandwidth arithmetic.
- Avoid persistent coefficient state, setter invalidation, or API changes.
- Mark this step discarded if the targeted saving is no longer measurable or
  the local rewrite does not improve the repeated profile.

#### Affected areas

- `packages/core/src/genome/scaleIndex.js`
- Existing and focused `scaleIndex` tests

#### Verification

- Scale tests covering setter-based mutations of domain, range, padding, and
  alignment; reversed ranges; scale application and inversion; bandwidth; and
  `copy()`.
- Repeat the MSA profile and confirm `scaleFunction`/`getStep` self time drops
  repeatably without an overall regression.
- Measure production line-count change and retain only the local arithmetic
  simplification.

#### Documentation or migration work

None. The scale API and numerical semantics remain unchanged.

#### Tentative commit

`perf(core): simplify index scale arithmetic`

### Step 5: Reprofile and identify remaining work

#### Intended outcome

- Compare at least three identical MSA zoom/pan profiles before and after the
  complete change and report medians.
- Confirm that remaining dominant costs are genuinely data-dependent work or
  native painting rather than repeated traversal setup.
- Confirm that each prior review gate already removed optimizations that did
  not produce a repeatable targeted improvement or that harmed readability.
- If final profiling reveals another worthwhile code change, add a new numbered
  implementation step and run the full review/commit gate instead of changing
  code during this measurement step.

#### Affected areas

- This plan file for measurements and follow-up scope

#### Verification

- Treat a 20% reduction in median main-thread duration as a target, not a hard
  gate. Accept a simple step that produces a repeatable targeted reduction and
  no overall regression; discard complexity that does not pay for itself.
- A live Canvas MSA smoke test with a clean browser console apart from Lit's
  development-mode warning.

#### Documentation or migration work

Record the measured result and any newly justified numbered step.

#### Tentative commit

`chore(core): record Canvas rendering results`

#### Measured result

In three controlled runs, the pre-optimization commit (`afa567142`) recorded
profiled main-thread durations of 12.00, 11.92, and 11.88 seconds, for a median
of 11.92 seconds. The Step 4 result recorded 6.39, 6.40, and 6.45 seconds, for a
median of 6.40 seconds: a 46.3% reduction.

The before/after profiles show large reductions in repeated property
coalescing, position encoding, range projection, and dynamic rectangle access.
Remaining clear costs are per-datum geometry/culling, index-scale application,
layout access, and native Canvas painting. A large `get encoding` sample
appears to be optimized/inlined-frame attribution beneath `renderTextCanvas`;
source inspection shows one cached `mark.encoding` read per text traversal, so
no speculative change is justified.

### Step 6: Prepare projection for the remaining immediate marks

#### Intended outcome

- Use the existing prepared range projection in point, rule, link, and arrow
  visitors, so every immediate mark snapshots layout coordinates, band
  placement, and constant positional offsets once per traversal where its
  geometry permits.
- Reuse result arrays instead of allocating new range arrays per datum in rule,
  link, and arrow.
- Preserve point `dx`/`dy`, semantic-score ordering, link-local coordinates,
  arrow count-only behavior, culling, and Canvas/SVG geometry.
- Audit every per-datum encoder read in the four visitors. Hoist additional
  constant geometry/culling encoders only when the mark has a clear repeated
  pre-culling read and the local code remains simpler than a generic
  encoder-reader abstraction; do not introduce blanket backend paint caching.
- Record intentionally unhoisted encoder reads during final reconciliation.
- Do not migrate cold SVG legend-gradient projection or introduce a universal
  render plan merely for consistency.

#### Affected areas

- Immediate point, rule/tick, link, and arrow visitors
- Focused Canvas2D, SVG, and immediate projection tests

#### Verification

- Focused geometry/output tests for point, rule, link, and arrow, including
  data-dependent positions, constant positions and offsets, reversed spans,
  culling, and count-only paths where applicable.
- For each newly hoisted constant, verify reevaluation between traversals.
- Confirm text/rect profiles and tests do not regress from broadening use of the
  shared helper.
- Measure production line-count change and reject generic preparation layers
  that make the visitors harder to read.
- Lint, formatting, and minimal-bundle verification.

#### Documentation or migration work

None. The immediate-mode boundary is already documented.

#### Tentative commit

`perf(core): prepare projection for immediate marks`

### Step 7: Verify and close the plan

#### Intended outcome

- Reconcile every plan item as completed or explicitly discarded before plan
  retirement.
- Confirm the broader immediate-mark migration preserved the measured MSA
  result and did not add speculative caching or indexing.
- Record final verification and leave the plan ready for its separate deletion
  commit before merge.

#### Affected areas

- This plan file for final reconciliation

#### Verification

- Full unit suite, lint, formatting, workspace TypeScript checks,
  minimal-bundle verification, and live Canvas smoke tests.
- Confirm no CPU x index, persistent per-datum cache, new preparation framework,
  or static import of the optional renderers was introduced.
- Check the branch diff and production line growth for unnecessary complexity.
- Obtain a fresh independent correctness and KISS review before committing the
  reconciled plan.

#### Documentation or migration work

Reconcile this plan. Delete the temporary plan in a later commit before merge,
following repository policy.

#### Tentative commit

`chore(core): reconcile Canvas rendering optimization plan`

## Risks and mitigations

- **Stale prepared values:** Prepare state inside each synchronous traversal,
  never on a long-lived mark. Add mutation tests between renders.
- **Scale numerical drift:** Assert exact representative outputs and inversion
  behavior before relying on performance profiles.
- **Expression-backed values:** Only use `encoder.constant` within one traversal
  and evaluate expression-backed mark properties through the existing resolver.
- **Canvas/SVG divergence:** Keep geometry preparation in `immediate/` and run
  both backend suites after shared changes.
- **Abstraction growth:** Enforce the one-helper/no-class rule and let the KISS
  review reject speculative generality.
- **Misleading profiles:** Use the same browser, viewport, data, starting domain,
  gesture script, sampling interval, and three-run median.

## Acceptance criteria

- Text occurrence loops contain no direct `mark.properties`/coalescing-proxy
  reads.
- Native font fallback formatting runs once per text-mark traversal, not once
  per visible instance.
- Current layout coordinates and positional scale metadata are materialized
  once per applicable immediate-mark traversal.
- If Step 4 is retained, each `scaleIndex` application computes its step once
  and introduces no persistent coefficient cache.
- Constant encoder values selected for optimization are evaluated once per
  traversal and remain reactive between renders.
- Canvas2D and SVG output behavior remains covered and unchanged.
- Median MSA gesture duration does not regress. A 20% overall reduction is the
  target, while each retained optimization must show a repeatable targeted
  reduction proportional to its complexity.
- No CPU x index, persistent per-datum cache, new production class, or broad
  renderer framework is added.
- Optional Canvas2D/SVG code remains outside the statically imported minimal
  entry path.
- Every numbered step receives the required independent KISS review and
  commit gate before the next begins.

## Unresolved questions

- Which additional non-positional constant encoders, if any, can be hoisted in
  Step 6 without replacing explicit mark logic with a generic reader layer?

# Displace2D simplification plan

Status: proposed

## Problem interpretation

The current implementation has two independent sources of avoidable complexity:

1. `displace2d` operates correctly in a pixel-space solver, but common chart
   specifications must manually convert unit-range scale output into logical
   pixels. They repeat width and height expressions, account for vertical
   orientation, and pass domains back as extents. This exposes view-coordinate
   plumbing in every annotation specification and only supports affine
   conversion through position factors.
2. The keyed `transition` transform needs continuous target following, but it
   contains its own exponential half-life interpolation formula. The same
   formula already powers continuous interaction smoothing elsewhere. The
   transform still needs its own keyed row state, quiet-target delay, dataflow
   replay, and animation lifecycle; only the scalar smoothing operation is
   duplicated.

Fixed-duration easing is a different abstraction. It assumes a known start,
target, and normalized progress interval. Annotation targets can change on
every zoom frame, so adding an easing option would not solve this problem and
would make retargeting semantics harder to reason about.

## Goals

1. Make the common scale-aware `displace2d` specification materially smaller
   without turning the transform into an annotation-specific composite.
2. Keep the numerical solver pure, deterministic, stateless, and entirely in
   logical pixel coordinates.
3. Preserve the useful generic contract: flexible data fields and dimensions
   are inputs, and signed pixel offsets are outputs.
4. Reuse one tested exponential smoothing primitive for continuously changing
   targets without adding per-row animation objects or schedulers.
5. Preserve current interaction behavior: exact target restoration, delayed
   retargeting, headless snapping, and smooth repeated zoom updates.
6. Support reversed and nonlinear positional scales in the scale-aware path.
7. Keep scale, layout, dataflow, and solver responsibilities explicit and
   avoid feedback from scale-dependent transform output into scale domains.
8. Measure example-size and runtime effects before accepting the design.

## Non-goals

- Do not change `displace1d`.
- Do not combine text measurement, viewport filtering, leader rendering, or
  annotation styling into `displace2d`.
- Do not move visibility policy into the solver or automatically discard
  offscreen rows.
- Do not add a choice of placement algorithms, coordinate systems, or easing
  functions without a demonstrated current use case.
- Do not replace fixed-duration transitions or the global animation scheduler.
- Do not create one smoother instance per row or field.
- Do not change the pixel-offset output contract.
- Do not copy or adapt new third-party implementation code.

## Key decisions

### 1. Keep the solver pixel-only

`displace2dSolver` continues to receive pixel positions, rectangle dimensions,
and pixel extents. It remains unaware of views, scales, domains, layout, and
reactive parameters. Scale conversion belongs in the dataflow adapter because
that is the boundary that already has access to the owning view.

This preserves the current abstraction level and keeps the solver reusable and
easy to benchmark. It also avoids introducing parallel solver paths.

### 2. Add an explicit scale-aware adapter mode

Add one optional `scalePositions` boolean to `displace2d`. When true, it binds
the `x` and `y` fields to the owning view's matching positional scales. The
default remains false. This makes scale use explicit without adding independent
axis modes, arbitrary named scales, or channel remapping that no current example
needs.

For each scale-bound axis, the transform adapter will:

- resolve the view's scale and logical axis length;
- map each input value through the scale into a logical pixel position;
- respect the scale's normal or reversed screen direction;
- use the logical viewport interval as the default placement extent;
- react to scale-domain and layout-size changes; and
- preserve the original `x` and `y` fields as the scale-domain source while
  writing only scale-free offset fields.

Scale-aware mode uses both positional scales and the complete logical viewport.
It must not be combined with position factors or explicit extents;
contradictory coordinate conversions and bounds fail fast. Mixed pixel/data
axes and scale-bound subregions are deferred until a concrete use case requires
them.

The existing field, factor, and extent mode remains the default. It is useful
for already pixel-scaled data, non-view use, and compatibility with the generic
`displace1d`-inspired contract. The new mode is a convenience at the adapter
boundary, not a replacement solver.

Before finalizing the public name, implement a small internal spike and compare
the resulting canonical specification against the current one. If
`scalePositions` does not remove the conversion expressions and extents
cleanly, stop and revisit the boundary rather than adding more flags.

### 3. Share only the continuous smoothing primitive

Extract the scalar exponential half-life calculation into a small pure utility,
tentatively named `smoothToTarget`. Both the existing object smoother and the
keyed `transition` transform call this utility.

The keyed transform retains:

- row matching and removal;
- current, target, and pending value buffers;
- the quiet-target delay;
- one animation callback for the complete batch;
- headless and pre-render snapping; and
- downstream reset, propagation, and completion.

Reusing the higher-level object smoother directly would add redundant state,
callbacks, cloning, and scheduling in a hot path. Sharing the pure scalar
operation removes the duplicated algorithm while retaining the correct
dataflow ownership.

No easing parameter is added. Fixed-duration easing remains appropriate where
the destination is known for the duration; half-life smoothing remains the
contract for targets that may change continuously.

### 4. Simplify only the coordinate boilerplate in this change

The canonical label example should use scale-bound `displace2d` positions and
drop its explicit unit-range-to-pixel factor expressions and redundant viewport
extents. Text measurement, collision dimensions, viewport participation,
transition, and layered rendering remain visibly compositional.

This is intentional KISS/YAGNI scope control. If the remaining specification is
still too long, evaluate each remaining concern separately after this change is
measured rather than creating an annotation macro or all-in-one transform now.

## Alternatives considered

### Change the global scale expression to return pixels

Rejected. Unit-range scales are an established renderer and expression
contract. Changing them globally would have broad consequences beyond this
feature.

### Require pixel positions from an upstream formula

Rejected as the primary solution. It can support nonlinear scales but merely
moves the same layout expressions into additional transforms and does not
simplify normal specifications.

### Infer positional scales automatically

Rejected. A data transform should not silently assume that fields correspond to
the view's encodings. Explicit scale binding is easier to validate and keeps
pixel-space use unambiguous.

### Replace the keyed transition with the existing object smoother

Rejected. The existing smoother owns one target object and its own animation
lifecycle; it does not own keyed batch membership, pending target promotion, or
dataflow replay. Adapting it would add machinery and likely allocations.

### Add fixed-duration easing to the transition transform

Rejected for this scope. Repeated retargeting would repeatedly restart or splice
time-based curves, which is a worse semantic match than continuous half-life
smoothing.

### Introduce a complete annotation-placement transform

Rejected. It would couple text, visibility, placement, animation, and rendering
policy, reducing reuse and creating a large configuration surface before those
concerns have shown a common stable contract.

## Milestones

### Milestone 1: Share continuous smoothing math

Outcome:

- One pure scalar half-life smoothing function is the source of truth.
- The object smoother and keyed transform preserve their existing public
  behavior and lifecycle.

Areas:

- `packages/core/src/utils/animator.js`, or a narrowly named adjacent utility
- `packages/core/src/data/transforms/transition.js`
- focused utility and transition tests

Verification:

- Assert representative elapsed-time and half-life values.
- Assert continuous retargeting does not snap or restart from stale targets.
- Preserve target delay, epsilon settling, removed-key behavior, disabled
  transitions, and pre-render snapping.
- Confirm no new per-row objects, callbacks, or animation requests are created.

Documentation impact:

- None; this is an internal refactor with unchanged parameters.

Commit checkpoint:

- `refactor(core): share continuous smoothing calculation`

### Milestone 2: Add scale-aware displacement positions

Outcome:

- `displace2d` can map source fields through the owning view's positional scales
  and derive pixel bounds without conversion expressions in the specification.
- Existing factor-based use remains valid.

Areas:

- `packages/core/src/spec/transform.d.ts`
- `packages/core/src/data/transforms/displace2d.js`
- transform and scale-integration tests
- generated schema and specification documentation

Verification:

- Cover scale-aware and raw-coordinate modes.
- Cover zoom/domain updates, layout resize, reversed axes, and one nonlinear
  continuous scale.
- Fail fast on conflicting position factors and explicit extents.
- Verify scale domains remain data-driven where they are not explicit.
- Verify raw pixel/factor mode produces unchanged results.
- Run focused unit tests, schema generation checks, TypeScript checks, and lint.

Documentation impact:

- Document scale-bound versus raw-coordinate mode and the fact that dimensions
  and outputs remain logical pixels.

Commit checkpoint:

- `feat(core): add scale-aware displace2d positions`

Review gate:

- Review the public parameter names and the canonical before/after spec diff.
  Do not proceed with extra convenience flags if the core example is not
  clearly simpler.

### Milestone 3: Migrate and measure examples

Outcome:

- Shared and private acid-test examples use the scale-aware path where it makes
  the specification clearer.
- The canonical example demonstrates composition without coordinate plumbing.

Areas:

- the canonical transform documentation example
- the Core stress and reversed-axis examples
- private MA, volcano, and Manhattan acid tests when present

Verification:

- Record line counts and the number of scale/layout conversion expressions
  before and after migration.
- Smoke-test initial layout, x/y zoom, resize, reversed axes, empty viewport,
  extreme zoom, and restoration to the original domain.
- Confirm leader endpoints and annotation offsets remain visually correct.
- Profile representative dense examples and reject measurable interaction
  regressions.

Documentation impact:

- Update the transform example and parameter reference in the same milestone.

Commit checkpoint:

- `docs(core): simplify displace2d examples`

## Performance constraints

- Scale mapping is one direct call per bound axis and row during an already
  required placement pass.
- Scale and layout listeners must coalesce invalidations into one replay per
  frame or settled update.
- The transition keeps one batch-level animation callback and its existing
  numeric arrays.
- No extra solver variant, cache layer, worker, or per-label animation object is
  introduced without profiling evidence.
- Compare representative dense-example frame timing before and after each
  milestone; a simpler specification is not sufficient if interaction slows.

## Risks and mitigations

- **Scale-domain feedback.** Preserve source positions unchanged and keep pixel
  offsets on scale-free offset channels. Marking the source channels as
  domain-sensitive would incorrectly remove the standalone view's own domain
  contribution, so test data-driven domains instead.
- **Coordinate-direction mistakes.** Test normal and reversed axes separately,
  including vertical screen direction and explicit extents.
- **Duplicate reactive replays.** Use one scale/layout invalidation path and
  test replay counts during a combined domain and layout update.
- **API mode ambiguity.** Fail fast when scale-aware mode also supplies a
  position factor or extent. Keep raw mode as the default.
- **Over-generalization.** Bind only the matching primary positional scales in
  the first version; defer mixed modes, named scales, remapping, and scaled
  subregions until a real example needs them.
- **Behavior drift during refactoring.** Land smoothing reuse separately and
  require existing transition tests to pass unchanged before changing the
  displacement API.

## Open questions and decision points

1. Does the current example's viewport formula still dominate its size after
   conversion expressions are removed? If so, record it as a separate design
   problem rather than expanding this change.

## Acceptance criteria

- The canonical example no longer contains manual unit-range-to-pixel position
  factors or redundant domain extents for the normal viewport case.
- The scale-aware transform handles zoom, resize, reversal, and nonlinear
  continuous scales with stable pixel offsets.
- The pure solver remains unchanged unless a correctness bug is independently
  demonstrated.
- Continuous smoothing has one mathematical implementation used by both
  existing callers.
- The keyed transition retains its current target delay, settling, lifecycle,
  and dataflow semantics and does not expose fixed-duration easing.
- Focused unit and integration tests, schema/docs generation, TypeScript checks,
  and lint pass.
- Dense-example interaction performance does not regress materially.
- The implementation adds no annotation-specific composite, alternate solver,
  unused configuration, or per-row animation abstraction.
- The plan is reconciled, committed, and then removed in a separate cleanup
  commit before pull-request delivery.

## Final integration verification

After all milestones, inspect the complete branch diff rather than only the
latest commit. Re-run the focused transform suites, workspace TypeScript checks,
lint, schema/documentation checks, and browser smoke tests for the canonical and
acid-test examples. Compare example size and interaction timing against the
pre-change baseline. Reconcile every item in this plan as completed or
discarded, commit that record, and remove the plan in a later cleanup commit.

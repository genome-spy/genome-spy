# Two-dimensional annotation displacement

## Status

Proposed. This plan is a temporary implementation artifact and must be
reconciled and retired before the pull request is merged.

## Motivation

Dense two-dimensional plots need annotation placement that remains legible
during zooming, panning, resizing, and data updates. GenomeSpy already has a
`displace1d` transform for ordered, one-dimensional items. A new `displace2d`
transform should extend the same dataflow-oriented pattern to axis-aligned
rectangular annotations without coupling the dataflow to marks or a retained
scene graph.

The main inspirations are:

- [ggrepel](https://ggrepel.slowkow.com/), which repels label boxes from other
  labels, data points, and plot edges and pulls labels toward their anchors.
- [ggrepel's related-work survey](https://ggrepel.slowkow.com/articles/related-work),
  particularly Vega's occupancy-bitmap label placement and the contrasting
  force, simulated-annealing, greedy, and spiral approaches.
- [Vega's label transform](https://vega.github.io/vega/docs/transforms/label/),
  which greedily tests prioritized candidate anchors against compact occupancy
  bitmaps and explicitly represents labels that cannot be placed.

Temporary reference checkouts used while preparing this plan:

- Vega commit
  [`79aa7d9`](https://github.com/vega/vega/tree/79aa7d9de7b09604c5f881a09fd528d2b561d12f/packages/vega-label)
  at `/private/tmp/genome-spy-vega-reference`
- ggrepel commit
  [`458aa50`](https://github.com/slowkow/ggrepel/tree/458aa50c14c2d4df8792fff1478aca1ba3b3615f)
  at `/private/tmp/genome-spy-ggrepel-reference`

## Goals

1. Provide a public transform named `displace2d`, following the existing
   `displace1d` naming and dataflow conventions.
2. Keep interaction smooth. Recomputing placement on scale-domain or layout
   changes must have a deterministic, bounded cost suitable for interactive
   zoom and pan.
3. Keep the implementation modular and self-contained: a pure placement solver,
   a thin dataflow adapter, and no dependency from transforms to views, marks,
   Canvas, WebGL, SVG, or DOM geometry.
4. Support heterogeneous axis-aligned annotation rectangles, padding, plot
   bounds, stable priority order, and explicit handling of items that
   cannot be placed.
5. Produce pixel-space x and y displacements that work with GenomeSpy's existing
   `xOffset`, `yOffset`, `x2Offset`, and `y2Offset` channels. Preserve the
   original anchor fields so layered leader lines can connect anchors to moved
   annotations.
6. React correctly to zoom, layout, and expression-backed placement parameters
   without changing data-driven x/y domains or creating feedback loops.
7. Make identical inputs and parameters produce identical outputs. Small view
   changes should avoid unnecessary label churn so labels do not flicker or
   jump erratically during interaction.
8. Measure the simplest correct implementation against representative
   performance and placement-quality fixtures before adding an acceleration
   structure or a more sophisticated algorithm.
9. Avoid new runtime dependencies unless a measured implementation clearly
   outperforms a small local solver and has a compatible long-term API and
   license.

## Non-goals for the first version

- Inspecting rendered mark bounds or avoiding arbitrary named marks. GenomeSpy
  intentionally has no retained scene graph, so this would invert the dataflow
  and rendering ownership boundary.
- Automatically measuring text. Authors compose `measureText` (or provide
  explicit width and height fields) before `displace2d`.
- Rotated, curved, polygonal, or pixel-perfect glyph collision geometry.
- Arbitrary annotation alignment or baseline semantics. The first contract uses
  axis-aligned rectangles centered on `x` and `y`; authors center the mark or
  pre-adjust its coordinates upstream.
- Globally optimal label placement. Two-dimensional label placement is
  computationally hard; the contract is a fast deterministic heuristic with
  explicit failure output.
- Off-main-thread placement in the initial implementation. A worker introduces
  asynchronous and stale-result semantics and should be considered only if a
  well-profiled synchronous solver cannot meet the interaction budget.
- A public family of pluggable strategies. Keep algorithm boundaries internal
  until more than one production use case justifies a public abstraction.
- Public candidate-generation options, obstacle geometry, leader-line routing,
  and previous-frame placement state unless the canonical first use case cannot
  be implemented acceptably without them.

## Architectural constraints from GenomeSpy

- `packages/core/src/view/flowBuilder.js` builds transforms as `FlowNode`s.
  Batch placement therefore collects input, writes output fields, and
  repropagates through the existing collector mechanism.
- `packages/core/src/data/transforms/displace1d.js` establishes the precedent
  for `BEHAVIOR_COLLECTS | BEHAVIOR_MODIFIES`, expression-backed pixel
  conversion, scale-domain bootstrap, validation, and reactive replay.
- `packages/core/src/data/transforms/displace1dSolver.js` establishes the
  preferred separation between a pure numerical solver and the dataflow
  adapter.
- `packages/core/src/data/transforms/measureText.js` supplies label widths but
  does not own placement.
- Offset channels are already applied in WebGL and structured SVG output. The
  transform should emit offsets and reuse that renderer-independent contract
  instead of inventing annotation-specific rendering paths.
- No renderer changes are expected. If integration appears to require them,
  revisit the transform output contract before adding renderer special cases.
- Core hot paths should avoid material per-frame allocations. Reuse working
  buffers across reactive repropagations only when measurement justifies the
  extra lifetime management.

## KISS and YAGNI implementation rules

These rules are acceptance criteria for the code, not optional cleanup work:

- Implement one concrete, documented annotation use case end to end before
  generalizing the solver or grammar.
- Start with direct arrays, loops, and rectangle predicates. Do not introduce a
  geometry hierarchy, strategy interface, generic spatial-index abstraction,
  worker protocol, cache layer, or state machine for hypothetical extensions.
- Keep the public transform smaller than the internal solver contract. Expose
  only parameters used by the canonical example and backed by a clear user
  requirement.
- Use one placement algorithm in production. Alternative algorithms are
  considered only after the current one fails a named correctness, quality, or
  performance criterion on a representative fixture.
- Prefer stateless deterministic recomputation. Retain previous placements only
  if measured interaction churn is unacceptable and stable input order cannot
  solve it.
- Prefer exact rectangle checks first. Add a uniform grid, bitmap, typed array,
  buffer reuse, or other optimization individually and only with before/after
  evidence.
- Reuse `displace1d` lifecycle patterns, but do not create a shared displacement
  framework until both transforms contain stable, meaningful duplication.
- Validate once at the transform boundary. Keep the pure solver focused on its
  explicit numerical contract and fail loudly on violated invariants.
- Do not add compatibility aliases, deprecated parameter names, fallback
  behaviors, or configuration combinations that have never shipped.
- Keep comments about non-obvious intent, coordinate conventions, provenance,
  and tradeoffs. Do not narrate straightforward control flow.
- Add representative behavior tests. Avoid exhaustive matrices that merely
  repeat implementation branches or freeze internal data structures.
- Delete discarded spike code and unused helpers before committing production
  milestones.
- Measure line count and diff size at each implementation milestone. Added
  complexity must be justified by a requirement or measurement recorded in this
  plan.

## Proposed public contract

The initial API candidate is intentionally small. The first milestone must try
to remove optional parameters before adding any:

```ts
interface Displace2DParams extends TransformParamsBase {
    type: "displace2d";
    x: Field;
    y: Field;
    width: number | Field;
    height: number | Field;
    padding?: number;
    positionFactors?: [number, number] | ExprRef;
    extent?: [[number, number], [number, number]] | ExprRef;
    as?: [string, string, string];
}
```

Tentative defaults are zero padding, unit position factors, one fixed internal
nearest-first candidate sequence, and
`as: ["xDisplacement", "yDisplacement", "placed"]`.

Semantics:

- `x` and `y` identify original annotation centers. Marks use matching centered
  alignment, or authors adjust their anchor coordinates upstream. The factors
  convert those coordinates into logical pixels, as `positionFactor` does for
  `displace1d`. Negative factors are valid and extents are normalized after
  scaling.
- `width`, `height`, and `padding` use logical pixels. A string width or height
  names a datum field. Authors can use existing formula and text-measurement
  transforms instead of adding another expression mechanism here.
- Input order is placement priority. Authors can place `collect` immediately
  upstream to sort by an application-specific score and to provide the replay
  buffer required by reactive parameters. The transform must not add a second,
  competing priority API.
- The candidate sequence is an internal algorithm detail in the first version.
  Add public candidate customization only when a second demonstrated use case
  needs placement behavior that the default cannot provide.
- `extent` contains x and y plot bounds in the original coordinate
  systems. A candidate outside the scaled extent is rejected.
- The transform never silently drops rows. It writes `placed: false` when no
  candidate fits; downstream encodings or filters decide whether to hide,
  de-emphasize, or otherwise represent that annotation. Displacements for an
  unplaced row remain zero.
- The output displacement coordinate system must exactly match unscaled
  `xOffset` and `yOffset`: positive x moves right and positive y moves down.
- Like `displace1d`, affine position conversion is supported directly.
  Nonlinear scales require authors to derive pixel positions explicitly; the
  documentation must not imply otherwise.

The API above is an upper bound, not a checklist. If the canonical example can
derive pixel positions before this transform, remove `positionFactors`. If its
view bounds can be expressed directly in pixels, simplify `extent`. Avoid
mirroring every `displace1d` option merely for symmetry.

## Algorithm decision

Start with a deterministic, prioritized candidate-placement model, not a direct
port of ggrepel's iterative force simulation and not an immediate port of
vega-label's bitmap implementation.

The preferred baseline is:

1. Convert anchor centers, rectangle sizes, padding, and extents to logical
   pixels.
2. Visit rows in stable input-priority order.
3. Test a bounded nearest-first sequence of candidate positions.
4. Reject candidates outside the extent or colliding with already
   placed rectangles.
5. Check the candidate against the short array of already placed rectangles,
   append an accepted rectangle, and emit its displacement; otherwise emit
   `placed: false`.

This direct implementation is intentionally O(k n^2) for n annotations and k
bounded candidates. It is the correctness and code-size baseline, not a promise
to ship an avoidably slow algorithm. Measure it first on the canonical example.
If it misses the performance budget, add the smallest broad-phase structure that
fixes the measured bottleneck and preserves exact rectangle checks. Compare a
uniform grid and Vega-style occupancy bitmap on that fixture only; do not build
or keep both production implementations.

Consider force relaxation or expanding-ring search only if fixed candidates
fail the agreed placement-quality criterion. Do not implement them merely to
complete an algorithm survey. Any force implementation must use a fixed,
deterministic work bound without randomness or wall-clock stopping.

If an optimized bitmap design closely adapts Vega's BSD-3-Clause
implementation, retain the University of Washington copyright and license
notice and add a durable `Based on ...` source comment. ggrepel is GPL-3: use
its user-facing behavior and published ideas only, and do not copy or translate
its source into GenomeSpy's MIT code.

## Performance budget

Use a browser benchmark because JSDOM/Node timings do not represent the
interactive hot path. Record browser, hardware, fixture, warm-up, and percentile
method with results. Initial targets for a 1000 x 800 logical-pixel viewport are:

- 500 annotations with nine candidates: median solver time at most 4 ms and
  p95 at most 8 ms during a recorded zoom sequence.
- 2,000 annotations: p95 at most one 16.7 ms frame, with runtime bounded by the
  configured candidate count rather than a wall-clock cutoff.
- Baseline working memory remains O(n). Any later acceleration structure must
  have a documented bound appropriate to the viewport and fixture sizes.
- No monotonically growing allocations or retained per-update data during 1,000
  repeated zoom/layout recomputations.

These thresholds reserve most of a 60 Hz frame for scale updates, buffer work,
and rendering. If representative GenomeSpy examples require a different label
count, adjust the fixture and threshold at the algorithm review gate rather than
quietly weakening the criterion later.

## Commit and delivery strategy

Commit frequently on `feat/displace2d`, but keep every commit focused,
reviewable, and verified. Do not accumulate the algorithm spike, public API,
solver, integration, and documentation into one large feature commit.

Expected checkpoints are:

1. Commit this initial researched plan before implementation begins.
2. Commit the pure solver, measured direct baseline, and reduced API decision
   once its invariants and performance budget pass. Delete discarded
   experiments before the commit.
3. Commit the dataflow adapter and public grammar integration once reactive
   replay, scale-domain isolation, schema, and TypeScript checks pass.
4. Commit the interactive example, renderer/export verification, and
   user-facing documentation as a coherent integration checkpoint.
5. Commit worthwhile review fixes separately when they are independently
   meaningful; fold trivial corrections into the checkpoint they belong to.
6. Before PR creation, commit the fully reconciled plan with every task marked
   completed or discarded, then delete the temporary plan in a later commit.

Use Conventional Commit messages with rationale-focused bodies. Run the
narrowest relevant verification before each checkpoint so intermediate commits
remain useful for review and bisection.

## Correctness and interaction invariants

- Every `placed: true` rectangle is inside the configured extents and does not
  overlap another placed rectangle after padding and any broad-phase
  quantization are accounted for.
- Higher-priority input cannot be displaced by a lower-priority input.
- Equal inputs produce equal outputs across runs and platforms within documented
  pixel quantization.
- Output order and datum identity follow normal modifying-transform behavior.
- Empty, singleton, coincident, heterogeneous-size, negative-factor, reversed
  screen-axis, and infeasible batches have specified behavior.
- Non-finite positions, dimensions, factors, padding, extents, candidates, and
  mismatched `as` arrays fail fast with transform-specific messages.
- Expression-backed parameters bootstrap only after scale domains exist and
  trigger one coherent replay when their effective values change.
- Placement output must not feed back into the data-driven domains used to
  compute the original positions.
- During small zoom increments, stable priority and candidate order minimize
  placement churn. The benchmark reports changed candidates per frame so a fast
  but visibly flickering solver cannot pass on timing alone.

## Milestones

### 1. Minimal solver and contract evidence

Intended outcome: implement the smallest production-quality direct solver once,
validate it against one canonical use case, and reduce the candidate API before
it becomes public. Introduce a more complex algorithm only if this baseline
fails an explicit criterion.

Affected areas and downstream consumers:

- `packages/core/src/data/transforms/displace2dSolver.js` and adjacent contract
  tests
- A temporary benchmark script under the plan directory. Delete it after its
  results and reproduction command are recorded unless it proves valuable as a
  small permanent regression benchmark; do not build a benchmark framework.
- Representative scatterplot and genomic annotation fixtures.
- This plan's algorithm decision, API question, and recorded measurements.

Verification:

- Run the direct baseline on sparse, clustered, coincident, mixed-size,
  edge-heavy, and infeasible fixtures at 100, 500, and 2,000 annotations.
- If it fails a criterion, identify the bottleneck before implementing one
  targeted alternative. Record why the added complexity is necessary and its
  before/after result.
- Replay a deterministic zoom/pan trace and measure both latency and candidate
  churn.
- Inspect output visually for displacement, edge crowding, placement churn, and
  priority behavior.
- Confirm the chosen source and license obligations before adapting code.

Documentation or migration: record the selected behavior, reduced API decision,
measurements, and discarded alternatives in this plan. No public contract
exists yet.

Tentative commit: `feat(core): add two-dimensional displacement solver`

Review gate: maintainer review of the algorithm, public parameter shape,
performance evidence, infeasibility policy, and license/provenance decision.

### 2. Dataflow transform and public grammar

Intended outcome: add a thin collecting, modifying `displace2d` transform with
reactive pixel conversion and the smallest public contract proven by milestone
1.

Affected areas and downstream consumers:

- `packages/core/src/data/transforms/displace2d.js` and adjacent transform tests
- `packages/core/src/data/transforms/transformFactory.js`
- `packages/core/src/spec/transform.d.ts` and generated schema consumers

Verification:

- Solver contract tests cover all correctness invariants without dataflow or
  rendering dependencies.
- Transform tests cover defaults, field/scalar inputs, validation, mutation
  behavior, upstream `collect` replay, expression bootstrap, zoom reactions,
  negative factors, extent normalization, and unchanged source domains.
- Run focused Vitest suites with the `agent` reporter, schema checks, workspace
  TypeScript checks, and lint for touched code.
- Re-run the accepted performance fixtures. Inspect allocations only if timing
  or memory measurements identify them as a material problem.

Documentation or migration: add schema JSDoc sufficient for generated type
documentation; there is no migration because this is additive.

Tentative commit: `feat(core): add two-dimensional displacement transform`

### 3. User-facing example, documentation, and integration

Intended outcome: demonstrate a realistic interactive scatterplot with moved
text annotations and verify the complete contract across renderers and
interactions.

Affected areas and downstream consumers:

- `docs/grammar/transform/displace2d.md`, transform navigation, and generated
  type links
- A shared example spec following `examples/README.md`, if the example belongs
  under `examples/`; otherwise a focused docs example
- Text annotation encoding using existing offset channels
- WebGL rendering, picking, and structured SVG export through existing offset
  channels

Verification:

- Exercise initial load, resize, wheel zoom, pan, inertial zoom, and restoration
  to the original domain in a real browser.
- Confirm no overlap among placed annotations, deterministic priority, stable
  interaction, correct picking/tooltip positions, correct clipping, and correct
  displaced positions.
- Smoke-test representative WebGL and structured SVG output through the existing
  offset path. Add a new permanent cross-renderer test only if the transform
  introduces behavior that existing offset tests do not cover.
- Build/check generated docs and schema, then run the relevant Core tests and
  final lint/TypeScript checks.
- Repeat the accepted benchmark on the integrated example and compare it with
  the pure-solver result so dataflow overhead is visible.

Documentation or migration: document coordinate units, affine-scale limitation,
priority ordering, `placed` handling, bounds, candidate behavior, and composition
with `measureText`, offsets, and opacity or filtering. Mention leader-line
composition only if the canonical example actually uses it.

Tentative commit: `docs(core): document two-dimensional displacement`

Review gate: final maintainer review of the public grammar, integrated
interaction behavior, downstream renderer/picking/export behavior, performance,
documentation, provenance, and code-size tradeoff.

## Final integration acceptance criteria

- A documented `displace2d` spec labels a dense interactive scatterplot and
  visibly recomputes during zoom, pan, and resize without blocking interaction.
- The solver and transform meet the accepted performance and churn thresholds
  on the recorded fixtures.
- Successful placements are non-overlapping, deterministic, prioritized, and
  bounded; unsuccessful placements are explicit and no row is silently lost.
- The transform remains dataflow-only, the solver remains pure, and no new
  rendering special cases or runtime dependencies are introduced.
- WebGL display, picking/tooltips, clipping, and structured SVG export agree on
  the displaced positions.
- Public types, generated schema, documentation, navigation, and example specs
  agree on parameter names, defaults, units, and limitations.
- Required BSD attribution is present for closely adapted Vega code; no GPL
  ggrepel source has been copied or translated.
- Relevant focused tests, schema/docs checks, TypeScript checks, and lint pass.
- The production change contains one solver path and no unused strategy,
  geometry, caching, worker, or compatibility abstractions.
- Public parameters are exercised by the canonical example. Any parameter that
  remains only for a hypothetical use case is removed or explicitly deferred.
- Line-count and diff-size measurements are recorded at implementation
  milestones, and non-essential helpers, options, and tests are deleted.
- Git history is divided into the coherent, verified checkpoints above rather
  than one monolithic implementation commit.
- Before PR creation, every task in this plan is marked completed or discarded,
  the reconciled plan is committed, and the plan is deleted in a later commit.

## Risks and mitigations

- **Discrete candidate jumps during zoom.** Measure churn and use stable input
  and candidate order first. Consider retained previous choices only after this
  stateless design demonstrably fails the interaction criterion.
- **Premature optimization.** Preserve the direct solver as the measured design
  baseline. Add one broad-phase optimization only if profiling shows that
  rectangle scans cause a budget failure; do not retain two production paths.
- **Dense infeasible plots.** Expose `placed` and deterministic priority rather
  than silently overlapping or running until a time limit.
- **Expression/data-domain feedback.** Reuse `displace1d` bootstrap and collector
  replay patterns and test data-driven x and y domains explicitly.
- **API overfitting to text labels.** Define the solver in terms of rectangle
  centers and extents and keep text measurement, styling, and leader-line
  rendering outside the transform.
- **Premature generalization.** Ship one measured strategy and one candidate
  representation; keep alternative solvers and renderer obstacle avoidance out
  of the public API.

## Unresolved questions

1. Which existing or new scatterplot is the canonical first use case, and what
   real annotation counts should set the final benchmark thresholds?
2. Should the internal default try the original center first, or avoid the
   annotation's anchor by default? Resolve this from the canonical example; do
   not expose a public option in the first version.
3. Can the canonical spec derive pixel coordinates before `displace2d`, allowing
   `positionFactors` or `extent` to be removed from the public contract?
4. Does stable input and candidate order provide acceptable temporal coherence?
   Previous-frame state remains deferred unless the interaction trace proves it
   is needed.
5. Does the direct rectangle scan meet the performance budget? Only if it fails,
   which single acceleration structure fixes the measured bottleneck with the
   least code and memory?

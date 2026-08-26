# Two-dimensional annotation displacement

## Status

Proposed. This plan is a temporary implementation artifact and must be
reconciled and retired before the pull request is merged.

## Motivation

Dense two-dimensional plots need item placement that remains legible during
zooming, panning, resizing, and data updates. Annotations are the motivating use
case, but the transform should operate on generic axis-aligned collision boxes.
GenomeSpy already has a `displace1d` transform at the right abstraction level: it
accepts flexible geometry inputs, preserves every row, and emits a signed offset
without knowing how the item is rendered. A new `displace2d` transform should
extend that dataflow-oriented pattern without coupling placement to marks or a
retained scene graph.

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
4. Support heterogeneous axis-aligned rectangles using the same flexible input
   forms as `displace1d`: per-row fields, constants, and reactive shared scalars
   where each form has useful semantics.
5. Preserve every input row and produce only pixel-space x and y displacement
   fields. The offsets must compose with GenomeSpy's existing `xOffset`,
   `yOffset`, `x2Offset`, and `y2Offset` channels without prescribing rendering,
   visibility, or styling.
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
- Globally optimal rectangle placement. Two-dimensional placement is
  computationally hard; the contract is a fast deterministic heuristic with
  documented preferred-bound overflow behavior.
- Off-main-thread placement in the initial implementation. A worker introduces
  asynchronous and stale-result semantics and should be considered only if a
  well-profiled synchronous solver cannot meet the interaction budget.
- A public family of pluggable strategies. Keep algorithm boundaries internal
  until more than one production use case justifies a public abstraction.
- Public candidate-generation options, obstacle geometry, visibility decisions,
  leader-line routing, and previous-frame placement state unless a demonstrated
  use case cannot be implemented acceptably without them.

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

## Abstraction-level decision

`displace1d` is the primary design precedent, not merely a source of lifecycle
code. `displace2d` must preserve these properties:

- Inputs describe generic item geometry rather than text, labels, points, or
  mark instances.
- Collision dimensions accept a constant, a datum field, or a reactive scalar
  where that distinction is useful, matching `displace1d.length`.
- Position conversion and preferred bounds can react to zoom and layout,
  matching `displace1d.positionFactor` and `displace1d.extent`.
- Every row is propagated. Infeasible preferred bounds affect displacement or
  overflow, not row visibility.
- Outputs are signed offsets only. The transform does not emit `placed`,
  opacity, alignment, baseline, anchor, connector, or priority fields.
- Upstream transforms own sorting, measurement, and derived geometry;
  downstream encodings own rendering, filtering, styling, and connectors.

Follow the abstraction, but do not manufacture a shared base class or generic
displacement framework. The 1D and 2D solvers have different mathematical
contracts and should share code only after real, stable duplication appears.

## KISS and YAGNI implementation rules

These rules are acceptance criteria for the code, not optional cleanup work:

- Implement one concrete, documented annotation use case end to end before
  generalizing the solver or grammar.
- Start with direct arrays, loops, and rectangle predicates. Do not introduce a
  geometry hierarchy, strategy interface, generic spatial-index abstraction,
  worker protocol, cache layer, or state machine for hypothetical extensions.
- Keep the public transform generic through data inputs, not through modes and
  switches. Expose only geometry, coordinate conversion, bounds, and output
  field names.
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
    width: number | Field | ExprRef;
    height: number | Field | ExprRef;
    xPositionFactor?: number | ExprRef;
    yPositionFactor?: number | ExprRef;
    xExtent?: [number, number] | ExprRef;
    yExtent?: [number, number] | ExprRef;
    as?: [string, string];
}
```

Tentative defaults are unit position factors and
`as: ["xDisplacement", "yDisplacement"]`. Width and height include any desired
collision spacing, just as `displace1d.length` includes spacing; a separate
padding parameter is unnecessary.

Semantics:

- `x` and `y` identify original item centers. Marks use matching centered
  alignment, or authors adjust their anchor coordinates upstream.
- `xPositionFactor` and `yPositionFactor` independently convert source
  coordinates into logical pixels, as `displace1d.positionFactor` does. Negative
  factors are valid and scaled extents are normalized per axis.
- `width` and `height` are full collision dimensions in logical pixels. A number
  is shared by all rows, a string names a datum field, and an expression
  provides a reactive scalar shared by all rows, matching `displace1d.length`.
- Input order provides stable deterministic ordering. Authors can place
  `collect` immediately upstream to sort and to provide the replay buffer
  required by reactive parameters. The transform must not add a competing
  priority API.
- The candidate sequence is an internal algorithm detail in the first version.
  Add public candidate customization only when a second demonstrated use case
  needs placement behavior that the default cannot provide.
- `xExtent` and `yExtent` are preferred bounds in their respective original
  coordinate systems and are scaled with the item centers. When the rectangles
  cannot fit, every row still receives offsets and the documented overflow
  policy applies.
- The output displacement coordinate system must exactly match unscaled
  `xOffset` and `yOffset`: positive x moves right and positive y moves down.
- Like `displace1d`, affine position conversion is supported directly.
  Nonlinear scales require authors to derive pixel positions explicitly; the
  documentation must not imply otherwise.

The API mirrors `displace1d` where the concepts have direct two-dimensional
counterparts. Do not add label anchors, candidate lists, visibility, forces,
iteration controls, or algorithm selection to the public contract without a
separate demonstrated requirement.

## Algorithm decision

Start with the simplest deterministic rectangle-displacement model that
preserves all rows, not a direct port of ggrepel's iterative force simulation
and not an immediate port of vega-label's bitmap implementation.

The preferred baseline is:

1. Convert item centers, collision widths and heights, and extents to logical
   pixels.
2. Visit rows in stable input order and test positions nearest to each original
   center first.
3. Check candidates against the short array of already placed rectangles using
   exact rectangle predicates.
4. Prefer positions inside the configured extents. If the extents are
   infeasible, use a deterministic overflow rule rather than dropping a row or
   emitting a visibility decision.
5. Emit one finite signed x offset and one finite signed y offset for every row.

The direct implementation is the correctness and code-size baseline, not a
promise to ship an avoidably slow algorithm. Measure it first on representative
generic rectangles and the canonical annotation example. The initial solver
spike must resolve how nearest-position search terminates and how overflow is
minimized without adding public tuning parameters.

If the baseline misses the performance budget, add the smallest broad-phase
structure that fixes the measured bottleneck and preserves exact rectangle
checks. Compare a uniform grid and Vega-style occupancy bitmap on that fixture
only; do not build or keep both production implementations.

Consider force relaxation only if the direct displacement method fails the
agreed placement-quality criterion. Do not implement it merely to complete an
algorithm survey. Any iterative implementation must use a fixed, deterministic
work bound without randomness or wall-clock stopping and must still emit offsets
for every row.

If an optimized bitmap design closely adapts Vega's BSD-3-Clause
implementation, retain the University of Washington copyright and license
notice and add a durable `Based on ...` source comment. ggrepel is GPL-3: use
its user-facing behavior and published ideas only, and do not copy or translate
its source into GenomeSpy's MIT code.

## Performance budget

Use a browser benchmark because JSDOM/Node timings do not represent the
interactive hot path. Record browser, hardware, fixture, warm-up, and percentile
method with results. Initial targets for a 1000 x 800 logical-pixel viewport are:

- 500 heterogeneous rectangles: median solver time at most 4 ms and p95 at most
  8 ms during a recorded zoom sequence.
- 2,000 rectangles: p95 at most one 16.7 ms frame, with deterministic work
  bounds rather than a wall-clock cutoff.
- Baseline working memory remains O(n). Any later acceleration structure must
  have a documented bound appropriate to the viewport and fixture sizes.
- No monotonically growing allocations or retained per-update data during 1,000
  repeated zoom/layout recomputations.

These thresholds reserve most of a 60 Hz frame for scale updates, buffer work,
and rendering. If representative GenomeSpy examples require a different item
count, adjust the fixture and threshold at the algorithm review gate rather than
quietly weakening the criterion later.

## Commit and delivery strategy

Commit frequently on `feat/displace2d`, but keep every commit focused,
reviewable, and verified. Do not accumulate the algorithm spike, public API,
solver, integration, and documentation into one large feature commit.

Expected checkpoints are:

1. Commit this initial researched plan before implementation begins.
2. Commit the pure solver, measured direct baseline, and confirmed generic
   contract once its invariants and performance budget pass. Delete discarded
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

- Every input row receives exactly two finite signed displacement values.
- Output rectangles do not overlap. They remain inside preferred extents when
  feasible and follow the documented deterministic overflow policy otherwise.
- Equal inputs produce equal outputs across runs and platforms within documented
  pixel quantization.
- Output order and datum identity follow normal modifying-transform behavior.
- Empty, singleton, coincident, heterogeneous-size, negative-factor, reversed
  screen-axis, and infeasible batches have specified behavior.
- Non-finite positions, dimensions, factors, extents, and mismatched `as` arrays
  fail fast with transform-specific messages.
- Expression-backed parameters bootstrap only after scale domains exist and
  trigger one coherent replay when their effective values change.
- Placement output must not feed back into the data-driven domains used to
  compute the original positions.
- During small zoom increments, stable input and internal search order minimize
  placement churn. The benchmark reports materially changed offsets per frame
  so a fast but visibly flickering solver cannot pass on timing alone.

## Milestones

### 1. Minimal solver and contract evidence

Intended outcome: implement the smallest production-quality direct solver once,
validate it against generic rectangle fixtures and one canonical annotation use
case, and confirm the generic solver contract before it becomes public.
Introduce a more complex algorithm only if this baseline fails an explicit
criterion.

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
- Replay a deterministic zoom/pan trace and measure both latency and offset
  churn.
- Inspect output visually for displacement, edge crowding, placement churn, and
  overflow behavior.
- Confirm the chosen source and license obligations before adapting code.

Documentation or migration: record the selected behavior, confirmed generic
contract, measurements, and discarded alternatives in this plan. No public
contract exists yet.

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
- Confirm no overlap among annotations, preservation of every row,
  deterministic offsets, stable interaction, correct picking/tooltip positions,
  correct clipping, and correct displaced positions.
- Smoke-test representative WebGL and structured SVG output through the existing
  offset path. Add a new permanent cross-renderer test only if the transform
  introduces behavior that existing offset tests do not cover.
- Build/check generated docs and schema, then run the relevant Core tests and
  final lint/TypeScript checks.
- Repeat the accepted benchmark on the integrated example and compare it with
  the pure-solver result so dataflow overhead is visible.

Documentation or migration: document flexible geometry inputs, coordinate
units, affine-scale limitation, input ordering, preferred-bound overflow, and
composition with `measureText` and offset channels. Mention leader-line
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
- Every row is preserved and receives deterministic x and y offsets. Output
  rectangles are non-overlapping and follow the documented preferred-bound
  overflow behavior.
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
- Public parameter forms are exercised by the canonical example or focused
  contract tests. Any parameter that remains only for a hypothetical use case
  is removed or explicitly deferred.
- Line-count and diff-size measurements are recorded at implementation
  milestones, and non-essential helpers, options, and tests are deleted.
- Git history is divided into the coherent, verified checkpoints above rather
  than one monolithic implementation commit.
- Before PR creation, every task in this plan is marked completed or discarded,
  the reconciled plan is committed, and the plan is deleted in a later commit.

## Risks and mitigations

- **Displacement jumps during zoom.** Measure churn and use stable input and
  search order first. Consider retained previous offsets only after this
  stateless design demonstrably fails the interaction criterion.
- **Premature optimization.** Preserve the direct solver as the measured design
  baseline. Add one broad-phase optimization only if profiling shows that
  rectangle scans cause a budget failure; do not retain two production paths.
- **Dense infeasible bounds.** Preserve every row and use a documented
  deterministic overflow rule rather than emitting visibility or silently
  accepting overlaps.
- **Expression/data-domain feedback.** Reuse `displace1d` bootstrap and collector
  replay patterns and test data-driven x and y domains explicitly.
- **API overfitting to text labels.** Define the solver in terms of rectangle
  centers and extents and keep text measurement, styling, and leader-line
  rendering outside the transform.
- **Premature generalization.** Ship one measured solver with generic geometry
  inputs and offset outputs; keep algorithm selection and renderer obstacle
  avoidance out of the public API.

## Unresolved questions

1. Which existing or new scatterplot is the canonical first use case, and what
   real annotation counts should set the final benchmark thresholds?
2. What deterministic nearest-position search and overflow rule preserve all
   rows while keeping squared displacement and extent overflow acceptably low?
   Resolve this inside the solver; do not expose search controls in the first
   public API.
3. Are separate x/y position factors and extents clearer than paired parameters?
   Prefer the form that most closely preserves `displace1d` semantics and keeps
   expression-backed replay straightforward.
4. Does stable input and search order provide acceptable temporal coherence?
   Previous-frame state remains deferred unless the interaction trace proves it
   is needed.
5. Does the direct rectangle scan meet the performance budget? Only if it fails,
   which single acceleration structure fixes the measured bottleneck with the
   least code and memory?

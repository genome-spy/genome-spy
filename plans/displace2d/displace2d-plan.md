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
4. Support heterogeneous axis-aligned annotation rectangles, padding, preferred
   plot bounds, stable priority order, and explicit handling of items that
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
8. Define performance and placement-quality benchmarks before committing to an
   algorithm, and prevent meaningful regressions with repeatable benchmark
   fixtures.
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
- Globally optimal label placement. Two-dimensional label placement is
  computationally hard; the contract is a fast deterministic heuristic with
  explicit failure output.
- Off-main-thread placement in the initial implementation. A worker introduces
  asynchronous and stale-result semantics and should be considered only if a
  well-profiled synchronous solver cannot meet the interaction budget.
- A public family of pluggable strategies. Keep algorithm boundaries internal
  until more than one production use case justifies a public abstraction.

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
- Core hot paths should avoid per-frame allocations. Buffers and the occupancy
  structure should be reusable across reactive repropagations.

## Proposed public contract

The first implementation should validate this shape during the algorithm spike
and change it before the public API milestone if representative examples reveal
a simpler contract:

```ts
interface Displace2DParams extends TransformParamsBase {
    type: "displace2d";
    x: Field;
    y: Field;
    width: number | Field | ExprRef;
    height: number | Field | ExprRef;
    padding?: number | ExprRef;
    xPositionFactor?: number | ExprRef;
    yPositionFactor?: number | ExprRef;
    xExtent?: [number, number] | ExprRef;
    yExtent?: [number, number] | ExprRef;
    anchors?: Displace2DAnchor[];
    offsets?: number[];
    as?: [string, string, string];
}
```

Tentative defaults are zero padding, unit position factors, the eight compass
anchors plus the original center in nearest-first order, one small pixel offset,
and `as: ["xDisplacement", "yDisplacement", "placed"]`.

Semantics:

- `x` and `y` identify original annotation centers. The factors convert those
  coordinates into logical pixels, as `positionFactor` does for `displace1d`.
  Negative factors are valid and extents are normalized after scaling.
- `width`, `height`, and `padding` use logical pixels. A string names a datum
  field; an expression is a reactive scalar shared by the batch.
- Input order is placement priority. Authors can place `collect` immediately
  upstream to sort by an application-specific score and to provide the replay
  buffer required by reactive parameters. The transform must not add a second,
  competing priority API.
- `anchors` and parallel/repeated `offsets` define a bounded, deterministic
  candidate sequence around each original center. Exact names and default order
  should match established Vega terminology where it fits GenomeSpy.
- Extents are preferred plot bounds in the original x/y coordinate systems.
  A candidate outside the scaled extents is rejected.
- The transform never silently drops rows. It writes `placed: false` when no
  candidate fits; downstream encodings or filters decide whether to hide,
  de-emphasize, or otherwise represent that annotation. Displacements for an
  unplaced row remain zero.
- The output displacement coordinate system must exactly match unscaled
  `xOffset` and `yOffset`: positive x moves right and positive y moves down.
- Like `displace1d`, affine position conversion is supported directly.
  Nonlinear scales require authors to derive pixel positions explicitly; the
  documentation must not imply otherwise.

Open API question: an array of explicit `[dx, dy]` candidates may be simpler and
more general than parallel `anchors` and `offsets`. Resolve this with real specs
before the schema is added. Do not expose both forms in the first version.

## Algorithm decision

Start from a deterministic, prioritized candidate-placement model inspired by
vega-label, not a direct port of ggrepel's iterative force simulation.

The preferred baseline is:

1. Convert anchor centers, rectangle sizes, padding, and extents to logical
   pixels.
2. Visit rows in stable input-priority order.
3. Test a bounded nearest-first sequence of candidate positions.
4. Reject candidates outside the preferred extent or colliding with already
   placed rectangles.
5. Reserve the accepted rectangle in a compact occupancy bitmap and emit its
   displacement; otherwise emit `placed: false`.

An occupancy bitmap gives predictable memory and runtime and guarantees that
all successful placements are mutually non-overlapping. Following Vega's
design, cap bitmap resolution near one million cells and downsample larger
viewports. Keep the grid/collision implementation independent of Vega's scene
graph and Canvas rasterization.

Before finalizing that choice, compare three small pure-JavaScript prototypes on
the same fixtures:

- occupancy bitmap with fixed candidates;
- a spatial-hash force relaxation with a fixed iteration count and no random
  jitter;
- a nearest-free spiral or expanding-ring search using the bitmap.

Measure solve time, allocations, placed-label count, total squared displacement,
and placement churn over a recorded zoom sequence. Select the simplest approach
that meets all hard requirements. Force simulation is acceptable only if it
meets the frame budget without wall-clock stopping, randomness, or unbounded
pairwise scans. Record the decision and measurements in this plan before the
public API is implemented.

The likely bitmap design is based on Vega's BSD-3-Clause implementation. If code
is closely adapted, retain the University of Washington copyright and license
notice in the repository and add a durable `Based on ...` source comment near
the implementation. ggrepel is GPL-3: use its user-facing behavior and published
ideas only, and do not copy or translate its source into GenomeSpy's MIT code.

## Performance budget

Use a browser benchmark because JSDOM/Node timings do not represent the
interactive hot path. Record browser, hardware, fixture, warm-up, and percentile
method with results. Initial targets for a 1000 x 800 logical-pixel viewport are:

- 500 annotations with nine candidates: median solver time at most 4 ms and
  p95 at most 8 ms during a recorded zoom sequence.
- 2,000 annotations: p95 at most one 16.7 ms frame, with runtime bounded by the
  configured candidate count rather than a wall-clock cutoff.
- Occupancy storage capped near one million bits per layer plus O(n) reusable
  working arrays.
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
2. Commit the algorithm prototypes, benchmark evidence, selected approach, and
   reconciled API decision as one reviewable spike. Do not mix discarded
   prototype implementations into the production solver commit.
3. Commit the pure solver and its contract tests once its invariants and
   performance budget pass.
4. Commit the dataflow adapter and public grammar integration once reactive
   replay, scale-domain isolation, schema, and TypeScript checks pass.
5. Commit the interactive example, renderer/export verification, and
   user-facing documentation as a coherent integration checkpoint.
6. Commit worthwhile review fixes separately when they are independently
   meaningful; fold trivial corrections into the checkpoint they belong to.
7. Before PR creation, commit the fully reconciled plan with every task marked
   completed or discarded, then delete the temporary plan in a later commit.

Use Conventional Commit messages with rationale-focused bodies. Run the
narrowest relevant verification before each checkpoint so intermediate commits
remain useful for review and bisection.

## Correctness and interaction invariants

- Every `placed: true` rectangle is inside the configured extents and does not
  overlap another placed rectangle after padding and bitmap quantization are
  accounted for.
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

### 1. Algorithm and contract spike

Intended outcome: choose the smallest solver and candidate API that satisfy the
measured performance, placement quality, determinism, and interaction-stability
requirements.

Affected areas and downstream consumers:

- Temporary benchmark/prototype code under the plan directory or a dedicated
  non-published Core benchmark location.
- Representative scatterplot and genomic annotation fixtures.
- This plan's algorithm decision, API question, and recorded measurements.

Verification:

- Run the three algorithm families on sparse, clustered, coincident, mixed-size,
  edge-heavy, and infeasible fixtures at 100, 500, and 2,000 annotations.
- Replay a deterministic zoom/pan trace and measure both latency and candidate
  churn.
- Inspect output visually for leader-line length, edge crowding, and priority
  behavior.
- Confirm the chosen source and license obligations before adapting code.

Documentation or migration: none; no public contract exists yet.

Tentative commit: `chore(core): evaluate 2D displacement algorithms`

Review gate: maintainer review of the algorithm, public parameter shape,
performance evidence, infeasibility policy, and license/provenance decision.

### 2. Pure solver and dataflow transform

Intended outcome: add a self-contained `displace2d` solver and a thin collecting,
modifying transform with reactive pixel conversion.

Affected areas and downstream consumers:

- `packages/core/src/data/transforms/displace2dSolver.js` and adjacent unit tests
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
- Re-run the accepted performance fixtures and inspect allocation profiles.

Documentation or migration: add schema JSDoc sufficient for generated type
documentation; there is no migration because this is additive.

Tentative commit: `feat(core): add two-dimensional displacement transform`

### 3. User-facing example, documentation, and integration

Intended outcome: demonstrate a realistic interactive scatterplot with moved
text annotations and leader lines, and verify the complete contract across
renderers and interactions.

Affected areas and downstream consumers:

- `docs/grammar/transform/displace2d.md`, transform navigation, and generated
  type links
- A shared example spec following `examples/README.md`, if the example belongs
  under `examples/`; otherwise a focused docs example
- Text annotation encoding plus rule or link leader-line encoding
- WebGL rendering, picking, and structured SVG export through existing offset
  channels

Verification:

- Exercise initial load, resize, wheel zoom, pan, inertial zoom, and restoration
  to the original domain in a real browser.
- Confirm no overlap among placed annotations, deterministic priority, stable
  interaction, correct picking/tooltip positions, correct clipping, and correct
  leader-line endpoints.
- Verify representative WebGL and structured SVG output without adding a new
  renderer-specific placement path.
- Build/check generated docs and schema, then run the relevant Core tests and
  final lint/TypeScript checks.
- Repeat the accepted benchmark on the integrated example and compare it with
  the pure-solver result so dataflow overhead is visible.

Documentation or migration: document coordinate units, affine-scale limitation,
priority ordering, `placed` handling, bounds, candidate behavior, and composition
with `measureText`, offsets, opacity/filtering, and leader lines.

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
  the displaced positions and leader-line endpoints.
- Public types, generated schema, documentation, navigation, and example specs
  agree on parameter names, defaults, units, and limitations.
- Required BSD attribution is present for closely adapted Vega code; no GPL
  ggrepel source has been copied or translated.
- Relevant focused tests, schema/docs checks, TypeScript checks, and lint pass.
- Git history is divided into the coherent, verified checkpoints above rather
  than one monolithic implementation commit.
- Before PR creation, every task in this plan is marked completed or discarded,
  the reconciled plan is committed, and the plan is deleted in a later commit.

## Risks and mitigations

- **Discrete candidate jumps during zoom.** Measure churn, use a stable
  nearest-first candidate order, and consider a narrowly scoped previous-choice
  preference only if it remains deterministic and does not require datum-keyed
  retained state.
- **Bitmap false positives after downsampling.** Treat conservative rejection as
  acceptable but never allow false-negative overlaps; test quantization at view
  edges and mixed rectangle sizes.
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

1. Should candidates be expressed as Vega-like `anchors` plus `offsets`, or as a
   single explicit array of pixel displacement vectors?
2. Should the original center be the first default candidate, or should labels
   avoid their own anchor by default? This affects both ggrepel-like behavior and
   leader-line use.
3. Is conservative bitmap quantization visually acceptable at GenomeSpy's
   largest supported viewport and device-pixel ratio, or should small viewports
   retain exact logical-pixel resolution?
4. Does stable input order alone provide acceptable temporal coherence, or is a
   deterministic previous-candidate preference needed during continuous zoom?
5. Which existing or new scatterplot should become the canonical integration
   fixture, and what real annotation counts should set the final benchmark
   thresholds?

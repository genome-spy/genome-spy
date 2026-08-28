# Two-dimensional annotation displacement

## Status

Implemented, but the first user acid test exposed unacceptable placement jumps
during interactive zoom and labels covering their annotated anchor points.
Corrective milestones are planned below and block pull-request preparation.
This plan stays on the branch until those fixes and another user acid test are
complete; it must then be reconciled again and retired before a pull request is
created.

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
- [D3-Labeler](https://github.com/tinker10/D3-Labeler) commit `6de86705a8bb`,
  [adjustText](https://github.com/Phlya/adjustText) commit `92b0397b5de1`,
  [d3fc-label-layout](https://github.com/ColinEberhardt/d3fc-label-layout)
  commit `97d1b2f82f39`, [directlabels](https://github.com/tdhock/directlabels)
  commit `7c5792254f0d`, and
  [ggwordcloud](https://github.com/lepennec/ggwordcloud) commit `13544e593f54`
  under `/private/tmp/displace2d-related-work/repos`
- [genome-spy-python](https://github.com/genome-spy/genome-spy-python) commit
  `1e97fa3d9102` at
  `/private/tmp/displace2d-related-work/repos/genome-spy-python`

Research PDFs downloaded under `/private/tmp/displace2d-related-work/papers`:

- [Fast and Flexible Overlap Detection for Chart Labeling with Occupancy
  Bitmap](https://www.domoritz.de/papers/2020-OccupancyBitmap-VIS.pdf)
- [An Efficient Algorithm for Scatter Chart
  Labeling](https://aaai.org/Papers/AAAI/2006/AAAI06-167.pdf)
- [Labeling Algorithms, Chapter 15 of the Handbook of Graph Drawing and
  Visualization](https://cs.brown.edu/people/rtamassi/gdhandbook/chapters/labeling.pdf)

The D3-Labeler paper link no longer responded, but its MIT-licensed repository
contains the described simulated-annealing implementation and objective terms.

The exact 12,000-row Arrow table used by genome-spy-python's public airway MA
and volcano examples is available temporarily at
`/private/tmp/displace2d-related-work/airway-differential-expression.arrow`.
Its stable published source is the
[content-addressed Arrow asset](https://genomespy.app/genome-spy-python/_static/generated/arrow/b4b5bf13778d0f9fe586ee61ef1114aca7b70a15060c39a07a17d566fa06935d.arrow)
embedded in the pasted specifications. The underlying counts originate from
the Himes et al. airway experiment, GEO accession
[GSE52778](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE52778), as
distributed by Bioconductor's `airway` experiment-data package. Re-verify the
dataset license before committing any copied or derived data to this repository.

## Related-work conclusions

The reviewed work separates into approaches with different tradeoffs. None can
be adopted wholesale because most solve a label-specific selection problem,
while `displace2d` must preserve generic rows and emit offsets only.

- Vega's occupancy-bitmap paper and transform provide the strongest evidence
  for greedy, ordered candidate placement at interactive scale. The bitmap is
  an overlap-query acceleration structure, not a placement policy. Vega omits
  labels when its finite candidates fail, so its failure contract is not
  suitable here.
- The scatter-chart paper is directly relevant to interaction: it requires
  deterministic output to avoid confusing users and discusses arbitrary
  displacement with leader lines. Its continuous ray search, lookahead, and
  iterative regrouping optimize placement count and connector length, but even
  the authors use asynchronous recomputation for interaction. That is too much
  machinery for the first solver.
- ggrepel, adjustText, and D3-Labeler repeatedly resolve overlaps using force
  relaxation or simulated annealing. They expose forces, iteration or time
  limits, cooling, and movement constraints; D3-Labeler defaults to 1,000
  Monte Carlo sweeps. These methods are useful sources of quality criteria but
  are a poor default for deterministic bounded interaction.
- d3fc-label-layout cleanly models positions and rectangle sizes, supporting
  the generic geometry contract. Its greedy and annealing strategies may leave
  overlaps and its cleanup strategy hides labels. Its public strategy layer is
  broader than GenomeSpy needs.
- ggwordcloud searches outward along a spiral and checks exact boxes against
  already placed boxes. This is the closest structural match for preserving
  items through displacement, but it starts at a random angle, performs linear
  scans, exposes word-cloud-specific search controls, and can return failed
  words to their overlapping original positions.
- directlabels demonstrates the maintenance cost of a highly extensible method
  pipeline: named and nested positioning methods, method dispatch, and
  plot-specific heuristics. That flexibility is valuable for its package but
  reinforces keeping `displace2d` to one solver and a small data contract.

The handbook confirms that practical labeling relies on heuristics because the
general and point-labeling problems are hard, that four or eight discrete
positions are common, and that larger candidate sets directly increase cost.
It also separates placement quality into non-overlap, unambiguous association,
and preference. `displace2d` owns the first and proximity to the input center;
rendering and connector composition own association.

## Goals

1. Provide a public transform named `displace2d`, following the existing
   `displace1d` naming and dataflow conventions.
2. Keep interaction smooth. Recomputing placement on scale-domain or layout
   changes must have a deterministic, bounded cost suitable for interactive
   zoom and pan, and small navigation increments must not cause unrelated
   labels to jump between distant candidates or the overflow row.
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
7. Make a fresh solve and a repeated interaction trace deterministic. During
   an interaction, prefer valid previous placements so continuous scale changes
   do not produce visually discontinuous label motion. Path-independent output
   at a repeated domain is subordinate to temporal coherence.
8. Measure the simplest correct implementation against representative
   performance and placement-quality fixtures before adding an acceleration
   structure or a more sophisticated algorithm.
9. Avoid new runtime dependencies unless a measured implementation clearly
   outperforms a small local solver and has a compatible long-term API and
   license.

## Non-goals for the first version

- Modifying, refactoring, or fixing `displace1d`. It is an established precedent
  whose good abstraction choices inform this design, not part of this change.
  No `displace1d` implementation, tests, types, or documentation are in scope.
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
- Public candidate-generation options, visibility decisions, leader-line
  routing, animation controls, or previous-frame placement controls. Temporal
  placement hints remain an internal implementation detail.
- Inspecting unrelated rendered marks or treating all points in another layer
  as obstacles. The corrective contract accepts generic geometry for the
  selected annotations' anchors; it does not query the renderer or introduce a
  cross-stream obstacle source.

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
- Reuse `displace1d`'s contracts selectively, not its implementation verbatim.
  In particular, `displace2d` must avoid stale derived extent state, duplicate
  reactive replays, and uncancelled deferred bootstrap work.
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
- A 2D transform can have up to six reactive placement properties. Their
  invalidations must be coalesced into one refresh and at most one dataflow
  replay per settled parameter update. Prefer the existing expression-property
  batching utility or an equally small local use of it; do not create a new
  scheduler.
- Source-coordinate extents are the source of truth. Derive both scaled extents
  coherently for each solve, or explicitly clear an axis when its source extent
  becomes undefined. Never let a retained scaled extent outlive the parameter
  value from which it was derived.
- Deferred bootstrap replay must check that the transform is still live before
  walking to an upstream collector. Disposal between initial completion and the
  queued replay must be a no-op.

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
- Retain previous placements only by datum identity and only as internal solver
  hints. The user recording has now demonstrated that stateless recomputation
  is unacceptable, but it does not justify a cache abstraction, state machine,
  public continuity options, or renderer-specific transition path.
- Prefer exact rectangle checks first. Add a uniform grid, bitmap, typed array,
  buffer reuse, or other optimization individually and only with before/after
  evidence. Keep candidate generation separate from collision lookup without
  introducing interfaces for either.
- Reuse `displace1d` lifecycle patterns, but do not create a shared displacement
  framework until both transforms contain stable, meaningful duplication.
- Keep scalar readers and per-datum field accessors distinct. A field-name
  string for `width` or `height` must never leak into reactive scalar state.
- Keep one source of truth for source extents and position factors. Scaled
  bounds are derived solve inputs, not independently meaningful state.
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
    anchorWidth?: number | Field | ExprRef;
    anchorHeight?: number | Field | ExprRef;
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
  Rectangle interiors collide; touching edges do not. Width and height may be
  zero, matching `displace1d`'s non-negative collision-length contract.
- `anchorWidth` and `anchorHeight` optionally describe centered rectangular
  obstacles at every input `x`, `y` position. They accept the same constant,
  datum-field, and reactive-scalar forms as item dimensions and default to zero.
  When both dimensions are positive, every output rectangle avoids every input
  anchor rectangle in the batch. Authors include desired point clearance in
  these dimensions. This covers selected annotation anchors without inspecting
  marks or unrelated data streams.
- Input order provides stable deterministic ordering. Authors can place
  `collect` immediately upstream to sort and to provide the replay buffer
  required by reactive parameters. The transform must not add a competing
  priority API.
- The candidate sequence is an internal algorithm detail in the first version.
  Add public candidate customization only when a second demonstrated use case
  needs placement behavior that the default cannot provide.
- `xExtent` and `yExtent` are preferred bounds in their respective original
  coordinate systems and are scaled with the item centers. When the rectangles
  cannot be placed by the bounded local search, every row still receives
  offsets and the documented overflow policy applies. Overflow does not imply
  that no globally feasible arrangement exists. An expression may evaluate to
  `undefined` to disable that axis's preferred extent and must not leave stale
  scaled bounds behind.
- The output displacement coordinate system must exactly match unscaled
  `xOffset` and `yOffset`: positive x moves right and positive y moves down.
- Like `displace1d`, affine position conversion is supported directly.
  Nonlinear scales require authors to derive pixel positions explicitly; the
  documentation must not imply otherwise.

The API mirrors `displace1d` where the concepts have direct two-dimensional
counterparts. Do not add candidate lists, arbitrary obstacle datasets,
visibility, forces, iteration controls, transition controls, or algorithm
selection to the public contract without a separate demonstrated requirement.

## Algorithm decision

Start with the simplest deterministic rectangle-displacement model that
preserves all rows, not a direct port of ggrepel's iterative force simulation
and not an immediate port of vega-label's bitmap implementation.

The preferred baseline is:

1. Convert item centers, collision widths and heights, and extents to logical
   pixels.
2. Visit rows in stable input order and test a small, deterministic sequence of
   positions nearest to each original center first. The unchanged position is
   always the first candidate.
3. Check candidates against the short array of already placed rectangles using
   exact rectangle predicates.
4. Give the local search a fixed work bound. If its candidates cannot place a
   rectangle while respecting every supplied preferred extent, use a
   deterministic overflow row to the right of the crowded region. The row must
   guarantee termination and non-overlap rather than dropping a row or returning
   it to an overlapping original position.
5. Emit one finite signed x offset and one finite signed y offset for every row.

The direct implementation is the correctness and code-size baseline, not a
promise to ship an avoidably slow algorithm. Measure it first on representative
generic rectangles and the canonical annotation example. The initial solver
spike must compare the smallest useful finite candidate sequence with a bounded
rectangular-ring sequence. Choose one based on the named quality and latency
fixtures, then delete the other. Search controls remain internal, and the
deterministic overflow row is the termination guarantee for either. Do not use
randomness or trigonometric spiral steps; lattice candidates make ordering and
boundary decisions easier to reproduce across platforms.

The overflow rule is deliberately plain:

1. Initialize an overflow cursor from the maximum original right edge and the
   right edge of the scaled `xExtent`, when present. Keep it at least as large
   as the maximum right edge of every rectangle already placed.
2. On local-search failure, place the rectangle immediately to the right of
   that cursor, with its left edge touching the cursor. Preserve its original y
   center, clamped to `yExtent` when the rectangle fits there, and advance the
   cursor by its full width.
3. Because each overflow rectangle is horizontally disjoint from everything
   already placed, no additional search is required. Touching edges are
   allowed. The rule may violate `xExtent` and may produce large offsets; those
   effects are explicit and measured.

A bounded greedy search makes no claim about global feasibility. The contract
is only that accepted local candidates respect supplied extents and that every
other row is placed by the deterministic overflow rule without overlap.

If the baseline misses the performance budget, first determine whether candidate
count or collision lookup is the bottleneck. Reduce candidate work before adding
state. If rectangle scans are the bottleneck, add the smallest broad-phase
structure that fixes the measured case. A uniform grid is the first comparison
for rectangle-only input; compare Vega-style occupancy bitmap only if the grid
still misses the budget. Do not keep more than one production lookup path.

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

### Corrective temporal and anchor design

The initial stateless decision is superseded by the user acid test recorded on
2026-08-28. In the nine-second airway volcano recording, ordinary wheel zoom
caused large layout changes around 2.4--3.6 seconds: labels switched between
distant lattice candidates, and search-exhausted labels entered or left the
far-right overflow row. Solver latency remained within budget, so this is a
continuity failure rather than a throughput failure. The same recording showed
labels covering annotated points because the solver considered only output
rectangles.

Correct temporal behavior uses the smallest stateful extension consistent with
the current abstraction:

1. The transform retains the last finite displacement for each datum in a
   `WeakMap`. Datum identity is the continuity key; no identifier parameter,
   retained scene graph, or independently enumerable cache is introduced. New
   datum objects naturally start from canonical placement, and unreachable
   rows do not require explicit eviction.
2. The pure solver accepts optional previous displacements as input hints. It
   remains pure and deterministic for all explicit inputs; it does not own
   lifecycle state.
3. First test the smallest change: for each row in stable priority order, test
   the valid previous placement and a bounded neighborhood near it before the
   canonical candidates. If the discrete lattice still misses the jump gate,
   reject it for interactive placement and compare one bounded deterministic
   search whose candidates derive continuously from colliding rectangle edges.
   Do not stack multiple production strategies or retain the losing spike.
4. Keep the existing finite-work and row-preservation guarantees. Expand the
   internal local candidate budget only if the top-32 airway trace still enters
   overflow; keep the budget private and remeasure the 500- and 2,000-item
   fixtures.
5. Do not interpolate output fields in the renderer. Interpolation can hide an
   unstable solver, creates transient overlaps, and would require a general
   per-datum transition facility outside this transform. Reconsider that only
   as a separate cross-cutting proposal if stable placement still has visible
   residual jumps.

Anchor clearance extends the existing collision model rather than adding a
second algorithm. Before placing labels, seed the same broad-phase grid with
the optional centered anchor rectangles. Output rectangles then collide with
both anchors and earlier outputs, while anchors do not collide with each other.
The airway example initially supplies geometry only for its selected annotated
points. Avoiding every background point would require a cross-stream obstacle
contract and is explicitly deferred until the selected-anchor result has been
acid-tested.

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

## Placement-quality budget

Record quality alongside runtime using the following metrics:

- number and fraction of rows using overflow;
- mean and p95 center displacement, both in pixels and normalized by each
  rectangle's diagonal when it is positive;
- fraction of rows whose original position remains unchanged;
- number of materially changed offsets at each step of the zoom trace. This is
  diagnostic rather than a standalone quality score because continuous edge
  clamping and a discrete candidate change both alter offsets.
- p95 and maximum per-step displacement change for each persistent datum after
  subtracting anchor motion, plus the number of transitions into or out of
  overflow. This isolates solver jumps from the smooth movement caused by the
  scale itself.

The canonical fixture and initial thresholds below must be committed before
selecting the production candidate sequence. At a minimum, an already
non-overlapping fixture must remain completely unchanged, a fixture constructed
so the bounded local candidates can resolve it must have zero overflow, and
infeasible or search-exhausted fixtures must preserve all rows without overlaps.
Do not derive or relax dense-fixture thresholds to favor whichever
implementation happens to win.

## Canonical airway fixtures

Use genome-spy-python's
[airway volcano plot](https://genomespy.app/genome-spy-python/gallery/airway_volcano_plot.html)
as the primary end-to-end fixture. Its existing labels and leader rules already
share pixel offsets, exactly matching the proposed output contract. Use the
[airway MA plot](https://genomespy.app/genome-spy-python/gallery/airway_ma_plot.html)
as a secondary integration fixture: replace its precomputed data-domain label
endpoints with pixel displacements while keeping the original data positions as
leader-line anchors.

The published plots contain only three labels each, which is useful for checking
composition but too sparse to evaluate automatic placement. Derive deterministic
annotation subsets from the same 12,000-row table:

1. Sort by `neglog10_pvalue` descending and `ensgene` ascending.
2. Assign `row_number` and select the first N rows.
3. Use `gene_symbol` when present and `ensgene` otherwise. The first 32 rows
   contain label strings from 4 to 15 characters, providing realistic variable
   widths without another data source.
4. Obtain label width with `measureText`, derive height explicitly from the text
   mark's font metrics, and include the desired spacing in both dimensions.
5. Preserve the selected order through the collector immediately before
   `displace2d`. Use the same offsets for text and leader-rule endpoints.

Fixture roles and initial gates:

- **Volcano composition:** the original three curated labels must retain all
  rows, produce leader lines from the original data points, and remain stable
  through the recorded zoom trace.
- **Volcano quality:** the top 32 labels at the gallery's 760 by 420 logical-pixel
  size must have zero overlap and zero overflow initially. Mean displacement
  must be at most 115 px and p95 at most 200 px. The algorithm review raised
  the provisional mean gate after replacing estimated widths with actual font
  metrics; the recorded rationale follows below.
- **MA regression:** use the top 16 labels to verify negative or positive scale
  factors, pixel-offset output, and leader anchors after replacing data-domain
  label endpoints. Require zero initial overflow.
- **Performance:** use the top 100, 500, and 2,000 rows from the same ordering in
  the 1,000 by 800 solver benchmark defined above. The 500- and 2,000-label
  variants are intentional saturation tests; their overflow counts are reported
  but are not visual-quality gates.
- **Interaction continuity:** retain the deterministic 20-step twofold zoom and
  add a finer trace derived from real wheel updates in the private airway
  example. Require zero overlaps at every settled step, zero overflow for the
  top-32 airway fixture, deterministic output when replaying the same complete
  trace from fresh state, p95 per-step offset change at most 8 px, and no
  single-step offset change over 24 px. Report the fraction changing by more
  than 4 px as a diagnostic, not an acceptance score.
- **Anchor clearance:** when the selected airway anchors use nonzero obstacle
  geometry, require zero intersections between any output rectangle and any
  selected anchor rectangle at every settled trace step. Background points
  outside the annotation batch are not part of this gate.

The continuity thresholds are fixed from the observed failure before the
corrective solver comparison. Change one only at the corrective algorithm
review gate with a recorded fixture-based rationale, not to favor an
implementation already written. The 8 px p95 gate keeps ordinary motion below
half a label line, while the 24 px maximum permits an exceptional one-line move
but rejects the roughly label-width-scale jumps visible in the recording.
Compute the metric directly from consecutive output offsets; this is equivalent
to subtracting anchor motion from rendered-center motion. The 12,000 background
points remain rendering load rather than collision obstacles. Selected
annotation rectangles avoid one another and their selected anchors, while
leader lines preserve association with the original points.

For local research, use the downloaded Arrow file. Before committing a permanent
example, either reference the stable upstream asset or add a small derived
fixture with verified provenance and license; do not add the 1.8 MB Arrow file
to GenomeSpy merely for convenience.

### Initial solver evidence (2026-08-27)

The first direct rectangle scan confirmed correctness but missed the latency
budget: the broad 2,000-item synthetic fixture reached a 236 ms Node p95. A
solver-local uniform grid reduced the same direct candidate checks to about
1.4 ms p95, justifying that single acceleration structure. No alternative
collision index remains in the implementation.

Candidate comparison on the airway volcano fixture rejected a nine-position
neighborhood because 15 of 32 labels used overflow. A bounded strip aligned
with each rectangle's short axis was the smallest tested sequence that passed
the initial quality gates. It tests at most 84 displaced candidates, preserves
the original center as the first candidate, and uses the right-side row after
exhaustion. With temporary dimensions of eight pixels per character plus eight
pixels of horizontal spacing and an 18-pixel height, the top-32 airway fixture
had zero overflow, 82.7 px mean displacement, and 146.9 px p95 displacement.
Repeat these quality measurements with actual `measureText` output during
transform integration.

Headless Chromium 145 on an Apple M5 MacBook Pro with 32 GB memory measured the
final clustered synthetic fixture after ten warm-ups and across 50 solves:

- 100 rectangles: 0.2 ms median and 0.3 ms p95;
- 500 rectangles: 2.2 ms median and 2.4 ms p95;
- 2,000 rectangles: 10.7 ms median and 11.0 ms p95.

The temporary benchmark scripts were deleted after recording these results.
The real browser airway fixture, interaction trace, and visual inspection below
complete the milestone 1 algorithm review gate.

### Browser integration and algorithm review (2026-08-27)

The real 760 by 420 volcano fixture loaded the published 12,000-row Arrow table
in headless Chromium 145 and used `measureText` with the same 16 px bold font as
the text mark. The 32 selected labels had zero overlap and zero overflow. Mean
displacement was 107.8 px and p95 was 177.3 px. The provisional 100 px mean gate
was based on approximate eight-pixels-per-character widths; actual Ensembl
identifiers measured about 153.9 px including spacing. The algorithm review
accepts a 115 px mean gate while retaining the 200 px p95 gate. The 7.8 px mean
difference does not justify another placement strategy when the exact geometry,
tail metric, extent behavior, and visual inspection pass.

The y conversion must follow the offset coordinate convention, where positive
`yOffset` moves down: `height * (scale('y', 0) - scale('y', 1))` for the normal
upward quantitative y scale. Using the opposite sign produced collision-free
boxes in a vertically mirrored solver space but visible WebGL overlaps. This is
an example/documentation concern; negative position factors and normalized
scaled extents already support it without a renderer special case.

The original material-offset churn gate was rejected at this review gate. The
stateless solver reported 46.9% median and 68.8% p95 changes over 4 px, while
remaining overlap-free and reproducing every offset exactly at all 20 matching
domains on the reverse trace. A bounded warm-start spike reduced the best
observed figures only to 21.9% and 46.9%. It required retained placement state,
a scale-change threshold, and an extra near-previous candidate search, yet still
missed the gate. The spike was deleted. The metric also classified smooth edge
clamping as churn and makes any one moving label equal 33% in the three-label
composition fixture. Interaction acceptance therefore uses overlap-free settled
steps, exact repeated-domain output, the existing latency budget, and visual
inspection. Raw material-change fractions remain recorded diagnostics.

The implementation checkpoints contain 597 production lines and 588 adjacent
test lines for the solver and transform. The public adapter's lifecycle and
reactivity account for most of its size; no strategy interface, retained
placement cache, worker, renderer path, or runtime dependency was added.

The final code review added one finite-bounds guard. Without it, extreme but
finite inputs could overflow rectangle-edge arithmetic to infinity and enter an
unbounded grid loop. The solver now fails fast with a specific numeric-range
error, covered by a regression test, without adding another placement path.
The same review replaced a full-width overlap comparison with the equivalent
half-width form so large finite rectangles cannot overflow both sides of the
predicate and be mistaken for non-overlapping geometry.

### Documentation and secondary integration (2026-08-27)

The top-16 airway MA fixture exercised `log10_base_mean` on x and `log2fc` on y
with measured variable-width labels. Its effective factors were 168.9 px/unit
and -35.0 px/unit. Initial placement had zero overlap, zero overflow, 67.5 px
mean displacement, and 154 px p95 displacement. All 40 settled zoom steps were
overlap-free, and the reverse trace reproduced every matching-domain offset
exactly. Visual inspection confirmed that leader lines retained their original
data-point endpoints.

The durable documentation example uses ten small inline rows rather than the
external airway asset. It composes `measureText`, priority sorting,
`displace2d`, centered text, and leader rules. Browser smoke testing passed, and
the checked-in screenshot shows non-overlapping labels. Structured SVG export
contained all ten text labels and ten leader lines with no warnings or raster
fallback. The generated schema/type links, Zensical build, Core TypeScript
check, lint, and 48 focused solver/transform/schema tests passed.
The final workspace TypeScript run passed in every participating package. The
complete Vitest run passed 393 files and 3,286 tests, with one existing skip and
two existing todos. Shared-example schema and initialization coverage includes
the new documentation example.

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
6. Commit the user-recording diagnosis and corrective plan before changing the
   solver again.
7. Commit temporal coherence and ordinary-trace overflow fixes after the
   retained-state review gate and before/after browser verification pass.
8. Commit selected-anchor clearance with its public grammar, example, and
   documentation after the public-contract review gate passes.
9. Before PR creation, commit the fully reconciled plan with every task marked
   completed or discarded, then delete the temporary plan in a later commit.

Use Conventional Commit messages with rationale-focused bodies. Run the
narrowest relevant verification before each checkpoint so intermediate commits
remain useful for review and bisection.

## Correctness and interaction invariants

- Every input row receives exactly two finite signed displacement values.
- Output rectangles do not overlap. They remain inside preferred extents when
  their accepted local candidate satisfies them and follow the documented
  deterministic overflow policy after local-search exhaustion. Overflow is not
  a statement about global feasibility.
- Rectangle interiors define overlap; touching edges are allowed.
- A fresh solve produces equal output for equal explicit inputs. A stateful
  transform produces equal output when the same complete interaction trace is
  replayed from fresh state. Candidate generation uses deterministic basic
  arithmetic without randomness or platform-sensitive trigonometric ordering.
- Output order and datum identity follow normal modifying-transform behavior.
- Empty, singleton, coincident, heterogeneous-size, negative-factor, reversed
  screen-axis, and infeasible batches have specified behavior.
- Non-finite positions, dimensions, factors, extents, and mismatched `as` arrays
  fail fast with transform-specific messages.
- Expression-backed parameters bootstrap only after scale domains exist and
  coalesce into at most one coherent replay when their effective values change
  in one settled parameter update.
- A queued bootstrap replay after transform disposal is ignored.
- Independently reactive x/y extents can be enabled, changed, and disabled
  without retaining stale scaled bounds on either axis.
- Reactive x/y factors may change sign because 2D placement uses stable input
  order rather than `displace1d`'s scaled-position ordering requirement. Scaled
  extents are normalized after every effective factor change.
- Placement output must not feed back into the data-driven domains used to
  compute the original positions.
- During zoom increments, previous placements are only hints: every accepted
  output must still satisfy current bounds and collision checks. The benchmark
  reports p95 and maximum per-frame offset jumps and overflow transitions;
  visual inspection checks that timing alone does not mask flicker.
- When anchor dimensions are positive, every output rectangle avoids every
  selected anchor rectangle. Zero anchor width or height disables anchor
  collision for that row without affecting output-row preservation.

## Milestones

### 1. Minimal solver and contract evidence — Completed

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
- The 3-, 16-, 32-, 100-, 500-, and 2,000-label airway subsets defined above.
- This plan's algorithm decision, API question, and recorded measurements.
- No changes under the `displace1d` implementation, tests, types, or docs.

Verification:

- Run the direct baseline on sparse, clustered, coincident, mixed-size,
  edge-heavy, and infeasible fixtures at 100, 500, and 2,000 annotations.
- Freeze the canonical fixture's overflow and normalized-displacement budgets
  before choosing between the finite and rectangular-ring candidate sequences.
- If it fails a criterion, identify the bottleneck before implementing one
  targeted alternative. Record why the added complexity is necessary and its
  before/after result.
- Replay a deterministic zoom/pan trace and measure latency, raw offset changes,
  settled overlaps, and repeated-domain equality.
- Inspect output visually for displacement, edge crowding, movement, and
  overflow behavior.
- Confirm the chosen source and license obligations before adapting code.

Documentation or migration: record the selected behavior, confirmed generic
contract, measurements, and discarded alternatives in this plan. No public
contract exists yet.

Tentative commit: `feat(core): add two-dimensional displacement solver`

Review gate: maintainer review of the algorithm, public parameter shape,
performance evidence, infeasibility policy, and license/provenance decision.

### 2. Dataflow transform and public grammar — Completed

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
  negative factors, extent normalization, unchanged source domains, and one
  replay when several reactive placement properties change together.
- Transform tests independently toggle expression-backed x/y extents between
  defined and undefined values, change factor signs, and dispose the transform
  before its queued bootstrap replay. No stale extent or post-disposal replay is
  permitted.
- Tests distinguish datum-field dimensions from reactive shared dimensions so
  the overloaded public input forms cannot share accidental mutable state.
- Run focused Vitest suites with the `agent` reporter, schema checks, workspace
  TypeScript checks, and lint for touched code.
- Re-run the accepted performance fixtures. Inspect allocations only if timing
  or memory measurements identify them as a material problem.

Documentation or migration: add schema JSDoc sufficient for generated type
documentation; there is no migration because this is additive.

Tentative commit: `feat(core): add two-dimensional displacement transform`

### 3. User-facing example, documentation, and integration — Implemented

Intended outcome: demonstrate the interactive airway volcano plot with moved
text annotations, retain the airway MA plot as a secondary regression, and
verify the complete contract across renderers and interactions.

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

### 4. Temporal coherence and ordinary-trace overflow — In progress

Intended outcome: remove the visible snapping demonstrated by the first user
recording while preserving bounded synchronous work, exact collision checks,
and the transform/solver separation. The ordinary top-32 airway trace must not
use the saturation overflow path.

Affected areas and downstream consumers:

- `packages/core/src/data/transforms/displace2dSolver.js` and focused solver
  tests for explicit previous-placement hints
- `packages/core/src/data/transforms/displace2d.js` and focused transform tests
  for stable-input-order retention, batch replacement, reset/replay, and
  disposal
- The private airway volcano, MA, and stress traces; no renderer, mark, offset
  encoding, or `displace1d` changes
- This plan's deterministic-output wording and recorded measurements

Verification:

- Record the current top-32 airway baseline using the coarse and fine wheel
  traces: per-step offset jumps, overflow transitions, overlaps, and latency.
- Test one bounded previous-neighborhood ordering first. If it misses the 8 px
  p95 or 24 px maximum jump gate, compare one bounded obstacle-edge-derived
  search that can move continuously with current geometry. Select the smallest
  approach that materially improves the fixed metrics, delete all spike
  variants, and keep this milestone open until both gates pass.
- Verify fresh canonical solves and complete traces are deterministic, a new
  datum object does not inherit another datum's placement, filtered datums do
  not corrupt retained state, and disposed transforms cannot replay state.
- Repeat the 500- and 2,000-rectangle latency and allocation checks, including
  1,000 repeated replays. Retained state must remain O(live datum identities)
  and must not require manual eviction.
- Reproduce wheel zoom, inertial zoom, pan, resize, and domain restoration in
  the browser. Capture a comparable recording and require user visual approval.

Documentation or migration: update determinism and overflow documentation to
distinguish a fresh canonical solve, deterministic trace replay, and the
saturation-only overflow fallback. No public temporal option is added.

Tentative commit: `fix(core): stabilize two-dimensional displacement`

Review gate: maintainer review of retained-state ownership, deterministic trace
semantics, lifecycle safety, memory bounds, solver simplicity, and the recorded
before/after interaction evidence.

Evidence recorded on 2026-08-28:

- Real dataflow replays replaced most datum objects: 5,536 of 6,432 comparable
  identities changed in a representative wheel trace. A `WeakMap` therefore
  could not carry continuity. The transform now retains offsets by stable input
  order and discards the complete hint batch when its length changes.
- Exact retained offsets reduced changed-offset events but still produced about
  161 px p95 and 413 px maximum jumps. Trying the nearest old lattice candidate
  only reduced these to about 143 px and 379 px, so that spike was deleted.
- Projecting a colliding retained rectangle to the nearest free edge of its
  first blocking rectangle reduced p95 to about 6.3 px with zero overflow.
  Clamping retained centers to changing extents reduced p95 further to about
  4.4 px and the p95 frame maximum to about 13.2 px. Focused tests, Core type
  checking, and lint passed for commit `ea5bea42`.
- The maximum jump remains about 274 px, so the 24 px gate is not met. The
  largest events involve late-order labels and large offsets near changing
  bounds; ordinary motion is no longer the dominant failure.
- With 8 by 8 px selected anchors enabled, the fine airway trace retained an
  approximately 5.2 px p95 but increased the maximum jump to about 536 px.
  Anchor-enabled geometry is therefore the final continuity fixture; the
  earlier anchor-free maximum is diagnostic rather than an acceptance result.
- Solver-space reconstruction confirmed that the largest rendered jump is not
  scale motion: a label retained about 522 px of horizontal offset, a selected
  anchor moved only about 1.3 px into it, all four local escape edges were
  blocked, and the canonical fallback moved the label to `[0, 140]`. Other tail
  events are triggered by selected anchors or earlier-priority labels in the
  same way. A one-pass greedy solver cannot guarantee the 24 px maximum while
  also requiring exact avoidance of every fixed anchor in this dense trace.
- A 32-candidate best-first search across multiple obstacle edges increased
  churn and worsened the maximum jump to about 527 px. It was deleted. This
  rules out extending the solver with a broader graph search without new
  fixture evidence.
- Moving valid retained placements toward their anchors by one fifth of the
  smaller rectangle dimension reduced the observed maximum to about 151 px but
  increased changed-offset events from roughly 800 to more than 3,000 and made
  settled output depend on replay count. The hidden relaxation-rate spike was
  deleted because it neither passed the gate nor preserved a simple transform
  contract.

### 5. Selected-anchor clearance — Implemented; review pending

Intended outcome: prevent annotations from covering the points they annotate
through generic optional rectangle geometry, without mark inspection or an
arbitrary obstacle-data subsystem.

Affected areas and downstream consumers:

- `packages/core/src/data/transforms/displace2dSolver.js` and collision-grid
  tests for preseeded anchor rectangles
- `packages/core/src/data/transforms/displace2d.js` and tests for scalar, field,
  and reactive `anchorWidth`/`anchorHeight` inputs
- `packages/core/src/spec/transform.d.ts`, generated schema consumers, the
  displace2d documentation, and the canonical annotation example
- Existing WebGL, picking, SVG, and leader-line composition through unchanged
  offset channels

Verification:

- Cover heterogeneous anchors, zero-sized disabled anchors, edge touching,
  coincident anchors, reversed factors, reactive geometry, and infeasible
  batches while preserving every output row.
- Require zero label-to-label and label-to-selected-anchor intersections across
  the airway zoom traces. Report displacement and saturation overflow changes
  introduced by anchor clearance.
- Repeat the accepted performance fixtures. Preseeding anchors must reuse the
  one existing collision grid and retain O(n) working memory.
- Inspect the airway examples for clear association, leader-line attachment,
  tooltips, clipping, and point visibility. Avoidance of unrelated background
  points is neither claimed nor silently approximated.
- Run focused tests, schema/docs checks, workspace TypeScript checks, lint, and
  the full unit suite before renewed user acid testing.

Documentation or migration: document the optional anchor geometry forms,
pixel units, all-selected-anchor semantics, zero default, and the explicit
cross-layer obstacle non-goal. Update the example to include point clearance.

Tentative commit: `feat(core): support anchor clearance in displace2d`

Review gate: maintainer review of the public geometry contract, transform
abstraction level, downstream schema/docs agreement, placement quality, and
whether the added code remains smaller than a general obstacle-source design.

Evidence recorded on 2026-08-28:

- Commits `539cc966` and `0ad8c76e` add one generic preplaced-obstacle solver
  input and optional scalar, field, or reactive `anchorWidth` and
  `anchorHeight` transform fields. The solver still returns only signed x/y
  offsets. Omitting either public field keeps the former no-obstacle allocation
  path.
- Zero-sized and heterogeneous obstacle tests pass, including an all-output to
  all-anchor intersection check. The focused solver, transform, and schema
  suites pass with 59 tests; Core type checking and lint pass.
- The schema/docs preparation build succeeded, generated type documentation was
  up to date, and the canonical docs example now reserves 10 by 10 px anchors.
- The corrected top-32 airway wheel trace reported zero intersections across
  198 captured frames with numerical tolerance for touching edges, and zero
  overflow. The private volcano and MA specs reserve 8 by 8 px selected
  anchors.
- On the deterministic private benchmark, anchor-enabled p95 solver time was
  0.06 ms for 100, 0.91 ms for 500, and 12.23 ms for 2,000 rectangles. The
  corresponding anchor-free p95 values were 0.09, 0.34, and 7.84 ms.
- The Core screenshot harness passed the airway volcano, airway MA, 500-label
  stress, overflow, and reversed-axis specs. The app harness passed slider,
  wheel, and resize checks in 23--38 ms. Visual inspection confirmed point
  clearance and attached leader lines; renewed user acid testing is pending.
- The repository-wide unit suite passes with 3,296 tests, one skipped, and two
  todo across 393 files. Every workspace TypeScript check passes.

## Reconciliation through the first user acid test (2026-08-28)

The plan is reconciled to the implemented branch but is intentionally not ready
to retire. No pull request will be prepared until the private examples have been
used for sustained manual testing and the user approves the behavior.

Completed:

- The pure solver, transform adapter, public grammar, generated schema links,
  documentation, inline example, and shared-example snapshot are implemented.
- Determinism, preferred bounds, overflow, heterogeneous dimensions, reactive
  scale and extent updates, lifecycle disposal, and numeric failure modes have
  focused automated coverage.
- The airway volcano and MA data were exercised temporarily with real
  `measureText` geometry. Browser WebGL, zoom traces, and structured SVG export
  were verified, and performance measurements are recorded above.
- The pre-interaction maintainer-style review confirmed the intended
  abstraction boundary: generic rectangle inputs, signed offset outputs, one
  solver, no renderer coupling, and no changes to `displace1d`. Milestone 4
  subsequently added private retained-placement hints inside the transform;
  that state still requires its review gate before PR preparation.
- The ignored `private/displace2d-acid/` suite now covers the 12,000-row airway
  volcano and MA plots, 500 heterogeneous labels, coincident-label overflow,
  and reversed axes. It includes repeatable screenshot and app smoke scripts.
- All five private specs initialized and rendered without browser errors. The
  app smoke exercised each label-count slider at its minimum, maximum, and
  default, then wheel-zoomed and resized each parameterized plot. Updates
  reached two subsequent animation frames in 17--39 ms in headless Chromium.
- The full unit suite passes with 3,296 tests passing, one skipped, and two
  todo after the final numeric review fixes.

Discarded:

- The original retained-placement spike remains deleted because its raw churn
  metric did not distinguish smooth clamping from jumps. Retained placement is
  now reopened under milestone 4 with explicit jump, overflow-transition, and
  user-visual criteria derived from the recording.
- Vega's occupancy bitmap, force relaxation, workers, pluggable strategies,
  arbitrary obstacle sources, visibility outputs, and renderer-specific
  animation remain unnecessary for the measured corrective scope.
- The external airway Arrow table will not be copied into the repository. The
  permanent docs example uses small inline data; private examples may reference
  the published content-addressed asset for local testing.
- No renderer-specific code or new permanent picking/SVG implementation test
  was added. Existing offset channels own those semantics, while the integrated
  SVG smoke test confirmed all displaced labels and leader lines.

Pending before PR preparation:

- Complete milestone 4 temporal coherence and ordinary-trace overflow work,
  including before/after recording evidence and the retained-state review gate.
- Complete milestone 5 selected-anchor clearance and its public-contract review
  gate without expanding into renderer or cross-layer obstacle inspection.
- Manually exercise resize, wheel and inertial zoom, pan, domain restoration,
  clipping, tooltip/picking alignment, long interaction sessions, and visual
  association through leader lines.
- Address findings from user testing, repeat proportionate automated and
  browser verification, and obtain explicit user approval.
- Reconcile every remaining acceptance item, commit that final record, and
  delete this temporary plan in a later commit. Only then prepare a pull
  request.

## Final integration acceptance criteria

- A documented `displace2d` spec labels the airway volcano fixture and visibly
  recomputes during zoom, pan, and resize without blocking or blinking. The MA
  regression confirms conversion from data-domain endpoints to pixel offsets.
- The solver and transform meet the accepted performance and interaction-
  continuity thresholds on the recorded fixtures.
- Every row is preserved and receives deterministic x and y offsets. Output
  rectangles are non-overlapping, avoid selected anchors when configured, and
  accepted local candidates respect the documented preferred bounds. Ordinary
  airway interaction does not enter overflow; saturation fixtures follow the
  overflow rule without claiming global infeasibility.
- The transform remains dataflow-only, the solver remains pure, and no new
  rendering special cases or runtime dependencies are introduced.
- `displace1d` implementation, tests, public types, and documentation remain
  unchanged; any issue discovered there is out of scope for this pull request.
- WebGL display, picking/tooltips, clipping, and structured SVG export agree on
  the displaced positions.
- Public types, generated schema, documentation, navigation, and example specs
  agree on parameter names, defaults, units, and limitations.
- Required BSD attribution is present for closely adapted Vega code; no GPL
  ggrepel source has been copied or translated.
- Relevant focused tests, schema/docs checks, TypeScript checks, and lint pass.
- The production change contains one solver path and no unused strategy,
  cache abstraction, worker, transition path, or compatibility abstraction.
  Retained placements consist only of datum-identity hints owned by the
  transform, and anchor obstacles reuse the existing collision grid.
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

- **Displacement jumps during zoom.** Measure p95 and maximum per-step offset
  changes after subtracting anchor motion, count overflow transitions, replay
  the same trace from fresh state, and inspect comparable recordings. Prefer
  valid prior placement without adding public continuity controls.
- **Path-dependent placement.** Retained hints intentionally trade repeated-
  domain canonical output for continuity. Require deterministic complete trace
  replay, keep the pure solver explicit, and key state only by datum identity.
- **Animation masking unstable placement.** Do not add displace2d-specific
  interpolation. It would allow transient overlaps and couple dataflow output
  to rendering. Consider general per-datum transitions only in a separate
  proposal after stable placement passes visual testing.
- **Premature optimization.** Preserve the direct solver as the measured design
  baseline. Add one broad-phase optimization only if profiling shows that
  rectangle scans cause a budget failure; do not retain two production paths.
- **Dense or search-exhausted bounds.** Preserve every row and use the
  deterministic right-side overflow row for saturation rather than emitting
  visibility, silently accepting overlaps, or running an unbounded search.
  Treat overflow in the ordinary top-32 airway trace as a solver failure.
- **Duplicate reactive work.** Coalesce all expression-backed placement
  invalidations and test that a settled multi-property change causes at most
  one replay.
- **Stale derived bounds.** Derive scaled bounds coherently from the current
  source extents and clear each axis explicitly when its extent is disabled.
- **Deferred work after disposal.** Guard the queued bootstrap replay with the
  transform lifecycle so removed views cannot replay stale branches.
- **Expression/data-domain feedback.** Reuse `displace1d` bootstrap and collector
  replay patterns and test data-driven x and y domains explicitly.
- **API overfitting to text labels.** Define the solver in terms of rectangle
  centers and extents and keep text measurement, styling, and leader-line
  rendering outside the transform.
- **Obstacle-scope creep.** Accept only centered anchor rectangles belonging to
  the current input batch. Do not inspect marks or add cross-stream obstacle
  data until selected-anchor avoidance has been implemented and acid-tested.
- **Premature generalization.** Ship one measured solver with generic geometry
  inputs and offset outputs; keep algorithm selection and renderer obstacle
  avoidance out of the public API.

## Unresolved questions

1. Does a small finite candidate sequence meet the placement-quality fixture,
   or is a fixed-budget rectangular-ring sequence justified? The right-side
   overflow row is already the termination rule. Resolve the candidate sequence
   inside the solver and keep its controls out of the first public API.
2. Are separate x/y position factors and extents clearer than paired parameters?
   Prefer the form that most closely preserves `displace1d` semantics and keeps
   expression-backed replay straightforward.
3. Does the bounded previous-neighborhood ordering meet the fixed 8 px p95 and
   24 px maximum jump gates? If not, which single obstacle-edge-derived search
   replaces the discrete lattice with the least code while preserving zero
   overlap and zero ordinary-trace overflow?
4. Does the direct rectangle scan meet the performance budget? Only if it fails,
   which single acceleration structure fixes the measured bottleneck with the
   least code and memory?
5. After selected-anchor clearance, does visual review still require avoiding
   unrelated background points? If so, stop and design a separate generic
   cross-stream obstacle contract rather than extending the anchor fields or
   inspecting rendered marks.

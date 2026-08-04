# `displace1d` Transform and Protein Lollipop Plot

## Summary

Add a scale-independent `displace1d` data transform that preserves every input
item and computes the minimum one-dimensional displacement needed to prevent
overlaps. The transform will solve the placement problem with pool-adjacent
violators (PAVA), emit the displacement as a numeric field, and accept a
reactive position multiplier that callers can couple to zoom and layout.

The first consumer will be `private/protein-lollipop-sketch.json`, using
`plans/displace1d/lolliplot.xaxis-1.png` from the trackViewer vignette as a
visual reference. Vertical mutation labels, points, and vertical stems will use
the computed field through the `xOffset` channel. A connector will join the
displaced lollipop to its true protein coordinate by applying the offset to only
one endpoint.

The transform will recompute the exact layout at the current zoom level rather
than attenuating a fixed zoomed-out solution. As the primary positions spread
apart, the minimum required displacement naturally decreases to zero. Items at
identical coordinates remain displaced because zooming cannot separate them.

`filterScoredLabels` will not be refactored as part of this work. Its fused
visible-range lookup, top-k selection, and overlap filtering serve a different
large-data use case and have a substantially stricter hot-path performance
contract.

## Context

The initial mathematical proposal is documented in
[`one-dimensional-item-placement.md`](./one-dimensional-item-placement.md).
For sorted original centers `o[i]`, full collision lengths `l[i]`, and adjusted
centers `p[i]`, adjacent items must satisfy:

```text
p[i + 1] - p[i] >= l[i] / 2 + l[i + 1] / 2
```

Callers include any desired padding in the collision length. A uniform gap does
not need a separate parameter because adding the gap to every full length
produces the same adjacent separation.

The objective is:

```text
minimize sum((p[i] - o[i])^2)
```

GenomeSpy already has the required architectural pieces:

- Transform grammar types are declared in
  `packages/core/src/spec/transform.d.ts` and registered in
  `packages/core/src/data/transforms/transformFactory.js`.
- `measureText` produces pixel widths for downstream layout transforms.
- Expression references can react to scale and layout parameters. GenomeSpy's
  positional scales use unit ranges, while `width` and `height` expose viewport
  dimensions in logical pixels.
- `xOffset` and `yOffset` accept unscaled numeric fields in logical pixels when
  `scale` is `null`.
- The sashimi example demonstrates reactive coupling between scales through
  `domain("x")`, but fixed attenuation is not sufficient to maintain the
  non-overlap guarantee for this use case.

## Goals

- Provide a deterministic transform for non-overlapping one-dimensional
  placement of explicitly ordered input.
- Support variable item lengths measured in logical pixels.
- Minimize total squared displacement from primary-scale positions.
- Produce a pixel displacement suitable for direct `xOffset` or `yOffset`
  encoding.
- Recompute placement when a reactive position multiplier changes.
- Let displacement naturally diminish during zoom and reach zero when the
  undisplaced items fit.
- Keep input data branches isolated by emitting owned output objects.
- Keep the transform's scope and retained state small, accepting modest
  per-update allocation for datasets of at most a few hundred items.
- Demonstrate the transform in the private protein lollipop visualization.
- Document the public transform contract and scale-coupling recipe.

## Non-goals

- Refactoring or decomposing `filterScoredLabels`.
- Replacing the top-k and reservation-map algorithms used by RefSeq gene
  annotation tracks.
- General two-dimensional label placement or arbitrary mark avoidance.
- Hiding lower-priority items when all items cannot be shown.
- Supporting outer viewport bounds in the first version. Bounds require a
  policy for offscreen items during pan and zoom and can make a layout
  infeasible.
- Weighted displacement objectives, preferred movement directions, or
  user-selectable solvers in the first version.
- Promoting the protein lollipop visualization into the public examples or
  documentation gallery during the initial implementation.
- Reconstructing mark geometry through bespoke pixel-coordinate calculations.
  The visualization should read as a natural composition of grammar
  transforms, encodings, scales, offsets, and mark layers. Ordinary expressions
  remain available where they express concise data or styling logic.
- Copying trackViewer or Vega label-placement code. Their behavior is used only
  for comparison and design context.

## Key decisions

### Use PAVA for the placement solver

For adjacent required separations

```text
s[i] = l[i] / 2 + l[i + 1] / 2
```

define cumulative separations `c[0] = 0` and
`c[i + 1] = c[i] + s[i]`. Substituting

```text
q[i] = p[i] - c[i]
t[i] = o[i] - c[i]
```

turns the separation constraints into `q[i] <= q[i + 1]`. Ordinary
least-squares isotonic regression of `t` produces the globally optimal `q`;
the adjusted centers and displacements are then recovered as:

```text
p[i] = q[i] + c[i]
displacement[i] = p[i] - o[i]
```

PAVA is deterministic and linear for ordered input. The transform will read
values through ordinary GenomeSpy field accessors. Sorting is an explicit
upstream concern; a `collect` transform can both sort the batch and serve as its
reactive replay boundary.

### Recompute from reactively scaled positions instead of scaling a fixed solution

Before solving, the transform multiplies every original position by a numeric
`positionFactor`. The factor may be an expression reference, allowing the spec
to provide the coordinate conversion without hardwiring the transform to a
particular scale or view:

```json
"positionFactor": {
  "expr": "width * (scale('x', 1) - scale('x', 0))"
}
```

For an affine x scale, the expression is the signed number of logical pixels
per position unit. It reacts to both the x scale and the viewport width.

This provides the desired zoom behavior without coupling the `xOffset` scale's
domain or range to the primary scale:

- At the fully zoomed-out domain, crowded items receive the full required
  displacement.
- When zooming in, primary pixel distances grow and the new optimum requires
  less displacement.
- Once all distinct adjacent positions satisfy the separation constraints, all
  displacements are zero.
- Coincident positions remain separated, preserving the no-overlap contract.

A fixed expression such as
`displacement * span(domain("x")) / initialSpan`, inspired by the sashimi
example, would be simpler but could reintroduce overlap before the primary
positions have separated. It is therefore rejected for the correctness path.

### Emit displacement in scaled-position units and disable the offset scale

The output field uses the same units as `pos * positionFactor` and `length`.
When those units are logical pixels, consumers must encode it without a scale:

```json
"xOffset": {
  "field": "xDisplacement",
  "type": "quantitative",
  "scale": null
}
```

The transform will not change the original primary-position field or filter
rows. Consequently, downstream primary-position domains remain based on the
original data. Only the factor expression and output offset depend on the
current scale.

### Keep the transform independent from `filterScoredLabels`

The transforms have different semantics and expected cardinalities:

- `filterScoredLabels` searches a large visible slice, selects a bounded top-k
  subset, and drops labels that do not fit. It may be reevaluated 60–120 times
  per second over source data containing tens of thousands of rows.
- `displace1d` preserves all items and solves a small convex layout problem.
  The protein use case is expected to contain at most a few hundred rows.

Only narrowly reusable lifecycle code should be shared, and only if the
implementation reveals clear duplication. A new inheritance hierarchy or a
public decomposition of `filterScoredLabels` is not part of this proposal.

## Proposed grammar

Add `Displace1DParams` to `packages/core/src/spec/transform.d.ts` and the
`TransformParams` union:

```ts
export interface Displace1DParams extends TransformParamsBase {
  type: "displace1d";

  /** Field containing the original position. */
  pos: Field;

  /** Constant or field containing the item's full collision length. */
  length: number | Field;

  /** Multiplier that converts positions into collision-space units. */
  positionFactor?: number | ExprRef;

  /** Output field for the signed displacement. */
  as?: string;
}
```

Defaults:

- `positionFactor`: `1`
- `as`: `"displacement"`

Contract and validation:

- `pos` values must be finite numbers.
- A constant `length`, or values read from a `length` field, must be finite and
  non-negative.
- `positionFactor` must evaluate to a finite number. A single factor describes
  affine mappings, including linear quantitative and index scales. Nonlinear
  and locus-scale mappings are not supported directly.
- Input must be ordered by ascending `pos * positionFactor`. Sort `pos`
  ascending for a positive factor and descending for a negative factor.
- Equal positions preserve their incoming order.
- The transform preserves all rows and their propagation order.
- `as` is overwritten on transform-owned output rows.
- Pixel-valued output is intended for an offset channel with `scale: null`.

Allowing a constant `length` keeps simple cases declarative without requiring a
formula-generated field. A field remains available for variable-width items,
including horizontally oriented labels measured with `measureText`.

The transform itself is axis-neutral. A y-oriented caller can provide an
equivalent expression using `height` and the y scale.

## Transform implementation

### Data ownership and retained state

Implement `Displace1DTransform` as a conventional collecting and cloning flow
node. It buffers only the current batch, solves it during `complete`, emits
owned output rows in incoming order, and releases the batch. It does not retain
output rows or act as its own replay source.

The persistent state is limited to field accessors, the current position
factor, and its expression subscription. PAVA arrays and output clones are
batch-local. This accepts modest allocation in exchange for a smaller transform
with clearer ownership.

Place a sorting `collect` immediately upstream in reactive specifications. The
collector materializes and sorts the input once, then replays the already-sorted
batch without rerunning earlier transforms or the data source.

### Lifecycle

1. The constructor validates static parameters, creates field accessors, and
   activates a reactive `positionFactor` expression when provided.
2. `handle` buffers input rows without solving.
3. On initial `complete`, the transform:
   - emits zero-displacement clones when a scale-dependent factor has not yet
     been evaluated, allowing the original positions to establish domains;
   - evaluates the factor and requests one upstream replay.
4. On a normal `complete`, the transform validates the ordered scaled
   positions and lengths, solves the batch, emits owned rows, and releases the
   buffered input.
5. An expression update requests standard `FlowNode.repropagate()`. The nearest
   upstream collector supplies the sorted batch again.
6. `dispose` removes the expression subscription.

The expression runtime provides dependency tracking and disposal; the
transform does not know which scale or layout parameters the expression uses.

### Scale and domain behavior

The solver operates on screen positions derived from:

```text
pos * positionFactor
```

The sign of the factor captures reversed affine scales. Because the transform
neither filters rows nor modifies `pos`, its output does not change the primary
data domain. The implementation should verify that adding the transform does
not create a scale-domain feedback loop.

Every factor update replays the sorted collector and runs the linear solver.
The expected item count makes batch-local cloning and scratch allocation
acceptable. Translation is intentionally absent from the factor because it
does not change optimal displacements for unbounded affine placement.

### Solver placement and provenance

Keep the mathematical solver independently testable, either as named exports
from `displace1d.js` or as a small adjacent utility if the transform module
would otherwise become difficult to read. Implement it directly from the
isotonic-regression formulation; do not adapt trackViewer source code.

Add an attribution comment near the solver describing it as a PAVA-based
isotonic-regression formulation and linking to a durable source. Also reference
the local mathematical note for the separation-to-monotonic transformation.

## Protein lollipop visualization

Modify `private/protein-lollipop-sketch.json`; do not move or copy the
visualization into `examples/` during this work.

Use `plans/displace1d/lolliplot.xaxis-1.png` as a structural and stylistic
reference, without requiring an exact visual match. Important characteristics
to preserve are displaced lollipop heads, lower connectors that return to the
true protein coordinate, upper guide rules, values inside the heads, and
vertical mutation labels.

### Grammar-native construction

Build the visualization primarily from existing declarative grammar features:

- Data fields and ordinary expressions or `formula` transforms for semantic
  data derivation and concise styling logic.
- `displace1d` for the only screen-space placement computation.
- Shared primary scales and scale-less `xOffset` encoding.
- Layered point, text, rule, link, and rect marks.
- Constant normalized positions, mark offsets, or data-domain values where the
  grammar already defines their meaning.

Expressions are not prohibited. The scale coupling should use only built-in
`scale` and `width` expression parameters; it must not need a bespoke coordinate
helper or calculate exact connector pixel coordinates. The finished spec should
give the impression that this chart is a natural composition of GenomeSpy's
grammar.

### Data preparation

On the mutation view, sort positions with `collect`, then apply `displace1d`
before the child layers. The collector is both the ordering step and the replay
boundary. Use a constant collision length based on the horizontal footprint of
the lollipop head and vertical label glyph width, including the desired
separation padding. Do not measure or otherwise incorporate mutation-label
string length: vertical labels extend primarily in the y direction and their
text length is not part of this plot's horizontal placement model.

Set `positionFactor` to
`width * (scale('x', 1) - scale('x', 0))` so the collision space follows the
shared x scale and mutation-view width.

If the labels are given a slight angle instead of exactly `-90` degrees, retain
the same constant collision length. The angled variant is an aesthetic option,
not a request for projected text-bounds computation.

Set a shared mutation-view encoding:

```json
"xOffset": {
  "field": "xDisplacement",
  "type": "quantitative",
  "scale": null
}
```

### Layers

Build the mutation track from declarative layers sharing the same transformed
rows:

- **Points:** lollipop heads at `position + xDisplacement` and `count`.
- **Point values:** centered text inside the lollipop heads, showing the count
  or score when it fits legibly.
- **Upper guides:** vertical dashed rules rising from the lollipop heads toward
  a common label region, using the same `xOffset`.
- **Mutation labels:** vertical text above the upper guides, normally using
  `angle: -90`; a modestly less vertical angle is acceptable. The labels use
  the same `xOffset`, but their string lengths do not affect displacement.
- **Vertical stems:** rules at the displaced x position from the lollipop head
  toward a fixed elbow region near the protein track.
- **Diagonal connectors:** a `link` with `linkShape: "diagonal"` or a straight
  rule from the displaced elbow to the original protein coordinate. The
  displaced endpoint uses `xOffset`; the original endpoint uses an explicit
  `x2Offset: 0`.
- **True-position anchors:** optional short rules at the undisplaced protein
  coordinate, using an explicit zero offset.

The protein backbone and domain rectangles remain in the lower view. The
mutation and protein views continue to share the primary x scale so pan and
zoom preserve alignment.

The private visualization should clearly demonstrate:

- Non-overlapping labels at the full protein domain.
- Vertical or slightly rotated mutation labels aligned with their upper guides.
- Visible diagonal connectors for displaced mutations.
- Decreasing offsets while zooming in.
- Zero offsets for sufficiently separated distinct mutations.
- Persistent separation of mutations that share exactly the same coordinate.

## Documentation

Although the first lollipop visualization remains private, `displace1d` is a
public grammar feature and needs concise user-facing documentation:

- Add `docs/grammar/transform/displace1d.md` with behavior, the
  `positionFactor` contract, `scale: null` offset encoding, zoom semantics, and
  the schema macro.
- Add the page to the transform navigation in `zensical.toml`.
- Update `docs/grammar/transform/measure-text.md` to mention `displace1d` as a
  downstream consumer of measured widths.
- Do not add a public protein example or an `EXAMPLE` macro in this change.
- Regenerate or validate schema-derived documentation after adding the new
  `Displace1DParams` type.

## Testing strategy

### Pure solver tests

Add focused tests for:

- Already separated equal-length items produce zero displacement.
- A two-item collision is resolved symmetrically.
- A multi-item cluster produces the expected least-squares solution.
- Variable collision lengths, including caller-provided padding, satisfy every
  adjacent constraint.
- Equal positions use stable input order.
- Output positions remain ordered.
- The result is deterministic across repeated solves with reused storage.
- Empty and single-item inputs.
- Invalid positions and lengths fail with clear messages.

Use representative assertions for the optimization objective and separation
constraints rather than exhaustively pinning internal PAVA block state.

### Transform lifecycle tests

Add tests near `displace1d.js` covering:

- Grammar parameters and defaults.
- Correct pixel displacement from a scale- and width-dependent factor.
- `scale: null` offset consumption without changing the primary x domain.
- Expression dependency changes recompute displacement.
- Zooming in reduces displacement and eventually produces zero for distinct
  positions.
- Coincident positions remain displaced after zoom.
- Width-dependent expressions recompute after layout changes.
- Output propagation order matches input order.
- Upstream rows are not mutated.
- A sorted upstream collector supplies reactive replays.
- Unsorted scaled positions fail with a clear error.
- Reactive replays produce fresh owned output rows.
- Expression subscriptions are removed on disposal.
- A negative factor accepts raw positions sorted in descending order.

Use a fake expression runtime for focused lifecycle tests and one
initialized-view integration test for actual scale/layout wiring.

### Visualization verification

- Validate the private JSON against the generated schema.
- Run the development server and inspect the private spec at the full domain,
  an intermediate zoom, and a close zoom.
- Compare the overall composition with
  `plans/displace1d/lolliplot.xaxis-1.png`, without treating pixel equality as
  an acceptance criterion.
- Verify that the protein domains remain anchored to true coordinates and that
  only the intended connector endpoint is displaced.
- Check tooltips and picking on displaced points.
- Check a narrow viewport to identify label overhang; viewport-bound placement
  remains out of scope.

### Repository checks

Run, at minimum:

```sh
npx vitest run packages/core/src/data/transforms/displace1d.test.js
npm -w @genome-spy/core run test:tsc
npm -w @genome-spy/core run build:schema
npm run lint
```

Run the full unit suite when the focused tests, schema build, and private visual
verification pass.

## Implementation steps

### Step 1: Add and verify the pure placement solver

**Outcome:** A deterministic PAVA implementation computes minimum squared
displacement for ordered variable-length items.

**Affected areas:**

- `packages/core/src/data/transforms/displace1d.js` or a small adjacent solver
  module
- Focused solver tests

**Verification:** Solver unit tests for optimality examples, separation,
variable lengths, stable ties, invalid inputs, and reusable workspace.

**Documentation or migration:** Add source attribution and reference the local
mathematical note. No migration.

**Tentative commit:** `feat(core): add one-dimensional displacement solver`

### Step 2: Integrate `displace1d` with the grammar and dataflow

**Outcome:** Specs can apply the transform and receive a displacement field
that updates when a reactive position factor changes.

**Affected areas:**

- `packages/core/src/spec/transform.d.ts`
- `packages/core/src/data/transforms/displace1d.js`
- `packages/core/src/data/transforms/transformFactory.js`
- Transform lifecycle and initialized-view tests

**Verification:** Focused Vitest suites, TypeScript checks, schema generation,
domain-stability checks, sorted-input validation, collector replay checks, and
disposal tests.

**Documentation or migration:** No existing specs change. The new transform is
additive.

**Tentative commit:** `feat(core): add reactive displace1d transform`

### Step 3: Document the transform contract

**Outcome:** Users can understand position conversion, scale-less offset
encoding, and zoom behavior without reading implementation details.

**Affected areas:**

- `docs/grammar/transform/displace1d.md`
- `docs/grammar/transform/measure-text.md`
- `zensical.toml`

**Verification:** Schema-derived docs generation and documentation build or
serve smoke test.

**Documentation or migration:** Document that viewport bounds and locus
coordinate pairs are not supported initially. No migration.

**Tentative commit:** `docs(core): document the displace1d transform`

### Step 4: Build the private protein lollipop prototype

**Outcome:** The private visualization uses `displace1d` for non-overlapping
mutation labels and connects displaced lollipops to true protein coordinates.

**Affected areas:**

- `private/protein-lollipop-sketch.json`

**Verification:** Schema validation and browser inspection at multiple zoom
levels and viewport widths, including picking and tooltip checks.

**Documentation or migration:** Keep the visualization private. Do not add it
to public navigation or docs.

**Tentative commit:** `feat(core): add displaced protein lollipop prototype`

### Step 5: Run regression checks and review allocation behavior

**Outcome:** The feature is ready for review without regressions in existing
transforms, scale domains, or rendering behavior.

**Affected areas:** Test expectations or focused comments only if needed; no
new production abstractions should be introduced solely for this step.

**Verification:** Full unit suite, lint, workspace TypeScript checks, schema
build, and a browser smoke test of both the protein prototype and an existing
`filterScoredLabels` RefSeq example.

**Documentation or migration:** Record any deferred bounds, locus, or public
example work in follow-up notes rather than expanding this implementation.

**Tentative commit:** `test(core): cover displace1d zoom integration`

## Alternatives considered

### Scale a fixed zoomed-out displacement

Compute PAVA once at the initial domain and multiply its result by an inverse
zoom factor or current-domain-span ratio.

**Rejected:** It is not collision-safe. Required displacement is not generally
proportional to inverse zoom, cluster membership changes as gaps open, and
coincident positions never separate through zoom.

### Add a dedicated zoom expression helper

Use a new expression helper to control an offset range or expression.

**Deferred:** It may be useful for cosmetic scale coupling, but exact
recomputation already provides the required behavior and does not need new
expression API surface.

### Use trackViewer-style jitter

Detect crowded clusters and spread them heuristically around their centers.

**Rejected:** The result depends on tuning and recursive adjustment and does
not provide the minimum-displacement contract. GenomeSpy can solve the small
protein case exactly.

### Use a general two-dimensional label transform

Adopt an anchor-search or bitmap labeler similar to Vega's label transform.

**Rejected:** Such methods solve a broader problem, may hide labels or move
them vertically, and do not directly produce the shared one-dimensional offset
needed by points, stems, and connector endpoints.

### Reuse or decompose `filterScoredLabels`

Express visibility, ranking, and overlap filtering as smaller public
transforms, then reuse them for lollipops.

**Rejected for this feature:** `filterScoredLabels` is optimized for a different
large-data selection problem. Generic decomposition could increase
intermediate propagation and allocation during high-frequency zoom updates.
The protein case needs displacement rather than filtering and contains only a
few hundred rows.

## Risks and mitigations

### Initialization and scale-domain cycles

The factor expression may read the primary scale while the same rows establish
that scale's data domain.

**Mitigation:** Preserve original primary coordinates and all rows. The
expression runtime reevaluates after scale and layout initialization. Add a
domain-stability integration test.

### Reentrant expression notifications

Repropagation can notify collectors while an expression-driven solve is in
progress.

**Mitigation:** Keep the output field out of the primary scale's domain and test
repeated factor updates.

### Incorrect secondary endpoint offset

Mark offset fallback rules can cause both ends of a connector to inherit the
same offset, making the connector vertical rather than linking to the true
coordinate.

**Mitigation:** Encode the original endpoint explicitly and set its secondary
offset to zero. Verify the rendered geometry in the private prototype.

### Label metrics and rendered text diverge

The fixed collision length may be too small if vertical labels use a large font
or are rotated far from vertical.

**Mitigation:** Keep labels vertical or only slightly angled and choose the
constant collision length from the lollipop-head diameter and label font size.
Projected text-bounds computation is unnecessary for this prototype.

### Edge overhang

Unbounded minimum-displacement placement may move the first or last label past
the view edge.

**Mitigation:** Use view padding in the private prototype and document that
viewport bounds are deferred. Do not silently distort or drop items.

### Excessive per-frame allocation

Collector-driven replay creates short-lived output rows and solver arrays at
animation frequency.

**Mitigation:** The target dataset contains at most a few hundred rows. Keep the
implementation simple and profile representative 120 Hz updates before adding
retained state or generic replay optimizations.

## Unresolved questions and deferred extensions

None of these blocks the initial implementation:

- Should a future bounded mode solve only visible items, include buffered
  offscreen items, or keep every item within the viewport? This needs an
  explicit pan/zoom contract.
- Should a future mapping expression support nonlinear or locus scales, or
  should callers linearize genomic coordinates before displacement?
- Should later versions support independent `groupby` layouts for multiple
  one-dimensional lanes?
- After the private visualization stabilizes, should it be promoted to a
  public genomic-data example and used as the transform's interactive docs
  example?
- If other features need cosmetic zoom attenuation, should GenomeSpy add a
  dedicated zoom expression helper?

## Acceptance criteria

- The schema accepts the documented `displace1d` parameters and rejects
  invalid shapes.
- At the full protein domain, mutation collision intervals do not overlap.
- The computed layout is deterministic, order-preserving, and minimizes the
  stated squared-displacement objective.
- Zooming or resizing recomputes offsets through a reactive position factor.
- Offsets become zero when distinct primary positions have enough pixel
  separation.
- Coincident positions remain separated at every zoom level.
- The displacement field is consumed through `xOffset` with `scale: null`.
- Points, labels, and vertical stems share the displaced endpoint.
- Mutation labels are vertical or slightly angled, and label string length is
  not an input to `displace1d` in the private visualization.
- Diagonal connectors terminate at the original protein coordinate.
- The visualization reads as a natural composition of existing grammar
  constructs. Expressions may support ordinary data or styling logic, but do
  not reconstruct the primary scale or hand-compute mark pixel geometry.
- The transform preserves input rows and propagation order.
- The private specification explicitly sorts and buffers input with `collect`.
- Unsorted scaled positions are rejected.
- Zoom-driven recomputation uses standard upstream repropagation.
- The expression subscription is removed when the transform is disposed.
- Existing `filterScoredLabels` behavior and performance-sensitive code remain
  unchanged.
- The new visualization remains under `private/`.
- Focused tests, TypeScript checks, schema generation, lint, full unit tests,
  and browser verification pass.

## Sources and provenance

- The separation-to-isotonic formulation is described in the local
  [`one-dimensional-item-placement.md`](./one-dimensional-item-placement.md).
- PAVA is an established linear-time method for ordered least-squares isotonic
  regression. See: Busing,
  [_Monotone Regression: A Simple and Fast O(n) PAVA Implementation_](https://doi.org/10.18637/jss.v102.c01).
- trackViewer's lollipop implementation provides the visual precedent and uses
  recursive heuristic jittering for crowded labels. It is comparison material
  only; no code will be copied:
  [trackViewer `grid.lollipop.R`](https://rdrr.io/bioc/trackViewer/src/R/grid.lollipop.R).
- The concrete visual reference from the trackViewer vignette is stored at
  `plans/displace1d/lolliplot.xaxis-1.png`.
- Vega's general label transform is a comparison point for broader 2D label
  placement:
  [Vega Label Transform](https://vega.github.io/vega/docs/transforms/label/).
- GenomeSpy's existing reactive cross-scale example is
  `examples/docs/examples/genomic-data/sashimi-plot.json`.

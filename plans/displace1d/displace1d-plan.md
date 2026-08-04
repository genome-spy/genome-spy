# `displace1d` Transform and Protein Lollipop Plot

## Summary

Add a scale-aware `displace1d` data transform that preserves every input item
and computes the minimum horizontal or vertical pixel displacement needed to
prevent overlaps. The transform will solve the one-dimensional placement
problem with pool-adjacent violators (PAVA), emit the displacement as a numeric
field, and recompute it from the current primary scale when the view is zoomed
or resized.

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
- `filterScoredLabels` demonstrates how a collecting transform can subscribe
  to a scale domain and the `layoutComputed` broadcast, then repropagate data
  in synchronization with rendering.
- `ScaleResolution.getAxisLength()` converts the primary positional scale's
  unit range into logical pixels.
- `xOffset` and `yOffset` accept unscaled numeric fields in logical pixels when
  `scale` is `null`.
- The sashimi example demonstrates reactive coupling between scales through
  `domain("x")`, but fixed attenuation is not sufficient to maintain the
  non-overlap guarantee for this use case.

## Goals

- Provide a deterministic, order-preserving transform for non-overlapping
  one-dimensional placement.
- Support variable item lengths measured in logical pixels.
- Minimize total squared displacement from primary-scale positions.
- Produce a pixel displacement suitable for direct `xOffset` or `yOffset`
  encoding.
- Recompute placement when the selected primary scale domain or the axis length
  changes.
- Let displacement naturally diminish during zoom and reach zero when the
  undisplaced items fit.
- Keep input data branches isolated by emitting owned output objects.
- Avoid disposable per-item objects during zoom-driven recomputation, while
  keeping the implementation straightforward for datasets of at most a few
  hundred items.
- Demonstrate the transform in the private protein lollipop visualization.
- Document the public transform contract and its scale requirements.

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

PAVA is deterministic and linear after ordering. The transform will read input
values through ordinary GenomeSpy field accessors. A few reusable numeric arrays
may hold the algorithm's block starts, counts, means, and results; these are
solver scratch state, not a columnar representation of the input data.

### Recompute from the current scale instead of scaling a fixed solution

At each layout update, the transform will map the original domain coordinate
through the current primary scale and multiply by the current axis length. It
will then solve the placement problem in logical pixels.

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

### Emit logical-pixel displacement and disable the offset scale

The output field will contain a signed logical-pixel displacement. Consumers
must encode it without a scale:

```json
"xOffset": {
  "field": "xDisplacement",
  "type": "quantitative",
  "scale": null
}
```

The transform will not change the original primary-position field or filter
rows. Consequently, downstream primary-position domains remain based on the
original data. Only the output offset field depends on the current scale.

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

  /** Field containing the primary-scale coordinate. */
  pos: Field;

  /** Constant or field containing the item's full length in logical pixels. */
  length: number | Field;

  /** Primary positional scale used to map coordinates into pixels. */
  channel?: "x" | "y";

  /** Output field for the signed logical-pixel displacement. */
  as?: string;
}
```

Defaults:

- `channel`: `"x"`
- `as`: `"displacement"`

Contract and validation:

- `pos` values must be finite numbers accepted by the selected continuous or
  index scale.
- A constant `length`, or values read from a `length` field, must be finite and
  non-negative.
- The selected scale must be monotonic and have an axis length. The first
  implementation targets quantitative and index scales. Locus coordinates that
  require separate chromosome and position fields are deferred.
- Equal positions are ordered stably by input order.
- The transform preserves all rows and their propagation order.
- `as` is overwritten on transform-owned output rows.
- The output is intended for the offset channel matching `channel`, with
  `scale: null`.

Allowing a constant `length` keeps simple cases declarative without requiring a
formula-generated field. A field remains available for variable-width items,
including horizontally oriented labels measured with `measureText`.

`channel` retains a one-dimensional, axis-neutral contract while the initial
visualization exercises only `"x"`. Vertical offset direction must be covered
by a focused test so the signed result agrees with `yOffset` semantics.

## Transform implementation

### Data ownership and retained state

Implement `Displace1DTransform` as a collecting and cloning flow node. On an
upstream data batch it will retain input row references, then create one output
row per input row. The output rows will be reused for zoom- and layout-driven
repropagation; only the numeric displacement field changes.

Retained state should include:

- Input rows in propagation order.
- Output rows in propagation order.
- Stable indices ordered by the original position.
- Field accessors for position and variable length, or a constant accessor when
  `length` is numeric.
- Minimal reusable numeric scratch arrays needed by PAVA, such as its block
  stack and displacement results.
- The selected `ScaleResolution` and last usable axis length.
- Registered domain and layout listeners with disposers.

Do not copy input fields into a general columnar layout. Follow the established
transform pattern by applying `field(params.pos)` and, for a field-valued
`length`, `field(params.length)` to retained data objects. Ordinary reusable
arrays are sufficient for the small solver workspace. Per-item block objects
and per-frame datum cloning should still be avoided; typed arrays should be
introduced only later if profiling demonstrates a concrete benefit.

### Lifecycle

1. The constructor validates static parameters, creates field accessors, and
   resolves the selected primary scale.
2. `handle` buffers input rows without solving.
3. On initial `complete`, the transform:
   - validates values;
   - creates reusable output rows;
   - builds the stable position order;
   - sizes or clears the small reusable solver workspace;
   - emits an initial batch, using zero displacement if layout is not yet
     available, so downstream collectors can establish the primary domain;
   - schedules an exact solve through the animator.
4. A primary-scale `domain` listener recomputes immediately so zoom animation
   frames render current offsets.
5. A `layoutComputed` listener schedules recomputation because axis length may
   have changed.
6. Recompute resets only descendants, updates the retained output rows,
   propagates them, and completes descendants. It must not discard retained
   input or solver state.
7. An upstream `reset` clears retained data and prepares for a genuinely new
   batch.
8. `dispose` removes all domain and layout listeners.

The implementation should follow the proven scheduling and disposal patterns
in `filterScoredLabels`, without adopting its visible-range, top-k, or
reservation behavior.

### Scale and domain behavior

The solver operates on screen positions derived from:

```text
primaryScale(pos) * axisLength
```

with the appropriate sign convention for the chosen offset channel. Because
the transform neither filters rows nor modifies `pos`, its output does not
change the primary data domain. The implementation should verify that adding
the transform does not create a scale-domain feedback loop.

For the first version, every domain event may run the solver. The expected item
count makes this acceptable. A later optimization may skip pan-only updates for
unbounded placement on affine scales because translating all original centers
does not change their optimal displacements.

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

Expressions are not prohibited. However, the specification should not need a
bespoke expression helper, duplicate the primary scale's coordinate conversion,
or calculate exact connector pixel coordinates. The finished spec should give
the impression that this chart is a natural composition of GenomeSpy's grammar.

### Data preparation

On the mutation view, apply `displace1d` before the child layers. Use a constant
collision length based on the horizontal footprint of the lollipop head and
vertical label glyph width, including the desired separation padding. Do not
measure or otherwise incorporate mutation-label string length: vertical labels
extend primarily in the y direction and their text length is not part of this
plot's horizontal placement model.

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

- Add `docs/grammar/transform/displace1d.md` with behavior, the pixel-unit
  contract, `scale: null` offset encoding, zoom semantics, and the schema macro.
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
- Correct pixel displacement from an initialized x scale and axis length.
- `scale: null` offset consumption without changing the primary x domain.
- Domain changes recompute displacement.
- Zooming in reduces displacement and eventually produces zero for distinct
  positions.
- Coincident positions remain displaced after zoom.
- Layout width changes recompute displacement.
- Output propagation order matches input order.
- Upstream rows are not mutated.
- Output row objects and solver storage are reused across zoom recomputations,
  making the low-allocation behavior an intentional contract.
- Scale and layout listeners are removed on disposal.
- Vertical channel sign behavior if `channel: "y"` is retained in the first
  implementation.

Use fake scale resolutions for focused lifecycle tests and one initialized-view
integration test for actual scale/layout wiring.

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

**Outcome:** Specs can apply the transform and receive a logical-pixel
displacement field that updates on zoom and resize.

**Affected areas:**

- `packages/core/src/spec/transform.d.ts`
- `packages/core/src/data/transforms/displace1d.js`
- `packages/core/src/data/transforms/transformFactory.js`
- Transform lifecycle and initialized-view tests

**Verification:** Focused Vitest suites, TypeScript checks, schema generation,
domain-stability checks, zoom/layout recomputation tests, object-reuse checks,
and disposal tests.

**Documentation or migration:** No existing specs change. The new transform is
additive.

**Tentative commit:** `feat(core): add scale-aware displace1d transform`

### Step 3: Document the transform contract

**Outcome:** Users can understand pixel lengths, scale-less offset encoding,
and zoom behavior without reading implementation details.

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

### Add a channel-specific `zoomLevel("x")` expression helper

Use a new expression helper to control the `xOffset` range or a channel
expression.

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

The transform needs the primary scale to compute offsets, while the same rows
may establish that scale's data domain.

**Mitigation:** Preserve original primary coordinates and all rows, emit zero
offsets when layout is not ready, and schedule the exact solve after domain and
layout initialization. Add a domain-stability integration test.

### Reentrant domain or layout notifications

Repropagation can notify collectors and scale resolutions while a solve is in
progress.

**Mitigation:** Follow the existing animator scheduling pattern, guard or
coalesce scheduled layout recomputations, and test repeated domain events.

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

Although the protein dataset is small, avoid generating short-lived datum or
PAVA block objects at animation frequency.

**Mitigation:** Retain output rows and solver workspace across recomputations
and add an object-identity test for zoom-driven repropagation.

## Unresolved questions and deferred extensions

None of these blocks the initial implementation:

- Should a future bounded mode solve only visible items, include buffered
  offscreen items, or keep every item within the viewport? This needs an
  explicit pan/zoom contract.
- Should locus scales receive a `chrom` plus `pos` grammar variant, or should
  callers linearize genomic coordinates before displacement?
- Should later versions support independent `groupby` layouts for multiple
  one-dimensional lanes?
- After the private visualization stabilizes, should it be promoted to a
  public genomic-data example and used as the transform's interactive docs
  example?
- If other features need cosmetic zoom attenuation, should GenomeSpy add a
  channel-specific `zoomLevel(channel)` expression helper?

## Acceptance criteria

- The schema accepts the documented `displace1d` parameters and rejects
  invalid shapes.
- At the full protein domain, mutation collision intervals do not overlap.
- The computed layout is deterministic, order-preserving, and minimizes the
  stated squared-displacement objective.
- Zooming or resizing recomputes offsets from current screen positions.
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
- Zoom-driven recomputation reuses output rows and solver storage.
- Domain and layout listeners are removed when the transform is disposed.
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

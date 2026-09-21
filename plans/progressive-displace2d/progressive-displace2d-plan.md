# Progressive two-dimensional displacement

## Status

Implemented and verified. The position-based constraint solver was selected as
the production implementation. The force-relaxation baseline remains available
in commit `ae17eb4c2` for historical comparison.

## Motivation

The canonical `displace2d` solver is fast, deterministic, and collision-free,
but its bounded greedy search can send labels to a distant overflow row even
when a closer global arrangement is visually apparent. The experiment asks
whether a stateful solver can keep labels local, improve placement over several
animation frames, and remain coherent during zoom and pan.

The execution model is inspired by animated layouts: retain solver state,
advance it by a bounded amount before each render, publish intermediate
positions, and stop scheduling frames after convergence. The numerical method
is not a graph force layout. The current trial follows the position-based
constraint projection pattern described by Müller et al.:
https://diglib.eg.org/items/deb0a7a1-2ddf-496f-889a-fe0df1feeb73. It is an
independent implementation suitable for GenomeSpy's MIT license.

## Goals

1. Preserve the existing `displace2d` grammar shape, defaults, output fields,
   facet behavior, scale-aware placement, obstacles, and extents.
2. Initialize new labels at their anchors rather than from greedy placements.
3. Prefer nearby residual overlap to arbitrarily distant overflow placement in
   a saturated region.
4. Retain live rows and replay descendants at most once per animation frame.
5. Warm-start scale and layout updates even when upstream transforms replace
   datum objects while preserving stable input order.
6. Exercise `reversed-axes.json` and `stress.json` without downstream
   `transition` transforms.
7. Keep radical solver corrections visually smooth and terminate fixture leader
   lines at label boundaries instead of their center points.

## Non-goals

- Adding solver selection or tuning parameters to the public grammar.
- Guaranteeing collision-free output for impossible or saturated layouts.
- Guaranteeing path-independent restoration after interaction.
- Solving leader-line crossings.
- Deleting the canonical greedy solver while this remains an experiment.
- Defining the production policy for overlap, hiding, or maximum displacement.

## Key decisions

### Direct position projection

New labels start at their anchors. Each solver sweep projects overlapping
rectangles and anchor obstacles apart and projects feasible rectangles into the
configured bounds. Anchor attraction is collision-aware: a label moves toward
its anchor only when the intermediate position is already legal, preventing a
soft anchor force from recreating overlap. Corrections operate directly on
positions; there is no velocity or momentum to overshoot. Each item can move at
most 1.5 logical pixels in an ordinary sweep.

Interactive rendering attempts up to 64 sweeps but stops at the existing 4 ms
frame budget. Small feasible groups can therefore settle before the next
render, while dense groups still yield promptly.

Small projection steps alone can trap a warm-started label in an obsolete local
arrangement. On geometry replay, retained labels therefore perform a
deterministic compaction pass before relaxation resumes. Each label samples 32
positions from its anchor toward its retained position and jumps to the nearest
one that is already legal against labels, anchor obstacles, and bounds. The jump
is deliberately not movement-capped, but it can only reduce anchor distance.

Initial and persistently infeasible arrangements have a second escape hatch.
Every 32 unresolved sweeps, up to four lower-priority overlapping labels search
128 deterministic golden-angle candidates around their anchors and jump to the
nearest legal candidate found. This avoids fixed-order projection cycles in
ordinary feasible clusters without adding a distant overflow row.

When a layout is collision-free and otherwise settled, the same bounded radial
search may move lower-priority labels to legal candidates that are meaningfully
closer to their anchors. This gives zoomed sparse layouts a chance to improve
beyond their first acceptable local minimum.

Exact coincidences use deterministic pair hashing to choose directions. Input
priority is represented as inverse mobility, making earlier labels less mobile
without pinning them completely. The solver is still quadratic and uses an
800-iteration safety limit.

### Temporal state

The optional `key` field preserves state when upstream transforms replace,
filter, or reorder datum objects. Without a key, state follows datum identity
through a `WeakMap`. Unmatched rows start from their anchors; state is never
transferred implicitly by input position.

### Progressive and synchronous execution

Interactive dataflows perform two initial projection sweeps for new rows, then
continue through the Animator. Replayed rows publish their retained offsets
before the next solver frame. Headless or transition-disabled dataflows run the
same bounded solver synchronously, so both paths now use the same placement
algorithm rather than producing greedy output in exports.

### Solver targets and displayed positions

Interactive rows retain a displayed position separately from the solver target.
Solver projection, compaction, repair, and final improvement may change the
target discontinuously. Once per animation frame, the displayed position
approaches that target with a 60 ms half-life and a 10-pixel per-axis movement
cap. Animation continues after numerical convergence until displayed positions
reach their targets. This restores smooth motion without a downstream
`transition` transform. Headless output continues to use the settled target
directly.

### Leader-line attachment in fixtures

The transform still emits only label-center offsets. The two evaluation
fixtures derive separate leader offsets by intersecting the anchor-to-center
segment with the centered label collision rectangle. Text uses the full
displacement while the rule endpoint uses the shortened offset, preventing
rules from running through labels without expanding the transform grammar.

### Saturation is explicit

The constraint solver has no overflow row. Collision-aware attraction preserves
legal separation once achieved, while bounded radial repair escapes local
cycles. Dense clusters can still stop with overlaps when the repair search and
iteration limit cannot find enough space, but they do not place a tail of labels
hundreds of pixels from their anchors. This is useful experimental behavior,
not yet a decided public contract.

### Bounded performance optimization

Ordinary moving sweeps no longer measure the maximum overlap with a second
quadratic scan. They conservatively assume overlap until a repair sweep or
settling check actually needs the answer, and that check stops at the first
significant overlap. Per-label mobility is also precomputed. A spatial index was
deliberately deferred because it would add substantial machinery to this PoC.

## Alternatives considered

- The committed force-relaxation baseline starts from a collision-free greedy
  layout. It resolves almost every overlap after relaxation but inherits very
  distant seeds and uses momentum that amplifies interaction changes.
- Alternating VPSC remains the strongest next alternative if constraint
  projection leaves too many overlaps. It should produce a more deliberate
  compact layout, but exact axis solves need a separate rendered-position
  interpolator to avoid collective jumps.
- Discrete candidate optimization can produce excellent static placements but
  is not naturally progressive; it would compute targets off-screen and animate
  toward committed solutions.

## Risks and unresolved questions

- Dense initial layouts currently retain many overlaps. More collision
  sub-sweeps, adaptive anchor compliance, or VPSC may improve this without
  reviving distant placements.
- Progressive output is history-dependent and may settle differently after an
  out-and-back interaction.
- Compaction can create a visible jump. It trades strict continuity for escaping
  a stale arrangement and currently has no rendered-position interpolation.
- Radial repair also jumps and adds bounded quadratic work every 32 unresolved
  sweeps. Its candidate count and repair frequency are experimental.
- Display interpolation can temporarily overlap labels even when solver targets
  are legal, and independently interpolated paths can cross.
- Boundary-attached leader offsets currently live in the fixtures. A reusable
  production feature may need a general rectangle-boundary transform or mark
  facility, especially for rotated or non-centered labels.
- Replaying descendants on every active frame may cost more than solving.
- The solver performs pairwise label and obstacle scans and has no spatial
  index.
- Exact public semantics for headless output, saturation, and priority remain
  undecided.

## Milestones

### 1. Preserve the force-relaxation baseline

Intended outcome: retain the first progressive implementation as a reproducible
comparison point.

Affected areas: the transform lifecycle, force relaxer, focused tests, and two
interactive fixtures.

Verification: 64 focused tests, Core TypeScript, lint, the full 4,242-test
suite, and both browser smoke fixtures passed before commit `ae17eb4c2`.

Documentation or migration: none; experimental grammar is unchanged.

Commit: `feat(core): prototype progressive label relaxation`

### 2. Evaluate position-based constraint projection — completed

Intended outcome: remove the greedy initializer and velocity integration, keep
new placements local, and preserve offsets through pan and zoom.

Affected areas: `displace2d.js`, the numerical solver and tests. The fixture
specifications remain unchanged from the baseline commit.

Verification: focused solver, transform, greedy-solver, and transition suites;
Core TypeScript; lint; browser smoke; manual initial, zoom, and pan inspection;
and comparative displacement/overlap measurements on stress-like geometry.

Documentation or migration: record findings here. Do not update public
specification documentation until an algorithm and saturation policy are
selected.

Implementation commit: `feat(core): prototype progressive constraint label placement`

## Acceptance criteria for the experiment

- Both fixtures initialize without browser errors and visibly settle.
- The feasible reversed-axis fixture has no visible label-label overlaps after
  settling.
- Labels move without momentum-driven oscillation.
- Radical target changes are displayed through bounded interpolation rather
  than published as one-frame jumps.
- Zoom and pan retain offsets instead of restarting replacement rows at zero.
- A retained label can jump closer when a newly legal position opens toward its
  anchor.
- Fixture leader lines terminate at the label collision boundary rather than
  its center.
- New labels begin at their anchors rather than a greedy overflow position.
- Animation stops at convergence or the iteration cap and cancels on disposal.
- Facets remain independent and batch boundaries survive animation.
- Interactive and headless paths use the same numerical method.
- `Displace2DParams` and its generated schema expose only the selected
  scale-aware placement contract.

## Evidence

Recorded on 2026-09-20:

- The baseline implementation was committed as `ae17eb4c2` after its full
  verification pass.
- The constraint-solver trial passes 55 focused tests and the Core TypeScript
  check. A regression test confirms warm starts across replacement datum
  objects using stable facet order. Another verifies that a label stranded 100
  pixels from its anchor compacts to the nearest legal sample under 20 pixels.
  Feasible clustered-layout tests now include heterogeneous widths and anchor
  obstacles modeled after the reversed-axis fixture.
- Both fixtures pass the focused WebGL browser smoke test. Manual inspection of
  the stress fixture covered settling, wheel zoom, and drag pan. Offsets remain
  present through interaction. A second zoom-in/out pass with compaction enabled
  showed labels returning close to newly isolated anchors; the browser console
  contains only the existing Lit development warning.
- Manual inspection confirms that the reversed-axis fixture now settles without
  visible label-label overlap. The corresponding synthetic geometry converged
  in 104 iterations with no intersections and a maximum displacement of about
  46 pixels.
- The transform regression test verifies that a numerically settled target is
  approached over multiple animation frames. Manual stress-fixture zooming
  shows the display continuing smoothly after the solver target changes.
- Both fixtures now derive `leaderDx` and `leaderDy` from the label rectangle;
  manual inspection confirms that rules stop outside the rendered text.
- On approximate 150-label stress geometry, greedy placement had median, 90th
  percentile, and maximum anchor distances of about 82, 136, and 848 pixels.
  With radial repair, the constraint trial produced about 20, 56, and 64 pixels.
- The same approximate constraint result retained 44 intersecting label pairs
  after its 800-iteration limit, down from 86 before radial repair. The dense
  initial browser view still visibly confirms that proximity improved at the
  expense of too many overlaps. This is the main issue to resolve or compare
  against VPSC.
- On deterministic 500-label stress geometry, the median time for 64 sweeps
  fell from 120.5 to 75.9 ms and a full 800-sweep solve from 1.71 to 1.18 s.
  Final overlap count and anchor-distance statistics were unchanged. The solver
  grew by 13 lines; a follow-up V8 profile attributes the remaining time to
  the actual pairwise sweep and radial repair rather than overlap measurement.

## Final disposition

- The constraint-projection result was accepted as materially better than the
  greedy baseline. Alternating VPSC and further global optimization were
  discarded for this change.
- A spatial index was discarded after profiling showed that useful annotation
  counts did not justify the additional machinery.
- Stable identity is explicit through the optional `key` field. Without it,
  state follows row identity.
- Dense or infeasible layouts use best-effort placement and may retain overlap;
  the transform does not send labels to a distant overflow row.
- The public grammar was intentionally simplified after the experiment:
  positions always use the owning view's scales, and raw position factors,
  explicit extents, debounce, and the `scalePositions` switch were removed.
- The transform now owns progressive display interpolation, so the separate
  keyed `transition` transform and the obsolete greedy solver were removed.

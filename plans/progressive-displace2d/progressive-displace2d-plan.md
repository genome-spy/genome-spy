# Progressive two-dimensional displacement PoC

## Status

PoC implemented on `codex/progressive-displace2d-poc`. The prototype is ready
for maintainer acid testing and tuning, not production integration.

## Motivation

The current `displace2d` solver is fast and deterministic, but its bounded
greedy candidate order can produce visually poor local placements. This proof
of concept evaluates whether a persistent rectangle-relaxation process can
improve those placements progressively without blocking interaction or making
labels move chaotically.

The execution model is inspired by animated force layouts: retain solver state,
advance it by a bounded amount before each render, publish intermediate
positions, and stop scheduling frames after convergence. The placement
algorithm is not a graph force layout. It uses rectangle overlap corrections,
anchor attraction, velocity damping, viewport constraints, and deterministic
tie breaking.

ggrepel is useful behavioral prior art: it repeatedly repels overlapping label
boxes and points, attracts labels toward their original positions, damps
velocity, and stops at iteration or time limits. GenomeSpy must not copy or
closely adapt its GPL-3.0 implementation. This PoC uses an independently written
solver compatible with GenomeSpy's MIT license and omits ggrepel's random
jitter and discrete leader-line swaps because those operations are unsuitable
for visible animation.

## Goals

1. Preserve the existing public `displace2d` grammar, defaults, output fields,
   facet behavior, scale-aware placement, obstacles, extents, and overflow
   fallback.
2. Use the current greedy result as a complete deterministic initial layout,
   then improve it through smooth progressive relaxation.
3. Retain live datum rows and replay only descendants once per animation frame.
4. Warm-start repeated scale and layout updates from retained datum state when
   upstream replay preserves datum identity.
5. Stop animation when movement and overlap settle, and bound unsuccessful
   relaxation with an iteration limit.
6. Exercise `reversed-axes.json` and `stress.json` without downstream
   `transition` transforms.

## Non-goals

- Adding solver selection or tuning parameters to the public grammar.
- Porting ggrepel or matching its static output.
- Guaranteeing that every intermediate frame is collision-free.
- Guaranteeing path-independent restoration after interaction.
- Solving leader-line crossings in the first PoC.
- Replacing the current greedy solver or deleting its focused tests.
- Defining a production saturation policy for impossible label densities.

## Key decisions

### Greedy initialization followed by relaxation

The existing solver supplies a finite, validated, collision-free starting
layout and preserves current overflow behavior. Relaxation then pulls labels
toward anchors while resolving rectangle and anchor penetrations. There is no
final greedy cleanup because it would reintroduce discontinuous jumps.

### Stateful transform, separate numerical state

`Displace2DTransform` continues to collect complete batches. After initial
publication it retains the live rows, batch markers, and relaxation groups.
Animation callbacks mutate the existing displacement fields and replay only
the transform's descendants. A separate numerical module owns positions,
velocities, collision corrections, bounds, and convergence.

### Identity without a grammar change

The current grammar has no stable key. The PoC therefore associates state with
datum object identity through a `WeakMap`. Scale and parameter replays normally
reuse those objects, allowing warm starts. Replacement objects receive fresh
greedy positions. A production design would need to decide whether this
limitation is acceptable or whether stable identity belongs in the grammar.

### Animation-aware stability

Each iteration computes corrections from one position snapshot and applies
them together. Velocity damping, a per-iteration movement cap, deterministic
directions for exact coincidences, and modest anchor attraction limit visible
jitter. The solver publishes at most once per animation frame even if multiple
iterations fit the frame work budget.

### Compatibility and headless behavior

When no Animator is available or transitions are disabled for headless
rendering, the transform retains the existing greedy result. The dataflow
becomes complete after the initial batch publication; visual settling does not
hold readiness open. This keeps synchronous export deterministic but means the
PoC specifically evaluates the interactive renderer path.

## Risks and unresolved questions

- Dense impossible layouts may never become collision-free; the iteration cap
  stops work but cannot invent space. A production design may need visibility
  or priority policy.
- WeakMap identity does not survive tuple replacement and cannot guarantee
  continuity for every source or transform pipeline.
- Progressive output is history-dependent and may settle differently after an
  out-and-back zoom.
- Replaying descendants on every active frame may cost more than solving.
- The selected force constants and work budget are experimental and must not
  become accidental public API.
- A greedy overflow seed may take many frames to return distant labels to a
  compact configuration.

## Milestones

### 1. Add the relaxation engine and transform lifecycle

Intended outcome: a deterministic, independently implemented rectangle
relaxer advances retained placements and reports convergence. The transform
uses Core's Animator, preserves facet batches, cancels work on disposal, and
keeps its existing public parameters.

Affected areas: `displace2d.js`, a new sibling numerical module, and focused
transform/solver tests. Downstream collectors and marks are replayed once per
published frame.

Verification: test overlap reduction, bounded movement, warm-started anchor
updates, descendant replay, facet boundaries, headless settling, and disposal.
Run focused `displace2d` and transition tests plus Core TypeScript checks.

Documentation or migration: none for the PoC; the public grammar is unchanged.

Tentative commit: `feat(core): prototype progressive displace2d relaxation`

### 2. Exercise the interactive fixtures

Intended outcome: `reversed-axes.json` and `stress.json` use progressive output
directly, without target fields or downstream transition transforms.

Affected areas: the two example specifications only.

Verification: focused browser smoke checks, manual zoom/pan/resize inspection,
console inspection, and observation of settling at low and high label counts.
Compare responsiveness and placement quality with the parent branch.

Documentation or migration: keep these as development fixtures; do not update
public documentation until the experiment is accepted.

Tentative commit: `test(core): exercise progressive displace2d fixtures`

## Final integration acceptance criteria

- Both named examples initialize without browser errors and visibly settle.
- Labels move continuously without candidate jumps during relaxation.
- Scale interaction warm-starts retained rows rather than restarting them from
  greedy placements on every replay.
- Animation stops after convergence or the iteration cap and is canceled on
  disposal.
- Facets remain independent and their batch boundaries survive animation.
- Headless output retains the current deterministic greedy offsets.
- The `Displace2DParams` TypeScript/schema shape is unchanged.
- Focused unit tests, Core TypeScript checks, lint for touched files, and both
  browser smoke tests pass.

## PoC evidence

Implemented:

- `Displace2DRelaxation` independently implements simultaneous rectangle and
  anchor collision corrections, weak anchor and boundary attraction, input-
  order mobility, velocity damping, deterministic coincidence directions, a
  movement cap, and a 600-iteration safety limit.
- `Displace2DTransform` retains live rows and facet markers, associates state
  with datum identity, warm-starts anchor changes, performs at most four
  iterations and approximately 4 ms of work per frame, replays descendants
  once, and cancels animation on reset or disposal.
- Non-animated and headless paths retain the original greedy output.
- The reversed-axis and stress fixtures now use `displace2d` output directly
  with zero debounce and contain no transition transform.

Verification recorded on 2026-09-20:

- Focused solver, transform, relaxation, and transition suites pass with 64
  tests. The full unit suite passes with 4,242 tests, one skip, and two todos.
  Core TypeScript and touched-file lint pass.
- Both requested examples pass the focused WebGL browser smoke check. Only the
  existing Lit development and software-WebGL readback warnings were emitted.
- Manual browser inspection covered initial settling and wheel zoom in both
  fixtures. The reversed-axis labels settle into a compact arrangement and
  retain smooth relative motion through zoom. The 150-label stress view
  remains responsive and replaces the greedy overflow topology with gradual
  movement.
- A synthetic version of the 150-label stress geometry had five remaining
  label intersections after the 600-iteration limit. The median minimum-axis
  penetration was approximately 0.6 px and the maximum 3.6 px. The PoC does
  not claim collision-free convergence.
- The implementation adds substantial state and lifecycle machinery: the
  transform grows from 414 to 579 lines and the new solver and focused tests
  add 377 lines. This is acceptable for an experiment but should be reduced or
  factored before production adoption.

Remaining evaluation:

- Maintainer visual assessment of motion quality, settling time, and whether
  residual overlaps are preferable to greedy overflow.
- Interaction profiling at the stress fixture's 500-label maximum. The PoC
  uses pairwise label and anchor scans per iteration, so its numerical work is
  quadratic even though each frame has a wall-time guard.
- A production decision about stable identity, saturation policy, headless
  equivalence, deterministic restoration, and whether progressive semantics
  should replace or coexist with the canonical greedy transform.

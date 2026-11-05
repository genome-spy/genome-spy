# Geometry-derived line-point union proof

Status: coverage passes; retained cost gate fails; route rejected for
production. Reference only, not a PR or renderer implementation. Based on #683's
reviewed plan at4944408ec73e6ac2e456b800971bc483dc0c06f1. No new dependencies.
Do not merge this reference branch into production.

## Purpose and owning path

Determine whether a small exact-area coverage helper can implement the reviewed
straight-open-subpath contract before adding a parser, source-shape descriptors,
renderer-owned buffers or Core integration. All straight butt-ended segments
contribute to one filtered union, with paint applied once. Name-based x/+
formulas, approximate thin crossings and a new supported-two-segment limit are
not substitutes.

The temporary fixture subclasses the actual PathPointProgram and replaces only
its line coverage branch, injecting compile-time segment constants. It uses the
existing point quad, vertex projection, rotation, pass and paint channels.
Existing closed-path atlas allocation/bindings remain as test scaffold; this
does not qualify the intended atlas-free line-only resource specialization.
Picking is not qualified: the injected coverage branch bypasses its old picking
branch. No production source, resource, parser, declaration or dependency was
changed.

## Coverage and numerical handling

Integrate consistently oriented rectangle boundaries over each unit pixel using
clamp(bottom-y,0,1)dx. Clip to the pixel's horizontal interval; vertical edges
have zero contribution. Do not discard above-pixel saturated contributions.
Merge intervals occluded by other rectangles with a bounded repeated traversal.
Same-side coincident boundaries contribute once; opposite touching boundaries
are internal. The worst-case fragment work is O(N^3), explicitly unqualified.

Keep intersections in shared shape-local coordinates, before common rotation and
pixel translation. Only the area integral uses pixel-local coordinates. Parallel
handling is scale-relative; boundary comparisons retain finite f32 thresholds.
No all-scale exactness claim follows from these representative cases.
Preparation must remove zero-length segments before normalizing directions.

Independent CPU references use double-precision convex polygon clipping and
inclusion-exclusion, not the shader's boundary integral or interval traversal.
All pixels retain the existing two-byte premultiplied-channel limit. Fractional
paint checks apply alpha once to the independent union reference.

26 cases at each DPR cover .1 strip/.19 crossing/.01 short box, rotated
fractional strips/crossings, duplicates, reversed directions/order, partially
coincident and touching edges, triple overlap, near-parallel directions,
asymmetric segments, tiny/thick geometry, six segments, and the exact
cost-fixture dimensions. They pass within one byte; five direct invariance
comparisons are exactly zero at both DPRs. Analytic target center alphas
quantize to25/48/3. Validation is null.

Initial near-parallel failures reached6 bytes. Additional rotated coincidence
checks exposed larger222/224byte errors. Correcting supporting-line detection,
shape-local intersections and scale-relative parallel handling removes them; no
pixel exclusion or tolerance adjustment was introduced. Earlier sources and
failed outputs remain archived separately, not relabeled as final evidence.

## Bounded cost method

Hardware: integrated Apple M5,10GPU cores, Chrome156/Metal-3. No discrete GPU
was available. Compare two temporary variants with identical constants, quad
bounds, paint and draw setup: exact union area and a cheaper
minimum-rectangle-SDF filter. The latter is known to fail thin-union area
semantics: this is an early rejection comparison of cost tradeoffs, not an
equivalent-output speed comparison or a current-master regression measurement.

Use320x64logical canvas, DPR1/2,1,000/10,000 points on the retained80x15grid,
logical diameter4, width2, angle17, translucent paint. Counts above1,200 repeat
positions and intentionally retain overdraw. Geometry for each segment count is
independently checked at the cost dimensions before timing.

Each metric has five warm alternating pairs followed by40 measured alternating
pairs. Completed-redraw wall timing is uninstrumented and includes queue drain.
Separate GPU timestamp pairs bracket one actual render pass; timestamp resolve,
copy and mapping happen afterward. No shader instrumentation or tracing.
Validation is checked after each DPR. Record mark creation and first-use timing
separately; they include cached/shared preparation and are not isolated shader
compilation measurements. Raw observations are written by the portable test.

Retain the frozen gate: fail either median or p95 if candidate exceeds both2x
baseline and baseline+2ms. Do not retune that gate after seeing the results.
Compile-time geometry allows specialization/unrolling unavailable to future
buffer-backed geometry. A pass could establish only optimistic feasibility; the
measured failures already reject this route before resource implementation.

## Full cost table

Times are milliseconds; each cell shows median/p95. Every row is retained.

| DPR | Count | Segments | Min-SDF GPU | Area GPU      | Min-SDF completed redraw | Area completed redraw | Failed gates                               |
| --- | ----- | -------- | ----------- | ------------- | ------------------------ | --------------------- | ------------------------------------------ |
| 1   | 1000  | 2        | 0.017/0.017 | 0.099/0.099   | 0.300/0.500              | 0.400/1.000           | none                                       |
| 1   | 1000  | 3        | 0.018/0.018 | 0.235/0.236   | 0.300/0.500              | 0.500/1.500           | none                                       |
| 1   | 1000  | 6        | 0.020/0.020 | 0.980/0.986   | 0.300/0.400              | 1.300/1.400           | none                                       |
| 1   | 10000 | 2        | 0.106/0.106 | 0.799/0.804   | 0.300/0.400              | 1.100/1.200           | none                                       |
| 1   | 10000 | 3        | 0.113/0.113 | 1.954/1.962   | 0.400/0.400              | 2.300/2.400           | none                                       |
| 1   | 10000 | 6        | 0.132/0.132 | 7.826/7.877   | 0.400/0.500              | 8.100/8.200           | wall median, wall p95, gpu median, gpu p95 |
| 2   | 1000  | 2        | 0.026/0.026 | 0.211/0.212   | 0.300/0.400              | 0.500/0.600           | none                                       |
| 2   | 1000  | 3        | 0.028/0.028 | 0.497/0.498   | 0.300/0.400              | 0.700/0.800           | none                                       |
| 2   | 1000  | 6        | 0.033/0.033 | 1.839/1.852   | 0.300/0.500              | 2.100/2.500           | none                                       |
| 2   | 10000 | 2        | 0.180/0.180 | 1.748/1.752   | 0.400/0.500              | 2.000/2.100           | none                                       |
| 2   | 10000 | 3        | 0.198/0.199 | 4.168/4.184   | 0.400/0.500              | 4.400/4.600           | wall median, wall p95, gpu median, gpu p95 |
| 2   | 10000 | 6        | 0.248/0.249 | 15.610/15.696 | 0.500/0.600              | 15.900/16.100         | wall median, wall p95, gpu median, gpu p95 |

## Preparation observations

Mark creation/first-use milliseconds are diagnostic, not adoption gates. The
first variant can pay shared atlas preparation, while subsequent variants may
reuse it. Both first-use figures can include deferred pipeline work.

| DPR | Count | Segments | Min-SDF create/first use | Area create/first use |
| --- | ----- | -------- | ------------------------ | --------------------- |
| 1   | 1000  | 2        | 3.600/149.200            | 1.100/4.900           |
| 1   | 1000  | 3        | 0.200/84.500             | 0.400/4.300           |
| 1   | 1000  | 6        | 0.300/85.100             | 0.500/8.700           |
| 1   | 10000 | 2        | 0.500/0.400              | 0.400/1.200           |
| 1   | 10000 | 3        | 0.300/0.400              | 0.300/2.300           |
| 1   | 10000 | 6        | 0.300/0.400              | 0.200/8.100           |
| 2   | 1000  | 2        | 0.400/1.800              | 0.300/1.200           |
| 2   | 1000  | 3        | 0.200/0.700              | 0.200/1.300           |
| 2   | 1000  | 6        | 0.300/1.000              | 0.200/2.800           |
| 2   | 10000 | 2        | 0.300/0.500              | 0.200/2.000           |
| 2   | 10000 | 3        | 0.100/0.500              | 0.300/4.500           |
| 2   | 10000 | 6        | 0.200/0.600              | 0.200/16.000          |

## Disposition and open scope

At10,000 points/DPR2, area GPU times reach4.168ms for three segments and15.610ms
for six; completed redraws reach4.4/15.9ms. The six-segment DPR1 case also
fails. Do not implement descriptors/resources, add rescue caches or another
render route, or introduce a two-segment limit to claim completion. The
independently reviewed geometry-derived replacement in #683 remains unresolved.
Retain the useful coverage contract separately from this rejected cost profile.

Independent Sol reviews support the temporary actual-program fixture and the
rejection methodology. This does not qualify picking, parser/normalization,
source IDs, resource lifecycle, Core integration, or eventual production
geometry. No new product PR or recording is warranted for this failed
feasibility route.

## Reproduction

With existing workspace dependencies and installed Chrome, from repository root:

```
node node_modules/playwright/cli.js test -c plans/line-point-union-cost-proof/proof.config.mjs
```

The correctness tests pass. The cost test intentionally fails the frozen gate;
all rows are written to Playwright's per-test output directory before assertion.
Run sequentially on an otherwise idle GPU. Timing values vary by device and
load.

## Per-case coverage results

All pixels, including exterior pixels, are checked. Values are maximum absolute
premultiplied-channel differences in stored bytes. No AA fringe waiver is used.

| DPR | Case                                    | Segments | Max error | Pixels over2 | Fractional-paint max |
| --- | --------------------------------------- | -------- | --------- | ------------ | -------------------- |
| 1   | strip .1                                | 1        | 0         | 0            | 1                    |
| 1   | cross .19                               | 2        | 1         | 0            | 1                    |
| 1   | short box .01                           | 1        | 0         | 0            | 1                    |
| 1   | rotated fractional strip                | 1        | 1         | 0            | 1                    |
| 1   | rotated crossing                        | 2        | 1         | 0            | 1                    |
| 1   | duplicate strip                         | 2        | 0         | 0            | 1                    |
| 1   | reversed directions                     | 2        | 1         | 0            | 1                    |
| 1   | partially coincident                    | 2        | 1         | 0            | 1                    |
| 1   | touching endpoints                      | 2        | 1         | 0            | 1                    |
| 1   | opposite touching sides                 | 2        | 0         | 0            | 1                    |
| 1   | triple overlap                          | 3        | 1         | 0            | 1                    |
| 1   | triple overlap reordered                | 3        | 1         | 0            | 1                    |
| 1   | near parallel                           | 2        | 0         | 0            | 1                    |
| 1   | near parallel reordered                 | 2        | 0         | 0            | 1                    |
| 1   | asymmetric                              | 3        | 1         | 0            | 1                    |
| 1   | tiny thick                              | 2        | 1         | 0            | 1                    |
| 1   | six segments                            | 6        | 1         | 0            | 1                    |
| 1   | near parallel slope 0.000001 width 0.05 | 2        | 1         | 0            | 1                    |
| 1   | near parallel slope 0.000001 width 0.9  | 2        | 1         | 0            | 1                    |
| 1   | near parallel slope 0.0001 width 0.05   | 2        | 1         | 0            | 1                    |
| 1   | near parallel slope 0.0001 width 0.9    | 2        | 1         | 0            | 1                    |
| 1   | rotated partial coincidence             | 2        | 1         | 0            | 1                    |
| 1   | asymmetric reversed                     | 3        | 1         | 0            | 1                    |
| 1   | cost fixture 2                          | 2        | 1         | 0            | 1                    |
| 1   | cost fixture 3                          | 3        | 1         | 0            | 1                    |
| 1   | cost fixture 6                          | 6        | 1         | 0            | 1                    |
| 2   | strip .1                                | 1        | 1         | 0            | 1                    |
| 2   | cross .19                               | 2        | 1         | 0            | 1                    |
| 2   | short box .01                           | 1        | 0         | 0            | 1                    |
| 2   | rotated fractional strip                | 1        | 1         | 0            | 1                    |
| 2   | rotated crossing                        | 2        | 1         | 0            | 1                    |
| 2   | duplicate strip                         | 2        | 1         | 0            | 1                    |
| 2   | reversed directions                     | 2        | 1         | 0            | 1                    |
| 2   | partially coincident                    | 2        | 1         | 0            | 1                    |
| 2   | touching endpoints                      | 2        | 1         | 0            | 1                    |
| 2   | opposite touching sides                 | 2        | 0         | 0            | 1                    |
| 2   | triple overlap                          | 3        | 1         | 0            | 1                    |
| 2   | triple overlap reordered                | 3        | 1         | 0            | 1                    |
| 2   | near parallel                           | 2        | 0         | 0            | 1                    |
| 2   | near parallel reordered                 | 2        | 0         | 0            | 1                    |
| 2   | asymmetric                              | 3        | 1         | 0            | 1                    |
| 2   | tiny thick                              | 2        | 1         | 0            | 1                    |
| 2   | six segments                            | 6        | 1         | 0            | 1                    |
| 2   | near parallel slope 0.000001 width 0.05 | 2        | 1         | 0            | 1                    |
| 2   | near parallel slope 0.000001 width 0.9  | 2        | 1         | 0            | 1                    |
| 2   | near parallel slope 0.0001 width 0.05   | 2        | 1         | 0            | 1                    |
| 2   | near parallel slope 0.0001 width 0.9    | 2        | 1         | 0            | 1                    |
| 2   | rotated partial coincidence             | 2        | 1         | 0            | 1                    |
| 2   | asymmetric reversed                     | 3        | 1         | 0            | 1                    |
| 2   | cost fixture 2                          | 2        | 1         | 0            | 1                    |
| 2   | cost fixture 3                          | 3        | 1         | 0            | 1                    |
| 2   | cost fixture 6                          | 6        | 1         | 0            | 1                    |

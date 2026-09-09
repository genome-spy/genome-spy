# Declarative WebGPU selection ordering

Temporary implementation plan. No commits or pushes requested.

## Goal and API

Move visual selection partition scheduling from Core into webgpu-renderer.
Implemented mark configuration: `order: { when: selectionPredicate, matching:
"last" }`, with `matching: "first"` for reversed ordering. Default matching
placement is last. Each caller submits one ordinary draw command. Remove the
unpublished `orderWhen`, `orderPass`, and `secondOrderPass` public hooks.

The existing selection predicate is reused; do not reproduce Core grammar.
Core translates its order predicate and numeric branch ordering once. The
renderer decides whether any referenced selection is active using its retained
selection resources. Empty selections produce one ordinary draw regardless of
the predicate's empty-match policy. Active selections produce two adjacent,
disjoint partitions of each draw. The second partition retains the internal
second-pass bit used by link fading. Picking remains one ordinary draw.

## Constraints and alternatives

Do not change WebGL, SVG, Canvas, Core grammar, or link fading semantics. Do not
add sorting, extra pipelines, instance uploads, or facet overlap machinery.
Marks without ordering must avoid new per-draw allocations or selection scans.
Empty selections must avoid extra GPU draws. Preserve scopes,
placement ordering, opacity composition, and detached export behavior.

The existing imperative pair is the baseline alternative: fewer renderer
responsibilities, but awkward caller ownership of shader pass details. An
explicit enabled flag is another alternative, but duplicates activity handling
in callers. Prefer activity derived from existing retained selection state;
if unavailable, keep the smallest state needed alongside selection resources.
Do not introduce a general predicate scheduling framework. This uses the
existing renderer's declarative visibleWhen pattern rather than adapting
external code; no external code or license obligations are introduced.

Comparable grammar checked: Vega-Lite's local
`tmp/vega-lite/examples/specs/selection_type_point_zorder.vl.json` expresses
selection ordering as conditional numeric order values. Core already offers
that familiar grammar. The low-level renderer should accept the resulting
partition intent rather than import numeric channel semantics or sorting.

## Review gate

- [x] Luna xhigh reviews API ergonomics, defaults, activity ownership, expected
  production code growth/removal, scope composition, and picking.
- [x] Revise this plan with actionable findings before implementation.

Review decisions: retain `matching`, defaulting to `last`; validate the mark
configuration once in BaseProgram. Use a small activity cache in selection
resources, updated on selection changes, rather than add generic uniform
readback APIs. Remove internal orderWhen plumbing too, using normalized order
configuration through shader creation. Visual normalization expands before
layerization. For implicit picking of the last visual frame, skip generated
second partitions in the existing picking encode path and force all-mode as
today. Prefer this small skip to mutating/compacting retained frame arrays.
Reviewer estimates modest net source growth, roughly 10–30 lines; verify the
actual result rather than treating that estimate as a budget.

## Milestone 1: renderer contract and behavior

- [x] Replace public pass controls with declarative mark ordering; normalize
  configuration in BaseProgram and use selection resources for activation.
- [x] Expand draws inside the renderer before visual scheduling/composition;
  picking bypasses expansion. Keep shader partition modes internal.
- [x] Update renderer README, conditional-order scene, and affected tests.

Affected files include index.d.ts, renderer.js, BaseProgram,
selectionResources.js, and their downstream shader/resource consumers.
Verify ordinary, active, cleared, single/multi/interval/union selections,
reversed ordering, translucent overlap without double drawing, second-pass
link fading, and unchanged picking. Prefer representative behavior tests.
Tentative commit: `refactor: make WebGPU selection ordering declarative`.

## Milestone 2: Core integration and final review

- [x] Translate Core order into the new mark config in webGpuMarkAdapter and
  remove orderActive tracking and explicit expansion in its rendering context.
- [x] Update Core integration tests to assert one submitted semantic draw and
  the declarative configuration; preserve other backends unchanged.
- [x] Review combined diff for excess abstraction and duplicated state.
- [x] Run focused Core/renderer unit tests, both TypeScript checks, changed-file
  lint, relevant real GPU tests, and Storybook build if the scene changes.

Acceptance: conditional-order scene selection/clear and reversed order work;
link foreground fading and picking retain existing behavior; scoped draws and
Core export retain their paths. Compare source diff counts, without measuring
the minified bundle. Report any net growth candidly. No guaranteed line-count
reduction: the aim is removing caller protocol complexity with minimal new
renderer code. Tentative commit: `refactor: delegate WebGPU order scheduling`.

## Verification and final review

The review questions were resolved in the review decisions above. Parent review
removed duplicate activity bookkeeping, ordinary-path allocations, and a
trivial resource getter. Expansion reuses the original draw and creates only
one extra record when active, with its own uniform index.

Passed: 183 focused unit tests, Core and renderer TypeScript checks, changed
file lint/format checks, Storybook build, and 10 relevant real GPU tests
(first/last ordering, implicit/explicit picking, and link fading). The last
getter cleanup passed 46 focused unit tests and lint. Scoped partition grouping
and union activity have representative unit coverage. No separate detached
export browser test was run: export uses the same visual normalization path.

Source delta, including JSDoc and blank lines but excluding tests/examples:
Core JavaScript -17 lines; renderer JavaScript +55 lines; net JavaScript +38.
Renderer public types add another 5 lines. No minified bundle measurement.
The API improvement costs a modest amount of renderer code rather than being
an overall source-size reduction. Changes and this completed temporary plan
remain uncommitted for user review.

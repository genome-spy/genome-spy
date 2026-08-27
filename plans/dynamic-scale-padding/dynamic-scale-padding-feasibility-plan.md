# Dynamic scale padding feasibility plan

Status: Discarded from this branch; deferred until #471 is merged and closed

Disposition: Every unchecked task below is intentionally discarded from this
#471 branch rather than completed. Restore this plan from Git history when the
separate dynamic-padding feasibility work begins.

Prerequisite: [#471 Scope scale ExprRefs to their scale resolution](https://github.com/genome-spy/genome-spy/issues/471)

Prototype evidence: stash commit
`9e11f6a6bd89fd18b81e9aea910fad698dbd7811` (`refs/stash`), titled
`WIP: reactive scale padding prototype and subpixel moire example`

## Context

An August 2026 prototype added ExprRefs to `padding`, `paddingInner`, and
`paddingOuter`. It updated live Vega scales, introduced a padding resolution
event, routed padding into WebGL uniforms, invalidated scale-helper expressions,
and added a subpixel index-scale example. The prototype also carried a
per-property `__paddingExprScopes` map and tested defining-member scope. That
ownership plumbing made the feature substantially more complex and motivated
#471.

This plan begins only after #471 is merged and closed. It evaluates whether the
remaining complexity is justified and whether a clean resolution-owned design
works across CPU scale behavior, helpers, layout, WebGL, Canvas2D/SVG, and the
experimental WebGPU renderer. It does not presume that the feature should ship.

Vega is a useful semantic comparison. It supports signal-valued scale
properties through scale-operator dependencies, while the underlying
band/point scale padding remains a numeric property:

- [Vega scale documentation](https://vega.github.io/vega/docs/scales/)
- [Vega scale parser](https://github.com/vega/vega/blob/main/packages/vega-parser/src/parsers/scale.js)

Vega is BSD-3-Clause licensed. The experiment should use GenomeSpy's existing
resolution/runtime APIs and not copy Vega parser or runtime code. If any code is
closely adapted later, preserve its notice and add durable provenance.

## Goals

- Determine whether resolution-scoped ExprRefs make dynamic discrete-scale
  padding small, deterministic, and maintainable enough to implement.
- Define the supported scale families and exact runtime semantics before
  changing the public grammar.
- Prove or disprove a minimal update path for CPU scales and every active
  rendering backend without shader recompilation or dataflow rebuilds.
- Characterize cycles involving `domain()`, `range()`, `scale()`, and
  `bandwidth()` and require explicit failures rather than unstable feedback.
- Determine which invalidation signal consumers need when padding changes.
- Produce a go/no-go feasibility report. If the result is go, replace this
  evaluation plan with a separate implementation proposal before production
  changes begin.

## Non-goals

- Implement or ship dynamic padding as part of #471.
- Apply or pop the old stash onto the active working tree.
- Preserve `__paddingExprScopes` or defining-member semantics.
- Support continuous-scale pixel padding in the first candidate design.
  Continuous padding changes domain calculation and has different units and
  feedback behavior from band/point padding.
- Make every scale property reactive.
- Solve grouped transaction scheduling from #463.
- Commit experimental renderer changes to a production branch before the
  feasibility decision and implementation review.

## Key decisions

### Evaluate only after the ownership refactor lands

Use post-#471 `master` as the baseline. Reconstruct the smallest useful parts of
the stash in a disposable worktree or experimental branch; do not resurrect the
patch wholesale because scale, rendering, and WebGPU code have changed since
its base commit.

### Start with discrete positional scale families

The candidate public surface is ExprRef support for `padding`,
`paddingInner`, and `paddingOuter` on band, point, index, and locus scales.
Validate each value with the same bounds and family-specific rules as a literal.
Treat continuous-scale padding as a separate future question.

### Use the resolution-owned expression factory

All candidate padding ExprRefs bind through the expression boundary established
by #471. The experiment must contain no declaration-view runtime metadata,
member selection, or fallback lookup.

### Distinguish scale mutation from public event design

The old prototype added a public `padding` event. Re-evaluate whether consumers
need:

1. an internal padding-change notification;
2. a generalized scale-property invalidation token; or
3. an existing range/scale-state notification with clearer semantics.

Do not expand `ScaleResolutionApi` merely because the prototype did. Scale
helpers, marks, renderers, axes, layout, and debug consumers determine the
smallest correct contract.

### Prefer live uniforms or retained scale updates over recompilation

WebGL currently bakes literal band padding into generated GLSL, so dynamic
padding likely requires a uniform and a resolution-owned update listener. The
WebGPU renderer already models `paddingInner` and `paddingOuter` as updateable
scale leaves; verify that the Core adapter propagates changes without replacing
unrelated resources. Canvas2D and SVG use live scale behavior but still require
correct render scheduling and structured-output verification.

### Reject feedback instead of seeking convergence

An expression may safely depend on owner parameters, geometry, or another
scale. An expression that reads its own scaled output or bandwidth can create a
padding/output feedback loop. Detect and reject such cycles; do not add fixed
point iteration, tolerance thresholds, or order-dependent convergence.

## Alternatives to evaluate

### Dedicated padding event

Direct and close to the old prototype, but it widens the scale-resolution event
API and may encourage one event per future reactive property.

### General scale-state invalidation

Potentially simpler for helper and renderer consumers, but it may cause
unnecessary updates and blur the distinction between domain, range, and
derived scale state. Measure downstream work before selecting it.

### Treat padding changes as range changes

Attractive because scaled output and bandwidth change, but semantically false:
the scale's explicit range array does not change, and `range()` dependencies
should not necessarily re-evaluate. Use only if the contract is deliberately
redefined and all consumers agree.

### Reconfigure or recreate the whole scale

Simple at the call site but risks domain resets, lost zoom state, redundant
texture/uniform updates, and object-identity churn. Compare it against targeted
padding setters; reject it unless measurement shows those risks are absent.

### Compile a new shader after every padding change

Rejected as a candidate architecture. Padding is scalar runtime state and must
not cause program recompilation during interaction.

## Milestone 1: Reconstruct the semantic experiment after #471

### Intended outcome

A minimal, isolated prototype demonstrates resolution-owned padding expressions
on CPU scales without declaration provenance or renderer changes.

### Work

- [ ] Confirm #471 is merged, its plan is retired, and all resolution-scoping
      tests pass on the chosen baseline.
- [ ] Inventory the old stash by behavior, not by diff: type changes, scale
      mutation, notifications, helper invalidation, WebGL uniforms, tests, and
      the subpixel example.
- [ ] In a disposable worktree, extend only band, point, index, and locus
      padding types to accept ExprRefs.
- [ ] Bind padding expressions through the #471 resolution expression factory
      and own all subscriptions in the resolution/scale-manager lifecycle.
- [ ] Apply padding through live scale setters with validation for finite
      numeric values, supported bounds, padding shortcut precedence, and scale
      family compatibility.
- [ ] Prototype explicit self-output cycle detection and preserve existing
      scale-helper cycle diagnostics.
- [ ] Add temporary focused tests for owner/ancestor parameters, independent
      unit params, shared child `push: "outer"`, domain-dependent padding,
      resize-dependent padding, reconfiguration, and disposal.

### Affected areas and consumers

- `packages/core/src/spec/scale.d.ts`
- `packages/core/src/scales/scaleInstanceManager.js`
- `packages/core/src/scales/scaleResolution.js`
- expression-helper dependency handling
- temporary scale-padding tests derived from the stash's behavioral cases

### Verification

- The experiment contains no `__paddingExprScopes`, member-runtime lookup, or
  declaration fallback.
- Static padding behavior and existing scale tests remain unchanged.
- Padding updates change `paddingInner()`, `paddingOuter()`, `step()`, and
  `bandwidth()` exactly once per settled expression update under current
  scheduling semantics.
- Self-bandwidth and other same-output cycles fail deterministically.
- Disposed or replaced resolutions stop reacting.

### Documentation and migration

- Do not update public docs or generated schema during the experiment.
- Record candidate semantics and rejected cases in the feasibility report.

### Tentative commit

No production commit. If an isolated experimental commit is useful for review,
use `test(core): prototype resolution-scoped scale padding` and keep it outside
the delivery branch.

## Milestone 2: Evaluate invalidation, layout, and renderer cost

### Intended outcome

The experiment establishes the smallest correct cross-backend update contract
and identifies any unacceptable lifecycle, performance, or feedback costs.

### Work

- [ ] Trace every consumer of band/point/index/locus padding: CPU encoders,
      scale helpers, axes and grids, layout/step sizing, WebGL shaders and
      picking, Canvas2D, SVG, and the WebGPU adapter/renderer.
- [ ] Compare dedicated padding, generalized scale-state, and range-event
      invalidation using representative dependency and render counts.
- [ ] Prototype WebGL padding uniforms for normal and picking programs, with
      listener disposal and no shader recompilation on updates.
- [ ] Verify Canvas2D and SVG consume the updated live scale and schedule a
      repaint/export with no retained stale geometry.
- [ ] Verify the Core WebGPU adapter updates the renderer's existing
      `paddingInner` and `paddingOuter` leaves without rebuilding pipelines,
      columns, or unrelated bind groups. If the renderer contract is
      insufficient, describe the required generic API improvement rather than
      adding a Core-side workaround.
- [ ] Determine whether padding changes require layout reflow for fixed pixel,
      grow, and step-sized views, including axes, grids, nested offsets, and
      legends.
- [ ] Exercise parameter-, geometry-, domain-, and other-scale-driven padding
      through zoom, resize, dynamic view insertion/removal, and hidden-view
      initialization.
- [ ] Measure repeated-update counts and allocations sufficiently to reject
      accidental shader compilation, scale recreation, duplicate reflow, or
      listener growth.

### Affected areas and consumers

- `packages/core/src/gl/glslScaleGenerator.js`
- `packages/core/src/marks/mark.js`
- scale resolution/helper event plumbing
- `packages/core/src/rendering/immediate/`
- `packages/core/src/rendering/svg/` and Canvas2D rendering
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- `packages/webgpu-renderer` public updateable-scale contract if evidence shows
  it is insufficient
- layout sizing, axes, grids, nested offsets, and generated guides

### Verification

- Use focused unit tests for scale mutation, events, cycle failures, and
  disposal.
- Use `test-genomespy-views` for layout semantics and structured SVG output.
- Use `debug-genomespy-web` for normal/picking WebGL behavior, resize, zoom,
  and interactive parameter updates.
- Compare WebGL and WebGPU rendered positions for representative band, point,
  index, and locus cases where the WebGPU backend supports the mark.
- Confirm SVG padded rectangles and Canvas2D output match the live scale after
  updates.
- Confirm shader and pipeline compilation counts remain constant during pure
  padding updates.

### Documentation and migration

- Keep findings in the feasibility report; do not publish grammar docs yet.
- Record any backend deliberately excluded from a potential first release and
  whether that exclusion is acceptable.

### Tentative commit

No production commit. An optional isolated experiment may use
`test(core): evaluate dynamic scale padding updates`.

## Review gate: Feasibility evidence

Review the experiment and measurements before deciding whether to implement.
The review must cover resolution lifecycle, helper cycles, layout semantics,
normal and picking WebGL, Canvas2D/SVG, WebGPU contract implications, and the
public event surface. A working demo alone is insufficient.

## Milestone 3: Record a go/no-go decision

### Intended outcome

The repository has a concise evidence-backed conclusion without silently
shipping experimental behavior.

### Work

- [ ] Summarize the candidate grammar, ownership, validation, lifecycle,
      invalidation, layout, and renderer behavior.
- [ ] List measured update/reflow/recompile behavior and unresolved risks.
- [ ] Decide one of:
      - **Go:** the design is bounded and maintainable; write a fresh
        implementation proposal with production milestones and discard the
        experimental patch from the delivery branch.
      - **Narrow go:** define a smaller supported subset and justify every
        excluded scale family, dependency, or backend.
      - **No-go/defer:** record the blocking complexity or prerequisite and
        retain no public type/schema changes.
- [ ] Reconcile this feasibility plan as completed or discarded before
      retiring it.

### Affected areas and consumers

- This plan and any successor implementation proposal
- optionally a dedicated GitHub issue for dynamic scale padding, created only
  when the user requests external publication
- no production grammar or renderer files unless a later implementation plan
  is approved

### Verification

- Every conclusion cites a test, trace, measurement, or inspected consumer.
- The active delivery branch contains no experimental padding code after a
  no-go/defer decision.
- A go decision includes a complete production acceptance matrix and migration
  plan rather than pointing at the old stash.

### Documentation and migration

- The feasibility result is internal until implementation is approved.
- Public documentation, schema generation, changelog entries, and examples
  belong to a later implementation plan only.

### Tentative commit

`chore(core): assess dynamic scale padding feasibility`

## Risks

### Padding changes scaled output without changing domain or range arrays

Consumers that subscribe only to domain or range can remain stale. A dedicated
or generalized invalidation contract may be necessary across helpers and
renderers.

### Layout feedback

Step-sized views, axes, grids, and nested offsets may derive geometry from
bandwidth while padding itself may depend on width, height, or another scale.
Reject cycles and characterize reflow requirements before exposing the grammar.

### Backend divergence

WebGL bakes literal padding into GLSL today, immediate renderers read live CPU
scales, and WebGPU has retained updateable scale leaves. The feature is not
feasible if these paths cannot share one observable semantic contract at
reasonable complexity.

### Prototype bias

The stash proves one implementation can render a case, but its event surface,
scope metadata, and shader choices are not requirements. Reconstruct from
desired behavior and current architecture.

### Scheduling glitches

Until #463, expressions depending on several parameters may observe current
subscription scheduling. Dynamic padding must not claim transaction-coherent
updates. Decide whether this limitation matches existing domain/range ExprRefs
or is severe enough to defer the feature.

## Unresolved questions

- Is a padding-specific event the smallest honest contract, or should scale
  helpers and renderers subscribe to a generalized scale-state revision?
- Should `range("x")` react to padding even though the explicit range is
  unchanged, or only `scale()`, `invert()`, and `bandwidth()` dependencies?
- Which expressions are safe: owner params and geometry only, domain of the
  same scale, other-scale output, or some strict subset?
- Does a domain-driven padding update during zoom need same-turn propagation to
  prevent one stale frame?
- Do step-sized views require layout reflow when padding changes, and can that
  reflow itself change the padding expression?
- Can the WebGPU adapter update padding through its existing leaf-updater
  contract, or does Core lack a stable hook to notify it?
- Should the first supported surface include `padding` shorthand, or only
  explicit `paddingInner` and `paddingOuter` to avoid precedence ambiguity?
- Is index/locus padding sufficiently valuable to justify high-precision WebGL
  and WebGPU coverage, or should a first version be limited to band/point?

## Feasibility acceptance criteria

- Evaluation starts from a closed #471 implementation and uses only
  resolution-owned expression scope.
- The experiment supports a clearly bounded discrete-scale subset and validates
  values consistently with literal padding.
- Safe dependencies update live CPU scale state deterministically.
- Unsafe self-output/layout feedback fails explicitly.
- Required invalidation semantics are documented for every scale helper and
  consumer.
- WebGL updates normal and picking behavior without shader recompilation.
- Canvas2D and SVG do not retain stale scaled geometry.
- WebGPU implications are verified against the public renderer contract.
- Resize, zoom, layout, and dynamic view lifecycle behavior is understood.
- Update counts, reflows, resource churn, and listener disposal are measured.
- A go, narrow-go, or no-go decision is recorded with evidence.
- No experimental public grammar changes ship without a separately reviewed
  implementation proposal.

## Plan retirement

After the go/no-go decision is recorded, reconcile every checkbox and commit
the completed or discarded state. Delete this plan in a later commit. A go
decision must create a fresh implementation plan rather than turning this
feasibility artifact into a delivery checklist.

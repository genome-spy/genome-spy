# Label-aware pileup and settled reactive updates

## Status

Implemented. The projected-label example uses the debounced expression
parameter described below.

## Context

`examples/core/transforms/pileup-labels.json` demonstrates the existing pileup
behavior: labels are drawn after their features, but lane assignment only sees
the genomic feature interval. The projected-label documentation example
measures labels in pixels, converts the widths to base pairs with the current x
mapping, and piles up the expanded intervals.

The projected example currently replays the scale-dependent dataflow tail on
every x-scale mapping update:

1. `pixelsPerBase` depends on the x mapping and the view width.
2. `FormulaTransform` observes the parameter expression and calls
   `requestRepropagate()` when it changes.
3. The collector after `measureText` is the optimized replay root, so text is
   not measured again, but the projection, pileup, collector publication, and
   mark-data update still repeat for every zoom frame.
4. The resulting lane assignments can change continuously during a smooth zoom.

This is consistent with the current reactive contract: displayed scale domains
and mappings publish intermediate animation and interaction frames. The
dataflow update queue coalesces changes within one propagation boundary, but it
does not coalesce changes across animation frames.

GenomeSpy already has two related but narrower mechanisms:

- `ViewportDomainScheduler` waits 150 ms after positional navigation before
  recomputing viewport-derived domains.
- Lazy interval sources can debounce either domain changes or quantized window
  requests.

Comparable systems separate immediate interaction state from settled work.
Vega event streams support both debounce and throttle, including scale-driven
signals, while D3 Zoom exposes `start`, `zoom`, and `end`; its wheel gesture ends
after 150 ms without another wheel event.

References:

- <https://vega.github.io/vega/docs/event-streams/>
- <https://d3js.org/d3-zoom>

## Goals

- Keep feature positions and existing lane assignments stable throughout
  continuous wheel, drag, touch, keyboard, and programmatic zoom updates.
- Reproject label extents and recompute pileup once after the mapping settles.
- Keep rendering the existing rows with the live scale while expensive derived
  data remains stable.
- Preserve immediate initial evaluation and deterministic synchronous behavior
  when no debounce is requested.
- Reuse the ordinary reactive/dataflow publication path after the delay.

## Non-goals

- Change the pileup algorithm or make pileup itself aware of text metrics.
- Animate records between old and new lanes.
- Add tuple-level incremental dataflow updates.
- Prevent an explicit data replacement from producing a new pileup while a
  zoom gesture is active.

## Approaches

### A. Debounced expression parameters (recommended first step)

Extend expression parameters with an optional trailing-edge delay:

```json
{
  "name": "pixelsPerBase",
  "expr": "width * abs(scale('x', 1) - scale('x', 0))",
  "debounce": 50
}
```

Implement this as an immediate target computed plus a published value ref. The
target evaluates normally and restarts a timer when it changes. The published
ref receives the latest target only after the quiet period and flushes the
reactive graph so downstream formula replay, pileup, collector publication, and
rendering settle through the existing scheduler.

The initial value must publish synchronously. Replaced parameter bindings and
disposed scopes must cancel their timer. A timer that has not fired is future
work and therefore is not covered by the current `whenPropagated()` barrier;
tests and documentation must state that explicitly.

Advantages:

- Small declarative surface and useful beyond pileup.
- Debounces the meaningful scalar projection rather than all inputs of a
  transform.
- Leaves `FormulaTransform`, `PileupTransform`, and replay-root optimization
  unchanged.
- Closely follows Vega's established signal/event-stream vocabulary.

Tradeoffs:

- Time-based settling adds latency even when the caller knows an exact gesture
  boundary.
- Every debounced parameter owns a timer.
- Data changes can still replay the downstream formula immediately and read the
  latest published projection, which is intentional but must be tested.

### B. Debounce an individual reactive transform

Add a `debounce` property to `FormulaParams`, or more broadly to the subset of
transforms whose expression invalidation requests replay. The expression
subscription would restart a transform-owned timer and call
`requestRepropagate()` only after it expires.

Advantages:

- The delayed operation is explicit at the expensive dataflow boundary.
- It is straightforward to count and test replay invocations.
- It avoids adding asynchronous nodes to the parameter graph.

Tradeoffs:

- The policy is duplicated if several transforms use the same changing value.
- A generic `TransformParamsBase.debounce` would misleadingly imply that every
  transform has reactive inputs.
- A formula-specific property is less reusable than a settled parameter and
  couples scheduling policy to one consumer.

This is a reasonable fallback if parameter-level buffering proves invasive.

### C. Explicit scale navigation lifecycle and settled mappings

Add per-resolution navigation state with begin/update/end semantics and expose
a settled mapping dependency. Drag, touch, inertia, and animated `zoomTo()` can
provide exact end boundaries. Wheel and keyboard bursts still need a short
quiet-period timer. A scale helper or internal derived parameter could then
depend on the settled mapping rather than every displayed-domain frame.

Advantages:

- No arbitrary extra delay after gestures that already have an exact end.
- One lifecycle can coordinate other expensive scale-dependent work, including
  label layout and non-windowed aggregation.
- The model distinguishes live rendering state from committed analytical state.

Tradeoffs:

- Navigation currently enters through several controllers and through public
  scale APIs, so complete bracketing is a cross-cutting change.
- Scale domains can also change because of expressions, linked selections,
  viewport updates, and direct API calls; “settled” needs precise semantics for
  each source.
- A helper must depend on a published settled snapshot, not merely delay a
  notification while later reading a mutable live scale.

This is the stronger long-term abstraction if more features need exact
interaction transactions. It is too broad for the first label-aware pileup
implementation.

## Decision

Start with debounced expression parameters (Approach A). It puts the delay at
the source of the scale-to-data projection, composes with the existing replay
queue, and does not make pileup or text measurement responsible for interaction
policy.

Keep the delay trailing-edge and configurable, with 50 ms in the example. Do
not change the default behavior of existing expression parameters. Revisit
explicit navigation sessions only if at least one additional feature needs
precise start/end semantics or the timer latency becomes user-visible.

Initially reject an expression parameter that specifies both `debounce` and
`transition`. Applying the existing numeric smoother after the quiet period
would again publish many intermediate values and defeat the pileup use case;
choosing the opposite ordering also introduces unclear completion semantics.

## Milestones

### 1. Add debounced expression-parameter publication (completed)

Intended outcome: expression parameters can publish their initial value
immediately and later values after a configured quiet period.

Affected areas and consumers:

- `packages/core/src/spec/parameter.d.ts`
- `packages/core/src/paramRuntime/viewParamRuntime.js`
- Parameter debug snapshots and schema output
- All existing expression-parameter consumers, which remain synchronous unless
  `debounce` is present

Verification:

- Fake-timer tests cover initial publication, timer restart, equality,
  disposal, scope replacement, and downstream graph ordering.
- Existing parameter, scale dependency, and reactive replay suites remain
  unchanged.
- Confirm and document the relationship with `whenPropagated()`.

Documentation:

- Add the property to parameter documentation and show a non-pileup minimal
  example if it clarifies the generic behavior.

Tentative commit: `feat(core): add debounced expression parameters`

### 2. Apply settled projection to label-aware pileup (completed)

Intended outcome: the projected-label example keeps lanes stable during zoom
and recomputes once after zoom activity stops.

Affected areas and consumers:

- `examples/docs/grammar/transform/pileup/pileup-projected-labels.json`
- Shared example snapshots
- Pileup documentation if the example is promoted from exploratory Core
  coverage to user-facing grammar documentation

Verification:

- Spy on the projected example's downstream collector or pileup transform and
  verify zero replays during a burst, followed by one replay after 50 ms.
- Browser smoke-test wheel zoom, drag pan, touch/pinch where available, resize,
  and animated `zoomTo()`.
- Confirm label measurement remains cached and lane assignment changes at most
  once per settled zoom.

Documentation:

- Explain that the label width is measured in pixels, divided by
  `pixelsPerBase`, and added only to the collision interval; rendered feature
  coordinates remain unchanged.

Tentative commit: `feat(core): settle label-aware pileup during zoom`

## Risks and unresolved questions

- Should `debounce` accept only a nonnegative number, or also an expression?
  Start with a number unless a concrete dynamic-delay use case appears.
- Should pending debounce timers be visible to a new public idle barrier? The
  current `whenPropagated()` meaning should remain unchanged initially.
- If a resize and zoom overlap, the final publication must use the latest value
  of both width and scale mapping.
- Export initiated during a pending delay will capture the stable, pre-settle
  lanes. Decide later whether export should explicitly flush delayed work.
- A large zoom can temporarily make old lanes conservative or allow visual
  label overlap. This is preferable to continuous jumping, but the rendering
  behavior should be demonstrated and accepted explicitly.

## Acceptance criteria

- Both examples initialize and render with inline toy data.
- The baseline example visibly allows labels to collide with later features.
- The projected example reserves measured label width in coordinate units and
  resembles a compact gene/feature annotation track.
- With the proposed debounce implemented, continuous zoom produces no pileup
  replay until the quiet period, followed by exactly one replay using the final
  mapping.
- Initial rendering, non-debounced parameters, ordinary data replacement,
  disposal, and error propagation retain their existing behavior.

## Final integration verification

Run the focused parameter-runtime, reactive-replay, pileup, scale-domain, and
shared-example suites. Then render both new examples side by side and exercise
wheel zoom, drag pan, a programmatic animated zoom, and container resize. Verify
that marks continue to follow the live scale, labels and lanes remain stable
during navigation, and the final settled pileup matches a fresh render at the
same domain.

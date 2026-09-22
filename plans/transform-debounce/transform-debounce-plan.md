# Debounced reactive transform replay

## Status

Implemented. Formula and filter transforms debounce reactive replay while new
input batches continue to consume current expression values.

## Context

Expression-driven transforms currently request upstream replay whenever a
dependency changes. Debouncing the parameter value avoids those replays, but a
new lazy-data batch arriving during the delay observes the previously published
value. The batch can therefore produce a layout with stale scale calibration
and then jump when the parameter timer triggers another replay.

Formula and filter transforms already separate per-row expression evaluation
from replay scheduling: incoming rows call the expression reader, while the
expression subscription calls `requestRepropagate()`. This provides a natural
boundary for delaying expensive replay without delaying the value itself.

Vega applies debounce to event delivery: the latest event remains the source of
truth while downstream handling waits for a quiet period. GenomeSpy will use
the same trailing-edge concept for reactive transform replay, without copying
Vega implementation code.

Reference: <https://vega.github.io/vega/docs/event-streams/>

## Goals

- Keep expression parameters current throughout zoom and other interaction.
- Coalesce replay requested by formula and filter dependency changes.
- Let newly arriving data evaluate immediately with current parameter values.
- Suppress a pending replay when a newer input batch already incorporated the
  current expression revision.
- Preserve existing synchronous behavior when no debounce is configured.
- Cancel delayed work when the transform is disposed.

## Non-goals

- Debounce ordinary incoming data batches.
- Delay lazy-source requests or coordinate navigation sessions.
- Add a debounce property to transforms without reactive predicates or
  expressions.
- Change progressive scheduling in `displace2d` or the specialized reactive
  configuration of text-measurement and displacement transforms.
- Introduce tuple-level incremental updates.

## Decision

Add an optional nonnegative `debounce` duration to formula and filter
transforms. It applies only to replay caused by their reactive expression or
selection predicate. Incoming data continues to propagate immediately.

`Transform` will provide a protected reactive-replay scheduler shared by these
transforms. Each reactive invalidation increments a revision and restarts a
scope-owned timer. A completed input batch records the revision it consumed. At
timer expiry, replay is requested only when the current revision has not
already been consumed.

When `debounce` is absent, formula and filter retain their current direct
`requestRepropagate()` behavior. A configured value of zero still uses a
trailing timer and coalesces synchronous bursts.

The projected-label example will use an immediate `pixelsPerBase` parameter and
put `debounce` on the formula transform. Thus a lazy batch always projects label
widths with the current mapping, while cached rows replay only after zoom
activity stops.

## Alternatives

### Keep parameter-level debounce in the example

This minimizes implementation work but allows lazy publication to consume the
old parameter value. Independent source and parameter timers make ordering a
timing convention rather than a dataflow guarantee.

### Wait for all debounced parameters before publishing lazy data

This would coordinate publication but couples sources to unrelated parameters
and can starve data if another temporal parameter keeps changing.

### Add debounce to every transform

Many transforms have no reactive inputs, while displacement transforms own
specialized replay and animation lifecycles. Accepting a property with no
effect would be misleading. Further transforms can opt into the shared
scheduler when their semantics are specified and tested.

## Milestone

### Add revision-aware transform replay debounce (completed)

Intended outcome: formula and filter transforms coalesce dependency-driven
replay while processing new data with current values.

Affected areas and consumers:

- `packages/core/src/spec/transform.d.ts`
- `packages/core/src/data/transforms/transform.js`
- Formula and filter transform initialization
- Reactive replay and schema tests
- Parameter/dataflow architecture documentation
- Formula and filter grammar documentation
- Projected-label pileup example and preview

Verification:

- Fake timers verify trailing-edge coalescing and final-value replay.
- A new input batch before timer expiry consumes the current revision and
  suppresses the redundant replay, including an empty batch.
- Disposal cancels pending work.
- Schema validation accepts nonnegative delays and rejects negative values.
- Existing non-debounced formula and filter tests retain immediate behavior.
- The projected-label example passes browser rendering and docs builds.

Tentative commit: `feat(core): debounce reactive transform replay`

## Risks

- Completion can cause downstream domain changes that invalidate the same
  expression. The consumed revision must be captured before child completion
  so such changes still schedule replay.
- Without an upstream collector, replay can reach an asynchronous source. The
  documentation should continue recommending a collector before expensive
  scale-dependent replay.
- A delayed callback is outside `whenPropagated()`, matching debounced
  parameters. Tests must use timers or an explicit wait.

## Acceptance criteria

- Continuous zoom does not replay the projected-label formula until the quiet
  period ends.
- Lazy data arriving during the quiet period uses the latest
  `pixelsPerBase` value and does not trigger an identical replay afterward.
- Existing data replays once with the final value if no new batch arrives.
- Initial data, non-debounced transforms, disposal, and schema validation keep
  their existing contracts.

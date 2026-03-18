# Encoder Fix Plan

## Context

GenomeSpy currently has two different paths for conditional visual encoding:

- Shader-side evaluation used by rendering
- JavaScript-side evaluation used incidentally by host-side consumers such as tooltips

The recent tooltip fix exposed that the JavaScript path is not a reliable source
of truth for selection-driven conditional encodings. In the penguins scatter
plot, rendering used the correct conditional color branch while the tooltip
legend fell back to the default color branch.

## Goal

Make host-side encoded-value resolution correct and maintainable without
regressing rendering behavior.

The target behavior should largely match Vega-Lite semantics for conditional
encodings:

- Conditions are evaluated in order
- The first matching branch wins
- The base channel definition acts as the fallback branch
- Selection predicates honor the configured `empty` behavior
- Encoded values use the matching branch's data/value source and scale

## Recommended Path

Introduce a dedicated host-side encoded-value resolver first, then decide
whether to fold that behavior back into the existing JavaScript encoder API.

Recommended intermediate API shapes:

- `resolveEncodedChannelValue(mark, channel, datum)`
- `resolveEncodedValue(encoder, datum, { encoding, paramRuntime })`

This keeps tooltip and any future inspector/export code on a correct shared
path without assuming that `encoder(datum)` already has shader-level parity.

## Options

### Option 1: Make `encoder(datum)` authoritative everywhere

Move full conditional branch resolution into the JavaScript encoder layer so
that `encoder(datum)` behaves the same way host-side and shader-side code
expect.

Pros:

- Cleanest API
- Tooltip and other consumers stay simple
- Better long-term consistency across rendering and host-side logic

Cons:

- Highest implementation risk
- Touches under-tested conditional encoder code
- Requires broader regression coverage before it is safe

### Option 2: Add a dedicated host-side resolver

Keep the current encoder API mostly intact, but add a generic resolver for
non-rendering use cases.

Pros:

- Pragmatic and low-risk
- Fixes the real problem for tooltip-like consumers
- Creates a single place for future host-side encoded-value needs

Cons:

- Two related APIs exist in parallel
- Does not by itself simplify the current encoder layer

### Option 3: Put the resolver on `Mark`

Add a mark-level method such as `mark.getEncodedChannelValue(channel, datum)`.

Pros:

- Simple for callers
- Can hide mark-specific differences if needed

Cons:

- Less reusable than an encoder-layer helper
- Pushes generic encoding concerns into marks

## Recommendation

Choose Option 2 now, keep Option 1 as the longer-term cleanup target.

That gives us:

- A correct shared host-side path immediately
- A place to consolidate tooltip logic
- A cleaner migration path if the JavaScript encoder is later repaired or replaced

## Suggested Work Items

1. Audit current conditional encoder behavior and tests.
2. Define the host-side encoded-value resolver API.
3. Move tooltip conditional-resolution logic into that shared helper.
4. Add tests for:
   - value-with-condition
   - field-with-condition
   - datum-with-condition
   - multiple ordered conditions
   - `empty: true` and `empty: false`
   - interval and point selections
   - scale application on conditional branches
5. Compare behavior against Vega-Lite conditional semantics and document any
   intentional deviations.
6. Reassess whether `encoder(datum)` should be upgraded to use the same logic or
   remain a lower-level primitive.

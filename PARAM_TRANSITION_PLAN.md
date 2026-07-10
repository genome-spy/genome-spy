# Param Transition Plan

## Rationale

GenomeSpy parameters can drive visual density, layout, opacity, thresholds, and
data filtering. Many of these values change in response to direct user input,
such as sliders or zoom gestures. Abrupt changes are correct but can feel rough
in modern interfaces, especially when a small numeric change produces a large
visual jump.

Authors can currently smooth some cases with expressions, for example by using
`smoothstep(...)` in an opacity expression. That mixes state semantics with
presentation. A param transition should let a specification keep the target
state crisp while the runtime exposes a smoothly changing numeric value for
rendering and layout.

The initial feature should be a small visual smoothing primitive, not a general
async param system.

## Use Cases

### Smooth Slider-Driven Layout

In `examples/docs/genomic-data/examples/bam-read-alignments.json`,
`laneHeight` is controlled by an integer slider:

```json
{
  "name": "laneHeight",
  "value": 12,
  "bind": { "input": "range", "min": 2, "max": 30, "step": 1 }
}
```

Changing the slider from `2` to `3` immediately increases the pileup row height
by 50%. The target value should remain discrete because the slider step is an
integer, but expressions should be able to see fractional intermediate values
while the visual layout settles.

### Crisp State With Smooth Presentation

The BAM read alignment example currently uses a ramp for the "Zoom in closer to
load data" message:

```json
{
  "expr": "smoothstep(windowSize * 0.7, windowSize, abs(domain('x')[1] - domain('x')[0]))"
}
```

The BAM source uses `windowSize` as a hard loading threshold. The opacity ramp
creates an in-between state where the message can be partially visible even
when the data is already loadable.

A transitioned derived param would keep the state decision aligned with loading
while smoothing only the presentation:

```json
{
  "name": "zoomMessageOpacity",
  "expr": "abs(domain('x')[1] - domain('x')[0]) > windowSize ? 1 : 0",
  "transition": { "type": "lerp", "halfLife": 80, "epsilon": 0.001 }
}
```

### Smooth Visual Thresholds

Input-bound thresholds can remain precise target values while visual encodings
follow smoothly. This helps avoid abrupt changes in opacity, size, or guide
positions during slider drags.

## Follow-up Design Work

### Headless Runtime Semantics

Headless rendering has no animation frames. A transitioned parameter must
therefore snap to its target immediately when it is updated in a headless
runtime.

The headless animator invokes transition callbacks synchronously with a fixed
timestamp. Reusing frame-based lerp scheduling there can re-enter the smoother
before it settles, and timestamps that move backwards from the smoother's
initial timestamp can prevent convergence.

Implemented behavior:

- `Animator` exposes whether frame interpolation is enabled. The headless
  animator disables it.
- The lerp smoother writes directly to its target when interpolation is
  disabled, instead of scheduling another transition callback.
- A headless-engine regression test updates a transitioned parameter through
  `setValue` and verifies that its current and target values both settle
  immediately.

### Transition Lifecycle

Transitioned expression parameters initially evaluate before all scale and view
configuration is complete. Their initial value must be corrected without
animating from a placeholder scale state. After preparation, later expression
updates should animate normally.

The current approach tracks this with a runtime flag and calls a separate
finalization method from each hierarchy construction path. This is easy to
miss when adding a new path that creates or inserts views.

Centralize this lifecycle boundary where possible:

- Treat hierarchy preparation as the single point that changes transitioned
  expressions from initialization behavior to interactive behavior.
- Ensure dynamic subtree insertion uses the same preparation helper rather
  than repeating individual configuration and finalization calls.
- Add coverage for initial scale-derived expression values and a subsequent
  interactive scale update, verifying that only the latter animates.

### Specification Contract

Transitions are supported only for numeric value parameters with an explicit
numeric `value`, and for expression parameters whose evaluated values are
numeric. They are not supported for selections, rulers, or `push: "outer"`
parameters.

The TypeScript specification and generated JSON Schema should express those
constraints directly. In particular, `ParameterBase` currently makes
`push: "outer"` available to transitioned parameter branches even though the
runtime rejects that combination. A specification accepted by schema validation
should not fail later during parameter registration.

Refine the parameter unions so that:

- `push: "outer"` is available only on compatible non-transitioned writable
  value parameters.
- transitioned value parameters require a finite numeric initial `value`;
- expression parameters cannot use `bind`; and
- selection and ruler parameter branches cannot contain `transition`.

Add schema tests for rejected transitioned `push: "outer"` parameters in
addition to the existing numeric-value and selection cases.

### Runtime Simplification

The supported transition forms have only two registration paths: a numeric base
value and a derived expression. The fallback branch for a parameter that has a
transition but neither `value` nor `expr` cannot be produced by the intended
schema and only duplicates base-parameter setup.

Remove that fallback or reject it in shape validation. Keeping the registration
logic aligned with the two public forms makes the numeric-value invariant and
the transition state ownership easier to follow.

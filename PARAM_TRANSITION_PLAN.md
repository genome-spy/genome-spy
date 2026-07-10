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

## Initial Grammar

Add `transition` to both writable value parameters and derived expression
parameters. Keep the two parameter shapes mutually exclusive:

```ts
export type VariableParameter =
    | ValueParameter
    | ExprParameter;

export interface ValueParameter extends ParameterBase, PersistedParameter {
    value?: any;
    bind?: Binding;
    transition?: ParamTransition;
    expr?: never;
}

export interface ExprParameter extends ParameterBase, PersistedParameter {
    expr: string;
    transition?: ParamTransition;
    value?: never;
    bind?: never;
}

export type ParamTransition = LerpTransition;

export interface LerpTransition {
    type: "lerp";
    halfLife?: number;
    epsilon?: number;
}
```

Writable input-bound example:

```json
{
  "name": "laneHeight",
  "value": 12,
  "bind": { "input": "range", "min": 2, "max": 30, "step": 1 },
  "transition": {
    "type": "lerp",
    "halfLife": 60,
    "epsilon": 0.02
  }
}
```

Derived expression example:

```json
{
  "name": "zoomMessageOpacity",
  "expr": "abs(domain('x')[1] - domain('x')[0]) > windowSize ? 1 : 0",
  "transition": {
    "type": "lerp",
    "halfLife": 80,
    "epsilon": 0.001
  }
}
```

Suggested defaults:

```json
{
  "type": "lerp",
  "halfLife": 80,
  "epsilon": 0.001
}
```

The generated JSON Schema should preserve the same mutual exclusion. A
parameter should validate as either a writable value parameter or a derived
expression parameter, not both.

## Initial Scope

The first implementation should support only:

- variable parameters
- numeric scalar values
- `transition.type: "lerp"`
- input-bound writable params
- derived `expr` params

The first implementation should reject:

- arrays
- objects
- colors
- selection params
- ruler params
- non-finite numbers
- params that combine `expr` with `value`
- params that combine `expr` with `bind`
- generic promises or async expression values
- additional transition types such as tween, spring, delay, or easing

This keeps the behavior useful while avoiding early commitments around
interpolation semantics, object identity, persistence shape, and animation
completion APIs.

## Semantics

Transitioned params have two conceptual values:

- target value: the latest value written to a writable param or computed by a
  derived expression
- current value: the exposed runtime value that expressions read

Rules:

- `bind.step` constrains target values, not current values.
- `bind` is only valid for writable value parameters.
- Expressions read the current value.
- Persistence and provenance store the target value.
- Initial registration should snap current to target.
- Bookmark/provenance restore should snap current to target.
- Interactive updates should animate current toward target.
- A transitioned param must evaluate to a finite number.
- `whenPropagated()` remains a synchronous graph-settled barrier and must not
  wait for transition settling.

The public mental model should be:

> This numeric parameter follows target changes smoothly.

## Implementation Ideas

### Runtime Representation

Represent a transitioned param internally as a target/current pair:

- writable/input-bound params: setters write the target value
- derived params: the expression computes the target value
- the named public param ref exposes the current value

Downstream graph consumers should not need to know that the param is
transitioned. They should receive ordinary param change notifications as the
current value changes.

### Scheduling

Use the existing animator frame loop rather than timers:

- target changes start or retarget a lerp runner
- each animation frame computes a new current value
- each current value write flows through normal param propagation
- rendering, layout reflow, and dataflow subscribers react through existing
  expression subscriptions

This is important for layout-driven cases such as `laneHeight`, where each
frame may need layout reflow rather than only a render request.

### Lerp Formula

Reuse or adapt the existing `makeLerpSmoother` helper in
`packages/core/src/utils/animator.js`. It is already used by zooming,
scrollbars, and inertia, and it implements a half-life based smoother:

```js
next = target + (current - target) * Math.pow(2, -dt / halfLife);
```

Stop when `Math.abs(target - current) < epsilon`, then snap to the target value.

The existing helper works with records of numeric values. The param transition
implementation can either wrap scalar params as `{ value }` or factor out a
small scalar helper while preserving the same formula and animator scheduling.

### Lifecycle

Transition runners must be scope-owned:

- dispose pending animation callbacks when the owning param scope is disposed
- cancel or ignore pending frames after disposal
- avoid retaining expression closures after disposal

### Target Access

Some callers need target values rather than current values:

- App provenance and bookmarks
- input binding UI display
- restore paths
- possibly embed API extensions

Add a small runtime-facing target accessor instead of forcing these callers to
infer target state from the public current value.

## Relationship To Vega

Vega keeps `debounce`, `throttle`, `filter`, `between`, and `consume` on event
streams. Signal values remain synchronous dataflow values. Vega also has a
separate `bind.debounce` for input bindings.

GenomeSpy should follow the same separation:

- `bind.debounce` controls how often input target updates arrive
- `transition` controls how the exposed numeric param value follows the target
- event-stream features should not be folded into `transition`

## Documentation

Update `packages/core/src/spec/parameter.d.ts` with concise user-facing docs.
The docs should explain:

- transitioned params are numeric scalar params
- expressions read the current transitioned value
- input bindings and persistence use target values
- `bind.step` applies to targets only
- `transition` is intended for visual smoothing

Update `docs/grammar/parameters.md` with a short section and examples for:

- input-bound `laneHeight`
- derived `zoomMessageOpacity`

After schema generation, docs can embed the new `ParamTransition` schema with a
`SCHEMA ParamTransition` macro if useful.

## Testing

Add focused tests close to the runtime code:

- writable transitioned param initializes current and target to the initial value
- setting a target animates current toward the target
- retargeting during animation follows the new target
- derived transitioned param reacts to upstream changes
- non-finite target values fail fast with a clear error
- params combining `expr` with `value` or `bind` are rejected
- target value remains available separately from current value
- scope disposal stops pending animation work

For layout behavior, add a representative integration test only after the
runtime behavior is stable.

## Open Questions

- Should embed API `getValue()` return current, target, or support both?
- Should input binding labels display target, current, or both?
- What internal option should snap instead of animate during restore?
- Should transitions be disallowed or warned for params used by data source
  options or transforms?
- What default `halfLife` and `epsilon` feel good for common visual params?

## Non-Goals For The First Version

- Arrays, objects, colors, or locus interpolation
- Springs, tweens, easing curves, or transition pipelines
- Promise-returning expressions
- Async dataflow nodes
- Animation-completion barriers
- Automatic detection of presentation-only params

## Step-by-Step Implementation Plan

The sequence below keeps the work reviewable and leaves the runtime usable after
each commit. Tests should travel with the runtime commit that introduces the
behavior they verify.

### 1. Land The Planning Document

Tentative commit:

```text
docs: plan param transitions
```

Scope:

- keep the rationale, use cases, initial grammar, and runtime constraints in
  `PARAM_TRANSITION_PLAN.md`
- use the document as the review target before changing schema or runtime code

Validation:

- no runtime validation needed
- inspect the markdown for clear terminology around target/current values

### 2. Tighten Parameter Grammar And Schema Types

Tentative commit:

```text
feat(core): define param transition grammar
```

Scope:

- update `packages/core/src/spec/parameter.d.ts`
- split variable params into mutually exclusive value and expression shapes
- add `ParamTransition` and `LerpTransition` types
- document that `transition` initially supports numeric scalar params only
- preserve the existing restriction that `bind` belongs only to writable value
  params
- reject or clearly type out invalid combinations such as `expr` with `bind`

Validation:

- regenerate JSON schema artifacts if the project requires it
- add or update schema tests for valid transitioned value params, valid
  transitioned expression params, and invalid `expr` plus `bind`

### 3. Add Runtime Target/Current State

Tentative commit:

```text
feat(core): track current and target param values
```

Scope:

- add a small transition state object for params with `transition`
- initialize current and target to the same numeric scalar value
- expose current values through existing expression reads and normal
  `getValue()` behavior
- add an internal target-value accessor for provenance, restore paths, and input
  bindings
- make non-transitioned params keep their current fast path

Validation:

- unit-test initialization for writable and expression params
- unit-test that ordinary params behave as before
- unit-test that target values can be read independently from current values

### 4. Wire Numeric Lerp Animation Into Param Propagation

Tentative commit:

```text
feat(core): animate numeric param transitions
```

Scope:

- adapt the existing `makeLerpSmoother` helper, or factor out a scalar helper
  from it
- start animation when a transitioned param receives a new finite numeric
  target
- publish intermediate current values through the existing param graph
- stop animating when the current value is within `epsilon` of the target
- retarget an active transition without restarting from the old initial value
- dispose pending animation work with the owning param scope

Validation:

- unit-test target changes over controlled animation frames
- unit-test retargeting while animation is active
- unit-test convergence and final snap to the target
- unit-test disposal cancelling or ignoring future animation frames

### 5. Support Derived Expression Transitions

Tentative commit:

```text
feat(core): transition derived numeric params
```

Scope:

- treat expression output as the target value for transitioned expression params
- keep expression evaluation synchronous; only the exposed current value is
  smoothed
- ensure downstream expressions see intermediate current values
- fail fast when the expression produces a non-finite or non-numeric target

Validation:

- unit-test an upstream writable param driving a transitioned expression param
- unit-test downstream expressions reacting to intermediate values
- unit-test non-numeric expression output with a clear error

### 6. Preserve Target Semantics In Bindings And App State

Tentative commit:

```text
feat(app): preserve param transition targets
```

Scope:

- make input bindings write target values and avoid reflecting transient current
  values back into form controls
- make App provenance/bookmarks persist target values for transitioned bound
  params
- ensure restore paths can snap current to target when replaying state
- keep `bind.step` and input min/max validation applied to target values

Validation:

- unit-test or integration-test that a bound slider stores the discrete target
  while the visible param current value moves smoothly
- verify provenance/bookmark restore does not replay a transition unless the
  chosen restore semantics explicitly ask for it

### 7. Document User-Facing Behavior

Tentative commit:

```text
docs(core): document param transitions
```

Scope:

- update `docs/grammar/parameters.md`
- include short examples for `laneHeight` and threshold opacity smoothing
- explain that expressions read current values while inputs and persistence use
  targets
- document the first-version numeric scalar limitation

Validation:

- build docs or run the lightest available docs/schema check
- check generated docs for concise schema text and no implementation-heavy
  wording

### 8. Update Representative Examples

Tentative commit:

```text
docs(examples): use param transitions in BAM examples
```

Scope:

- update the BAM `laneHeight` slider to use `transition`
- replace the opacity ramp with a hard semantic threshold plus a smoothing
  transition
- avoid using transition in places where intermediate numeric states affect
  data loading, filtering, or other semantic behavior

Validation:

- run a focused example smoke test if available
- visually check that the lane-height slider and zoom message behave as intended
  in the dev server

### 9. Final Runtime And Docs Sweep

Tentative commit:

```text
test(core): cover param transition integration
```

Scope:

- add a representative integration or layout test once the runtime API is stable
- check that async frame propagation does not break `whenPropagated()` semantics
- audit callers of `getValue()` that may need target values instead
- keep any larger API changes out of the first version unless the audit shows
  they are required

Validation:

- run focused Vitest suites around param runtime, input binding, and app
  provenance
- run schema/docs checks if generated artifacts changed
- run the smallest useful browser smoke test for the BAM example

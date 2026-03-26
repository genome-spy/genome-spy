# Domain ExprRef Plan

## Rationale

GenomeSpy already supports reactive expressions for params and for range-like
scale properties, but scale domains are still treated as static configuration or
selection-linked state. That is sufficient for simple brushing and zooming, but
it blocks a broader class of semantic zoom and coupled-axis behaviors.

The target feature is to allow scale state to participate in expressions without
turning scale access into an expensive per-datum lookup. The core design goal
is:

- keep `formula` and `filter` transforms fast enough for large datasets
- let scale expressions resolve through existing `ScaleResolution` discovery
- preserve the current shared-scale merge model
- avoid reactivity loops by making dependencies explicit and acyclic

This plan focuses on four expression helpers:

- `scale(name, value)`
- `invert(name, range)`
- `domain(name)`
- `range(name)`

These should work everywhere expressions are supported, unless a specific
context has a concrete technical reason to opt out.

## Findings From The Current Codebase

### What already exists

- `FormulaTransform` compiles one expression once and then executes it per
  datum in [`packages/core/src/data/transforms/formula.js`](./packages/core/src/data/transforms/formula.js).
- `FilterTransform` already uses the same expression runtime model in
  [`packages/core/src/data/transforms/filter.js`](./packages/core/src/data/transforms/filter.js).
- Expressions are compiled once and bound to scope-based parameters in
  [`packages/core/src/paramRuntime/expressionRef.js`](./packages/core/src/paramRuntime/expressionRef.js).
- `ScaleResolution` is already the owner of resolved scale state and domain
  reconfiguration in
  [`packages/core/src/scales/scaleResolution.js`](./packages/core/src/scales/scaleResolution.js).
- Shared scale props are merged before final scale instantiation in
  [`packages/core/src/scales/scalePropsResolver.js`](./packages/core/src/scales/scalePropsResolver.js).
- Scale domain/range changes already emit resolution events, which can be used
  as reactive update sources.

### What is missing

- There is no public scale-ref abstraction in GenomeSpy analogous to a param ref.
- Expressions do not currently have a way to resolve scale names through
  `ScaleResolution`.
- `domain` and `range` ExprRefs are not yet treated as reactive bindings.
- Scale prop expressions are merged across participating views, so the binding
  scope must be stable and explicit.

### Key architectural constraint

The scope used for scale-related expression binding should be the host view of
the `ScaleResolution`, not the first member view. The host view is the semantic
owner of the shared scale slot and is the stable place where resolution,
reconfiguration, and reactivity should converge.

## Lessons Learned From Vega

Vega is useful here mostly as a pattern reference, not as a direct model.

### What Vega does well

- `scale(name, value)` and `domain(name)` are available as expression helpers.
- Scale access is scoped and dependency-tracked.
- Internal hot-path code generation avoids repeated lookups for rendering code.
- Literal scale names are optimized much better than dynamic scale names.
- The runtime graph is acyclic, and dependency loops are rejected by the dataflow
  machinery rather than by ad hoc special cases.
- Vega achieves this with two layers:
  - AST visitors register scale dependencies during expression compilation.
  - codegen emits direct scale-slot access for hot rendering paths instead of
    resolving the scale by name on each call.
- The relevant pattern is in Vega’s `vega-functions` package:
  - `scaleVisitor()` adds literal scale names as dependencies
  - `internalScaleFunctions()` generates direct access for `_scale`,
    `_range`, and `_bandwidth`
  - public helpers remain simple, but hot-path call sites use the compiled
    specialized path

### What to borrow

- Resolve scale references once, at bind time, whenever the scale name is
  statically known.
- Represent scale access as a dependency edge, not as an arbitrary global lookup.
- Use a specialized hot-path binding for expressions that run per datum.
- Treat dynamic names as a fallback path, not the default.

### What not to borrow directly

- Do not require root-level named scales.
- Do not make the public API depend on a global scale registry.
- Do not make every expression resolve a scale by map lookup on each datum.

## Proposed Semantics

### Channel-based resolution

`scale(name, value)`, `invert(name, range)`, `domain(name)`, and `range(name)`
should resolve `name` through the existing `ScaleResolution` for that channel.

This means:

- `name` is a channel or channel alias such as `x`, `y`, `color`, `size`
- the lookup is relative to the view that owns the relevant `ScaleResolution`
- shared scale state is still shared through the existing resolution mechanism

### Expression lifetime

There are two distinct execution modes:

1. Hot-path datum execution:
   - `formula`
   - `filter`
   - similar transform expressions

2. Resolution-time binding:
   - scale `ExprRef` properties
   - merged scale `range` / `domain` expressions

The same syntax should work in all supported expression contexts, but the
binding point is different.

### Performance rule

If the scale name is static, the expression should bind the target resolution
once and then call a direct captured ref or closure afterward.

That means:

- no repeated map lookup per datum
- no per-tuple resolution discovery
- no repeated ancestor walk once the expression is compiled

### Reactivity rule

Scale expressions should subscribe to the target scale resolution’s relevant
events:

- `domain(name)` depends on domain changes
- `range(name)` depends on range changes
- `scale(name, value)` depends on both domain and range changes as needed
- `invert(name, range)` depends on domain and range changes as needed

The exact dependency set should be minimal and explicit.

## Use Cases Enabled By This Model

### 1. Aspect ratio coupling across x and y

You can bind one axis domain to another scale’s current domain and use a shared
reference frame to keep a fixed data-to-pixel ratio when the viewport changes.

Example:

- A scatter plot with a 1:1 aspect ratio, suitable for t-SNE or other
  embedding views.
- The view already exposes `width` and `height` params.
- A dependent domain expression can use those params to compute the aspect
  ratio and derive a matching domain for the secondary scale.
- When the view is resized, the dependent scale domain updates to preserve the
  visual ratio between the x and y axes.
- This should be implemented as part of the project, not as a standalone
  example-only mechanism.

### 2. Manhattan plot semantic zoom

`y` can derive part of its visible range or domain from `x` zoom level, so
insignificant values become visible gradually rather than abruptly.

### 3. Sashimi plot apex and label coupling

Arc height and label placement can depend on the current `y` scale state, while
the `x` domain drives zoom and the `y` domain reacts accordingly.

## Implementation Plan

### Phase 1: Introduce stable scale resolution ownership

1. Add an explicit host view reference to `ScaleResolution`.
2. Set the host when the resolution is created in
   [`packages/core/src/view/unitView.js`](./packages/core/src/view/unitView.js).
3. Replace internal uses of `#firstMemberView` with the host view where the
   semantic owner is required.
4. Keep `#firstMemberView` only if needed for temporary compatibility during the
   transition.

Success criteria:

- resolution binding no longer depends on registration order
- scale-related runtime scope is stable and deterministic

### Phase 2: Expose reactive scale refs

1. Create a lightweight read-only scale ref abstraction.
2. The ref should provide:
   - `get()`
   - `subscribe(listener)`
   - stable identity for dependency tracking
3. Back the ref by the owning `ScaleResolution`.
4. Emit change notifications from scale resolution domain/range updates.

Success criteria:

- scale state can participate in reactive dependency graphs
- listeners only fire when the relevant scale state changes

### Phase 3: Extend expression binding

1. Teach the expression binder to resolve scale helpers against the host
   `ScaleResolution`.
2. Support static channel names first.
3. Specialize the bound expression so the scale ref is captured once.
4. Add the scale ref as a tracked dependency of the expression.

Success criteria:

- expressions using `scale("x", value)` or `domain("x")` compile once and do
  not re-resolve the channel per call
- expressions re-run when the target scale changes

### Phase 4: Add runtime helpers for transform expressions

1. Register `scale`, `invert`, `domain`, and `range` in the transform expression
   environment.
2. Make the helper implementation resolve against the current view’s host
   scale resolution.
3. Ensure the helper is safe for repeated per-datum calls.
4. Keep dynamic-name support out of the hot path unless there is a strong need.

Success criteria:

- `formula` and `filter` can call the helpers efficiently
- large data batches do not incur repeated resolution lookup

### Phase 5: Support scale prop ExprRefs

1. Evaluate scale prop expressions in the scale resolution host scope.
2. For merged scale props, bind expressions before the merge or retain
   provenance through merge.
3. Apply the same helper semantics to `domain` and `range` ExprRefs.
4. Make sure the host scope is still the source of truth for dependency
   registration.

This is the most delicate phase because scale props are merged across members.
The recommended approach is:

- evaluate each member’s scale expressions in its own host scope first
- merge concrete results afterward

If provenance must be retained, store it explicitly rather than inferring it
from the merged object.

Success criteria:

- scale prop expressions remain correctly scoped in shared-scale scenarios
- merged scale behavior stays deterministic

### Phase 6: Guard against reactivity loops

1. Track scale-to-scale dependencies explicitly.
2. Reject self-references and indirect cycles.
3. Keep the dependency graph acyclic at the point where expressions are bound.
4. If a cycle is detected, fail fast with a clear error.

Likely loop patterns to reject:

- `x.domain` depends on `y.domain` and `y.domain` depends on `x.domain`
- a scale expression depends on itself through a shared resolution path
- a zoomed scale writes back into a domain expression that reads the same scale

Success criteria:

- reactivity cannot silently oscillate
- diagnostics point to the offending channel chain

### Phase 7: Add a minimal hoisting optimization

1. Detect expressions with no datum field dependencies.
2. Evaluate those once per repropagation instead of per row.
3. Reuse the result for every datum in the transform batch.

This matters for expressions like:

- `domain("x")`
- `range("x")`
- `scale("x", 123)` when the value argument is constant

Success criteria:

- invariant expressions are not recomputed per datum
- formula throughput stays high for million-row inputs

### Phase 8: Update docs and examples

1. Document the new helpers in the grammar docs.
2. Explain that channel names resolve through the current view’s scale
   resolution.
3. Add examples for:
   - aspect-ratio coupling
   - Manhattan plot semantic zoom
   - sashimi plot coupling
4. Note the scoping rules and the cycle limitation.

Success criteria:

- user-facing behavior is discoverable
- the new feature is documented as a reactive scale relationship, not as a
  general-purpose global lookup

## Suggested API Shape

### Expression helpers

```js
scale("x", datum.foo)
invert("x", datum.pixel)
domain("x")
range("x")
```

### Binding behavior

- `scale("x", value)` returns the forward mapping for the `x` resolution
- `invert("x", range)` returns the inverse mapping where supported
- `domain("x")` returns the current resolved domain
- `range("x")` returns the current resolved range

### Binding scope

The binding scope should be:

- the host view of the `ScaleResolution` for the current channel
- not the first registered member
- not a global registry

### Essential domain merge rule

If multiple contributing views provide explicit domains or expression-based
domains, each member domain should be evaluated in the host scope first and then
merged using the existing configured-domain rules.

That means:

- literal and expression-based configured domains are treated the same after
  evaluation
- quantitative, index, and locus domains continue to union as they do today
- ordinal and nominal domains continue to preserve stable order and dedupe
- piecewise quantitative domains keep their current non-union restriction
- selection-driven domains remain separate and must not be mixed with
  configured domains on the same shared scale

### Future unification path

Selection-linked domains could eventually reuse the same reactive read-side
machinery as expression-based domains, but only as an adapter layer.

That means:

- the selection source can expose a reactive domain ref-like interface
- `domain(name)` and related helpers can consume that interface uniformly
- selection-specific writeback, empty-state handling, and feedback-loop checks
  should remain separate
- selection domains should not be collapsed into plain ExprRefs if that would
  erase their special two-way sync semantics

Do not over-unify the models: the goal is shared read-side reactivity, not
erasing the selection-specific control flow.

## Implementation Notes

- Integrate the helpers into `vega-expression`-based compilation, not just into
  transform call sites.
- GenomeSpy already compiles expressions through
  [`packages/core/src/utils/expression.js`](./packages/core/src/utils/expression.js),
  so this is the natural place to teach the compiler about the new helpers.
- The expression system needs to distinguish:
  - plain scalar helpers that can be emitted as ordinary function calls
  - scale-sensitive helpers that must bind a scale ref and subscribe to it
- For static channel names, the compiler should resolve the scale once and cache
  the binding in the compiled expression metadata.
- Avoid runtime scale lookup inside the datum loop.
- Mirror Vega’s split between AST dependency discovery and specialized codegen:
  use the AST to detect literal channel names, then emit a bound helper or
  direct closure for the hot path.
- If a call site can benefit from a specialized implementation, do not route it
  through a generic name lookup first.
- If the expression compiler needs AST-level help to detect `scale("x", ...)`
  and `domain("x")`, add the minimum hook necessary there rather than layering a
  second parser on top.
- Reuse the existing param runtime and subscription machinery where possible.
- Do not add per-datum map lookups.
- Prefer capturing a resolved scale ref or helper closure during expression
  setup.
- Keep shared-scale merging deterministic and separate from expression binding.
- Be explicit about which scale events invalidate which expressions.

## Test Plan

### Unit tests

- `formula` with `scale("x", ...)` should resolve against the correct channel.
- `formula` with `domain("x")` should update when the x domain changes.
- `filter` with scale helpers should re-evaluate on scale changes.
- merged scale props with ExprRefs should bind to the host scope.
- shared scale resolutions should not depend on member registration order.
- cycle detection should fail fast.

### Integration tests

- zoomable positional scale coupled to another scale’s domain
- semantic zoom in a Manhattan plot
- sashimi arc height coupled to zoom level

### Performance tests

- large formula transform batch with static scale helpers
- confirm no repeated lookup path in the row loop

## Phase Gate

After each implementation phase:

1. Run `vitest`.
2. Run `npm --workspaces run test:tsc --if-present`.
3. Run `npm run lint`.
4. Commit the phase result.
5. Revise this plan based on what was learned.
6. Continue only after the plan is updated.

## Open Risks

- Shared scale prop expressions can become ambiguous if provenance is not kept.
- Cycle detection needs to be strict enough to prevent oscillation but not so
  broad that it rejects valid coupled scales.
- Some existing code currently leans on `#firstMemberView`; replacing it needs
  to be done carefully to avoid regressions in config scope or param runtime
  lookup.

## Summary

The recommended design is to make scale-related expressions resolve against the
`ScaleResolution` host view, bind the target channel once, and expose scale
state as a reactive ref rather than a per-datum lookup. That gives you the
behavior needed for domain coupling, semantic zoom, and scale-driven layout
while preserving performance in transforms.

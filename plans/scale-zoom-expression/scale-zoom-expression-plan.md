# Scale zoom expression helper

Status: Complete

## Context

Scale expressions now resolve through the view that owns their scale
resolution. This makes genuinely shared scales deterministic, but it also means
that a shared scale cannot read the automatic `zoomLevel` parameter of one
contributing unit. The OCAC example exposes the gap: its shared y domain needs
to react to the x scale's zoom state, while the only available zoom metric is a
unit-local aggregate.

The existing alternatives are poor grammar:

- hard-code the hg38 span and derive magnification from `domain("x")`;
- move scale behavior into a child-local opacity or filter expression; or
- restore declaration-view lookup for shared scale expressions.

The first leaks assembly data into the specification, the second changes the
visual contract and may add per-row work, and the third would undo deterministic
resolution ownership.

Comparable systems expose zoom state explicitly at the object that owns it.
D3 zoom transforms expose a read-only `k` magnification, while Vega exposes
scale domains and signal-driven raw domains for interaction. GenomeSpy already
has a resolution-level `getZoomLevel()` with the desired meaning, so the grammar
only needs a reactive expression boundary for that existing state:

- https://d3js.org/d3-zoom
- https://vega.github.io/vega/docs/scales/
- https://vega.github.io/vega/docs/expressions/

These are conceptual precedents only. No source adaptation is planned. D3 Zoom
uses an ISC-style license and Vega uses BSD-3-Clause; both are compatible if
source adaptation later becomes useful, provided their notices and provenance
are retained.

## Goals

- Let an expression read the zoom level of a scale resolution resolvable through
  its expression scope's data-parent chain.
- Preserve resolution-owned expression scope and deterministic shared scales.
- Make the value reactive to navigation, reset, initial-reference changes, and
  loaded extent changes.
- Give authors a reference-domain-independent replacement for assembly-span
  arithmetic.
- Support explicit per-axis zoom metrics and document how expressions compose
  them into application-specific 2D metrics.
- Deprecate the existing unit-local `zoomLevel` parameter with a documented
  migration path, while retaining it until GenomeSpy 2.0.
- Make the deprecated parameter lazy so units with no zoom-level consumers
  allocate no zoom producer or subscriptions.
- Detect same-scale feedback instead of attempting convergence.

## Non-goals

- Restore child or declaration-site fallback for shared scale expressions.
- Expose mutable zoom state or make the helper a navigation command.
- Add a general public scale-state object in the first version.
- Change how zoom extents, initial domains, or locus coordinates are computed.
- Remove the existing bare `zoomLevel` parameter before the announced major
  version boundary.
- Make an independently resolved child scale visible from an ancestor that does
  not own that resolution.

## Proposed grammar

Add a scale expression helper whose zero-argument form discovers zoomable
positional scales from the expression scope:

```json
{
  "scales": {
    "y": {
      "domain": {
        "expr": "[max(0, 2 / zoomLevel() - 0.1), 50]"
      }
    }
  }
}
```

The function also accepts one literal channel name when the author needs an
explicit dependency:

```js
zoomLevel(); // auto-discovered 2D-normalized zoom
zoomLevel("x"); // x magnification
zoomLevel("y"); // y magnification
```

With no arguments, the function resolves the `x` and `y` scale resolutions
through the expression scope's data-parent chain and retains those whose
effective scale configuration is zoomable. Missing and non-zoomable positional
resolutions contribute identity. The result preserves the automatic
parameter's existing two-dimensional normalization:

```text
sqrt(xZoomLevel * yZoomLevel)
```

Thus an x-only zoom contributes `sqrt(xZoomLevel)`, and zooming both dimensions
produces `sqrt(xZoomLevel * yZoomLevel)`. Returning `1` when neither visible
positional scale is zoomable gives a stable identity value.

An explicit channel is a literal `ChannelWithScale` and resolves using the same
data-parent scope walk as `domain("x")`, `range("x")`, and
`scale("x", value)`. It returns that resolution's reference-domain span divided
by its current displayed-domain span:

- `1` at the reference domain;
- greater than `1` when zoomed in;
- less than `1` when zoomed beyond the reference domain, if allowed; and
- `1` for a scale that is not zoomable.

Authors that need a custom multi-axis metric compose separate calls using
ordinary expression syntax. For example, the explicit equivalent of the
automatic two-dimensional normalization is:

```text
sqrt(zoomLevel("x") * zoomLevel("y"))
```

This keeps `zoomLevel` focused on reading one scale while allowing arithmetic,
`min`, `max`, or another formula to express the behavior the author actually
wants. If x is magnified by 4 and y by 9, the example above evaluates to 6.

The explicit channel must be a literal string so dependency discovery and
resolution binding remain static. More than one argument, a non-literal
argument, or a channel that has no resolution in that scope fails during
expression binding with an actionable diagnostic. A known non-zoomable scale
returns `1`, matching the existing programmatic method. Explicit calls are not
limited to x and y; auto-discovery is.

The function form and the existing bare parameter have deliberately distinct
semantics:

- `zoomLevel` is the deprecated unit-local geometric aggregate used by existing
  mark expressions.
- `zoomLevel()` discovers zoomable positional resolutions and preserves that
  aggregate without relying on a unit-local parameter.
- `zoomLevel("x")` reads one explicit scale resolution.
- Separate explicit calls can be combined when an author wants a multi-scale
  formula other than the automatic behavior.

OCAC can migrate directly from the bare `zoomLevel` parameter to `zoomLevel()`.
Its locus x scale is zoomable and its quantitative y scale is not, so automatic
discovery produces the historical `sqrt(xZoomLevel)` value without an assembly
constant. A unit can generally replace the bare parameter with `zoomLevel()`;
new specifications should use explicit channels when their behavior is
intentionally axis-specific.

## Key decisions

### Keep zoom state on the scale resolution

The scale resolution already owns the current domain, reference domain, zoom
extent, and `getZoomLevel()`. Add a lazy `ScaleResolution.getZoomLevelRef()`
whose stable identity survives domain-runtime replacement. Back it with a
resolution-owned computed ref that depends on a lazy zoom-publication revision
signal and the effective scale configuration, rather than copying zoom state
into a view parameter or subscribing through a contributing unit.

Publish the revision from the domain runtime's existing zoom notification
boundary. That boundary covers visible-domain changes, initial-reference
changes, and loaded extents used by `zoom.extent: "data"`. Use numeric
`Object.is` equality so one settled input change produces at most one helper
invalidation. The existing `subscribeZoomExtent()` API may remain for
non-expression consumers, but remove the UnitView compatibility subscriptions
and do not mirror them into the new ref.

### Auto-discover positional zoom and allow explicit channels

A composed view may own a shared x resolution while its children have
independent y resolutions, or vice versa. Zero-argument discovery therefore
uses only the x and y resolutions resolvable through the expression scope's
data-parent chain and only those configured as zoomable. It does not search
descendants, inspect configured view visibility, or select an arbitrary member
scale.

The square root of the x/y product is the linear magnification corresponding to
the multiplied area magnification and exactly matches the current automatic
parameter semantics. Missing and non-zoomable axes contribute identity in auto
mode. An explicit call names exactly one resolution; authors compose multiple
calls when they need a custom multi-resolution metric.

Auto-discovery happens when the expression binds, after resolution planning has
established effective scale configuration. Each expression scope lazily owns a
stable auto-zoom operation ref. The operation binds to the currently resolvable
x/y zoom refs and is rebound when scale resolution registration or effective
zoom configuration changes. Rebinding keeps consumer identity stable, replaces
the dependency set atomically, and first updates and validates the
resolution-level zoom-input graph described below. Graph-runtime validation
then guards the operation-ref structure; it is not a second source of truth for
scale dependency cycles. If an owning scale expression is itself rebound
because membership changes, it resolves the same stable auto-zoom ref.

### Reject feedback through the same resolution

An x domain, initial reference, zoom extent, or effective zoom configuration
must not depend on `zoomLevel("x")`; the zoom level depends on those inputs. The
same applies when `zoomLevel()` auto-discovers the consuming scale. A range or
other mapping expression may use that scale's zoom level because it does not
feed the zoom computation.

Before committing expressions for properties that feed zoom computation,
maintain the single resolution-level zoom-input dependency graph whose edge A
to B means A's zoom inputs read B's zoom level. Add all explicit or
auto-discovered edges in an atomic preflight step and reject the binding if any
edge closes a cycle; do not rely on either operation-ref validation or the
queued domain-publication path to discover it later. Remove or replace edges
when a resolution rebinds or is disposed. This rejects both a direct x-to-x
dependency and longer cycles such as x reading y while y reads x.

A non-zoomable y domain using `zoomLevel()` can depend on a zoomable x
resolution, as in OCAC. If y is also zoomable, the author must use
`zoomLevel("x")` to exclude the self-dependency.

### Deprecate the current parameter

The automatic bare `zoomLevel` parameter hides its x/y dependencies, is
available only on unit views, and cannot participate cleanly in resolution-owned
expressions. Keep it operational through the pre-2.0 compatibility window, but
mark it deprecated in documentation and migrate tracked examples to the
function. Remove the automatic setter in GenomeSpy 2.0 after auditing downstream
specifications.

During the compatibility window, implement the bare parameter as a deferred,
read-only alias of `zoomLevel()` rather than an eagerly allocated writable base
parameter. Pass a unit-view option into the base `View` constructor so it can
reserve the internal name before authored parameters are analyzed. The
reservation must be visible to pending-parameter detection, allowing a
`params[].expr` that reads bare `zoomLevel` to defer until scales are resolved.
Materialize the derived ref and its scale dependencies only when parameter
resolution first consumes the alias. Multiple consumers in one unit share that
ref.

The name remains reserved in unit scopes: an authored parameter named
`zoomLevel` fails with an actionable message, preserving the current collision
behavior. The generated alias remains outside the embed parameter API, which
only exposes authored parameter configs. Debug enumeration does not materialize
an unused alias; after another consumer materializes it, snapshots may report
the initialized read-only auto parameter.

Directly writing the automatically generated parameter is not a supported
grammar contract. The lazy alias is therefore read-only.

Emit a deprecation warning when parameter resolution first materializes the
bare alias:

```text
The automatic zoomLevel parameter is deprecated. Use zoomLevel() or an explicit
channel such as zoomLevel("x") instead.
```

Use the existing `warnOnce` utility, whose current contract deduplicates an
identical warning once per JavaScript realm. Do not warn when reserving or
enumerating the lazy alias, on repeated expression evaluation, or when calling
the replacement function.

## Alternatives considered

### Allocate `zoomLevel` on every composed view

Rejected. A composed view may not own both positional resolutions, and a shared
scale expression could accidentally depend on itself through an aggregate.
Implicit aggregation also hides which navigation state drives the expression.

### Return a two-element zoom vector

For example, `zoomLevel()` could return `{ x, y }` or `[x, y]`. Rejected because
a structured return is awkward for the common aggregate case and breaks direct
migration from the numeric parameter. Automatic scalar aggregation plus
composable single-channel calls covers both uses.

### Add `domain("x", "initial")`

This would remove the assembly constant and is potentially useful, but it
exposes domain lifecycle/history as a broader public contract and still makes
authors reconstruct a common zoom metric. Consider it separately if users need
initial domains for purposes beyond magnification.

### Add `scaleState("x").zoomLevel`

Rejected for the first version. A structured scale-state object would expose
more lifecycle surface than this use case needs and would make dependency and
equality semantics less focused.

### Add a declarative scale-to-parameter binding

For example, `{ "name": "xZoom", "scale": "x", "property": "zoomLevel" }`.
This is more verbose, duplicates expression-helper dependency machinery, and
adds another parameter kind. An author can introduce a named derived parameter
with `{ "name": "xZoom", "expr": "zoomLevel('x')" }` when reuse is needed.

### Restore declaration-scope fallback

Rejected. It would make shared-scale behavior depend on contributing members
and declaration provenance, reversing the ownership rule introduced to remove
that ambiguity.

## Milestone 1: Add the reactive scale helper

Status: Complete (2026-09-15)

### Intended outcome

Expressions can read automatically discovered positional zoom or a
channel-specific zoom level through stable reactive resolution dependencies.

### Work

- Extend the scale-helper kind and compiler handling in
  `packages/core/src/utils/expression.js` with `zoomLevel`.
- Implement zero-argument discovery of resolvable zoomable x/y resolutions and
  accept one literal channel for explicit mode.
- Reuse existing unknown-scale diagnostics for explicit channels; auto mode
  returns identity when it discovers none.
- Add lazy `ScaleResolution.getZoomLevelRef()` as a stable computed ref over the
  domain runtime's zoom-publication revision and effective scale configuration.
- Return the existing `ScaleResolution.getZoomLevel()` value so programmatic and
  declarative consumers share one definition.
- Add resolution-level zoom-input dependency preflight so same-resolution and
  cross-resolution cycles fail before any live scale state is exposed, while
  acyclic range expressions remain legal.
- Dispose the ref and its dependencies with the resolution.
- Add a lazy stable auto-zoom operation ref to expression scopes and rebind it
  when scale registration or effective zoomability changes.
- Replace `UnitView`'s eager `allocateSetter("zoomLevel", 1)` and positional
  subscriptions with a deferred compatibility alias backed by `zoomLevel()`.
- Reserve the compatibility name before authored parameter analysis, include it
  in pending-parameter detection, and reject an authored parameter with the
  same reserved name.
- Ensure that reserving or enumerating the compatibility name does not
  initialize the helper; only resolving its value may do so.
- Emit the bare-parameter deprecation warning through the existing `warnOnce`
  utility when the alias first materializes.

### Affected areas and downstream consumers

- `packages/core/src/utils/expression.js`
- `packages/core/src/scales/scaleResolution.js`
- `packages/core/src/scales/domainRuntime.js`, if it owns the producer
- parameter expression binding and scale dependency analysis
- scale-domain and dynamic-view lifecycle code

No renderer-specific API should be required. Existing expression consumers in
marks, transforms, scale domains, and scale ranges receive the helper through
the shared expression runtime.

### Verification

- Unit tests cover zero-argument discovery, too many and non-literal arguments,
  unknown channels, a known non-zoomable channel returning identity, the values
  below/at/above the reference domain, no zoomable scales, x-only and y-only
  auto values, geometric 2D auto values, composed explicit calls, and cleanup.
- Reactive tests cover zoom, pan, reset, domain transitions, initial-reference
  establishment, and a changed loaded extent with an unchanged visible domain.
- Resolution tests accept a non-zoomable shared y domain driven by
  `zoomLevel()`, reject a zoomable y domain that auto-discovers itself, accept
  that case with `zoomLevel("x")`, and reject an x domain driven by
  `zoomLevel("x")`. They also accept an x range driven by `zoomLevel("x")` and
  reject a two-resolution domain dependency cycle.
- Dynamic insertion/removal and zoomability-configuration tests verify that the
  auto ref rebinds atomically, keeps stable identity, and does not retain
  removed views.
- Allocation tests verify that a unit with no consumer creates no zoom-level ref
  or subscriptions, a legacy `params[].expr` consumer is deferred correctly,
  the first bare-parameter read materializes one shared alias, an authored
  `zoomLevel` declaration is rejected, and disposal removes dependencies.
- Compatibility tests verify that bare `zoomLevel` and `zoomLevel()` publish the
  same values for x-only, y-only, and anisotropic x/y navigation.
- Warning tests verify that the first materialized bare parameter warns once per
  JavaScript realm, repeated bindings and evaluations do not warn again, and
  unused aliases plus function calls do not warn.
- Debug/API tests verify that an unused alias is absent from runtime snapshots,
  a materialized alias is shown as a read-only auto parameter, and the generated
  alias remains unavailable through the authored-parameter embed API.
- Run focused Vitest suites with the `agent` reporter and the Core TypeScript
  checks.

### Tentative commit

`feat(core): expose scale zoom levels to expressions`

## Gate before example migration: Prove architecture and compatibility

Status: Passed (2026-09-15)

Do not change any specification under `examples/` until this gate passes. Keep
the implementation and focused tests reviewable independently from the
migration.

- Confirm the helper, producer ref, auto-ref rebinding, and resolution-level
  cycle preflight pass their focused suites.
- Confirm unchanged legacy expressions using bare `zoomLevel` still produce the
  same x-only, y-only, and anisotropic x/y values through the lazy alias.
- Confirm an unchanged existing browser example still renders and responds to
  zoom, emits the deprecation warning, and allocates the alias only when used.
- Confirm unused units allocate neither the alias nor its zoom subscriptions.
- Confirm `git diff -- examples/` is empty when recording that the gate passed.

Review the architecture at this point. Confirm that the resolution-level
zoom-input graph is the single preflight source of truth, operation refs use the
ordinary reactive graph, no second imperative notification path is created,
and same-scale feedback fails deterministically.

Gate evidence:

- All 307 Core test files passed: 2,654 tests passed, one skipped, and two todo.
- Core TypeScript checks and repository lint passed.
- The unchanged geometric zoom example rendered and responded to wheel zoom in
  a browser, and materializing its bare alias emitted the deprecation warning.
- Focused tests cover lazy alias allocation, warning behavior, stable auto-ref
  rebinding, effective zoomability changes, and direct plus cross-scale cycles.
- `git diff -- examples/` was empty when this gate was recorded.

## Milestone 2: Migrate examples, documentation, and OCAC

Status: Complete (2026-09-15)

### Intended outcome

Every specification under `examples/` uses the function form, and the OCAC
shared y scale uses resolution-owned zoom state without an assembly constant or
child-scope fallback. Compatibility with the deprecated parameter remains
covered by focused test fixtures rather than public examples.

### Work

- Move OCAC's reactive y scale declaration to the parent layer that owns the
  shared y resolution.
- Replace the bare child parameter reference with `zoomLevel()`; automatic
  discovery should select only the zoomable x resolution and retain the exact
  historical response.
- Enumerate every bare `zoomLevel` expression reference under `examples/` only
  after the preceding gate passes, then migrate all of them. Use `zoomLevel()`
  for the exact legacy aggregate and `zoomLevel("channel")` when the expression
  is intentionally driven by one scale.
- Add a small tracked documentation example in which a shared y domain reacts
  to x zoom.
- Keep bare-parameter compatibility coverage in Core tests. Do not retain a
  deprecated public example solely as a compatibility fixture.
- Audit other private specifications separately; OCAC is required by this
  change, but a repository-wide private migration is not a prerequisite.

### Affected areas and downstream consumers

- `private/website-examples/OCAC/ocac.json`
- `examples/core/`
- `examples/docs/`
- `docs/grammar/expressions.md`
- `docs/grammar/parameters.md`
- `docs/grammar/scale.md`
- `docs/grammar/mark/point.md`
- `packages/core/src/spec/scale.d.ts`
- generated schema and example snapshots produced by the documentation workflow

### Verification

- Reproduce the OCAC URL in the App and verify initial load, x wheel zoom, pan,
  reset, aligned threshold rules, and y-domain updates.
- Verify with a focused search that no specification expression under
  `examples/` references the bare `zoomLevel` identifier.
- Initialize all changed examples and smoke-test representative x-only, y-only,
  and 2D migrations.
- Smoke-test the new tracked example in WebGL and Canvas; inspect SVG output for
  aligned shared-y geometry after changing x.
- Run the shared-example initialization suite and documentation checks.
- Run the full Core suite only if the helper changes shared domain-runtime
  scheduling beyond the focused tests.

### Documentation and migration

- Update `docs/grammar/expressions.md` alongside `domain`, `range`, and
  `bandwidth`; document `zoomLevel()` auto aggregation, `zoomLevel("x")` raw
  per-scale behavior, reference-domain semantics, non-zoomable identity, and
  composed `sqrt`, `min`, and `max` examples.
- Update `docs/grammar/parameters.md` with the deprecated bare alias, lazy
  resolution, warning timing, reserved-name behavior, and direct migration.
- Update `docs/grammar/scale.md` with expression scope, auto-discovery,
  topology behavior, cross-scale use, and cycle restrictions.
- Update `docs/grammar/mark/point.md` so it no longer presents the bare
  parameter as the primary form.
- Update the `packages/core/src/spec/scale.d.ts` JSDoc and regenerate schema and
  documentation outputs through the documented workflow.
- Include a migration example for child-local scale expressions that depended
  on the automatic `zoomLevel` parameter.
- Explain that the shared scale declaration belongs on its resolution owner.
- Announce removal of the automatic parameter at the GenomeSpy 2.0 boundary.

### Tentative commit

`docs(core): demonstrate zoom-driven shared scales`

Milestone evidence:

- Every tracked specification under `examples/` now uses `zoomLevel()` or
  `zoomLevel("channel")`; a boundary-aware search finds no bare references.
- All 11 migrated or added examples initialized and rendered in WebGL.
- The new shared-domain example plus representative automatic and 2D examples
  initialized and rendered in Canvas.
- The new shared-domain example updated its y axis during x wheel zoom, and its
  SVG export preview remained fully vector-representable.
- The ignored local OCAC specification rendered, zoomed, panned, kept its
  threshold rules aligned, updated its y domain, and reset to the configured
  whole-genome viewport.
- The focused Core contract suite passed 244 tests, and Core TypeScript checks,
  lint, documentation type synchronization, and the full documentation build
  passed.

## Final integration verification

Status: Passed (2026-09-15)

- Run the focused expression, parameter, scale-domain, scale-lifecycle, and
  view-mutation suites.
- Run workspace TypeScript checks and lint for affected files.
- Browser-smoke-test OCAC through initial load, zoom, pan, and reset.
- Verify the dedicated unit-local bare `zoomLevel` compatibility fixtures remain
  unchanged and passing.
- Verify no specification under `examples/` uses the bare parameter.
- Verify zero-argument 1D and 2D cases plus one owner-scoped explicit-channel
  example in WebGL, Canvas, and SVG.

## Risks

### Function and deprecated parameter share a name

The expression compiler distinguishes calls from bare globals, but diagnostics
and documentation must make the distinction obvious. Parser and binding tests
must cover both forms in the same expression. Do not change the bare
parameter's meaning during the compatibility window.

### Reference-domain changes can be easy to miss

The current displayed domain is not the only input. Data loading can change the
reference extent without changing the viewport, so a dependency on the domain
ref alone is insufficient.

### Binding-time zoomability can cause reentrancy

Auto-discovery must inspect effective zoom configuration while a scale
expression may itself be binding. Reuse already-resolved scale properties or
add a narrow preflight query; do not initialize a scale recursively merely to
ask whether it is zoomable. A focused prototype must prove the OCAC y-domain
case before implementation is accepted.

### Feedback across scales

Cross-scale dependencies can form longer cycles, such as x zoom driving y while
y state drives x. The resolution-level zoom-input graph must be updated
atomically with expression rebinding and disposal so stale edges neither hide a
cycle nor reject a later valid configuration.

### High-frequency updates

Zoom transitions can publish every animation frame. Equality must suppress
unchanged levels, and the helper must not add extra scale recreation, dataflow
replay, or rendering beyond the expression consumer's existing behavior.

### Lazy compatibility state changes debug output

An unused `zoomLevel` alias will disappear from runtime debug snapshots that
previously listed every unit's eager setter. Once materialized it remains
visible as a read-only auto parameter. Treat this as an intentional diagnostic
change and update snapshot tests without exposing the alias through the authored
parameter API.

## Unresolved questions

- Is exposing an initial-domain helper independently valuable enough for a
  separate proposal?

## Acceptance criteria

- Shared-scale expressions can depend on an explicitly named scale's zoom state
  without referencing any child runtime.
- The helper value has one documented definition shared with the programmatic
  scale resolution API.
- All inputs that affect the value publish reactively and exactly once per
  settled state change.
- Same-resolution and cross-resolution cycles fail clearly.
- One-axis zoom levels and expression-composed anisotropic 2D metrics have
  explicit, tested semantics.
- `zoomLevel()` discovers only resolvable zoomable positional resolutions,
  returns identity when none exist, and preserves the legacy aggregate where
  applicable.
- Existing bare `zoomLevel` specifications remain compatible through the
  pre-2.0 window and have a documented migration.
- Consuming the deprecated bare parameter emits one actionable `warnOnce`
  warning per JavaScript realm; using the function emits none.
- Units that never resolve bare `zoomLevel` or call `zoomLevel()` retain no zoom
  helper ref or per-resolution zoom subscriptions.
- The architecture and deprecated-alias compatibility gate passes before any
  specification under `examples/` is changed.
- After the gate, every specification expression under `examples/` is migrated
  from bare `zoomLevel` to the appropriate function form.
- OCAC loads and preserves its aligned, zoom-reactive y domain without an hg38
  span constant.
- Documentation explains scope, reference-domain semantics, and migration.
- No declaration-provenance fallback or renderer-specific zoom path is added.

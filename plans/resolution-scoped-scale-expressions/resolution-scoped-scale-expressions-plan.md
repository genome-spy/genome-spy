# Resolution-scoped scale expressions plan

Status: In progress

Issue: [#471 Scope scale ExprRefs to their scale resolution](https://github.com/genome-spy/genome-spy/issues/471)

## Context

`ScaleResolution` merges scale properties from unit views but ordinary reactive
scale properties do not currently share one parameter scope. Range expressions
carry the declaration view through the merged scale object as
`__rangeExprScope`, while configured-domain expressions are evaluated and
subscribed through each contributing member's `paramRuntime`.

The resolution already records a stable host view in `resolutionPlanner.js`,
and `ScaleInstanceManager` already defaults to the host view's parameter
runtime. The remaining declaration-origin paths are therefore exceptions to
the existing ownership model rather than a missing architectural primitive.

This work defines where ordinary scale expressions resolve names and who owns
their subscriptions. It does not change transaction scheduling. Issue
[#463](https://github.com/genome-spy/genome-spy/issues/463) remains responsible
for glitch-free grouped propagation.

Vega provides useful precedent: scale signal references are parsed as
dependencies of one scale operator rather than retaining declaration-site
execution contexts. Its parser resolves signal-valued scale properties through
the scale's enclosing scope. GenomeSpy should follow the ownership principle,
but use its existing view hierarchy and `ViewParamRuntime` rather than copying
Vega's runtime representation:

- [Vega scale documentation](https://vega.github.io/vega/docs/scales/)
- [Vega scale parser](https://github.com/vega/vega/blob/main/packages/vega-parser/src/parsers/scale.js)

Vega uses a BSD-3-Clause license. No source adaptation is planned; if later
implementation copies or closely adapts parser/runtime code, retain the
required notice and add durable provenance next to the adapted code.

## Goals

- Evaluate every ordinary scale ExprRef through the parameter scope of the
  view that owns the scale resolution.
- Make the resolution own expression binding, subscriptions, refresh, and
  disposal.
- Preserve unit-local behavior for independent scales because the unit owns
  their resolutions.
- Allow shared scales to use parameters declared at the resolution owner or
  its ancestors.
- Reject implicit child-local control of a shared scale with an actionable
  migration error and no declaration-scope fallback.
- Preserve deterministic scale-helper lookup and explicit cycle failures.
- Remove declaration-origin runtime metadata from merged scale properties.
- Keep generated legends, nested offset scales, resize, and dynamic view
  mutation correct.
- Document the breaking scoping rule and migrate tracked examples and tests.

## Non-goals

- Implement transaction-coherent or graph-native grouped scale updates from
  #463.
- Implement reactive `padding`, `paddingInner`, or `paddingOuter`.
- Reject every static scale property declared below a shared-resolution owner.
- Introduce a dedicated resolution child `ViewParamRuntime` in the first
  implementation.
- Change selection-domain reference semantics. Selection-domain references
  explicitly identify an external parameter and retain their existing binding
  and feedback-loop validation.
- Add declaration-view lookup as a compatibility fallback.
- Generalize all scale properties to ExprRefs.

## Key decisions

### Bind through one resolution-owned boundary

Add one small expression-binding boundary owned by `ScaleResolution`. It binds
through `resolutionView.paramRuntime` and supplies contextual diagnostics. Pass
that binding function to `ScaleInstanceManager` and `DomainPlanner` rather than
letting either helper choose a member runtime.

The first version will not allocate a child scope. The host runtime already has
the desired lexical parent chain, scale-helper resolver, width/height values,
and lifecycle. Expression functions and unsubscribe handles remain owned by the
resolution and are invalidated or unsubscribed when properties, membership, or
the resolution itself changes.

### Keep declaration provenance out of runtime values

Delete `__rangeExprScope` from merged props and do not replace it with another
scope-bearing property. Member and view-level declarations may remain available
through existing resolution debug state for diagnostics and conflict reporting,
but they do not participate in name lookup.

### Ordinary domain ExprRefs and selection references take separate paths

Inject the resolution expression binder into configured-domain evaluation for
ordinary literal/array ExprRefs. Continue to pass the declaration view to the
selection-domain path because it resolves a specifically named selection
binding and detects feedback through the contributing view group.

### Resolution topology owns scale helpers and geometry

Expressions such as `domain("x")`, `bandwidth("x")`, `width`, and `height`
resolve from the resolution owner. Automatic offset-scale ranges must use the
owner's primary-scale resolution and geometry rather than selecting the first
member as a `rangeOwner`.

Same-resolution helper reads remain cycles and must continue to fail through
the existing scale-resolution guards. Scoping does not authorize feedback
loops.

### Shared child interaction uses `push: "outer"`

A writable parameter that controls a shared scale is declared at the
resolution owner. A child may update it only through an explicit same-named
parameter with `push: "outer"`. Multiple writers retain the existing
last-write-wins behavior; aggregation is outside this issue.

### Fail at binding with scale-specific guidance

Wrap unknown-variable binding failures with the scale channel and resolution
scope. The message must direct authors to move the parameter to the
resolution-owning view and use `push: "outer"` when a child writes it. Do not
probe the declaration view and retry there.

## Alternatives considered

### Preserve declaration scope but centralize disposal

Rejected. It would improve lifecycle cleanup while retaining mixed lexical
contexts, sibling shadowing, member-order sensitivity, and provenance plumbing.

### Fall back to the declaration view for unresolved names

Rejected. A fallback makes specifications depend on whether a name happens to
exist at the owner, preserves the breaking ambiguity, and requires every new
reactive property to retain its declaration origin.

### Create a dedicated resolution child scope immediately

Deferred. A child scope could later hold graph-native scale values, but it does
not improve the name-resolution contract needed by #471. Adding it now would
increase lifecycle and scale-helper complexity without a consumer.

### Require all shared scale properties at the owner in this change

Rejected for now. Owner-level `scales.<channel>` is the preferred authoring
form, but static deep declarations and their conflict rules are separable from
expression ownership.

## Milestone 1: Establish resolution-owned expression binding

### Intended outcome

Domain and range ExprRefs use one resolution-owner scope, independent scales
retain unit-local behavior, and declaration-origin runtime metadata disappears.

### Work

- [x] Add a resolution-owned expression factory in `scaleResolution.js` that
      delegates to `resolutionView.paramRuntime`, augments unknown-variable
      errors with scale-scoping migration guidance, and does not fall back.
- [x] Change `ScaleInstanceManager` to receive the expression factory directly
      and bind all range ExprRefs through it.
- [x] Remove `__rangeExprScope` production, stripping, tests, and related
      `any` casts from `scalePropsResolver.js` and
      `scaleInstanceManager.js`.
- [x] Inject the same expression factory into `DomainPlanner` for ordinary
      configured-domain evaluation.
- [x] Refresh configured-domain subscriptions through the resolution factory,
      while keeping their unsubscribe handles in `ScaleResolution`.
- [x] Keep selection-domain resolution on its existing explicit member-aware
      path and add a regression test proving that #471 did not change it.
- [x] Replace the defining-member range test with tests for independent unit
      scope, shared owner/ancestor scope, owner shadowing, child-only rejection,
      and an owner parameter updated by a child using `push: "outer"`.
- [x] Cover the same scope matrix for configured domains, including ExprRefs
      nested in arrays.

### Affected areas and consumers

- `packages/core/src/scales/scaleResolution.js`
- `packages/core/src/scales/scaleInstanceManager.js`
- `packages/core/src/scales/scalePropsResolver.js`
- `packages/core/src/scales/domainPlanner.js`
- `packages/core/src/scales/domainExpressions.js`
- scale resolution, configured-domain, view-level-scale, and parameter tests

The public grammar changes only in name-resolution semantics. The runtime-only
`__rangeExprScope` property is not a public contract.

### Verification

- Run focused Vitest suites for scale resolution domains, range expressions,
  view-level props, selection links, parameter scoping, and cycles.
- Assert that two sibling declarations cannot make one shared scale observe two
  different bindings for the same name.
- Assert that moving or reordering members does not change the bound parameter.
- Assert that `domain("x")` and `bandwidth("x")` resolve from the owner topology
  and that existing same-scale cycle errors remain explicit.
- Run Core TypeScript checks for the changed injected contracts.

### Documentation and migration

- Record the exact migration error in a user-facing test so documentation and
  implementation cannot drift.
- Defer the full documentation update to Milestone 3, after the semantics pass
  integration verification.

### Tentative commit

`refactor(core): scope scale expressions to resolutions`

## Milestone 2: Migrate internal consumers and harden lifecycle

### Intended outcome

GenomeSpy's generated specifications and dynamic view operations obey the new
scope without selecting arbitrary members or leaking resolution-owned
subscriptions.

### Work

- [ ] Replace automatic nested-offset `rangeOwner` selection with lookup of the
      primary scale and width/height through the offset resolution owner.
- [ ] Initialize offset-scale dependencies without permitting self-resolution
      re-entry, preserving the current explicit bootstrap behavior.
- [ ] Hoist the sashimi plot's reactive y-scale declaration to the inner layer
      that owns the shared y resolution; keep the expression's `domain("x")`,
      width, and height semantics unchanged.
- [ ] Audit generated symbol and gradient legend pixel scales. Declare each
      reactive pixel domain at its actual resolution owner where practical; if
      generated resolutions intentionally remain independent, prove that each
      owning unit has the correct forced geometry.
- [ ] Ensure member registration/removal refreshes or reconfigures an already
      initialized scale when the effective expression-bearing properties
      change, rather than only refreshing domain subscriptions.
- [ ] Test insertion, removal, replacement, and rehoming of members around an
      initialized shared resolution. Verify that removed expressions no longer
      react and that the host scope remains stable until resolution disposal.
- [ ] Verify resolution disposal invalidates range expression functions and
      unsubscribes configured-domain listeners exactly once.

### Affected areas and consumers

- `packages/core/src/scales/scalePropsResolver.js`
- `packages/core/src/scales/scaleResolution.js`
- `packages/core/src/view/resolutionPlanner.js`
- `packages/core/src/view/containerMutationHelper.js` if initialized
  resolutions need an explicit membership reconfigure hook
- `packages/core/src/view/legendView.js` and generated legend tests
- `packages/core/src/scales/offsetScale.test.js`
- view mutation tests
- `examples/docs/examples/genomic-data/sashimi-plot.json`

### Verification

- Use the `test-genomespy-views` workflow for generated legend view trees and
  stable structured output where hierarchy assertions are needed.
- Exercise symbol and gradient legends in horizontal and vertical layouts,
  resize them, and confirm their pixel scales track the owning body geometry.
- Exercise nested xOffset and yOffset scales under resize and shared/independent
  primary-scale combinations.
- Run the sashimi example far enough to initialize both x and y resolutions;
  verify its responsive y-domain expression after resizing and zooming x.
- Extend mutation tests to assert listener disposal and deterministic rebinding,
  not only final domains.

### Documentation and migration

- Keep internal generated specs unexposed; document only user-visible changes.
- Preserve a short comment where offset bootstrap ordering is non-obvious.

### Tentative commit

`fix(core): migrate scale expressions to resolution owners`

## Review gate: Ownership, topology, and lifecycle

Review Milestones 1 and 2 together before documenting the contract. Inspect
all expression creation sites for scale domains and ranges, selection-domain
separation, initialized-resolution mutation, generated legends, and offset
scales. Reject any replacement metadata that carries a declaration runtime
through merged props.

## Milestone 3: Document, integrate, and close #471

### Intended outcome

The breaking semantic change is documented, representative real examples pass,
and every acceptance criterion in #471 has evidence.

### Work

- [ ] Update scale specification JSDoc and parameter documentation to state
      that ordinary scale ExprRefs use the scale resolution owner's scope.
- [ ] Document owner-level `scales.<channel>` as the preferred declaration for
      shared reactive scales and show the `push: "outer"` child-writer pattern.
- [ ] Add a breaking-change entry to `packages/core/CHANGELOG.md` with migration
      guidance and the actionable error wording.
- [ ] Confirm the repository contains no remaining declaration-origin runtime
      metadata or per-member ordinary scale-expression binding.
- [ ] Reconcile every #471 acceptance criterion against a named test, example,
      documentation section, or explicit non-applicable result.

### Affected areas and consumers

- `packages/core/src/spec/scale.d.ts`
- parameter and scale grammar documentation under `docs/`
- schema-derived documentation and generated schema as required by the
  `write-genomespy-docs` workflow
- `packages/core/CHANGELOG.md`
- tracked examples that declare shared reactive scales

### Verification

- Run the focused suites from Milestones 1 and 2.
- Run `npm --workspaces run test:tsc --if-present` and `npm run lint`.
- Run the full unit suite because the scope contract affects every scale
  channel and generated guide.
- Build or verify schema-derived documentation using the
  `write-genomespy-docs` workflow.
- Browser-smoke-test the sashimi plot, symbol legends, gradient legends, nested
  offsets, owner-level parameter controls, and child `push: "outer"` updates
  under resize and interaction.

### Documentation and migration

- Use `write-genomespy-docs` for specification JSDoc, schema output, examples,
  and docs verification.
- Use `debug-genomespy-web` for the final browser smoke tests.
- State clearly that a child-local-only parameter no longer controls a shared
  scale and that there is no compatibility fallback.

### Tentative commit

`docs(core): document scale expression ownership`

## Final integration verification

- Confirm independent scales still resolve unit-local range and domain params.
- Confirm a shared scale resolves owner and ancestor params, including owner
  shadowing of a same-named ancestor binding.
- Confirm child-local-only range and domain params fail with migration guidance.
- Confirm child `push: "outer"` updates the shared scale.
- Confirm selection-domain references retain their existing explicit binding.
- Confirm helper topology and cycle errors are deterministic.
- Confirm generated symbol/gradient legends and nested x/y offsets update under
  resize without leaked listeners or arbitrary member dependence.
- Confirm dynamic insertion and removal leave no reactive callbacks owned by a
  removed member or disposed resolution.
- Confirm `__rangeExprScope`, `__paddingExprScopes`, and equivalent runtime
  provenance properties are absent from production code.

## Risks

### Breaking external specifications

Pre-1.0 specifications may rely on a child-only parameter controlling a shared
scale. Mitigate with an early, contextual error, release notes, and a complete
owner-plus-`push: "outer"` example.

### Resolution geometry differs from declaration geometry

Generated legends and nested compositions may currently obtain width/height
from a child by accident. Treat changed geometry as a regression unless the
resolution topology proves the owner geometry is the intended contract.

### Member mutation may not reconfigure initialized props

Current membership sync primarily invalidates cached props and subscriptions.
Tests may reveal that an initialized scale needs an explicit `reconfigure()`
when its effective expression-bearing declaration changes. Keep that fix at the
resolution lifecycle boundary rather than placing mutation-specific behavior
in containers.

### Error wrapping may obscure expression causes

Only augment unknown-variable binding failures that indicate scope lookup.
Preserve parse errors, scale-helper errors, cycles, validation failures, and
their causes unchanged.

### Scope change may expose helper topology gaps

The owner may not currently expose the related scale channel expected by a
generated or automatic expression. Fix the topology or generated declaration;
do not restore member lookup as a workaround.

## Unresolved questions

- Should identical ExprRefs contributed by several members share one compiled
  expression function, or is one resolution-owned function per occurrence
  preferable for diagnostics? Correct scope and lifecycle do not require
  deduplication; decide only with evidence about error reporting and cost.
- Should debug snapshots expose the resolution owner path explicitly alongside
  declaration paths? Add it only if existing `hostView` output is insufficient.
- Does initialized member mutation already call `reconfigure()` on every path,
  or must `#syncMembers()` trigger it when a scale exists? Resolve with focused
  mutation tests before choosing the hook.
- Can all generated legend pixel scales be hoisted to view-level declarations
  without changing their intentionally excluded resolution topology, or should
  some remain unit-owned? Prefer the smallest generated-spec change consistent
  with owner geometry.

## Acceptance criteria

- All domain and range ExprRefs bind through one resolution-owned scope.
- Independent scales retain access to unit-local parameters.
- Shared scales access owner and ancestor parameters.
- Child-local-only parameters fail with actionable migration guidance.
- Child `push: "outer"` updates an owner parameter that drives a shared scale.
- Declaration-origin runtime metadata is removed.
- Configured-domain subscriptions no longer bind through contributing member
  runtimes.
- Selection-domain references retain their existing semantics.
- Generated legends and nested offsets update correctly during resize.
- Scale helpers resolve through owner topology and cycles still fail explicitly.
- View mutation and resolution disposal do not leak or nondeterministically
  rebind expressions.
- Examples, specification docs, generated docs, and changelog describe the new
  contract.
- #471 closes without implementing dynamic padding or #463 scheduling work.

## Plan retirement

Before creating the #471 pull request, reconcile every checkbox as completed or
discarded and commit that record. Delete this plan in a later commit before the
pull request is created or merged, following the repository plan workflow. The
separate dynamic-padding feasibility plan is not part of the #471 change and
must remain gated on #471 being closed.

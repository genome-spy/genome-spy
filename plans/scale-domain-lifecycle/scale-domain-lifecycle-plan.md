# Scale-domain lifecycle refactor

## Purpose and scope

Replace fragmented domain lifecycle decisions with one explicit update model,
preserving supported visual behavior. Restore `ScaleResolution` to its original
role: collecting participants and resolving shared-scale configuration. Domain
dependencies and propagation should use the existing reactive machinery, leaving
only the necessary historical interaction/loading policy and animation state.
Success requires removing responsibilities and competing update paths, not merely
extracting helpers from a large class. This follows
[issue #464 and its comments](https://github.com/genome-spy/genome-spy/issues/464).
Milestones 1–8 are complete. The
[detailed milestone 3 record](milestone-3-plan.md) contains the readiness and
owner integration, review outcomes, verification, and measured tradeoffs.
That work supplied the tested baseline for the final simplification.
Milestones 5–7 below address the essential synchronous part of
[issue #463](https://github.com/genome-spy/genome-spy/issues/463), following the
[design discussion](https://github.com/genome-spy/genome-spy/issues/463#issuecomment-5551252304).
The reviewed migration and its final verdict are recorded in
[milestone-7-plan.md](milestone-7-plan.md). Plan retirement and whole-branch PR
preparation remain separate; no merge is performed as part of this milestone.

The key distinction is between calculating a candidate domain and deciding
whether it may replace the displayed domain. Data arrival, expressions,
selections, viewport navigation, interaction, reset, and membership changes
must eventually use one decision and commit path.

Goals:

- Make participant collection, compatibility checks, property resolution, and
  binding lifecycle the primary responsibilities of `ScaleResolution`.
- Separate displayed domain, reset target, initial reference, data zoom extent,
  readiness, and permission for initial loading to replace the display.
- Distinguish pending inputs from completed empty inputs, including lazy side
  inputs and coverage of the requested viewport.
- Preserve navigation during asynchronous updates and suppress animations
  through partial initial domains.
- Keep selection authority and calibrated expression propagation intact.
- Preserve automatic domain animations, including eligible data, configuration,
  membership, and viewport updates. Animation is required UX, not optional scope.
- Delete write-then-restore behavior and duplicated lifecycle state.
- Establish one coherent synchronous update boundary across reactive inputs,
  domain-related data replay, scale updates, and dependent expressions.
- Reuse the existing reactive runtime while retaining streaming row processing.

Non-goals are public specification changes, pixel ranges, domain-only sharing,
a second reactive scheduler, adoption of Vega's tuple-change dataflow, or
rewriting spatial queries and scale mathematics. General async generations and
latest-wins source publication remain separate work under #463. Shipping reactive
padding and migrating every reactive consumer are also outside this delivery.

## Architecture and decisions

Current boundaries are `packages/core/src/scales/scaleResolution.js`,
`domainPlanner.js`, `scaleInteractionController.js`, and `scaleInstanceManager.js`.
The first three contain 3,442 lines at the start of this branch. Data readiness
also involves `data/collector.js`, `data/sources/lazy/singleAxisLazySource.js`,
`data/transforms/lookup.js`, and `view/dataReadiness.js`.

Use a pure lifecycle decision function with explicit input state and update
reasons. It must be testable without views, collectors, a renderer, or a physical
scale. Keep normalization (`nice`, zero, genomic/index conventions) outside it.
Transition frames represent displayed domains, not merely a final target.

The completed integration puts authoritative domain state and one commit method
in `ScaleResolution`, using the pure lifecycle policy. That stabilized behavior,
but left the resolution coordinating source callbacks, selection feedback,
notifications, and transitions. Treat it as a tested migration baseline, not the
target architecture. A smaller resolution that still orchestrates those updates
through helpers would not meet the objective.

### Intended responsibilities

These are ownership boundaries, not a prescription for one new class per row.
Use existing facilities and functions where possible.

| Boundary                     | Responsibility                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ScaleResolution`            | Collect active participants, validate compatibility, resolve shared properties with their declaration scopes, and establish/rebind/dispose the resulting bindings. Retain compatible public access and navigation entry points as thin delegates. |
| Existing reactive runtime    | Represent dependencies and derived values, order coherent propagation, and run grouped effects. Coordinate the narrow streaming replay/publication boundary needed by domains.                                                                    |
| Domain derivation and policy | Derive candidate/reset/extent/readiness inputs from resolved bindings. Keep explicit historical state only where current inputs cannot determine behavior: initial loading versus navigation, selection authority, and transition decisions.      |
| Animation                    | Own transition execution and cancellation, publishing each displayed-domain frame through the same reactive boundary. Preserve interpolation, timing, interruption, and promise semantics.                                                        |
| Physical scale integration   | Normalize domains and apply settled domain/property/range inputs to the physical scale; expose compatible notifications and renderer inputs without a competing domain authority.                                                                 |

`ScaleResolution` may retain references to runtime resources without implementing
their update protocol. Resolve dependency topology when participants or authored
configuration change; parameter changes, collector publication, and animation
frames should propagate through established bindings. Do not rediscover view
dependencies or call back into a resolution-wide refresh for every update.

Keep one authority for each state value, especially the displayed domain. The
target domain and animated display are different values, not duplicate caches.
Graph dependencies should replace manual invalidation and notification ordering;
the small policy retains UX decisions that are inherently historical. Do not
rebuild the current coordinator under a new name, introduce a second scheduler,
or add a generic provider hierarchy. Reuse aggregation, normalization, viewport
debounce/coverage, and the existing animation mathematics.

[Vega's scale properties](https://vega.github.io/vega/docs/scales/#scale-properties)
separate data-derived domains from interactive `domainRaw` overrides. That is
a useful precedent for separating candidate and displayed state; GenomeSpy's
lazy coverage, side inputs, and initial-loading rules require explicit policy
of their own. No external implementation is copied.

The relevant lesson from the local Vega parser and scale operator
(`tmp/vega/packages/vega-parser/src/parsers/scale.js` and
`tmp/vega/packages/vega-encode/src/Scale.js`) is to resolve dependencies up front
and consume settled properties through the reactive graph. Preserve GenomeSpy's
streaming dataflow rather than adopting Vega's tuple-change machinery. Distinguish
domain dependencies from the final mapping so useful same-scale domain-to-range
expressions do not become false cycles.

An all-at-once rewrite with E2E tests would obscure intermediate notifications,
readiness, and reset semantics. A wrapper around the existing branches would
retain the original complexity. Incremental replacement permits a new model
while keeping each integration boundary reviewable.

## Milestones

### 1. Establish the behavior contract and example-based characterization

- [x] Record intended contracts, existing quirks, and deliberate future fixes
      in [behavior-contract.md](behavior-contract.md).
- [x] Add six focused headless tests drawn from the documented/shared examples
      in `scaleResolution.lifecycle.test.js`.
- Outcome: a concrete regression boundary for current visuals and runtime APIs.
- Areas: scale tests and this plan's companion contract; downstream selection,
  lazy data, layout, expression, and bookmark expectations are included.
- Verification: focused scale/lazy/lookup tests; actual example specifications
  where deterministic, small deterministic adaptations otherwise. Keep existing
  calibrated-transition and coordinate-lookup tests as regression coverage.
- Documentation: internal contract only; user-facing semantics do not change.
- Commit: `test(core): characterize example scale-domain lifecycle contracts`.

### 2. Implement and test the explicit lifecycle policy

- [x] Build a small pure model for domain updates with explicit readiness in
      `domainLifecycle.js`.
- [x] Exercise asynchronous contributor, empty-result, early interaction,
      baseline, membership, authority, and transition event sequences with 29 tests.
- Outcome: a reviewable policy independent of scale mutation. Live runtime
  integration remains milestone 3; tests must distinguish intended fixes from
  current behavior rather than pretending the new policy is already active.
- Areas: a focused module and colocated tests under `packages/core/src/scales/`.
- Verification: model tests plus milestone 1 regressions, type checks, and lint.
  Review the model against real callers and revise if integration would require
  duplicated policy, redundant state, or another scheduler.
- Require a caller-to-input/action mapping for configuration, data, viewport,
  selection reverse synchronization, animation frames, bookmark `zoomTo`, and
  reset. Adapters may normalize inputs and execute actions, not decide policy.
- Documentation: record state meanings and the adapter obligations; no public
  API migration. Measure model size and make no runtime simplification claim yet.
- Commit: `refactor(core): define an explicit domain lifecycle policy`.

### 3. Integrate one domain owner and remove the old lifecycle

The [detailed implementation plan](milestone-3-plan.md) defines readiness,
ownership, commit ordering, example-based verification, and coherent commits.
Review that shared contract with a subagent before runtime implementation.

- [x] Expose relevant initial readiness and lazy coverage from the dataflow,
      including auxiliary input dependencies and genuine empty completion.
- [x] Route configuration, data, selections, viewport updates, interaction,
      reset, scale recreation, and animation frames through a single commit path.
- [x] Delete obsolete snapshot, restore, suppression, and notification branches.
- Outcome: live domains are decided before mutation; late loads cannot undo
  navigation, and completed membership changes cannot reopen initialization.
- Areas: scales, dataflow readiness, parameter/selection subscriptions, and any
  direct domain writers (including separator views). Preserve public scale APIs.
- Verification: focused integration tests, full unit suite, workspace type
  checks and lint, and browser scenarios below. Check subscription disposal,
  failed dynamic insertion, ordinal ordering, and layout invalidation.
- Documentation: update architecture and document intentional bug fixes using
  the documentation skill; preserve public grammar and persisted bookmark data.
- Commits: relevant-input readiness, then centralized commits/transitions, as
  specified in the detailed plan. Final integration review covers both slices.

### 4. Verify integration and evaluate the simplification

- [x] Exercise real examples and downstream consumers; resolve regressions.
- [x] Compare lifecycle state, branches, domain writers, and production size
      with the baseline. Revise an extraction that only adds indirection.
- Outcome: behavior-preserving integration with documented, tested fixes.
- Areas: Core rendering/layout, App bookmark restoration, lazy data, and scales.
- Verification: browser zoom/pan during loading, viewport autoscaling after
  navigation, overview/detail brushing in both directions, calibrated tracks
  through animation, and dynamic visibility/membership. Headless assertions
  cover domain/notification sequences; browser checks cover the actual display.
- Documentation: reconcile this plan and retire it before a PR or merge.
- Commit: `test(core): verify integrated domain lifecycle behavior`.

### 5. Establish coherent synchronous reactive updates

The [detailed contract and delivery record](milestone-5-plan.md) defines the
streaming publication boundary, failure/retry semantics, and verification.

- [x] Detail and review the shared update contract before implementation. Map
      current resolution responsibilities to the boundaries above, identifying
      the callbacks, state, and ordering guards the domain experiment will delete.
      Specify initialization, selection feedback, and binding lifecycle together
      with the update contract; do not assume graph batching alone solves them.
- [x] Expose the smallest internal computed/effect facilities needed through
      `ParamRuntime` / `ViewParamRuntime`.
- [x] Make the expression and grouped-update paths required by the domain
      experiment participate in that contract. Coordinate their streaming replay
      requests and publication of resulting domain/readiness facts.
- Outcome: related writes produce coherent downstream inputs; computations,
  grouped effects, and required data replay settle before rendering. Data rows
  and datum-dependent formula evaluation remain on the existing streaming path.
- Areas: `paramRuntime/`, scale-expression dependency bindings in
  `utils/expression.js`, and the narrow `FlowNode`/collector/transform bridge
  required by milestone 6. Extend the existing graph runtime rather than adding
  another scheduler or converting the whole dataflow into signal nodes.
- Verification: transaction and diamond dependencies, nested transactions,
  unchanged results, declaration scopes, disposal, lazy bootstrap, effects that
  invalidate further computations, and multiple transforms sharing upstream data.
  Prove coherent values and deduplicated replay, including synchronous scale
  changes. Direct callbacks must not bypass the new boundary in migrated paths.
- Documentation: specify equality, update/flush semantics, ownership/rebinding,
  cycle handling, and the signal → replay → signal boundary in the architecture.
  Explicitly distinguish propagation settling from animation or network completion.
- Review gate: a subagent reviews the shared contract and its concrete domain
  integration sketch before coding. Every proposed runtime extension must support
  a required domain scenario; a general reactive-system overhaul is out of scope.
- Commit: `refactor(core): coordinate synchronous reactive updates`.

### 6. Prove domain simplification with a representative integration

- [x] Move viewport-derived candidate calculation and a calibrated dependent
      scale onto the shared reactive foundation, preserving domain policy and
      actual animation frames.
- [x] Prove the feedback boundary with a minimal two-way linked animated
      navigation/clear integration before judging the foundation sufficient.
      Include owner echoes and authoritative external clears equal to the display;
      the full selection migration can follow in milestone 7.
- [x] Delete superseded subscriptions, cache invalidation, and ordering logic
      for that path, including their orchestration in `ScaleResolution`. Keep
      resolution responsible for setting up bindings, not driving their updates.
      Review the result before extending the migration.
- Outcome: a working comparison against the milestone 4 baseline demonstrates
  simpler coordination with the same visible behavior. Target and displayed
  domains remain distinct; small stateful readiness/navigation policy is retained
  wherever necessary.
- Areas: domain planning/ownership, viewport evaluation, collector publication,
  expression calibration, and physical scale updates. Resolve bindings when
  topology/configuration changes instead of rediscovering them on every update.
- Verification: the real `viewport-autoscale.json` example and deterministic
  calibrated-domain tests, including same-frame propagation, pending/ready-empty
  data, cancellation, and no duplicate replay. Test valid same-scale domain-to-range
  dependencies separately from true mapping/bandwidth cycles. The padding scenario
  in #463 may test grouped properties without adding a public padding feature.
- Documentation: record the chosen graph boundaries and measured changes in
  production size, replay work, subscriptions, and ordering assumptions. Include
  a before/after responsibility and deletion ledger across all affected modules,
  including shared runtime additions; a shorter resolution alone is insufficient.
- Decision gate: migrate further only if review finds a material simplification.
  Trace a data publication, navigation frame, and calibrated-domain update: each
  must use established dependencies without resolution-managed refresh ordering.
  Any retained origin/cancellation guard must enforce a specific UX contract,
  not compensate for missing propagation ordering. Relocating the existing
  complexity into adapters is insufficient. If the experiment fails, revise the
  design and reconcile the remaining milestone;
  do not expand migration or silently treat the branch as merge-ready.
- Commit: `refactor(core): drive viewport domains through reactive dependencies`.

Milestone 6's reviewed result is recorded in [milestone-6-plan.md](milestone-6-plan.md).
The continuous path has simpler propagation, but total production size increased.
Milestone 7 subsequently removed the parallel legacy adapter and planner caches;
its final assessment below supersedes that interim simplification gate.

### 7. Complete the justified migration and verify integration

- [x] After milestone 6 passes its decision gate, migrate the remaining applicable
      domain paths and remove their replaced coordination machinery.
- [x] Review the combined runtime/dataflow/scale result, resolve regressions,
      and reconcile this plan before PR preparation.
- Outcome: domain handling uses the shared synchronous consistency contract with
  one displayed-domain authority and no permanent parallel compatibility path.
  `ScaleResolution` primarily resolves participants/configuration and manages
  bindings; it no longer implements the domain update protocol. Existing public
  methods may delegate to the appropriate runtime resources.
  Unrelated reactive consumers and broader async work remain explicitly deferred.
- Areas: configured and selection-linked domains, navigation/reset, dynamic
  membership, lazy readiness, range/layout consumers, and App bookmark restoration.
- Verification: full unit suite, workspace TypeScript, lint, example validation,
  and browser checks for viewport autoscaling, two-way brushing/animated zoom,
  MSA data extents, and Dynseq lazy loading. Include calibration, immediate rendering,
  dynamic insertion/visibility/disposal, index/locus conventions, categorical order,
  and existing WebGL/WebGPU and Canvas/SVG scale-consumption contracts.
  Check that performance gains survive real streaming workloads.
- Documentation: update architecture, record evidence and any intentionally
  unmigrated boundaries, document the completed subset of #463 while leaving its
  async requirements open, and retire temporary plans before creating a PR.
- Commit: `refactor(core): unify domain propagation and remove legacy coordination`.

Milestone 7 passed its integrated review gate. The same affected production cohort
is 672 lines smaller than milestone 6, while remaining 402 lines larger than
milestone 4. This is accepted for the clearer single propagation/ownership path,
not as a net line-count reduction. See the detailed record for tests, browser
checks, reviewer findings, and intentionally deferred boundaries.

### 8. Consolidate contributor bindings and remove redundant refreshes

Status: complete; reviewed with contributor lifetime and App integration checks.

- [x] Bind each affected resolution once after subtree encoders are installed.
      Let domain inputs own collector subscriptions, using their bound accessors
      and disposing subscriptions on replacement or resolution disposal.
- [x] Preserve domain-sensitive feedback filtering, inert channels, shared
      collectors, conditional accessors and color/fill/stroke channel aliases.
- [x] Remove App metadata's explicit refresh only when a real dynamic metadata
      test proves initial and replacement domains settle through publication.
- [x] Review lifetime, dynamic insertion/visibility/removal, and measured net size;
      run full tests, workspace types/lint and representative browser examples.
- Retain UnitView's startup selection bridge: the deletion probe showed that a
  domain-inert scale gets no collector publication to seed its initial brush.
  This small required bridge is preferable to introducing a new initialization
  protocol. Keep seeding, finite zoom-extent, and fallback-clear regression tests.
- Do not change membership rollback, expression scope compatibility, axis domain
  usability heuristics, or the domain policy/animation protocol in this follow-up.
- Commit: `refactor(core): consolidate domain contributor bindings`.

Follow-up evidence:

- Removed UnitView's registration flag/accessor grouping/subscription lifetime and
  ScaleResolution's collector registration wrapper. `domainInputs` owns subscriptions
  from the accessors it already binds, deduplicated by collector/key. `flowInit`
  binds each affected resolution once after all encoders are installed, using
  accessor scale channels so color/fill/stroke aliases remain correct.
- Removed App metadata's post-load refresh traversal. Its new test checks public
  nominal and quantitative domains before readiness resolves, initially and after
  a delayed asynchronous metadata rebuild.
- Startup regression tests retain ordinary/domain-inert initial brush seeding,
  finite zoom extents, and clearing an initial brush matching the loaded fallback.
- Shared-collector and detached-contributor tests verify one coherent query/update,
  no late detached publication, and continued active-source updates. Existing
  domain-sensitive flow tests now assert domain/extent behavior instead of the
  removed registration method.
- Beauvoir and Euclid approved the integrated ownership/lifetime change. Heisenberg
  verified the App removal with 211 focused tests and App source/test type checks.
  Full suite: 3,971 passed, one skipped, two todo across 466 files. Workspace
  TypeScript, lint, formatting and diff checks pass. Browser smoke checks pass for
  viewport autoscale, two-way linked domains, MSA, and Dynseq.
- Five changed production files total 4,008 -> 3,874 lines (-134): ScaleResolution
  1,689 -> 1,653; UnitView 531 -> 408; domainInputs 417 -> 455; flowInit 376 -> 390;
  MetadataView 995 -> 968. New comments are included in these totals.
- Verdict: a worthwhile deletion of a second subscription-lifetime owner and an
  obsolete App refresh path. Retaining the proven startup bridge keeps the scope
  bounded; no new scheduler or initialization protocol is introduced.

Domain-only sharing is a later proposal, contingent on this refactor succeeding.
It must define compatibility for domain-affecting properties and range-dependent
padding. It does not replace expression-based calibration between unequal domains.

### Final acceptance criteria

- Required visible behavior, including automatic animations, passes the example
  and integration checks. No UX requirement is removed to obtain a smaller design.
- For each domain update path, identify its input, derived dependencies, necessary
  historical policy, and display publication. Remove superseded resolution-level
  subscriptions, refresh cascades, duplicated state, and ordering workarounds.
- Ordinary propagation does not require `ScaleResolution` to sequence domain,
  selection, calibration, and rendering callbacks. Construction, configuration
  changes, and disposal remain explicit lifecycle operations.
- Measure the entire affected production path against both the branch baseline
  and milestone 4. Explain growth through correctness or shared machinery that
  replaces local coordination; helper count and class line count are not success
  measures. Record remaining complexity and why its behavior requires it.
- A final subagent review confirms that responsibility was removed rather than
  relocated and that the shared runtime remains proportional to the scale task.

## Example corpus and review gates

Read `docs/grammar/scale.md`, the interval-selection documentation, and
`examples/README.md`. Representative fixtures include:

- `examples/docs/grammar/scale/viewport-autoscale.json` (replace random signal
  data with a small deterministic series for numerical assertions).
- `examples/core/selection/interval_linked_domain_two_way.json` and its one-way
  counterpart for selection authority, clearing, and reverse synchronization.
- `examples/core/scales/index_scale_test.json` and
  `examples/docs/grammar/scale/locus-scale-domain.json` for coordinate semantics.
- `examples/docs/grammar/scale/shared-scale-expression.json` for owner-scoped
  parameters; preserve `scaleResolution.parameterDependency.test.js` for
  calibrated domains following actual intermediate animation frames.
- Coordinate-lookup and lazy-contributor tests in
  `scaleResolution.domain.test.js` for asynchronous multi-track patterns.
- `examples/docs/examples/genomic-data/msa.json` for configured index domains
  with a distinct data zoom extent, and `dynseq-spi1-bqtl.json` in that directory
  for a shared lazy primary source with independent coordinate-lookup inputs.

Review this plan with a subagent before committing it. Review milestones 1–2
together with a subagent before the second implementation commit, including
the prospective live adapter and downstream consumers. Integration in milestone
3 needs its own review at the shared readiness/domain contract boundary.
For the follow-on work, review milestone 5's shared consistency contract before
coding, milestone 6's integrated experiment at its decision gate, and milestone
7's final cross-system result. Include downstream consumers and performance in
these reviews; avoid separate review gates for routine tests or plan wording.

## Follow-on constraints and open design questions

All existing UX requirements remain fixed, especially automatic domain animations,
their timing/interpolation and cancellation, synchronous calibration, immediate
render APIs, valid same-scale domain-to-range expressions, selection persistence,
and initial readiness independent of viewport coverage. No blanket microtask delay
or reduction in animation functionality is an acceptable simplification.

Milestone 5 must settle how grouped effects that publish new reactive values are
ordered, how replay requests sharing collectors are coalesced, which changes join
the current update versus a subsequent one, and how real cycles are detected.
It must also define equality for domain arrays/objects, declaration-scope binding,
and ownership/rebinding when membership changes. Current graph primitives are a
starting point; they do not already guarantee coherent propagation across all
these boundaries.

The change must preserve lazy bootstrap such as `displace1d` and meaningful empty
publication. Existing asynchronous source protections remain in place. Readiness
does not prove latest-request authority: generalized generations, cancellation,
and stale-result rejection require separate design and must not be claimed solved
by synchronous batching.

Risks requiring explicit decisions are reset versus snapshot semantics,
`domainTransition: false` currently also bypassing interaction preservation,
baseline completion after early interaction, dummy lazy startup completions,
side-input coverage, and selection feedback during transitions. Characterize
current behavior first; do not silently turn a quirk into a permanent contract.

## Delivery record: milestones 1 and 2

- The plan received subagent review before commit. The requested caller mapping
  is recorded in [policy-integration.md](policy-integration.md).
- Six new headless characterization tests use the documentation/example corpus;
  29 pure model tests cover the proposed lifecycle. The focused scale, lazy-source,
  and coordinate-lookup run passes 321 tests in 29 files. Workspace TypeScript,
  repository lint, and formatting checks pass.
- Subagent implementation review identified selection-origin ambiguity during
  animation. The revised model distinguishes explicit selection synchronization
  from external changes and preserves equal passive data/membership updates.
  Regression tests cover clearing before the first frame and data arrival during
  bookmark navigation. The reviewer confirmed the fixes and approved milestone 2.
- The model is 302 lines including its JSDoc contracts, with 414 lines of tests.
  It introduces no scheduler or provider framework. Existing live coordinators
  are unchanged: the production-size reduction gate remains milestone 3.
- No interactive browser run was needed for these headless characterization and
  provisional policy changes. Browser verification remains an integration gate.

## Milestone 3 planning review

The detailed plan received subagent review on 2026-09-05. Review corrections
separate initial readiness from viewport eligibility and define reentrant commit
validity without suppressing required effects during benign selection feedback.
Automatic animations remain a fixed UX requirement. Readiness slice A is now
implemented and reviewed. Domain-owner integration and cross-system verification
are also complete; the detailed plan records their evidence and size measurements.

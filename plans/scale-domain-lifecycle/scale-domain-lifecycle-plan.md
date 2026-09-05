# Scale-domain lifecycle refactor

## Purpose and scope

Replace fragmented domain lifecycle decisions with one explicit update model,
preserving supported visual behavior. This follows
[issue #464 and its comments](https://github.com/genome-spy/genome-spy/issues/464).
The first delivery covers milestones 1 and 2 below. It establishes the contracts
and tests the new policy before integrating it into live scales.

The key distinction is between calculating a candidate domain and deciding
whether it may replace the displayed domain. Data arrival, expressions,
selections, viewport navigation, interaction, reset, and membership changes
must eventually use one decision and commit path.

Goals:

- Separate displayed domain, reset target, initial reference, data zoom extent,
  readiness, and permission for initial loading to replace the display.
- Distinguish pending inputs from completed empty inputs, including lazy side
  inputs and coverage of the requested viewport.
- Preserve navigation during asynchronous updates and suppress animations
  through partial initial domains.
- Keep selection authority and calibrated expression propagation intact.
- Delete write-then-restore behavior and duplicated lifecycle state.

Non-goals are public specification changes, pixel ranges, domain-only sharing,
a replacement parameter scheduler, or rewriting domain aggregation, spatial
queries, scale mathematics, or property resolution without a demonstrated need.

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

During integration, one `ScaleResolution` will privately own one domain lifecycle
instance. Reuse existing aggregation, normalization, viewport debounce/coverage,
and parameter propagation. A source/provider abstraction is optional and must
earn its place by deleting duplication. Do not create a second scheduler.

[Vega's scale properties](https://vega.github.io/vega/docs/scales/#scale-properties)
separate data-derived domains from interactive `domainRaw` overrides. That is
a useful precedent for separating candidate and displayed state; GenomeSpy's
lazy coverage, side inputs, and initial-loading rules require explicit policy
of their own. No external implementation is copied.

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

- [ ] Build a small pure model for domain updates with explicit readiness.
- [ ] Exercise asynchronous contributor, empty-result, early interaction,
      baseline, membership, authority, and transition event sequences.
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

- [ ] Expose relevant initial readiness and lazy coverage from the dataflow,
      including auxiliary input dependencies and genuine empty completion.
- [ ] Route configuration, data, selections, viewport updates, interaction,
      reset, scale recreation, and animation frames through a single commit path.
- [ ] Delete obsolete snapshot, restore, suppression, and notification branches.
- Outcome: live domains are decided before mutation; late loads cannot undo
  navigation, and completed membership changes cannot reopen initialization.
- Areas: scales, dataflow readiness, parameter/selection subscriptions, and any
  direct domain writers (including separator views). Preserve public scale APIs.
- Verification: focused integration tests, full unit suite, workspace type
  checks and lint, and browser scenarios below. Check subscription disposal,
  failed dynamic insertion, ordinal ordering, and layout invalidation.
- Documentation: update architecture and document intentional bug fixes using
  the documentation skill; preserve public grammar and persisted bookmark data.
- Commit: `refactor(core): centralize live domain lifecycle updates` (split at
  dataflow/scale contract boundaries if needed for coherent review).

### 4. Verify integration and evaluate the simplification

- [ ] Exercise real examples and downstream consumers; resolve regressions.
- [ ] Compare lifecycle state, branches, domain writers, and production size
      with the baseline. Revise an extraction that only adds indirection.
- Outcome: behavior-preserving integration with documented, tested fixes.
- Areas: Core rendering/layout, App bookmark restoration, lazy data, and scales.
- Verification: browser zoom/pan during loading, viewport autoscaling after
  navigation, overview/detail brushing in both directions, calibrated tracks
  through animation, and dynamic visibility/membership. Headless assertions
  cover domain/notification sequences; browser checks cover the actual display.
- Documentation: reconcile this plan and retire it before a PR or merge.
- Commit: `test(core): verify integrated domain lifecycle behavior`.

Domain-only sharing is a later proposal, contingent on this refactor succeeding.
It must define compatibility for domain-affecting properties and range-dependent
padding. It does not replace expression-based calibration between unequal domains.

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

Risks requiring explicit decisions are reset versus snapshot semantics,
`domainTransition: false` currently also bypassing interaction preservation,
baseline completion after early interaction, dummy lazy startup completions,
side-input coverage, and selection feedback during transitions. Characterize
current behavior first; do not silently turn a quirk into a permanent contract.

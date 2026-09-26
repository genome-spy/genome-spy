# Test suite value audit and pruning plan

Status: proposed

## Objective

Review GenomeSpy's Vitest suite for tests whose maintenance cost exceeds the
behavioral protection they provide. Remove or combine redundant assertions,
replace fragile implementation-shape checks with observable subsystem behavior
where that improves coverage, and retain tests that catch plausible regressions.
The result should make feature work and refactoring easier without losing
important dataflow, reactivity, layout, rendering, or public API contracts.

The recent inventory found about 497 Vitest files and 4,418 collected cases.
These are navigation figures, not a deletion target: parameterized example
initialization contributes many cases, and test count alone says little about
value. Record a fresh baseline when work begins.

## Scope and decisions

- Review the Vitest files across packages, prioritizing expensive snapshots,
  mock-heavy forwarding tests, exact internal graph assertions, and thin-wrapper
  tests. Inspect a reproducible random control sample from the rest of the
  suite so the queue is not selected only by size or test style.
- Assess behavior at the narrowest useful boundary. For Core dataflow, this is
  often a specification through source, transforms, and collector; for
  reactivity, propagation through dependent parameters and observers; for
  layout, arranged bounds and visible hierarchy. Use a browser only for
  contracts that need actual browser or GPU behavior.
- Classify each reviewed candidate as **keep**, **simplify/combine**,
  **replace**, or **delete**. Record what regression the test can catch, whether
  that contract is covered elsewhere, what routine refactoring would break it,
  and the proposed action. Do not extrapolate a deletion percentage from the
  control sample.
- Delete a test only when its assertion has no unique supported contract, or
  when a retained/replacement test covers that contract at least as well.
  Assess cases individually; an implementation-oriented file may contain a
  valuable lifecycle or failure test.
- Prefer small, named examples and representative assertions. Preserve broad
  generated-spec coverage when it catches initialization failures that focused
  examples miss; reduce exact snapshots only after identifying their distinct
  contract and a sufficient replacement.

## Initial candidates and protection to verify

These are hypotheses for review, not approved deletions:

| Candidate | Possible maintenance cost | Contract to preserve or establish |
| --- | --- | --- |
| `packages/webgpu-renderer/src/scales/linear.test.js` | A single test largely restates a short config factory. | Confirm that scale construction is covered by renderer or scale-consumer tests before deleting its only definition-identity assertion. |
| `packages/core/src/embedFactory.test.js` | Repeated subclasses and forwarding checks make simple API routing verbose. | Keep launch, disposal, public API, and error behavior; combine only genuinely equivalent forwarding cases. |
| `packages/core/src/view/flowBuilder.test.js` | Tests depend on node classes and exact child paths, including an inserted `CloneTransform`. | Check row output, branch isolation, source overrides, and collector ownership across a complete headless flow. Keep graph assertions only for intentional optimizer invariants. |
| `packages/core/examples.test.js` and its 15,273-line snapshot | Each offline example initializes, but exact names, source identifiers, and hierarchy snapshots can churn. | Retain broad offline initialization and a curated set of structural contracts. Verify whether the large snapshot detects defects beyond those checks. |
| `packages/core/layout.test.js` and its 2,417-line snapshot | Exact serialized layout trees may change after benign layout refactors. | Retain representative geometry, axis, legend, and nested-layout assertions, using existing `flexLayout` and SVG tests where they cover the same contract. |
| `packages/core/src/rendering/webgl/shaderSnapshot.test.js` and its 8,520-line snapshot | Generated GLSL produces large review diffs. Its fake GL helper reports compile/link success without validating GLSL. | Preserve generated-shader variants and regressions; do not drop exact output until a real compiler or rendering check, or focused source assertions, covers the relevant failure modes. |

Known subsystem tests such as `reactiveReplay.test.js`, `graphRuntime.test.js`,
`viewMutationApi.acid.test.js`, `flexLayout.test.js`,
`scaleResolution.parameterDependency.test.js`, and SVG `standaloneAxes.test.js`
exercise useful cross-component behavior. Review their individual assertions,
but do not treat their integration setup as waste merely because it is long.

## Milestone 1: Build a reviewable decision queue

Status: pending

### Intended outcome

A complete file inventory and a ranked, evidence-backed queue of candidates.
For each reviewed file, identify the behavior protected and overlaps; report
uncertain items separately. Group related cases so reviewers can evaluate the
coverage change rather than a raw count of assertions removed.

### Work and affected areas

- Collect test files and case counts with the repository's Vitest configuration.
  Use a fixed random seed for a control sample and record the command and seed.
- Inspect high-cost candidate groups across Core, App, App Agent, WebGPU, and
  smaller packages. Trace proposed replacement coverage to actual assertions,
  not just filenames. Record whether a test has caught a prior bug when that is
  discoverable without an open-ended history search.
- Publish the queue and its rationale in a temporary findings file under this
  plan directory. Include exact files/cases, proposed actions, confidence, and
  the residual risk. Revisit the queue as code changes reveal hidden contracts.

### Verification

Check the inventory against Vitest's collected tests and spot-check every
candidate's proposed overlap by reading the referenced test and production
code. This milestone changes no suite behavior.

Tentative commit: `chore: inventory test suite pruning candidates`

Review gate: agree on the candidate queue and the contracts that must survive
before deleting tests with uncertain or broad coverage.

## Milestone 2: Prune clear duplication and simplify fixtures

Status: pending

### Intended outcome

Remove high-confidence redundant assertions and reduce repeated setup while
keeping public API and subsystem behavior covered.

### Work and affected areas

- Start with simple wrapper/forwarding cases whose contract is already tested
  through a consumer, then consolidate repetitive cases in files such as
  `embedFactory.test.js` where the same setup obscures the meaningful checks.
- Review the remaining inventory for copied implementation branches, duplicate
  permutations, and assertions that can fail only when the test's mock changes.
- For each deletion, record the retained test or explain why the behavior is
  obvious and has no realistic independent regression mode. Keep an explicit
  before/after list of cases and fixture/snapshot lines, without setting a
  required reduction percentage.

### Verification

Run affected Vitest files with `--reporter=agent`, then relevant package tests.
Check that every removed public behavior assertion still has a named retained
test. Run TypeScript checks and lint if test fixtures or JSDoc change.

Tentative commit: `test: simplify redundant wrapper coverage`

## Milestone 3: Replace fragile internal and snapshot checks

Status: pending

### Intended outcome

Protect dataflow, layout, example initialization, and generated rendering
behavior with assertions that remain useful through ordinary refactors.

### Work and affected areas

- Convert selected `flowBuilder.test.js` graph-path cases to spec-to-collector
  tests for actual rows and branch independence. Retain structural assertions
  where graph structure itself is a deliberate invariant.
- Evaluate `examples.test.js` by separating the valuable all-examples
  initialization loop from exact hierarchy snapshots. Keep representative
  structural examples and any unique failure checks before shrinking snapshots.
- Replace selected `layout.test.js` snapshots with focused arranged-bounds,
  hierarchy, or SVG-output checks, considering existing layout and SVG suites.
- Treat GLSL snapshots as a separate risk boundary. First establish which
  shader variants and compiler/rendering failures are covered elsewhere. Add
  a real validation path only if the chosen environment can run it reliably;
  otherwise retain necessary snapshots or narrow them to meaningful fragments.

### Verification

Run focused suites for each changed subsystem and compare failures on deliberate
small mutations to ensure replacement assertions detect the intended behavior.
Run the full unit suite after broad snapshot or generated-example changes.
Use browser/GPU checks only for rendering contracts that headless tests cannot
establish, and document any local environment limitation.

Tentative commits: `test(core): assert dataflow outcomes instead of graph paths`
and `test(core): focus layout and example regression checks`

Review gate: inspect the surviving assertion set and representative snapshot
diffs before removing generated GLSL or broad example coverage.

## Milestone 4: Integrate and document the result

Status: pending

### Intended outcome

A smaller, easier-to-maintain suite with an explicit account of what was
removed, what was combined or replaced, and what behavior remains protected.

### Work and affected areas

- Reconcile the findings file with actual changes. Summarize removed cases and
  snapshot lines alongside retained subsystem contracts; explain candidates
  kept after review.
- Check that headless tests cover representative end-to-end paths through
  dataflow, reactive propagation, hierarchical layout, and SVG output. Add only
  a missing high-value scenario discovered by the audit.
- Keep the small browser smoke layer that demonstrates the application stack
  starts and renders. Expand it only for browser-specific behavior lacking a
  cheaper trustworthy test.
- Update repository testing guidance only if the audit reveals a concrete
  rule that the current `AGENTS.md` does not already express.

### Verification

Run `npm test -- --reporter=agent`, relevant workspace TypeScript checks, and
lint. Run affected browser or GPU checks if the suite changes browser-specific
coverage. Compare the final file/case/snapshot inventory with the baseline and
report the net maintenance change without treating the count as a quality score.

Tentative commit: `test: finalize focused subsystem coverage`

## Risks and unresolved questions

- A verbose test may be the only guard for a bug-prone edge case. Require
  candidate-specific evidence and preserve or replace unique assertions.
- Snapshot size overstates waste when one snapshot checks a broad pipeline.
  Assess the failure modes before shrinking or deleting it.
- Real WebGL/WebGPU validation may need CI facilities unavailable to a local
  headless run. Do not claim equivalent coverage from a mock that always
  reports compile success.
- The right amount of browser smoke depends on existing CI coverage and speed.
  Decide from observed gaps and runtime, not a fixed test-count target.

## Acceptance criteria

- The findings document records the inventory method, sampled controls,
  reviewed candidates, decisions, and specific surviving coverage.
- Every deleted test has a stated reason and no unaddressed unique supported
  contract. Replacement tests assert observable behavior or intentional
  compatibility contracts rather than the implementation sequence.
- Focused suites and the final full unit suite pass, with any browser/GPU
  limitation and its coverage impact stated plainly.
- Final reporting describes maintenance saved and remaining protection without
  claiming that fewer tests alone means a better suite.

Before a future PR or merge, reconcile every pending task in this temporary
plan, commit that record, then delete the plan files in a later commit as the
repository plan workflow requires.

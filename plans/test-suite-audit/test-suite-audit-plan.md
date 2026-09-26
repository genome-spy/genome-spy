# Test suite value audit and pruning plan

Status: active

## Objective

Review GenomeSpy's Vitest suite for tests whose maintenance cost exceeds the
behavioral protection they provide. Remove or combine redundant assertions,
replace fragile implementation-shape checks with observable subsystem behavior
where that improves coverage, and retain tests that catch plausible regressions.
The result should make feature work and refactoring easier without losing
important dataflow, reactivity, layout, rendering, or public API contracts.

The root Vitest collection has 497 files and 4,418 cases; the separate
msdfgen oracle config adds 2 files and 7 cases. These are navigation figures,
not a deletion target: parameterized example initialization contributes many
cases, and test count alone says little about value.

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
- Rank candidates by two separately recorded judgments: unique regression
  protection and maintenance cost. Support the cost judgment with available
  evidence such as runtime, snapshot update history, fixture/setup burden,
  failure noise, or actual refactor churn; file length and mocking style are
  leads, not proof. Prioritize high-cost tests with little unique protection.
- Delete a test only when a named retained/replacement assertion covers its
  supported contract, or when the assertion checks no supported observable
  contract. State the evidence for either conclusion.
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

Status: completed. The root Vitest collection has 497 files and 4,418 cases.
Three read-only Luna reviews and a fixed-seed, 12-file control sample produced
the ranked queue in `findings.md`; `vitest-inventory.tsv` records every file.

### Intended outcome

A complete file inventory and a ranked, evidence-backed queue of candidates.
For each reviewed file, identify the behavior protected and overlaps; report
uncertain items separately. Group related cases so reviewers can evaluate the
coverage change rather than a raw count of assertions removed.

### Work and affected areas

- Collect test files and case counts with the repository's Vitest configuration.
  Select a control sample from files outside the named candidate groups with
  a fixed random seed; record the command, seed, and selected paths.
- Run three read-only Luna reviews in parallel with disjoint primary ownership:
  (1) Core dataflow, reactivity, and view lifecycle; (2) Core layout, examples,
  SVG, and shader snapshots; (3) API wrappers, App, App Agent, WebGPU, smaller
  packages, and the control sample. Each reviewer uses the same cost/protection
  rubric and names exact assertions, overlapping coverage, confidence, and
  residual risk. Reviewers do not edit tests or the findings file.
- Independently inspect selected production paths and cross-area assertions
  before accepting a proposed overlap. Check whether a test caught a prior bug
  when that is discoverable without an open-ended history search. Resolve
  conflicting recommendations in one coverage map; a file owner does not decide
  alone that another area's test makes an assertion redundant.
- Publish the queue and its rationale in a temporary findings file under this
  plan directory. Include exact files/cases, cost and protection evidence,
  proposed actions, confidence, and residual risk. Revisit the queue as code
  changes reveal hidden contracts.

### Verification

Check the inventory against Vitest's collected tests and spot-check every
candidate's proposed overlap by reading the referenced test and production
code. This milestone changes no suite behavior.

Tentative commit: `chore: inventory test suite pruning candidates`

Review gate: agree on the candidate queue and the contracts that must survive
before deleting tests with uncertain or broad coverage.

## Milestone 2: Prune clear duplication and simplify fixtures

Status: completed. `embedFactory.test.js` fell from 292 to 180 lines by sharing
mock construction and view-root setup while retaining its distinct public API,
lifecycle, and debug assertions. `textProgram.test.js` fell from 619 to 613
lines by removing one assertion that only checked arithmetic on local test
data. The 27 focused cases are unchanged. The exact GraphRuntime sibling-order
check remains for a later behavior-focused review; rewriting it now would add
more assertion machinery than it removes.

### Intended outcome

Remove high-confidence redundant assertions and reduce repeated setup while
keeping public API and subsystem behavior covered.

### Work and affected areas

- Start with simple wrapper/forwarding cases whose contract is already tested
  through a consumer, then consolidate repetitive cases in files such as
  `embedFactory.test.js` where the same setup obscures the meaningful checks.
- Review the remaining inventory for copied implementation branches, duplicate
  permutations, and assertions that can fail only when the test's mock changes.
- For each deletion, name the retained/replacement assertion or explain why
  the removed assertion checks no supported observable contract. Keep an
  explicit before/after list of cases and fixture/snapshot lines, without
  setting a required reduction percentage.

### Verification

Run affected Vitest files with `--reporter=agent`, then relevant package tests.
Check that every removed public behavior assertion still has a named retained
test. Run TypeScript checks and lint if test fixtures or JSDoc change.

Actual verification: all 9 embed factory and 18 text program cases pass after
cleanup; their case counts are unchanged and no snapshots changed. The Core
and WebGPU package selection passed 3,565 tests with 1 skipped and 2 todo.
Both package TypeScript checks, targeted ESLint, and Prettier checks passed.
The two edited test files shrunk by 118 lines in total.

Tentative commit: `test: simplify redundant wrapper coverage`

## Milestone 3: Replace fragile internal and snapshot checks

Status: completed. The 15,273-line shared-example and 2,417-line layout
snapshots were removed. All 204 offline examples still initialize and contain
a visual unit; two focused checks cover template expansion and relative URL
wiring. The layout suite now checks representative geometry and shared guides
across eight examples. Three flow-builder tests assert collected rows, source
overrides, and branch isolation instead of internal child paths. The cross
case is covered by the existing headless spec test in `cross.test.js`.
Generated GLSL snapshots remain because the fake GL helper captures source but
does not compile it; deleting those variants would lose coverage before a
reliable compiler or rendering oracle exists.

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

Run focused suites for each changed subsystem. For uncertain or high-risk
replacements, try one small, reversible mutation tied to the claimed contract
and confirm that the surviving assertion fails. Run the full unit suite after
broad snapshot or generated-example changes. Use browser/GPU checks only for
rendering contracts that headless tests cannot establish, and document any
local environment limitation.

First-pass verification: the focused example run passed 209 tests (including
three SVG example tests selected by the path filter). A temporary change to
`UrlSource.baseUrl` made the new URL assertion fail; restoring it made the test
pass. The full unit suite passed 4,420 tests with 1 skipped and 2 todo across
497 files. Core TypeScript, targeted ESLint, and Prettier checks passed.

Final-pass verification: focused flow-builder, cross-transform, and layout
suites passed 101 cases before the final full run. Temporarily removing the
flow builder's defensive clone made the branch-isolation assertion fail with
an extra `x` field on a sibling row; the source was restored. The full unit
suite then passed 4,413 tests with 1 skipped and 2 todo across 497 files.
Core TypeScript and targeted ESLint passed.

Actual commits: `3669a9074 test(core): replace broad example hierarchy snapshots`
and `099062a25 test(core): assert flow and layout behavior`.

Review gate: inspect the surviving assertion set and representative snapshot
diffs before removing generated GLSL or broad example coverage.

## Milestone 4: Integrate and document the result

Status: completed. `findings.md` reconciles every ranked candidate with the
implemented assertions and retained coverage. The existing CI Playwright
upload scenario now verifies visible rendered marks as well as dataflow
publication. Ten zero-size flex-layout cases retain their forward and reverse
expectations in one labeled table. No new `AGENTS.md` rule was needed.

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
- Inspect the existing CI Playwright check at
  `packages/playground/tests/upload.playwright.js`: it verifies upload and
  dataflow publication through the Playground, but does not assert rendered
  output. Add at most one representative stack startup/render smoke scenario
  if no existing browser check already covers that gap. Add further browser
  tests only for a concrete browser-specific contract without a cheaper
  trustworthy check; record runtime before expanding this layer.
- Update repository testing guidance only if the audit reveals a concrete
  rule that the current `AGENTS.md` does not already express.

### Verification

Run `npm test -- --reporter=agent`, relevant workspace TypeScript checks, and
lint. Run affected browser or GPU checks if the suite changes browser-specific
coverage. Compare the final file/case/snapshot inventory with the baseline and
report the net maintenance change without treating the count as a quality score.

Actual verification: all 497 root Vitest files passed with 4,413 passing
tests, 1 skipped, and 2 todo; the baseline collection had 4,418 runnable
cases. Workspace TypeScript checks, repository lint, targeted test-file ESLint,
Prettier, and `git diff --check` passed. The CI Playground Playwright scenario
passed with the rendered-pixel check. Temporarily changing its red mark to
blue made that check fail, then the restored test passed. A focused Core WebGL
smoke run for `examples/core/first.json` passed. The two snapshots removed
17,690 serialized lines, while edited test source files shrank by 163 lines.

Tentative commit: `test: finalize focused subsystem coverage`

## Risks and decisions

- A verbose test may be the only guard for a bug-prone edge case. Require
  candidate-specific evidence and preserve or replace unique assertions.
- Snapshot size overstates waste when one snapshot checks a broad pipeline.
  Assess the failure modes before shrinking or deleting it.
- Real WebGL/WebGPU validation may need CI facilities unavailable to a local
  headless run. Do not claim equivalent coverage from a mock that always
  reports compile success.
- The Playground upload check now inspects rendered pixels in its existing CI
  scenario. One local Playwright run completed in 1.9 seconds; no additional
  browser scenario or screenshot baseline was added.

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

## Final reconciliation

All four milestones are complete. The proposed generated-GLSL snapshot
replacement is discarded for this audit because no reliable per-variant
compiler or rendering oracle covers it; the existing snapshot stays. The
GraphRuntime order/disposer-count and WebGPU definition-identity checks stay
after review. The broad inventory does not claim a case-by-case audit of every
test; future feature work should apply the existing testing guidance to its
affected area. This reconciled record is ready to commit before retiring the
temporary plan files in a separate commit.

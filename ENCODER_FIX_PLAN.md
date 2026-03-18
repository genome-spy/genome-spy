# Encoder Fix Plan

## Scope

This plan covers selection-driven conditional encodings, the internal
`accessor` / `encoder` design around them, and shader-source snapshot coverage
needed to refactor safely.

Out of scope for now:

- Arbitrary `test` predicates

The goal is to:

- make JavaScript-side encoder evaluation behave like the shader path for
  selection predicates so that `encoder(datum)` becomes the authoritative
  host-side contract
- clarify and, where useful, reshape the internal division of responsibility
  between `accessor` and `encoder`
- add shader-source snapshot tests so refactoring can proceed without silently
  changing generated GLSL

## Target Semantics

The implementation should match Vega-Lite-style behavior for selection
conditionals as closely as practical:

- Conditions are evaluated in order
- The first matching condition wins
- The outer channel definition is the fallback branch
- `empty` defaults to `true`
- `empty: false` is respected
- Point selections work correctly
- Interval selections work correctly
- Conditional field/datum/value branches behave consistently in host-side
  encoding and scale/domain extraction

GenomeSpy's internal selection objects do not need to match Vega-Lite's data
structures. Only the resulting conditional-encoding behavior needs to align.

## Execution Rules

After each implementation step:

1. Run the focused tests for that step.
2. Fix any regressions before moving on.
3. Commit the completed step as its own commit.
4. Revise this plan to reflect what was learned, what changed, and what remains.

Do not batch multiple steps into one commit unless a later step turns out to be
too tightly coupled to split cleanly.

If a step reveals a meaningful clarification or refactoring opportunity in the
`encoder` / `accessor` split:

1. Record it in this plan under the step that exposed it.
2. Do not fold the refactor into the current step unless it is necessary for
   correctness.
3. Summarize the opportunity separately and ask for explicit user approval
   before broadening scope, unless the refactor is already within the agreed
   plan and directly supports the encoder repair.

## Step 1 Notes

Current baseline status:

- `npx vitest run packages/core/src/encoder/accessor.test.js packages/core/src/encoder/encoder.test.js packages/core/src/tooltip/dataTooltipHandler.test.js`
  passes, with the existing conditional encoder/accessor suites still skipped
- `npx vitest run packages/core/src/view/view.test.js packages/core/src/scales/scaleResolution.domain.test.js`
  passes

Canonical documented fixtures chosen for the first pass:

- `examples/docs/grammar/parameters/interval-selection.json`
  - point mark
  - interval selection
  - conditional value branch on color
- `examples/docs/grammar/parameters/point-selection.json`
  - rect mark
  - point selections
  - conditional value branches, including ordered conditions
- `examples/docs/grammar/parameters/penguins.json`
  - point mark
  - interval selection
  - conditional field branch with scale on color
  - use only the scatter-plot branch for focused testing and snapshots

Initial `accessor` / `encoder` findings:

- `Accessor` currently carries both raw-source responsibilities and
  conditional-predicate responsibilities.
- `Encoder` currently acts both as a scale wrapper and as an implicit
  conditional branch resolver through ordered `accessors[]`.
- `createSelectionPredicate(...)` needs full encoding context, which is a sign
  that predicate construction may not fit naturally inside low-level accessor
  creation.
- `dataAccessor` and `scale` on conditional encoders collapse branch-specific
  state into a single representative property, which is convenient for callers
  but conceptually unclear.
- Shader generation already treats branch ordering as a first-class concern,
  which argues for a more explicit branch model on the JavaScript side as well.

## Step 1: Lock Down Expected Behavior And Current Responsibilities

Write down the exact behavior the repaired JavaScript encoder must have.

Tasks:

- Enumerate supported conditional forms in GenomeSpy:
  - field with conditional value(s)
  - datum with conditional value(s)
  - value with conditional field/datum/value
- Enumerate supported predicate sources:
  - point selections
  - multi-point selections if relevant to host-side evaluation
  - interval selections
- Compare GenomeSpy semantics against local Vega-Lite references and record any
  intentional differences.
- Review the current division of responsibility between `accessor` and `encoder`
  and record any places where the contract is unclear, overlapping, or working
  against the conditional-encoding fix.
- Identify which generated shader behaviors must remain stable during the
  refactor and which ones are allowed to change only intentionally.
- Identify the minimum set of files that define current behavior:
  - `packages/core/src/encoder/accessor.js`
  - `packages/core/src/encoder/encoder.js`
  - `packages/core/src/selection/selection.js`
  - `packages/core/src/marks/mark.js`
  - `packages/core/src/gl/glslScaleGenerator.js`

Tests to run:

- No new behavior yet. Run the current focused suites to establish a baseline:
  - `npx vitest run packages/core/src/encoder/accessor.test.js`
  - `npx vitest run packages/core/src/encoder/encoder.test.js`
  - `npx vitest run packages/core/src/tooltip/dataTooltipHandler.test.js`

Commit:

- Commit only documentation and plan updates produced by this step.

Plan revision:

- Update this file with any clarified constraints before Step 2.
- Add any `accessor` / `encoder` clarification findings discovered during the
  baseline audit.
- Note which marks/spec patterns should be included in shader snapshots.

## Step 2: Add Shader Snapshot Coverage Before Refactoring

Add tests that snapshot the generated shader source for representative marks so
that internal refactoring cannot silently change GLSL output.

Tasks:

- Reuse documented conditional-encoding examples from
  `docs/grammar/parameters.md` and the example specs it references whenever
  practical.
- Prefer real documented examples over synthetic fixtures so snapshots reflect
  supported behavior.
- Add dedicated test-only fixture specs only if the docs examples are too broad,
  too noisy for stable snapshots, or do not isolate the needed conditional case.
- Add a focused shader snapshot harness around generated mark shader code.
- Capture the final generated vertex and fragment shader source after GenomeSpy
  code generation, not raw template files.
- Start with representative cases that exercise conditional encoding:
  - point mark with unconditional field encoding
  - point mark with selection-driven conditional value branch
  - point mark with selection-driven conditional field branch
  - at least one non-point mark if it shares the same conditional generation
    machinery
- Keep snapshots readable and deterministic.
- Prefer focused specs over broad kitchen-sink fixtures.

Tests to run:

- Run only the new shader snapshot suite for this step.

Commit:

- Commit the snapshot harness and initial snapshots as their own step.

Plan revision:

- Record whether the harness is sufficient or whether more coverage is needed
  before reshaping internals.
- Record which documented examples are being used as canonical conditional
  fixtures.

## Step 3: Add Missing Red Tests For Selection Conditionals

Add or unskip tests that describe the intended JavaScript-side behavior before
changing the implementation.

Tasks:

- Reuse the same documented parameter examples from Step 2 where they are
  suitable for behavior tests as well.
- If the docs examples are too integration-heavy for a unit-level assertion,
  derive minimal fixture specs from them rather than inventing unrelated cases.
- Unskip and repair the conditional accessor tests in
  `packages/core/src/encoder/accessor.test.js`.
- Unskip and repair the conditional encoder tests in
  `packages/core/src/encoder/encoder.test.js`.
- Add cases for:
  - condition order
  - fallback branch
  - `empty: true`
  - `empty: false`
  - point selection
  - interval selection
  - value-with-conditional-field
  - field-with-conditional-value
  - datum-with-conditional-value
- Keep tests tightly focused on host-side encoder behavior.

Tests to run:

- `npx vitest run packages/core/src/encoder/accessor.test.js`
- `npx vitest run packages/core/src/encoder/encoder.test.js`

Commit:

- Commit the new failing-or-now-passing expectation tests as their own step.

Plan revision:

- Update this file with any behavior discovered to be ambiguous or underspecified.
- Update whether the current `accessor` / `encoder` API shape is making test
  setup awkward in a way that should influence the refactor.
- Record whether the documented examples are sufficient for continued coverage or
  whether dedicated fixture specs are now justified.

## Step 4: Reshape `Accessor` And `Encoder` Responsibilities

Clarify and refactor the internal model before or while repairing conditional
evaluation so the resulting design is easier to reason about.

Tasks:

- Decide the intended role of `Accessor`.
  Likely direction:
  - raw source reader
  - source metadata carrier
  - domain/equality metadata carrier
- Decide the intended role of `Encoder`.
  Likely direction:
  - branch resolver
  - scale applicator
  - authoritative host-side encoded-value evaluator
- Introduce a clearer internal representation for conditional branches if that
  improves readability and correctness.
- Reduce or remove ambiguous properties whose meaning changes for conditional
  encoders.
- Preserve compatibility at call sites only as long as needed to complete the
  refactor safely.

Tests to run:

- `npx vitest run packages/core/src/encoder/accessor.test.js`
- `npx vitest run packages/core/src/encoder/encoder.test.js`
- Run the shader snapshot suite from Step 2

Commit:

- Commit the responsibility refactor as its own step.

Plan revision:

- Record the new internal contract clearly before predicate repair begins.

## Step 5: Repair Predicate Construction In The New Model

Fix JavaScript-side predicate construction so conditional accessors can actually
evaluate selection predicates instead of defaulting to constant `false`.

Tasks:

- Replace the stubbed parameter predicate in the refactored model.
- Place selection predicate construction where it best fits the clarified
  contract rather than preserving the old placement by inertia.
- Ensure interval selections resolve the correct fields from the active
  encoding.
- Ensure point and multi-point selections use the correct datum membership
  semantics.
- Keep predicate metadata (`param`, `empty`) intact for shader generation.

Tests to run:

- `npx vitest run packages/core/src/encoder/accessor.test.js`
- `npx vitest run packages/core/src/encoder/encoder.test.js`

Commit:

- Commit the predicate-construction repair separately.

Plan revision:

- Note whether any remaining gaps are in predicate creation or branch
  application.
- Re-check shader snapshots and record any intentional changes if they occurred.

## Step 6: Make `encoder(datum)` Authoritative

Ensure host-side encoder evaluation applies the same branch selection semantics
that the shader path already uses.

Tasks:

- Repair `createSimpleOrConditionalEncoder()` in
  `packages/core/src/encoder/encoder.js` if needed.
- Verify that the selected branch:
  - uses the correct accessor
  - applies the correct scale
  - falls back correctly when no condition matches
- Verify that branch order matches spec order.
- Keep the single-accessor fast path intact.

Tests to run:

- `npx vitest run packages/core/src/encoder/encoder.test.js`
- `npx vitest run packages/core/src/tooltip/dataTooltipHandler.test.js`
- Run the shader snapshot suite from Step 2

Commit:

- Commit the encoder-evaluation repair separately.

Plan revision:

- Record whether tooltip still needs a workaround after this step.
- Record whether the new internal model should be simplified further or is good
  enough to stabilize.

## Step 7: Reconcile With Scale And Domain Plumbing

Verify that repaired host-side encoder semantics do not break existing
scale/domain behavior.

Tasks:

- Confirm that conditional branches still contribute correctly to domains.
- Confirm that domain keying and deduplication still behave correctly.
- Review any assumptions in:
  - `packages/core/src/view/unitView.js`
  - `packages/core/src/scales/domainPlanner.js`
  - `packages/core/src/scales/scaleResolution.domain.test.js`
- Add tests if the repaired encoder path exposes hidden coupling.

Tests to run:

- `npx vitest run packages/core/src/view/view.test.js`
- `npx vitest run packages/core/src/scales/scaleResolution.domain.test.js`
- Run the shader snapshot suite from Step 2 if any shader-generation code was
  touched during this step

Commit:

- Commit any required domain/scale fixes separately.

Plan revision:

- Document any remaining divergences between host-side evaluation and
  scale-domain handling.

## Step 8: Remove Tooltip-Specific Conditional Logic

Once `encoder(datum)` is trustworthy, remove the temporary tooltip-local branch
resolver.

Tasks:

- Simplify `packages/core/src/tooltip/dataTooltipHandler.js` so it relies on the
  normal encoder contract.
- Keep tooltip behavior correct for point marks.
- Retain the regression test that motivated this work.

Tests to run:

- `npx vitest run packages/core/src/tooltip/dataTooltipHandler.test.js`
- `npx vitest run packages/core/src/encoder/encoder.test.js`
- Run the shader snapshot suite from Step 2 to confirm no accidental GLSL drift

Commit:

- Commit the tooltip cleanup separately.

Plan revision:

- Mark the temporary workaround as removed.

## Step 9: Broaden Regression Coverage

Make sure selection-conditional behavior is protected from future regressions.

Tasks:

- Add at least one higher-level regression case that exercises a real mark/view
  pipeline rather than only isolated helpers.
- Cover both:
  - a conditional value branch
  - a conditional field/datum branch
- Prefer a test shape close to the penguins failure mode and other documented
  parameter examples.
- Reuse the docs-driven fixture specs established earlier unless a new
  test-specific case is clearly necessary.

Tests to run:

- `npx vitest run packages/core/src/tooltip/dataTooltipHandler.test.js`
- `npx vitest run packages/core/src/view/view.test.js`
- Add and run any new focused suite introduced by this step
- Run the shader snapshot suite from Step 2 if the new regression tests touch
  shader-producing paths

Commit:

- Commit regression tests as their own step.

Plan revision:

- Record any remaining weak spots not covered by tests.

## Step 10: Final Verification And Cleanup

Verify the repaired implementation as a whole and leave the branch in a clean
state.

Tasks:

- Remove obsolete comments and TODOs related to the old stubbed behavior.
- Re-check nearby docs/comments for accuracy.
- Review whether any skipped tests can now be unskipped permanently.
- Summarize any deferred refactoring opportunities in the `accessor` / `encoder`
  design and present them as optional follow-up work.
- Decide whether the shader snapshot suite should be extended further now or
  left intentionally minimal.

Tests to run:

- `npx vitest run packages/core/src/encoder/accessor.test.js`
- `npx vitest run packages/core/src/encoder/encoder.test.js`
- `npx vitest run packages/core/src/tooltip/dataTooltipHandler.test.js`
- `npx vitest run packages/core/src/view/view.test.js`
- `npx vitest run packages/core/src/scales/scaleResolution.domain.test.js`
- Run the shader snapshot suite from Step 2

Commit:

- Commit final cleanup as the last implementation step.

Plan revision:

- Replace this execution plan with a brief status summary or append a final
  completion section documenting the outcome.

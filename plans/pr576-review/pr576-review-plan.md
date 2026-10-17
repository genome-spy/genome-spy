# PR #576 review fixes and testing plan

Status: completed. Fix committed as `d856ad5e`; retire this file in the next cleanup commit.

Reviewed on 2026-10-17 against `codex/embed-data-primitives` at `852d597a`.
PR: https://github.com/genome-spy/genome-spy/pull/576

## Review requests

1. [Read all available data](https://github.com/genome-spy/genome-spy/pull/576#discussion_r4302199276):
   add a way to read loaded transformed records without a viewport or brush constraint.
2. [Check record-identity side effects](https://github.com/genome-spy/genome-spy/pull/576#discussion_r4302331420):
   explain and verify `Mark.requiresRecordIdentity()`, including its effects beyond the setter.

This is a focused review-fix plan, not a new analysis API design. Architecture references:
`ARCHITECTURE.md`, `packages/core/ARCHITECTURE.md`, and the Core views/dataflow,
rendering, and reactivity documents.

## Findings and baseline

- `Mark.requiresRecordIdentity()` is used by both encoding preparation in
  `packages/core/src/marks/mark.js` and identifier insertion in
  `packages/core/src/view/flowBuilder.js`. These decisions must agree.
- The setter resolves public keys to collector rows. Native single selections store
  an internal unique ID; multi selections use that ID as their map key. Without IDs,
  multi membership can collapse and CPU/GPU predicates cannot distinguish rows.
  IDs are therefore necessary even when the selected source does not support picking.
- The current helper searches every data ancestor for any point-selection declaration.
  This is broader than actual selection use and does not account for shadowing.
  Adding an ID path can add cloning, ID allocation, the collector's unique-ID index,
  and a GPU attribute; it must not implicitly enable picking.
- **Confirmed side effect:** a headless, implicitly wrapped layer with an x axis,
  `tooltip: null`, and a root point selection gives identity encodings to four
  generated axis marks (domain, ticks, labels, title). Without the selection none
  have identity encodings. Picking remains disabled in both cases. Nonempty guide
  rows now pass through identity assignment even though they are not selected data.
  This is the primary regression to reproduce permanently before narrowing the rule.
- `embedDataApi.test.js` covers point/text/rect membership and CPU appearance with
  inherited selection and disabled picking. `embedSelection.playwright.js` asserts
  SVG output, not WebGL pixel correctness. Keep that distinction explicit.
- Fresh baseline: **51 tests passed** across `embedDataApi.test.js`,
  `flowBuilder.test.js`, `marks/mark.test.js`, and `unitView.test.js`.
  This establishes the baseline; it does not establish absence of side effects.

## Goals and boundaries

- Add explicit `readData({ scope: "all", limit })`, preserving required row limits,
  clone semantics, truncation, readiness checks, and existing scoped behavior.
  "All" means the current unit collector's loaded transformed output, not all remote
  source data. It must work without continuous/unconditional positional encodings.
- Preserve mark-independent key-based writes, including inherited point selections
  on authored data views with picking disabled. A conditional encoding is not a
  prerequisite: apps may select records just to read membership or use a filter.
- Narrow identity work where it cannot serve picking or a supported point selection,
  especially generated guides. Respect effective lexical declarations and existing
  identities. Explain the reason in JSDoc and the review response.
- Reuse current mechanisms. No selection representation redesign, new scheduler,
  serialization/Flechette, spatial indexing, ID allocator overhaul, or changes to the
  existing selected-record getter. Do not add a persistent resource-monitoring API.

## Milestone 1: complete the readback contract

Outcome: every loaded transformed record is accessible independently of geometry.
Affected: `viewMutationApi.js`, `types/embedApi.d.ts`, readback tests, embedding docs,
generated API references, and the small `dataReadback` example. Downstream: #578
calls `readData()` to capture analysis input.

- [x] Add the explicit `"all"` scope before positional-predicate construction; retain
      validation of limits, unit views, readiness, and live handles.
- [x] Extend the existing readback test fixture with records outside a zoomed viewport
      and brush. Verify `"all"` returns all transformed outputs, not filtered raw inputs.
- [x] Cover nominal positions and a conditional or absent positional encoding:
      `"all"` succeeds without evaluating projection requirements; existing scoped
      reads retain their current documented restrictions.
- [x] Verify empty results, zero limit, exact limit, overflow, internal-ID omission,
      nested clone isolation, and current records after dataset replacement. Reuse
      existing assertions where they already establish the unchanged contract.
- [x] Update type/API docs, PR notes, and the existing example's scope control and
      loaded-data explanation. Do not add another example or change scoped semantics.

Acceptance: explicit all-data reads return bounded, independent copies of the current
transformed collector, including off-screen records; viewport/brush regressions pass.
Tentative commit: `feat(core): allow readback of all loaded transformed records`.

## Milestone 2: verify and narrow record-identity effects

Outcome: point selection works without picking, while unrelated rendering/dataflow
paths retain their prior behavior. Affected: `mark.js`, `flowBuilder.js`, relevant
selection/rendering code only if a regression demonstrates a need, and adjacent tests.
Downstream consumers include generated guides, Canvas2D/SVG, WebGL, the experimental
WebGPU adapter, App metadata views, and #578's isolated analysis flow.

Implement the smallest correction after establishing these contracts. Do not simply
revert the helper or gate IDs on appearance conditions: that would break valid setters.
Do not broaden interactive picking to solve identity availability.

### Permanent regression coverage

| Risk                                    | Test through the real path                                                                                                                            | Required result                                                                                                                                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated guides acquire IDs            | Initialize a wrapped spec with axes and a legend, with/without a root point selection; inspect generated guide collectors and encodings               | Authored source remains selectable; guide-only rows do not acquire selection-only IDs, indexes, or picking participation. Make the axis regression fail on the reviewed commit.                                                                                     |
| Identity is missing where needed        | Extend `embedDataApi.test.js` for inherited single/multi selections, point/text/rect, `tooltip: null`, including a view without appearance conditions | Several selected keys remain distinct; single membership is active; CPU predicates and snapshots agree; picking stays disabled where it was disabled.                                                                                                               |
| Ordinary plots pay extra costs          | Compare no-selection and interval-only, non-picking specs against a point-selection spec; include default tooltip-enabled picking                     | Noninteractive/interval-only rows have no newly assigned IDs; existing picking retains valid IDs and hits. Point selection has only the identity work it needs.                                                                                                     |
| Lexical scope is bypassed               | Nearest plain/interval declaration shadows an ancestor point selection; separate sibling/source branches                                              | No write reaches the shadowed owner; a different accessible point selection still works. Decide identity need from effective capabilities, not just any ancestor declaration.                                                                                       |
| Branch data gets mutated or IDs collide | Shared source with a selected branch and an independent sibling; aggregate output, explicit identifier, and one faceted/replayed case                 | Input/sibling user fields and keys are unchanged; selected output IDs are distinct nonzero integers; valid existing identities are not reassigned unnecessarily; grouping/sorting are unchanged. Do not promise cross-branch linking that the API does not support. |
| Updates accumulate identity work        | Dataset replacement and one view remove/re-add cycle using existing lifecycle tests                                                                   | Re-selection uses current rows; no duplicate identity stages on the live path, no orphaned flow branches, and no stale handle writes. Existing selection-after-replacement policy stays explicit.                                                                   |

Place these checks beside the existing mark, flow builder, embed API, and facet tests;
extend representative fixtures rather than creating a large Cartesian matrix. Treat
ID/clone-stage assertions as a deliberate performance/resource contract, paired with
public membership and data-isolation assertions, not arbitrary graph snapshots.

### Rendering and interaction coverage

- [x] Extend the existing Playwright fixture to check actual WebGL output after
      initial empty membership, selecting A, replacing with B, clearing, and selecting
      multiple rows. Include single-selection uniform and multi-selection texture
      paths with inherited ownership. Use stable interior pixels or regional color
      assertions; wait for completed rendering. SVG export is a separate CPU oracle.
- [x] Retain representative point/text/rect coverage. Verify no console/shader errors;
      selecting IDs while picking is disabled does not make those marks pickable.
      Include an enabled-picking case with click -> API set/clear -> click to ensure
      the existing interactive behavior and read-only explicit pick API remain sound.
- [x] Use existing SVG DOM assertions and Canvas2D/software-picking tests for the same
      semantic fixture. Run the WebGPU adapter's selection/identity tests because it
      consumes the shared encodings; record a browser WebGPU check only if available.
      Do not claim a WebGPU browser pass based on adapter tests.
- [x] In a temporary browser probe, count collector publications and renderer data
      uploads around repeated selection writes: only membership-dependent work should
      change. Capture an initial-load comparison for a moderately large synthetic
      dataset with an inherited selection and a no-selection control. Separate required
      source ID/index costs from generated-guide costs; avoid flaky timing assertions
      and do not promise constant-time setup or a 10-million-point scalability result.

Acceptance: a failing guide regression passes after the fix, authored non-picking
sources remain selectable, source isolation and picking stay correct, and real WebGL
appearance agrees with CPU export. Document measured overhead and remaining limits.
Tentative commit: `fix(core): restrict selection identity work to eligible data views`.

## Verification and review gate

- [x] Run focused suites first with Vitest's `agent` reporter: the four baseline files,
      `paramRuntime/embedParamApi.test.js`, `selection/selection.test.js`,
      `data/collector.test.js`, and the relevant facet/lifecycle tests modified above.
      Review existing tests for duplication and assertions that merely mirror the helper.
- [x] Run `embedSelection.playwright.js` through the Playground's `test:e2e` script;
      verify the selected renderer is WebGL for GPU checks. Smoke-test `dataReadback`:
      zoom, brush, all-data read, keyed highlight, clear, and dataset replacement.
- [x] Run the existing immediate/SVG, Canvas2D picking, and WebGPU adapter suites
      affected by shared identity encodings. Before delivery run the full unit suite,
      workspace type checks, lint, API generation, example build, and release checks.
- [x] Rebase/update the stacked #578 worktree only during fix implementation, then run
      its `embedTransformApi.test.js` and `types/transformData.test.js` and brushed
      `transformAnalysis` example. Its input-overflow check and live-data isolation must
      remain intact. Extending its public analysis scope to `"all"` is a separate explicit
      decision; do not widen it accidentally while changing readback.
- [x] Review the resulting diff at the shared identity boundary and explain to the
      reviewer why IDs are needed, what was narrowed, and what the tests demonstrate.
      Three requested Sol reviews completed with no actionable findings. No review
      reply was posted; PR metadata records the behavior and verification.

## Decisions to settle during implementation

- Which existing view/capability boundary reliably excludes generated guides while
  retaining authored non-picking sources? Inspect data-parent ancestry and App metadata
  consumers; avoid a list of renderer-specific exceptions in the shared mark class.
- Nearest declarations can shadow individual selection names. Keep an unreferenced but
  accessible point selection eligible for API writes; do not confuse lack of an
  appearance condition with lack of a selection capability.
- `IdentifierTransform` already has a global reservation map with lifecycle TODOs.
  Avoid expanding that known cost into guide-only branches. If investigation finds an
  independently reproducible allocator leak, record it separately rather than growing
  this review fix into an allocator rewrite.

## Plan retirement at fix delivery

- [x] Reconcile every unchecked task: complete it with verification evidence, or mark
      it explicitly discarded with a reason. Record any unavailable renderer check.
- [x] Commit the reconciled plan with the implemented fix(es), preserving its final
      status in Git history. Update the existing changeset as appropriate.
- [x] Immediately delete this plan and its otherwise empty directory in a later cleanup
      commit: `chore: retire PR 576 review plan`. This is the explicit retirement
      disposition; the cleanup commit follows this completion record.

## Completion evidence

- `scope: "all"` reads current loaded transformed records; the example, public types,
  generated reference, guide docs, and existing minor changeset were updated.
- Guide exclusion uses the existing `isInChromeSubtree` boundary. Inherited declaration
  lookup uses nearest authored configs, respecting shadowing and retaining API writes
  without appearance conditions. Local picking checks do not allocate a shadow-name set
  or normalize selection configurations on each call.
- Axis/legend and shadowing regressions failed before the fix and passed afterward.
  Added branch/aggregate/explicit-ID replay, facet selection, and remove/reinsert
  coverage. Existing ordinary-picking and interactive-selection tests remain covered.
- Full unit suite: **5,021 passed**, one skipped, two todo, across 532 files. After the
  final allocation simplification, the affected runtime/readback/identity suites passed
  **92 tests** and Core type checking passed again.
- Browser suite: **8 passed**, explicitly exercising WebGL and Canvas2D raster output
  plus SVG for point/text/rect marks, single/multi membership, replacement, clearing,
  and disabled picking. Browser-test lint and commit hooks passed.
- Real browser example smoke: initial group summaries, zoomed viewport B/D, all-data
  read of four summaries, cleared brush, and a brush returning A/C independently of
  the viewport. Dataset replacement and key re-selection passed. No page errors.
- Enabled picking: explicit pick returned a hit without changing selection; real
  click -> API set/clear -> click selected the expected row each time.
- Temporary 100,000-row probe: control assigned 0 IDs; inherited point selection
  assigned exactly 100,000 source IDs. Repeated writes caused **0 collector publications
  and 0 vertex/index-buffer uploads**. Ordinary per-draw uniform updates were excluded.
  Observed startup was 86 ms for control and 303 ms with selection in this one software
  WebGL run; these include shader/index setup and are observations, not benchmarks or
  a scalability guarantee. No generated-guide identity work was added.
- Workspace types, source lint, generated API references, example `build:smoke`,
  formatting, release checks and commit hooks passed. Existing fixed-group minor
  release intent is unchanged; no versioning/publishing operation was performed.
- Rebased #578 onto the fix. Its API/schema suites passed **7 tests**, Core types
  passed, and `transformAnalysis` produced B(2,4), C(2,2.5), D(3,4), then cleared.
  Corrected a test-only named Ajv import in #578 for NodeNext constructibility.
- All existing immediate/SVG, Canvas2D picking, and WebGPU adapter tests passed in the
  full suite. **Discarded optional live WebGPU check:** this headless browser returned
  no WebGPU adapter. No WebGPU browser rendering pass is claimed.
- Three Sol reviewers examined identity/dataflow, test quality/rendering, and public
  API/docs/example consistency. No actionable findings. Their independent Vitest
  reruns were sandbox-blocked; validation above was run by the parent with worktree
  cache access. No additional review gates remain.
- No unresolved design decision or functional task remains. The retirement cleanup
  removes this temporary record after its completed state is committed.

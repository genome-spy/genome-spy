# Agent Benchmarking Plan

This note reflects the benchmark implementation that currently lives under
`packages/app-agent/benchmarks/`.

The benchmark takes inspiration from GAIA, SWE-bench, and newer
process-oriented agent benchmarks:

- evaluate the task in the real GenomeSpy environment
- log the full trajectory instead of only the final answer
- allow multiple valid paths to success
- score process progress with intermediate semantic checks, not just the end
  state
- report rubric scores across task-specific dimensions

The guardrails remain the same:

- keep the implementation minimal
- keep the Playwright runner generic across visualizations
- reuse existing GenomeSpy runtime, validation, and execution code
- avoid benchmark-only copies of agent logic

If this note and the code disagree, prefer the simpler implementation.

## Current Implementation

The benchmark consists of:

- `packages/app-agent/benchmarks/run.mjs`
- `packages/app-agent/benchmarks/README.md`
- `packages/app-agent/benchmarks/cases/`
- `packages/app-agent/benchmarks/plan/benchmarking.md`

The runner is already runnable and supports:

- headless or interactive execution
- connection to an already running app dev server
- connection to an already running relay server
- automatic app dev server startup when `--app-url` is omitted
- suite filtering by case id
- suite filtering by case mode
  - `all`
  - `action`
  - `description`
- optional browser warning suppression
- optional screenshots
- configurable delay between cases
- configurable delay before preflight retries
- rubric evaluation with structured criteria
- JSON case and suite outputs

Interactive mode opens the real chat panel and keeps the browser open until
Enter is pressed in the terminal.

## Runner Behavior

For each case, the runner currently:

1. loads the requested route/spec if needed
2. waits until the app, sample hierarchy, and agent preflight are ready
3. removes blocking bookmark-tour overlays
4. reuses the already loaded visualization when possible
5. restores defaults and rolls provenance back before the case
6. resets the `AgentSessionController` so earlier cases do not leak context
7. optionally opens the real chat panel in interactive mode
8. sends the prompt through the real browser-side agent session
9. captures the transcript snapshot
10. reads deterministic app state for verification
11. writes `result.json` and optional screenshots
12. writes `suite-result.json`

If a turn ends as an empty final answer with no intent actions and no plot
records, the runner resets the case and retries once. Empty provider answers
are also treated as relay errors instead of valid assistant responses.
The relay also retries once on upstream rate-limit responses and respects the
provider's suggested wait time when it is present.

This runner intentionally reuses the real browser agent runtime instead of
creating a benchmark-specific execution path.

## Current Suite Coverage

There are currently two tracked visualization suites:

- `cases/fuse-encode.json`
- `cases/genomespy-paper-2024.json`

Both suites now mix:

- a very small descriptive smoke layer
- multi-step action cases

The action cases exercise newer tool and intent-action surface such as:

- `searchViewDatums`
- `resolveMetadataAttributeValues`
- `getSelectionFeatureFieldSummary`
- `zoomToScale`
- `getIntentActionDocs`
- `jumpToInitialProvenanceState`
- `showCategoryCountsPlot`
- `showAttributeDistributionPlot`
- `showAttributeRelationshipPlot`
- `sampleView/groupByThresholds`
- `sampleView/groupToQuartiles`
- `sampleView/groupCustomCategories`
- `sampleView/removeUndefined`
- `sampleView/removeGroup`
- `sampleView/retainFirstOfEach`
- `sampleView/retainCategoriesByAttribute`
- selection-driven `paramProvenance/paramChange`
- selection-driven metadata materialization via `sampleView/deriveMetadata`

## Benchmark Contract

### Suite Root

The suite root contains:

- `visualizationId`
- `setup`
- `cases`

### Case Shape

Each case may contain:

- `id`
- `prompt`
- `difficulty`
- optional `ambiguityLevel`
- `taskType`
- `outcomeType`
- optional `setup`
- `rubric`
- `oracle`

The `rubric` block is the required evaluation contract for every case.

`ambiguityLevel` is optional metadata used to distinguish between:

- explicit prompts that spell out the intended steps
- simple prompts that name the operation but not the implementation
- ambiguous prompts that resemble more realistic user requests and require the
  agent to infer the tool/action sequence

### Shared Subgoal Kinds

Rubric requirement checks and answer-grounding checks use these semantic
subgoal kinds:

- `toolCalled`
- `toolCalledAnyOf`
- `contentKind`
- `intentActionExecuted`
- `intentActionExecutedAnyOf`
- `intentActionPayloadValue`
- `selectionAggregationUsageValue`
- `plotShown`
- `selectionAggregationFieldCount`
- `metadataAttributePresent`
- `groupByAttributes`
- `sortByAttribute`
- `visibleSampleCount`
- `zoomedScale`
- `viewVisibility`
- `finalAnswerContainsAny`
- `provenanceActivation`

These checks are intentionally semantic and state-oriented. They do not require
one exact serialized tool trace.

### Rubric Shape

The rubric is the primary case contract. It specifies minimum task-relevant
requirements instead of an exact final visualization state. Extra harmless
state is allowed unless it prevents the required checks and grounded answer from
passing.

Structured rubrics contain:

- `version`
- `initialState`
- `requirements`
- optional `validAlternatives`
- `efficiency`
- `scoring`

`requirements` may contain:

- `state`: minimum task-relevant state checks
- `tools`: required tool calls
- `actions`: required intent actions
- `artifacts`: required generic analysis artifacts
- `checks`: lower-level semantic checks when needed

Supported generic artifact kinds include:

- `sampleAttributePlot`
- `metadataSummary`
- `metadataValueResolution`
- `selectionSummary`
- `derivedMetadataAttribute`
- `searchResult`
- `zoomResult`
- `datumLookup`
- `provenanceActivation`
- `viewVisibility`

The runner converts this structure into weighted criteria:

- `requirements`
- `state`
- `artifacts`
- `answer`
- `efficiency`

This maps the BiomniBench idea to GenomeSpy without copying its biomedical data
analysis categories directly. Useful GenomeSpy dimensions are:

- minimum required visual-analytics process
- minimum task-relevant visualization state
- generic helper artifacts
- grounded answer interpretation
- efficiency and recovery behavior

The same deterministic subgoal checks are reused inside rubric requirements.
Rubric-only efficiency checks currently include `maxRejectedToolCalls`,
`minToolCalls`, `maxToolCalls`, `minIntentActions`, and `maxIntentActions`.

### Oracle Shape

The oracle is reserved for expected user-facing answers.

`expectedAnswer` currently supports:

- `mustContainAny`
- `mustContainAll`
- `mustNotContain`
- `mustContainNumberCountAtLeast`
- `mustContainComparisonSignal`
- `mustMentionGroupsWithNumbers`
- `factSlots`
- `numericSlots`
- `requiredStateForAnswer`

## Evaluation Model

The current benchmark uses:

- rubric criteria
- final answer checks from `oracle.expectedAnswer`

When a case expects a user-facing answer, keep that expected answer in
`oracle.expectedAnswer`. The rubric answer criterion uses that oracle answer by
default, so the right answer still participates in rubric scoring.

`requiredStateForAnswer` reuses the shared subgoal shapes for answer-bearing
cases. This makes it possible to accept a textual answer without requiring a
plot, while still ensuring the answer was grounded in the correct intermediate
state.

`intentActionPayloadValue` covers cases where the payload details matter. For
example, a benchmark can require a `sampleView/deriveMetadata` payload to use
`payload.attribute.aggregation` equal to `mean` or `weightedMean`.

`selectionAggregationUsageValue` covers cases where the resolved source behind
the used `SELECTION_AGGREGATION` candidate matters. For example, a copy-number
benchmark can require the used candidate to resolve to `view=CNV` and
`dataType=quantitative`.

A case passes when the required rubric criteria pass and the normalized rubric
score reaches `passingScore`.
Efficiency can lower the score without failing the case when `passingScore`
equals the normalized weight of the required non-efficiency criteria.

This means the benchmark is stricter than a pure outcome-only benchmark, but it
is still more flexible than an exact trace replay because multiple valid tool
paths can satisfy the same semantic checks.

## Output Shape

Each case result currently contains:

- `caseId`
- `prompt`
- `status`
- `checks`
- `rubric`
- `failedRequiredCriteria`
- `metrics`
- `evidence`

Current metrics include:

- `stepCount`
- `toolCallCount`
- `intentActionCount`
- `rejectedToolCallCount`
- `minToolCalls`
- `minIntentActions`
- `toolCallGap`
- `efficiencyGap`
- `rubricScore`
- `rubricTotalWeight`
- `rubricNormalizedScore`
- `durationMs`

Current evidence includes:

- `finalAnswer`
- `messages`
- `toolCallNames`
- `contentKinds`
- `intentActionTypes`
- `intentActions`
- `provenanceActions`
- `plotRecords`
- `analysisArtifacts`
- `initialState`
- `finalState`
- `appState`
- optional screenshot paths

The initial/final app-state snapshots currently include:

- `groupByAttributes`
- `sortByAttribute`
- `visibleSampleCount`
- `metadataAttributesPresent`
- `selectionAggregationFieldCount`
- `selectionAggregationCandidateIds`
- `zoomedScaleNames`
- `activeProvenanceState`
- `provenanceActionTypes`
- `provenanceActions`
- resolved `viewVisibility` entries requested by the case

## Reuse Boundaries

The benchmark should continue to reuse, not duplicate:

- the real browser-side `AgentSessionController`
- the real `agentAdapter` turn path
- the real context builders
- the real tool and intent execution path
- the real chat panel in interactive mode
- the real app reset/provenance-reset behavior

The benchmark should not duplicate:

- tool argument validation
- action schema validation
- intent execution semantics
- attribute summary logic
- selection aggregation logic
- provenance logic

## Design Direction

The current direction is:

- keep a small descriptive smoke layer
- spend most benchmark budget on multi-step action tasks
- favor representative capability coverage over redundant one-step variants
- use subgoal checks to reward planning progress

Good future additions are:

- more provenance-branching action tasks
- stronger checks for selection-driven derived metadata
- more coverage for context-tree expansion/collapse if those become important
- optional higher-level process scoring derived from subgoal completion ratios

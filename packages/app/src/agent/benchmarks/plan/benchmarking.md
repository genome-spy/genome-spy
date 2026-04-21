# Agent Benchmarking Plan

This note now reflects the benchmark implementation that exists under
`packages/app/src/agent/benchmarks/`.

The benchmark takes high-level inspiration from GAIA and SWE-bench:

- evaluate the real task result in the real environment
- log traces and artifacts for analysis
- avoid treating one exact action sequence as the only valid success path

The guiding constraints are still the same:

- keep the implementation small
- reuse existing GenomeSpy agent/runtime code
- avoid benchmark-local copies of validation, execution, context building, or
  metadata summary logic
- keep the Playwright runner generic across visualizations

If this note and the implementation disagree, prefer the simpler
implementation.

## Current Status

The current benchmark implementation consists of:

- `packages/app/src/agent/benchmarks/run.mjs`
- `packages/app/src/agent/benchmarks/README.md`
- `packages/app/src/agent/benchmarks/cases/`
- `packages/app/src/agent/benchmarks/plan/benchmarking.md`

The runner is already runnable and supports:

- headless or interactive execution
- connection to an already running app dev server
- connection to an already running relay/agent server
- starting the app dev server automatically when `--app-url` is omitted
- suite filtering by case id
- suite filtering by case mode
  - `all`
  - `action`
  - `description`
- optional suppression of browser warnings in CLI output
- JSON results and optional screenshots

Interactive mode currently does more than just show the browser:

- opens the real GenomeSpy agent chat panel
- leaves the browser open until Enter is pressed in the terminal

## Implemented Runner Behavior

The runner currently does the following for each case:

1. loads the requested visualization route/spec if it is not already loaded
2. waits until the app and sample hierarchy are ready
3. removes blocking bookmark-tour overlays
4. initializes the real browser-side `AgentSessionController`
5. restores visualization defaults and rolls provenance back
6. resets the agent session so previous cases do not leak context
7. optionally opens the real chat panel in interactive mode
8. sends the case prompt through the real agent controller
9. captures a snapshot of the controller transcript
10. reads a small amount of app state for deterministic verification
11. saves `result.json` and optional `before.png`/`after.png`
12. writes `suite-result.json` for the full run

The runner intentionally reuses the real browser runtime instead of creating a
benchmark-only agent path.

## Current CLI Surface

The runner currently accepts these flags:

- `--case-file`
- `--case-id`
- `--case-mode`
- `--app-url`
- `--agent-url`
- `--output-dir`
- `--interactive`
- `--screenshots`
- `--quiet-browser-warnings`
- `--timeout-ms`

The most important distinctions are:

- `--interactive` vs headless mode
- `--case-mode action` vs `--case-mode description`

That split is important because many runs are intended to measure tool use and
state changes rather than descriptive answer quality.

## Current Folder Shape

The benchmark folder is intentionally small:

- `cases/`
  - local benchmark suite JSON files
- `results/`
  - generated benchmark artifacts
- `plan/`
  - benchmark design notes
- `run.mjs`
  - CLI runner
- `README.md`
  - usage notes

Local benchmark state is intentionally kept out of git by default:

- `cases/` is gitignored
- `results/` is gitignored

This is deliberate because different users may maintain visualization-specific
local suites and local result artifacts.

## Current Benchmark Contract

### Runner Inputs

The runner currently takes:

- a suite JSON file
- an optional case id
- an optional case-mode filter
- app/agent server URLs
- interactive/headless choice
- screenshot capture choice
- output directory
- timeout

### Current Case Shape

Each case currently uses this compact data shape:

- `id`
- `prompt`
- `difficulty`
- `taskType`
- `outcomeType`
- `setup`
- `oracle`

The shared suite root currently includes:

- `visualizationId`
- `setup`
- `cases`

Example:

```json
{
  "visualizationId": "fuse_encode",
  "setup": {
    "route": "/",
    "specPath": "private/fuse_encode_gs/spec.json",
    "resetProvenance": true
  },
  "cases": [
    {
      "id": "fuse-encode.group_by_gender",
      "prompt": "Group by gender.",
      "difficulty": "one_step",
      "taskType": "metadata_only",
      "outcomeType": "state_change",
      "oracle": {
        "expectedState": {
          "groupByAttributes": ["gender"]
        },
        "expectedAnswer": null,
        "minIntentActions": 1,
        "referenceActions": []
      }
    }
  ]
}
```

### Current Output Shape

Each case currently produces a result object with:

- `caseId`
- `prompt`
- `status`
- `checks`
- `metrics`
- `evidence`

Current metrics:

- `triesToSuccess`
- `toolCallCount`
- `intentActionCount`
- `rejectedToolCallCount`
- `efficiencyGap`
- `durationMs`

Current evidence:

- `finalAnswer`
- `messages`
- `appState`
- screenshot paths when `--screenshots` is enabled

## Current Oracle

The benchmark uses an outcome-based oracle, not an exact trace oracle.

### Implemented `expectedState` checks

The runner currently knows how to verify:

- `groupByAttributes`
- `sortByAttribute`
- `visibleSampleCount`
- `metadataAttributesPresent`
- `viewVisibility`

These are read from the real app/sample-view state after the turn completes.

### Implemented `expectedAnswer` checks

The runner currently knows how to verify:

- `mustContainAny`
- `mustContainAll`
- `mustNotContain`
- `factSlots`
- `numericSlots`

These are deterministic string/number checks against the final assistant answer.

### Implemented evaluation rule

- if `expectedState` exists, all state checks must pass
- if `expectedAnswer` exists, all answer checks must pass
- if both exist, both must pass

`minIntentActions` is currently used only for the efficiency metric, not as the
pass/fail oracle.

`referenceActions` exists in case data as optional documentation/debug context,
but it is not used as the pass/fail rule.

## Reuse Boundaries Already Followed

The current runner already reuses these existing boundaries instead of
duplicating them:

- real browser-side `AgentSessionController`
- real `agentAdapter` turn path
- real context building in `contextBuilder.js`
- real tool/intent execution path in the app runtime
- real chat panel in interactive mode

The benchmark should continue to avoid duplicating:

- tool argument validation
  - [`toolCatalog.js`](../../toolCatalog.js)
  - [`generated/generatedToolSchema.json`](../../generated/generatedToolSchema.json)
- intent validation
  - [`intentProgramValidator.js`](../../intentProgramValidator.js)
  - [`actionShapeValidator.js`](../../actionShapeValidator.js)
- execution semantics
  - [`agentTools.js`](../../agentTools.js)
  - [`intentProgramExecutor.js`](../../intentProgramExecutor.js)
  - [`actionCatalog.js`](../../actionCatalog.js)
- metadata summaries
  - [`metadataAttributeSummaryTool.js`](../../metadataAttributeSummaryTool.js)
  - [`groupedMetadataAttributeSummaryTool.js`](../../groupedMetadataAttributeSummaryTool.js)
  - [`metadataSummaryReducers.js`](../../metadataSummaryReducers.js)
- retry/rejection accounting
  - [`toolCallLoop.js`](../../toolCallLoop.js)
  - [`agentSessionController.js`](../../agentSessionController.js)
- context assembly
  - [`contextBuilder.js`](../../contextBuilder.js)
  - [`agentAdapter.js`](../../agentAdapter.js)
  - [`selectionAggregationContext.js`](../../selectionAggregationContext.js)

Relevant architecture note:

- [`python_agent_server.md`](../../LLM_PLAN/python_agent_server.md)

## Current Visualization Coverage

The implemented suites are still intentionally small.

There is currently a real `fuse_encode` suite with a reduced prompt set that
tries to avoid redundant cases. The current direction is:

- keep one representative case per operator family when the attribute choice is
  not materially changing the behavior under test
- keep a smaller number of descriptive cases
- keep mixed cases only when they test a meaningfully different workflow

This is already reflected in the `fuse_encode` suite, which was reduced from a
larger redundant set to a tighter representative one.

## Things Still Intentionally Missing

The benchmark does not yet try to do all of the following:

- exact trace matching
- benchmark-local schema validation
- benchmark-local metadata summary recomputation
- benchmark-local context building
- rich semantic judging for open-ended descriptive answers
- regression history across runs
- HTML reporting
- multi-visualization manifests or template-driven case generation

Those may become useful later, but they are not part of the current minimal
implementation.

## Next Likely Steps

The most natural next improvements from the current implementation are:

- tighten or expand the oracle only where real benchmark failures justify it
- add another visualization suite without changing generic runner control flow
- improve result summaries if a repeated need appears
- improve mixed-task verification where deterministic checks are still too weak
- add regression comparison only after the basic suites stabilize

## Version Framing

### Current V1

The current implementation already satisfies the practical V1 goals:

- one small generic runner
- local suite JSON files
- headless and interactive execution
- JSON artifacts and optional screenshots
- action and description filtering
- reuse of the real agent runtime

### V2 Direction

V2 should focus on trustworthiness and reuse, not framework growth:

- add another visualization suite
- improve only the checks that prove too weak in practice
- keep the runner generic
- avoid file sprawl unless repetition clearly forces a split

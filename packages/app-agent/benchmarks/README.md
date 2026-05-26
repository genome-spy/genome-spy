# Agent Benchmark Runner

This is a minimal standalone benchmark runner for the GenomeSpy agent.

The benchmark lives under `packages/app-agent/benchmarks/` so it stays beside
the agent package.

It reuses the real browser agent runtime through the existing
`AgentSessionController`. The goal is to keep the first implementation small
and avoid benchmark-only copies of validation, execution, or summary logic.

## Prerequisites

- install workspace dependencies so `playwright` is available
- run an agent server, or let the benchmark point at one you already have

The default agent server URL is `http://127.0.0.1:8000`.

## Common Local Workflow

If you already have the relay server and the GenomeSpy app dev server running in
separate terminals, run the benchmark like this from the repo root:

```bash
node packages/app-agent/benchmarks/run.mjs \
  --case-file packages/app-agent/benchmarks/cases/fuse-encode.json \
  --interactive \
  --case-mode action \
  --app-url http://127.0.0.1:8080 \
  --agent-url http://127.0.0.1:8000 \
  --case-delay-ms 1000 \
  --quiet-browser-warnings
```

Run a single case the same way by adding `--case-id <id>`, for example:

```bash
node packages/app-agent/benchmarks/run.mjs \
  --case-file packages/app-agent/benchmarks/cases/fuse-encode.json \
  --case-id fuse-encode.group_by_gender \
  --interactive \
  --case-mode action \
  --app-url http://127.0.0.1:8080 \
  --agent-url http://127.0.0.1:8000 \
  --quiet-browser-warnings
```

Run only description-based cases:

```bash
node packages/app-agent/benchmarks/run.mjs \
  --case-file packages/app-agent/benchmarks/cases/fuse-encode.json \
  --case-mode description \
  --app-url http://127.0.0.1:8080 \
  --agent-url http://127.0.0.1:8000 \
  --quiet-browser-warnings
```

**Arguments:**

- `--case-file`: benchmark suite JSON file
- `--case-id`: run one case from the suite
- `--case-mode`: run `all`, `action`, or `description` cases
- `--interactive`: show the browser and keep it open
- `--app-url`: use an already running GenomeSpy app server
- `--agent-url`: use an already running relay/agent server
- `--quiet-browser-warnings`: hide browser warnings from CLI output
- `--screenshots`: capture `before.png` and `after.png` for each case
- `--output-dir`: custom artifact output directory
- `--timeout-ms`: per-case timeout in milliseconds
- `--case-delay-ms`: delay between cases to reduce provider burst load
- `--preflight-retry-delay-ms`: delay before retrying failed preflights
- `--repeats`: run each selected case multiple times
- `--turn-mode`: use `one-shot` or `continuable`
- `--auto-continue-text`: follow-up text used in continuable mode
- `--max-followups`: maximum number of automatic continuation turns

## What The Runner Does

If `--app-url` is omitted, the runner starts `packages/app/dev-server.mjs`
with:

- `VITE_AGENT_BASE_URL=<agent-url>`

For each case, it:

1. loads the requested visualization if it is not already loaded
2. restores visualization defaults and rolls provenance back
3. resets the browser-side agent session
4. sends the prompt through the existing controller
5. writes a JSON result and optional screenshots
6. writes a human-readable `trace.md` for each run
6. evaluates the case oracle
7. writes suite-level `suite-result.json` and `suite-summary.md`

If the agent returns an empty final answer without producing intent actions or
plots, the runner resets the case once and retries the prompt automatically.
Provider-side empty final answers are also treated as relay errors now instead
of being accepted as valid assistant output.

The relay also retries once on upstream `429` rate-limit responses and uses the
provider's suggested wait time when it is available.

## Folder Structure

The benchmark folder is intentionally small:

- `cases/`: local benchmark suite JSON files
- `results/`: generated run artifacts and reports
- `run.mjs`: CLI runner
- `README.md`: usage notes

In practice:

- put visualization-specific prompt suites under `cases/`
- inspect benchmark outputs under `results/`
- keep the runner logic in `run.mjs`

Each run now writes:

- `result.json`: structured machine-readable artifact
- `trace.md`: human-readable transcript with plan, tool calls, tool results, and final answer

When `--repeats` is greater than `1`, each case gets:

- `run-001/`, `run-002/`, ...
- `aggregate.json`
- `aggregate.md`

The suite root also gets:

- `suite-result.json`
- `suite-summary.md`

`continuable` keeps the same agent session and sends a short automatic
follow-up turn when the answer looks like the model is asking permission to
continue.

## Input

The main input is a benchmark suite JSON file passed with `--case-file`.

Example:

```text
packages/app-agent/benchmarks/cases/fuse-encode.json
```

At a high level, a suite contains:

- shared visualization setup such as `route` and `specPath`
- a `cases` array
- for each case:
  - `id`
  - `prompt`
  - `difficulty`
  - optional `ambiguityLevel`
  - `taskType`
  - `outcomeType`
  - `rubric`
  - `oracle`

`ambiguityLevel` is optional metadata for organizing prompts such as:

- `explicit`
- `simple`
- `ambiguous`

The current runner does not use `ambiguityLevel` for scoring or filtering, but
it is useful for tracking whether a case spells out the required actions or
expects the agent to infer them from a more realistic user prompt.

The rubric and answer-oracle checks share the same semantic subgoal vocabulary
for payload-aware process requirements and answer grounding. The runner
currently understands these subgoal kinds:

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

The `oracle` block is now intentionally small: it should contain the expected
user-facing answer when the case requires one. Use:

- `oracle.expectedAnswer`: expected answer contract for answer-bearing cases

For state-change or artifact-only cases, keep `oracle.expectedAnswer` as
`null`.

## Rubric Evaluation

Every case is evaluated with a rubric. The rubric is the primary case contract
and the required schema for benchmark suites.

When a case expects the agent to answer the user, that expected answer should
be present in `oracle.expectedAnswer`. The rubric automatically uses
`rubric.answerRubric` when provided, and otherwise falls back to
`oracle.expectedAnswer`, so the user-facing answer still contributes to rubric
scoring. In practice, new cases should usually keep the expected answer in the
oracle and omit `rubric.answerRubric` unless they need a special override.

Rubrics are inspired by process-level biomedical-agent evaluation: score the
trajectory and reasoning dimensions that matter, not just the final answer. For
GenomeSpy agent cases, useful dimensions are:

- `requirements`: minimum tools and intent actions were used
- `state`: minimum task-relevant state is present
- `artifacts`: required generic analysis artifacts were produced
- `answer`: the answer contains grounded expected facts
- `efficiency`: the run avoided rejected calls and excessive detours

Example rubric:

```json
{
  "version": 1,
  "initialState": {
    "baseline": "default"
  },
  "requirements": {
    "state": {
      "groupByAttributes": ["sampleTime"]
    },
    "actions": [
      {
        "actionType": "sampleView/groupByNominal",
        "label": "group_by_sampletime"
      }
    ],
    "artifacts": [
      {
        "kind": "sampleAttributePlot",
        "plotType": "boxplot",
        "label": "show_boxplot"
      }
    ]
  },
  "efficiency": {
    "minToolCalls": 2,
    "minIntentActions": 1,
    "softMaxToolCalls": 6,
    "softMaxIntentActions": 4,
    "maxRejectedToolCalls": 0
  },
  "scoring": {
    "passingScore": 0.95,
    "weights": {
      "requirements": 0.35,
      "state": 0.25,
      "artifacts": 0.2,
      "answer": 0.15,
      "efficiency": 0.05
    }
  }
}
```

`requirements` describes minimum task-relevant conditions, not a full final
state. Extra harmless state is allowed. The runner evaluates required state,
tool calls, intent actions, and generic artifacts. Artifact checks should use
generic kinds such as `sampleAttributePlot`, `metadataSummary`,
`metadataValueResolution`, `selectionSummary`, `derivedMetadataAttribute`,
`searchResult`, `zoomResult`, `datumLookup`, `provenanceActivation`, or
`viewVisibility`.

`requirements.checks` and `oracle.expectedAnswer.requiredStateForAnswer`
support the same semantic subgoal kinds. Rubric-only efficiency checks include
`maxRejectedToolCalls`, `minToolCalls`, `maxToolCalls`, `minIntentActions`, and
`maxIntentActions`.

`intentActionPayloadValue` is useful when a case must verify not just that an
action happened, but that its payload contained the right semantic choice. For
example, a `sampleView/deriveMetadata` action can be required to use
`payload.attribute.aggregation` equal to `weightedMean`.

`selectionAggregationUsageValue` is useful when a case must verify the resolved
selection-aggregation source behind a `SELECTION_AGGREGATION` attribute. For
example, a copy-number case can require the used candidate to resolve to
`view=CNV` and `dataType=quantitative`.

The result includes a `rubric` block with per-criterion checks and a normalized
score. A case passes when the required rubric criteria pass and the normalized
rubric score is at least the configured `passingScore`.
Efficiency can lower the score without failing cases when `passingScore` is set
to the sum of the required non-efficiency weights.

For answer-bearing cases, `oracle.expectedAnswer.requiredStateForAnswer` can use
the same subgoal shapes to require that the answer is grounded in the right
intermediate state, without forcing an exact wording or a mandatory plot.

Additional answer checks are available for more robust analysis-style prompts:

- `mustContainNumberCountAtLeast`
- `mustContainComparisonSignal`
- `mustMentionGroupsWithNumbers`

`--case-mode` filters the suite before execution:

- `all`: run every case
- `action`: run state-change and mixed task cases
- `description`: run descriptive/text-answer cases

## Output

Results are written under:

```text
packages/app-agent/benchmarks/results/<timestamp>/
```

The local `results/` directory is ignored by git.

Each run writes:

- `suite-result.json`
- one subdirectory per case
- `result.json`

When `--screenshots` is passed, each case directory also includes:

- `before.png`
- `after.png`

Each `result.json` includes:

- final case status
- rubric score and criterion-level checks
- failed required rubric criteria
- metrics such as tool calls and intent actions
- evidence such as tool names, content kinds, plot records, provenance actions,
  generic analysis artifacts, final answer, and initial/final app-state
  snapshots

## Current Limitations

- the first version is intentionally small
- answer checking is still deterministic and simple
- process-level checks cover common workflow signals, not every possible
  intermediate state yet
- state checking still focuses on fields that are easy to inspect through
  existing app/runtime handles

When adding new cases, prefer extending case data before extending the runner.

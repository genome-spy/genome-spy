# Agent Benchmarking Plan

This note sketches a minimal path for benchmarking the GenomeSpy agent without
pulling the benchmark into product code or turning the first version into a
framework. The benchmark should stay separate, CLI-runnable, and easy to
review.

The main purpose is to measure whether the agent completes prompt tasks over a
real visualization, not merely whether it emits one exact expected sequence of
tool calls.

## Principles

- Keep the benchmark implementation outside the app and relay runtime paths.
- Use the real browser visualization as the execution environment.
- Keep the Playwright runner generic so it can execute benchmark cases for
  multiple visualizations without gaining visualization-specific logic.
- Prefer a small amount of explicit case data over a generalized benchmark
  DSL.
- Measure final correctness first, then retries and efficiency.
- Accept equivalent successful action paths when they lead to the same correct
  end state or answer.
- Keep the first implementation intentionally small and refactor only when
  repeated pressure appears.
- Separate reusable harness code from visualization-specific benchmark data as
  early as possible, even if both still live in one script at first.

## Why A Separate CLI Benchmark

The benchmark should be runnable without changing the production agent flow.
That keeps it safer to iterate on, easier to review, and easier to discard or
reshape if the first design turns out to be wrong.

A standalone JS runner is the simplest place to start because the evaluated
behavior already lives in the browser app:

- agent context construction,
- tool definitions and validation,
- provenance-changing intent execution,
- sample grouping and filtering,
- metadata summaries,
- final visualization state visible to a human evaluator.

The repo already has a nearby example of a generic Playwright CLI in
[`packages/core/scripts/captureScreenshots.mjs`](../../../core/scripts/captureScreenshots.mjs).
The benchmark runner should follow the same spirit: a reusable browser-driving
tool with task-specific data supplied from the outside.

## Reusable Boundary

The benchmark should be designed around a clear boundary between generic runner
logic and benchmark-specific data.

### Generic Runner Responsibilities

These parts should stay reusable across visualizations:

- starting or connecting to the dev server
- opening a browser page with Playwright
- loading a target visualization route
- submitting a prompt to the agent
- waiting for the agent turn to settle
- capturing screenshots and raw trace data
- measuring retries, tool calls, rejected calls, and duration
- writing result artifacts to disk

### Visualization-Specific Responsibilities

These parts should live in case data rather than in runner logic:

- which spec or route to open
- any required starting state for the visualization
- prompt text
- expected answer or end-state checks
- minimal expected action count
- tags such as difficulty and task type

### Rule Of Thumb

If a new visualization can be supported by adding or editing case data, the
runner is still generic. If supporting a new visualization requires changing
the runner's control flow, selectors, or evaluation logic, that is a signal
that specialization has leaked into the wrong layer.

## Reusable Seams To Preserve

Even in a minimal first version, it is worth preserving a few seams so the
benchmark stays maintainable as the scope widens.

### 1. Browser Session Setup

The browser and dev-server lifecycle should not know anything about one
particular benchmark case beyond the URL or route it is asked to open.

### 2. Prompt Execution

Submitting a prompt and waiting for completion should be generic. The runner
should treat the prompt as input data, not as a hardcoded scenario.

### 3. Artifact Capture

Screenshot capture, raw trace capture, and result serialization should be
shared behavior for every case.

### 4. Verification Input Shape

The runner should accept verification requirements as data. The first version
can support only a small set of simple checks, but those checks should be
selected by case definitions rather than by branching on visualization names.

### 5. Visualization Setup

Any visualization-specific setup should be expressed as declarative case data
where possible, such as route, spec path, or reset instructions.

## Reuse Existing Building Blocks

The benchmark should assemble the current agent building blocks rather than
recreate them. This is both a maintainability requirement and an architectural
one: the benchmark should measure the real agent stack, not a benchmark-only
approximation of it.

### Tool Argument Validation

Do not add a second tool-argument validator in the benchmark.

Existing source of truth:

- [`toolCatalog.js`](../toolCatalog.js)
  - `validateToolArgumentsShape(toolName, toolArguments)`
  - `buildResponsesToolDefinitions()`
  - `formatToolCallRejection(toolName, errors)`
- [`generated/generatedToolSchema.json`](../generated/generatedToolSchema.json)
- [`validationErrorFormatter.js`](../validationErrorFormatter.js)

Risk if duplicated:

- benchmark and app disagree on which tool calls are valid
- rejection behavior drifts from the real agent loop
- generated schemas stop being the real source of truth

### Intent Batch And Action Validation

Do not add a benchmark-local action or batch validator.

Existing source of truth:

- [`intentProgramValidator.js`](../intentProgramValidator.js)
  - `validateIntentBatch(app, batch)`
- [`actionShapeValidator.js`](../actionShapeValidator.js)
  - `validateIntentBatchShape(batch)`
  - `validateActionPayloadShape(actionType, payload)`
- [`generated/generatedActionSchema.json`](../generated/generatedActionSchema.json)

Risk if duplicated:

- benchmark accepts action batches the real app would reject
- benchmark rejects action batches the real app would execute
- action-schema changes require multiple updates in different places

### Tool Execution And Mutation Semantics

The benchmark should not implement its own mutation semantics.

Existing source of truth:

- [`agentTools.js`](../agentTools.js)
  - tool dispatch behavior
- [`intentProgramExecutor.js`](../intentProgramExecutor.js)
  - `submitIntentActions(app, batch, options)`
  - `summarizeExecutionResult(result)`
- [`actionCatalog.js`](../actionCatalog.js)
  - action creators and provenance-oriented summaries

Risk if duplicated:

- the benchmark stops measuring the real agent behavior
- provenance summaries and state effects drift from production
- subtle semantics around grouping, filtering, and derivation split in two

### Metadata Summary Computation

Do not recompute metadata summaries in a benchmark-specific way.

Existing source of truth:

- [`metadataAttributeSummaryTool.js`](../metadataAttributeSummaryTool.js)
- [`groupedMetadataAttributeSummaryTool.js`](../groupedMetadataAttributeSummaryTool.js)
- [`metadataSummaryReducers.js`](../metadataSummaryReducers.js)
- [`agentAdapter.js`](../agentAdapter.js)
  - `getMetadataAttributeSummarySource(...)`
  - `getGroupedMetadataAttributeSummarySource(...)`

Risk if duplicated:

- descriptive-answer benchmarks grade against summaries that the real agent
  never sees
- quantitative and categorical reduction logic drifts
- grouped and visible-sample semantics become inconsistent

### Retry, Rejection, And Tool-Call Loop Accounting

The benchmark should reuse the existing retry and rejection semantics rather
than inventing its own interpretation of a failed turn.

Existing source of truth:

- [`toolCallLoop.js`](../toolCallLoop.js)
  - rejected retry limits
  - repeated-signature detection
  - `serializeToolCallSignature(toolCalls)`
- [`agentSessionController.js`](../agentSessionController.js)
  - turn loop
  - tool-call execution
  - transcript building
  - rejected tool-call handling

Risk if duplicated:

- benchmark metrics such as "tries to success" diverge from the actual agent
  loop
- the benchmark may count retries differently than the user-visible session
- repeated malformed tool-call behavior becomes benchmark-specific

### Context Assembly And Volatile Context

The benchmark should not build its own approximation of agent context.

Existing source of truth:

- [`contextBuilder.js`](../contextBuilder.js)
- [`agentAdapter.js`](../agentAdapter.js)
  - `getAgentContext(...)`
  - `getAgentVolatileContext()`
- [`selectionAggregationContext.js`](../selectionAggregationContext.js)

Risk if duplicated:

- benchmark prompts run against a different context than real user prompts
- selection-derived tasks become unreliable
- visibility and grouping state may be misrepresented

### Browser Automation And Dev-Server Lifecycle

The benchmark should reuse the existing generic Playwright CLI pattern already
present in the repo instead of inventing a separate browser-runner style.

Existing source of truth:

- [`packages/core/scripts/captureScreenshots.mjs`](../../../core/scripts/captureScreenshots.mjs)

Risk if duplicated:

- two separate server-start and browser-lifecycle patterns need maintenance
- benchmark harness behavior drifts from other browser automation scripts

### Python-Side Duplication Boundary

The existing Python-side design notes already make the intended boundary
explicit: GenomeSpy should own schemas, validation, and visualization-specific
semantics.

Relevant note:

- [`python_agent_server.md`](./python_agent_server.md)

Important guidance already captured there:

- GenomeSpy is the single source of truth for agent-facing schemas
- Python should not duplicate schema validation or tool-definition logic
- generated artifacts should be consumed rather than recreated manually

This same rule should apply to the benchmark runner.

## Concrete Duplication Risks

The benchmark design should explicitly avoid these failure modes:

- writing benchmark-only JSON Schema validation for tool calls
- writing benchmark-only validation for `submitIntentActions` payloads
- recomputing metadata or grouped summaries outside the existing tools
- counting retries or rejected rounds with custom benchmark logic that does not
  match the session controller
- building a benchmark-local version of agent context or selection summaries
- introducing visualization-specific execution branches into the generic runner
- adding a second browser automation pattern when an existing generic one is
  already available in the repo

## Specialization Risks

The easiest way for the benchmark to become hard to maintain is to let
visualization knowledge spread into the runner in small ad hoc ways.

Examples to avoid:

- hardcoded assumptions about one visualization's attribute names
- selector logic that only works for one benchmark page layout
- verifier branches like `if visualizationId === "fuse_encode"`
- prompt execution paths that differ because one visualization was the first
  one implemented

If some specialization is unavoidable in a later version, it should be made
explicit and isolated behind a small, named case-data contract rather than
spread through the runner.

## Version 1 Goals

The first version should prove that the benchmark is useful while keeping the
implementation surface very small.

### Scope

- one standalone runner script, for example `benchmarks/agent/run.mjs`
- one benchmark case file for one visualization
- Playwright-driven execution against the real browser app
- a generic runner structure even if the first case file covers only one
  visualization
- support for a small set of prompt types:
  - one-step state-change prompts
  - a few multi-step prompts
  - a few descriptive prompts
- JSON results plus before/after screenshots
- interactive mode so a human can inspect the final browser state

### What To Measure

- pass/fail
- tries until first success
- total tool calls
- total executed intent actions
- rejected tool calls
- total duration

### What Counts As Success

- a person can run a small benchmark set from the CLI
- the benchmark leaves enough artifacts to inspect failures
- the code stays small and easy to review
- the runner can support a second visualization later without being rewritten
- the benchmark already reveals useful failure modes even if some answer
  grading is still simple

### Constraints

- no changes to product behavior
- no benchmark framework
- no large file tree
- no attempt to perfectly grade every open-ended answer
- no exact-sequence requirement for all tasks

## Version 2 Goals

The second version should improve trustworthiness and reuse without losing the
minimal feel of the first version.

### Scope

- add at least one more visualization
- extend the case format only where repetition clearly justifies it
- improve mixed-task verification:
  - final state checks for mutations
  - lightweight slot or fact checks for text answers
- distinguish task categories more explicitly:
  - `attribute_only`
  - `view_only`
  - `hybrid`
  - `state_change`
  - `text_answer`
  - `mixed`
- report efficiency relative to a minimal expected action count
- add a run-level summary across benchmark cases

### What Counts As Success

- the same runner works across multiple visualizations
- case authoring remains straightforward
- scores are more stable and interpretable than in V1
- the benchmark can compare different agent or model configurations on the
  same cases

### Constraints

- only split files when repeated logic becomes a review burden
- prefer deterministic checks over judge-style scoring where possible
- avoid inventing a large semantic planning language too early

## Beyond Version 2

Later versions should focus on coverage, regression detection, and deeper
analysis rather than on architectural expansion for its own sake.

### Possible Directions

- larger cross-visualization benchmark corpus
- reusable prompt templates with visualization-specific bindings
- richer equivalence checks for alternate successful action paths
- benchmark history and regression comparisons across runs
- category-level score breakdowns such as:
  - planning
  - tool use
  - attribute reasoning
  - visualization understanding
  - answer quality
- curated human-review flows for ambiguous cases
- selective use of richer grading for open-ended descriptive prompts

### Long-Term Success

The benchmark should become useful for both development and research
iteration:

- catch regressions before shipping,
- show where the agent is weak,
- support comparison of models, prompts, and tool-surface changes,
- stay understandable enough that benchmark failures are actionable.

## Recommended Starting Shape

Keep the first implementation intentionally flat:

- `benchmarks/agent/run.mjs`
- `benchmarks/agent/cases/<visualization>.json`
- optional short `benchmarks/agent/README.md`

That is enough to learn from real runs. If one script later becomes crowded,
it can be split based on actual pressure rather than speculation.

Even in this flat layout, `run.mjs` should still be organized around generic
functions rather than around one visualization's benchmark flow. The first
implementation can stay minimal without making the control flow specialized.

## Initial Case Guidance

The first benchmark set should include a small but varied group of prompts:

- simple attribute actions such as group-by and sort
- simple filter tasks
- multi-step attribute workflows
- prompts that end in a state change
- prompts that end in a chat answer
- prompts that require both

Each case should record:

- prompt text
- visualization identifier or setup
- difficulty
- task type
- outcome type
- minimal expected action count
- expected end-state or answer checks

That gives the benchmark enough structure to be useful without committing to a
heavy benchmark specification too early.

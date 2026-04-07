# LLM Tools (Draft)

This document outlines what tools should be exposed to an LLM agent, with emphasis on safe composition, validation, and minimal state mutation.

## Code References
- Context/tool assembly: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- Selection and field discovery: [`viewWorkflowContext.js`](../src/agent/viewWorkflowContext.js)
- Workflow resolution: [`viewWorkflowResolver.js`](../src/agent/viewWorkflowResolver.js)
- Action validation and execution: [`intentProgramValidator.js`](../src/agent/intentProgramValidator.js), [`intentProgramExecutor.js`](../src/agent/intentProgramExecutor.js)
- Action summaries: [`actionCatalog.js`](../src/agent/actionCatalog.js)
- Agent entry point: [`toolbarMenu.js`](../src/agent/toolbarMenu.js)

## Status

### Implemented
- `validateIntentProgram(program)`
  - Implemented in [`intentProgramValidator.js`](../src/agent/intentProgramValidator.js).
  - Validates action types, payload shape, and app-specific attribute existence.

- `submitIntentProgram(program)`
  - Implemented in [`intentProgramExecutor.js`](../src/agent/intentProgramExecutor.js).
  - Validates and executes a batch through `IntentPipeline.submit(actions)`.

### Partially Implemented
- `getViewHierarchySummary()`
  - Available as part of [`buildViewTree(app)`](../src/agent/viewTree.js), which feeds the agent context.
  - Not exposed as a standalone tool yet.

- `getDataDictionary()`
  - Available as part of [`getAgentContext(app)`](../src/agent/contextBuilder.js), which assembles the attribute summary.
  - Not exposed as a standalone tool yet.

- `getAttributeRegistry()`
  - The underlying attribute lookup exists through `CompositeAttributeInfoSource`.
  - The registry is not surfaced as a dedicated tool yet.

- `getParamState()`
  - Current param values are already reflected in the agent context through provenance and workflow summaries.
  - Not exposed as a standalone tool yet.

- `getProvenanceSummary()`
  - Provenance summaries are already assembled in [`contextBuilder.js`](../src/agent/contextBuilder.js).
  - Not exposed as a standalone tool yet.

- `explainAction(action)`
  - Human-readable action summaries already exist through [`actionCatalog.js`](../src/agent/actionCatalog.js).
  - Not exposed as a standalone tool yet.

### Planned
- `getScaleSummaries()`
- `resolveAttributeByName(query)`
- `previewIntentProgram(program)`
- `expandViewNode(selector)`
- `collapseViewNode(selector)`
- `getActionSchema(actionType)`
- `forgetActionSchema(actionType)`

## Principles
- Prefer read-only tools for context gathering.
- Validate intents before execution.
- Keep tools small and composable.
- Expose stable identifiers (view ids, attribute identifiers) rather than labels.
- Fail fast with clear errors when inputs are invalid.
- Keep agent tooling behind the same Vite/runtime gate as the app bootstrap.
- Load agent-only tooling lazily so the generic app path stays free of agent imports.

## Tool Surface
The OpenAI-facing tool list should stay coarse-grained.

- Use `submitIntentProgram` as the public mutation tool for sample-view and
  provenance-changing Redux actions.
- Keep the detailed Redux action inventory inside the nested intent-program
  contract, not as one OpenAI tool per Redux action.
- Use detail tools such as `expandViewNode` and `getActionSchema` only when the
  model needs more context than the always-on summary provides.

## Progressive Disclosure
Use compact summaries by default, then fetch detail only when the model needs
it.

- `expandViewNode(selector)`
  - Returns the hidden subtree or node details for a collapsed view branch.
  - Updates the agent's working context, not the user-visible UI state.

- `collapseViewNode(selector)`
  - Removes an expanded branch from the agent's working context.
  - Restores the summarized form for that node.

- `getActionSchema(actionType)`
  - Returns the exact payload schema for a single action type.
  - Expands opaque type names into concrete field constraints and variants.

- `forgetActionSchema(actionType)`
  - Drops a previously expanded action schema from the agent's working context.
  - Falls back to the compact catalog entry.

Suggested loop:
- Keep the prompt prefix stable and compact.
- Present summaries and collapsed branches first.
- Let the model request detail tools when a summary is insufficient.
- Merge tool results into the next LLM turn.
- Allow the agent or runtime to re-collapse stale detail later.

## Read-Only Tools
These gather context without mutating state.

- `getViewHierarchySummary()`
  - Returns a compact, nested summary of the view tree.

- `getDataDictionary()`
  - Returns metadata attributes with types, titles, and descriptions.

- `getAttributeRegistry()`
  - Returns both metadata and view-backed attributes with stable identifiers.

- `getScaleSummaries()`
  - Returns scale type + data-domain; includes color schemes when meaningful.

- `getParamState()`
  - Returns current selection/param values from provenance.

- `getProvenanceSummary()`
  - Returns recent actions as natural language strings.

## Action Tools
These mutate state and should run through `IntentPipeline`.

- `validateIntentProgram(program)`
  - Checks action types, payload schema, and attribute existence.

- `submitIntentProgram(program)`
  - Executes a batch via `IntentPipeline.submit(actions)`.
  - Returns status, any error, and a short provenance summary of what changed.

## Optional / Future Tools
- `resolveAttributeByName(query)`
  - Suggests matching attributes for ambiguous user requests.

- `explainAction(action)`
  - Renders action info to human-readable text for confirmation or debugging.

- `previewIntentProgram(program)`
  - Returns a dry-run summary with warnings but no execution.

## Safety and UX
- Require confirmation for irreversible or large-scope operations.
- Use provenance summaries for post-action explanations.
- Surface missing context as clarification questions.

# LLM Tools (Draft)

This document outlines what tools should be exposed to an LLM agent, with emphasis on safe composition, validation, and minimal state mutation.

## Code References
- Context/tool assembly: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- Selection and field discovery: [`selectionAggregationContext.js`](../src/agent/selectionAggregationContext.js)
- Selection aggregation resolver: [`selectionAggregationTool.js`](../src/agent/selectionAggregationTool.js)
- Action validation and execution: [`intentProgramValidator.js`](../src/agent/intentProgramValidator.js), [`intentProgramExecutor.js`](../src/agent/intentProgramExecutor.js)
- Action summaries: [`actionCatalog.js`](../src/agent/actionCatalog.js)
- Agent entry point: [`toolbarMenu.js`](../src/agent/toolbarMenu.js)
- Tool validation and rejection flow: [`validation.md`](./validation.md)

## Status

### Implemented
- `validateIntentBatch(batch)`
  - Implemented in [`intentProgramValidator.js`](../src/agent/intentProgramValidator.js).
  - Validates action types, payload shape, and app-specific attribute existence.

- `submitIntentActions(actions, note)`
  - Implemented in [`intentProgramExecutor.js`](../src/agent/intentProgramExecutor.js).
  - Validates and executes a batch through `IntentPipeline.submit(actions)`.

- `buildSelectionAggregationAttribute(candidateId, aggregation)`
  - Implemented in [`selectionAggregationTool.js`](../src/agent/selectionAggregationTool.js).
  - Resolves an agent-visible selection aggregation row into the canonical
    attribute identifier and a short preview.

- `toolCatalog`
  - Generated from [`agentToolInputs.d.ts`](../src/agent/agentToolInputs.d.ts)
    via [`generateAgentToolCatalog.mjs`](../../../scripts/generateAgentToolCatalog.mjs)
    and [`generateAgentToolSchema.mjs`](../../../scripts/generateAgentToolSchema.mjs).
  - Provides agent-facing tool metadata and the Responses API function
    descriptors derived from the generated schema.

- Session-owned expanded view state
  - Implemented in [`agentSessionController.js`](../src/agent/agentSessionController.js).
  - Maintains the current set of expanded view node selector keys and threads
    them into the agent context snapshot.

- `expandViewNode(selector)` / `collapseViewNode(selector)`
  - Implemented in [`agentSessionController.js`](../src/agent/agentSessionController.js).
  - Expands or collapses the agent-only view-context overlay without touching
    provenance.

- `setViewVisibility(selector, visibility)`
  - Implemented through the agent adapter and the app's visibility state.
  - Tool-level visibility control, separate from the agent action catalog and
    provenance-backed intent batches.

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
- `previewIntentBatch(batch)`
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

- Use `submitIntentActions` as the public mutation tool for sample-view and
  provenance-changing Redux actions.
- Keep the detailed Redux action inventory inside the nested intent-program
  contract, not as one OpenAI tool per Redux action.
- Use detail tools such as `expandViewNode` and `getActionSchema` only when the
  model needs more context than the always-on summary provides.

## Implementation Steps
Build the tool surface in small generated steps:

1. Define the tool contracts in TypeScript with JSDoc.
   - Keep payloads and return shapes close to the agent runtime.
   - Document public behavior, not implementation details.
   - Treat these definitions as the source of truth for generation.

2. Generate the catalog and schema artifacts from those definitions.
   - Emit a compact tool catalog for prompt/context assembly.
   - Emit JSON Schema artifacts for validation.
   - Emit OpenAI Responses API tool descriptors from the same source.

3. Add agent-local exploration state to the controller/runtime boundary.
   - Maintain a set of expanded view nodes.
   - Make `expandViewNode(selector)` add to that set.
   - Make `collapseViewNode(selector)` remove from that set.
   - Keep this state out of provenance and `submitIntentActions`.

4. Wire tool execution into the agent turn loop.
   - Parse tool calls from the model response.
   - Dispatch each tool to the local handler.
   - Return tool outputs to the model with the matching call id or request
     another turn
     locally after applying the tool result, depending on the transport layer.
   - Keep `submitIntentActions` only for provenance-backed mutations.

5. Add app-state tools as separate direct state changes.
   - Use them for app state, not intent provenance.
   - Do not route them through `submitIntentActions`.
   - Keep them explicit so the model does not conflate them with view exploration.

6. Update the system prompt and agent instructions.
   - Tell the model when to use exploration tools.
   - Tell the model when to use app-state tools.
   - Clarify that only provenance-changing actions belong in intent batches.

7. Add tests for the generated catalog and tool handling.
   - Validate the generated schemas.
   - Verify tool registration and dispatch.
   - Cover expand/collapse and app-state tool behavior separately.
   - See [`validation.md`](./validation.md) for the retry/rejection rollout.

## Progressive Disclosure
Use compact summaries by default, then fetch detail only when the model needs
it.

- `expandViewNode(selector)`
  - Returns the hidden subtree or node details for a collapsed view branch.
  - Updates the agent's working context, not the user-visible UI state.
  - Implemented.

- `collapseViewNode(selector)`
  - Removes an expanded branch from the agent's working context.
  - Restores the summarized form for that node.
  - Implemented.

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

- `validateIntentBatch(batch)`
  - Checks action types, payload schema, and attribute existence.

- `submitIntentActions(actions, note)`
  - Executes a batch via `IntentPipeline.submit(actions)`.
  - Returns status, any error, and a short provenance summary of what changed.

## Optional / Future Tools
- `resolveAttributeByName(query)`
  - Suggests matching attributes for ambiguous user requests.

- `explainAction(action)`
  - Renders action info to human-readable text for confirmation or debugging.

- `previewIntentBatch(batch)`
  - Returns a dry-run summary with warnings but no execution.

## Safety and UX
- Require confirmation for irreversible or large-scope operations.
- Use provenance summaries for post-action explanations.
- Surface missing context as clarification questions.

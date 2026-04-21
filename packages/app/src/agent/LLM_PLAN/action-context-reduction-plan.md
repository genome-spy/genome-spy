# Action Context Reduction Plan

This document outlines a staged plan for reducing the token cost of the
agent-facing action context. The goal is to keep enough action knowledge in the
base context for planning, while moving detailed payload documentation and
examples behind explicit lookup tools.

## Current State

- `contextBuilder.js` sends `context.actionCatalog` on every agent turn.
- The context projection includes action type, description, payload fields, and
  example payloads.
- `generated/generatedActionSummaries.json` already exists, but the base context
  does not use it.
- `generated/generatedActionCatalog.json` is still needed as the internal source
  for action payload metadata, examples, and validation support.
- `payloadType` is useful for generation internals but is not useful in the
  LLM-facing context.
- The browser also sends provider-ready tool definitions on every request, so
  context reduction should be measured against the full request payload, not
  only the generated catalog artifact.

## Design Goal

Keep a compact action summary list in the always-on context:

```ts
actionSummaries: {
    actionType: AgentActionType;
    description: string;
}[];
```

Move detailed action information behind a stateless lookup tool:

```ts
getActionDetails({
    actionTypes: AgentActionType[];
    includeSchema?: boolean;
})
```

The default detail response should be compact and model-facing:

```ts
{
    actionType: AgentActionType;
    description: string;
    usage?: string;
    payloadFields: AgentPayloadField[];
    examples: unknown[];
}
```

Raw JSON Schema should be optional. The model usually needs usage guidance,
payload fields, and examples before it needs a full schema object.

## Non-Goals

- Do not remove the generated action catalog as an internal artifact.
- Do not make one provider tool per Redux action.
- Do not add catalog-entry-level `disposable` flags. Actions are not inherently
  disposable; expanded action details are disposable within a task/session.
- Do not solve transcript compaction in the first implementation slice.

## Versioned Implementation Plan

### v0.0: Measurement Baseline

Purpose: make the optimization target concrete before changing behavior.

Implementation:

- Measure serialized sizes for each top-level request section:
  - `message`
  - `history`
  - `context`
  - `volatileContext`
  - `tools`
- Break down `context` at least by:
  - action context
  - attributes
  - searchable views
  - provenance
  - view tree
- Record the current size of the always-on action context.

Acceptance criteria:

- A repeatable measurement command or script exists.
- The baseline clearly shows how much of each request is action-related.
- The results distinguish generated artifact size from actual per-turn request
  size.

Notes:

- This can be implemented either in the existing Python token tool or as a small
  local debugging utility.
- Do this before v0.1 so later wins are measurable.

### v0.1: Use Action Summaries in Base Context

Purpose: remove detailed payload fields and examples from the always-on context.

Implementation:

- Import `generated/generatedActionSummaries.json` in `actionCatalog.js` or
  `contextBuilder.js`.
- Add a `listAgentActionSummaries()` helper.
- Replace `context.actionCatalog` with `context.actionSummaries`.
- Shape each summary as:

```ts
{
    actionType: AgentActionType;
    description: string;
}
```

- Drop `title` from the context projection.
- Update `AgentContext` and related types.
- Update tests that assert the context shape.

Acceptance criteria:

- Base context no longer includes action `payloadFields` or `examplePayload`.
- The generated full catalog remains available for validation and execution.
- Existing intent execution continues to work.
- The baseline measurement shows a clear reduction in `context`.

Recommended tests:

- `contextBuilder.test.js` asserts `actionSummaries` is present.
- `contextBuilder.test.js` asserts action summaries do not expose payload fields.
- `actionCatalog.test.js` covers the new summary helper.

### v0.2: Add Stateless Action Detail Lookup

Purpose: let the agent fetch detailed action documentation only when needed.

Implementation:

- Add a tool input type to `agentToolInputs.d.ts`:

```ts
export interface GetActionDetailsToolInput {
    actionTypes: AgentActionType[];
    includeSchema?: boolean;
}
```

- Add `getActionDetails` to `AgentToolInputs`.
- Generate updated tool catalog/schema artifacts.
- Add a handler in `agentTools.js`.
- Resolve each requested action from the generated action catalog.
- Return compact detail objects without `payloadType`.
- Reject unknown action types with a clear tool-call error.

Acceptance criteria:

- The agent can request details for one or more action types.
- Detail responses include payload fields and examples.
- Detail responses do not include `payloadType`.
- Existing `submitIntentActions` validation remains unchanged.

Recommended tests:

- `agentTools.test.js` covers valid lookup, multiple action lookup, and unknown
  action rejection.
- Generated tool catalog/schema checks pass.

### v0.3: Prompt and Workflow Guidance

Purpose: teach the model to use summaries first and details only when needed.

Implementation:

- Update agent prompt/instructions consumed by the Python relay or app-side
  prompt source.
- Guidance should say:
  - Use `actionSummaries` to identify candidate actions.
  - Use `getActionDetails` before constructing unfamiliar action payloads.
  - Use `submitIntentActions` for provenance-changing actions.
  - Do not invent payload fields or attributes that are absent from context or
    tool results.
  - Fetch details for all likely actions in one lookup call when planning a
    multi-step change.

Acceptance criteria:

- Benchmark prompts that require sample filtering, grouping, sorting, and
  selection updates still produce valid action payloads.
- The model no longer needs the full catalog in the base context.

Recommended tests:

- Update benchmark expectations only where the new lookup step changes the tool
  trace.
- Add at least one benchmark case where the model must fetch action details
  before submitting.

### v0.4: Fuller Action Documentation Generation

Purpose: make fetched action details more useful than the current first-sentence
catalog descriptions.

Implementation:

- Split generated action docs into:

```ts
summary: string;
description: string;
usage?: string;
examples: unknown[];
```

- Use the first sentence for `summary`.
- Use fuller reducer JSDoc for `description`.
- Consider an explicit JSDoc tag such as `@agent.usage` for compact operational
  guidance.
- Preserve examples parsed from existing JSDoc examples.
- Keep summary wording concise and action-selection oriented.

Acceptance criteria:

- `generatedActionSummaries.json` is compact.
- `getActionDetails` returns richer descriptions and examples.
- Generated docs remain sourced from action JSDoc and payload type docs.

Recommended tests:

- Generator tests verify summaries match committed generated files.
- Generator tests verify full descriptions preserve more than the first sentence
  when available.
- Catalog tests verify `getActionDetails` exposes examples as an array.

### v0.5: Optional Schema Detail

Purpose: expose raw payload schema only when it is actually useful.

Implementation:

- If `includeSchema` is true, include a projected schema for each requested
  action payload.
- Keep the default response schema-free.
- Reuse existing generated schema definitions instead of creating a second
  schema generator.
- Keep hidden/internal payload fields excluded.

Acceptance criteria:

- Normal action detail calls remain compact.
- Schema detail calls return enough structure to debug validation failures.
- The same validation contract is used by `submitIntentActions`.

Recommended tests:

- Lookup without `includeSchema` omits schema.
- Lookup with `includeSchema` includes the projected action payload schema.
- Hidden fields remain hidden.

### v1.0: History-Aware Context Compaction

Purpose: prevent fetched details and tool results from bloating long sessions.

Implementation:

- Treat fetched action details as ephemeral task context.
- Track action detail usage in the session or relay layer:
  - requested turn
  - last referenced turn
  - whether the action appeared in the latest successful `submitIntentActions`
- Compact or omit stale action-detail tool results when building future
  requests.
- Keep action summaries always-on.
- Keep details for actions used in the latest successful submission.
- Drop or summarize details unused for a small number of turns.

Acceptance criteria:

- Long action sequences do not accumulate unbounded action detail text.
- The model can still recover by calling `getActionDetails` again.
- Compaction changes request assembly only; it does not mutate app state or
  provenance.

Notes:

- This likely needs cooperation from the Python agent server if it owns
  provider transcript assembly.
- App-side context cleanup alone will not recover tokens from verbatim tool
  results already stored in conversation history.

### v1.1: Budget-Based Detail Retention

Purpose: make cleanup adaptive instead of relying only on turn counts.

Implementation:

- Define a request budget for action-related context and tool-result history.
- Keep summaries outside the disposable budget.
- Rank fetched details by:
  - used in latest successful submission
  - requested in current turn
  - recent usage
  - number of failed validations involving the action
- Omit or summarize the lowest-priority details when the budget is exceeded.

Acceptance criteria:

- Context cleanup responds to actual payload size.
- Important action details survive longer than exploratory or unused details.
- The policy is deterministic enough to test.

## Suggested First Patch

Start with v0.1 after v0.0 measurement exists.

Small first patch scope:

- Add `listAgentActionSummaries()`.
- Change `AgentContext.actionCatalog` to `AgentContext.actionSummaries`.
- Update `contextBuilder.js`.
- Update focused tests.

This should be easy to implement and should immediately reduce the always-on
context without touching validation, execution, provider tool definitions, or
the generated full catalog.

## Open Questions

- Should `generatedActionSummaries.json` remove `title` entirely, or should the
  context projection omit it while the artifact keeps it for debugging?
- Should `getActionDetails` return examples as raw payloads only, or as objects
  with short labels and notes?
- Should schema projection live in `toolCatalog.js`, `actionCatalog.js`, or a new
  focused helper shared by validation and lookup code?
- Which layer owns transcript compaction: browser session controller, Python
  relay, or both?

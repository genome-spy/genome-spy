# Tool Validation and Rejection

This document is the detailed rollout for validating agent tool calls,
rejecting malformed calls, and keeping the agent loop from repeating the same
bad request forever.

Use this document for the validation flow itself. Keep higher-level context in
[`tools.md`](./tools.md), transport details in
[`infrastructure.md`](./infrastructure.md), and relay-specific concerns in
[`python_agent_server.md`](./python_agent_server.md).

## Scope

The app is the validation boundary.

- The Python relay forwards tool calls and tool results.
- The browser app validates, executes, and records outcomes.
- The generated tool schema is the source of truth for tool arguments.
- The local prompt loop and the session controller should follow the same
  rejection semantics.

## Desired States

Each agent tool call should end up in one of these states:

- `accepted`
  - The call matches the schema and any semantic checks.
  - The tool is executed.
  - A successful tool result is recorded.

- `rejected_schema`
  - The call does not match the generated JSON Schema.
  - The tool is not executed.
  - A rejected tool result is recorded with a schema error message.

- `rejected_semantic`
  - The call is structurally valid, but the selector or target cannot be
    resolved in the current app state.
  - The tool is not executed.
  - A rejected tool result is recorded with a semantic error message.

- `runtime_failed`
  - The call was valid when submitted, but execution failed in the current
    app state.
  - The tool is not retried automatically.
  - The failure is recorded as a tool result or error turn, depending on the
    transport path.

## Validation Layers

Use two validation layers, in order:

1. Schema validation
   - Check the generated JSON Schema for the tool input.
   - Reject invalid field names, missing required fields, and type mismatches.
   - Do not mutate the payload to make it fit.

2. Semantic validation
   - Resolve selectors against the real view hierarchy or other live app
     state.
   - Reject calls that refer to views that do not exist or cannot be addressed.
   - Keep this logic close to the tool executor so it sees the live state.

## Failure Policy

The app should never silently ignore invalid tool calls.

- Keep the original assistant `tool_call` turn in history.
- Add a matching `tool_result` turn that explains the rejection.
- Do not execute the tool when validation fails.
- Make the rejection visible to the model and to the user transcript.

Failure messages should be short and specific:

- missing required field `selector`
- `visibility` must be a boolean
- selector did not resolve to a visible addressable view
- tool call used a legacy `key` field instead of `selector`

## Retry Policy

The agent should get one correction opportunity, not an infinite loop.

- After a rejected tool call, request another turn once with the updated
  history.
- If the agent repeats the same invalid call signature, stop and surface an
  error instead of looping.
- Track repeated rejections per turn so the retry cap is explicit and testable.
- Prefer a hard stop over speculative normalization after the first migration
  pass.

## Incremental Rollout

Implement the behavior in small, testable steps.

### 1. Schema validation helpers

- Add a helper that returns the generated schema for a tool by name.
- Add a helper that validates `toolCall.arguments` against that schema.
- Keep tool execution unchanged at first.
- Add unit tests for the basic invalid shapes:
  - missing `selector`
  - `selector` as a string
  - `visibility` as a string

### 2. Rejected calls as transcript entries

- If validation fails, do not execute the tool.
- Append a `tool_result` entry with the call id and rejection reason.
- Keep the original `tool_call` entry in the transcript.
- Make the rejection visible in the chat panel for debugging.

### 3. One retry after rejection

- After a rejected tool call, request another turn once with the updated
  history.
- Add a per-turn retry cap so the loop cannot continue forever.
- Treat repeated invalid calls as a terminal error for that user turn.

### 4. Semantic selector validation

- Resolve `selector` values against the real view hierarchy.
- Reject unresolved selectors with a clear reason.
- Keep semantic validation separate from schema validation so the failure
  class stays obvious.

### 5. Remove compatibility shims

- Remove fallback handling for:
  - stringified `selector`
  - legacy `key`
  - string booleans
- Keep any migration shim narrow and temporary.
- Once the retry/rejection flow is stable, accept only the canonical schema.

### 6. Mirror the flow in the local prompt loop

- Apply the same validation and rejection behavior in
  [`agentAdapter.js`](../src/agent/agentAdapter.js).
- Keep the browser session controller and local debug loop aligned.
- Do not let the two paths drift in retry policy or transcript shape.

### 7. Update prompt and docs

- Update the system prompt to say that invalid tool calls are rejected and
  shown back to the model.
- Update the tool docs to describe the validation and retry policy.
- Keep the prompt language short and explicit.

## Implementation Rules

- Validate before execution.
- Record rejection before retry.
- Retry once, then stop.
- Prefer explicit failure messages over silent coercion.
- Keep the app as the source of truth for tool semantics.
- Keep the Python relay thin.

## Suggested Commit Breakdown

If this becomes too large, split the work like this:

1. Schema validation helpers plus tests.
2. Rejected tool results in the transcript.
3. Retry-once behavior and retry cap.
4. Semantic selector resolution.
5. Remove compatibility shims.
6. Local loop parity.
7. Prompt/doc updates.

## See Also

- [`tools.md`](./tools.md)
- [`infrastructure.md`](./infrastructure.md)
- [`python_agent_server.md`](./python_agent_server.md)
- [`action-schema.md`](./action-schema.md)

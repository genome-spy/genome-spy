# Conversation Server POC

This note captures the first end-to-end conversation prototype between the
chat UI, GenomeSpy App, a thin Python relay server, and an LLM.

## Goal

Enable a read-only conversation with the visualization through the chat UI.
The user should be able to ask questions such as:

- What is in this visualization?
- How are methylation levels encoded?
- What does this axis or track mean?
- Can you explain the current state?

The first version is intentionally simple:

- the chat UI keeps the full conversation transcript
- the app sends the transcript and current agent context on each request
- the Python server relays the request to an LLM provider
- the assistant response is shown back in the chat UI
- errors are shown as errors and nothing else

## POC Scope

### Included

- conversation over the current visualization
- full in-memory chat transcript
- narrative context from the agent snapshot
- provenance in the context payload, if useful
- follow-up questions that rely on the previous turns

### Excluded

- tool calls
- action execution
- validation on the Python side
- transcript/provenance cross-links
- hierarchical provenance
- request truncation or summarization
- retry logic beyond simple failure reporting
- tool-call validation/rejection policy; see [`validation.md`](./validation.md)

## Implemented So Far

The app-side pieces below are already in place:

- `chatPanel.js` keeps the full transcript in memory for the session.
- `chatPanel.js` builds `history` as structured message objects instead of plain
  strings.
- `agentAdapter.js` sends `message`, `history`, and `context` to the planner
  backend.
- `agentAdapter.js` supports the dev-only mock backend path when
  `VITE_AGENT_BASE_URL=mock`.
- `mockPlanner.js` returns deterministic read-only answers and clarifications
  without network access.
- `agentAdapter.js` logs the outgoing request payload and incoming response in
  dev mode.
- `chat-ui.md` describes the controller API using the structured transcript
  shape.

## App ↔ Server Contract

The app and Python server communicate through one relay endpoint:

- `POST /v1/plan`

### Request

The app sends:

- `message`: the latest user message
- `history`: the full chat transcript so far, in order
- `context`: the current agent context snapshot assembled by GenomeSpy

For the POC, `history` should be a simple message array. Keep the shape small:

- `id`
- `role`
- `text`
- optional `kind` for nonstandard assistant turns later

Do not include provenance references yet.

The server should not rebuild or validate the context. It should treat the
payload as already assembled by GenomeSpy.

The server should prepend a fixed system prompt internally, for example:

- "You are an AI assistant in GenomeSpy, a visual analytics app for genomic
  data."

The app does not send provider-specific formatting.

The server should build the LLM prompt in this order:

1. system prompt
2. context snapshot
3. conversation history
4. latest user message

### Request Example

```json
{
  "message": "How are methylation levels encoded?",
  "history": [
    {
      "id": "msg_001",
      "role": "user",
      "text": "What is in this visualization?"
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "text": "This view shows sample-level methylation tracks and annotation tracks."
    }
  ],
  "context": {
    "schemaVersion": 1,
    "sampleSummary": {
      "sampleCount": 61,
      "groupCount": 1
    },
    "viewRoot": {
      "type": "vconcat",
      "title": "viewRoot",
      "description": "Functional Segmentation (FUSE) of ENCODE WGBS data",
      "children": []
    }
  }
}
```

### Response

For the read-only POC, the server should return one of:

- `type: "answer"` with a natural-language `message`
- `type: "clarify"` with a short clarification `message`
- `type: "tool_call"` when the browser should execute a local exploration or visibility tool before the next turn

The browser handles `tool_call` turns locally and then re-asks the planner with
the updated context. Intent programs and provenance-changing actions remain on
their own path.

### Response Example

```json
{
  "type": "answer",
  "message": "Methylation levels are encoded with the beta-value track. The y-axis shows beta values and the rect marks represent values across genomic positions."
}
```

```json
{
  "type": "clarify",
  "message": "Do you want me to explain the track encoding or the color scale?"
}
```

### Failure

If the server returns an error, the app should show the error and stop.

## Mock Server

Before the Python server is available, the POC should support a dev-only mock
server path.

### Environment Switch

- `VITE_AGENT_BASE_URL` controls the agent backend selection.
- When `VITE_AGENT_BASE_URL=mock`, the app should use the mock server instead of
  making a network request.
- The mock server should only be available in dev mode.
- The mock server must not be bundled into production.

### POC Behavior

The mock server should imitate the real server in a small, deterministic way:

- accept the same `message`, `history`, and `context` payload shape
- return the same response envelope shape as the real server
- support read-only answers and clarifications
- avoid network requests entirely

The mock is only a temporary POC tool. It exists so the chat UI can be wired
end-to-end before the Python server is implemented.

## Context Content

The `context` should already contain the semantic material the LLM needs to
answer questions:

- titles
- descriptions
- encodings
- scales
- attributes
- current parameter state
- any provenance that should be visible to the model

The Python server should not rebuild this information.

## Conversation Rules

- Keep all messages for the POC.
- Keep the transcript simple:
  - user messages
  - assistant messages
  - optional later special turns, such as clarifications
- Do not refer from messages to provenance yet.
- If the server fails, show an error and stop.

## Relation to Other Plans

- See [`chat-ui.md`](./chat-ui.md) for the full chat UI plan. The POC uses the
  read-only subset of that interaction model.
- See [`python_agent_server.md`](./python_agent_server.md) for the relay-server
  boundary.
- See [`conversation-and-provenance.md`](./conversation-and-provenance.md) for
  the broader transcript/provenance direction.

## Chat UI Changes Needed

To support this POC, `chatPanel.js` should be adjusted as follows:

- keep the full transcript in memory for the session
- build `history` as an array of message objects, not an array of strings
- use the simple transcript shape from this document:
  - `id`
  - `role`
  - `text`
  - optional `kind` later
- stop truncating history to the last few turns
- update the controller API in `chat-ui.md` and the implementation in
  `chatPanel.js` so `requestPlan()` accepts the structured transcript shape
  instead of `string[]`
- keep the current assistant rendering behavior:
  - answer messages render inline
  - clarify messages render inline
  - errors render inline and stop the flow

The controller-facing `requestPlan()` call can still hide the transport details,
but the chat panel itself should preserve the full transcript and hand it to
the controller as the request history for the POC.

The controller implementation in `agentAdapter.js` should also be updated to
support the mock backend switch:

- read `VITE_AGENT_BASE_URL`
- if the value is `mock`, use the dev-only mock server path instead of `fetch`
- otherwise, continue to call the real `/v1/plan` endpoint
- keep the mock implementation out of production bundles

## Debugging Pointers

Use these files and functions when checking what the app sends to the Python
server:

- [`packages/app/src/agent/chatPanel.js`](../chatPanel.js)
  - `#submitMessage()` prepares the chat request.
  - `#buildHistory()` creates the transcript payload sent to the controller.
- [`packages/app/src/agent/agentAdapter.js`](../agentAdapter.js)
  - `requestPlan()` is the transport boundary for the real server and the mock.
  - `logAgentTransport()` logs the request and response in dev mode.
  - `publishAgentTrace()` publishes timing and high-level execution metadata.
- [`packages/app/src/agent/mockPlanner.js`](../mockPlanner.js)
  - `requestMockPlan()` is the dev-only no-network stand-in for the Python
    server.
- [`packages/app/src/app.js`](../../app.js)
  - `recordAgentTrace()` stores trace entries and emits the
    `genomespy-agent-trace` event.
- [`packages/app/src/components/dialogs/agentTraceDialog.js`](../../components/dialogs/agentTraceDialog.js)
  - the Agent Trace dialog shows the recorded trace entries.

In dev mode, the app also prints the request and response payloads to the
browser console from `agentAdapter.js`.

## Implementation Plan

1. Update the chat UI transcript model.
   - Change `chatPanel.js` and the controller type in `chat-ui.md` so
     `requestPlan()` accepts a structured `history` array instead of `string[]`.
   - Keep the transcript in memory for the session and stop truncating it.
2. Update the app-to-server request contract.
   - Keep `POST /v1/plan`.
   - Send `message`, full `history`, and current `context`.
   - Do not include provenance cross-links yet.
3. Add the dev-only mock server path.
   - Branch on `VITE_AGENT_BASE_URL=mock`.
   - Keep the mock out of production bundles.
   - Return deterministic read-only responses without network access.
4. Implement the Python relay server.
   - Read the request body as-is.
   - Prepend the fixed GenomeSpy system prompt internally.
   - Forward the assembled prompt to the chosen LLM provider.
   - Return only `answer` or `clarify` for the POC.
5. Keep the chat UI read-only for the POC.
   - Render assistant answers inline.
   - Render clarification questions inline.
   - Show errors and stop when the server fails.
6. Verify the first user stories.
   - "What is in this visualization?"
   - "How are methylation levels encoded?"
   - follow-up questions that depend on the previous turns

## Notes

The POC is a bridge to the fuller agent architecture, not the final design.
It should prove that the chat UI can talk about the visualization with a
minimal relay server and a stable context payload.

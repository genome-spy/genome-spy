# Streaming

This document describes how GenomeSpy should handle streaming agent responses.
The goal is to make long-running model calls feel alive without giving up the
structured response contract used by the chat panel, intent execution, and
clarification flows.

## Code References

- Chat panel view: [`chatPanel.js`](../src/agent/chatPanel.js)
- Session controller: committed snapshot plus active-turn fast path
- Agent runtime adapter: [`agentAdapter.js`](../src/agent/agentAdapter.js)
- Storybook mock harness: [`chatPanel.stories.js`](../src/agent/chatPanel.stories.js)
- Python relay server design: [`python_agent_server.md`](./python_agent_server.md)
- Conversation server POC: [`conversation-server-PoC.md`](./conversation-server-PoC.md)

## Goal

- Show immediate feedback when the model starts working.
- Stream visible prose as soon as it is available.
- Preserve the final structured response as the source of truth.
- Avoid the silent “is this broken?” period that long reasoning calls create.
- Keep the chat panel as a view over committed controller state, with a fast
  path for the active turn stream.

## Core Principle

Streaming should be treated as **transient draft state**.

The controller may receive partial text, heartbeat events, or reasoning-summary
deltas while the model is running. The chat panel should subscribe to that
active-turn stream directly for high-frequency draft updates, while the
controller snapshot remains the source of truth for committed state.

This split is implemented in the app-side controller, panel, Storybook mock
harness, and the Python relay SSE endpoint. The remaining work is provider-side
stream normalization across more upstream APIs.

Recommended architecture:

- keep streaming as a fast-path side channel
- keep committed chat state in the snapshot
- keep draft rendering state in the panel
- stream plain Markdown replies directly
- buffer replies that start with `{` or a fenced JSON block until the
  structured object is complete
- ignore unknown stream events
- log unknown events in dev so transport drift is visible
- require the final structured response to commit the turn

That means:

- stream what the user can safely read
- keep structured output for the final turn
- render the draft in place through a fast path
- replace the draft with the final response when the model finishes

Do not stream partial JSON into the UI as if it were final state.

## What Should Stream

Useful streamed content includes:

- visible assistant prose
- reasoning summary text, if the provider exposes it
- transport or progress heartbeats from the relay
- tool/status events if they help explain that the request is still alive

The UI should not expect private reasoning tokens. If the provider offers a
reasoning summary, show it by default.

## What Should Not Stream

- raw chain-of-thought
- partial structured JSON
- incomplete intent batches as if they were final
- half-built clarification options

If the final response is not ready yet, the panel should render the stream as a
draft, not as a committed assistant turn.

## Recommended Response Lifecycle

1. User submits a message.
2. The controller sets `status: "thinking"` and shows a working placeholder.
3. The adapter opens a streaming request.
4. The relay forwards text or summary deltas as they arrive.
5. The panel renders the active-turn stream through its local fast path.
6. The final structured response arrives.
7. The controller validates and commits the final turn.
8. The panel updates the same transcript card in place with the committed
   result.

## Snapshot Shape

The session snapshot should keep committed state separate from the transient
stream.

Recommended fields:

- `messages`
- `status`
- `pendingRequest`
- `pendingResponsePlaceholder`
- `lastResponseDurationMs`

The panel should keep draft text in local view state and update it from the
active-turn stream. The controller snapshot should only carry committed
transcript and turn state, plus enough metadata to identify the active turn.

## UI Behavior

- Show `Working...` immediately when the request starts.
- Reveal streamed prose in the transcript as it arrives.
- Keep the scroll position pinned to the latest draft content.
- Show a small elapsed-time note in DEV mode, even before completion.
- Render streamed prose and the final response in the same transcript card.
- Update that card in place when the final structured response arrives.

For clarifications:

- stream the question text if it is available
- show choice buttons only after the final clarification text is parsed
- do not render partial choices

For intent batches:

- stream any explanatory prose if useful
- keep the action preview and execution summary as final committed content

## Transport Shape

The adapter needs a streaming-friendly request API.

Recommended shape:

- `requestAgentTurn(message, history, { onDelta, onReasoning, onHeartbeat, signal })`
- `onDelta` receives user-visible text chunks
- `onReasoning` receives reasoning-summary chunks, if available
- `onHeartbeat` emits a lightweight "still working" pulse during long pauses
- `signal` allows cancellation when the panel closes or a newer request starts
- `subscribeToActiveTurn(listener)` lets the panel render the current turn
  without waiting for a full snapshot update

Unknown stream events should be ignored by default. In development, they should
be logged so unexpected provider or relay changes are visible early.

The current non-streaming API remains the fallback path when the client does
not request streaming, streaming is disabled server-side, or the relay cannot
expose an event stream.

## Relay Responsibilities

The Python relay should:

- forward provider streaming events
- normalize provider-specific event names into a small app-facing event set
- preserve the final structured response
- suppress raw structured JSON from the visible draft lane
- emit errors early when the request fails

The relay should not build GenomeSpy context or interpret the response beyond
normalization.

## Controller Responsibilities

The session controller should:

- expose the active-turn stream for the panel fast path
- keep the final response as the only committed source of truth
- keep the committed snapshot and active turn id in sync
- clear the active turn when the final response is applied
- correlate the stream with the current turn and provenance ids

The controller should decide when a stream event is visible and when it should
be folded into the committed turn.

## Structured Output Handling

If the response is ultimately structured, stream only the human-readable parts
until completion.

Recommended rule:

- stream prose incrementally
- buffer the final structured object
- replace the draft with the structured card when the response completes

If the upstream model emits fenced JSON or JSON-schema text, the relay should
parse it and stream only the sanitized assistant message, not the raw envelope.

This keeps the UI stable and avoids showing incomplete JSON or incomplete
options.

## Clarification Handling

Clarification is the one place where streaming can be awkward.

Recommended rule:

- stream the question text as a draft if it is available
- do not render buttons until the final clarification text has been parsed
- once the final clarification is committed, extract options and render the
  choice buttons

If the clarification is grounded by app state rather than the model, the
controller can still show the final card without any streamed choices.

## Timing and Feedback

Long-running calls need more than a spinner.

Recommended layered feedback:

- immediate working placeholder
- elapsed-time note after a short delay in DEV mode
- heartbeats while the request is alive but idle; use them as periodic
  "still working" progress events, not as text
- streamed prose once the model starts emitting text

That combination keeps the UI responsive even for thinking-heavy models.

## Implementation Sequence

### Phase 1: Define the stream contract

1. Decide the event vocabulary for the transport layer.
   - `start`
   - `delta`
   - `reasoning_delta`
   - `heartbeat`
   - `final`
   - `error`
2. Keep the final structured response separate from streamed draft events.
3. Decide whether the stream is implemented with SSE, chunked fetch, or an
   async iterator behind the adapter.
4. Define a cancellation path with `AbortController`.

### Phase 2: Add adapter support

1. Extend `agentAdapter.requestAgentTurn(...)` with a streaming-aware variant.
2. Forward streamed text and reasoning-summary updates from the relay.
3. Buffer the final structured response until completion.
4. Keep the current non-streaming request path as the fallback.
5. Normalize provider-specific stream events into a small app-facing shape.

Status: the app-side request contract already accepts stream callbacks, but the
real relay still returns a final response only.

### Phase 3: Extend controller state

1. Add an active-turn stream channel and a request id for the current turn.
2. Keep transient draft text in the panel, not in the committed snapshot.
3. Keep the committed snapshot limited to final turn state and status.
4. Clear the active turn when the final response is committed or cancelled.
5. Preserve the current preflight, queueing, and timing behavior.

Status: implemented in `agentSessionController.js` and covered by tests.

### Phase 4: Render the draft in the panel

1. Show `Working...` immediately when the turn starts.
2. Render streamed prose in the transcript as the active card body.
3. Render reasoning-summary text as a muted helper line.
4. Keep the transcript pinned to the latest streamed content.
5. Replace the active card body with the final structured card when complete.

Status: implemented in `chatPanel.js`.

### Phase 5: Finish structured turns

1. Validate the final structured response after the stream ends.
2. Commit `answer`, `clarify`, and `intent_batch` turns normally.
3. For clarifications, parse options only after the final text is complete.
4. For intent batches, keep action previews and execution results committed
   only after validation succeeds.
5. Handle cancellation and error paths without leaving stale draft state
   behind.

Status: the final turn replacement path is implemented; the structured
completion path still uses the existing final-response contract.

### Phase 6: Add server-side streaming

1. Update the Python relay to forward provider stream events.
2. Preserve the final response envelope used by the app.
3. Emit heartbeats or progress events while the model is still working.
4. Keep GenomeSpy context assembly and response interpretation out of the
   relay.

Status: the relay now exposes an SSE path for `POST /v1/agent-turn` when streaming is
requested. Provider-side streaming normalization is the remaining gap.

### Phase 7: Verify the UX

1. Add tests for draft replacement and final commit.
2. Add tests for cancellation and request replacement.
3. Add tests for clarification parsing from streamed text.
4. Add a Storybook scenario that simulates slow text generation.
5. Add a Storybook scenario that emits heartbeats before the first token.

Status: controller stream tests and Storybook streaming scenarios are in
place; broader coverage for transport-level streaming is still pending.

## Concrete Checklist

### `packages/app/src/agent/agentAdapter.js`

- Request-turn callbacks already flow through the adapter contract.
- Keep the existing non-streaming code path as the fallback until the relay
  supports streaming end to end.
- Normalize provider stream events into the controller-facing event set when
  the relay starts emitting them.

### `packages/app/src/agent/agentSessionController.js`

- Exposes an active-turn stream channel for draft updates.
- Keeps committed snapshot state separate from transient stream state.
- Tracks the active request id and drops stale events.
- Keeps the draft visible until the final structured response arrives.
- Clears transient stream state when the final message is committed or
  cancelled.
- Preserves the current queueing and preflight behavior.

### `packages/app/src/agent/chatPanel.js`

- Subscribes to the active-turn stream for draft updates.
- Renders the streaming draft in the same transcript card as the final result.
- Keeps the card style stable while the text updates.
- Keeps auto-scroll pinned to the latest draft content.
- Renders reasoning summaries as muted helper text below the draft prose.

### `packages/app/src/agent/clarificationMessage.js`

- Reuse the existing clarification parser for streamed final text.
- Only render buttons after the final clarification message is complete.

### `packages/app/src/agent/chatPanel.stories.js`

- Adds stories that simulate slow prose streaming and heartbeat pulses.
- Exercises clarification chunks with the same fast path.

### `utils/agent_server/app/main.py` and relay helpers

- Forward provider streaming events to the app.
- Preserve the final structured response envelope.
- Emit heartbeats or progress pulses during quiet periods.
- Keep GenomeSpy-specific context building out of the relay.
- Ignore unknown provider events unless they are needed for final response
  assembly.

Status: the relay serves SSE for stream requests when streaming is enabled on
the server and keeps the JSON path as the fallback.

### Tests

- Verify draft text is replaced by the final committed card.
- Verify cancellation clears the streaming draft cleanly.
- Verify clarification parsing still works when the text arrives in chunks.
- Verify heartbeat events update the UI without changing committed history.
- Verify unknown stream events are ignored.

### Acceptance Criteria

- The panel shows immediate feedback on submit.
- Long responses visibly progress before completion.
- The final assistant turn still comes from the final structured response.
- Clarification choices still appear as buttons only after the final message is
  known.
- Intent execution behavior stays unchanged apart from the draft streaming
  feedback.
- The non-streaming request path still works as a fallback.

## Non-Goals

- No raw chain-of-thought display.
- No partial JSON rendering as final UI state.
- No persistence of streaming drafts across reloads.
- No streaming-only UI that cannot fall back to final structured output.
- No partial structured object rendering as final state.

## Decisions

- Show reasoning summaries by default when the provider exposes them.
- Treat heartbeat as a periodic "still working" progress event during quiet
  stretches.
- Keep streamed prose and the final structured response in the same transcript
  card, updating it in place.

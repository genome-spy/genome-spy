# Agent Session Controller Plan

This document defines the state boundary for the GenomeSpy agent session.
The goal is to keep the chat panel as a view-only surface while a dedicated
controller owns the durable agent state that spans chat, turn tracking,
preflight, and provenance linkage.

## Why This Exists

The chat panel already needs to show:

- transcript history
- pending request / working state
- clarification choices
- plan previews
- execution summaries
- current visualization context

That information should not live in the UI component itself. The UI should
render a read-only snapshot and forward user intents to a controller. The
controller should own the state transitions, the planner request lifecycle, and
the bridge to provenance and the app store.

The controller must also leave room for upcoming features such as:

- progressive context expansion
- multi-step clarification flows
- future tool commands beyond chat messages
- future UI-driven commands if they become necessary
- preflight and availability checks before the first turn

The architecture should make those additions straightforward without adding
placeholder methods now.

## Code References

- Chat UI view: [`chatPanel.js`](../src/agent/chatPanel.js)
- Runtime adapter: [`agentAdapter.js`](../src/agent/agentAdapter.js)
- Context assembly: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- View-tree context: [`viewWorkflowContext.js`](../src/agent/viewWorkflowContext.js)
- View-tree resolution: [`viewWorkflowResolver.js`](../src/agent/viewWorkflowResolver.js)
- Intent execution: [`intentProgramExecutor.js`](../src/agent/intentProgramExecutor.js)
- Provenance summary helpers: [`actionCatalog.js`](../src/agent/actionCatalog.js)

## Design Goals

- Keep the chat panel dumb enough that it can be replaced or tested in
  isolation.
- Make agent state explicit and serializable where possible.
- Keep message history and turn state together in one controller so planner
  context stays coherent.
- Preserve provenance as a separate app concern, but let the controller store
  stable ids that correlate messages, turns, and provenance entries.
- Support preflight checks when the panel opens, including prompt-cache priming
  and server availability detection.
- Queue user input while a preflight check is running.
- Provide a clean path for future extensions without introducing methods that
  do not belong to the current product scope.

## Recommended Responsibility Split

### Agent session controller

The controller owns:

- transcript history
- pending turn state
- preflight state
- current working status
- correlation ids for chat messages and provenance entries
- planner request assembly
- planner response reconciliation
- execution dispatch and result capture
- derived snapshot creation for the view

### Chat panel view

The view owns:

- rendering the transcript
- rendering the working placeholder
- rendering clarification cards and plan cards
- collecting free-text input
- sending message and command events to the controller
- showing controller-derived status

The view should not decide how planner context is built or how other session
state is stored.

## State Model

The controller should keep one session state object that can be read as a
snapshot by the UI and updated through explicit commands.

Recommended state groups:

- `conversation`
  - ordered chat messages
  - message ids
  - message kinds and provenance links
  - clarification replies
- `turn`
  - idle / preflighting / waiting / working / error
  - pending user message
  - pending planner request
  - queued user input while preflight is active
- `provenance`
  - ids for dispatched actions
  - ids for current branch and turn
  - human-readable summaries
- `diagnostics`
  - last error
  - last preflight failure
  - dev timing metadata

The controller should expose a single read-only snapshot to the UI so the view
does not reconstruct state from multiple sources.

## Command Boundary

Use a small command envelope instead of one method per future action. That
keeps the controller extensible without adding empty methods for features that
are not implemented yet.

Recommended command categories:

- `message`
  - user submits a free-text message
  - clarification reply selects a response
- `session`
  - open
  - close
  - reset
  - retry
- `diagnostic`
  - request a refresh
  - record a preflight result

This command model should be implemented as a reducer-like transition layer or
an explicit command handler, not as a large ad hoc UI callback set.

## Preflight Flow

When the chat panel opens, the controller should issue a preflight request.
That request has two purposes:

1. prime the prompt prefix cache on the server
2. verify that the server is available and functional before the user sends a
   real message

The preflight should use the same request path as normal planning. The
controller sends a harmless dummy message through the regular planning flow,
checks that the call succeeds, and discards the response after the health check
passes.

### Expected behavior

- The first open triggers the preflight automatically.
- While preflight is running, user input is accepted but queued.
- Once preflight succeeds, queued input is sent in order.
- If preflight fails because of a connection or availability error, the UI
  should surface a message like:
  - `It seems that the agent is currently unavailable.`
- The UI should not need to know whether the failure came from cache priming or
  transport; it only needs a clear unavailable state.

### Implementation notes

- The controller should keep the preflight state separate from the normal
  message turn state.
- A successful preflight should be treated as a session milestone, not as a
  visible assistant message.
- A failed preflight should produce a visible error state and leave the queued
  message intact until the user retries or the controller can safely continue.

## Message History

The controller owns the authoritative history used for follow-up planner calls.

History should include:

- user messages
- assistant answers
- clarification prompts and replies
- plan previews
- execution results
- any turn-level message that affects the next planner request

The UI should render messages from the snapshot, but it should not maintain the
planner history separately.

### History discipline

- Keep the visible transcript and the planner history aligned.
- Preserve ids so messages can be correlated with provenance entries.
- Do not rely on the UI component to filter or normalize history for the
  controller.

## Planner Request Lifecycle

The controller should manage the full lifecycle of a user turn:

1. receive a user message or command
2. queue it if preflight is still running
3. build the planner request from the current snapshot
4. call the runtime adapter
5. render the planner response into session state
6. execute intent programs when returned
7. record provenance ids and summaries
8. expose the updated snapshot to the UI

The UI should only know that the controller is busy, waiting for clarification,
or ready for another message.

## Provenance Correlation

The controller should keep the mapping between chat messages and provenance
entries.

This layer should:

- assign stable ids to messages and turns
- remember which turn produced which provenance entries
- preserve the link between plan preview, execution result, and provenance
- allow the provenance menu to stay generic while the agent layer keeps its own
  correlation data

Provenance itself should remain free of agent-specific UI concepts.

## View Snapshot API

The chat panel should receive a snapshot that is safe to render directly.

That snapshot should contain:

- transcript messages
- current status
- pending request or queued request state
- current working placeholder text
- execution summaries for the latest turn
- last error

The panel should not inspect app store internals or request its own planner
context.

## Development and Debugging Notes

When running in DEV mode, the controller should expose timing information for
the latest response so the UI can show a small note under the assistant reply
with the generation time in seconds.

This should be derived from controller diagnostics, not from a hardcoded UI
timer.

## Code Comment Guidance

Add comments in code at the boundaries that will grow with later features.
The comments should explain how the current state model is intended to expand.

Recommended places for comments:

- the controller state object
- the command reducer / handler
- the preflight queue
- the provenance correlation map
- the dev-only timing metadata

The comments should describe future expansion paths, not implementation
history.

## Implementation Sequence

1. Introduce a controller/session module that owns transcript state and turn
   state.
2. Move planner history construction out of the chat panel and into the
   controller.
3. Add preflight state and queueing before the first real message.
4. Keep the panel rendering from a read-only snapshot and emitting commands.
5. Wire dev-only timing notes to controller diagnostics.
6. Add future extension hooks only when the corresponding UI affordances exist.

## Non-Goals

- No message persistence across reloads for the first version.
- No prompt chips in the first version.
- No streaming token UI in the first version.
- No placeholder controller methods for features that are not yet implemented.
- No duplication of provenance storage inside the chat component.

## Open Questions

- Should the controller live next to the chat panel or alongside the existing
  agent adapter utilities?
- Should the dummy preflight message be configurable, or should it stay fixed
  and internal to the controller?
- Should any future derived session state be stored as stable ids only, or
  also as a derived projection for fast rendering?

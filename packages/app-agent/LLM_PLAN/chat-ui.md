# Chat UI

This note tracks the current chat panel shape for the GenomeSpy agent. It is a
short reference, not a full design proposal.

## Current Shape

- [`chatPanel.js`](../src/agent/chatPanel.js) is the panel implementation.
- The panel is a self-contained Lit component with shadow DOM and local styles.
- The panel talks to a controller object, not to deep agent modules.
- The controller owns snapshot state, message history, preflight, queueing,
  turn execution, and DEV timing diagnostics.
- The panel owns only ephemeral UI state such as draft text and scroll/focus
  state.
- Storybook provides a mock controller so the panel can be exercised without
  the real agent service.

## Controller Boundary

The panel uses a small controller API:

- `getSnapshot()`
- `subscribe(listener)`
- `open()`
- `close()`
- `sendMessage(message)`
- `queueMessage(message)`
- `refreshPreflight()`

The current implementation may expose a few extra methods for active-turn
streaming or tool execution, but the panel should stay on this boundary.

## UI Expectations

- Show user and assistant messages in a compact transcript.
- Show clarification prompts as selectable follow-ups.
- Show intent-batch previews before execution.
- Show execution summaries inline after the agent acts.
- Treat preflight as a connectivity check, not as a user confirmation flow.
- Allow direct execution for valid, undoable, non-destructive actions.

## Styling

- Keep the component self-contained.
- Avoid touching global app styles for the panel itself.
- Keep the implementation near the rest of the agent code.

## Storybook

- Keep a dedicated story for the chat panel.
- Use deterministic canned responses.
- Cover answer, clarification, intent-batch, preflight success/failure, and
  queued-input cases.

## Split Rule

The panel should not import deep app or agent internals when a public boundary
exists. If the panel needs more app surface later, add a small explicit export
instead of duplicating code or types.

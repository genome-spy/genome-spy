# LLM Chat UI Design

This document describes the user-facing chat interface for the GenomeSpy agent.
It focuses on component shape, interaction flow, and implementation constraints.

## Code References

- Chat panel component: [`chatPanel.js`](../src/agent/chatPanel.js)
- Agent session controller: controller-owned snapshot and message history
- Agent runtime adapter: [`agentAdapter.js`](../src/agent/agentAdapter.js)
- Toolbar entry point: [`toolbarMenu.js`](../src/agent/toolbarMenu.js)
- Browser integration tests: [`agentAdapter.browser.test.js`](../src/agent/agentAdapter.browser.test.js)

## Goal

- Provide a compact chat surface for asking questions, issuing commands, and reviewing assistant output.
- Keep the component self-contained so it does not depend on global stylesheet changes.
- Render a read-only snapshot owned by the agent session controller.
- Fit the existing GenomeSpy agent flow: context snapshot, proposal, validation, execution, provenance.
- Make the component available in Storybook for development, documentation, and testing.

## Recommended Component Shape

- Start with one shadow-DOM web component.
- Use a single top-level docked component such as `gs-agent-chat-panel`.
- Keep the implementation under `packages/app/src/agent` so the chat UI stays close to the rest of the agent code.
- Keep transcript rendering, composer handling, clarification UI, and proposal preview inside the same component.
- Keep the component stateless with respect to agent session data; the controller owns the transcript and turn state.
- Split into multiple web components only if a subpart becomes reusable or materially harder to maintain.

## Interaction Model

- User submits a message.
- When the panel opens, the controller runs a preflight request through the same agent-turn path with a harmless dummy message, primes the prompt prefix cache, and verifies that the server is available.
- While preflight is running, user input is queued.
- If preflight fails, the panel should show a clear unavailable state such as `It seems that the agent is currently unavailable.`
- The agent responds with one of:
  - `answer`
  - `clarify`
  - `intent_batch`
- If the response is a direct answer, show it in the transcript.
- If the response is a clarification request, render selectable follow-up options.
- If the response is an intent batch, show a short proposal preview and execute it immediately after validation.
- Do not require a confirmation step by default for undoable, non-destructive actions.
- Use provenance and undo as the safety net after execution.
- Do not persist message history across reloads for the first version.
- Do not ship prompt chips in the first version.
- Treat token streaming as a later enhancement, not an MVP requirement.
- In DEV mode, show a small response-time note under assistant replies using controller diagnostics.

## Suggested UI Sections

- Header
  - Agent title
  - Current status
  - Trace shortcut
  - Close action
- Transcript
  - User messages
  - Assistant messages
  - Clarification cards
  - Proposal cards
  - Execution summaries
  - The execution summary should list the intent actions the agent just dispatched.
- Composer
  - Multiline text input
  - Send button
  - Pending input queue indicator while preflight is running
- Session status
  - Preflight state
  - Current turn state
  - Last error
  - DEV-only response timing note

## Styling and Encapsulation

- Use LitElement with shadow DOM.
- Put all component CSS in `static styles`.
- Reuse the existing component style conventions from `packages/app/src/components/generic` and `packages/app/src/components/dialogs`.
- Avoid touching global stylesheets for the first version.
- Use local buttons, cards, and spacing tokens inside the component instead of relying on page-level CSS.
- Add comments in the component code where the state model or view model is expected to expand with upcoming features, especially around preflight queueing and provenance correlation.

## Storybook

- Add a dedicated Storybook story for the chat panel.
- Keep the story in the same agent folder as the implementation, following the existing `*.stories.js` pattern.
- Provide a realistic mock controller in Storybook so the component can be exercised without the real agent service.
- The mock should simulate:
  - plain answers
  - clarification requests
  - valid intent batches
  - execution summaries
  - simple error states
- The mock should also simulate preflight success, preflight failure, and queued user input while preflight is active.
- Prefer deterministic canned responses over random behavior so stories are useful for docs and tests.
- Keep the mock isolated to Storybook and test utilities.

## State Model

Keep the component UI state small and explicit:

- `snapshot`
- `draft`
- local focus/scroll state
- transient composer state

The session controller owns:

- message history
- pending request / turn state
- preflight state
- provenance correlation ids
- derived agent context
- error and timing diagnostics

Recommended message kinds:

- `user`
- `assistant`
- `status`
- `clarification`
- `proposal`
- `result`
- `error`

## Confirmation Policy

- Do not block every intent with a confirmation dialog.
- Ask for clarification only when the request is ambiguous or missing required context.
- Allow direct execution for valid, undoable, non-destructive intents.
- Surface a visible preview before execution when the assistant produces a multi-step proposal.
- Show undo and provenance after execution.
- Keep preflight separate from normal confirmation logic; it is a connectivity check, not a user decision point.

## Public API

The component should expose a small, stable API:

- a controller prop for agent communication
- a read-only `snapshot` property derived from the controller
- local methods for internal panel behavior such as focus and scroll handling
- optional event hooks for execution completion and errors if the app shell needs them

## Communication Boundary

- Do not have the chat component import deep modules from `packages/app/src/agent`.
- Treat the agent layer as a controller boundary.
- The panel should talk to one small controller object that is implemented by:
  - the real app agent adapter at runtime
  - a mock controller in Storybook
- The controller can expose:
  - `getSnapshot()`
  - `subscribe(listener)`
  - `open()`
  - `close()`
  - `sendMessage(message)`
  - `queueMessage(message)`
  - `refreshPreflight()`
- Keep agent request/validation/execution logic out of the UI component itself.
- Let the UI focus on rendering messages, collecting input, and showing outcomes.
- The controller should own the history used for follow-up agent turns and should hand the panel a render-ready snapshot.
- The panel should treat `snapshot` as the render input and update it through controller subscription, not by querying the app state directly.
- The controller also owns preflight, queueing, and DEV timing diagnostics.

Suggested shape:

```js
/**
 * @typedef {object} AgentChatController
 * @property {() => any} getSnapshot
 * @property {(listener: (snapshot: any) => void) => () => void} subscribe
 * @property {() => Promise<void>} open
 * @property {() => void} close
 * @property {(message: string) => Promise<void>} sendMessage
 * @property {(message: string) => Promise<void>} queueMessage
 * @property {() => Promise<void>} refreshPreflight
 */
```

- The panel submits a message intent and receives a controller-updated snapshot.
- The panel renders the snapshot and reacts to controller state transitions.
- The panel should not know whether the controller is backed by a live server or a mock.
- The panel should keep only ephemeral local UI state such as draft text and scroll position.

## Execution Summary

- Show the actions dispatched by the current agent turn inline in the chat panel.
- Render those actions with the same human-readable functions used by the provenance UI.
- Keep earlier actions out of the chat transcript summary; they remain available in the provenance menu.
- If the execution returns multiple actions, render them as a compact ordered list.
- If execution fails, show the error and keep the dispatched action preview visible.
- If the response takes place in DEV mode, show a small timing note under the assistant response, derived from the controller diagnostics rather than measured in the component.

## Open Questions

- Should the controller expose a single snapshot object or a small set of reactive slices?
- Should queued input be visible as a subtle transcript note or only reflected in the composer state?

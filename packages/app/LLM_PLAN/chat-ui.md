# LLM Chat UI Plan

This document describes the user-facing chat interface for the GenomeSpy agent.
It focuses on component shape, interaction flow, and implementation constraints.

## Goal
- Provide a compact chat surface for asking questions, issuing commands, and reviewing assistant output.
- Keep the component self-contained so it does not depend on global stylesheet changes.
- Fit the existing GenomeSpy agent flow: context snapshot, plan, validation, execution, provenance.
- Make the component available in Storybook for development, documentation, and testing.

## Recommended Component Shape
- Start with one shadow-DOM web component.
- Use a single top-level docked component such as `gs-agent-chat-panel`.
- Keep transcript rendering, composer handling, clarification UI, and plan preview inside the same component.
- Split into multiple web components only if a subpart becomes reusable or materially harder to maintain.

## Interaction Model
- User submits a message.
- The agent responds with one of:
  - `answer`
  - `clarify`
  - `intent_program`
- If the response is a direct answer, show it in the transcript.
- If the response is a clarification request, render selectable follow-up options.
- If the response is an intent program, show a short plan preview and execute it immediately after validation.
- Do not require a confirmation step by default for undoable, non-destructive actions.
- Use provenance and undo as the safety net after execution.
- Do not persist message history across reloads for the first version.
- Do not ship prompt chips in the first version.
- Treat token streaming as a later enhancement, not an MVP requirement.

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
  - Plan cards
  - Execution summaries
  - The execution summary should list the intent actions the agent just dispatched.
- Composer
  - Multiline text input
  - Send button
  - Optional prompt chips for common requests
- Context strip
  - Current view
  - Current selection
  - Relevant attribute or field context
  - Undo/provenance affordance

## Styling and Encapsulation
- Use LitElement with shadow DOM.
- Put all component CSS in `static styles`.
- Reuse the existing component style conventions from `packages/app/src/components/generic` and `packages/app/src/components/dialogs`.
- Avoid touching global stylesheets for the first version.
- Use local buttons, cards, and spacing tokens inside the component instead of relying on page-level CSS.

## Storybook
- Add a dedicated Storybook story for the chat panel.
- Keep the story in the same component folder as the implementation, following the existing `*.stories.js` pattern.
- Provide a realistic mock agent in Storybook so the component can be exercised without the real planner service.
- The mock should simulate:
  - plain answers
  - clarification requests
  - valid intent programs
  - execution summaries
  - simple error states
- Prefer deterministic canned responses over random behavior so stories are useful for docs and tests.
- Keep the mock isolated to Storybook and test utilities.

## State Model
Keep the component state small and explicit:
- `messages`
- `status`
- `draft`
- `pendingRequest`
- `lastPlan`
- `lastError`
- `contextSummary`

Recommended message kinds:
- `user`
- `assistant`
- `status`
- `clarification`
- `plan`
- `result`

## Confirmation Policy
- Do not block every intent with a confirmation dialog.
- Ask for clarification only when the request is ambiguous or missing required context.
- Allow direct execution for valid, undoable, non-destructive intents.
- Surface a visible preview before execution when the assistant produces a multi-step plan.
- Show undo and provenance after execution.

## Public API
The component should expose a small, stable API:
- a controller or adapter prop for agent communication
- current context or context summary
- methods for opening/closing the panel, if needed
- optional event hooks for execution completion and errors

## Communication Boundary
- Do not have the chat component import deep modules from `packages/app/src/agent`.
- Treat the agent layer as an adapter boundary.
- The panel should talk to one small controller object that is implemented by:
  - the real app agent adapter at runtime
  - a mock agent adapter in Storybook
- The controller can expose:
  - `getAgentContext()`
  - `requestPlan(message, history?)`
  - `validateIntentProgram(program)`
  - `submitIntentProgram(program)`
  - `summarizeExecutionResult(result)`
- Keep planner request/validation/execution logic out of the UI component itself.
- Let the UI focus on rendering messages, collecting input, and showing outcomes.

Suggested shape:

```js
/**
 * @typedef {object} AgentChatController
 * @property {() => import("../agent/types.d.ts").AgentContext} getAgentContext
 * @property {(message: string, history?: string[]) => Promise<{ response: any, trace: any }>} requestPlan
 * @property {(program: unknown) => { ok: boolean, program?: any, errors?: string[] }} validateIntentProgram
 * @property {(program: any) => Promise<any>} submitIntentProgram
 * @property {(result: any) => string} summarizeExecutionResult
 */
```

- The panel submits a message and receives a planner response.
- The panel renders the response and, when needed, calls validation and execution through the controller.
- The panel should not know whether the controller is backed by a live server or a mock.

## Execution Summary
- Show the actions dispatched by the current agent turn inline in the chat panel.
- Render those actions with the same human-readable functions used by the provenance UI.
- Keep earlier actions out of the chat transcript summary; they remain available in the provenance menu.
- If the execution returns multiple actions, render them as a compact ordered list.
- If execution fails, show the error and keep the dispatched action preview visible.

## Open Questions
- How much of the context summary should be visible inline in the panel?
- Should the mock agent live only in Storybook stories, or also in shared test utilities?

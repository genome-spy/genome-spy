# Per-Turn Workflow State

This note sketches a lightweight plan state for multi-round agent turns that
need several tool calls. The goal is to make tool workflows easier to recover
and debug without adding a persistent cross-turn planner.

## Problem

The current agent loop supports sequential tool use, but planning is implicit.
The model can write a short plan in assistant prose, then call tools. That prose
is stored in chat history, but the controller does not know which step is
current, which steps are complete, or whether a later tool result invalidated
the plan.

This is usually enough for short workflows. It is fragile when the task spans
several dependent tool rounds, for example:

- search for a gene, select its interval, build an aggregation, and filter
  samples
- undo one analysis step, apply a replacement action, and report the new state
- compare several loci one by one while a single mutable selection parameter is
  reused

## Proposed Scope

Keep workflow state scoped to one user message.

- Create or update it only inside the active `AgentSessionController` tool loop.
- Clear it when the model returns a final `answer`, `clarify`, an error, or the
  turn is cancelled.
- Do not carry it into the next user request by default.
- Treat a later "continue" feature as a separate design problem.

This avoids stale plans after the user changes direction.

## Shape

Start with a compact structured object:

```ts
interface AgentWorkflowState {
    userGoal: string;
    completed: string[];
    next: string;
    cautions?: string[];
}
```

The state should describe external workflow progress, not hidden chain of
thought. Examples:

- `userGoal`: "Filter samples with TP53 mutations."
- `completed`: ["Found TP53 in the gene annotation view."]
- `next`: "Create an interval selection covering TP53."
- `cautions`: ["The active provenance state is already current; choose an
  earlier state for undo."]

## Response Contract

Add optional workflow state to tool-call responses:

```ts
type AgentTurnResponse =
    | {
          type: "tool_call";
          message?: string;
          toolCalls: AgentToolCall[];
          workflow?: AgentWorkflowState;
      }
    | {
          type: "answer" | "clarify";
          message: string;
          workflowStatus?: "complete" | "blocked" | "partial";
      };
```

The controller stores `workflow` separately from visible chat messages. It may
render a compact progress indicator later, but the first implementation can keep
it internal/debug-only.

## Prompting Rule

The system prompt should ask for `workflow` only when the request likely needs
multiple tool rounds or dependent actions. Simple answers and one-step tool
calls should not include it.

The prompt should also say:

- update `completed` after every tool result
- keep `next` as the single immediate next action
- if a tool result says no state changed, revise `next` instead of repeating
  the same call
- return a final answer when the goal is complete

## Controller Behavior

During one user turn:

1. Send the current workflow state near the current user message or in recent
   history.
2. When a `tool_call` response includes `workflow`, replace the stored workflow
   state with it.
3. Execute tools and append tool results as today.
4. Re-run the model with refreshed context, history, and the latest workflow
   state.
5. Clear workflow state on `answer`, `clarify`, cancellation, error, or loop
   budget stop.

The controller should not validate every workflow step at first. It should only
preserve and replay the state. Validation can come later if needed.

## Benefits

- Makes long workflows easier for the model to resume after tool results.
- Gives loop recovery a place to say what changed in the plan.
- Improves debugging because developers can inspect goal, completed work, and
  the immediate next step.
- Keeps the UX ready for a future progress indicator without changing the
  underlying tool loop.

## Risks

- The model may produce stale or vague workflow text.
- The response contract becomes wider and must stay aligned between browser,
  relay, and prompt parsing.
- Local OpenAI-compatible models may ignore the optional field.

Keep the first version optional and non-authoritative. The tool loop should
still work if the model omits workflow state.

## Implementation Steps

1. Extend browser and Python response models with optional `workflow` on
   `tool_call` responses.
2. Add `AgentSessionController` storage for the active per-turn workflow state.
3. Replay the workflow state to the next model round as a compact developer or
   context block.
4. Update the system prompt to request workflow state only for multi-round
   dependent workflows.
5. Add tests for:
   - workflow state preserved across tool rounds
   - workflow state cleared after final answer
   - workflow state cleared after cancellation/error
   - omitted workflow state remains backward compatible

# Conversation and Provenance

This note captures the current direction for combining chat, provenance, and
visualization state in the GenomeSpy agent.

The goal is for the user to be able to discuss the visualization with the
chatbot. The underlying model should preserve the causal chain behind each
state change so follow-up questions and branching actions stay grounded in the
current app state.

## Code References

- Conversation and planner orchestration: [`agentAdapter.js`](../src/agent/agentAdapter.js)
- Planner context snapshot: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- Execution and provenance summaries: [`intentProgramExecutor.js`](../src/agent/intentProgramExecutor.js)
- Action catalog summaries: [`actionCatalog.js`](../src/agent/actionCatalog.js)
- Agent UI trace entry points: [`toolbarMenu.js`](../src/agent/toolbarMenu.js), [`chatPanel.js`](../src/agent/chatPanel.js)

## Core Synthesis

The user should experience a conversation over the current visualization. The
implementation should keep three things separate:

- conversation transcript
- current visualization state
- provenance / action history

These should be linked causally, not merged into one blob.

Draft linkage model: keep a chat transcript for user/assistant messages, and
keep a provenance tree for state-changing actions. The current visualization
state is derived from the live app state plus the active provenance branch and
any currently expanded agent-context overlay, not from a separate snapshot
store. The link between them should be one-directional from the agent add-on to
provenance: the add-on can attach stable ids to the messages it manages and
point those messages at provenance entries, but provenance itself should stay
generic and not depend on agent concepts. Tool-call correlation ids belong to
the transcript layer only; view-tree nodes should not carry call ids. That
keeps the core/app side reusable while still letting the agent see which
conversation messages led to which mutations and which tool calls expanded the
current context.

## Why This Matters

- The chat UI needs to support follow-up questions and clarifications.
- The agent needs the current visualization state, not a full history dump.
- Provenance already records the state-changing actions, so it can serve as the
  canonical mutation log.
- User- and agent-initiated actions should both land in provenance.
- High-level intent is usually already visible from the action type and payload;
  what is not obvious is why a path was chosen or retained.
- The agent add-on can keep its own message/provenance correlation layer
  without making provenance itself agent-specific.

## Recommended Model

### Conversation log

Tracks:

- user messages
- assistant answers
- clarification prompts
- user replies to clarifications
- assistant tool-call requests
- tool results returned to the model

### Provenance tree

Tracks:

- dispatched actions
- action results
- rollback / back / cancel branches
- abandoned alternative paths
- rationale for why a branch or action was retained
- stable ids that let the add-on correlate chat messages with provenance entries

### Visualization state

Tracks:

- the current collapsed view tree
- branches revealed by context-expansion tools
- active selections and params
- the current data/state summaries

### Derived planner context

Build the agent prompt from:

- the current collapsed visualization state
- the active provenance branch
- a short recent conversation summary
- any unresolved clarification state

## Branching

Do not delete abandoned paths when the user or agent backs up and tries a new
path. Keep them as inactive branches in provenance.

Default display can remain linear:

- show the active branch expanded
- collapse inactive branches
- expand on demand later if needed

## Background Annotation

A background model can annotate collapsed provenance branches with derived
metadata such as:

- likely intent
- reason a branch was abandoned
- short summary
- tags like `correction`, `rollback`, or `failed_selection`

These annotations should be derived only. They must not replace canonical
provenance.

## Provenance Fields

The action itself usually already expresses the intent well enough when actions
are high-level. The extra field that is worth keeping is:

- `rationale`

Use it to explain:

- why this branch was chosen
- why an alternative was abandoned
- why the action was kept after clarification
- why the current path is preferred

Keep it short and human-readable. It should explain the decision, not repeat the
full transcript or internal reasoning trace.

## Linking Rule

Provenance should not know about the chat system. Instead, the agent add-on can
record which chat message or clarification led to a given provenance branch by
storing stable ids in its own layer. The provenance entries themselves only need
generic ids and parent/branch metadata; the add-on can map those ids back to the
conversation when it builds the planner context or renders the transcript.

## Revision Plan For The Current Architecture

As of 2026-04-07, the agent code still treats conversation, state, and
provenance as mostly separate projections over the current app state. To support
this model, the architecture should be revised as follows:

- Make provenance an append-only tree with stable ids, parent ids, branch ids,
  actor metadata, and a short summary for each entry.
- Keep the active branch as the default linear projection, but preserve inactive
  branches for back/cancel and alternate attempts.
- Keep tool-call correlation ids in the transcript layer, not in the view tree.
  The transcript can preserve which tool call produced which result, while the
  view tree only reflects the resulting revealed state.
- Let the agent add-on maintain a separate correlation layer that links chat
  messages and clarification replies to provenance ids.
- Keep the visualization state compact and current by default; do not store
  multiple full snapshots in the normal planner context.
- Treat progressive revealing as a context overlay. Tool results may expand or
  collapse the agent’s current view of a branch, but they should not add
  transport metadata to the tree itself.
- Assemble planner context from the current message context, the active
  provenance branch, and the current collapsed visualization state.
- Use background annotation only for collapsed or inactive provenance branches.
  The annotation layer can summarize why a branch was abandoned or retained, but
  it must not replace the canonical provenance tree.
- Keep the core/app side generic. Provenance should expose stable ids and branch
  structure, but it should not depend on agent-specific message concepts.

This revision keeps the agent add-on self-contained while allowing the planner
to reason about which conversation messages led to which state mutations.

## Draft Message History Shape

Draft idea:

```json
{
  "conversationId": "conv_20260407_01",
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "text": "What's in this visualization?",
      "basedOnProvenance": ["prov_001"]
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "text": "This view shows sample-level data with annotation tracks.",
      "basedOnMessages": ["msg_001"],
      "basedOnProvenance": ["prov_001"]
    },
    {
      "id": "msg_003",
      "role": "user",
      "text": "Brush March to May on the x-axis.",
      "basedOnMessages": ["msg_002"],
      "basedOnProvenance": ["prov_001"]
    },
    {
      "id": "msg_004",
      "role": "assistant",
      "kind": "tool_call",
      "text": "I’ll set the brush interval and verify the resulting selection.",
      "toolCalls": [
        {
          "callId": "call_123",
          "name": "submitIntentProgram",
          "arguments": {
            "steps": []
          }
        }
      ],
      "basedOnMessages": ["msg_003"],
      "basedOnProvenance": ["prov_001"],
      "dispatchedProvenanceIds": ["prov_011", "prov_012"]
    },
    {
      "id": "msg_005",
      "role": "tool",
      "toolCallId": "call_123",
      "name": "submitIntentProgram",
      "content": {
        "ok": true
      },
      "basedOnMessages": ["msg_004"]
    },
    {
      "id": "msg_006",
      "role": "assistant",
      "text": "Done. The brush is now set to the requested interval.",
      "basedOnMessages": ["msg_005"],
      "basedOnProvenance": ["prov_011", "prov_012"]
    },
    {
      "id": "msg_007",
      "role": "assistant",
      "kind": "clarification",
      "text": "The x-axis uses month-based values. Should I interpret March to May as month-date values?",
      "options": [
        {
          "value": "yes",
          "label": "Yes, use month-date values"
        },
        {
          "value": "no",
          "label": "No, let me adjust the request"
        }
      ],
      "basedOnMessages": ["msg_003"],
      "basedOnProvenance": ["prov_001"]
    }
  ]
}
```

Notes:

- The message history stays in the conversation layer.
- There is no separate grouping id in the draft; if grouping becomes
  necessary later, add it explicitly.
- There is no `createdAt` in the draft; ordering can be derived from array
  position unless a time field becomes necessary later.
- `kind` is optional and only needed for special cases like clarifications.
- `kind: "tool_call"` marks an assistant turn that requests one or more tool
  executions.
- A message may carry both `text` and `toolCalls`. If `toolCalls` are present,
  treat the message as a tool-request turn, not as the final user-facing answer.
- Tool results are separate `role: "tool"` messages and must preserve the
  matching `toolCallId` / `callId`.
- Tool results can be used to expand the current agent context, but the
  expanded branch belongs in the view tree / context overlay, not in the
  message history itself.
- `basedOnMessages` lists the message ids that informed the message at the
  time it was written.
- `basedOnProvenance` lists the provenance ids that informed the message
  at the time it was written.
- `dispatchedProvenanceIds` are attached by the add-on layer after successful
  action execution. Use an array because one message may lead to multiple
  actions.
- The planner can use the messages plus the linked provenance ids to reconstruct
  the active reasoning path without making provenance depend on chat concepts.
- If you want to tie a message or action to the state after execution, use the
  provenance entry itself rather than adding a separate state reference to the
  message.
- Do not attach tool-call ids to view-tree nodes. If the add-on needs that
  linkage for debugging or replay, keep it in the transcript/provenance layer.

## Practical Default

The smallest useful version is:

- one chat transcript
- one current collapsed visualization state
- an append-only provenance tree with an active branch
- a planner context assembled from those projections

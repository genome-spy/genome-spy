# Tool Result Trimming Plan

This document outlines a focused plan for trimming model-facing tool results in
the GenomeSpy app agent. The goal is to reduce transcript bloat while
preserving the information the model needs to:

- know what has already been done,
- know what information is now available for the next step,
- and learn from failed tool calls without replaying full raw payloads.

This plan is intentionally narrower than the broader prompt-budget work. It
targets only the history lane that carries tool call outputs between tool-loop
rounds.

## Bottom Line

The intended behavior is simple:

- keep full raw tool results locally if we want them for UI or debugging
- send only a compact version of tool results to the model
- keep compact tool-result memory only for the last few tool rounds
- keep failure information for the same recent window so the model can avoid
  repeating bad calls

Nothing in this plan requires the software to invent new reasoning. The compact
result is produced by deterministic code. If a useful field cannot be extracted
reliably in code, it should be omitted.

## Problem

The current session controller stores tool-result `content` objects in chat
history, and the relay serializes those results into Responses API
`function_call_output` items with little or no trimming.

That behavior is useful because the model can inspect prior tool results on the
next loop iteration. It is also expensive because many tool results contain
more structure than the next reasoning step needs.

At the same time, tool-result trimming cannot be naive:

- successful tool results often create identifiers or constraints needed by the
  next tool call
- failed tool calls often teach the model what not to repeat
- some tool results represent analysis progress and should remain visible in a
  compact form

So the right goal is not “remove tool results from history.” It is:

- keep recent tool-result memory
- compact it aggressively
- and drop older tool-result detail after a few rounds

## Current Behavior

Relevant code paths:

- tool execution and transcript storage:
  [`agentSessionController.js`](../src/agent/agentSessionController.js)
- browser request assembly:
  [`agentAdapter.js`](../src/agent/agentAdapter.js)
- relay prompt assembly:
  [`server/app/prompt_builder.py`](../server/app/prompt_builder.py)
- tool handlers:
  [`agentTools.js`](../src/agent/agentTools.js)
- per-turn workflow-state note:
  [`turn-workflow-state.md`](./turn-workflow-state.md)

Current flow:

1. `AgentSessionController.executeToolCalls(...)` runs tools.
2. Each tool result is appended to session messages as a `tool_result`.
3. `#buildHistory()` forwards `message.content` into model history.
4. The relay serializes that content into `function_call_output.output`.

Today, trimming is minimal:

- plot content is excluded from model history
- tool rejection text is already compact
- most non-plot tool outputs remain fully structured in history

## Scope

Include:

- model-facing trimming of tool-result history
- compact summaries for successful tool results
- compact summaries for failed tool calls and rejected tool calls
- preserving follow-up-critical identifiers and constraints
- tests for what is retained vs omitted

Do not include in this slice:

- `viewRoot` trimming
- tool schema/catalog trimming
- system prompt shortening
- volatile context reshaping
- a persistent memory store
- embedding or retrieval systems

## Design Goals

- Keep the model aware of completed work in recent tool rounds.
- Preserve the exact identifiers needed for the next tool call.
- Preserve the actionable reason for failures and rejections.
- Avoid sending full raw payloads when a compact typed summary is enough.
- Keep the UI/session transcript free to retain richer local detail if needed.
- Keep the implementation deterministic and testable.

## Non-Goals

- Do not summarize tool results with another LLM.
- Do not replace app-owned state with a second compact-state reducer.
- Do not remove all structure from tool outputs and fall back to plain prose.
- Do not hide failures; failure information is part of the learning signal.

## Key Observation

There are three different consumers of a tool result:

1. the human-visible chat/session transcript
2. the model-facing history for the next tool loop round
3. local debugging and inspection

Those consumers do not need the same representation.

The current implementation largely uses one representation for all three. This
plan separates them conceptually without requiring a large new architecture.

## Proposed Strategy

Keep three representations distinct:

- raw tool result:
  - the original handler output
  - kept locally when useful
- visible transcript entry:
  - what the UI shows
  - may stay richer
- model-facing tool history entry:
  - a compact derived representation
  - sent only for recent tool rounds

The first implementation should do this at the browser-side
`AgentSessionController.#buildHistory()` boundary, before data is sent to the
relay.

## Summary Shape

Start with a compact wrapper shape for model-facing tool outputs:

```ts
interface AgentToolHistorySummary {
    kind: "tool_history_summary";
    toolName: string;
    status: "ok" | "rejected";
    summary: string;
    retained?: Record<string, unknown>;
}
```

Design intent:

- `summary` tells the model what happened
- `retained` holds only exact whitelisted fields needed for follow-up calls

This wrapper is for model-facing history only. It is not a new raw runtime
contract for every tool.

Important clarification:

- `summary` is deterministic text generated by code
- `retained` is deterministic structured data generated by code
- no field in this object is generated by an LLM
- if a tool does not have a reliable deterministic projection yet, keep only
  `summary`

## What Must Be Preserved

The compact result should preserve:

- whether the tool succeeded or was rejected
- the tool name
- what changed or what was learned
- exact identifiers needed for follow-up calls
- exact failure reasons when they guide the next attempt
- enough detail to avoid repeating the same bad call

The compact result should usually omit:

- large nested result payloads
- UI-only presentation detail
- repeated descriptive text already present elsewhere
- full lists when only one chosen identifier or a small top-N subset matters
- full plot specs and other large render outputs

## What "Retained" Means

`retained` is not a generic dump of the original tool result. It is a tiny
whitelist of fields that later tool calls may need exactly.

Examples:

- `buildSelectionAggregationAttribute`
  - retain `attribute`
  - retain `candidateId`
  - retain `aggregation`
- `jumpToProvenanceState`
  - retain `provenanceId`
- `submitIntentActions`
  - retain `provenanceIds`
  - retain compact sample/group-count deltas when present
- `zoomToScale`
  - retain `scaleName`
  - retain `domain`

If a field is only useful for explanation and not for a later tool call, it
should usually stay in `summary` and not be copied into `retained`.

## Success Cases To Handle

### Information lookup tools

Examples:

- `resolveMetadataAttributeValues`
- `searchViewDatums`
- `getIntentActionDocs`
- `getMetadataAttributeSummary`
- `buildSelectionAggregationAttribute`

Desired behavior:

- preserve the small set of exact fields the next step needs
- preserve stable identifiers
- keep only a compact list or top-N subset when results are large

Examples:

- metadata value resolution:
  - keep best matches and their identifiers
  - omit redundant or long result detail
- search results:
  - keep matched names/selectors and count
  - omit full datum payloads when not needed
- action docs:
  - keep only the requested action type and the small amount of field guidance
    needed for the next step
  - avoid replaying full examples repeatedly if already consumed
- selection aggregation resolution:
  - keep the resulting `attribute`
  - keep the chosen `candidateId`, `aggregation`, and title

### State-changing tools

Examples:

- `submitIntentActions`
- `jumpToProvenanceState`
- `jumpToInitialProvenanceState`
- `setViewVisibility`
- `zoomToScale`

Desired behavior:

- preserve what changed
- preserve any returned provenance identifiers
- preserve any exact values the next call may need
- avoid replaying full internal execution content

Examples:

- intent batch execution:
  - keep compact action summaries
  - keep new provenance ids when relevant
  - keep high-value counts such as visible-sample/group-level changes
- provenance jump:
  - keep target provenance id and summary
- zoom:
  - keep scale name and domain

## Failure Cases To Handle

Failure learning is part of the core requirement.

The compact result for a rejected or failed tool call should preserve:

- the exact tool name
- the exact actionable reason for failure
- any constraint the next attempt must obey
- any “do this first” dependency revealed by the failure

Examples:

- schema/shape rejection:
  - preserve which field was missing, invalid, or unsupported
- information-boundary rejection:
  - preserve that dependent calls must wait until the next round
- already-active provenance state:
  - preserve that no change happened and that a different provenance id is
    needed
- repeated-call guard:
  - preserve that repeating the same call unchanged will not help

In the first version, the failure lesson should live only inside the compact
`summary` text. We do not need a separate `cautions` field.

## Mapping Policy

The first version should use handwritten per-tool or per-tool-category
summaries instead of a generic recursive trimmer.

Reason:

- different tools expose different kinds of follow-up-critical identifiers
- some tools are primarily informational, others are state-changing
- a generic shape-based trimmer is likely to discard the wrong things

Preferred structure:

- one summarizer function per tool, or
- one summarizer per small tool family

Examples:

```ts
function summarizeBuildSelectionAggregationAttribute(result) { ... }
function summarizeSubmitIntentActions(result) { ... }
function summarizeRejectedToolCall(toolName, text) { ... }
```

These functions are ordinary handwritten code. They do not infer hidden
intentions. They only map known raw result shapes to smaller known summary
shapes.

Fallback behavior:

- if no custom summarizer exists yet, keep text-only output and omit raw
  structured content from model history rather than forwarding the full raw
  object by default

## Suggested Architecture

Introduce a compact history projection layer in the browser agent:

- raw tool execution result remains available inside the controller
- UI-visible transcript entry remains unchanged or only lightly changed
- `#buildHistory()` uses a compact model-facing projection instead of raw
  `message.content`

Possible implementation shape:

```ts
function summarizeToolHistoryEntry(message: AgentChatMessage): {
    text: string;
    content?: AgentToolHistorySummary;
}
```

This keeps the trimming decision close to the current history-building path and
avoids pushing browser-specific policy into the Python relay.

## Versioned Implementation Plan

## Simplified Implementation Plan

### v0.0: Baseline And Classification

Purpose: define what kinds of tool results exist and which ones currently bloat
history.

Implementation:

- inventory the current tool result shapes from `agentTools.js`
- group them into:
  - informational lookup results
  - state-change confirmations
  - action/program execution results
  - rejection/failure results
- identify which result fields are needed by follow-up steps and which are not
- measure history token growth on at least one multi-round failing workflow

Acceptance criteria:

- there is a clear mapping table from tool name to summary strategy
- the largest history contributors are identified

### v0.1: Add Recent-Window Trimming

Purpose: keep tool-result memory only where it is most useful.

Implementation:

- keep only the last few tool-result rounds in model history
- older tool results become text-only or are dropped from model history
- keep visible transcript messages and local session storage unchanged in the
  first pass

Acceptance criteria:

- history sent to the relay shrinks after several tool rounds
- recent tool results remain visible to the model
- current non-history UI behavior stays unchanged

Recommended tests:

- `agentSessionController.test.js` asserts recent-window behavior
- tests confirm older tool results no longer keep full raw payloads

### v0.2: Add Deterministic Compact Summaries For Important Tools

Purpose: preserve exactly the success information needed for follow-up calls.

Implementation:

- add `summarizeToolHistoryEntry(...)` in the browser agent
- implement custom summarizers for the highest-value tools first:
  - `buildSelectionAggregationAttribute`
  - `resolveMetadataAttributeValues`
  - `searchViewDatums`
  - `getMetadataAttributeSummary`
  - `submitIntentActions`
  - provenance jump tools
- generate `summary` text in deterministic code
- retain only exact whitelisted fields under `retained`

Acceptance criteria:

- common multi-round workflows still have the identifiers they need
- summary objects are materially smaller than the original payloads

Recommended tests:

- one test per prioritized tool family
- assertions on preserved identifiers and omitted bulky fields

### v0.3: Add Deterministic Failure Summaries

Purpose: make the model learn from recent failures without replaying raw
payloads or long error blocks.

Implementation:

- summarize rejected tool calls into short deterministic summaries
- preserve exact rejection guidance when it changes the next step
- do this in code from known rejection text and known guard cases

Examples:

- “wait for the next round before using information-tool output”
- “choose a different provenance state; the requested one is already active”
- “this exact tool call was already executed; change arguments”

Acceptance criteria:

- recent failure history clearly teaches the next move
- failure summaries are smaller than the current raw text/content path
- loop recovery does not regress

Recommended tests:

- rejection-history tests for information-boundary failures
- repeated-tool-call guard tests
- provenance no-op tests

## Open Design Questions

- Should the UI-visible transcript keep the raw content, or should it also use
  the compact summary and move raw payloads to debug-only inspection?
- Should compact model-facing summaries include the raw `toolCallId`, or is
  that only transport metadata?
- Should action-doc lookups be treated as disposable after one successful use?

The first implementation can avoid these by:

- keeping UI/session behavior unchanged
- not exposing `toolCallId` unless a concrete need appears
- keeping the retention policy simple and recent-biased

## Relationship To Other Plans

- This plan is one slice of the broader
  [`prompt-budget-reduction-plan.md`](./prompt-budget-reduction-plan.md).
- It complements but does not require the optional workflow overlay in
  [`turn-workflow-state.md`](./turn-workflow-state.md).
- It should land before any larger “memory” project so the team can measure how
  much of the original pain disappears with history compaction alone.

## Expected Outcome

After this work, the model-facing transcript should become much cheaper while
still preserving the key behavior we want:

- the model knows what tools were called
- the model knows what changed
- the model knows which identifiers are available next
- the model sees recent failures as compact actionable lessons

In simpler terms, the first version should do only this:

1. keep only the last few tool results in model memory
2. make those recent tool results much smaller
3. keep exact IDs and values only when later tool calls need them
4. keep recent failure reasons in short deterministic summaries

That should improve multi-round tool use without requiring a separate memory
architecture.

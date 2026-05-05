# History Checkpoint Compression Plan

This document outlines a high-level plan for compressing long agent chat
history with occasional LLM-authored checkpoints instead of trimming or
summarizing every turn.

The main goal is to keep recent detailed interaction available to the model
while moving older conversation and tool-loop history into a compact running
summary that is stable enough to benefit from prompt caching.

## Problem

The current agent request includes:

- stable context,
- volatile context,
- detailed conversation history,
- and the current user message.

That works well for short sessions. It becomes expensive in longer workflows,
especially when the model needs several tool rounds, retries, and state
changes. Keeping all of that detail forever is wasteful, but compressing it on
every turn would also be wasteful and would damage prompt-cache reuse.

The desired behavior is:

- keep recent history detailed,
- compress only occasionally,
- keep the compression model-authored,
- and place the compressed memory early enough in the prompt that it can become
  part of a reusable cached prefix.

## Bottom Line

The intended behavior is:

1. keep a recent detailed history window
2. once the detailed history becomes large enough, trigger a checkpoint
3. ask the LLM to summarize the older covered history in concise prose
4. store that checkpoint summary separately from the detailed transcript
5. build future prompts from:
   - stable instructions
   - stable context
   - checkpoint summary
   - recent detailed history
   - current volatile context
   - current user message

This means compression is a periodic checkpointing operation, not a per-turn
cleanup operation.

## Design Goals

- Preserve recent detailed history for exact tool usage and short-term
  reasoning.
- Compress older history only after it has stopped being worth keeping in full.
- Use the LLM to write the checkpoint summary because the useful abstraction is
  semantic rather than purely structural.
- Keep the checkpoint summary stable and slow-moving so prompt caching remains
  effective.
- Avoid rebuilding or rewriting the whole history summary every turn.
- Preserve the user goal, important state changes, exact identifiers still in
  use, and recent important failures.

## Non-Goals

- Do not compress every turn.
- Do not replace all history with a single constantly rewritten summary.
- Do not start with a second persistent memory or retrieval subsystem.
- Do not require a vector database.
- Do not make the Python relay the owner of agent-state semantics.

## Core Idea

Split model-facing session memory into two layers:

### 1. Checkpoint Summary

This is a compact LLM-authored prose summary of older history that has already
been “closed over.”

It should capture:

- what the user is trying to accomplish,
- what has already been done,
- what the current analysis state means,
- what identifiers or selections still matter,
- and what recent failed approaches should not be repeated.

It should not attempt to preserve every raw tool call or every exact utterance.

### 2. Recent Detailed Tail

This is the uncompressed recent window of chat and tool history.

It should preserve:

- exact recent tool calls,
- exact recent tool results,
- exact recent failures,
- and immediate interaction details that are still likely to matter in the
  next step.

The model should reason from the combination of:

- checkpoint summary for older memory,
- recent detailed tail for short-term precision.

## Why This Helps Prompt Cache Reuse

Prompt cache reuse is strongest when the early part of the prompt changes
slowly.

If we summarize every turn, the summary changes every turn and the cache value
drops. If we never summarize, the tail grows too large.

Checkpointing creates a middle path:

- the checkpoint summary changes only occasionally,
- the detailed tail stays small,
- and most turns reuse the same early prompt prefix until the next checkpoint.

This is the main reason to prefer checkpoint-based compression over per-turn
history rewriting.

## Where The Checkpoint Summary Should Live

The checkpoint summary should be inserted near the beginning of the prompt, as
its own distinct block, after stable instructions and before the recent
detailed history.

High-level prompt order:

1. system instructions
2. stable context
3. checkpoint summary
4. recent detailed history
5. volatile context
6. current user message

Rationale:

- the checkpoint summary is semantically important and should not be buried
  late in the prompt
- it should become part of the relatively stable prefix
- volatile context still belongs near the current user message because it is
  high-churn state

## What The LLM Should Summarize

The checkpoint summary should summarize covered history in terms of meaning, not
raw transcript fidelity.

Suggested headings:

- `User goal`
- `Progress so far`
- `Current known state`
- `Important identifiers and selections`
- `Recent mistakes to avoid`
- `Open next step`

This can be plain prose with predictable headings. It does not need to start as
strict JSON.

The summary should preserve:

- the current user objective
- the important analysis steps completed so far
- the current branch of provenance or stateful workflow when relevant
- exact identifiers that are still live and likely needed again
- exact recent lessons from failed attempts when they still matter

The summary should omit:

- full raw tool payloads
- large result lists unless only a tiny subset remains important
- repeated wording from the detailed transcript
- obsolete failed attempts that are no longer relevant

## When Compression Should Happen

Compression should happen only after some threshold is reached.

Possible triggers:

- the detailed history exceeds a message-count threshold
- the detailed history exceeds a token threshold
- the number of tool rounds exceeds a threshold
- a turn completes and the accumulated recent history is clearly too large

The first implementation should keep this simple and deterministic.

Recommended starting rule:

- do not checkpoint until there have been several detailed rounds
- once the detailed tail grows beyond a threshold, summarize the older half or
  older portion
- keep the newest few rounds uncompressed

This avoids summarizing too early and preserves a recent exact window.

## Checkpoint Update Model

The checkpoint summary should be cumulative.

That means later checkpoints should not summarize from scratch every time.
Instead, the model should receive:

- the existing checkpoint summary
- the older detailed history slice that is about to be compressed

and produce:

- a revised checkpoint summary that replaces the older slice

This lets the checkpoint evolve in larger discrete steps rather than being
regenerated on every turn.

## Separation Of Responsibilities

### Browser Agent

The browser side should own:

- deciding when checkpointing is triggered
- choosing which detailed messages are covered by the next checkpoint
- storing:
  - full transcript
  - checkpoint summary
  - recent detailed tail
- building the final request payload with the right prompt order

This keeps agent-session semantics in the browser where the transcript and tool
loop already live.

### Python Relay

The relay should remain mostly transport- and provider-focused.

It may need to:

- accept an extra checkpoint-summary field in the request shape
- insert that field into prompt assembly in the correct position

But it should not be the primary owner of when checkpointing happens or what
the session summary means.

## Summary Generation Options

There are two main ways to generate the checkpoint:

### Option A: Dedicated Summarization Pass

The browser explicitly asks the LLM to summarize a covered history slice and
store the result before the next normal turn.

Pros:

- clear separation between task solving and memory compression
- easier to control summary format
- easier to test and reason about

Cons:

- adds an extra model call at checkpoint time

### Option B: Inline Compression During A Normal Turn

The main model is asked to both continue the task and refresh the checkpoint
when needed.

Pros:

- fewer explicit extra passes

Cons:

- less predictable
- harder to control
- more likely to entangle task behavior with memory maintenance

Recommended direction:

- start with Option A

Even though it adds an extra pass sometimes, it is conceptually cleaner and
fits the “checkpoint only occasionally” policy.

## Failure Preservation

One important requirement is that failures should still teach the model
something after compression.

The checkpoint summary should therefore retain only the failures that still
matter, phrased as compact prose such as:

- “Direct plotting from the brush selection failed because a derived metadata
  attribute was required first.”
- “Repeating the same provenance jump did not change the analysis.”

The summary should not preserve every failed call. It should preserve only the
lessons that still affect the next likely steps.

## Relationship To Recent Tail Trimming

This checkpoint plan does not replace recent-tail compaction. The two ideas work
together:

- recent detailed history may still be trimmed or compacted deterministically
- older history is checkpointed into LLM-authored prose

So the full memory model can become:

- checkpoint summary for older memory
- compact recent tail for short-term exact memory

The checkpoint plan is therefore broader than “tool-result trimming,” but it
still complements that work.

## Risks

- The summary may drift or omit a detail that later turns need.
- The checkpoint may preserve too much and stop saving tokens.
- The checkpoint may preserve too little and weaken recovery.
- If checkpoints are refreshed too often, prompt-cache benefits drop.
- If checkpoints are refreshed too rarely, the recent tail grows too large.

These risks are why the first version should be:

- infrequent,
- cumulative,
- prose-based,
- and measured with token-debugger data.

## Suggested First Implementation

Keep the first version deliberately small:

1. Add browser-side storage for:
   - checkpoint summary text
   - recent detailed history window
2. Add a simple threshold rule for when checkpointing is triggered.
3. Add a dedicated summarization pass that turns older detailed history into a
   short prose checkpoint.
4. Insert the checkpoint block into the prompt before recent detailed history.
5. Keep only the newest detailed rounds after checkpointing.
6. Measure token savings and cache behavior qualitatively.

The first version does not need:

- JSON summaries
- multiple checkpoint tiers
- retrieval over old checkpoints
- or a generalized long-term memory subsystem

## Open Questions

- What is the best first threshold:
  - message count,
  - tool-round count,
  - or token estimate?
- Should the same main model generate the checkpoint, or should a separate
  cheaper summarizer model be allowed later?
- Should checkpoint generation happen immediately after a turn, or lazily just
  before the next request when needed?
- How much exact identifier data should be preserved in prose versus a tiny
  structured sidecar?
- Should the checkpoint summary cover only tool-heavy history or all older
  conversational history?

The first implementation can defer some of these by choosing simple defaults:

- one threshold policy
- same model
- dedicated summarization pass
- prose checkpoint only

## Expected Outcome

After this work:

- long sessions should stop accumulating unbounded detailed history
- recent reasoning should still have access to exact recent detail
- older important context should remain available in compact semantic form
- and the early prompt prefix should change infrequently enough to preserve
  prompt-cache value better than per-turn summarization would

This should provide a practical middle ground between “keep everything forever”
and “rewrite the whole memory every turn.”

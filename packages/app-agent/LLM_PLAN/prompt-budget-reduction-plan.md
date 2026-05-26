# Prompt Budget Reduction Plan

This document outlines a staged plan for reducing the per-turn prompt size of
the GenomeSpy app agent. The main goal is to improve reliability for local and
small hosted models by shrinking the default prompt payload before adding new
memory layers or planning abstractions.

The current numbers show that the largest costs are not volatile state or
session traces. They are the always-on visualization context, the always-on
tool definitions, and the system instructions. That changes the implementation
order.

## Current Measured Baseline

Observed failed-turn token summary:

- `total`: 16949
- `tools`: 4949
- `system`: 4421
- `context`: 4388
- `history`: 2004
- `volatile context`: 1169
- `message`: 18

Top-level context breakdown:

- `viewRoot`: 3244
- `intentActionSummaries`: 568
- `attributes`: 452
- `searchableViews`: 140
- `schemaVersion`: 16

## Main Conclusion

The first implementation steps should optimize:

1. `viewRoot`
2. tool definitions and tool-facing schema verbosity
3. the system prompt
4. transcript history
5. volatile context

This means the first phase should not introduce a new compact working-memory
state, failure notebook, or raw trace store. Those may still become useful
later, but they are not the highest-leverage response to the current measured
budget.

## Code Anchors

- Stable browser context assembly:
  [`contextBuilder.js`](../src/agent/contextBuilder.js)
- View-tree normalization:
  [`viewTree.js`](../src/agent/viewTree.js)
- Volatile context assembly:
  [`volatileContextBuilder.js`](../src/agent/volatileContextBuilder.js)
- Selection aggregation summaries:
  [`selectionAggregationContext.js`](../src/agent/selectionAggregationContext.js)
- Session transcript and tool-loop history:
  [`agentSessionController.js`](../src/agent/agentSessionController.js)
- Tool handlers:
  [`agentTools.js`](../src/agent/agentTools.js)
- Browser request assembly:
  [`agentAdapter.js`](../src/agent/agentAdapter.js)
- Relay prompt assembly:
  [`server/app/prompt_builder.py`](../server/app/prompt_builder.py)
- Relay token measurement:
  [`server/app/token_debugger.py`](../server/app/token_debugger.py)
- Existing action-context reduction work:
  [`action-context-reduction-plan.md`](./action-context-reduction-plan.md)
- Existing tool-surface cleanup note:
  [`agent-tool-surface-cleanup.md`](./agent-tool-surface-cleanup.md)
- Existing view-tree design note:
  [`view-tree.md`](./view-tree.md)

## Design Goals

- Reduce default prompt size without weakening the core agent workflows.
- Keep the prompt friendly to smaller local models.
- Preserve one primary source of truth for runtime state instead of adding
  duplicate state machines too early.
- Keep each reduction step independently measurable and shippable.
- Prefer deterministic context shaping over LLM-authored summarization in the
  first implementation slices.

## Non-Goals

- Do not add a vector database.
- Do not add long-lived retrieval infrastructure.
- Do not introduce a second provenance model.
- Do not build a new persistent agent memory layer in the first phases.
- Do not move core app logic into the Python relay.

## Principles

- Measure before and after every phase with the existing token debugger.
- Reduce always-on prompt payload before adding new derived memory layers.
- Reuse existing context categories when possible:
  - stable context,
  - volatile context,
  - history,
  - tool definitions,
  - system instructions.
- Keep full-fidelity runtime state in app-owned structures when needed, but do
  not send the full raw state to the model by default.
- Prefer on-demand expansion and lookup over richer always-on payloads.

## Existing Architecture To Reuse

The current architecture already provides the main prompt lanes:

- stable context from `contextBuilder.js`
- volatile context from `volatileContextBuilder.js`
- transcript history from `AgentSessionController`
- provider prompt assembly in the Python relay
- explicit on-demand tool use

This means the first work should tighten the shape of those existing lanes
instead of adding parallel abstractions for the same information.

## Versioned Implementation Plan

### v0.0: Establish Repeatable Prompt Baselines

Purpose: turn the current token findings into a repeatable benchmark for future
changes.

Implementation:

- Capture a small set of representative failed and successful prompts.
- Record the token summary for each using the existing relay-side debugger.
- Save the key observations in the benchmark notes or related design docs.
- Include at least one multi-round tool workflow and one context-heavy
  visualization-question workflow.

Acceptance criteria:

- The team can compare before/after token budgets on the same prompts.
- The baseline identifies the largest bucket and the largest context key.
- The baseline is specific enough to catch regressions.

Notes:

- This phase is documentation and measurement only.
- It should happen before every major context-shaping change.

### v0.1: Shrink Default `viewRoot`

Purpose: reduce the largest current context contributor.

Why first:

- `viewRoot` is 3244 tokens by itself.
- That is larger than the entire volatile context and larger than history.

Implementation:

- Audit the current normalized node shape emitted by `buildViewTree(...)`.
- Remove or shorten fields that are too verbose for first-pass reasoning.
- Keep default nodes focused on:
  - `type`
  - `title`
  - `selector` when stable and needed
  - `visible` when relevant
  - `collapsed`
  - `childCount`
  - compact mark/data/encoding hints only when they materially affect reasoning
- Prefer compact summaries for collapsed branches.
- Keep richer branch details available through the existing expand/collapse
  workflow instead of always-on context.

Candidate reductions:

- trim verbose descriptions when they duplicate titles or structure
- trim inherited encoding detail that does not affect current reasoning
- trim scale details that are only needed for specific zoom/navigation tasks
- trim parameter declarations to the fields needed for discovery
- keep data summaries short and role-oriented instead of schema-like

Acceptance criteria:

- `viewRoot` token cost drops materially on the baseline prompts.
- The agent can still answer common structure questions.
- View expansion still reveals richer details on demand.

Recommended tests:

- update `viewTree.test.js` snapshots as needed
- add focused assertions for omitted low-value fields
- add at least one test that confirms collapsed branches stay discoverable

### v0.2: Reduce Always-On Tool and Schema Cost

Purpose: cut the largest total prompt bucket.

Why second:

- tools are currently the biggest single bucket at 4949 tokens.

Implementation:

- audit the generated tool definitions sent on every request
- shorten tool descriptions where they duplicate system prompt guidance
- keep input schemas strict but remove low-value prose when possible
- push rarely needed detail into on-demand tools rather than always-on docs
- keep the browser-side tool surface and relay-side forwarding model unchanged
  unless a smaller projection is needed for provider payloads

Relationships to existing plans:

- continue the direction in
  [`action-context-reduction-plan.md`](./action-context-reduction-plan.md)
- align cleanup with
  [`agent-tool-surface-cleanup.md`](./agent-tool-surface-cleanup.md)

Acceptance criteria:

- the tool bucket drops materially on baseline prompts
- tool-call validation behavior remains unchanged
- common workflows still succeed without extra retries

Recommended tests:

- generated catalog/schema tests where shape changes are intentional
- request-shaping tests in browser and relay layers
- at least one before/after token comparison recorded in notes

### v0.3: Tighten the System Prompt

Purpose: reduce one of the largest fixed prompt costs without removing critical
behavioral guidance.

Why third:

- the system prompt is currently 4421 tokens
- this cost is paid on every turn, even simple ones

Implementation:

- audit the current system prompt for duplicated rules and repeated examples
- move guidance into the narrowest useful place:
  - tool descriptions for tool-local rules
  - code-level validation for hard constraints
  - context shape for discoverability
- keep high-value behavior rules in the system prompt, especially:
  - use only provided selectors and attributes
  - respect provenance state
  - sequence dependent actions across refreshed context
  - do not invent missing fields

Acceptance criteria:

- the system bucket drops materially on baseline prompts
- failure rate does not increase on common workflows
- removed guidance is either unnecessary or enforced elsewhere

Recommended tests:

- prompt-builder tests when serialized instructions change
- benchmark-style checks on representative tool workflows

### v0.4: Compact Transcript History

Purpose: prevent multi-round tool use from inflating prompt size with large raw
tool outputs.

Why fourth:

- history is meaningful at 2004 tokens
- it grows with retries and repeated tool use
- this is the first phase that directly addresses the original “failed attempt
  bloat” concern

Implementation:

- keep raw tool results in session/UI state if needed for inspection
- compact the model-facing history built in `AgentSessionController`
- replace bulky tool-result `content` objects with:
  - a short text summary
  - and only the minimal structured fields needed for the next reasoning step
- keep plot outputs out of model history as today
- keep recent failed-attempt feedback, but summarize it rather than replaying
  full payloads

Important boundary:

- this is history compaction, not a new persistent memory subsystem

Acceptance criteria:

- history tokens grow more slowly across repeated tool rounds
- the agent still learns from recent tool failures and successes
- common workflows do not regress because needed identifiers disappear

Recommended tests:

- `agentSessionController.test.js` coverage for model-history shape
- tests that confirm bulky tool result payloads are omitted or reduced
- tests that keep identifiers needed for follow-up calls

### v0.5: Trim Volatile Context

Purpose: remove unnecessary high-churn detail after the larger buckets are
under control.

Why fifth:

- volatile context is not currently the biggest problem
- it is still worth tightening once larger wins land

Implementation:

- keep `sampleSummary`, grouping state, selection aggregation candidates, and
  active provenance summary
- remove raw provenance `payload`, `meta`, and similar low-value details from
  prompt-visible volatile context unless a concrete workflow proves they are
  needed
- review parameter values and scale domain verbosity for further trimming

Acceptance criteria:

- volatile-context tokens drop without harming selection-driven workflows
- provenance navigation still works from prompt-visible summaries

Recommended tests:

- `volatileContextBuilder` tests for summary-only provenance entries
- tool tests for provenance navigation and selection aggregation workflows

### v0.6: Add a Small Derived Workflow Overlay Only If Still Needed

Purpose: improve multi-round reasoning after the main prompt payload has been
reduced.

Why last:

- this is a reasoning-quality optimization, not the first budget fix
- it risks duplicating existing state if introduced too early

Implementation:

- add at most a small per-turn derived overlay if the reduced prompt still
  leaves important gaps
- likely candidates:
  - current user goal
  - current grouping summary
  - active genomic interval summary
  - immediate next-needed step
- keep it derived from existing app state and recent compact tool summaries
- do not build a second provenance or selection state machine

Related note:

- if needed, this can align with the ideas in
  [`turn-workflow-state.md`](./turn-workflow-state.md), but only after the
  prompt-budget fixes land

Acceptance criteria:

- the overlay helps multi-round workflows that still fail after earlier phases
- the added tokens are small relative to the value gained
- there is no duplicated source of truth for long-lived app state

## Explicitly Deferred Work

The following should stay out of the first implementation slices unless later
measurement shows a concrete need:

- a raw trace store for all agent attempts
- a task-pattern failure notebook
- embedding-based retrieval
- LLM-authored context summarization
- a second browser-side compact-state reducer that duplicates existing app
  state

## Suggested Delivery Order

Recommended shipping order:

1. `v0.0` baseline capture
2. `v0.1` `viewRoot` reduction
3. `v0.2` tool/schema reduction
4. `v0.3` system-prompt reduction
5. `v0.4` history compaction
6. `v0.5` volatile-context reduction
7. `v0.6` optional derived workflow overlay

This order follows the measured token distribution instead of the original
intuition about volatile-state bloat.

## Expected Outcome

After the first five phases, the default prompt should be materially smaller
without changing the basic browser-agent architecture. The model should still
be able to:

- inspect the visualization structure
- discover actions and tool capabilities
- perform multi-step workflows with refreshed context between steps
- and recover from recent failed attempts

If those phases are not enough, later work can add a small derived workflow
overlay. That should be treated as a follow-up optimization, not as the first
response to the current prompt-size problem.

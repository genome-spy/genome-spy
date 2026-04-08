# LLM Infrastructure (Draft)

This document outlines a pragmatic deployment setup for an LLM-assisted GenomeSpy app, including system prompting, data transport, and open questions.

## Code References
- Runtime adapter and `/v1/plan` request flow: [`agentAdapter.js`](../src/agent/agentAdapter.js)
- Context snapshot assembly: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- Local entry points and debug UI: [`toolbarMenu.js`](../src/agent/toolbarMenu.js), [`chatPanel.js`](../src/agent/chatPanel.js)
- Planner integration tests: [`agentAdapter.browser.test.js`](../src/agent/agentAdapter.browser.test.js)

## Deployment Topology
- **Local dev:** GenomeSpy (browser) -> Vite dev server gateway -> Ollama (local model).
- **Production:** GenomeSpy (browser) -> Node.js gateway (separate service) -> Ollama or cloud LLM.

Rationale: a thin gateway keeps client logic stable and enables swapping LLM backends.

## Build-Time and Runtime Gating
Agent support should stay opt-in and load only when explicitly configured.

### Build-time gate
- Use a Vite env flag such as `VITE_AGENT_ENABLED=true`.
- Keep the default build path agent-free.
- Store local overrides in `packages/app/.env.local`.

### Runtime gate
- Enable the agent only when an agent base URL is provided.
- Accept the base URL from `embed(..., { agentBaseUrl })` or from `VITE_AGENT_BASE_URL`.
- Keep the agent disabled when the flag is off, even if a base URL is present.

### Dynamic imports
- Load agent code on demand with `import()`.
- Keep the generic app entrypoints free of static agent imports.
- Split out agent-only UI helpers the same way, so production bundles do not pull them in unless the agent is enabled.

This keeps the app mergeable before release while preserving a clean opt-in path for local development and later production activation.

## Responsibilities
### Client (GenomeSpy)
- Build context snapshots (view hierarchy, attributes, scales, selections, provenance).
- Validate LLM outputs against the generated JSON Schema with Ajv.
- Execute actions via `IntentPipeline`.
- Provide user-visible confirmations and error messages.

### Gateway (Vite/Node)
- Route requests to LLM backends (Ollama or cloud).
- Enforce auth, rate limits, and payload size limits.
- Optionally log requests/responses for debugging.
- Provide streaming to the client.

Agent bootstrap should remain behind the runtime gate; the gateway should not
be required unless the agent is actually enabled.

Default posture: keep gateway thin; move logic server-side only when needed (e.g., privacy, heavy compute).

## System Prompt Strategy
- Include system prompt on every request (or prepend server-side per session).
- Use strict output schema (e.g., `clarify`, `intent_program`, `answer`).
- Require the model to avoid inventing attributes or view ids.
- Ask for clarification when context is missing.

## Data Transport
- **Baseline:** HTTP request/response with streaming (SSE or chunked fetch).
- **Optional:** WebSockets if you need multi-channel, bidirectional, low-latency updates.

Notes:
- HTTP streaming is usually sufficient for chat UI + token streaming.
- Add WebSockets only for advanced progress or tool-execution telemetry.

## Message Flow (High-Level)
1. User message + context snapshot -> gateway.
2. Gateway forwards to LLM with system prompt + tools.
3. LLM returns JSON response (intent program or clarification).
4. Client validates and executes intents.
5. Client returns summary (provenance) to LLM (optional).

## Security + Safety
- Cap request sizes (context snapshots can grow quickly).
- Rate-limit per user/session.
- Redact sensitive fields in snapshots when the selected data mode requires it.
- Require confirmation for large-scope actions.

## Open Questions
- Where should session state live (client-only vs gateway session cache)?
- Should gateway perform any parsing of the visualization spec, or stay dumb?
- How to store and replay conversation history for debugging?
- What is the minimal context snapshot that still enables accurate intent planning?
- Should the LLM be allowed to execute actions autonomously or require user confirmation?

## Local Model Capability Notes
Small local models can be effective for action composition and exploration
if you provide explicit context and constraints:
- They handle intent mapping, summarization, and clarifying questions well.
- They struggle with deep biology/statistics unless the domain knowledge is
  supplied via metadata descriptions or docs.
- Prefer suggestion-style outputs when statistical rigor is not available.

Practical fallback: keep local models for planning and routing, and optionally
route domain-heavy or stats-heavy requests to a larger model.

## Cloud Data Policy
Use one policy block for both local and cloud LLMs so the data rules stay
visible in one place.

### Public data
- Local and cloud LLMs may be used.
- Raw data may be used when the request and product policy allow it.
- Summarized data is still preferred when it improves reasoning quality.

### Controlled-access data
- Cloud LLMs must never receive raw rows.
- Use only metadata and pre-approved aggregates.
- Enforce minimum cohort sizes (k-anonymity) before emitting counts or stats.
- Prefer bins/quantiles over exact values.
- Remove identifiers and high-cardinality categorical fields.
- Quantize numeric values to avoid exact leakage.
- Require user confirmation for broad-scope summaries.

### Implementation notes
- Compute aggregates locally or in the gateway, never in the cloud LLM.
- Validate outbound payloads against a strict schema.
- Reject unsafe bundles deterministically.
- Log outbound payloads for auditability.
- Maintain tests that prove sensitive fields cannot pass.

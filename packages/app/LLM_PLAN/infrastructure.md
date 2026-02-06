# LLM Infrastructure (Draft)

This document outlines a pragmatic deployment setup for an LLM-assisted GenomeSpy app, including system prompting, data transport, and open questions.

## Deployment Topology
- **Local dev:** GenomeSpy (browser) -> Vite dev server gateway -> Ollama (local model).
- **Production:** GenomeSpy (browser) -> Node.js gateway (separate service) -> Ollama or cloud LLM.

Rationale: a thin gateway keeps client logic stable and enables swapping LLM backends.

## Responsibilities
### Client (GenomeSpy)
- Build context snapshots (view hierarchy, attributes, scales, selections, provenance).
- Validate LLM outputs against action schemas.
- Execute actions via `IntentPipeline`.
- Provide user-visible confirmations and error messages.

### Gateway (Vite/Node)
- Route requests to LLM backends (Ollama or cloud).
- Enforce auth, rate limits, and payload size limits.
- Optionally log requests/responses for debugging.
- Provide streaming to the client.

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

## Cloud Aggregate Policy
Local models can receive richer summaries. For cloud LLMs, prefer conservative,
privacy-preserving aggregate sharing:
- Aggregate-only by default; never send raw rows.
- Enforce minimum cohort sizes (k-anonymity) before emitting counts or stats.
- Prefer bins/quantiles over exact values.
- Compute aggregates client-side or in the gateway, not in the LLM service.
- Require user confirmation for broad-scope summaries.

## Message Flow (High-Level)
1. User message + context snapshot -> gateway.
2. Gateway forwards to LLM with system prompt + tools.
3. LLM returns JSON response (intent program or clarification).
4. Client validates and executes intents.
5. Client returns summary (provenance) to LLM (optional).

## Security + Safety
- Cap request sizes (context snapshots can grow quickly).
- Rate-limit per user/session.
- Redact sensitive fields in snapshots if needed.
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

## Secure Cloud Reasoning (Longer-Term Project)
If deeper reasoning is routed to a strong cloud LLM, enforce a strict separation
between data handling and reasoning by sending only sanitized bundles.

Proposed safeguards:
- Only send metadata and pre-approved aggregates (no raw rows).
- Enforce minimum cohort sizes (k-anonymity) before emitting stats.
- Remove identifiers and high-cardinality categorical fields.
- Quantize numeric values (bins/quantiles) to avoid exact leakage.
- Validate outbound payloads against a strict schema (whitelist fields only).
- Log outbound payloads for auditability.

Implementation notes:
- Compute aggregates locally or in the gateway, never in the cloud LLM.
- Add a deterministic validator that rejects unsafe bundles.
- Maintain a test suite to prove that sensitive fields cannot pass.

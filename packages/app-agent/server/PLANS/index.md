# Python Agent Server Plan Summary

## Code Anchors
- Relay entry point: [`app/main.py`](../app/main.py)
- Settings and system prompt loading: [`app/config.py`](../app/config.py)
- Request and response models: [`app/models.py`](../app/models.py)
- Prompt assembly: [`app/prompt_builder.py`](../app/prompt_builder.py)
- Provider implementations: [`app/providers.py`](../app/providers.py)
- Tool catalog bridge: [`app/tool_catalog.py`](../app/tool_catalog.py)
- Relay overview and setup: [`../README.md`](../README.md)
- DGX and remote vLLM notes: [`../DGX_VLLM_SETUP.md`](../DGX_VLLM_SETUP.md)

## Plan Documents
- Token debugger: [`TOKEN_DEBUGGER_PLAN.md`](./TOKEN_DEBUGGER_PLAN.md)

## Goals
- Keep the Python relay thin and easy to reason about.
- Preserve a stable `/v1/agent-turn` contract for GenomeSpy.
- Reuse a small, explicit prompt-building path for all providers.
- Make developer debugging practical, especially for prompt size, request shape,
  and provider compatibility issues.
- Support local and hosted OpenAI-compatible model servers without turning the
  relay into a large orchestration layer.

## Product Phases
### MVP
- Accept GenomeSpy turn requests with `message`, `history`, and `context`.
- Add the configured system prompt and prompt context on the relay side.
- Forward requests through `responses` or `chat_completions`.
- Normalize replies into GenomeSpy's `answer`, `clarify`, and `tool_call`
  response types.
- Provide a small amount of developer diagnostics through logs and focused
  utilities.

### Later
- Improve developer tooling for prompt inspection and provider debugging.
- Add better observability for prompt size, latency, and provider behavior.
- Expand compatibility shims only when real providers require them.
- Keep browser-agent and relay contracts aligned as tool calling and streaming
  evolve.

## Current Implementation (Relevant Pieces)
- The relay builds a provider-neutral `PromptIR` and then adapts it to provider
  payloads.
- Context snapshot serialization currently excludes `toolCatalog` from the
  prompt context.
- The Responses provider sends `instructions`, `input`, and optional tool
  definitions.
- The Chat Completions provider supports a merged-system-message fallback for
  providers that reject multiple system messages.
- Streaming is supported through SSE forwarding when enabled in settings.
- The system prompt is loaded from a checked-in Markdown file and can be
  overridden through environment variables.
- Tests already cover request normalization, prompt construction, provider
  payload shaping, and streaming behavior.

## Composition Strategy
- Keep prompt construction centralized and provider-neutral for as long as
  possible.
- Isolate provider-specific request shaping to a small number of helpers.
- Prefer lightweight developer tools that reuse the existing prompt builders
  over adding new API surface.
- Keep server behavior explicit and fail loudly on invalid provider responses.

## Next Implementation Candidates
- Add the small token-debugger helper described in
  [`TOKEN_DEBUGGER_PLAN.md`](./TOKEN_DEBUGGER_PLAN.md).
- Improve request preflight diagnostics without duplicating prompt assembly
  logic.
- Keep provider-specific compatibility fallbacks narrow and well tested.
- Add more focused tests when prompt or response contracts change.

## Notes
- This folder is for planning Python-relay work, not browser-agent product
  design.
- Plan documents here should stay implementation-oriented and tied to the
  current relay architecture.

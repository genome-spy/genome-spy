# GenomeSpy Agent Server Architecture

## Responsibility

The Python service is a thin relay between GenomeSpy's browser agent and an
OpenAI-compatible model server. It translates and validates requests, assembles
provider-facing prompts, normalizes responses and streams, and emits useful
diagnostics. Browser tool behavior and GenomeSpy domain orchestration remain in
the JavaScript package.

Paths in this document are relative to `packages/app-agent/server/`.

## Design priorities

- Keep prompt assembly provider-neutral and isolate provider-specific behavior
  behind narrow adapters.
- Optimize for readability, predictability, and debuggability.
- Group code by responsibility rather than by generic labels such as `helpers`.
- Keep route and orchestration functions shallow. Put dense parsing, streaming,
  logging, or formatting mechanics in focused modules when that clarifies the
  top-level flow.
- Add developer tooling only when it directly supports relay work.
- Avoid new HTTP endpoints when an internal helper can provide the needed
  debugging or implementation capability.

## Module map

- `app/main.py`: FastAPI lifecycle, routes, request orchestration, and HTTP/SSE
  response construction.
- `app/models.py`: browser, relay, and provider request/response models.
- `app/config.py`: environment-backed relay configuration.
- `app/prompt_builder.py`: provider-neutral prompt intermediate representation
  and prompt ordering.
- `app/providers/openai_responses.py`: OpenAI Responses-compatible adapter.
- `app/providers/streaming.py`: normalized streaming behavior.
- `app/providers/parsing.py`: provider response parsing and normalization.
- `app/token_debugger.py` and `app/throughput_debugger.py`: opt-in diagnostics.
- `app/prompts/genomespy_system_prompt.md`: bundled provider-facing system
  prompt.

Keep request and response contract changes aligned across `models.py`,
`prompt_builder.py`, the affected provider modules, and `main.py`. Reuse the
existing prompt-building helpers and keep provider compatibility logic narrow,
explicit, and tested.

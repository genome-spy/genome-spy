# GenomeSpy App Agent Architecture

## Scope

`packages/app-agent` owns GenomeSpy's browser-side LLM agent plugin and the thin
Python relay used to reach OpenAI-compatible model servers. The implementation
is experimental and intentionally keeps the App host, browser agent, and model
relay as separate ownership boundaries.

Unless otherwise noted, paths in this document are relative to
`packages/app-agent/`.

## Boundaries

- GenomeSpy App owns the shell, state, UI primitives, and `AgentApi` host
  interface.
- `src/agent/` owns chat UI, context assembly, tool execution, the agent loop,
  validation, and generated browser-agent contracts.
- `server/` owns provider-facing prompt assembly, response normalization,
  streaming, configuration, and diagnostics. It does not own GenomeSpy domain
  semantics or browser tool implementations.
- Shared pure behavior crosses the App boundary through `agentShared`; host
  state and mutations cross through `AgentApi`.

## Provider context model

The browser builds stable and volatile GenomeSpy context and sends it with the
conversation. The relay combines that data with its system prompt and maps the
provider-neutral request into a provider API. Detailed action documentation is
available on demand so the always-on prompt can remain suitable for local models
with a 32k-token context window.

## Entry points

- Package setup and scripts: `README.md`
- Browser plugin entry: `src/agent/appAgent.js`
- Chat UI: `src/agent/chatPanel.js`
- Context assembly: `src/agent/contextBuilder.js`
- Agent loop/controller: `src/agent/agentSessionController.js`
- Tool registry and handlers: `src/agent/toolCatalog.js`, `src/agent/agentTools.js`
- Remaining design notes: `LLM_PLAN/index.md`
- Relay architecture: `server/ARCHITECTURE.md`
- Relay setup: `server/README.md`

For a browser-agent task, start with `README.md`, `src/agent/AGENTS.md`, and the
specific entry point. Read only the relevant `LLM_PLAN` document rather than the
whole directory.

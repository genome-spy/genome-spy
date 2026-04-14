# Python Agent Server

This document captures the current direction for a minimal Python-side agent
server for GenomeSpy and reframes the discussion as a prompt for a coding
agent.

## Goal

Design a minimal Python LLM server integration for GenomeSpy. In `v0.0.1`, the
Python side should just relay requests from GenomeSpy App to an LLM provider.

The Python side should stay intentionally thin in `v0.0.1`:

- GenomeSpy owns context assembly.
- GenomeSpy owns visualization semantics.
- GenomeSpy owns action and intent validation.
- GenomeSpy owns agent tool definitions that are related to GenomeSpy actions.
- The Python side forwards requests to a selected LLM provider.

Validation, contract checks, and richer orchestration can come later in
`v0.0.2`.

We also want to compare different inference providers behind the same server
framework, including:

- Ollama
- vLLM
- LM Studio
- OpenAI API
- Claude API

The first PoC may start with one local provider, but the overall structure
should remain provider-agnostic.

For the first implementation, the preferred OpenAI-style transport is the
Responses API. Chat Completions can remain a fallback adapter, but it should
not be the default path.

## Architectural Direction

- Keep the AI/server code separate from the main app architecture, even if the
  first implementation temporarily lives under `utils/`.
- Treat GenomeSpy as the single source of truth for all agent-facing schemas,
  contracts, and semantics.
- Do not duplicate schema validation or tool-definition logic in Python.
- Export machine-readable contract artifacts from GenomeSpy for the Python side
  to consume.
- Prefer JSON Schema artifacts and generated manifests over raw TypeScript
  sharing.
- Keep the Python service generic enough to compare local and hosted LLM
  providers behind the same interface.

## Tool Contract Direction

Agent tools will be implemented on the GenomeSpy side and exposed to Python
through generated contracts derived from GenomeSpy-side JSDoc and typings.

That means:

- tool definitions stay in GenomeSpy source
- tool payload shapes are described in GenomeSpy typings
- documentation and examples come from JSDoc
- generated artifacts are exported for Python consumption
- Python should not manually recreate tool schemas
- Tool-call validation and rejection policy stays on the GenomeSpy side; see
  [`validation.md`](./validation.md).

This follows the same principle already used for action schemas and generated
agent artifacts in `packages/app/src/agent`.

## Existing GenomeSpy Context

Relevant existing files include:

- `packages/app/src/agent/generated/generatedActionSchema.json`
- `packages/app/src/agent/generated/generatedActionCatalog.json`
- `packages/app/src/agent/generated/generatedActionSummaries.json`
- `packages/app/src/agent/schemaContract.ts`
- `packages/app/src/agent/types.d.ts`
- `packages/app/src/agent/contextBuilder.js`
- `packages/app/src/agent/agentAdapter.js`
- `packages/app/src/agent/LLM_PLAN/tools.md`

Current request flow:

- the app posts to `/v1/agent-turn`
- the request body includes:
  - `message`
  - `history`
  - `context`
- `context` is assembled in GenomeSpy
- validation stays on the GenomeSpy side for now

## Proposed Contract Boundary

GenomeSpy should export a tiny contract bundle for the Python side. The Python
service consumes artifacts, not implementation code.

### Source-of-truth files that stay in GenomeSpy

- `contextBuilder.js`
- `viewTree.js`
- `selectionAggregationContext.js`
- `intentProgramValidator.js`
- `actionShapeValidator.js`
- tool implementation files
- Redux/app runtime code
- UI files

### Generated artifacts that should be exported

For `v0.0.1`, the contract bundle should include:

- `generated/generatedActionSchema.json`
- `generated/generatedActionCatalog.json`
- `generated/generatedActionSummaries.json`
- `agentContext.schema.json`
- `agentTurnRequest.schema.json`
- `agentTurnResponse.schema.json`
- `toolCatalog.json` or equivalent generated tool-contract artifact
- `manifest.json`

Optional but useful:

- example request/response fixtures
- example tool-call fixtures

## Temporary Folder Direction

The Python PoC can live under `utils/` for now, but should still be structured
as if it were its own service.

Suggested temporary layout:

- `utils/agent_server/`
- `utils/agent_server/app/`
- `utils/agent_server/contracts/`
- `utils/agent_server/README.md`

The contract artifacts can either be copied into `utils/agent_server/contracts/`
as part of a build step or read from a dedicated generated output folder.

## Python Implementation Specs

The Python implementation should use current Astral tooling conventions and be
structured as a `uv` project first, not as a generic `pip` project.

Preferred tooling:

- `uv` for environment management, dependency management, and lockfile
  management
- `ruff` for linting and formatting
- `pytest` for tests
- `mypy` for static type checking

Tooling notes:

- Keep `ruff` current and aligned with Astral conventions.
- Treat lockfiles as `uv`-managed artifacts.
- If lockfiles drift, regenerate them with `uv lock`.
- Keep the Python repo self-contained so it can later move out of `utils/`
  without changing the project layout much.

Preferred provider adapter shape:

- Responses API first
- Chat Completions as an explicit fallback adapter only
- Shared GenomeSpy contract inputs: `message`, `history`, `context`
- Shared output shape: `answer` or `clarify`

## Coding Agent Prompt

```text
Design a minimal contract-packaging strategy and Python LLM server integration
for GenomeSpy, with the temporary Python implementation living under `utils/`
in this repo.

Context:
- GenomeSpy already owns the agent logic in `packages/app/src/agent`.
- GenomeSpy should remain the source of truth for:
  - context assembly
  - action and intent-program validation
  - visualization-specific semantics
  - agent tool definitions
- The agent tools will be implemented on the GenomeSpy side.
- Those tools should be exposed to the Python side through generated
  schema/contracts derived from GenomeSpy-side JSDoc + typings, rather than
  reimplemented manually in Python.
- The browser app should validate requests and tool-related payloads on the
  GenomeSpy side for v0.0.1.
- The Python server should remain thin in v0.0.1 and mostly forward validated
  requests to an LLM provider.
- We do not want to duplicate schema logic, tool definitions, or validation
  behavior in Python.
- We do want a clean, versioned interface boundary that a future separate
  Python repo can consume.
- For now, the Python PoC server can live under `utils/` in this repository.
- After the PoC works, we may move that Python code into a separate repo.
- We want to compare multiple inference providers over time, including local
  backends such as Ollama, vLLM, and LM Studio, as well as hosted APIs such as
  OpenAI and Claude.
- The framework should therefore remain provider-agnostic and avoid hard-coding
  one provider's request/response shape into the overall server architecture.

Existing files in GenomeSpy:
- `packages/app/src/agent/generated/generatedActionSchema.json`
- `packages/app/src/agent/generated/generatedActionCatalog.json`
- `packages/app/src/agent/generated/generatedActionSummaries.json`
- `packages/app/src/agent/schemaContract.ts`
- `packages/app/src/agent/types.d.ts`
- `packages/app/src/agent/contextBuilder.js`
- `packages/app/src/agent/agentAdapter.js`
- `packages/app/src/agent/LLM_PLAN/tools.md`
- related JSDoc- and typing-driven agent files under `packages/app/src/agent/`

Current request flow:
- The app posts to `/v1/agent-turn` with a JSON body like:
  - `message`
  - `history`
  - `context`
- `context` is assembled in GenomeSpy.
- Validation should stay on the GenomeSpy side for now.
- Tool definitions should also originate in GenomeSpy and be exported as
  machine-readable schema artifacts for Python consumption.

What I want from you:
1. Propose the best way to define agent tools in GenomeSpy using JSDoc +
   typings so they can generate a validated machine-readable contract.
2. Propose the best way to export a tiny “agent contract” package from
   GenomeSpy for use by a Python service.
3. Assume the first Python implementation lives under `utils/`, but design the
   contract boundary so it can later be moved to a separate repo with minimal
   changes.
4. Specify exactly which files should be included in that contract package for
   v0.0.1.
5. Distinguish between:
   - source-of-truth implementation files that must stay in GenomeSpy
   - generated contract artifacts that should be exported or copied into a
     contract bundle
6. Recommend the temporary folder layout under `utils/` for the PoC Python
   service.
7. Explain how the Python service should consume these artifacts without
   reimplementing GenomeSpy-side validation logic.
8. Recommend a provider-adapter pattern so different LLM backends can be
   compared behind the same service contract.
9. Suggest how to version the contract and detect mismatches between the app
   and the Python service.
10. Keep the solution minimal and pragmatic for the PoC, but extensible toward
   a future autonomous-agent service.

Constraints:
- Prefer JSON Schema artifacts over sharing raw TypeScript source with Python.
- Avoid duplicating validation logic in Python.
- Keep the Python server generic and thin.
- Treat GenomeSpy as the owner of all visualization-specific semantics and tool
  definitions.
- Favor generated build artifacts and a manifest over hand-maintained duplicate
  definitions.
- Agent tools should be described from GenomeSpy-side source code and typings,
  then exported as machine-readable contracts.
- The Python service may do lightweight transport-level checks and
  contract-version checks, but not deep semantic validation.
- The temporary location under `utils/` should not distort the long-term
  architecture.
- The provider layer should be generic enough to support Ollama, vLLM, LM
  Studio, OpenAI, and Claude without changing the GenomeSpy-side contract.
- The Python implementation should use `uv`, `ruff`, `pytest`, and `mypy` as
  the default quality/tooling stack.
- This should be a `uv` project first, and lockfiles should be regenerated with
  `uv lock` when they drift.

Please produce:
- A recommended approach for defining GenomeSpy-side agent tools via JSDoc +
  typings
- A recommended contract packaging approach
- The exact artifact list for v0.0.1
- A suggested temporary folder/package structure under `utils/`
- A migration path from `utils/` to a separate repo
- A recommended provider-adapter strategy for supporting multiple inference
  backends
- A versioning strategy
- A minimal Python consumption strategy
- A recommended Python project/tooling layout using `uv`, `ruff`, `pytest`,
  and `mypy`
- Key anti-patterns to avoid
```

## Notes

The intended implementation model is:

- GenomeSpy validates and assembles
- Python transports and orchestrates
- the LLM consumes a stable contract
- the provider backend is swappable behind a generic adapter layer
- future autonomy can be added without moving visualization semantics out of
  GenomeSpy

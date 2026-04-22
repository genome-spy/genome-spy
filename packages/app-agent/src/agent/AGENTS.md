# GenomeSpy App Agent

This package implements the browser-side agent for GenomeSpy App. The project
is still in early stages.

## General guidelines

- The design docs live in `./LLM_PLAN/`. The documentation should describe the current or intended design, not removed fields or obsolete shapes. When a discarded approach matters, capture the broad rationale briefly instead of documenting the old field names in detail.
- There is absolutely no need to maintain any backwards compatibility for the agent API or context shape at this point. We can iterate rapidly and refactor as needed.
- The Python relay server is implemented in Python and lives in `packages/app-agent/server` for now.
- Any schemas or metadata needed for the agent should be generated from the app's existing sources of truth where possible, rather than hand-maintained. For example, action schemas can be generated from the Redux slice definitions and JSDoc comments.
- `generated*.(json|ts)` files are generated artifacts that should not be manually edited.
- When changing a source contract that feeds generation, regenerate the corresponding `generated*` artifacts before finishing the change. This includes tool catalog/schema files and action schema/type files.
- All host state and mutation calls between the agent and the App must go through `AgentApi`.
- All pure helper logic that is shared between the App and the future agent package must go through `agentShared`.
- Do not add direct `packages/app/src/...` reach-ins when the functionality
  already exists on `AgentApi` or `agentShared`.
- Extend `AgentApi` conservatively. If a missing hook seems necessary, plan it first and keep the smallest possible surface.

## Code organization

- The agent adapter code should be self-contained and not leak into the core app logic.
- However, functionality must not be duplicated if something similar already exists in the app, core, `AgentApi`, or `agentShared`.
- If the adapter needs new capabilities from the `core` or `app` packages, or a new `AgentApi` hook, discuss it before making code changes.
- Changes that touch code outside the adapter (i.e., in the core app or shared packages) must be placed in a separate commit.

## Design principles

- The agent loop, tool definitions, etc., should follow the best practices and established patterns from the LLM agent design community.
- Ideally, the agent could be run on a small local LLM without any custom fine-tuning, so the tools and context should be designed with that in mind.
- If a design choice was discarded, document the reason at a high level when it helps explain the current approach. Do not turn the design docs into a changelog of removed fields or prior IR shapes.

## Commits

- Before commiting, check the diff to ensure that the commit message is accurate
- Summarize the changes in the commit message body

# GenomeSpy App AI Agent Adapter

This folder implements the core logic for an LLM agent that can understand the
current visualization state and propose actions. The project is still in early stages.

## General guidelines

- The plan docs live in `./LLM_PLAN/`. The documentation should also reflect the current state of implementation and be updated as features are added or changed.
- There is absolutely no need to maintain any backwards compatibility for the agent API or context shape at this point. We can iterate rapidly and refactor as needed.
- A separate server application, which communicates with the LLM, is implemented in Python and doesn't live in this monorepo.
- Any schemas or metadata needed for the agent should be generated from the app's existing sources of truth where possible, rather than hand-maintained. For example, action schemas can be generated from the Redux slice definitions and JSDoc comments.
- `generated*.(json|ts)` files are generated artifacts that should not be manually edited.

## Code organization

- The agent adapter code should be self-contained and not leak into the core app logic.
- However, functionality must not be duplicated if something similar already exists in the app or core packages.
- If the adapter needs new capabilities from the `core` or `app` packages, an approval is needed before any code changes.
- Changes that touch code outside the adapter (i.e., in the core app or shared packages) must be placed in a separate commit.

## Design principles

- The agent loop, tool definitions, etc., should follow the best practices and and established patterns from the LLM agent design community.
- Ideally, the agent could be run on a small local LLM without any custom fine-tuning, so the tools and context should be designed with that in mind.

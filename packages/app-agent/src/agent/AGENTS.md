# GenomeSpy browser agent

The browser-agent API and context shape are still experimental. Refactor them
freely when doing so simplifies the current design; backward compatibility is
not required yet.

## Sources of truth and generated artifacts

- Keep design documents in `../../LLM_PLAN/` about the current or intended
  design. Record discarded approaches only when their broad rationale explains
  the selected design; do not preserve obsolete field-level shapes as a
  changelog.
- Generate schemas and metadata from App sources of truth when practical rather
  than maintaining copies. Action schemas, for example, derive from Redux slice
  definitions and JSDoc.
- Never edit `generated*.(json|ts)` artifacts manually.
- When a source contract feeds generation, regenerate all corresponding tool
  catalog/schema and action schema/type artifacts before finishing.

## App boundary

- Keep the adapter self-contained without leaking agent implementation into Core
  or App logic.
- Do not duplicate behavior already present in App, Core, `AgentApi`, or
  `agentShared`.
- Route all host state reads and mutations through `AgentApi`.
- Route pure helpers shared with App through `agentShared`.
- Import App UI primitives only through explicit public package subpaths.
- Do not reach directly into `packages/app/src/...` when a public App export
  already supplies the behavior.
- Extend `AgentApi` conservatively. Plan the smallest new hook before changing
  the public boundary.
- Discuss a required Core/App capability or new `AgentApi` hook before making
  the cross-package change. Put changes outside the adapter in a separate commit.

## Agent design

- Follow established LLM-agent patterns for the loop, tool contracts, and
  context assembly rather than inventing unnecessary protocol layers.
- Design prompts, tools, and context for useful operation on a small local model
  without custom fine-tuning.
- Keep provider-facing guidance compact; detailed intent documentation should
  remain on demand.

Before committing, use the repository `prepare-genomespy-change` skill and
inspect the complete diff so the message and body describe every included area.

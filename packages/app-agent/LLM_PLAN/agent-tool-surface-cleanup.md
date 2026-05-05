# Agent Tool Surface Cleanup

Short current-state note for the remaining cleanup around agent tools.

## Current State

- The browser-side JavaScript package owns the agent tool definitions,
  runtime handlers, generated artifacts, and most of the tool-facing logic.
- The Python relay is thin. It forwards requests, normalizes provider
  responses, and handles provider-facing prompt assembly.
- The app remains the owner of `AgentApi` and the app shell.
- The tool surface already uses generated artifacts and runtime validation.

## Remaining Cleanup

- Reduce duplicated runtime typedefs and pass-through declarations in the
  JavaScript agent package.
- Keep browser UI registration separate from analysis and mutation logic.
- Trim tests that only restate the same tool inventory, retry policy, or
  rejection wording in multiple places.
- Keep the tool catalog and schema projections as projections, not as new
  sources of truth.
- Keep the relay from mirroring browser tool files or building its own copy of
  the browser tool surface.

## Boundary Rules

- Prefer one canonical definition for each tool or runtime capability.
- Validate before execution.
- Keep read-only exploration separate from provenance-changing mutation.
- Expose stable identifiers rather than labels when the model needs to choose.
- Expand the app surface only when the agent needs a concrete new host
  capability.

## Relevant Files

- [`agentToolInputs.d.ts`](../src/agent/agentToolInputs.d.ts)
- [`toolCatalog.js`](../src/agent/toolCatalog.js)
- [`agentTools.js`](../src/agent/agentTools.js)
- [`contextBuilder.js`](../src/agent/contextBuilder.js)
- [`agentSessionController.js`](../src/agent/agentSessionController.js)
- [`agentAdapter.js`](../src/agent/agentAdapter.js)
- [`selectionAggregationTool.js`](../src/agent/selectionAggregationTool.js)
- [`intentProgramValidator.js`](../src/agent/intentProgramValidator.js)
- [`intentProgramExecutor.js`](../src/agent/intentProgramExecutor.js)
- [`packages/app-agent/server`](../server)

## Notes

If a cleanup step does not reduce duplication or narrow a boundary, it probably
belongs in code, not in this note.

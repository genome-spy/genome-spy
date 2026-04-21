# Agent Host API and Package Extraction

Note: This file is an early draft, not to be implemented yet.

This note tracks the remaining work to move the current agent code out of
`packages/app/src/agent` while keeping the app-owned `agentApi` boundary in
`packages/app/src/agentApi`.

The goal is not to define a public plugin contract yet. The goal is to keep
the app-owned boundary small, let the extracted browser agent package depend on
it, and leave room for a later MCP package if the same GenomeSpy-specific
analysis surface is needed there.

In this note, `agentApi` means the app-owned boundary that stays in
`packages/app/src/agentApi`.

In this note, `agent` means the extracted implementation that will move out of
`packages/app/src/agent` into a dedicated package in the monorepo first, and
possibly into a separate repository later.

## Why This Boundary Exists

The browser agent still reaches into app internals for sample metadata,
provenance, view resolution, and intent execution. That coupling is fine for
fast iteration, but it makes the agent harder to extract as a separate package.

The app should keep the boundary only. The extracted agent package should own
its runtime composition, derived catalogs, and UI orchestration, and it should
depend on `AgentApi` instead of on `App` internals.

All future agent-to-App communication for analysis, state access, and mutation
should go through `AgentApi`. If a needed host hook is missing, add it only
after careful planning and explicit discussion. Extend the API conservatively
so the agent does not gradually bloat the app.

Toolbar and other shell UI registration stay on the existing `app.ui` API and
should not be added to `AgentApi`.

## Current Boundary

`AgentApi` already exists and should stay the only app-owned boundary for the
agent package.

- keep it small and centralized
- add hooks only when the extracted agent package has a concrete need
- prefer narrow, app-owned methods over broad abstractions
- do not introduce `AgentAnalysisHost`, `AgentToolHost`, or snapshot types at
  the start
- keep the app implementation internal

## Shared Utility Surface

Pure helpers that are needed by both the app and the future agent package
should not be copied into `agent` and should not be pushed through
`AgentApi`.

This shared utility surface already exists as `packages/app/src/agentShared`.
It is an exposure layer, not a refactor target for app internals.

- the shared surface should only expose pure helpers
- it may depend on public `@genome-spy/core` exports
- it should not require refactoring app internals to work
- it should be the place for helpers that are neither host state nor agent
  runtime orchestration
- it should keep the agent package from duplicating app-local helper logic

## Extraction Checklist

The remaining work falls into two buckets.

### Fix directly in `agent`

These items do not need new `AgentApi` hooks. They can stay in the agent
package and use public shared helpers or public `@genome-spy/core` exports.

- [`contextBuilder.js`](../contextBuilder.js)
  - keep the current `AgentApi` reads
- [`searchViewDatumsTool.js`](../searchViewDatumsTool.js)
  - keep using the current `AgentApi` view hooks
  - the view-local search inspection can use public `@genome-spy/core`
    imports
- [`intentProgramExecutor.js`](../intentProgramExecutor.js)
  - keep the current `AgentApi` hooks
  - keep the sample-hierarchy before/after counts as local computation
- [`intentProgramValidator.js`](../intentProgramValidator.js)
  - keep the current `AgentApi` hooks
  - keep the validation logic local to the agent package
- [`chatPanel.js`](../chatPanel.js), [`agentUi.js`](../agentUi.js),
  [`agentEmbedRuntime.js`](../agentEmbedRuntime.js), and
  [`agentState.js`](../agentState.js)
  - keep these as agent bootstrap or shell wiring

### Likely `AgentApi` growth

Only the scoped param lookup still looks like a real host-boundary gap.

- [`selectionAggregationContext.js`](../selectionAggregationContext.js)
  - `getSampleViewScopedParamConfig(paramName)` is intentionally temporary
  - when the selection path is made unscoped, replace it with a selector-based
    param lookup on `AgentApi`, likely `getParamConfig(ParamSelector)` or a
    similarly narrow hook

The rule is still the same: prefer direct fixes inside the agent package until
the code truly needs a new host capability. Add new `AgentApi` hooks only when
that happens, and keep each addition small.

## Proposed Package Split

### `@genome-spy/app`

Owns the app shell and exports the app-owned boundary.

- `src/agentApi`
  - app-owned boundary for the essential hooks and types the agent needs
  - should remain small and centralized
  - should only gain new hooks after the agent package proves they are needed

### Shared utility surface

Owns the pure helpers that both the app and the agent package need.

- public barrel or package, not an app-private reach-in
- may depend on public `@genome-spy/core` exports
- must not depend on `packages/app/src/...`
- should carry helpers that are shared, stable, and not host-state-specific

### `@genome-spy/app-agent`

Owns the extracted agent implementation as a first-class package in the
monorepo. This is the first extraction target before any separate repo split.

- agent bootstrap and runtime composition
- `agentState`
- `AgentSessionController`
- `contextBuilder`
- `agentAdapter`
- `chatPanel`
- `toolbarMenu`
- toolbar button registration and panel entry wiring
- tool catalog and schema handling
- action and tool catalog generation from local agent contracts and
  `AgentApi` exports
- agent-local prompt/session logic
- local or shared styling for the panel surface

If the agent later becomes a separate repository, this package boundary should
already be narrow enough that the repo move is mostly a packaging change rather
than an architecture change.

### `@genome-spy/app-agent-mcp`

Future package.

- MCP transport
- tool registration
- request/response translation
- reuse of the shared `AgentApi` boundary

## Concrete Next Steps

1. Keep `AgentApi` host-only.
   - Do not move utility helpers into `AgentApi`.
   - The only expected future host addition is replacing
     `getSampleViewScopedParamConfig()` with a selector-based param lookup
     when the selection path becomes unscoped.

2. Extract `agent` into `@genome-spy/app-agent`.
   - Make it depend on `AgentApi`, the shared utility surface, and public
     `@genome-spy/core` exports only.
   - Move the browser-agent runtime, panel, tools, and catalog generation into
     that package.

3. Add an MCP adapter later.
   - Reuse the same `AgentApi` boundary.
   - Do not reuse chat or session APIs in MCP.

## Working Assumption

The near-term goal is a clean internal boundary that:

- preserves fast iteration
- removes direct `App` coupling from the agent package
- keeps room open for a future MCP server
- makes `agent` an extracted package in the monorepo first, with the option to
  split it into a separate repository later
- avoids over-designing a public extension API too early

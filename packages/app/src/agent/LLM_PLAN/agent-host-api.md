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

## Proposed Package Split

### `@genome-spy/app`

Owns the app shell and exports the app-owned boundary.

- `src/agentApi`
  - app-owned boundary for the essential hooks and types the agent needs
  - should remain small and centralized
  - should only gain new hooks after the agent package proves they are needed

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
- action and tool catalog generation from the app-owned `AgentApi` exports
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

## Extraction Sequence

1. Keep `AgentApi` small and conservative.
   - Add hooks only when the extracted agent package has a concrete need.
   - Prefer narrow, app-owned methods over broad abstractions.

2. Extract `agent` into `@genome-spy/app-agent`.
   - Move the browser-agent runtime, panel, tools, and catalog generation into
     the package.
   - Depend on `AgentApi`, not on app source files.

3. Remove residual direct `App` reads uncovered by extraction.
   - Keep the app boundary focused on the minimal hooks the agent actually
     uses.
   - Introduce a smaller abstraction only when a repeated call pattern becomes
     awkward.

4. Add an MCP adapter later.
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

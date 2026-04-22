# GenomeSpy App Agent

## Architecture reference

- See `packages/app/AGENTS.md` for the app host boundary and core app
  conventions.
- See `src/agent/AGENTS.md` for the browser-agent package conventions.

## Scope

- This package owns the browser-side agent plugin, chat UI, tool logic,
  generated agent artifacts, and related tests/docs.
- The app host still owns `AgentApi` and the app shell.
- The Python relay currently lives in `packages/app-agent/server` for now.

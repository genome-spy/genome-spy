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
- Most of the active implementation is in the JavaScript package under
  `src/agent/`; start there first when you have an empty context.
- The Python server is intentionally thin: it relays requests, normalizes
  provider responses, and owns the system prompt / provider-facing assembly.
- The browser-agent split policy lives in `src/agent/AGENTS.md`: do not
  duplicate app-owned code or types, go through public app APIs first, and
  expand those APIs deliberately only when necessary.

## Fast Start

If you are starting from scratch, read these files in order:

1. `README.md` for the package-level overview and how to enable the plugin.
2. `src/agent/AGENTS.md` for the browser-agent split policy and working rules.
3. `src/agent/appAgent.js` and `src/agent/chatPanel.js` for the entry points.
4. `LLM_PLAN/index.md` for the remaining design notes that are still relevant.
5. `server/README.md` if you need to touch the Python relay.

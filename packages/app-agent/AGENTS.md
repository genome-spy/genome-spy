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

## Agent Guidance

- Additions to system prompts and tool docs must be considered carefully and
  optimized for size because both end up in provider-facing context. Prefer
  concise tool-result guidance when it can carry context-specific instructions
  at the point of failure.
- Intent action docs may be more elaborate when needed because they are loaded
  on demand with `getIntentActionDocs` / `getIntentActionTypeDocs`, rather than
  always included in the base context.
- Prefer actionable, failure-local guidance in rejected tool results when it
  helps the model recover from a specific wrong assumption. Keep it conditional
  and concise: state what failed, what context/tool result to check next, and
  when the alternative path is unavailable.
- Optimize provider-facing guidance for local models and a 32k token context
  window. Assume prompt, tool docs, context summaries, history, and tool results
  must all fit inside that budget.

## Fast Start

If you are starting from scratch, read these files in order:

1. `README.md` for the package-level overview and how to enable the plugin.
2. `src/agent/AGENTS.md` for the browser-agent split policy and working rules.
3. `src/agent/appAgent.js` and `src/agent/chatPanel.js` for the entry points.
4. `LLM_PLAN/index.md` for the remaining design notes that are still relevant.
5. `server/README.md` if you need to touch the Python relay.

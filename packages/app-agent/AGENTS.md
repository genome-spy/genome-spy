# GenomeSpy App Agent

## Architecture and routing

- Read `ARCHITECTURE.md` for package ownership, entry points, and the suggested
  reading order.
- Read `packages/app/AGENTS.md` before changing the host App boundary.
- Read `src/agent/AGENTS.md` before editing the browser-agent implementation.
- Read `server/AGENTS.md` and `server/ARCHITECTURE.md` before editing the Python
  relay.

## Package boundaries

- This package owns the browser-side agent plugin, chat UI, agent tools,
  generated agent artifacts, and related tests and documentation.
- The App owns `AgentApi`, the app shell, shared UI primitives, and app state.
- The Python relay must remain thin and provider-oriented; browser-side domain
  behavior belongs in the JavaScript package.
- Do not duplicate app-owned code or types. Use public App APIs first and expand
  them deliberately only when necessary.

## Provider-facing context

- Treat every addition to system prompts and tool descriptions as an always-on
  context cost. Optimize them for local models and a 32k-token context window.
- Prefer concise, failure-local guidance in rejected tool results when it can
  tell the model what failed, what state or result to inspect next, and when an
  alternative is unavailable.
- Intent-action documentation may be more detailed because
  `getIntentActionDocs` and `getIntentActionTypeDocs` load it on demand.
- Evaluate prompt, tool descriptions, context summaries, history, and tool
  results as one shared context budget.

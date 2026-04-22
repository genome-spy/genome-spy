# Token Debugger Plan

## Goal

Use the Python-side token debugger on every agent-turn request so developers
can see where the prompt budget goes during normal relay use.

The first implementation should stay entirely on the Python side. It should not
add browser UI work or expand the browser-agent integration yet.

The main practical questions are:

- how large the system prompt is,
- how large the current GenomeSpy context snapshot is,
- how much history contributes,
- how much the current user message contributes,
- and which top-level context keys, especially `viewRoot`, dominate the
  context size.

## Why this is needed

The token debugger helper now exists, but it is not yet part of the normal
request flow. Developers still have to call it manually to understand prompt
size.

For the current developer use case, the simplest useful step is to compute a
token summary on every `/v1/agent-turn` request and log it from the relay.

That gives immediate visibility during real chat use without adding:

- a new browser feature,
- a new public endpoint,
- or a separate offline analysis workflow.

## Scope

The initial integration should stay intentionally small.

Include:

- request-level token summary generation in the Python relay,
- compact relay-side logging on every agent turn,
- and focused tests for the logging behavior.

Do not include in the first integration step:

- chat panel rendering,
- browser-agent trace plumbing,
- a new HTTP debug endpoint,
- a separate standalone CLI command,
- or provider-side usage reconciliation.

## Proposed implementation

Keep the token debugger integration at the request boundary in
`packages/app-agent/server/app/main.py`.

The relay should:

- build the `ProviderRequest` as it already does,
- call `summarize_prompt_tokens(...)` once per request,
- log a compact token summary,
- and then continue with normal request handling.

The log output should stay small and developer-oriented. A useful shape would
include:

- model,
- total token estimate,
- system prompt tokens,
- context tokens,
- history tokens,
- message tokens,
- and the largest context contributor when available.

For example:

- `Agent token usage: total=10423 system=1850 context=7310 history=980 message=283 top=viewRoot:6421`

## Design constraints

- Compute the summary once per incoming request, not once per provider path.
- Keep the existing request/response contract unchanged in the first step.
- Treat the result as a debugging estimate, not exact provider billing data.
- Reuse the existing `summarize_prompt_tokens(...)` helper directly.
- Keep provider implementations unchanged unless a later phase proves a strong
  need for response trace integration.

## Reuse of existing code

The implementation should reuse:

- `summarize_prompt_tokens(...)` from `app/token_debugger.py`,
- the existing `ProviderRequest` creation in `app/main.py`,
- and the current request logging flow in the relay.

This keeps the behavior aligned with the actual prompt assembly path and avoids
recomputing token summaries in multiple layers.

## Files to modify

- `packages/app-agent/server/app/main.py`
- `packages/app-agent/server/tests/test_main.py`

## Implementation steps

### Phase 1. Add request-level token logging

- Import the token debugger helper in `app/main.py`.
- Compute the token summary after building `ProviderRequest`.
- Log a compact summary once per `/v1/agent-turn` request.

Verification:

- every request logs token usage once,
- the log includes the main token buckets,
- and existing request handling behavior stays unchanged.

### Phase 2. Add focused tests

- Add a test that exercises `/v1/agent-turn` and confirms token usage logging.
- Assert for the presence of key fields rather than exact token values.
- Keep the test specific enough to catch missing context or duplicate logging.

Verification:

- the logging test fails if token logging is removed,
- the logging test fails if key summary fields disappear,
- and the endpoint still returns the expected response.

## Later options

If relay logging proves insufficient, the next Python-side step could be to add
token summary data to a relay-side trace object. That should be treated as a
separate phase because it expands the effective response contract.

Possible later additions:

- include token summary in non-stream and stream trace payloads,
- add a standalone CLI for offline inspection of saved request payloads,
- compare local estimates with provider-reported token usage when available.

These are explicitly out of scope for the first integration step.

## Expected outcome

After this lands, developers should be able to run the relay, use the agent
chat normally, and see prompt token usage in the Python logs for every turn.

That should be enough to answer:

- whether the context snapshot dominates the budget,
- whether `viewRoot` is the main contributor,
- whether history is growing too much,
- and whether the system prompt is disproportionately large.

This keeps the implementation small while making the token debugger useful in
the real request path.

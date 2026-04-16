# Token Debugger Log Format Plan

## Goal

Improve the relay-side token debugger logs so a single request log makes it
easy to see both:

- how the prompt budget is split across the main prompt buckets, and
- which top-level context branches dominate the serialized context snapshot.

This work changes logging only. It does not change prompt assembly, browser
payloads, or any prompt-trimming policy.

## Why this change is useful

The first token logger format answers whether `system`, `context`, `history`,
or `message` dominates overall prompt size. That is useful, but it still
leaves a follow-up question unanswered during debugging:

"Which part of `context` is actually large?"

The summarizer already computes top-level `context_by_key` token estimates.
The log should expose more of that data directly so developers do not have to
recompute or inspect the raw summary object elsewhere.

## Scope

Include:

- a more readable multi-line log format,
- a ranked list of the largest top-level context contributors,
- percentages relative to both `context` and total prompt size,
- focused unit coverage for the formatter,
- and request-level integration coverage for the new log shape.

Do not include:

- prompt trimming,
- browser UI changes,
- new HTTP endpoints,
- provider usage reconciliation,
- or deeper recursive context-tree analysis.

## Proposed log shape

The log should keep the main prompt buckets and add a compact ranked context
breakdown. A representative format:

- `Agent token usage:`
- `  model: gpt-5.4-mini`
- `  total: 7538`
- `  buckets:`
- `    system = 2889 (38.3%)`
- `    context = 4639 (61.5%)`
- `    history = 5 (0.1%)`
- `    message = 5 (0.1%)`
- `  context keys:`
- `    viewRoot = 3120 (67.3% of context, 41.4% of total)`
- `    provenance = 820 (17.7% of context, 10.9% of total)`
- `    attributes = 510 (11.0% of context, 6.8% of total)`

If the number of keys exceeds the display limit, aggregate the remainder into
an `other` line instead of dumping every small key.

## Design constraints

- Keep the summary derived from the existing canonical prompt builder path.
- Keep logs compact enough for normal relay use.
- Prefer a deterministic key ordering for equally sized entries.
- Preserve the current "developer debugging" role of the token summary.
- Avoid mixing prompt-usage estimates with provider billing numbers.

## Files

- `utils/agent_server/app/token_debugger.py`
- `utils/agent_server/tests/test_token_debugger.py`
- `utils/agent_server/tests/test_main.py`

## Implementation steps

### Phase 1. Add a dedicated formatter

- Add a helper that formats `TokenDebugSummary` into a multi-line string.
- Keep the existing main buckets.
- Add ranked top-level context entries with percentages of `context` and total.

Verification:

- formatted output contains the bucket section,
- formatted output contains the context-key section,
- and the output remains readable for ordinary request logs.

### Phase 2. Update request logging

- Keep request-time summary generation in `app/main.py`.
- Route relay logging through the new formatter.

Verification:

- `/v1/agent-turn` still logs once per request,
- the log contains the new bucket section,
- and the log contains the ranked context breakdown.

### Phase 3. Protect behavior with tests

- Add a formatter-focused unit test.
- Update the request logging integration test to assert the new shape.

Verification:

- removing the context-key section breaks tests,
- removing the bucket section breaks tests,
- and existing endpoint behavior stays unchanged.

## Later options

If the new format proves useful, later work could add:

- deeper breakdowns for heavy keys such as `viewRoot` or `provenance`,
- relay trace payload integration for streamed and non-streamed turns,
- or optional JSON-formatted debug logs for offline analysis.

Those should be separate steps because they expand either verbosity or surface
area beyond the current logging-only goal.

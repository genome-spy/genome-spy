# Reactive error reporting

Status: completed; implemented and verified.

## Problem

`GraphRuntime` is not connected to Core's error reporter. Reactive flushes
throw and reject existing propagation waiters, but failures in microtasks and
debounce timers can escape without reaching `onError` or the scoped error box.
Synchronous parameter notifications can also throw before `flushNow()`.

The required behavior is simple: stop the failing update, show the original
error, and preserve the exception or promise rejection.

## Design and scope

Pass one optional internal reporter into the shared parameter runtime. Supply
it when constructing the root view runtime; child scopes share the same graph
and reporter. Route propagation and notification failures through Core's
existing error-reporting path and regular scoped error box.

Report at the shared boundary, including the notification path that executes
inside `ref.set()`. Preserve the original throw after reporting. A failed flush
still rejects its existing waiters and stops that propagation attempt. Keep
scheduled microtasks and debounce publication covered without adding catches
to individual formulas or filters.

A host reporting callback must not mask the original propagation error. Reuse
Core's error-identity deduplication for interaction and animation boundaries
that also catch and report. Standalone runtimes still throw without requiring
a UI reporter. Preserve startup failure capture and embed rejection.

There are no recovery changes: no debounce eligibility fix, retries, rollback,
failed-work tracking, or automatic error-box/status cleanup. Do not add a
permanent failed-state flag. Re-embedding provides a clean instance after an
error; this change makes no new guarantee about continued use of a failed one.

## Alternatives and references

Input-binding catches alone miss API setters, microtasks, and timers. Global
browser error listeners cannot reliably assign a failure to its embed. The
shared runtime is the existing owner of propagation and its failure boundary.

[Vega's runner](https://github.com/vega/vega/blob/main/packages/vega-dataflow/src/dataflow/run.js)
reports evaluation failures at the runtime boundary;
[Preact Signals](https://github.com/preactjs/signals/blob/main/packages/core/src/index.ts)
finishes batch bookkeeping before throwing an effect error. Keep GenomeSpy's
existing stop-on-streaming-failure contract. No external code is copied.

## Implementation milestone

Outcome: reactive errors become visible while retaining fail-fast behavior.

Affected areas: `GraphRuntime`, `ParamRuntime`, root `ViewParamRuntime`
construction, view-context wiring, and Core reporting. Include parameter and
transform debounce publication boundaries where necessary. App and rendering
backends consume this shared runtime; no renderer-specific behavior is needed.

Verification:

- Check synchronous notification and flush errors, scheduled microtasks, and
  parameter/transform timers. Assert original-error identity and reporting.
- Keep rejection of existing propagation waiters and prevent downstream
  observers from running after a failed streaming publication.
- Use a focused Core spec test to check the host callback and default scoped
  error box, including startup capture, host-callback failure, and disposal.
- Preserve existing batching, replay, readiness, and lifecycle tests.

Update the embedding error documentation and reactivity architecture notes.
Include one Core patch changeset; no public API or migration is required.

Tentative commit: `fix(core): report reactive propagation errors`.
Review the shared error boundary and Core wiring together before committing.

## Integration and acceptance

Use a playground spec with a parameter-dependent failing formula. Check the
original error is shown with and without transform debounce and with a
debounced expression parameter. Check default display and `onError`
suppression. Edit the spec to re-embed and confirm the normal chart returns.

Smoke `formula-with-parameters.json` and `parameterized_range_test.json` with
Canvas and WebGL; review the shared WebGPU consumer boundary for compatibility.
Run affected runtime, replay, embed, and Canvas live suites, type checks,
targeted lint, formatting, and release checks.

Acceptance: the original error is reported once to the host, reaches the
existing default display unless handled, and still throws/rejects through its
existing caller contract. The failing propagation pass stops. Recovery
behavior remains unchanged.

The main risk is replacing an original error with a reporting error or reporting
it twice. Cover those boundaries directly. Internal callback plumbing can be
chosen during implementation; keep it within existing owners.

## Completion record

Implemented the optional shared reporter and Core wiring. Notification failures
use the existing propagation cleanup, and an aborted transaction does not resume
queued propagation. Original exceptions and waiter rejections remain intact.
Host callback failures fall back to the default display without masking the
propagation error. No recovery machinery or debounce eligibility changes were
added.

Verification completed:

- 118 tests passed across 12 focused runtime, replay, embed, headless, and Canvas
  live suites. Coverage includes microtasks, both debounce timers, synchronous
  notifications, failed transactions, waiters, startup, and host callbacks.
- Playground reproduction showed the centered red error box for immediate,
  transform-debounced, and parameter-debounced formula failures. Editing the
  spec created a working embed again. Host suppression was checked in Core tests.
- `formula-with-parameters.json` and `parameterized_range_test.json` rendered and
  responded to controls with WebGL and Canvas. WebGPU uses the same Core-owned
  view/runtime path; no renderer adapter changes are needed.
- Workspace TypeScript checks, targeted ESLint, Prettier, diff whitespace checks,
  and release checks passed. The Core patch fragment produces a patch release
  for the configured fixed package group.

Shared error boundaries and downstream consumers reviewed. No outstanding tasks.

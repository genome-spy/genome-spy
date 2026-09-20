# Public view data API handoff

## Scope and decisions

Finalize the existing local `ViewHandle.describe()`, `readData({ limit })`, and
`getScaleResolution("x" | "y")` additions. These are ordinary Core embed APIs;
they do not depend on Agent Toolkit or QuickJS. Reuse current readiness, collector,
scale and view-lifecycle contracts. No new query engine, facet support, lazy-data
completion guarantee, dependency upgrades, or agent runtime belongs in this change.

Metadata and returned rows are detached. Reads cover currently loaded transformed
rows in collector order, with 0–1000 returned and at most limit + 1 examined rows.
Reads reject unready data, containers, non-cloneable returned rows, and multiple
facet batches. Scale access supports existing unnamed positional scales and returns
undefined when absent. Removed views and finalized embeds reject access.

The alternative of implementing these operations in the toolkit would expose Core
internals and duplicate ownership; retain the public Core boundary instead.

## Coherent implementation milestone

Outcome: reviewed public methods with meaningful boundary tests, synchronized types
and documentation, and a verified real-chart consumer.

- [x] Independently review the proposed contracts and missing coverage.
- [x] Add lifecycle, positional-scale, clone-failure and multiple-facet assertions.
      Correct demonstrated defects without expanding the API.
- [x] Run focused view tests, Core type/lint checks, declaration generation and API
      reference generation; review generated changes.
- [x] Run toolkit checks and browser integration against this exact worktree.
- [x] Independently review the final diff and resolve material findings.
- [x] Reconcile this plan for the API feature commit. Retire the completed plan
      in a separate later commit and record the Core revision in toolkit's handoff.

Affected files: viewDataApi.js/test.js, viewMutationApi.js, embedApi.d.ts,
docs/api/views.md and generated API reference. The downstream consumer is
Agent Toolkit's finite, non-faceted Phase 1 browser example.

Tentative commit: `feat(core): expose view descriptions and bounded data reads`.

## Risks and acceptance

A returned scale is Core's existing scale API, not a new wrapper. Readiness remains
data readiness, not a rendering fence. A row-count bound does not bound nested
object size. Tests must verify actual public calls and lifecycle, not mocks alone.

Acceptance requires rejected stale/invalid calls, preserved read bounds/detachment,
existing view tests passing, and the toolkit's known-answer and timeout-recovery
browser tests passing against this checkout. The original checkout stays unchanged.

The branch starts at tested commit 768e3ea5, 103 commits ahead of local master.
Upstream base selection, pushing, PR publication and remote CI are separate delivery
work, not authorized by this local implementation task. No dependency update is
included. Do not claim these gates completed by local tests.

Plan review accepted the bounded contract. Reuse existing lifecycle guards to
distinguish staleEmbed from staleHandle; leave pre-existing isAlive behavior
unchanged. Use a real collect-grouping dataflow to exercise facet rejection.

Final review approved runtime and tests. Corrected metadata wording to authored
and inherited encoding; getEncoding does not include runtime mark adjustments.
Focused view tests: 54 passing. Core types/lint and declaration/API-doc generation
passed. This documentation correction does not alter the runtime data shape.

Integration passed against this worktree: 47 toolkit tests, example build and
all four browser tests using a fresh server. The temporary installed Core link
was restored afterward. Implementation and both reviews are complete; no runtime
findings remain. Retirement follows the feature commit; remote delivery remains
explicitly outside this completed local milestone.

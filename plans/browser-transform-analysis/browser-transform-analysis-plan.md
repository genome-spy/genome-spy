# Browser-side transformation pipelines

Status: completed; implemented and reviewed on `codex/browser-transform-analysis`.

## Purpose and scope

Expose one low-level operation that runs an explicitly supplied GenomeSpy
transformation pipeline over a bounded snapshot of a unit view's current data
and returns its results. Apps and their agents can express calculations as JSON
using the existing grammar, without adding a temporary visualization.

Examples include summarizing brushed measurements, calculating scores and ranks
for visible cells, or sampling records before application-side inspection.
The app remains responsible for choosing the pipeline, interpreting its output,
and deciding whether to update a track or selection.

This is a separate change from [PR #576](https://github.com/genome-spy/genome-spy/pull/576).
The planning branch starts at its `852d597a` revision, so the scoped readback API
is available. Keep implementation on this separate branch; while #576 is open,
a follow-up PR can be stacked on its branch and retargeted to `master` after it
merges. Do not add this feature to #576.

## Proposed API

Add one synchronous method on `ViewHandle`:

```ts
type TransformDataOptions = {
  scope: "viewport" | { selection: string };
  transform: readonly AnalysisTransformParams[];
  inputLimit: number;
  limit: number;
};

interface ViewHandle {
  transformData(options: TransformDataOptions): {
    rows: Record<string, unknown>[];
    truncated: boolean;
  };
}
```

The request is JSON-compatible. `transform` uses the same singular property name
and transform objects as a visualization specification. No callbacks or general
JavaScript functions are accepted. An empty pipeline is valid.

```js
const view = api.views.get({ scope: [], view: "measurements" });
const result = view.transformData({
  scope: { selection: "brush" },
  transform: [
    { type: "filter", expr: "datum.value >= 0" },
    { type: "formula", expr: "datum.value * 2", as: "score" },
    {
      type: "aggregate",
      groupby: ["group"],
      fields: ["score", "score"],
      ops: ["count", "mean"],
      as: ["count", "meanScore"],
    },
  ],
  inputLimit: 50000,
  limit: 100,
});
```

The complete scoped input is analyzed. The app receives group summaries rather
than the original observations. It can render a table, update a declared dataset
with existing dataset APIs, or use preserved record keys with the existing
selection setter. Those follow-up actions are separate calls owned by the app.
An aggregate that removes original record keys does not automatically select
its contributing observations.

## First-version transformation set

Reuse the existing implementations and parameter types. Export a narrowly
scoped `AnalysisTransformParams` union; derive operation enums and field rules
from the existing grammar rather than inventing a second language.

| Transform   | Supported behavior                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `formula`   | Compute or replace a field using the existing expression language.                                                      |
| `filter`    | Filter with an `expr` expression.                                                                                       |
| `sample`    | Existing reservoir sampling; an explicitly supplied size must be a positive safe integer.                               |
| `aggregate` | Existing grouped or whole-table aggregations. This is the operation called “summarize” in the discussion; add no alias. |
| `window`    | Existing partitioning, sorting, frames, ranks, and window operations.                                                   |

Exclude reactive `debounce` settings from the formula/filter request types and
reject them at the API boundary. Expressions can use `datum`, literals, and the
existing built-in functions. The analysis runtime has no parent and does not
inherit live view parameters, selections, scales, or expression bindings.
Unknown variables fail normally. Region membership is supplied through `scope`;
selection-parameter filters inside the pipeline are outside this first version.
Callers can include a numeric threshold directly in an expression.

Reject other transform types explicitly, including source-loading joins,
view-dependent layout/text operations, and expansion transforms. Do not accept
the entire transform factory and discover unsupported view dependencies midway
through evaluation. The five supported operations do not increase row count,
which keeps intermediate row counts bounded by the input size.

Sampling retains its current nondeterminism; this change adds no random seed.
Input order is the collector's current order. A window's explicit `sort` governs
its calculation, while its output preserves existing window-transform ordering
semantics. No implicit sort, grouping, or analytic decision is added by the API.

## Input, limits, and result contract

1. Reuse #576's `readData({scope, limit: inputLimit})` internally. It supplies
   cloned rows, current readiness/lifecycle validation, viewport or interval
   membership, and omission of internal picking identifiers. Do not duplicate
   the spatial predicates or change `readData`.
2. If that read is truncated, fail before starting the pipeline. Never return an
   apparently valid count, mean, sample, or window computed from a silently
   truncated prefix. The caller can narrow its scope or deliberately raise its
   input budget.
3. Run the full requested pipeline over the complete captured input. Only then
   apply `limit` to returned rows. `truncated` means more output records exist;
   it never means the analysis consumed incomplete input.
4. Both limits are required nonnegative safe integers. A zero input limit accepts
   an empty scope and rejects a nonempty one. A zero output limit still performs
   the analysis and reports whether output records exist.
5. Results use the same object-value and `structuredClone` semantics as readback.
   Input clones are owned by the analysis, and ordinary output rows are detached
   from live data. No second clone is needed merely to transfer those owned rows
   to the caller. Preserve the existing shared-memory caveat; this is not a new
   isolation guarantee for `SharedArrayBuffer` data.
6. Input means records in the selected unit's terminal collector, after its
   authored transformations. This API does not recover records already removed
   or aggregated away. An app that needs per-base analysis must target a unit
   whose collector retains per-base records.
7. The captured rows form one flat analysis table. Live file/facet boundaries are
   not implicit analysis partitions; use `groupby` explicitly when needed.
8. A cleared interval brush supplies empty input. Each transform retains its
   existing empty-input behavior: the existing aggregate
   transform emits no rows for empty input, with or without grouping.
9. No fetch, lazy-coverage promise, pixel-visibility guarantee, or source-retention
   mechanism is added. Apps can use the existing loading/wait APIs before a call
   and must establish appropriate source coverage for their analysis.

The two limits have distinct purposes. `inputLimit` rejects an oversized analysis
input; `limit` bounds the result returned to the app. The latter cannot safely
stop a mean, rank, or sample halfway through its input.

## Detached execution architecture

```text
Live terminal collector
    │ scoped read + owned copies
    ▼
Private FlowNode input → existing transforms → private Collector
    │
    ▼
Bounded result returned to the application
```

Create a fresh root `FlowNode`, a fresh parentless `ViewParamRuntime`, the requested
transform instances, and a terminal `Collector` for each call. A shared minimal
`{paramRuntime}` provider is sufficient for expression compilation. Instantiate
the five existing transform classes through a small explicit constructor map;
no fake `View` or renderer context is needed.

Attach nodes in a simple linear chain, call `initializeOnce()` after construction,
then `reset()`, `beginBatch({type: "file"})`, feed the owned input through the root's
public `handle()`, and call `complete()`. Completion is essential for buffered
aggregate, sample, and window output. Read the private collector and apply the
output limit. Dispose the chain in post-order and dispose its runtime in `finally`,
including initialization, expression, and completion failures. Preserve useful
transform-index context when reporting errors; do not hide the original cause.

Do not register this graph in the live `DataFlow`, attach it as a child of a live
collector, invoke a live source's `repropagate()`, create a view, or subscribe a
mark to its output. No live collector completion, parameter writes, scale-domain
invalidation, render request, GPU buffer upload, or selection change is needed.
The owned input already supplies the mutation boundary, so a clone-insertion or
whole-visualization optimization pass is unnecessary.

The colleague's `InlineSource.updateDynamicData(data)` suggestion captures the
right isolation model. However, the current `InlineSource` extends a `DataSource`
that owns a `View` and wraps completion in that view's runtime transaction. A
plain root `FlowNode` can already stream a supplied snapshot with the same batch
protocol. Reusing that smaller primitive avoids constructing a fake view or
expanding the source interfaces solely for this feature.

### Feasibility evidence

A temporary Node experiment against revision `852d597a` successfully ran a
parentless runtime and detached `FlowNode → filter → formula → window → aggregate
→ Collector` chain. It produced the expected mean-square summaries and preserved
the original input objects. No view, renderer, DOM, source registration, or new
production code was required. Permanent API and lifecycle coverage is part of
implementation rather than copying this experiment into the test suite verbatim.

## Schema and agent integration

Generate a JSON Schema for the request from its public TypeScript type, reusing
existing transform parameter types. Avoid a hand-maintained duplicate of aggregate
or window operation lists. Exclude unsupported variants/options from the generated
schema. Keep the returned values as JavaScript records; schema publication does
not introduce JSON transport, Arrow output, or a new serialization layer.

Validate scope, limits, the pipeline shape, allowed types, and explicitly excluded
options at the public boundary. Reuse existing transform constructors and expression
compilation for their semantic checks. Publish two or three small schema-valid
examples: grouped summaries, a computed score followed by filtering, and window
ranking followed by a top-rank filter. These can live in API documentation rather
than becoming three separate example apps.

Apps expose this one primitive in their agent tools and retain any broader workflow
logic themselves. Agent tool responses can summarize or refer to the resulting table
without inserting every returned record into model context. This PR adds no agent
plugin, Python relay, result registry, or model-specific tool framework.

## Alternatives and related work

- [Issue #461](https://github.com/genome-spy/genome-spy/issues/461) concerns gating
  initialized branches, upstream replay, and GPU work. This feature avoids those
  problems by keeping its graph detached; implementing gating is not a prerequisite
  and the issue remains open.
- A hidden temporary view would reuse the visualization builder but also involve
  view initialization, visibility, resolution binding, and collector observers.
  It is unnecessary for a table calculation and complicates the no-render contract.
- A live collector child could share input without copying, but in-place transforms
  could modify displayed rows, and reactive replay/cleanup would enter the live graph.
  Copying at the readback boundary gives a simpler ownership contract.
- A standalone public `runTransforms(rows, transform)` utility would work for app-owned
  arrays, but would expose another entry point without connecting the source to a
  view. Keep its runner internal for now; the public operation targets the existing
  scoped readback use case.
- [Vega's View API](https://vega.github.io/vega/docs/api/view/) demonstrates reuse of
  declarative dataflows and data inspection, but its view runtime also coordinates
  rendering. Borrow the declarative contract, without creating another view here.
- [Arquero's table verbs](https://idl.uw.edu/arquero/api/verbs.html) demonstrate useful
  filter, derive, grouping, reduction, and window operations. GenomeSpy already
  implements the required subset; adding another engine would duplicate semantics
  and dependencies. These projects are design references; no external code is copied.

## Risks and explicit non-goals

Execution is synchronous on the browser thread. Input limits bound row count, not
elapsed time, expression complexity, object width, or all memory usage. In particular,
window calculations and large group counts can be expensive. No worker, cancellation,
streaming-result protocol, hard execution quota, or 10-million-row performance claim
is included. Do not return a Promise merely to imply nonblocking execution.

JSON plus GenomeSpy's restricted expression language is easier for agents to generate
and constrain than arbitrary JavaScript. It is not a general security sandbox or a
CPU/memory isolation boundary. Reuse the current expression compiler and its supported
functions rather than adding callbacks or an unrestricted evaluation escape hatch.
See the [Vega expression grammar](https://vega.github.io/vega/docs/expressions/) for the
restricted-language pattern; GenomeSpy's own registered functions remain authoritative.

Other non-goals: KDBush/spatial indexing, serialization/Flechette changes, existing
point-selection read changes, new selection kinds, raw-source retention, auxiliary
joins/network sources, implicit live-parameter capture, reactive retained pipelines,
new transform algorithms, and automatic selection or dataset updates.

No unresolved product decision is required for this first version. Workers, broader
transform support, and explicit analysis parameter bindings remain future scope.

## Implementation milestones

### 1. Reusable detached runner and request contract

- [x] Implement an internal runner using the existing transform classes and private
      flow/runtime ownership described above. Add narrow request/transform types and
      generate the request schema from them.
- [x] Verify a representative filter → formula → aggregate pipeline and a window →
      filter pipeline, plus sampling membership/size without asserting random choices.
      Cover completion of buffered nodes, empty input, invalid expressions/options,
      and disposal after success and failure. Document that this internal runner
      consumes owned copies and may modify them; the public API protects live rows
      by capturing them through readback first.
- Affected areas: new `packages/core/src/data/runDataTransforms.js` and adjacent tests,
  existing transform type imports, API types, and schema-generation tooling. Keep the
  existing transform implementations and visualization builder unchanged.
- Document the internal ownership contract in JSDoc. Tentative commit:
  `feat(core): add isolated execution of declarative data transforms`.

### 2. View API, one small example, and integration

- [x] Add `ViewHandle.transformData` by reusing `readData` for capture and calling the
      runner only after complete-input validation. Add generated API documentation,
      request-schema documentation, and a minor Core changeset.
- [x] Verify brush and viewport membership is applied before the pipeline, input
      overflow rejects without running analysis, and output limits follow complete
      aggregation/window evaluation. Cover stale/unready handles, existing empty-input
      aggregation semantics, and input already transformed by a view.
- [x] Assert live data objects and collector `dataRevision` are unchanged; collector
      observers, mark revisions, render scheduling, and parameter subscriptions receive
      no analysis-driven updates. Repeated calls and failures must not accumulate
      listeners. Existing point-selection getters/setters retain their contracts.
- [x] Add one `transformAnalysis` embed example using generic measurements. Show raw
      points, let users brush their input region, and run count/mean aggregation only
      when requested. Display returned summaries in app UI. Explain that this pipeline
      runs after region capture, unlike #576's pre-aggregated readback example.
- Affected areas: `packages/core/src/view/viewMutationApi.js`, embed API types and tests,
  `docs/api/views.md` and generated reference, schema output, and the embed examples
  package. Reuse the generic fixture where practical. No migration is required.
- Final verification: focused headless API/isolation tests, relevant existing transform
  and readback suites, workspace type checks, lint, schema/API-doc generation, the
  embed example build, and release checks. In a browser, brush the raw measurements,
  compare exact group summaries, rerun after navigation, and exercise empty/error
  cases. Confirm no analysis-triggered WebGL uploads; confirm Canvas2D/SVG/optional
  WebGPU consumers remain unaffected through unchanged source/mark revisions. This
  API must also work headlessly without importing a renderer.
- Review the public contract, ownership boundary, limit semantics, and final renderer
  isolation evidence together. Do not add separate review gates for wording or small
  follow-up fixes. Tentative commit:
  `feat(core): expose scoped transform execution through the embed API`.

Before creating the follow-up PR, reconcile these tasks, commit that record, and
remove this temporary plan in a later commit according to repository policy.

## Completion record

- Implemented the isolated runner, view API, generated request schema/export,
  public API documentation and reference, minor changeset, and one generic
  `transformAnalysis` example. Existing #576 APIs are unchanged.
- Kept request types in `types/transformData.d.ts` and re-exported them through
  `embedApi.d.ts`; schema generation can read the isolated request declaration.
- Corrected the proposed empty whole-table count assumption after checking the
  existing aggregate: empty input emits no records. No transform semantics changed.
- Three independent Sol reviews covered the runner, API/schema contract, and
  example/documentation. No actionable findings were reported. Some reviewer
  commands were restricted by their sandbox; root verification covered them.
- Verification passed: 47 focused tests (2 existing todos), workspace type checks,
  lint, API generation, Core build including schemas/declarations, example build,
  formatting, and release checks. The packed Core package contains the schema,
  runner, and declarations. The additive API uses a minor release (1.2.0 under
  the current fixed release group).
- Browser verification passed exact initial/rebrushed summaries, button-driven
  calculation, clearing, input overflow, unchanged source records, narrow layout,
  disposal, and no console errors. Instrumented WebGL buffer/texture upload methods
  recorded zero calls caused by analysis. Renderer-free Node execution also passed.
- Indexing, serialization, worker execution, extra transform types, and live
  parameter bindings remain deliberately outside this change.
- All implementation tasks above are complete. This plan can now be removed in
  a later commit before the stacked PR is created.

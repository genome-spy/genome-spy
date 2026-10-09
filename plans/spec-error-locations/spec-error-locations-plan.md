# Specification error locations

## Goal and scope

Make specification experiments easier in Playground by underlining the declaration
responsible for missing encoding fields, invalid expressions, duplicate parameter
names, and transform construction failures. Expression errors include parsing,
compilation, and unknown parameter names. Preserve the existing
error messages, failure behavior, and available-field hints. Embedders should receive the same location
information without inspecting the visualization.

This builds on the data-loading reporting API merged in #557. JSON Schema remains
responsible for structural validation. This change adds context to errors raised
by existing runtime validation; it does not introduce new validation rules.

Non-goals:

- Checking `datum` field references in expressions, including nested references.
- Changing field-access semantics, sparse-data handling, or nested-field checks.
- Reporting every transform field, generated locus field, or arbitrary runtime
  exception. These can use the same mechanism in later work.
- Recovery, retries, error history, a general diagnostics registry, or tracking
  arbitrary dynamic changes to the view hierarchy.
- Highlighting individual expression tokens. Highlight the expression string.

## Current paths and constraints

- `utils/field.js` validates simple field names when an accessor first receives
  data. `encoder/accessor.js` knows the channel definition when creating that
  accessor. Location capture belongs here, outside the per-datum hot path.
- `paramRuntime/expressionRef.js` compiles expressions and rejects unresolved
  globals during binding. Named params also parse during dependency analysis
  before registration; parsing failures there need the same declaration context.
  `ViewParamRuntime` owns declaration scope, including named parameters whose
  registration may be deferred until scales exist. Direct expression binding,
  named/deferred parameters, and their transition/debounce paths must agree.
- `View.getEncoding()` preserves inherited declaration identity, but mark
  normalization clones and moves channel definitions. Origins must survive those
  explicit transformations; searching for matching expression text is ambiguous.
- Fatal setup/runtime failures already reach `onError`. Downstream errors caught
  during eager or lazy data processing reach `dataLoading` instead. Source catches
  currently retain messages and phases, so location metadata needs to survive
  both routes and wrapping via `Error.cause`.
- Playground indexes all authored JSON objects before normalization. Its existing
  loading diagnostics resolve origins against the JSON AST and reject obsolete
  documents, embeds, and asynchronous lint results. Reuse these guards.

Relevant architecture: `ARCHITECTURE.md`, `packages/core/ARCHITECTURE.md`,
`packages/core/docs/architecture/views-and-dataflow.md`, and
`packages/core/docs/architecture/reactivity.md`.

## Decisions

1. Add a small public `SpecLocation` descriptor: an opaque `origin` returned by
   `getSpecOrigin` and an optional relative property `path` (string/number
   segments). For example, an encoding definition's origin plus `["field"]`, or
   an expression declaration's origin plus `["expr"]`. Core does not interpret
   JSON Pointers or editor offsets.
2. Attach an optional `specLocation` to existing errors. Preserve error identity,
   message, and cause; retain a more specific location already present. Provide
   one small helper for finding a location through a cause chain, also usable by
   embedders. The nearest existing location wins; annotation leaves an existing
   location anywhere in the cause chain intact. Handle cyclic/non-Error causes.
   Expose readonly descriptors; copy descriptor/path in source snapshots/events.
   Avoid an error-class hierarchy.
3. Add optional `DataLoadingEntry.errorLocation`, distinct from the source's
   existing `origin`. A processing error may belong to an encoding, not the URL.
   Copy the descriptor and its path in snapshots/events; clear it when the error
   clears. Do not change source identity, status, events, or fatality.
4. Broaden the documented `getSpecOrigin` callback use to supported encoding and
   expression declaration objects. Keep it optional. Preserve original origins
   with a module-local weak map of clone-to-authored-object aliases. Flatten
   aliases at installation; store object identity, never an embed's resolved
   string. Explicit sites cover positional coverage/text clones, color/opacity
   normalization, offset scale-property clones, named-condition expansion, and
   expression properties copied by guide merging, templates, and annotations.
   Configuration expression references are atomic values and retain their
   authored identity when scopes merge.
   Alias copied condition/ExprRef/scale declaration nodes only where their source
   mapping is known. Exact `structuredClone` subtrees are linked before any
   normalization changes; never infer provenance by matching generated objects.
   Do not introduce a general provenance graph or infer origins from runtime
   hierarchy positions. Generated declarations without a clear authored target
   may have no location. Imported specs outside the editor's indexed object graph
   likewise have no editor location.
5. Capture expression origins where the declaration object is available. Cover
   encoding expressions, named parameter expressions (including deferred ones),
   formula/filter transforms, expression-reference properties, and scale
   domain/range expressions. View expression methods accept the authored ExprRef
   itself or generated expression text, eliminating parallel text/source arguments.
   Resolve an optional location in binding options, including `registerDerived`.
   Annotate compiler failures in the compiler's existing catch and binding
   failures around global resolution; named-parameter analysis uses the same
   compiler boundary. Interaction event filters pass a location from their
   authored configuration to their existing parser catch. Object-form filters
   use `[key, "filter"]`; shorthand strings use `[key]`. The hook receives the
   exact encoding branch, parameter, transform, ExprRef, or interaction config.
   Paths are relative to that object. Do not add per-row evaluation wrappers or
   inspect `datum` fields.
6. Playground prefers a precise `errorLocation` over the existing URL/data
   fallback. Fatal errors use the same location resolver and lint revision
   machinery. Capture the document/attempt identity before `embed()` starts:
   failures before `EmbedResult` exists must still underline the editor, and old
   callbacks must never annotate a newer specification. Keep the existing visual
   error display and nonfatal track-local loading behavior. Wire `onError`, and
   handle embed's callback plus rejection without duplicate diagnostics. Use an
   attempt token even when the JSON text is identical (e.g. renderer switches).
7. Annotate transform constructor failures at the shared factory, identifying the
   whole declaration (`path: []`). This covers primary and side-input pipelines
   without per-transform wrappers and preserves any more specific inner location.
   Duplicate parameter names identify the second declaration's `name` property
   at the existing registration check. No new validation rules are added.

`UrlSource.load` and `IntervalUrlSource.requestInterval` catch downstream
processing errors, including accessor validation, and convert them to error
statuses. Extract a location from the caught error/cause there. Errors outside
those boundaries continue through `onError`; do not force them into source state.

### Established precedents and alternatives

[Ajv error objects](https://ajv.js.org/api.html#error-objects) separate instance
paths from messages. [VS Code JSON language service validation](https://github.com/microsoft/vscode-json-languageservice/blob/main/src/services/jsonValidation.ts)
maps JSON AST nodes to diagnostic ranges. Both fit the existing Playground
pipeline. [Vega's view logger](https://vega.github.io/vega/docs/api/view/#view_logger)
illustrates using an existing error-reporting boundary rather than adding a second
runtime bus. These are design references; no implementation code is copied.

Alternatives rejected: appending JSON Pointer segments inside Core would make
opaque embedder origins format-dependent; searching normalized specs by value
would misidentify duplicate or inherited declarations; recording every runtime
event would add state unrelated to the two requested checks.

## Milestones

### 1. Located Core errors

- [x] Add the descriptor, error helper, and source error-location transport.
- [x] Preserve origins across the normalization needed by authored encoding
      fields and expressions, including inherited/conditional definitions.
- [x] Annotate existing missing encoding-field and expression parsing/binding
      failures at their declaration boundaries, including named-param pre-analysis
      and deferred parameter setup.
- [x] Verify behavior through real spec-to-data/accessor and parameter paths:
      inherited/conditional encodings and x2/offset clones, named/deferred parameters,
      representative formula/filter, scale, view/mark property, and guide expressions,
      both syntax failures and unknown params, wrapped source
      failures, and absent origin hooks. Verify lexical scope remains unchanged
      and `datum.missing` is not newly rejected.
- [x] Review related tests and remove overlapping implementation-detail checks.
- [x] Document the public descriptor/helper and expanded `getSpecOrigin` contract
      in the embedding API docs; add one Core minor changeset for this feature.
- [x] Run focused tests, Core TypeScript, and relevant lint; update this record
      and commit `feat(core): attach specification locations to field and expression errors`.

Outcome: embedders can locate these existing errors through `onError` or
`dataLoading`, with unchanged Canvas/WebGL/WebGPU dataflow and binding semantics.
Shared location objects must not allow listeners to mutate retained state.

### 2. Playground diagnostics and integration

- [x] Resolve exact field/expression values through the existing JSON AST.
- [x] Connect fatal errors reported before embed completion and nonfatal source
      errors to the editor's diagnostics. Reuse correction, formatting, and stale
      callback/lint guards without creating a separate validation pipeline.
- [x] Add representative resolver/editor lifecycle tests. Keep URL/data fallback
      coverage and verify correcting a declaration removes its diagnostic.
- [x] Smoke-test in a browser: a simple point plot with a misspelled encoding
      field; `params: [{name: "a", expr: "missing + 1"}]`; an encoding expression
      using an unknown parameter; malformed named/encoding expressions; the
      vertical-concat documentation example with a failed URL; and the sashimi example's scale expression. Switch renderers
      for a representative spec and correct errors while an old attempt finishes.
      Verify same-text renderer switches and callbacks during teardown, and that
      binding a successful result does not clear errors from the same attempt.
- [x] Verify Core and App embedding with Canvas/WebGL, plus WebGPU where the
      local environment supports it. Run workspace TypeScript and appropriate
      integration tests/builds; broaden testing only when failures warrant it.
- [x] Update user-facing docs in the relevant error/API section (not Getting
      Started), revise the same changeset, update this record, and commit
      `feat(playground): highlight invalid fields and expressions`.

Outcome: the same actionable underlines work for fatal and track-local errors,
without changing their existing visual presentation.

## Review gates, risks, and acceptance

- [x] Luna reviews this plan before implementation; address findings and record
      decisions below before committing the plan.
- [x] Inspect the shared API, normalization aliases, downstream callers, and hot
      paths before the Core milestone commit. An optional hook must not impose
      allocations/lookups on every datum or require changes in custom contexts.
- [x] Inspect final integration for errors before embed resolution, competing
      source/fatal routes, document formatting, and stale callbacks before the
      Playground milestone commit.

There are no intended unresolved product questions. The implementation should
choose the smallest alias mechanism that handles actual normalization sites. If
that requires broad provenance machinery, narrow supported sites explicitly and
record the tradeoff rather than adding speculative infrastructure.

Acceptance: existing missing-field and expression parsing/binding errors gain the
correct authored field/expression location; both reporting routes retain it;
Playground underlines that value and clears obsolete diagnostics; valid lexical
references and unchecked `datum` references retain their behavior; no hook means
ordinary errors still work. Later runtime transform-field diagnostics can reuse
the descriptor, but are deferred.

Before a future PR, reconcile every remaining task, commit the final plan record,
then remove this temporary plan in a later commit.

## Review record

Luna reviewed the plan and relevant implementation on 2026-10-09. Addressed the
findings by specifying pre-embed `onError` wiring and attempt tokens; exact
declaration/path semantics and binding options; the eager/lazy processing catch
boundaries; explicit normalization alias sites; readonly/copy behavior and
cause-chain precedence; and stale/failed-embed acceptance cases. Kept the named
expression-bearing forms in scope because each uses existing binding paths;
arbitrary runtime errors and transform fields remain deferred. The reviewer
endorsed module-local weak aliases over per-context state, with object identities
flattened at explicit identity-preserving clone sites and no global origin strings.

### Core milestone record

Implemented optional `SpecLocation`, the exported `getSpecErrorLocation` helper,
explicit clone aliases, encoding accessor metadata, and declaration-aware
expression binding. Named/deferred/transitioned/debounced params, formula/filter,
scale domain/range, ExprRef properties (including URL descriptors), and view size,
opacity, and cursor bindings pass available declarations. Eager/lazy source catch
boundaries preserve the location separately from source origin. Snapshot/event
locations are detached; new statuses clear obsolete error metadata.

Verification: 536 related tests passed across parameter, encoder, scale, eager
source, and lazy source suites, then 25 focused tests passed including new
normalization and lazy-failure checks. Core TypeScript and repository lint pass.
API docs and a Core minor changeset describe the new optional contract. No schema
or field-validation semantics changed. The helper for exact deep clones aliases
only the copied subtree before modifications; it does not infer generated origins.

Full-suite integration found smaller tooltip runtime facades without a location
lookup method. Kept accessor location lookup optional, preserving that existing
structural contract and the ordinary no-origin behavior. Focused tooltip and
location regression suites verify the correction.

The scope includes all expression parsing/compilation errors, as requested on
2026-10-09. Named-param dependency analysis is annotated before binding; remaining
authored ExprRef entry points pass their declarations. Guide/config merging links
the object whose `expr` property is copied, without matching expression text.
There are no new validation rules or evaluation wrappers.

Additional Core verification: 42 location tests cover syntax and binding failures
through named params, encoding, transforms, scales, URLs, view/mark properties,
and merged guide expressions. Another 146 related tests passed. All workspace
TypeScript checks and repository lint passed. Browser checks confirm malformed
named, encoding, mark, and axis expressions underline their declarations and
preserve the default error box; correction clears both.

### Playground milestone record

Implemented exact field/expression ranges using the existing JSON AST and lint
pipeline. Fatal errors are captured before embed resolves, with semantic document
identity, per-attempt tokens, and lint revisions preventing obsolete callbacks
and worker results. Attaching a successful result retains errors from that attempt.
Source and fatal reports for the same declaration share one underline. Existing
URL/configuration fallbacks and the default error box remain intact.

Verification: the full repository suite passed (506 files, 4,590 passed, one
skipped, two todo), as did all 29 Playground tests in its Vite configuration.
Workspace TypeScript, lint, Playground production build, release checks, and
changeset status passed. The fixed release group receives a minor bump to 1.2.0
for the optional location API and Playground feature.

Browser verification covered missing inline/eager fields, unknown params, syntax
and unknown-function errors, formatting, correction, same-text renderer changes,
and correction while a previous load finished. Vertical concat retains a local
404 loading error with a URL underline and no fatal popup. Sashimi loads remote
eager/lazy sources, switches WebGPU/WebGL, and locates its scale expression error.
Core/App embedding checks passed across Canvas, WebGL, and WebGPU (18 cases).
All planned work is complete; retain this record until the future PR workflow
commits its removal.

### Simplification and review record

A subagent reviewed the implementation and the simplification on 2026-10-09.
Expression declarations now carry their own text and identity through existing
binding APIs. Removed separate source arguments/options and redundant error
wrappers. Compiler catches and the globals-binding loop annotate errors where
they arise, including dependency cycles from deferred parameter resolution.
Plain loading-report descriptors use `structuredClone` instead of a custom copier.

The review also found missing origins after configuration merging, template and
annotation cloning, and interaction-filter parsing. Atomic ExprRefs and the
existing clone alias helper cover those paths; source reports resolve clone
aliases too. The alias map also prevents repeated traversal of cyclic/shared
clones. A regression verifies that a legal style named `expr` still merges as a
style, rather than being mistaken for an ExprRef.

Kept the small normalization alias map and Playground's document/attempt/lint
guards: they address distinct identity and stale-result requirements. There is
no new diagnostics registry, recovery machinery, or per-datum bookkeeping.

Verification: the full suite passed with 4,610 tests across 506 files before the
final review corrections; all 66 focused review regressions passed afterwards.
Browser checks cover parameter syntax, object/shorthand interaction filters,
config expressions, correction, and valid expressions across WebGPU, Canvas,
and WebGL. Workspace TypeScript, lint, Playground build, and release checks pass.
Production JavaScript relative to the pre-review commit `dc1c94ca2`: 198 added,
227 deleted, net -29. The full branch relative to master `5f6467aae`: 412 added,
190 deleted, net +222, down from +251. Counts cover `packages/` and exclude
tests, comments, blank lines, and declaration files.

Separate browser observation, outside this location feature: rapidly replacing
invalid specs can produce an unhandled font-loading rejection after renderer
disposal (`rendering/webgl/rendererResources.js`). The editor still clears and
renders corrected specs. Renderer/font cancellation handling is deferred.

### Additional runtime-check locations

- [x] Annotate transform construction failures at the shared factory, including
      invalid regular expressions and unequal configuration array lengths.
- [x] Locate duplicate parameter names in ordinary and deferred registration.
- [x] Verify nested side-input errors identify the failing inner declaration;
      standalone construction without a view preserves its native error.
- [x] Update embedding/Playground documentation and the existing changeset.

Verification: 430 tests passed across 42 parameter, transform, and dataflow suites
(two todo), including nine new location cases. Core TypeScript, lint, generated
API documentation, and release checks pass. Browser checks confirm whole-transform
highlights (including nested side inputs), the duplicate name highlight, the
existing error box, and clearing after correction. This addition does not cover transform
row-processing failures or missing selection references outside expressions;
those remain deferred.

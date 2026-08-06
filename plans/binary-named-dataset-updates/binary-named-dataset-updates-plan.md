# Binary Named-Dataset Updates Plan

Issue: [genome-spy/genome-spy#455](https://github.com/genome-spy/genome-spy/issues/455)

## Summary

Add an asynchronous `DatasetApi.load()` method that decodes an in-memory
Arrow IPC or Parquet payload and replaces an explicitly declared named dataset
without reconstructing the embedded GenomeSpy instance.

The existing exact-owner dataset model remains intact:

```js
api.datasets.set("table", rows);
await api.datasets.load("table", arrowDataView, { type: "arrow" });

const owner = api.views.get({ scope: ["panel"], view: "panel" });
await owner.datasets.load("table", parquetDataView, { type: "parquet" });
```

`load()` resolves after decoding and synchronous dataflow propagation have
completed and a render has been requested. It does not wait for the next
animation frame to be painted.

## Motivation

GenomeSpy already supports Arrow IPC and Parquet through URL data sources, but
the runtime dataset API accepts only materialized JavaScript row arrays.
Notebook integrations therefore have to choose between decoding outside Core
or rebuilding the visualization around a Blob URL. Rebuilding loses the live
view instance and produces unnecessary canvas, WebGL, layout, and interaction
work.

The immediate consumer is the AnyWidget integration tracked in
[genome-spy-python#2](https://github.com/genome-spy/genome-spy-python/issues/2),
which receives Python `bytes` as JavaScript `DataView` values. The API is
general-purpose and should also support other hosts that already have encoded
tabular data in memory.

## Goals

- Decode Arrow IPC and Parquet directly from `ArrayBuffer` and
  `ArrayBufferView` inputs, including offset `DataView` instances.
- Update a top-level or nested declared dataset through its existing
  exact-owner capability.
- Reuse the same format readers and row semantics as eager URL loading.
- Preserve the current view hierarchy and update only consumers of the named
  binding.
- Define deterministic behavior for overlapping asynchronous loads.
- Leave the previous dataset unchanged when decoding fails.
- Prevent an asynchronous completion from mutating a removed view or finalized
  embed.
- Preserve the lean `@genome-spy/core/minimal` dependency boundary.

## Non-goals

- Implement the Python or AnyWidget transport.
- Add Blob URL handling, fetching, or URL inference to the runtime API.
- Change the JSON specification or allow binary values in `datasets`.
- Add incremental Arrow record-batch ingestion or row-level changesets.
- Keep Flechette proxy rows or another columnar representation in the
  dataflow. Both readers continue producing ordinary mutable row objects.
- Add atomic multi-dataset loading in the first implementation. The API should
  leave room for a later `loadAll()` operation.
- Guarantee preservation of state derived from the old row identities.
  Parameters and the view instance remain live, but scale domains, selections,
  and other data-derived state may legitimately react to replacement data.
- Make the returned promise wait for browser painting.

## Current implementation

The public surface is defined by `DatasetApi` in
`packages/core/src/types/embedApi.d.ts`. `createViewDatasetApi()` in
`packages/core/src/view/viewMutationApi.js` validates exact ownership and routes
`set()` and `reset()` to `DataFlow.updateNamedDataBinding()`.

`DataFlow.updateNamedDataBinding()` updates a `NamedDataBinding` and
synchronously reloads every active `NamedSource` that shares it. Hidden or not
yet initialized consumers read the binding's latest override when they are
later initialized. The mutation API then calls `animator.requestRender()`,
which already coalesces redundant requests into one animation frame.

The full runtime registers `packages/core/src/data/formats/arrow.js` and
`packages/core/src/data/formats/parquet.js` with `vega-loader`. The minimal
runtime intentionally omits those registrations and verifies this boundary in
`packages/core/scripts/verifyMinimalBundle.mjs`.

The Arrow reader accepts an `ArrayBuffer` or `Uint8Array`. The Parquet reader
currently converts every `Uint8Array` to its complete backing `.buffer`; this
is incorrect for a view whose `byteOffset` or `byteLength` does not cover the
whole buffer.

## Comparable designs and provenance

- The [Vega View API](https://vega.github.io/vega/docs/api/view/) updates named
  data in an instantiated dataflow and asks callers to sequence asynchronous
  runs. GenomeSpy follows the same high-level pattern of preserving the live
  visualization, while adding binary parsing because Vega requires API-added
  tuples to be parsed beforehand.
- Reader lookup follows the registry design in
  [`vega-loader`](https://github.com/vega/vega-loader/blob/main/src/formats/index.js).
  This allows the same API implementation to work in both full and minimal
  runtimes without importing optional readers into the minimal entry point.
- Arrow input normalization follows Flechette's documented
  [`tableFromIPC`](https://github.com/uwdata/flechette/blob/main/docs/api/index.md#tablefromipc)
  contract, which accepts `ArrayBuffer` and `Uint8Array` inputs.
- Parquet handling follows hyparquet's structural
  [`AsyncBuffer`](https://github.com/hyparam/hyparquet#asyncbuffer) contract.
  An in-memory `ArrayBuffer` is valid input, but an offset view must be bounded
  before it is passed to the reader.

These are API and lifecycle patterns rather than copied source blocks. No new
third-party code or license notice is expected.

## Proposed public API

Add a runtime-only format type and method in
`packages/core/src/types/embedApi.d.ts`:

```ts
export interface BinaryDatasetFormat {
  type: "arrow" | "parquet";
}

export interface DatasetApi {
  set: <T = unknown>(name: string, data: T[]) => void;
  load: (
    name: string,
    data: ArrayBuffer | ArrayBufferView,
    format: BinaryDatasetFormat
  ) => Promise<void>;
  reset: (name: string) => void;
}
```

A separate method keeps the existing synchronous `set()` contract simple and
makes expensive decoding explicit at call sites. A format object matches data
source conventions and leaves room for format-specific runtime options without
adding positional arguments.

The initial type deliberately accepts only `arrow` and `parquet`. Text formats
already have efficient direct JavaScript representations, and widening the API
to every registered loader would introduce string encodings, parse directives,
and response-type ambiguity unrelated to issue #455.

### Minimal runtime behavior

`DatasetApi.load()` looks up the requested reader from `vega-loader` at call
time. The full and browser bundles have both readers registered. A minimal
runtime user must explicitly register the desired reader, for example by
importing `@genome-spy/core/data/formats/arrow.js`. If it is absent, `load()`
rejects with a clear error naming the unregistered format.

This avoids direct imports from `viewMutationApi.js` to either optional reader
and keeps the minimal bundle verification meaningful.

## Binary normalization and parsing

Add a focused helper under `packages/core/src/data/formats/` that:

1. Validates `format.type` as `arrow` or `parquet`.
2. Looks up the registered reader and fails fast if unavailable.
3. Converts an `ArrayBufferView` to
   `new Uint8Array(data.buffer, data.byteOffset, data.byteLength)`. This creates
   a correctly bounded view without copying.
4. Calls and awaits the registered reader.
5. Requires the decoded result to be an array before it reaches the binding.

The helper should call the registered reader directly instead of duplicating
Arrow or Parquet decoding. The binary formats do not need Vega's text parsing
directives.

Update `packages/core/src/data/formats/parquet.js` so a bounded `Uint8Array`
does not silently expand to its entire backing buffer. If the view spans the
whole `ArrayBuffer`, reuse it. Otherwise, pass an offset-aware `AsyncBuffer`
adapter or copy only the addressed range. Prefer the adapter if it remains
simple and works with GenomeSpy's existing `parquetReadObjects()` path; a
single bounded copy is acceptable if that path is clearer and more reliable.

Arrow retains the bounded `Uint8Array` view when it is 8-byte aligned. An
arbitrarily offset view requires one bounded copy because Flechette creates
aligned typed-array views over its input. Row materialization remains an
intentional downstream allocation.

## Update ordering

Each `NamedDataBinding` maintains a monotonically increasing generation. The
generation belongs to the binding rather than one `DatasetApi` object because
the same declaration can be reached through capability aliases and deprecated
update paths.

- `set()`, `reset()`, and `load()` all claim a new generation.
- `load()` validates the owner and declaration before claiming its generation
  and starting decoding.
- After decoding, it commits only if its generation is still current.
- A superseded load, including a superseded decode failure, settles without
  changing data. The latest operation owns the observable outcome.
- A current decode failure rejects and leaves the prior binding untouched.
- A synchronous `set()` or `reset()` invalidates an earlier pending `load()`.

Keeping the generation on the binding gives every update route one ordering
sequence while keeping it independent of readers and data sources.

Before committing, `load()` revalidates that the owner is live and still owns
the same binding. Removing a nested owner therefore prevents a late commit and
produces the existing stable `ViewMutationError` contract for stale handles.

## Embed finalization

View removal disposes its `NamedDataBinding`, but `EmbedResult.finalize()` does
not currently expose a lifecycle guard to asynchronous dataset operations.
Introduce an embed-lifetime signal or equivalent private active-state check and
pass it to both the top-level dataset API and view-handle dataset APIs.

Finalization must invalidate pending generations before destroying rendering
resources. A current `load()` interrupted by finalization should reject with an
abort/stale-lifecycle error and must not propagate rows or request rendering.
The lifecycle mechanism stays internal; a public `AbortSignal` parameter is
not needed for the first API.

## Dataflow and rendering behavior

Successful decoding uses the existing
`DataFlow.updateNamedDataBinding(binding, rows)` path. This retains current
semantics for:

- shared consumers of one lexical binding;
- shadowed or repeated-import declarations;
- collector and transform recomputation;
- scale-domain and step-layout invalidation; and
- coalesced rendering through `Animator.requestRender()`.

No view, mark, canvas, WebGL context, parameter runtime, or event listener is
recreated. The promise resolves once this synchronous propagation is complete
and rendering is scheduled.

## Error behavior

Use `ViewMutationError` for ownership and lifecycle failures, with stable codes
where callers can reasonably recover. Reader and malformed-payload errors retain
their original cause and include the dataset name and format in the public
message.

Errors are boundary validation, not fallbacks:

- unknown or undeclared dataset: reject before decoding;
- owner mismatch: reject before decoding;
- unregistered reader: reject before decoding;
- malformed current payload: reject, preserve old data;
- superseded payload: do not commit or surface a stale error;
- disposed owner/finalized embed: reject or abort, never commit.

## Documentation and migration

Update `docs/api/runtime-state.md` with:

- `datasets.load()` examples for Arrow IPC and Parquet;
- accepted binary input types and promise semantics;
- exact-owner behavior for nested datasets;
- full versus minimal runtime registration requirements;
- latest-operation-wins behavior; and
- a statement that replacement preserves the runtime instance but can update
  data-derived scale and selection state.

No JSON Schema regeneration or persisted-spec migration is required. Existing
`set()` and `reset()` callers remain source-compatible.

## Testing strategy

### Binary reader tests

- Extend `packages/core/src/data/formats/arrow.test.js` with a `DataView` whose
  payload begins at a non-zero offset.
- Add focused Parquet reader coverage using a small deterministic fixture.
  Verify both a full `ArrayBuffer` and an offset view.
- Verify malformed payload rejection and ordinary mutable row objects.

### Dataset API tests

Extend `packages/core/src/view/viewMutationApi.test.js` and/or
`packages/core/src/data/namedDataScope.test.js` to cover:

- top-level Arrow and Parquet loads;
- a nested exact-owner load;
- multiple consumers of one binding;
- shadowed declarations remaining independent;
- decoding failure preserving old rows;
- `set()` and `reset()` superseding pending loads;
- two delayed loads completing out of order, with the latest invocation
  winning;
- owner removal during decoding; and
- embed finalization during decoding.

Use controllable registered test readers for race and failure tests rather than
timing real decoders. Keep real Arrow and Parquet integration tests for format
correctness.

### Verification commands

```sh
npx vitest run packages/core/src/data/formats/arrow.test.js
npx vitest run packages/core/src/view/viewMutationApi.test.js
npx vitest run packages/core/src/data/namedDataScope.test.js
npm --workspace @genome-spy/core run test:tsc
npm --workspace @genome-spy/core run verify:bundle:minimal
npm run lint
```

Run the full unit suite before merging because named-data replacement affects
transforms, scales, layout, and rendering across Core.

## Risks and mitigations

- **Stale async commits:** generation checks cover overlapping loads, while the
  lifecycle guard covers removed/finalized owners.
- **Accidental minimal-bundle growth:** reader lookup remains registry-based and
  the existing minimal bundle verifier runs in CI.
- **Offset buffer corruption:** normalize every view with its explicit offset
  and length and test both decoders with padded backing buffers.
- **Peak memory use:** Arrow avoids an input copy for aligned views; Arrow and
  Parquet may each require one bounded copy for an offset view. Both formats
  still materialize row objects because that is the current dataflow contract.
- **Global reader registry interference in tests:** restore any temporarily
  replaced readers after each test and avoid concurrent mutation of the same
  registry entry.
- **Ambiguous promise expectations:** document that `load()` awaits decoding
  and propagation, not the next rendered animation frame.

## Unresolved questions

- Whether the simplest correct Parquet offset handling is an `AsyncBuffer`
  adapter or a bounded `ArrayBuffer.slice()`. Decide after a focused test of the
  current `parquetReadObjects()` implementation.
- Whether finalization should use a new general embed-lifetime signal that can
  later protect other asynchronous public APIs, or a dataset-specific active
  check. Prefer the smallest mechanism that is not tied to browser-only code.
- Whether a superseded `load()` should resolve silently or return an applied
  boolean. The proposed initial contract is `Promise<void>` with silent stale
  completion; change this only if implementation experience reveals a concrete
  caller need.

## Acceptance criteria

- `EmbedResult.datasets.load()` replaces top-level declared data from Arrow IPC
  and Parquet buffers.
- The declaring `ViewHandle.datasets.load()` provides the same behavior for a
  nested declaration.
- `DataView` inputs with non-zero offsets decode only their addressed range.
- Successful updates reuse the existing GenomeSpy runtime and update all
  consumers of the binding.
- Failed current decoding leaves the old dataset unchanged.
- The latest `set()`, `reset()`, or `load()` invocation wins deterministically.
- Removed views and finalized embeds cannot receive late commits.
- The minimal bundle does not acquire Arrow, Parquet, Flechette, or hyparquet
  reader code unless explicitly registered/imported.
- Public typings and runtime-state documentation describe the new contract.
- Focused, type-check, lint, minimal-bundle, and full-suite verification pass.

## Implementation steps

### 1. Normalize and verify binary format readers

**Outcome:** Arrow and Parquet readers correctly handle bounded in-memory views,
and a shared helper can decode a supported registered binary format.

**Affected areas:**

- `packages/core/src/data/formats/arrow.js`
- `packages/core/src/data/formats/parquet.js`
- a new focused binary-reader helper under `packages/core/src/data/formats/`
- adjacent format tests and a small Parquet fixture

**Verification:** Run the format tests, Core TypeScript check, and minimal bundle
verification.

**Documentation/migration:** None in this step; no public API exists yet.

**Tentative commit:** `fix(core): preserve bounds of binary data views`

### 2. Add the asynchronous exact-owner dataset API

**Outcome:** Top-level and nested dataset capabilities expose `load()`, enforce
latest-operation-wins ordering, preserve old data on errors, and block late
commits after removal or finalization.

**Affected areas:**

- `packages/core/src/types/embedApi.d.ts`
- `packages/core/src/view/viewMutationApi.js`
- `packages/core/src/embedFactory.js` or the smallest shared lifecycle owner
- named-data and mutation API tests

**Verification:** Run focused mutation/scope tests, Core TypeScript checking,
lint, and tests exercising real Arrow and Parquet payloads through the API.

**Documentation/migration:** Existing APIs stay compatible; no schema migration.

**Tentative commit:** `feat(core): load encoded named datasets`

### 3. Document and perform integration verification

**Outcome:** Embedders can discover and correctly use the API, including minimal
runtime registration and update-order semantics.

**Affected areas:**

- `docs/api/runtime-state.md`
- optional embed example if a concise existing example can demonstrate the API
  without introducing notebook-specific code

**Verification:** Build/check documentation as appropriate, run lint, the full
unit suite, Core TypeScript checks, and minimal bundle verification.

**Documentation/migration:** Add user-facing examples and compatibility notes;
no persisted data migration.

**Tentative commit:** `docs(core): document binary named-data updates`

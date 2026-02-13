# Metadata Source Plan

## Objective

Design a generic metadata import framework for GenomeSpy App where expression
data is one use case. The framework should support remote column-subset loading
from formats such as Zarr, Parquet, and Arrow, then import selected columns as
sample metadata.

This plan uses a single-layer model: `samples.metadataSources`.
There is no separate `metadataRepositories` and `metadataImports` split.

## Key Decisions

1. One concept for metadata ingestion: `metadataSources`.
2. Use `backend` as source-kind discriminator.
3. Use a single `initialLoad` property instead of separate `mode` + `autoload`,
   with backend-specific defaults.
4. Do not expose implementation details (for example parser library names) in
   the spec.
5. Do not use a shared `url` in a common base type; backend configs are
   backend-specific.
6. Keep backward compatibility with current static sample metadata fields.
7. Allow full source definitions to be moved into separate files using
   `import.url`.

## Goals

- Support initialization-time and on-demand loading behavior.
- Support plain column selection for generic tabular sources (`data` now;
  `parquet`/`arrow` later).
- Support identifier/synonym-based selection for Zarr expression-style sources.
- Keep existing scale ergonomics: users can override scales but do not have to.
- Keep provenance/bookmarks compact by storing source intents, not fetched data.
- Enable smooth transition from current `samples.data` + `samples.attributes`.

## Non-Goals (initially)

- Writing back to source formats.
- Server-side query orchestration.
- Full-text indexing infrastructure beyond local in-memory indexes.

## Implementation Scope

MVP implementation target:

- `backend: "data"` (legacy-compatible tabular ingestion)
- `backend: "zarr"` (including identifier/synonym workflow)

Deferred (kept in schema/context, not implemented now):

- `backend: "parquet"`
- `backend: "arrow"`

## High-Level Architecture

1. SampleView defines sample identity explicitly, or it is inferred in the
   trivial single-source `data` backend case.
2. SampleView defines one or more metadata sources.
3. Sources with `initialLoad: "*"` or `initialLoad: string[]` load during
   initialization.
4. Sources with `initialLoad: false` are imported on demand via UI. Omitted
   `initialLoad` follows backend defaults.
5. Import dispatches lightweight intent action (`addMetadataFromSource`).
6. Async pipeline resolves source, fetches/constructs metadata, and writes
   `SetMetadata` to `_augmented`.
7. Reducer applies metadata via existing `applyMetadataPayload`.
8. Provenance strips `_augmented`, so history stores replayable source intent.

## Spec Model

```ts
export interface SampleIdentityDef {
    data: Data;
    idField?: string; // default: "sample"
    displayNameField?: string; // default: idField
}

export type MetadataSourceEntry =
    | MetadataSourceDef
    | { import: { url: string } };

export interface MetadataSourceDef {
    /** Stable identifier used by actions/bookmarks and source selection. */
    id?: string;
    /** Optional user-visible label shown in source pickers (defaults to `id` in UI). */
    name?: string;
    /** Optional source context for users and agents (should be concise, factual, and machine-readable). */
    description?: string;
    /** Initialization-time loading: omitted uses backend defaults, false = no auto-load, "*" = all attributes, string[] = selected attributes. */
    initialLoad?: false | "*" | string[];
    /** Default metadata group path for imported attributes. */
    groupPath?: string;
    /** Optional source-side separator for hierarchical attribute names. */
    attributeGroupSeparator?: string;
    /** Default attribute definition applied when no per-column override exists. */
    defaultAttributeDef?: SampleAttributeDef;
    /** Per-column attribute definitions (type, scale, visibility, width, etc.). */
    columnDefs?: Record<string, SampleAttributeDef>;
    /** Backend-specific source definition (`data`, `zarr`, `parquet`, `arrow`). */
    backend: MetadataBackendDef;
}

export interface SampleDef {
    identity?: SampleIdentityDef;
    metadataSources?: MetadataSourceEntry[];

    /**
     * @deprecated
     */
    data?: Data;

    /**
     * @deprecated
     */
    attributeGroupSeparator?: string;

    /**
     * @deprecated
     */
    attributes?: Record<string, SampleAttributeDef>;
}
```

## Practical Defaults and Validation

To keep trivial use cases trivial, use these defaults:

1. `name` is optional. UI label fallback is `name` -> `id` -> generated index
   label.
2. `initialLoad` omitted defaults by backend:
   - `backend: "data"` => `initialLoad: "*"`
   - `backend: "zarr" | "parquet" | "arrow"` => `initialLoad: false`
3. If `identity` is omitted and there is exactly one source with
   `backend.backend: "data"`, infer sample identity from that source using
   `sampleIdField` (default `"sample"`). `displayName` defaults to sample ID.
4. If action payload omits `sourceId`, source resolution
   succeeds only when exactly one source exists.

Validation rules:

1. If `id` is present, it must be unique among `metadataSources`.
2. `initialLoad: string[]` must reference valid source columns.
3. If source resolution is ambiguous, throw a clear error (no silent fallback).
4. If a source has `backend.backend: "zarr"` and `layout: "matrix"`, matrix
   paths resolve to defaults (`X`, `obs_names`, `var_names`) when omitted.
5. Reuse the same sample ID alignment logic as the custom metadata upload
   dialog (`unknownSamples`, `notCoveredSamples`, `samplesInBoth`).
6. Hard limit: max 100 columns per import action.

## Backend Model

```ts
export type MetadataBackendDef =
    | DataBackendDef
    | ZarrBackendDef
    | ParquetBackendDef
    | ArrowBackendDef;

export interface DataBackendDef {
    backend: "data";
    data: UrlData | InlineData;
    sampleIdField?: string; // default: "sample"
}

export interface ZarrBackendDef {
    backend: "zarr";
    url: string;
    layout: "matrix" | "table";
    matrix?: {
        valuesPath?: string; // default: "X"
        rowIdsPath?: string; // default: "obs_names"
        columnIdsPath?: string; // default: "var_names"
    };
    table?: {
        path?: string;
        sampleIdField?: string;
    };
    identifiers?: ColumnIdentifierField[];
    synonymIndex?: ColumnSynonymIndex;
}

export interface ParquetBackendDef {
    backend: "parquet";
    url: string;
    sampleIdField: string;
}

export interface ArrowBackendDef {
    backend: "arrow";
    url: string;
    sampleIdField: string;
}

export interface ColumnIdentifierField {
    name: string;
    path: string;
    primary?: boolean;
    caseInsensitive?: boolean;
    stripVersionSuffix?: boolean;
}

export interface ColumnSynonymIndex {
    termPath: string;
    columnIndexPath: string;
    sourcePath?: string;
}
```

Notes:

- `backend: "data"` means "use the normal GenomeSpy `Data` contract" with
  `UrlData` / `InlineData`.
- Parquet is also tabular conceptually, but it remains its own backend because
  it has different subset-loading capabilities and IO contract.
- In this plan, `parquet` and `arrow` are treated as generic tabular sources
  (CSV-like column picking), without curated identifier/synonym indexing.
- `parquet` and `arrow` remain as forward-looking schema options, but are
  explicitly out of MVP implementation scope.

## Backend Capability Semantics

`initialLoad` configures initialization-time loading behavior, independent of
backend type.

- `data` backend:
  - loading is full-table when triggered.
  - omitted `initialLoad` defaults to `"*"`.
  - `initialLoad: false` disables initialization-time loading.
- `parquet` / `arrow` backends:
  - generic tabular behavior (plain column names).
  - should support subset loading by selected columns.
  - deferred: not implemented in MVP.
- `zarr` backend:
  - supports on-demand subset loading by selected columns.
  - supports optional identifier/synonym lookup for expression-like matrices.
  - can also use `initialLoad` for initialization-time loading.

## Zarr Identifier and Synonym Strategy

Lookup should support canonical IDs plus aliases.

Normalization options:

- case-insensitive matching
- trimming
- optional Ensembl version stripping (`ENSG... .xx`)

Lookup behavior:

1. Build `term -> Set<columnIndex>` map from `identifiers` and optional
   `synonymIndex` (Zarr backend).
2. Resolve user queries against normalized terms.
3. If a term is ambiguous, show disambiguation in UI.
4. Keep primary identifier for display and provenance readability.

## Load Semantics

`initialLoad`:

- omitted defaults by backend:
  - `data`: `"*"`
  - `zarr` / `parquet` / `arrow`: `false`
- `false`: fetch/import only when user requests.
- `"*"`: import all available attributes during initialization.
- `string[]`: import only listed attributes during initialization.

Compatibility mapping from old two-field model:

- `mode: "lazy"` => `initialLoad: false`
- `mode: "eager", autoload: "*"` => `initialLoad: "*"`
- `mode: "eager", autoload: ["a", "b"]` => `initialLoad: ["a", "b"]`

Attribute definition precedence:

1. explicit per-column entry in `columnDefs`
2. `defaultAttributeDef`
3. inferred defaults

## Runtime and State Flow

### Intent payload

```ts
export interface AddMetadataFromSource {
    sourceId?: string;
    columnIds: string[];
    groupPath?: string;
    replace?: boolean;
    _augmented?: {
        metadata: SetMetadata;
    };
}
```

Source resolution:

1. resolve by `sourceId` when provided
2. else if exactly one matching source exists, use it
3. else throw clear validation/runtime error

### Reducer behavior

`addMetadataFromSource` mirrors `deriveMetadata`:

- read `payload._augmented?.metadata`
- throw if missing
- call existing `applyMetadataPayload`

### Async augmentation

Pipeline pre-dispatch hook:

1. resolve source
2. resolve columns
3. match sample IDs
4. fetch selected columns
5. build `SetMetadata`
6. attach to `_augmented`

Pipeline post-dispatch hook:

- await metadata readiness (`sampleView.awaitMetadataReady`)

### Provenance and bookmarks

Keep `_augmented` transient and strip it before history storage. History stores
source reference + selected columns only.

Replay strictness:

- if referenced source is missing/unavailable during replay, abort replay.
- if any referenced attribute/column cannot be resolved during replay, abort
  replay.

## Adapter Interface

```ts
export interface MetadataSourceAdapter {
    listColumns(signal?: AbortSignal): Promise<ColumnDescriptor[]>;
    resolveColumns(
        queries: string[],
        signal?: AbortSignal
    ): Promise<ResolvedColumns>;
    fetchColumns(
        request: FetchColumnsRequest,
        signal?: AbortSignal
    ): Promise<SetMetadata>;
}
```

## Migration Strategy

Legacy fields:

- `samples.data`
- `samples.attributeGroupSeparator`
- `samples.attributes`

Migration mapping:

- if legacy fields are present and `metadataSources` is absent, create one
  implicit auto-loading source at runtime:
  - `initialLoad: "*"`
  - `backend.backend: "data"`
  - `backend.data` from legacy `samples.data`
  - `columnDefs` from legacy `samples.attributes`
  - separator from legacy `samples.attributeGroupSeparator`

Deprecation plan:

1. keep legacy behavior fully working
2. emit one warning per spec load
3. document migration and remove legacy fields later

## Modular Source Files

Allow full metadata source definitions in separate JSON files.

Pattern:

```json
{
  "samples": {
    "metadataSources": [
      { "import": { "url": "metadata/clinical-source.json" } },
      { "import": { "url": "metadata/expression-source.json" } }
    ]
  }
}
```

Notes:

- use existing GenomeSpy-style `import.url` conventions
- avoid JSON Schema `$ref` semantics for runtime config
- imported files contain full `MetadataSourceDef` objects
- no nested source imports (one import level only)

## UI Concept

Entry points:

- sources with `initialLoad: "*"` or `initialLoad: string[]` import automatically
- sources with `initialLoad: false` are available in "Import metadata from source..."
- sources with omitted `initialLoad` follow backend defaults (`data` auto-loads,
  other backends are on-demand)

Dialog flow:

1. source picker (if multiple on-demand sources exist)
2. on dialog open, load source sample IDs and show preflight sample-match summary
3. search/select columns
   Zarr sources can search by identifiers/synonyms, while
   `data` uses plain column names (`parquet`/`arrow` follow the same model when
   those backends are enabled later).
4. support both single-attribute quick add and batch input
   batch input accepts paste or file load (`.txt`, `.tsv`, `.csv`) and tokenizes
   by newline/comma/tab/semicolon/whitespace
5. optional group-path override
6. keep preflight/preview always visible before import (do not switch to a
   post-click review step)
7. submit through intent pipeline (progress, cancel, error handling)

Severity and blocking policy:

- info: matched samples and resolved attributes
- warning: partial misses/ambiguities
- error (blocking): no matching sample rows, zero resolvable attributes, or
  source read/access failure
- error (blocking): requested import size exceeds hard limit (100 columns)

Import should not be blocked by warnings; users can proceed with partial
matches.

## Zarr Performance Notes

- load identifier arrays once
- keep lookup map in memory per source
- fetch only requested columns/blocks
- choose chunking for all-rows + subset-columns access
- use `AbortSignal` for responsive cancellation

## Example JSON Configurations

### 0) Minimal trivial source (new style)

```json
{
  "samples": {
    "metadataSources": [
      {
        "backend": {
          "backend": "data",
          "data": { "url": "data/samples.tsv", "format": { "type": "tsv" } }
        }
      }
    ]
  }
}
```

### 1) Current legacy static eager metadata (existing style)

```json
{
  "name": "samples",
  "samples": {
    "data": { "url": "data/samples.tsv" },
    "labelLength": 110,
    "attributes": {
      "sampleTime": {
        "type": "ordinal",
        "scale": {
          "domain": ["primary", "interval", "relapse"],
          "range": ["#facf5a", "#f95959", "#455d7a"]
        }
      },
      "PFI": {
        "type": "quantitative",
        "scale": {
          "type": "threshold",
          "domain": [90, 182, 365, 740],
          "scheme": "yellowgreenblue"
        }
      },
      "sampleType": {
        "type": "nominal",
        "scale": { "scheme": "set2" },
        "visible": false
      }
    }
  }
}
```

### 2) Single eager static source (new style, backend = data)

```json
{
  "vconcat": [
    {
      "name": "samples",
      "samples": {
        "identity": {
          "data": { "url": "data/samples.tsv" },
          "idField": "sample",
          "displayNameField": "sample"
        },
        "metadataSources": [
          {
            "id": "clinical",
            "name": "Clinical TSV",
            "initialLoad": "*",
            "backend": {
              "backend": "data",
              "data": {
                "url": "data/samples.tsv",
                "format": { "type": "tsv" }
              },
              "sampleIdField": "sample"
            },
            "columnDefs": {
              "sampleTime": {
                "type": "ordinal",
                "scale": {
                  "domain": ["primary", "interval", "relapse"],
                  "range": ["#facf5a", "#f95959", "#455d7a"]
                }
              },
              "PFI": {
                "type": "quantitative",
                "scale": {
                  "type": "threshold",
                  "domain": [90, 182, 365, 740],
                  "scheme": "yellowgreenblue"
                }
              }
            }
          }
        ]
      }
    }
  ]
}
```

### 3) Entire source defined in separate file

Main spec:

```json
{
  "vconcat": [
    {
      "name": "samples",
      "samples": {
        "identity": {
          "data": { "url": "data/samples.tsv" },
          "idField": "sample",
          "displayNameField": "sample"
        },
        "metadataSources": [
          { "import": { "url": "metadata/clinical-source.json" } }
        ]
      }
    }
  ]
}
```

`metadata/clinical-source.json`:

```json
{
  "id": "clinical",
  "name": "Clinical TSV",
  "initialLoad": ["sampleTime", "PFI", "purity"],
  "groupPath": "clinical",
  "backend": {
    "backend": "data",
    "data": {
      "url": "../data/samples.tsv",
      "format": { "type": "tsv" }
    },
    "sampleIdField": "sample"
  },
  "columnDefs": {
    "PFI": {
      "type": "quantitative",
      "scale": {
        "type": "threshold",
        "domain": [90, 182, 365, 740],
        "scheme": "yellowgreenblue"
      }
    }
  }
}
```

### 4) Lazy expression source from Zarr with synonyms

```json
{
  "vconcat": [
    {
      "name": "samples",
      "samples": {
        "identity": {
          "data": { "url": "data/samples.tsv" },
          "idField": "sample",
          "displayNameField": "sample"
        },
        "metadataSources": [
          {
            "id": "rna_expression",
            "name": "RNA expression",
            "description": "Bulk RNA expression matrix (log2 fold change)",
            "initialLoad": false,
            "groupPath": "expression",
            "defaultAttributeDef": {
              "type": "quantitative",
              "scale": {
                "type": "linear",
                "scheme": "redblue",
                "domainMid": 0
              }
            },
            "backend": {
              "backend": "zarr",
              "url": "https://example.org/expression.zarr",
              "layout": "matrix",
              "matrix": {
                "valuesPath": "X",
                "rowIdsPath": "obs_names",
                "columnIdsPath": "var_names"
              },
              "identifiers": [
                {
                  "name": "symbol",
                  "path": "var/symbol",
                  "primary": true,
                  "caseInsensitive": true
                },
                {
                  "name": "ensembl",
                  "path": "var/ensembl_id",
                  "stripVersionSuffix": true
                }
              ],
              "synonymIndex": {
                "termPath": "var_synonyms/term",
                "columnIndexPath": "var_synonyms/column_index",
                "sourcePath": "var_synonyms/source"
              }
            }
          }
        ]
      }
    }
  ]
}
```

## Phased Implementation Plan

### Phase 1: Spec and action scaffolding

Implementation tasks:

1. Add `metadataSources` types to `SampleDef` in `packages/app/src/spec/sampleView.d.ts`.
2. Add `AddMetadataFromSource` payload type in
   `packages/app/src/sampleView/state/payloadTypes.d.ts`.
3. Add `addMetadataFromSource` reducer case in
   `packages/app/src/sampleView/state/sampleSlice.js` that applies
   `_augmented.metadata` similarly to `deriveMetadata`.
4. Add action info text for provenance/history in
   `packages/app/src/sampleView/state/actionInfo.js`.
5. Add runtime legacy mapping from `samples.data` / `samples.attributes` /
   `samples.attributeGroupSeparator` to an implicit `metadataSources` entry.
6. Emit one deprecation warning per spec load when legacy fields are used.

Tests:

1. Add reducer tests for `addMetadataFromSource` happy path and missing
   augmentation error in `packages/app/src/sampleView/state/sampleSlice.test.js`.
2. Add legacy mapping tests in spec/load path tests (or nearest existing spec
   parsing tests in app package).
3. Add action-info snapshot/assert tests in
   `packages/app/src/sampleView/state/actionInfo.test.js`.

Preliminary commit message:

- `feat(app): add metadata source action and spec scaffolding`

### Phase 2: Pipeline and adapter layer

Implementation tasks:

1. Extend intent pipeline hook support to run pre-dispatch async augmentation
   for `addMetadataFromSource`.
2. Add metadata source adapter registry and resolver in app-side metadata module
   (for example under `packages/app/src/sampleView/metadata/`).
3. Implement `data` backend adapter using `UrlData` / `InlineData` semantics.
4. Wire adapter invocation to build `_augmented.metadata` (`SetMetadata`) before
   reducer dispatch.
5. Ensure action replay/provenance strips augmentation payload.

Tests:

1. Add intent pipeline tests for successful augmentation, cancellation, and
   source resolution errors in `packages/app/src/state/intentPipeline.test.js`.
2. Add adapter unit tests for `data` backend column listing/resolution and
   sample alignment.
3. Add provenance serialization test asserting large fetched payload is not
   persisted in history/bookmark actions.

Preliminary commit message:

- `feat(app): wire metadata source pipeline and data backend adapter`

### Phase 3: Zarr MVP

Implementation tasks:

1. Implement Zarr adapter with matrix defaults:
   `X`, `obs_names`, `var_names`.
2. Add Zarr identifier resolution (`identifiers`) and optional synonym index
   resolution (`synonymIndex`) for expression workflows.
3. Implement subset fetch by selected attributes and sample row alignment.
4. Convert fetched subset into `SetMetadata` with `groupPath`,
   `defaultAttributeDef`, and `columnDefs` precedence.
5. Add source-level caching for identifier arrays and lookup maps per dialog
   session.

Tests:

1. Add Zarr adapter tests for matrix defaults, identifier lookup, synonym
   lookup, ambiguity handling, and missing term handling.
2. Add integration test for `addMetadataFromSource` + Zarr path through intent
   pipeline to reducer state.
3. Add regression tests for partial matches (some missing rows/attributes) and
   hard failures (no matching rows, zero resolvable attributes).

Preliminary commit message:

- `feat(app): add zarr metadata source adapter MVP`

### Phase 4: UX and hardening

Implementation tasks:

1. Add "Import metadata from source..." dialog entry point.
2. Build dialog with:
   source picker, preflight sample-match summary, quick single add, batch
   paste/file input, optional group override, and import action.
3. Keep preview/preflight visible before import; no post-click review step.
4. Implement warning/error severity model:
   warnings are non-blocking, only severe failures block import.
5. Reuse custom upload sample alignment logic
   (`unknownSamples`, `notCoveredSamples`, `samplesInBoth`).
6. Add cancel support with `AbortSignal` and progress feedback.

Tests:

1. Add dialog tests for parsing batch input delimiters and dedupe behavior.
2. Add dialog tests for severity behavior:
   warning does not block import, severe errors block import.
3. Add tests for preflight shown on open and reactivity while user edits input.
4. Add e2e-ish app test for import flow from dialog to metadata visible in
   sample metadata state.
5. Add limit tests enforcing max 100 columns per import.

Preliminary commit message:

- `feat(app): add metadata source import dialog MVP`

### Phase 5: Optional future backends (deferred)

Implementation tasks:

1. Implement `parquet` adapter (generic column-name selection).
2. Implement `arrow` adapter (generic column-name selection).
3. Keep behavior aligned with current scope:
   no curated synonym indexing for these backends.

Tests:

1. Add backend-specific adapter contract tests.
2. Add source capability tests to ensure consistent behavior with
   `initialLoad`, source resolution, and error handling.

Preliminary commit messages:

- `feat(app): add parquet metadata backend adapter`
- `feat(app): add arrow metadata backend adapter`

### Validation Checklist

1. Run focused tests while implementing each phase.
2. Before merge, run:
   - `npx vitest run packages/app/src/sampleView/state/sampleSlice.test.js`
   - `npx vitest run packages/app/src/state/intentPipeline.test.js`
   - `npm test`
   - `npm run lint`
3. Confirm bookmark/provenance payload size remains stable after metadata-source
   imports.
4. Confirm replay aborts when a referenced source or attribute is unavailable.

## Documentation Plan

### Spec and schema docs

1. Update JSDoc for new/changed app spec types in:
   - `packages/app/src/spec/sampleView.d.ts`
2. Ensure generated schema includes new metadata-source structures and defaults.
3. Add or publish fragment schema docs for standalone metadata source files
   (editor validation use case).

### User docs

1. Add a new docs page for metadata source import workflow:
   - `docs/sample-collections/advanced-metadata.md`
   - how to configure `metadataSources`
   - `backend: "data"` minimal setup
   - Zarr expression setup with identifiers/synonyms
   - `initialLoad` behavior
   - legacy compatibility and migration notes
   - clear "planned/experimental" status until implementation lands
2. Link the new page from existing sample-collection docs:
   - add a short "advanced metadata sources" pointer in
     `docs/sample-collections/visualizing.md`
   - add it to the app docs landing list in `docs/sample-collections/index.md`
   - add nav entry in `mkdocs.yml` under "Working with Sample Collections"
3. Document dialog UX:
   - quick single attribute import
   - batch paste/file input
   - preview/preflight semantics and severity model
4. Add troubleshooting section:
   - no matching sample rows
   - missing/ambiguous attribute tokens
   - source access/read errors

### Migration docs

1. Add explicit migration guide from legacy fields:
   - `samples.data`
   - `samples.attributeGroupSeparator`
   - `samples.attributes`
   to `samples.metadataSources`.
2. Document deprecation timeline and compatibility guarantees.

### Examples

1. Keep at least these examples up to date:
   - minimal `backend: "data"` source
   - legacy-compatible mapping example
   - lazy Zarr expression source with identifiers/synonyms
   - external source definition via `import.url`

### Docs completion criteria

1. `npm run build:docs` succeeds.
2. New spec keys and defaults are visible in generated docs/schema.
3. At least one complete user-facing end-to-end example is copy-pastable.
4. Advanced metadata page is reachable from both docs navigation and
   sample-collection documentation pages.

## Resolved Constraints

1. Source imports are single-level only (no nested imports).
2. Replay is strict:
   missing sources or missing referenced attributes abort replay.
3. Hard import limit:
   maximum 100 columns per import action.

## Successful Outcome

The effort is successful when the following are true:

1. Simple specs remain simple:
   a single-source `backend: "data"` configuration works with minimal required
   fields and no extra wiring.
2. Existing specs keep working:
   legacy `samples.data` / `samples.attributes` behavior is preserved through
   mapping with clear deprecation messaging.
3. Users can import attributes with low friction:
   one dialog supports quick single-attribute import, batch paste/file input,
   and non-blocking warnings.
4. Preflight validation is useful but not obstructive:
   sample-match and attribute-resolution summaries are visible before import,
   and only severe failures block actions.
5. Source-backed imports are reproducible:
   provenance/bookmark entries remain compact and replay from source intent,
   without embedding fetched payloads.
6. Zarr expression workflow is practical in real datasets:
   identifier/synonym lookup, subset loading, and sample alignment perform
   reliably in normal cohort sizes.
7. Code quality is maintainable:
   adapter boundaries are clear, tests cover critical paths, and new behavior
   integrates cleanly with existing sample metadata state and UI.

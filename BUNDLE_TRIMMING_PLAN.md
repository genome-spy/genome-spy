# Bundle Trimming Plan

## Why this is needed

The core package currently exposes a broad runtime surface, and several
modules are statically imported from the main entry path even when a consumer
only needs basic CSV/TSV support. The result is that optional genomic loaders
and supporting parsers are still reachable from the default bundle, even when
the user never intends to use them.

The goal is to make the default experience small and predictable while still
supporting:

- optional built-in loaders for genomic file formats
- user-defined custom data sources
- internal deep imports used by first-party workspace packages

This plan assumes the public entry point remains `embed` from
`packages/core/src/index.js`, but that the package can grow internal-only
extension points and separate optional entry paths.

## Current State

The current bundle shape is anchored by a few direct imports:

- `packages/core/src/data/sources/dataSourceFactory.js` imports all built-in
  lazy data source classes up front.
- `packages/core/src/genomeSpy.js` registers eager formats at module load and
  imports lazy base classes for runtime checks.
- `packages/core/src/view/dataReadiness.js` imports lazy base classes for
  `instanceof` checks.
- `packages/core/package.json` exposes `./*`, which makes the whole source tree
  part of the public package surface.

There is already an extension hook in `registerLazyDataSource(...)`, but it is
currently embedded in the factory module and the built-in sources are still
statically wired into the default runtime.

## Constraints

- `packages/app/`, `packages/playground/`, `packages/embed-examples/`, and
  `packages/react-component/` rely on `@genome-spy/core` and its deep imports.
- `AxisTickSource` depends on `SingleAxisLazySource`, so that base class cannot
  be treated as optional.
- `SingleAxisWindowedSource` is shared infrastructure and should stay in core.
- The public API should stay small. Internal refactoring should be possible
  without turning every implementation detail into a supported external
  contract.

## Goals

1. Keep the default `embed` path minimal.
2. Make built-in optional loaders opt-in by import.
3. Allow users to register custom data sources without exposing every internal
   class.
4. Preserve the first-party workspace packages as consumers of internal
   subpaths.
5. Keep the refactor incremental so the repository remains buildable throughout.

## Non-Goals

- Rewriting the dataflow model.
- Changing the spec syntax for existing users.
- Forcing `app` or `playground` to use only public exports.
- Replacing the current renderer or the view hierarchy.

## Proposed Package Shape

### Core runtime

`@genome-spy/core`

- Exports `embed` and other small user-facing helpers.
- Includes the full default runtime needed for standard GenomeSpy usage.
- Includes `SingleAxisLazySource`, `SingleAxisWindowedSource`, and the axis
  tick sources.
- Keeps the current "fat" default experience.

`@genome-spy/core/minimal`

- Exports the lean runtime and no optional built-in format loaders.
- Intended for advanced consumers who want explicit control over which
  loaders are present.
- Should remain compatible with the same `embed` API shape.

### Optional built-in modules

`@genome-spy/core/formats/eager/parquet`

- Self-registers the Parquet reader with `vega-loader`.
- Exists only for consumers who need Parquet support.

`@genome-spy/core/formats/eager/bed`
`@genome-spy/core/formats/eager/bedpe`

- Self-register eager table/annotation readers in the same style.

`@genome-spy/core/formats/lazy/bigbed`
`@genome-spy/core/formats/lazy/bigwig`
`@genome-spy/core/formats/lazy/bam`
`@genome-spy/core/formats/lazy/vcf`
`@genome-spy/core/formats/lazy/indexedfasta`
`@genome-spy/core/formats/lazy/gff3`

- Self-register built-in lazy data sources on import.
- Pull in heavy dependencies only when explicitly imported.

### Extension API

`@genome-spy/core/extensions`

- Exposes a single generic registration hook for custom data sources.
- Can later grow a format registration hook if needed.
- Remains intentionally small and stable.

### Internal subpaths

`@genome-spy/core/internal/*`

- Intended for `packages/app/` and `packages/playground/`.
- Used for deep imports that are part of the monorepo workflow but not the
  public compatibility promise.

## Implementation Strategy

### Phase 1 - Isolate registration

Move the built-in lazy source wiring out of
`packages/core/src/data/sources/dataSourceFactory.js`.

The factory should keep only:

- the registry storage
- the custom registration hook
- the lookup logic for `lazy.type`

Built-in sources should live in separate registration modules. The modules can
register themselves on import. The important part is that the default entry
path does not import the leaf source classes directly.

### Phase 2 - Add optional format entry points

Create subpath modules under `packages/core/src/formats/`:

- `eager/parquet.js`
- `eager/bed.js`
- `eager/bedpe.js`
- `lazy/bigbed.js`
- `lazy/bigwig.js`
- `lazy/bam.js`
- `lazy/vcf.js`
- `lazy/indexedfasta.js`
- `lazy/gff3.js`

Each module should import the underlying implementation and register it with
the core registry or `vega-loader`.

This keeps the consumer API simple:

```js
import { embed } from "@genome-spy/core";
import "@genome-spy/core/formats/lazy/bigbed";
import "@genome-spy/core/formats/eager/parquet";
```

### Phase 3 - Introduce minimal and full runtime entry points

Add explicit package entry points:

- `@genome-spy/core`
- `@genome-spy/core/minimal`
- `@genome-spy/core/full`

Suggested behavior:

- `@genome-spy/core` remains the default fat entry point for compatibility and
  convenience.
- `minimal` exports the lean runtime and no optional built-in format loaders.
- `full` can remain as an explicit alias of the default entry point if that
  helps document intent, but it is not required if the root package already
  represents the full experience.

The default should stay fat so existing users keep the current behavior. The
minimal entry point exists as the opt-in trim path for advanced consumers.

### Phase 4 - Reduce static bundle anchors

Remove or replace static imports that pull optional modules into the default
graph.

Primary targets:

- `packages/core/src/data/sources/dataSourceFactory.js`
- `packages/core/src/genomeSpy.js`

The readiness code does not need to change for bundle trimming. The current
`instanceof` checks only depend on shared base classes that stay in core.

### Phase 5 - Define the custom extension contract

Expose one generic registration API for consumers who need custom sources.

Potential shape:

- `registerDataSource({ guard, Source })`
- optionally `registerFormat({ type, read })`

The API should be:

- small enough to keep the public surface manageable
- expressive enough for custom lazy sources and custom eager readers
- independent of `embed` options so registrations stay tree-shakeable

### Phase 6 - Update first-party workspace consumers

Migrate the repo-local packages to the new structure while keeping their access
to deep internals:

- `packages/app/`
- `packages/playground/`
- `packages/embed-examples/`
- `packages/react-component/`

These packages should continue to work with:

- the public `embed` API
- the internal `@genome-spy/core/internal/*` namespace where needed

The goal is not to force them onto the narrow public surface immediately. The
goal is to separate the external compatibility contract from the internal monorepo
dependency graph.

For `packages/app/`, do the import migration with a scripted codemod or
rewrite script rather than editing files one by one. The package has too many
deep imports for manual token-by-token migration to be an efficient or
reliable use of time.

## Required Code Changes

### Core

- Refactor the source factory into a registry-driven lookup.
- Add built-in registration modules for optional loaders.
- Add a minimal entry point and a full entry point.
- Update `package.json` exports to remove the broad `./*` public exposure.
- Introduce the `extensions` entry point for custom sources.

### Formats

- Move eager readers like Parquet into subpath registration modules.
- Move lazy genomic loaders into subpath registration modules.
- Keep implementation modules separate from registration modules so the
  registration layer stays tiny.

### Docs

- Update the core README or getting started docs to show:
  - the minimal import
  - optional built-in format imports
  - custom source registration
- Update any grammar docs if the data import story changes.
- Add a short note in the lazy data grammar docs explaining that built-in
  loaders are opt-in modules.

## Testing Plan

### Unit tests

Add tests that verify:

- the minimal runtime can load inline, URL, and sequence data
- lazy loaders are unavailable until their registration module is imported
- custom data sources can be registered and resolved through the factory
- built-in optional loaders still work after registration

### Bundle-level verification

Add a focused verification step to confirm that the minimal build no longer
contains the optional loader dependencies by default.

Useful checks:

- inspect the emitted bundle for known heavy dependencies
- compare bundle size before and after the refactor
- verify that importing `@genome-spy/core/minimal` does not pull in BigBed,
  BAM, VCF, or Parquet code unless the matching module is imported

### Workspace regression coverage

Add or update tests for:

- `packages/app/`
- `packages/playground/`
- `packages/embed-examples/`
- `packages/react-component/`

The main objective is to confirm that repo-local deep imports still resolve and
that the embed workflow still behaves the same for existing examples.

## Migration Order

1. Introduce the registry-driven source lookup without changing behavior.
2. Add registration modules for built-in lazy sources and eager readers.
3. Add `minimal` and `full` entry points.
4. Move the package export map from wildcard exposure to explicit subpaths.
5. Update `packages/app/` imports with a script, then migrate the other
   workspace consumers as needed.
6. Add tests for minimal, full, and custom registration flows.
7. Update docs and examples.

## Progress

- Phase 1 complete: the lazy source registry now lives in
  `packages/core/src/data/sources/lazyDataSourceRegistry.js`, and the built-in
  lazy source list was moved into
  `packages/core/src/data/sources/lazy/registerBuiltInLazySources.js`.
- Validation passed after the refactor:
  - `npm test`
  - `npm --workspaces run test:tsc --if-present`
  - `npm run lint`

## Phase Discipline

After each completed phase:

1. Run the relevant test commands from the repository root:
   - `npm test`
   - `npm --workspaces run test:tsc --if-present`
   - `npm run lint`
2. Revise this plan if the implementation changed the scope, ordering, or
   assumptions.
3. Commit the phase changes before starting the next phase.

This keeps the refactor auditable and prevents several partial changes from
accumulating without validation.

## Risks

- Changing the default root export could be a compatibility break if external
  users currently rely on optional loaders being present without imports.
- Exposing custom source registration without a clear contract could make the
  public API harder to evolve later.
- Optional modules need to remain side-effect safe so bundlers can remove them
  when they are not imported.

## Success Criteria

- A consumer who only needs CSV/TSV can import the minimal runtime and avoid
  optional genomic loader code.
- A consumer can opt into a single built-in loader by importing only that
  module.
- A consumer can register a custom source without depending on monorepo
  internals.
- `packages/app/`, `packages/playground/`, `packages/embed-examples/`, and
  `packages/react-component/` continue to build and run.
- The core package still supports the existing GenomeSpy behavior for users who
  import the default runtime or the necessary optional modules.

## Resolved Decisions

- Built-in optional modules self-register on import.
- The custom registration API lives under `@genome-spy/core/extensions`.
- Only the axis tick sources remain required by default among the lazy data
  loaders.

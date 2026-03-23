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
`packages/core/src/index.js`, but that the package can grow separate optional
entry paths and stable direct-import locations for data formats and lazy data
sources.
The source tree itself also exposes stable direct-import locations for
`src/data/formats/` and `src/data/sources/lazy/`, so users can import the
format/source modules directly without a boilerplate wrapper layer.
The long-term extension contract should also live under those stable paths,
not in a separate `extensions/` namespace.

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
4. Preserve the first-party workspace packages as consumers of the stable
   direct-import paths.
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

`src/data/formats/parquet.js`

- Self-registers the Parquet reader with `vega-loader`.
- Exists only for consumers who need Parquet support.

`src/data/formats/bed.js`
`src/data/formats/bedpe.js`

- Self-register eager table/annotation readers in the same style.

`src/data/sources/lazy/bigBedSource.js`
`src/data/sources/lazy/bigWigSource.js`
`src/data/sources/lazy/bamSource.js`
`src/data/sources/lazy/vcfSource.js`
`src/data/sources/lazy/indexedFastaSource.js`
`src/data/sources/lazy/gff3Source.js`

- Self-register built-in lazy data sources on import.
- Pull in heavy dependencies only when explicitly imported.

### Extension API

`src/data/sources/lazy/lazyDataSourceRegistry.js`

- Exposes a single generic registration hook for custom data sources.
- Can later grow a format registration hook under `src/data/formats/` if
  needed.
- Remains intentionally small and stable.
- Does not expose `vega-loader` through the public API.

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

Keep the format/source implementation files themselves as the stable public
imports. Each module should self-register on import and keep its implementation
and registration in the same file.

This keeps the consumer API simple without extra wrapper modules:

```js
import { embed } from "@genome-spy/core";
import "@genome-spy/core/src/data/sources/lazy/bigBedSource.js";
import "@genome-spy/core/src/data/formats/parquet.js";
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
Keep the API under the stable lazy data source path instead of a separate
public entrypoint.

Potential shape:

- `registerDataSource({ guard, Source })`
- optionally `registerFormat({ type, read })` under `src/data/formats/`

The API should be:

- small enough to keep the public surface manageable
- expressive enough for custom lazy sources and custom eager readers
- independent of `embed` options so registrations stay tree-shakeable

### Phase 6 - Update first-party workspace consumers

Migrate the repo-local packages to the new structure while keeping their access
to the stable direct-import paths:

- `packages/app/`
- `packages/playground/`
- `packages/embed-examples/`
- `packages/react-component/`

These packages should continue to work with:

- the public `embed` API
- the stable `src/data/formats/` and `src/data/sources/lazy/` imports where
  needed

The goal is not to force them onto the narrow public surface immediately. The
goal is to separate the external compatibility contract from the internal monorepo
dependency graph.

Consumer-specific expectations:

- `packages/app/` should keep the fat default core behavior and does not need
  a major runtime refactor for bundle trimming.
- `packages/playground/` and `packages/react-component/` should continue using
  the default fat runtime.
- `packages/embed-examples/` should add at least one example that demonstrates
  the minimal core entry point, or convert an existing example to the minimal
  path where it does not rely on optional loaders.

For `packages/app/`, do the import migration with a scripted codemod or
rewrite script rather than editing files one by one. The package has too many
deep imports for manual token-by-token migration to be an efficient or
reliable use of time.

## Required Code Changes

### Core

- Refactor the source factory into a registry-driven lookup.
- Keep the optional loaders self-registering in their stable source files.
- Add a minimal entry point and a full entry point.
- Update `package.json` exports to make the stable source/formats directories
  importable.
- Keep the custom source registration API in the stable lazy data source
  registry path.

### Formats

- Add self-registration to the stable eager and lazy module files.
- Keep the implementation files themselves as the public import surface.
- Avoid wrapper-only registration modules for the optional built-ins.

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
For `packages/embed-examples/`, add coverage for a minimal-entry example so the
lean path remains demonstrated and exercised.

## Migration Order

1. Introduce the registry-driven source lookup without changing behavior.
2. Add registration modules for built-in lazy sources and eager readers.
3. Add `minimal` and `full` entry points.
4. Move the package export map from wildcard exposure to explicit subpaths.
5. Update `packages/app/` imports with a script, then migrate the other
   workspace consumers as needed.
6. Add tests for minimal, full, custom registration flows, and at least one
   minimal embed example in `packages/embed-examples/`.
7. Update docs and examples.

## Progress

- Phase 1 complete: the lazy source registry now lives in
  `packages/core/src/data/sources/lazy/lazyDataSourceRegistry.js`, and the built-in
  lazy source list was moved into
  `packages/core/src/data/sources/lazy/registerBuiltInLazySources.js`.
- Validation passed after the refactor:
  - `npm test`
  - `npm --workspaces run test:tsc --if-present`
  - `npm run lint`
- Phase 2 complete: self-registering optional format modules now exist in the
  stable `src/data/formats/` and `src/data/sources/lazy/` files, and the old
  `src/formats/` wrapper layer has been removed.
- Phase 3 complete: the public embed logic now goes through a shared embed
  factory, `packages/core/src/genomeSpyBase.js` holds the reusable core class,
  `packages/core/src/genomeSpy.js` is the fat default wrapper, and
  `packages/core/src/minimal.js` provides the lean entry point.
- Validation passed after the refactor:
  - `npm test`
  - `npm --workspaces run test:tsc --if-present`
  - `npm run lint`
- Phase 4 complete: `packages/core/package.json` now exposes explicit
  `./minimal`, `./full`, and `./data/*` paths while keeping the broader
  compatibility export in place during the transition.
- Phase 5 complete: the custom lazy-source test now uses the stable lazy data
  source registry directly instead of the factory module.
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

## Done / Next

Done:

- Default `@genome-spy/core` stays fat.
- `@genome-spy/core/minimal` provides the lean entrypoint.
- Built-in eager and lazy loaders self-register from the stable `src/data/*`
  paths.
- The custom lazy registration hook lives in the stable lazy registry path.
- The public docs now mention the minimal entrypoint.

Next:

- Keep `packages/embed-examples/` on `@genome-spy/core/minimal` for the
  examples that only need the basic embed/runtime APIs.
- Add bundle-level verification for `@genome-spy/core/minimal`.
- Tighten tests around minimal usage and custom registration if needed.

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
- `packages/embed-examples/` uses the minimal entrypoint for examples that do
  not need optional loaders.
- The core package still supports the existing GenomeSpy behavior for users who
  import the default runtime or the necessary optional modules.

## Resolved Decisions

- Built-in optional modules self-register on import.
- The custom registration API lives under the stable lazy data source
  registry path.
- Only the axis tick sources remain required by default among the lazy data
  loaders.
- The broad `./*` compatibility export remains available.

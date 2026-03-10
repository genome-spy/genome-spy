# Multiple Assemblies Plan

## Rationale

GenomeSpy should support coordinate systems from multiple assemblies in the
same visualization. A practical and important case is a synteny or dot-plot
style view where:

- `x` encodes loci in assembly/species A (for example `hg19`)
- `y` encodes loci in assembly/species B (for example `hg38`, `mm10`, etc.)

`packages/core/private/synteny/synteny.json` is the concrete driver for this
work.

## Current Findings

### 1. Root cause of the current failure

- Locus default domain resolution happens before the scale instance is created.
- The pre-scale path currently asks for a default genome with no assembly name.
- With no single default genome, this fails with `No genome has been defined!`.

Relevant files:

- `packages/core/src/scales/scaleResolution.js`
- `packages/core/src/scales/scaleInstanceManager.js`

### 2. Root genome model is single-assembly only

- `RootSpec` currently has a single `genome?: GenomeConfig`.
- Startup initializes only that single config.

Relevant files:

- `packages/core/src/spec/root.d.ts`
- `packages/core/src/genomeSpy.js`

### 3. Dynamic view insertion exists today

Views can be added after launch (core mutation helpers and app metadata/sample
view pathways). New scales can therefore appear after initial genome loading.

Relevant files:

- `packages/core/src/view/containerMutationHelper.js`
- `packages/core/src/genomeSpy/viewDataInit.js`
- `packages/app/src/sampleView/metadata/metadataView.js`

### 4. Async/reload caveat found

Repeated `GenomeStore.initialize(...)` currently reloads all genomes and can
append duplicated chromosome metadata for URL-based genomes, because genome
structures are not cleared before `setChromSizes`.

Relevant files:

- `packages/core/src/genome/genomeStore.js`
- `packages/core/src/genome/genome.js`

## Goals

1. Assemblies can be defined at scale level.
2. Root-level genome config is optional when a locus scale defines one built-in
   assembly directly.
3. `scale.assembly` can define inline contigs.
4. Define a cleaner path for multiple assemblies at `RootSpec` level using
   `genomes` + `assembly`.
5. Support async loading safely, including dynamically added views.

## Non-goals (for initial phase)

- Full redesign of all genome-related APIs.
- Async scale creation pipeline.
- Cross-view genome aliasing heuristics.

## Proposed Semantics

### A. Scale-level assembly source of truth

For `scale.type: "locus"`, support:

1. `assembly: "hg38"` (named assembly reference, built-in or root-registered)
2. `assembly: { ... }` (inline anonymous config, including `contigs` or `url`)

Notes:

- This keeps the current property name while enabling inline configs.
- Inline `assembly` objects must be anonymous (`name` is not allowed).
- If reuse is needed across scales, define the assembly under root-level
  `genomes` and reference it by string name.
- Internally, inline anonymous assemblies should get a deterministic id (for
  example from a content hash) to support deduplication/caching.

Why this split:

- It removes ambiguous semantics where users define both `name` and `contigs`
  inline and accidentally collide with another assembly name.
- It keeps meaning explicit:
  - string = identifier/reference
  - object = literal assembly definition

### B. Root-level config optionality

Behavior:

1. If locus scale has explicit `assembly`, root-level default assembly is optional.
2. If locus scale omits `assembly`, use root `assembly` (default assembly key).
3. If root `assembly` is omitted and `genomes` contains exactly one entry, use it.
4. If neither explicit assembly nor unique default exists, throw a clear error.

### C. Root-level multiple assemblies plan

Canonical model:

- `genomes`: object/map of named assembly configs.
- `assembly`: default assembly key at root.

Candidate shape:

```json
{
  "genomes": {
    "hg19": { "url": "..." },
    "hg38": { "url": "..." }
  },
  "assembly": "hg38"
}
```

Legacy compatibility:

- Keep `genome` temporarily for backward compatibility.
- Mark `genome` deprecated.
- When `genome` is used, log a single actionable warning to console with a
  migration example to `genomes` + `assembly`.
- If legacy `genome` is used together with new `genomes` or root `assembly`,
  fail fast with a clear configuration error.

Example warning intent:

- what is deprecated (`root.genome`)
- what to use (`root.genomes` and `root.assembly`)
- before/after snippet

Terminology:

- Use `contigs` as the schema/property term.
- In prose/docs, "chromosomes/contigs" is fine for readability.

## Async and Dynamic Views: Implementation Plan

### Design Principle

Keep scale construction synchronous. Load/ensure genomes before encoder/scale
materialization.

### Runtime approach

1. Introduce async ensure APIs in `GenomeStore`:
   - `ensureAssembly(ref)`
   - `ensureAssemblies(refs)`
2. Track states per assembly (`loading`, `loaded`, `failed`) with in-flight
   dedupe.
3. Do not reload already loaded assemblies.
4. Fix genome re-load safety in `Genome` (`setChromSizes` must reset internal
   chromosome/index maps before rebuilding).

### Preflight hook points

Preflight should inspect processed subtree views (not raw spec text):

1. Initial launch:
   - after `createOrImportView` hierarchy creation
   - before `initializeViewData` / encoder initialization
2. Dynamic insertion:
   - after new subtree is created
   - before `initializeViewSubtree`
3. Visibility-lazy initialization:
   - before `initializeVisibleViewData` initializes newly visible subtrees

### Assembly collection strategy

Collect required assemblies from subtree channel defs:

- channels with locus type and scale defs
- include inherited encodings after view creation
- fail fast on conflicting shared scale assembly requirements

## Scope Phases

### Phase 1: Make synteny use case work robustly

1. Fix pre-scale assembly-aware locus domain resolution.
2. Allow `assembly: "<built-in>"` without root `genome`.
3. Add `genomes` (object/map) and root `assembly` in root spec.
4. Keep `genome` working but deprecated with actionable warning.
5. Update `synteny.json` to demonstrate the supported pattern.
6. Update docs to describe initial multi-assembly support.

### Phase 2: Inline `scale.assembly` objects

1. Extend type/schema to allow object-valued `assembly`.
2. Enforce anonymous inline objects (`name` disallowed in inline mode).
3. Ensure inline configs are registered/loaded via `GenomeStore.ensure...`.
4. Add tests for inline contigs and URL configs.

### Phase 3: Root API cleanup

1. Keep migration notes for `genome` in changelog/migration docs.
2. Remove deprecated `genome` after deprecation window.

## File-level Work Items

Core runtime:

- `packages/core/src/scales/scaleResolution.js`
- `packages/core/src/scales/scaleInstanceManager.js`
- `packages/core/src/genome/genomeStore.js`
- `packages/core/src/genome/genome.js`
- `packages/core/src/genomeSpy.js`
- `packages/core/src/view/containerMutationHelper.js`
- `packages/core/src/genomeSpy/viewDataInit.js`

Spec/schema/types:

- `packages/core/src/spec/scale.d.ts`
- `packages/core/src/spec/root.d.ts`
- `packages/core/src/spec/genome.d.ts` (if new helper types needed)
- generated schemas (`packages/core/dist/schema.json`, docs schemas)

Examples/docs:

- `packages/core/private/synteny/synteny.json`
- `docs/genomic-data/genomic-coordinates.md`
- `docs/grammar/scale.md`
- `docs/grammar/transform/linearize-genomic-coordinate.md`

App compatibility touchpoints:

- `packages/app/src/components/toolbar/searchField.js` (single-default assumption)

## Testing Plan

Unit tests:

1. `ScaleResolution`:
   - locus default domain uses explicit `scale.assembly` before scale exists
2. `ScaleInstanceManager`:
   - bind/rebind genome when assembly changes
3. `GenomeStore`:
   - ensure APIs dedupe in-flight requests
   - already loaded assemblies are not reloaded
4. `Genome`:
   - repeated URL loads do not duplicate chromosome structures
5. Validation:
   - inline object-valued `scale.assembly` rejects `name`
6. Root config validation:
   - `genome` + (`genomes` or root `assembly`) is rejected
   - root `assembly` must exist as a key in `genomes`

Integration-style tests:

1. Dynamic child insertion introduces a new assembly and succeeds.
2. Visibility-based lazy initialization introduces a new assembly and succeeds.
3. Mixed-assembly shared-scale conflict fails with a clear error.
4. Named-reference vs inline-anonymous mode rules behave as documented.
5. Deprecated `genome` emits one actionable warning per launch.

Regression tests:

1. Existing single-root-genome specs continue to work unchanged.
2. Existing locus scales without explicit assembly still work when one default
   genome is configured.
3. Legacy `genome`-only specs still work unchanged (with warning).

## Documentation Plan

1. Replace "single genome only" warning with the new root API (`genomes` + `assembly`).
2. Document precedence rules:
   - explicit scale assembly
   - root default `assembly`
   - single-entry `genomes` fallback
3. Add examples:
   - synteny with two built-ins
   - inline anonymous `scale.assembly` with `contigs`
4. Document that inline `scale.assembly` objects are anonymous (no `name`), and
   named reuse belongs to root `genomes`.
5. Regenerate schema/docs artifacts after type updates.
6. Mention legacy `genome` only in migration/changelog notes, not in primary docs.

## Commit Plan

Commit in small checkpoints to keep review focused:

1. `fix(core): resolve locus default domain using assembly-aware genome source`
2. `feat(core): add genome store ensure APIs and load dedupe`
3. `fix(core): reset genome chromosome structures before reloading chrom sizes`
4. `feat(core): support optional root genome when scale assembly is explicit`
5. `feat(core): add root genomes map and root assembly default`
6. `feat(core): deprecate root genome with actionable migration warning`
7. `docs(core): document multi-assembly behavior and migration guidance`
8. `test(core): add multi-assembly and dynamic-view coverage`
9. `fix(core): enforce anonymous inline scale assembly objects`

If split across PRs:

- PR 1: correctness bug + tests (minimal behavior change)
- PR 2: async ensure + dynamic insertion plumbing
- PR 3: schema/docs/API cleanup (`genomes` map, root `assembly`, and inline assembly objects)

## Risks and Mitigations

1. Shared scale conflicts across children:
   - detect early during resolution membership merge and throw explicit errors.
2. Async race conditions during dynamic insertion:
   - use per-assembly in-flight dedupe and await preflight before encoder init.
3. App/UI assumptions about a single default genome:
   - make callers assembly-aware or choose active axis genome explicitly.
4. Schema churn:
   - add support additively first, deprecate later.
5. Migration confusion:
   - warning message must include explicit before/after config snippets.

## Acceptance Criteria

1. `synteny.json` works with mixed assemblies.
2. A locus scale with `assembly: "hg38"` works without legacy root `genome`.
3. Root `genomes` map + root `assembly` default works as documented.
4. Legacy root `genome` works with a deprecation warning.
5. Inline anonymous `scale.assembly` contigs work (Phase 2).
6. Dynamically added views that introduce new assemblies initialize reliably.
7. No chromosome duplication on repeated genome loading.
8. Existing single-genome specs remain backward compatible during deprecation window.

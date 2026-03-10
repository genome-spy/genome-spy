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
3. `scale.assembly` can define inline contigs/chromosomes.
4. Define a cleaner path for multiple assemblies at `RootSpec` level.
5. Support async loading safely, including dynamically added views.

## Non-goals (for initial phase)

- Full redesign of all genome-related APIs.
- Async scale creation pipeline.
- Cross-view genome aliasing heuristics.

## Proposed Semantics

### A. Scale-level assembly source of truth

For `scale.type: "locus"`, support:

1. `assembly: "hg38"` (string name, built-in or root-registered)
2. `assembly: { ...GenomeConfig... }` (inline config, including `contigs` or `url`)

Notes:

- This keeps the current property name while enabling inline configs.
- For inline objects without an explicit `name`, generate a stable internal id
  (for example from a content hash) to avoid ambiguity.

### B. Root-level config optionality

Behavior:

1. If locus scale has explicit `assembly`, root `genome` is optional.
2. If locus scale omits `assembly`, use default root genome if exactly one exists.
3. If neither explicit assembly nor unique default exists, throw a clear error.

### C. Root-level multiple assemblies plan

Transitional model:

- Keep `genome` for compatibility.
- Add `genomes` as first-class multi-entry config.

Candidate shape:

```json
{
  "genomes": [
    { "name": "hg19" },
    { "name": "hg38" }
  ]
}
```

Longer-term cleanup:

- Deprecate `genome` in favor of `genomes` (single-entry arrays allowed).
- Improve naming/documentation since singular `genome` has become awkward.

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
3. Add `genomes` in root spec (optional, additive).
4. Update `synteny.json` to demonstrate the supported pattern.
5. Update docs to describe initial multi-assembly support.

### Phase 2: Inline `scale.assembly` objects

1. Extend type/schema to allow object-valued `assembly`.
2. Ensure inline configs are registered/loaded via `GenomeStore.ensure...`.
3. Add tests for inline contigs and URL configs.

### Phase 3: Root API cleanup

1. Document migration path from `genome` to `genomes`.
2. Introduce deprecation warnings and eventually simplify root schema.

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

Integration-style tests:

1. Dynamic child insertion introduces a new assembly and succeeds.
2. Visibility-based lazy initialization introduces a new assembly and succeeds.
3. Mixed-assembly shared-scale conflict fails with a clear error.

Regression tests:

1. Existing single-root-genome specs continue to work unchanged.
2. Existing locus scales without explicit assembly still work when one default
   genome is configured.

## Documentation Plan

1. Replace "single genome only" warning with staged support notes.
2. Document precedence rules:
   - explicit scale assembly
   - default root genome fallback
3. Add examples:
   - synteny with two built-ins
   - inline contigs in `scale.assembly`
4. Regenerate schema/docs artifacts after type updates.

## Commit Plan

Commit in small checkpoints to keep review focused:

1. `fix(core): resolve locus default domain using assembly-aware genome source`
2. `feat(core): add genome store ensure APIs and load dedupe`
3. `fix(core): reset genome chromosome structures before reloading chrom sizes`
4. `feat(core): support optional root genome when scale assembly is explicit`
5. `feat(core): add root genomes config and update synteny example`
6. `docs(core): document multi-assembly behavior and migration guidance`
7. `test(core): add multi-assembly and dynamic-view coverage`

If split across PRs:

- PR 1: correctness bug + tests (minimal behavior change)
- PR 2: async ensure + dynamic insertion plumbing
- PR 3: schema/docs/API cleanup (`genomes` and inline assembly objects)

## Risks and Mitigations

1. Shared scale conflicts across children:
   - detect early during resolution membership merge and throw explicit errors.
2. Async race conditions during dynamic insertion:
   - use per-assembly in-flight dedupe and await preflight before encoder init.
3. App/UI assumptions about a single default genome:
   - make callers assembly-aware or choose active axis genome explicitly.
4. Schema churn:
   - add support additively first, deprecate later.

## Acceptance Criteria

1. `synteny.json` works with mixed assemblies.
2. A locus scale with `assembly: "hg38"` works without root `genome`.
3. Inline `scale.assembly` contigs work (Phase 2).
4. Dynamically added views that introduce new assemblies initialize reliably.
5. No chromosome duplication on repeated genome loading.
6. Existing single-genome specs remain backward compatible.

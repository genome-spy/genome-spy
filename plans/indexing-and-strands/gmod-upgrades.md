# GMOD Dependency Upgrades

## Scope

This document covers the dependency and adapter-infrastructure portion of the
[Genomic Indexing and Strand Contracts](indexing-and-strands-plan.md)
proposal. It prepares the source layer for the public contracts in
[Source contracts](source-contracts.md).

The MB identifiers below refer to the merge-blocker register in the
[master plan](indexing-and-strands-plan.md#incremental-implementation-and-merge-blockers).
They may remain open during independent package work, but all must be closed
before merge.

Versions below were current on 2026-08-14. Recheck release notes and the npm
registry immediately before changing the lockfile, because several releases
are recent.

## Dependency inventory

### Core

| Package | Current declaration | Current lock resolution | Reviewed target |
| --- | --- | --- | --- |
| `@gmod/bam` | `^7.1.19` | `7.3.3` | `8.9.0` |
| `@gmod/bbi` | `^9.2.0` | `9.2.1` | `11.1.0` |
| `@gmod/bed` | `^2.1.10` | `2.2.6` | `2.2.10` |
| `@gmod/indexedfasta` | `^5.0.2` | `5.0.7` | `5.0.10` |
| `@gmod/tabix` | `3.2.2` | `3.2.2` | `3.8.1` |
| `@gmod/vcf` | `^7.0.0` | `7.0.9` | `7.2.0` |
| `gff-nostream` | `^3.0.2` | `3.0.11` | `5.2.1` |
| `generic-filehandle2` | `^2.0.18` | `2.2.0` | `2.3.1` |

### Embedded examples

`packages/embed-examples` currently declares `@gmod/indexedfasta ^2.0.4`,
which resolves to 2.1.1 and pulls the legacy `generic-filehandle`/BGZF stack.
Upgrade it to the same IndexedFASTA 5 line as Core, declare
`generic-filehandle2`, and remove the `buffer` dependency and global
`window.Buffer` shim from `src/dynamicFasta.js`.

### Direct-transitive dependency leak

`packages/core/src/data/sources/lazy/tabixSource.js` imports
`@gmod/bgzf-filehandle` directly even though Core does not declare it. The
import exists only to decompress a private file-handle prefix. Replace this
path with the current public Tabix header API. Do not add BGZF as a direct
dependency unless GenomeSpy deliberately adopts the new worker-pool API.

## Upgrade principles

- Upgrade adapter tests and public package APIs before changing user-visible
  record shapes where the package allows that separation. When an upgrade
  necessarily changes the adapter contract, as with `gff-nostream` 5, upgrade
  the package and adapter atomically.
- Use public GMOD methods and documented constructor options only.
- Preserve abort signals, debouncing, URL templates, index URL templates,
  descriptor-attached fields, file batch boundaries, and active-set readiness.
- Retain raw parser records until the explicit source-contract adapter step.
- Keep exact versus caret ranges consistent with repository policy. Initially
  keep Tabix exact at the reviewed version because its integration is sensitive
  to minor API changes; revisit only after the new adapter has stabilized.
- Review bundle output and browser compatibility after each major upgrade.

## Tabix compatibility design

### Removed `renameRefSeqs`

Current `addChrPrefix` is implemented by passing `renameRefSeqs` to
`TabixIndexedFile`. Modern Tabix removed that option after its implementation
ceased to participate in the current index path; see the
[upstream removal](https://github.com/GMOD/tabix-js/commit/85c5fad3a67fc82f7b94aa336a490eab9ac097ce).

Implement chromosome mapping in GenomeSpy instead:

1. Ask each initialized handle for its reference sequence names using the
   current public Tabix API.
2. Apply `addChrPrefix` to build an assembly-facing name for each raw file
   reference.
3. Build an immutable per-handle map from assembly-facing query name to raw
   file name.
4. Convert each discretized GenomeSpy interval to the raw name before calling
   `getLines()`.
5. Keep query-name translation separate from emitted record naming until the
   public `chrom` policy in MB-3 is resolved; retain raw VCF `CHROM` and do not
   guess generic TSV chromosome columns.
6. Fail clearly when two raw references map to the same assembly-facing name.

Do not add a fallback that retries arbitrary prefixed/unprefixed forms. The
initialized reference map is the source of truth and should make failures
deterministic.

Tests must cover:

- no prefix conversion;
- `addChrPrefix: true` (`1` -> `chr1`);
- a custom string prefix;
- an unknown visible assembly reference;
- a collision after normalization;
- multiple files whose raw reference naming differs;
- a reactive `addChrPrefix` change and handle reload.

**MB-3 resolution:** `addChrPrefix` is an idempotent query-only mapping. Each
handle maps the assembly query name to its raw indexed name, allowing bare and
already-prefixed files to load together. Loaded records retain file-native
reference names. Collisions within one file fail during initialization.

### Public header access

Use the current public Tabix header-lines/header API for VCF, GFF, and Tabix TSV
initialization. Remove `_readFilePrefix()`, the cast to the private `filehandle`,
manual BGZF decompression, and the undeclared direct-transitive import.

Verify both kinds of Tabix TSV headers already supported by GenomeSpy:

- a commented column line in the indexed header;
- a plain first row skipped according to the index metadata.

The latter must not be emitted as a data row.

### Callback interval metadata

Modern Tabix computes zero-based, half-open line intervals according to its
index format. Capture callback interval metadata only where the public API
guarantees it and only for format-aware adapters. Do not use it to rewrite
arbitrary generic Tabix TSV columns.

For VCF, compare callback intervals with the shared eager/lazy VCF interval
helper. A mismatch should fail a focused test instead of creating different
contracts between source modes.

Before using callback metadata at runtime, decide whether `TabixSource` carries
a typed `{ line, fileOffset, start, end }` record to format adapters or keeps
metadata only as a test oracle. Do not leave an implicit mix of strings and
record wrappers in the dataflow API. This decision is part of closing MB-1 for
the Tabix adapter.

### Duplicate chunks

Modern Tabix contains fixes for lines reachable through overlapping chunks.
Retain GenomeSpy's multi-window and multi-handle ordering checks, and add a
fixture proving that a physical line is published once when index chunks
overlap. Do not deduplicate by serialized row value because distinct equal rows
are valid data.

## BAM and BBI upgrades

### BAM

Keep the existing GenomeSpy record adapter in
`packages/core/src/data/sources/lazy/bamSource.js`. Verify the v8 constructor,
index selection, `getRecordsForRange()`, abort behavior, record-coordinate
methods, flags, tags, CIGAR, sequence, and quality values.

Modern BAM includes overlapping-chunk duplicate fixes. Prefer a small indexed
integration fixture that proves each physical record is published once without
applying value-based deduplication; use mocks only for behavior a fixture cannot
exercise.

### BBI

Upgrade BigWig and BigBed together. Verify:

- `getHeader()` and AutoSQL metadata;
- `getFeatures()` coordinates and abort signals;
- BigWig aggregation and multi-file merge ordering;
- BigBed fast parser creation and fallback parsing;
- descriptor field attachment and dynamic URL sets.

The BBI major upgrade removed legacy reference-renaming options, but GenomeSpy
does not currently pass them. Chromosome normalization remains a GenomeSpy
adapter responsibility where required.

Typed-array or multi-region performance APIs are not part of this migration.
The existing dataflow consumes objects; adopt a different representation only
after profiling and a separate design review.

## Cache and worker considerations

Modern BAM and Tabix use `@gmod/shared-read-cache`. GenomeSpy can show several
tracks and files simultaneously, so independent package defaults may multiply
memory retention.

During implementation:

1. Inspect the effective default budgets in the selected package versions.
2. Add a direct `@gmod/shared-read-cache` dependency only if GenomeSpy creates
   and passes a shared budget.
3. Prefer one bounded budget per view context or compatible worker context for
   BAM and Tabix caches that use the same byte-weight semantics.
4. Do not share budgets with BBI or other caches whose weights are not
   comparable.
5. Test disposal/reinitialization so stale handles do not retain cache owners.

**MB-6:** Before aggregate verification, choose one of two explicit outcomes:
(a) create and pass a bounded shared BAM/Tabix budget with a justified size and
lifecycle, declaring `@gmod/shared-read-cache` directly; or (b) retain package
budgets after measuring simultaneous tracks and express acceptance as a
documented measured bound. Do not assert compliance with an unspecified
“selected cache budget.”

The new BGZF worker pool is an optional performance follow-up. If adopted,
declare `@gmod/bgzf-filehandle` directly, share a bounded pool, verify worker
cleanup, and measure browser bundle/latency changes. It is not required merely
to complete the dependency upgrades.

## GFF and VCF package integration

### GFF

Upgrade directly to `gff-nostream` 5.2.1 and use `parseLines()` rather than
joining fetched lines. Review the
[upstream changelog](https://github.com/GMOD/gff-nostream/blob/main/CHANGELOG.md)
and pin the normalized hierarchy through tests described in
`source-contracts.md`.

Do not add compatibility shims that reconstruct the v3 hierarchy. This is an
intentional pre-1.0 break.

The dependency change and the GenomeSpy GFF adapter must be one coherent step:
v5 changes coordinates, strand representation, attributes, and hierarchy, so
it cannot be installed as a behavior-preserving dependency-only commit. Close
MB-5 as part of that step.

### VCF

Upgrade `@gmod/vcf` while first preserving the current materialized raw record
shape. Confirm parser construction, header handling, lazy sample
materialization, INFO array materialization, and breakend ALT preservation.
Only after that baseline passes should the shared canonical interval fields be
added.

The reviewed v7 parser exposes non-flag INFO values as arrays. The later
canonical interval step must close MB-2 rather than assuming scalar `END` or
`SVTYPE` values.

## Implementation plan

### 1. Record the dependency baseline

Outcome: current source behavior and package versions are captured before any
lockfile change.

Affected areas:

- `packages/core/package.json`
- `packages/embed-examples/package.json`
- lockfile inventory
- existing source tests

Verification:

- Run focused BED, BEDPE, VCF, BAM, BigBed, BigWig, Tabix, and Tabix TSV tests.
- Record package resolutions with `npm ls`.
- Record relevant bundle sizes and focused source line counts.

Documentation and migration: none.

Tentative commit: no commit; this is a verification checkpoint.

### 2. Upgrade independent Core package groups

Outcome: BED, BAM, BBI, and Core IndexedFASTA dependencies use the reviewed
versions while preserving their existing public record shapes.

Affected areas:

- `packages/core/package.json`
- root lockfile
- BED, BAM, BBI, and IndexedFASTA adapters and focused tests

Verification:

- Upgrade and verify each package group independently.
- Exercise BAM records, both BigBed parser paths, BigWig aggregation, aborts,
  and IndexedFASTA range semantics.
- Record dependency-tree and bundle-size changes against the baseline.

Documentation and migration: none unless an observable adapter behavior changes.

Tentative commits: package-scoped `build(core): update ...` commits.

### 3. Upgrade Tabix with its infrastructure adapter

Outcome: Tabix is upgraded to the reviewed version in the same commit in which
GenomeSpy adopts its public header/reference APIs, owns query-name mapping, and
removes the undeclared BGZF import. This closes MB-1 for Tabix.

Affected areas:

- `packages/core/src/data/sources/lazy/tabixSource.js`
- `packages/core/src/data/sources/lazy/tabixSource.test.js`
- `packages/core/src/data/sources/lazy/tabixTsvSource.js`
- VCF/GFF lazy parser initialization tests
- `packages/core/package.json` and the root lockfile

Verification:

- All mapping/header/collision tests listed above pass.
- Existing multi-file, reactive descriptor, failure, abort, and batch tests
  remain green.

Documentation and migration: update `addChrPrefix` only if its documented
observable behavior becomes more precise.

Tentative commit: `refactor(core): modernize Tabix source integration`

### 4. Upgrade VCF while preserving raw records

Outcome: `@gmod/vcf` uses the reviewed version and eager/lazy parsing preserves
the intentionally raw record materialization. Canonical fields may follow in a
separate source-contract commit after MB-2 is resolved.

Affected areas:

- `packages/core/package.json`
- root lockfile
- eager and lazy VCF adapters, headers, and tests

Verification:

- Parser construction, headers, samples, array-valued INFO fields, ALT/breakend
  strings, and all other raw fields are pinned by focused tests.
- No canonical-field algorithm is introduced until MB-2 closes.

Documentation and migration: none for the raw-preserving upgrade.

Tentative commit: `build(core): update GMOD VCF parser`

### 5. Upgrade GFF with its v1 adapter

Outcome: `gff-nostream` 5 and the GFF source adapter land together with the
normalized public record contract. This closes MB-1 and MB-5 for GFF.

Affected areas and verification are shared with
[the GFF source contract](source-contracts.md#gff3-contract).

Documentation and migration: record the public hierarchy, coordinate, strand,
attribute, and collision changes with the adapter.

Tentative commit: `feat(core)!: migrate GFF3 records to the v1 contract`

### 6. Modernize the embedded FASTA example

Outcome: the example uses IndexedFASTA 5 and `generic-filehandle2` without a
global Buffer shim.

Affected areas:

- `packages/embed-examples/package.json`
- `packages/embed-examples/src/dynamicFasta.js`
- root lockfile

Verification:

- `npm --workspace @genome-spy/embed-examples run build:smoke`
- The dynamic FASTA example retrieves and renders sequence in a browser smoke
  test.
- `npm ls generic-filehandle buffer @gmod/indexedfasta` confirms the legacy
  direct stack is gone from this workspace.

Documentation and migration: none; this is an internal example integration.

Tentative commit: `build(embed-examples): update IndexedFASTA integration`

### 7. Verify aggregate behavior

Outcome: dependency upgrades introduce no unreviewed performance, bundle, or
source-lifecycle regression.

Verification:

- Full unit tests, TypeScript checks, and lint pass.
- Core and application builds pass.
- Browser smoke tests load BAM, BigWig, BigBed, Tabix TSV, VCF, GFF3, and
  IndexedFASTA tracks.
- Close MB-6 by verifying the selected shared-budget or measured-default cache
  policy with multiple simultaneous lazy tracks.
- Aborted and replaced requests do not publish stale data.
- Compare dependency tree, bundle sizes, source line counts, and diff stats to
  the baseline.

Documentation and migration: record only user-visible changes in release and
migration notes.

Tentative commit: `test(core): cover upgraded genomic data adapters`

## Risks and mitigations

- **Very recent releases:** recheck changelogs and use a reviewed lockfile;
  avoid combining future unreviewed updates with contract debugging.
- **Silent reference mismatch:** build mappings from actual indexed reference
  names and fail on collisions/unknown names.
- **Private API regression:** remove private file-handle access before or with
  the Tabix upgrade.
- **Memory growth:** inspect and bound shared cache defaults across concurrent
  tracks.
- **Bundle/runtime incompatibility:** build both minimal and full bundles and
  exercise browser examples, not only Node tests.
- **Parser-path drift:** assert common public output after BigBed fast and
  fallback parsing.
- **Intentional versus accidental breaks:** land dependency compatibility before
  strand/VCF output changes where practical, while keeping the inseparable GFF
  package and adapter changes atomic.

## Acceptance criteria

- All direct package versions match the reviewed targets or a newer explicitly
  reviewed replacement documented in the implementation PR.
- No workspace relies on legacy `generic-filehandle` or a global Buffer shim
  for IndexedFASTA.
- Core has no direct import from an undeclared transitive GMOD package.
- Tabix header and reference discovery use supported public APIs.
- `addChrPrefix` has deterministic tested behavior without `renameRefSeqs`.
- BAM, BBI, Tabix, VCF, GFF, BED, and IndexedFASTA focused tests pass on the
  selected versions.
- Multi-file loading, dynamic descriptors, aborts, readiness, and file batch
  boundaries remain correct.
- The selected cache ownership/budget policy is documented and verified with
  simultaneous lazy tracks.
- Full verification and representative browser smoke checks pass.
- MB-1, MB-3, and MB-6 are closed before merge; MB-2 and MB-5 are closed in the
  corresponding source-contract steps.

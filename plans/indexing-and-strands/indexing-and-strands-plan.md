# Genomic Indexing and Strand Contracts

## Summary

For GenomeSpy 2.0, standardize the genomic records emitted by built-in data
sources. GenomeSpy-owned interval fields use zero-based, half-open coordinates,
and GenomeSpy-owned strand fields use `"+"`, `"-"`, or `null`. Known formats
are normalized at the data-source boundary. Generic or custom data remains
unchanged and must be normalized explicitly near the start of the user-authored
dataflow.

The work also upgrades all GMOD dependencies, migrates GFF3 to
`gff-nostream` 5, adds canonical primary intervals to VCF records without
modifying raw VCF fields, removes indexing correction from locus encodings and
`linearizeGenomicCoordinate`, and updates the user-facing documentation and
examples.

This proposal addresses:

- [GenomeSpy issue #459: Standardize the representation of strand](https://github.com/genome-spy/genome-spy/issues/459)
- [GenomeSpy issue #460: Migrate the GFF3 source to gff-nostream v5](https://github.com/genome-spy/genome-spy/issues/460)
- all direct GMOD dependencies in Core and the older IndexedFASTA integration
  in `packages/embed-examples`

The detailed designs are split into:

- [Source contracts](source-contracts.md): indexing, strands, GFF3, VCF,
  explicit user normalization, examples, and documentation.
- [GMOD upgrades](gmod-upgrades.md): package versions, Tabix compatibility,
  reference-name mapping, headers, caches, and the embedded FASTA cleanup.

## Problem

GenomeSpy currently exposes a mixture of parser-native and GenomeSpy-native
representations:

- BAM strands are strings, eager BED and BEDPE strands are numbers, GFF v5
  strands are numbers, and BigBed can vary by parser path.
- GFF v3 exposes one-based closed coordinates and a legacy nested hierarchy.
- VCF exposes raw one-based `POS` and has no canonical GenomeSpy interval.
- `offset` in a `chrom`/`pos` encoding adjusts only the implicit linearization
  inserted after user transforms. Earlier formulas, filters, lookups, pileups,
  and window transforms continue to see the unadjusted coordinate.
- The explicit `linearizeGenomicCoordinate` transform repeats the same indexing
  escape hatch even though indexing normalization should be a separate,
  visible dataflow operation.
- Current GMOD versions span several generations. A direct upgrade is unsafe
  because modern Tabix removed `renameRefSeqs`, which currently backs
  `addChrPrefix`.

These inconsistencies make specifications dependent on file formats, parser
versions, and where a field is accessed in the dataflow.

## Goals

- Define one public interval-semantics contract for built-in genomic source
  adapters: documented interval fields are zero-based and half-open. Preserve
  established format-specific field names unless a source explicitly adds
  canonical fields.
- Define one public strand contract: `"+"`, `"-"`, or `null`.
- Normalize known formats at ingestion, before user transforms.
- Keep arbitrary/custom data correction explicit in the authored dataflow.
- Preserve raw VCF fields while adding a clearly bounded canonical primary
  record interval.
- Adopt the current GFF object hierarchy and eliminate duplicate feature
  attachment caused by the legacy representation.
- Remove indexing correction from locus encodings and coordinate linearization.
- Upgrade all direct GMOD packages without regressing lazy loading, chromosome
  naming, multi-file sources, cancellation, or memory use.
- Publish migration guidance for 2.0 and make documentation changes part of
  the acceptance criteria.

## Non-goals

- Inferring or rewriting arbitrary coordinate-bearing VCF `INFO`, `FORMAT`,
  sample, annotation, or breakend fields.
- Inferring coordinate systems for generic CSV, TSV, JSON, or Tabix TSV data.
- Changing display-only axis numbering through `scale.numberingOffset`.
- Changing visual pixel offsets such as `xOffset`, `yOffset`, mark offsets,
  axis offsets, or stack offsets.
- Introducing renderer-specific handling for strand or indexing.
- Providing a universal variant normalization or decomposition system.
- Migrating downstream specifications outside this repository, or mechanically
  rewriting raw or vendored example data that already has valid format-native
  semantics.

## Key decisions

### Source-boundary normalization

Known adapters own the conversion from format semantics to GenomeSpy fields.
All downstream transforms and encodings can therefore rely on the same values.
Generic sources do not guess: users add explicit formula or project transforms
before any transform that consumes the coordinates.

### Canonical fields do not erase raw format data

When a format has valuable raw fields, canonical GenomeSpy fields are added
alongside them. VCF is the important example: `CHROM`, `POS`, `ALT`, `INFO`,
`FORMAT`, and samples retain VCF semantics, while `chrom`, `start`, and `end`
describe only the primary record interval.

### Deprecate, then remove indexing offsets

Mark `ChromPosDefBase.offset` and
`LinearizeGenomicCoordinateParams.offset` deprecated during 1.x if a release can
provide a useful migration window. Retain their behavior throughout that
window. The final 2.0 state removes both properties and their implementation.
If no 1.x release will expose the warning, remove them directly in 2.0 and
retain the same migration documentation.

The `linearizeGenomicCoordinate` transform itself remains supported; it maps an
already-normalized chromosome/position pair into a continuous genome-wide
coordinate.

### Symbolic public strands

Use `"+"` and `"-"` because strands are user-facing nominal categories in
tooltips, legends, expressions, exports, and authored specifications. Use
`null` for unstranded or unknown values. Parser-native numeric values are
normalized once during ingestion.

## Incremental implementation and merge blockers

Implementation may proceed as a sequence of independently reviewable commits.
A merge blocker does not have to be resolved before unrelated earlier work
starts. However, the branch must not merge until every blocker below has an
explicit decision, implementation where applicable, and passing verification.
Dependency upgrades that require adapter changes must remain atomic enough that
each committed state builds and passes its focused tests.

| ID | Status | Finding that must be resolved before merge | Earliest work it blocks |
| --- | --- | --- | --- |
| MB-1 | **RESOLVED** | Tabix 3.8.1 landed with its public-API adapter, and `gff-nostream` 5.2.1 landed with the v2 GFF adapter. | — |
| MB-2 | **OPEN — MERGE BLOCKER** | Define the exact VCF primary-interval algorithm for current `@gmod/vcf` array-valued INFO fields and Tabix's translocation handling, including malformed `END`/`REF` behavior. | Canonical VCF fields |
| MB-3 | **RESOLVED** | Emitted `chrom` preserves the file reference name. `addChrPrefix` is an idempotent, query-only per-file mapping and does not rewrite loaded rows. | — |
| MB-4 | **RESOLVED** | The contract standardizes zero-based, half-open semantics while retaining documented format-specific fields such as BED `chromStart/chromEnd` and BEDPE's two intervals. | — |
| MB-5 | **RESOLVED** | The GFF adapter reserves `chrom`, moves a colliding attribute to the next free `chromN` field, preserves shared identity across parents, and deduplicates attachment within each parent/path. | — |
| MB-6 | **RESOLVED** | BAM and Tabix share one internal 1 GiB decompressed-byte retention budget. Their idle eviction remains enabled, source disposal clears caches, and tests verify shared ownership and cleanup. | — |
| MB-7 | **RESOLVED** | Static contract checks and browser verification cover all 215 JSON specifications under `examples/`: 209 Core/Docs specs through `npm run smoke:examples` and six App specs through the App development route. Only the affected GFF3 example required migration. | — |
| MB-8 | **OPEN — MERGE BLOCKER** | The migration guide now lives at `docs/migration/v2-genomic-data.md` and is in site navigation. Complete public output typings, decide the actual offset deprecation/removal path, add the deferred VCF migration, and use durable release-specific upstream references. | Final schema and documentation acceptance |

The focused plans record the evidence and verification needed to close these
blockers. Resolving a blocker may refine the corresponding implementation step
without forcing all other work to wait.

## Comparable behavior and provenance

The coordinate contract follows the established UCSC distinction between
zero-based half-open storage and one-based closed display notation; see the
[UCSC coordinate-counting guide](https://genome-blog.gi.ucsc.edu/blog/2016/12/12/the-ucsc-genome-browser-coordinate-counting-systems/).
Modern GMOD BAM, BBI, IndexedFASTA, Tabix, and GFF APIs likewise operate on or
emit zero-based half-open intervals. The GFF hierarchy follows the public
[`gff-nostream` object format](https://github.com/GMOD/gff-nostream/blob/main/README.md).
VCF raw-field preservation follows the
[VCF 4.5 specification](https://samtools.github.io/hts-specs/VCFv4.5.pdf),
which permits extensible `INFO` and `FORMAT` content and embeds remote breakend
locations in allele strings.

The proposal adopts documented data semantics only. It does not copy code from
UCSC, GMOD, samtools/hts-specs, JBrowse, or other projects. The GMOD packages
used by GenomeSpy are MIT-licensed and compatible with GenomeSpy's MIT license.

## Implementation sequence

### 1. Establish the baseline and upgrade GMOD in coherent groups

Outcome: the baseline is recorded and all required GMOD packages are upgraded
incrementally. Low-risk packages may land independently. Tabix lands with its
public-API adapter changes, and GFF lands with its required record adapter, as
specified in [GMOD upgrades](gmod-upgrades.md).

Affected areas and detailed verification are in [GMOD upgrades](gmod-upgrades.md).

Documentation and migration: document any observable `addChrPrefix` behavior.
Package groups that preserve the public record shape introduce no coordinate
contract changes; GFF's package and intentional contract migration land
together in step 3.

Tentative commits: use the package-group commits specified in
[GMOD upgrades](gmod-upgrades.md#implementation-plan).

### 2. Standardize source strands

Outcome: BED, BEDPE, BigBed, and BAM expose only `"+"`, `"-"`, or `null` in
GenomeSpy-owned strand fields. The shared rule is applied to GFF when its v5
adapter lands in step 3.

Affected areas:

- `packages/core/src/data/formats/bed.js`
- `packages/core/src/data/formats/bedpe.js`
- `packages/core/src/data/sources/lazy/bigBedSource.js`
- `packages/core/src/data/sources/lazy/bamSource.js`
- a shared source-boundary strand normalizer and adjacent tests

Verification:

- Test forward, reverse, unknown, and missing strands.
- Exercise both BigBed parser paths and prove identical output.
- Confirm numeric parser values never reach the public rows.

Documentation and migration: update eager/lazy source field tables, examples,
and the issue #459 migration note.

Tentative commit: `fix(core)!: standardize genomic strand values`

### 3. Migrate GFF3 to the canonical source contract

Outcome: GFF3 uses `gff-nostream` 5 and emits normalized intervals, symbolic
strands, flattened attributes, and direct `subfeatures` without accidental
duplicate attachment to the same parent/path.

Affected areas and detailed verification are in
[Source contracts](source-contracts.md#gff3-contract).

Documentation and migration: replace the legacy GFF object-format description,
simplify the GENCODE example, and publish an old-to-new field mapping.

Tentative commit: `feat(core)!: migrate GFF3 records to the v2 contract`

### 4. Add the bounded VCF primary interval

Outcome: eager and lazy VCF records retain their raw fields and additionally
expose canonical `chrom`, `start`, and `end` for the local primary interval.

Affected areas and detailed verification are in
[Source contracts](source-contracts.md#vcf-contract).

Documentation and migration: update ClinVar and structural-variant examples;
state explicitly that arbitrary VCF payload coordinates remain raw.

Tentative commit: `feat(core)!: expose canonical VCF record intervals`

### 5. Retire indexing offsets

Outcome: locus encodings and `linearizeGenomicCoordinate` accept already
normalized coordinates and no longer perform indexing correction.

Affected areas:

- `packages/core/src/spec/channel.d.ts`
- `packages/core/src/spec/transform.d.ts`
- `packages/core/src/view/flowBuilder.js`
- `packages/core/src/data/transforms/linearizeGenomicCoordinate.js`
- schema, transform, encoding, and layout tests

Verification:

- Schema/types reject the removed properties in the final state.
- Implicit and explicit linearization agree for normalized inputs.
- An explicit correction placed before a filter/pileup affects every downstream
  consumer, not only rendering.
- Unrelated display and pixel offsets remain accepted.

Documentation and migration: replace all indexing-offset examples with source
normalization or explicit early formulas. Clarify that `numberingOffset` changes
labels, not data.

Tentative commit: `refactor(core)!: remove genomic indexing offsets`

### 6. Complete docs, examples, and end-to-end verification

Outcome: the repository teaches only the v2 contracts, migration guidance is
complete, and every existing example has been audited and works correctly.

Affected areas:

- `docs/grammar/genomic-coordinates.md`
- `docs/grammar/transform/linearize-genomic-coordinate.md`
- `docs/grammar/data/eager.md`
- `docs/grammar/data/lazy.md`
- all specifications under `examples/` and only the supporting code or assets
  that are actually affected, including GFF3, ClinVar, HCC1954 SV/CNV, and
  ASCAT documentation examples
- generated schemas and snapshots

Verification:

- Focused source/transform tests pass after every step.
- `npm test`
- `npm --workspaces run test:tsc --if-present`
- `npm run lint`
- `npm run build && npm run build:docs` when schema-derived docs change.
- Run `npm run smoke:examples` in addition to focused browser smoke checks
  for GFF, VCF, BAM, BigBed, and IndexedFASTA. The offline initialization suite
  alone is insufficient because it skips specifications with absolute HTTP
  data URLs.
- A repository-wide audit confirms that every specification under `examples/`
  has been checked and works correctly. Only affected specifications are
  migrated: no affected example retains genomic indexing correction in locus
  encodings or `linearizeGenomicCoordinate`, and its coordinate, strand, GFF,
  and VCF field references use the v2 contracts.
- Compare focused line counts and `git diff --stat` before and after; the
  offset and legacy GFF paths should become smaller.

Documentation and migration: this step is the documentation deliverable.

Tentative commit: `docs(core): document v2 genomic data contracts`

## Alternatives considered

### Keep per-encoding indexing offsets

Rejected because the correction is applied after user transforms and creates
different meanings for the same field depending on its consumer.

### Normalize arbitrary generic fields automatically

Rejected because field names do not reliably identify coordinate semantics,
indexing, interval closure, or assembly. Silent guesses would corrupt data.

### Convert every coordinate found in a VCF record

Rejected because VCF extension fields are open-ended. Some values are absolute
positions, some are relative offsets, some use transcript/protein coordinate
systems, and breakend mates are embedded in allele strings.

### Leave VCF entirely raw

Rejected because the standard primary interval is sufficiently well defined,
lazy indexing already depends on it, and forcing every ordinary VCF
visualization to repeat `POS - 1` would make VCF an avoidable exception. Raw
fields remain available for full fidelity.

### Normalize strands in renderers

Rejected because transforms, expressions, tooltips, exports, and external
consumers would still receive inconsistent values.

## Risks

- Major-version GMOD upgrades may change constructor options, returned object
  shapes, cache behavior, or bundler assumptions. Mitigate with coherent
  package/adapter groups and focused tests at each increment.
- `addChrPrefix` may silently stop matching files if reference-name mapping is
  incomplete. Test query names and the emitted name policy selected in MB-3.
- A GFF hierarchy regression may duplicate marks. Test object identity/counts
  per parent/path and a representative rendered feature count.
- VCF interval rules may be overgeneralized. Limit the contract to the local
  primary interval and retain every raw field unchanged.
- Downstream specifications may rely on numeric strands or offsets. Provide
  concise migration examples and make schema failures direct.
- Fresh GMOD releases may introduce aggregate cache growth across several
  tracks. Share or bound caches where supported and test multi-source loading.

## Questions permitted during incremental work

- Will a public prerelease exist between deprecation and removal of indexing
  offsets? If not, implement direct removal with migration documentation.
  This closes MB-8 and must be decided before the offset/schema step completes.
- Should the shared BAM/Tabix cache budget be configurable through public Core
  configuration in the first change, or remain a documented internal default?
  The initial implementation should keep this internal unless a concrete user
  need requires a new API. This closes MB-6 during aggregate verification.
- Should normalized breakend mate fields be added later? They are deliberately
  excluded from the primary VCF contract and would require a separate,
  format-aware proposal.

## Acceptance criteria

- Every direct GMOD dependency and the embedded IndexedFASTA dependency is on
  the reviewed current release set recorded in `gmod-upgrades.md`.
- Built-in interval sources document and emit zero-based, half-open values in
  their public interval fields, including format-specific field names.
- BED, BEDPE, BigBed, BAM, and GFF expose symbolic/null strands consistently.
- GFF3 exposes the documented v2 hierarchy, preserves valid multi-parent
  relationships, and does not attach a feature more than once to the same
  parent/path.
- Eager and lazy VCF expose identical canonical primary interval semantics and
  preserve raw VCF content.
- Generic data sources perform no inferred indexing conversion; documentation
  demonstrates an explicit early dataflow correction.
- Locus encodings and `linearizeGenomicCoordinate` contain no final-state
  indexing `offset` option.
- `scale.numberingOffset` and unrelated visual offsets are unchanged.
- `addChrPrefix`, multi-file lazy loading, abort handling, and header parsing
  work with the upgraded Tabix package.
- Every existing specification under `examples/` is audited and verified to
  work with the v2 contracts. Only affected specifications and supporting code
  or assets are changed, and no affected example retains a deprecated
  compatibility path.
- User-facing source, coordinate, transform, and migration documentation is
  complete and all embedded examples use the new contracts.
- Focused tests, full tests, TypeScript checks, lint, builds, docs generation,
  focused browser checks, and the all-example smoke path pass.
- Every MB-1 through MB-8 merge blocker is closed and its resolution is visible
  in the implementation diff, tests, or final documentation as applicable.

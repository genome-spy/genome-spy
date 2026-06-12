# Multi-URL Data Source Plan

## Rationale

GenomeSpy already supported eager data sources with URL arrays. `UrlSource`
loaded files in parallel and treated them as one logical dataset, emitting a
file batch for each URL. Lazy sources, such as BigWig, originally accepted one
URL and reloaded data as the viewed genomic interval changed.

SampleView repeats the same visualization for samples in the current sample
hierarchy. This works well when data are eager and already contain a sample
field. It is less suitable for signal data stored in one file per sample, one
file per patient, or one file per cohort partition. Loading all possible files
is infeasible for large cohorts, but loading a bounded set of resolved files is
useful for focused analysis.

The goal of this branch is to add a generic multi-URL mechanism that works for
lazy and eager sources without introducing App-specific concepts into Core.
SampleView publishes generic reactive values, such as visible sample
identifiers. Core data sources consume ordinary URL specifications and attach
ordinary data fields to loaded rows.

## First-Version Scope

The first version focuses on a generic URL expansion primitive:

- keep existing single-URL behavior unchanged
- keep eager URL array behavior aligned with `UrlSource`
- support template-based URL expansion from a static array or ExprRef value
- deduplicate expanded URLs before loading
- support an optional maximum URL count
- attach configured fields to loaded rows
- keep SampleView, sample metadata, and SampleHierarchy concepts out of Core

The first version intentionally does not support object-valued templates,
patient-level file grouping, multi-sample VCF row expansion, or advanced load
gates. The schema should leave room for those use cases later.

## URL Expansion Model

URL specifications are normalized into descriptors. A descriptor contains the
primary data URL, optionally an index URL, and optionally a set of fields to
attach to every datum loaded from that file.

The optional index URL applies to formats with a separate index file, such as
BAM, Tabix-backed TSV/GFF3/VCF, and indexed FASTA. Public specs keep `indexUrl`
as a sibling of `url`, matching the existing `TabixData`, `BamData`, and
`IndexedFastaData` shape. Internally, normalization can still produce one
descriptor per data/index URL pair.

Template URL configuration is deliberately scalar in the first version. The
template has a placeholder field, values from either a static array or ExprRef,
and an optional `maxUrls`. Each scalar value substitutes the placeholder and is
also attached as a row field. For example, a per-sample BigWig template can load
only the samples exposed by `visibleSamples` and tag each returned BigWig row
with its sample identifier.

Deduplication happens after template substitution. This means future
partitioned-file workflows, such as many samples mapping to one patient or
cancer-type file, should not need a separate `distinct` schema concept.

## Example Use Cases

Per-sample BigWig signal:

- ATAC-seq, ChIP-seq, CUT&Tag, RNA coverage, methylation signal, or similar
  per-sample genomic signal files.
- The source loads a bounded set of files and publishes rows tagged with a
  sample identifier.

Eager per-sample tabular files:

- Segment, mutation, peak, or assay summary files split by sample.
- Parsed rows receive configured descriptor fields unless those fields already
  exist with conflicting values.

Per-cancer variant files:

- A cohort may initially show all cancers, but variant files are only loaded
  when the current visible sample set resolves to one cancer partition.
- This remains future work because it needs object-valued template values or a
  richer reactive value than `visibleSamples`.

Per-patient variant files:

- Some cohorts store one VCF or TSV file per patient, with data for all samples
  from that patient.
- File identity differs from sample identity, so loaded rows may need sample
  identifiers from the file contents or a later parser/transform.

## SampleView Integration

SampleView publishes a reactive parameter derived from `SampleHierarchy`, not
from closeup or viewport layout state. The current implementation exposes
`visibleSamples` as the ordered sample identifiers that survive the current
sample hierarchy state.

The value intentionally does not depend on closeup scrolling or row viewport
visibility. Those layout states are too volatile for dataflow semantics.

Future versions may publish richer values such as visible sample metadata
objects. Core should treat those as generic expression values and should not
depend on SampleView classes, metadata sources, or application state.

One subtle point remains: sorting the `SampleHierarchy` can notify listeners
even if the set of samples is unchanged. That decision is better handled by the
expression/observer side than by making SampleView suppress every order-only
change. URL normalization deduplicates resolved URLs, but reload churn may still
need attention if ordering changes frequently.

## Dataflow Behavior

Sources normalize URL specifications before loading:

1. Evaluate ExprRefs after parameter propagation.
2. Expand primary and sibling index URL templates using static or reactive
   values.
3. Deduplicate by resolved primary URL and associated index URL.
4. Enforce `maxUrls` if configured.
5. Resolve primary and index URLs against `baseUrl`.
6. Load files with source-appropriate parallelism.
7. Attach descriptor fields to propagated rows.
8. Emit file batches for file boundaries when the source already has that
   concept.

For lazy sources, URL changes and domain changes are both reload triggers.
Existing readiness checks should continue to describe whether the lazy source
has loaded data for the requested domain. Multi-file readiness should require
the active resolved URL set to match the loaded URL set.

## Dataflow Considerations

Rows should be tagged before they reach downstream collectors. Unit-view
collectors derive facet batches from `view.getFacetFields()`, so attaching
fields such as a sample identifier is sufficient for SampleView faceting. The
source does not need to expose sample identity only through file batches.

File batches should remain file-boundary metadata. `UrlSource` emits a file
batch before each file, but collectors do not use file batches for faceting.
Multi-URL sources should keep using row fields for data identity.

Lazy reloads currently reset and complete the whole source branch. A multi-URL
lazy source should publish a complete snapshot for all active resolved URLs
together, after all descriptor loads for the current request have finished.
Publishing one file at a time would make downstream collectors appear complete
with partial data unless the dataflow gains an explicit incremental protocol.

Interleaving multi-file loading with upstream propagation could reduce latency
in the future, especially when many files are requested. Rows from early files
could flow through transforms while later files are still downloading, then the
collector would complete once the full request is done. The current architecture
does not support this cleanly: lazy sources generally await their async loads,
then reset, propagate, and complete as one snapshot. Rendering still waits for
collector completion because collectors expose completed snapshots and GPU
buffers are filled only after the collector has completed.

Request cancellation must be descriptor-aware. When the x-domain or resolved URL
set changes, stale file requests should be aborted and their results ignored.
The collector should only receive rows from the latest request generation.

Descriptor fields should be attached by creating fresh row objects or by cloning
parser output. Sources should avoid mutating library-owned feature objects that
may be reused or shared.

Data source identifiers must include the normalized URL configuration and the
expression text, not the current evaluated values. Runtime optimization should
not merge two sources whose reactive URL expressions are scoped differently.

Over-limit or unresolved URL states should reset and complete the branch with
empty data, plus an informative loading status. This prevents stale data from
remaining visible when a filter broadens beyond `maxUrls`.

## Lazy Source Compatibility

The multi-URL idea is compatible with lazy sources that load an indexed remote
file for the current genomic interval. Compatibility is strongest when each file
can be queried independently and the returned rows can be tagged with descriptor
fields before propagation.

Strong initial candidates:

- `bigwig`: Good first target. BigWig rows do not normally contain sample or
  partition identity, so descriptor fields are directly useful.
- `bigbed`: Good candidate as a single-file indexed interval source. The branch
  currently keeps BigBed single-file only, but it now uses the same single-URL
  descriptor normalization path.
- `tabix`: Good target for TSV-like interval data. The base Tabix source now
  handles primary/index descriptor pairs.
- `gff3`: Compatible through the Tabix base class. It is less important for
  SampleView signal use cases, but the mechanics are the same.

Compatible with additional design:

- `vcf`: Compatible through the Tabix base class, but multi-sample VCFs may need
  extra row shaping. URL expansion can decide which files to load; a parser or
  transform may still be needed to expand genotype columns into sample-faceted
  rows.
- `bam`: Compatible in principle. BAM has both data and index URLs, but
  header-derived reference-name handling is currently per source instance and
  would need to become per file descriptor.
- `indexedFasta`: Technically compatible but a lower-priority fit. FASTA is
  usually reference data, not sample-faceted cohort data.

Not relevant:

- `axisTicks` and `axisGenome`: generated from scale/genome state, not remote
  URL-backed sources.
- `mockLazy`: test-only source.

## Implementation History

The branch implemented the initial multi-URL path in small commits:

1. Added schema types for URL descriptors, URL templates, index URL templates,
   single URL refs, and multi URL refs.
2. Added `urlDescriptor.js` as the shared normalization layer for strings,
   arrays, descriptors, templates, ExprRefs, index URL templates, deduplication,
   and `maxUrls`.
3. Added nested expression watching for URL template values.
4. Updated eager `UrlSource` to consume descriptors, preserve URL array
   behavior, emit file batches, and attach descriptor fields to parsed rows.
5. Updated BigWig to load multiple descriptors, tag rows, and make readiness
   depend on the active descriptor signature.
6. Updated Tabix to load multiple descriptor/index pairs and attach descriptor
   fields to parsed rows.
7. Added SampleView `visibleSamples` as a reactive parameter derived from
   `SampleHierarchy`.
8. Added tests for URL normalization, eager URL field attachment, BigWig
   descriptor loading, Tabix index expansion, SampleView visible samples, and
   SampleView lazy readiness.
9. Tightened JSDoc and refactored repeated source initialization code.
10. Split source reference types so single-file sources do not advertise
    multi-file behavior in the schema.

The implementation is intentionally conservative. BigWig and Tabix are the
multi-file lazy targets. BigBed, BAM, and indexed FASTA now use the shared
single-URL normalization path, but they do not yet support multiple descriptors.

## Remaining Work

The main feature path is implemented, but a few items remain before this should
be considered production-ready:

- Run `npm run build` and `npm run build:docs` after the latest `data.d.ts`
  changes. Commit generated schema/docs artifacts if the build updates them.
- Manually verify over-limit behavior in an App-like flow. The intended behavior
  is to clear stale data and report a clear loading/error status when `maxUrls`
  is exceeded.
- Review ordering and reload churn when `visibleSamples` changes order but not
  membership. URL deduplication prevents duplicate loads, but order-only changes
  may still trigger unnecessary reloads.
- Confirm source identifiers are sufficiently stable for scoped reactive URL
  expressions and do not accidentally merge unrelated dataflow branches.
- Exercise the feature with a real local BigWig dataset, such as the
  `private/ENCODE-ATAC` handoff dataset.
- Decide whether BigBed should also support multiple descriptors in the first
  public release. It is mechanically similar to BigWig, but it was not required
  for the initial SampleView signal workflow.

Future extensions:

- Object-valued template values, such as visible sample metadata objects.
- Patient-level and cancer-level partitioned files.
- Multi-sample VCF row expansion.
- BAM and indexed FASTA multi-descriptor support.
- Incremental propagation between source loading and collector completion.

## Open Questions

- Should descriptor fields override existing row fields, or should conflicts
  always fail fast? The current direction is fail-fast on conflicting values.
- Should `maxUrls` live only inside the template object, or should there also be
  a source-level limit?
- Should over-limit behavior be represented as an error status, a warning-like
  empty state, or a dedicated load-gated state?
- Should `indexUrl` accept only a string/template, or should it eventually
  support full descriptor-like objects too?
- Should an `indexUrl` template always inherit `url.values` and `url.field`, or
  should it be allowed to define its own values?
- Should plain URL arrays remain unannotated, or should descriptor objects be
  required whenever fields are attached?
- How should multi-sample VCF genotype columns be expanded into sample-faceted
  rows?

## Market Fit

The feature is not mainly about showing hundreds of signal tracks. Its value is
the transition from cohort-level findings to detailed patient or sample evidence:
cohort overview, filter/group/sort, resolve relevant files, inspect locus.

Existing genome browsers are strong at locus-level inspection, and cohort
portals are strong at matrix-level summaries. The gap is the interactive handoff
between the two. Researchers often identify a subgroup in one tool, then
manually move sample IDs and loci into another tool for detailed inspection.
Multi-URL sources make that handoff part of the visualization state.

Best research-oriented use cases:

- Structural variant or copy-number event effects on RNA coverage, exon usage,
  and nearby gene expression.
- Subgroup-specific ATAC-seq, ChIP-seq, or CUT&Tag signal at regulatory regions.
- Matched primary/relapse or pre/post-treatment signal changes within patients.
- Patient-level or cancer-type-level variant files loaded only after the cohort
  is narrowed enough to make the detailed view meaningful.
- Outlier validation, where a cohort-level association is checked against raw or
  high-resolution signal in the top or selected samples.
- Pseudobulk single-cell signal tracks for selected cell types, conditions, or
  clusters.

The likely audience is high-touch exploratory research: cancer genomics,
translational genomics, regulatory genomics, and multi-omics teams with curated
per-sample or per-patient files. For these users, the workflow saves time and
reduces context switching rather than replacing standard statistical analysis.

From a product point of view, the differentiator is cohort-state-driven lazy
loading. The same filtering, grouping, sorting, and provenance state that
defines the cohort overview also defines which detailed files are fetched. This
positions GenomeSpy between cohort portals and genome browsers: more analytical
than a track browser, but closer to raw genomic evidence than matrix-only
dashboards.

Adoption depends on keeping configuration simple. A regular URL template driven
by `visibleSamples` is understandable to data providers, while `maxUrls`
prevents accidental broad loading. More complex partitioned-file workflows can
be added later without changing the core value proposition.

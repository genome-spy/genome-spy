# Multi-URL Data Source Plan

## Rationale

GenomeSpy currently supports eager data sources with `url` arrays. `UrlSource`
loads the files in parallel and treats them as one logical dataset, emitting a
file batch for each URL. Lazy sources, such as BigWig, currently accept one URL
and reload data as the viewed genomic interval changes.

SampleView repeats the same visualization for the samples in the current sample
hierarchy. This works well when data are eager and already contain a sample
field. It is less suitable for signal data stored in one file per sample, one
file per patient, or one file per cohort partition. Loading all possible files
is infeasible for large cohorts, but loading a bounded set of resolved files is
useful for focused analysis.

The goal is to add a generic multi-URL mechanism that works for lazy and eager
sources without introducing App-specific concepts into Core. SampleView should
publish generic reactive values such as visible sample identifiers. Core data
sources should consume ordinary URL specifications and attach ordinary data
fields to loaded rows.

## Scope

The first version should focus on a generic URL expansion primitive:

- keep existing `url: string` behavior unchanged
- keep eager `url: string[]` behavior aligned with `UrlSource`
- support template-based URL expansion from a static array or ExprRef value
- deduplicate expanded URLs before loading
- support an optional maximum URL count
- attach configured fields to loaded rows
- keep SampleView, sample metadata, and SampleHierarchy concepts out of Core

The first version does not need to support object-valued templates, patient-level
file grouping, multi-sample VCF row expansion, or advanced load gates. The schema
should avoid names that prevent those use cases later.

## URL Expansion Concept

A URL specification may resolve to URL descriptors:

```js
[
  {
    url: "https://example.org/A.vcf.gz",
    indexUrl: "https://example.org/A.vcf.gz.tbi",
    fields: { sample: "A" },
  },
  {
    url: "https://example.org/B.vcf.gz",
    indexUrl: "https://example.org/B.vcf.gz.tbi",
    fields: { sample: "B" },
  },
];
```

The `indexUrl` property is optional and applies to formats with a separate
index file, such as BAM, Tabix-backed TSV/GFF3/VCF, and indexed FASTA. Sources
load the resolved URLs and attach descriptor fields to rows before propagation.
For BigWig, a row would become:

```js
{
  sample: "A",
  chrom: "chr1",
  start: 1000,
  end: 1050,
  score: 3.2
}
```

The existing SampleView faceting model can then use ordinary encodings:

```json
{
  "encoding": {
    "sample": { "field": "sample" },
    "x": { "field": "start", "type": "locus" },
    "x2": { "field": "end" },
    "y": { "field": "score", "type": "quantitative" }
  }
}
```

## Template URL Configuration

The scalar initial shape could be:

```json
{
  "url": {
    "template": "https://example.org/{sample}.bw",
    "values": { "expr": "visibleSamples" },
    "field": "sample",
    "maxUrls": 40
  }
}
```

If `visibleSamples` is `["A", "B"]`, this expands to:

```js
[
  { url: "https://example.org/A.bw", fields: { sample: "A" } },
  { url: "https://example.org/B.bw", fields: { sample: "B" } },
];
```

The `field` property identifies the scalar value in the template and the field
attached to each row. Expanded URLs should be deduplicated after template
substitution. `maxUrls` should block loading when too many distinct URLs are
resolved.

Sources that use a separate index URL need paired expansion. Public specs should
keep `indexUrl` as a sibling of `url`, matching the existing `TabixData`,
`BamData`, and `IndexedFastaData` shape. When `url` is template-expanded,
`indexUrl` may provide a matching template that uses the same values and field
mapping as `url`:

```json
{
  "url": {
    "template": "variants/{sample}.vcf.gz",
    "values": { "expr": "visibleSamples" },
    "field": "sample",
    "maxUrls": 40
  },
  "indexUrl": {
    "template": "variants/{sample}.vcf.gz.tbi"
  }
}
```

If `indexUrl` is omitted, indexed sources can keep their existing defaults:
Tabix sources use `url + ".tbi"`, BAM uses `url + ".bai"`, and indexed FASTA
uses `url + ".fai"`. Internally, normalization can still produce descriptors
with both `url` and `indexUrl`.

## Example Configurations

### Per-Sample BigWig Signal

```json
{
  "data": {
    "lazy": {
      "type": "bigwig",
      "url": {
        "template": "coverage/{sample}.bw",
        "values": { "expr": "visibleSamples" },
        "field": "sample",
        "maxUrls": 40
      }
    }
  }
}
```

This supports ATAC-seq, ChIP-seq, RNA coverage, methylation signal, or similar
per-sample genomic signal files. The source loads a bounded set of files and
publishes rows tagged with the sample identifier.

### Eager Per-Sample TSV Files

```json
{
  "data": {
    "url": {
      "template": "segments/{sample}.tsv",
      "values": { "expr": "visibleSamples" },
      "field": "sample",
      "maxUrls": 100
    },
    "format": { "type": "tsv" }
  }
}
```

This aligns eager sources with the same URL expansion model. Parsed rows receive
the configured `sample` field unless they already carry the needed sample field.

### Per-Cancer Variant Files

Later, object-valued visible entities could support file partitions that are not
sample identifiers:

```json
{
  "data": {
    "lazy": {
      "type": "tabix",
      "url": {
        "template": "variants/{cancer}.vcf.gz",
        "values": { "expr": "visibleSampleInfo" },
        "field": "cancer",
        "maxUrls": 1
      },
      "indexUrl": {
        "template": "variants/{cancer}.vcf.gz.tbi"
      }
    }
  }
}
```

The source would load variants only when the visible cohort resolves to one
distinct cancer file. Deduplication by expanded URL makes a separate `distinct`
schema concept unnecessary.

### Per-Patient Variant Files

Some cohorts store one VCF or TSV file per patient, with variant data for all
samples from that patient. In that case file identity differs from sample
identity:

```json
{
  "data": {
    "lazy": {
      "type": "tabix",
      "url": {
        "template": "variants/{patient}.vcf.gz",
        "values": { "expr": "visibleSampleInfo" },
        "field": "patient",
        "maxUrls": 20
      },
      "indexUrl": {
        "template": "variants/{patient}.vcf.gz.tbi"
      }
    }
  }
}
```

Rows loaded from the file may still need their own sample identifiers from the
file contents or from a later parser/transform. The attached `patient` field
describes the file partition, not necessarily the visualization facet.

## SampleView Integration

SampleView should publish a reactive parameter derived from `SampleHierarchy`,
not from closeup or viewport layout state. A suitable initial value is:

```js
visibleSamples = ["A", "B", "C"];
```

This represents samples that survive the current filtering/grouping/provenance
state. It should not depend on closeup scrolling or row viewport visibility.
Those layout states are too volatile for dataflow semantics.

Future versions may publish richer values:

```js
visibleSampleInfo = [
  { sample: "S1", patient: "P1", cancer: "ovarian" },
  { sample: "S2", patient: "P1", cancer: "ovarian" },
];
```

Core should treat these as generic expression values. It should not depend on
SampleView classes, metadata sources, or application state.

## Dataflow Behavior

Sources should normalize URL specifications before loading:

1. Evaluate ExprRefs after parameter propagation.
2. Expand primary and sibling index URL templates using static or reactive
   values.
3. Deduplicate by resolved primary URL and associated index URL.
4. Enforce `maxUrls` if configured.
5. Resolve primary and index URLs against `baseUrl`.
6. Load files with bounded or source-appropriate parallelism.
7. Attach descriptor fields to propagated rows.
8. Emit file batches for file boundaries, as `UrlSource` does today.

For lazy sources, URL changes and domain changes are both reload triggers. Existing
readiness checks should continue to describe whether the lazy source has loaded
data for the requested domain. Multi-file readiness should require all active
resolved URLs to be ready for the requested domain.

## Dataflow Considerations

The current dataflow model has several consequences for multi-URL sources:

- Rows should be tagged before they reach downstream collectors. Unit-view
  collectors derive facet batches from `view.getFacetFields()`, so attaching
  fields such as `{ sample: "A" }` is sufficient for SampleView faceting. The
  source does not need to expose sample identity only through facet batches.
- File batches should remain file-boundary metadata. `UrlSource` emits
  `{ type: "file", url }` before each file, but collectors do not use file
  batches for faceting. Multi-URL sources should keep using row fields for data
  identity.
- Lazy reloads currently reset and complete the whole source branch. A multi-URL
  lazy source should publish a complete snapshot for all active resolved URLs
  together, after all descriptor loads for the current request have finished.
  Publishing one file at a time would make downstream collectors appear complete
  with partial data unless the dataflow gains an explicit incremental protocol.
- Interleaving multi-file loading with upstream propagation could reduce latency
  in the future, especially when many files are requested. Rows from early files
  could flow through transforms while later files are still downloading, then
  the collector would complete once the full request is done. The current source
  helpers are not structured for this: lazy sources typically await their async
  loads, then reset, propagate, and complete as one snapshot. Rendering would
  still wait for collector completion because collectors expose completed
  snapshots, mark data initialization runs from collector completion, and GPU
  buffers are filled only after the collector has completed.
- Request cancellation must be descriptor-aware. When the x-domain or resolved
  URL set changes, stale file requests should be aborted and their results
  ignored. The collector should only receive rows from the latest request
  generation.
- Descriptor fields should be attached by creating fresh row objects or by
  cloning parser output. Sources should avoid mutating library-owned feature
  objects that may be reused or shared.
- Data source identifiers must include the normalized URL configuration and the
  expression text, not the current evaluated values. Runtime optimization should
  not merge two sources whose reactive URL expressions are scoped differently.
- Readiness should include both the requested domain and the active resolved URL
  set. A source is not ready if it has loaded the domain for a previous set of
  URLs.
- Over-limit or unresolved URL states should reset and complete the branch with
  empty data, plus an informative loading status. This prevents stale data from
  remaining visible when a filter broadens beyond `maxUrls`.

## Lazy Source Compatibility

The multi-URL idea is compatible with lazy sources that load an indexed remote
file for the current genomic interval. Compatibility is strongest when each file
can be queried independently and the returned rows can be tagged with descriptor
fields before propagation.

### Strong Initial Candidates

- `bigwig`: Good first target. BigWig rows do not normally contain sample or
  partition identity, so descriptor fields are directly useful. The source
  already reloads on URL ExprRef changes and uses windowed interval loading.
- `bigbed`: Good candidate. BigBed rows are interval features from one indexed
  file. Descriptor fields can tag the file partition before parsed rows are
  propagated.
- `tabix`: Good candidate for TSV-like interval data. The base Tabix source
  already handles URL and index URL initialization, interval queries, and parser
  hooks.
- `gff3`: Compatible through the Tabix base class. It is likely less important
  for SampleView signal use cases, but the mechanics are the same.

### Compatible With Additional Design

- `vcf`: Compatible through the Tabix base class, but multi-sample VCFs may need
  extra row-shaping. URL expansion can decide which files to load; a parser or
  transform may still be needed to expand genotype columns into sample-faceted
  rows.
- `bam`: Compatible in principle. BAM has both data and index URLs and may need
  descriptor-aware index URL expansion. Header-derived reference-name handling is
  currently per source instance and would need to become per file descriptor.
- `indexedFasta`: Technically compatible but a lower-priority fit. FASTA is
  usually reference data, not sample-faceted cohort data. It also has paired
  FASTA/FAI URLs. Multiple references could be useful in specialized cases, but
  this should not drive the initial design.

### Not Relevant

- `axisTicks` and `axisGenome`: Generated from scale/genome state, not remote
  URL-backed sources.
- `mockLazy`: Test-only source.

## Open Questions

- Should descriptor fields override existing row fields, or should conflicts fail
  fast?
- Should `maxUrls` live inside the template object, on the data source, or both?
- Should an over-limit source publish empty data with a loading-status message or
  enter an error state?
- Should `indexUrl` accept only a string/template, or should it eventually
  support full descriptor-like objects too?
- Should an `indexUrl` template always inherit `url.values` and `url.field`, or
  should it be allowed to define its own values?
- Should plain `url: string[]` remain unannotated, or should a separate descriptor
  form be required whenever fields are attached?
- How should multi-sample VCF genotype columns be expanded into sample-faceted
  rows?

## Suggested Phases

1. Add a shared URL normalization helper for strings, arrays, templates, and
   descriptors, including optional index URLs.
2. Use it in eager `UrlSource` while preserving existing array behavior.
3. Extend BigWig to accept multiple resolved descriptors and attach fields.
4. Extend at least one paired-index source, such as Tabix, to validate the
   primary/index descriptor model.
5. Add SampleView `visibleSamples` as a reactive parameter derived from
   `SampleHierarchy`.
6. Add focused tests for URL expansion, index URL expansion, deduplication,
   `maxUrls`, eager URL field attachment, and multi-BigWig row tagging.
7. Later, support object-valued template values and partition-file use cases such
   as patient-level or cancer-level variant files.

## Market Fit

The feature is not mainly about showing hundreds of signal tracks. Its value is
the transition from cohort-level findings to detailed patient or sample evidence:

```text
cohort overview -> filter/group/sort -> resolve relevant files -> inspect locus
```

Existing genome browsers are strong at locus-level inspection, and cohort portals
are strong at matrix-level summaries. The gap is the interactive handoff between
the two. Researchers often identify a subgroup in one tool, then manually move
sample IDs and loci into another tool for detailed inspection. Multi-URL sources
would make that handoff part of the visualization state.

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
loading. The same filtering, grouping, sorting, and provenance state that defines
the cohort overview also defines which detailed files are fetched. This positions
GenomeSpy between cohort portals and genome browsers: more analytical than a
track browser, but closer to raw genomic evidence than matrix-only dashboards.

Adoption depends on keeping configuration simple. A regular URL template driven
by `visibleSamples` is understandable to data providers, while `maxUrls` prevents
accidental broad loading. More complex partitioned-file workflows can be added
later without changing the core value proposition.

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

## Step-by-Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add generic URL template expansion and descriptor-based row tagging,
then validate the model with eager URL loading and lazy BigWig/Tabix sources.

**Architecture:** Add a Core URL normalization layer that converts string,
array, descriptor, and template URL specs into resolved descriptors. Eager and
lazy sources consume descriptors, attach descriptor fields to rows, and keep
SampleView-specific state outside Core. SampleView only publishes generic
reactive parameters, starting with `visibleSamples`.

**Tech Stack:** JavaScript with JSDoc, TypeScript `.d.ts` schema source,
Vitest, existing GenomeSpy dataflow, `@gmod/bbi`, `@gmod/tabix`, and
`generic-filehandle2`.

### Implementation Caveats

- **Nested ExprRefs:** `activateExprRefProps()` only activates top-level ExprRef
  properties. A template shape such as `url.values: { expr: "visibleSamples" }`
  requires a helper that explicitly compiles and watches nested expressions.
- **Expression limitations:** `vega-expression` cannot use JavaScript
  `Array.map`, arrow functions, or template literals. Template expansion must be
  implemented in Core, not by asking users to write array-building expressions.
- **Source identity and optimization:** `UrlSource.identifier` currently uses
  `JSON.stringify({ params, baseUrl })`. Getter-backed ExprRefs and scoped
  runtime values can make identity fragile. Descriptors should not cause dataflow
  optimization to merge sources whose URL expressions are scoped differently.
- **Index URLs:** Public specs should keep `indexUrl` as a sibling of `url`.
  Internal descriptors can carry `{ url, indexUrl, fields }`.
- **Field conflicts:** Attaching descriptor fields can collide with parsed row
  fields. The first implementation should fail fast when a descriptor field
  would overwrite a different existing value, while allowing identical values.
- **Ordering:** Loading multiple files in parallel may produce nondeterministic
  network completion order. The first implementation should publish descriptors
  in normalized descriptor order after all loads finish.
- **Readiness:** Lazy readiness must include both the loaded domain and the
  active descriptor signature. A source loaded for samples A/B is not ready for
  the same domain after the resolved set changes to A/C.
- **Over-limit behavior:** If `maxUrls` is exceeded, the source should clear
  stale data, complete the branch with empty data, and report an informative
  loading status. Leaving previous detailed data visible would be misleading.
- **Streaming later:** Interleaving downloads with upstream transforms can be a
  later optimization. The first implementation should publish complete snapshots
  because collectors, marks, and GPU buffers currently update after collector
  completion.

### Task 1: Define URL Template and Descriptor Types

**Files:**

- Modify: `packages/core/src/spec/data.d.ts`

- [ ] Add shared URL expansion types near `UrlList`:

```ts
export interface UrlDescriptor {
    /**
     * URL of the data file.
     */
    url: string;

    /**
     * Fields attached to each datum loaded from this URL.
     */
    fields?: Record<string, Scalar>;
}

export interface UrlTemplate {
    /**
     * URL template. The scalar value is substituted for `{field}`.
     */
    template: string;

    /**
     * Values used for template expansion. An ExprRef can reference reactive
     * parameters such as `visibleSamples`.
     */
    values: Scalar[] | ExprRef;

    /**
     * Field name used both as the template placeholder and as the attached
     * datum field.
     */
    field: FieldName;

    /**
     * Maximum number of distinct resolved URLs to load.
     */
    maxUrls?: number;
}

export interface IndexUrlTemplate {
    /**
     * URL template for the index file. Uses the `url` template values.
     */
    template: string;
}

export type UrlSourceRef =
    | string
    | string[]
    | ExprRef
    | UrlList
    | UrlDescriptor
    | UrlDescriptor[]
    | UrlTemplate;

export type IndexUrlSourceRef = string | ExprRef | IndexUrlTemplate;
```

- [ ] Update eager URL data to use `UrlSourceRef`:

```ts
export interface UrlData extends DataBase {
    /**
     * An URL, a list of URLs, or a URL expansion definition from which to load
     * the data set.
     */
    url: UrlSourceRef;
}
```

- [ ] Update lazy URL-bearing sources conservatively:

```ts
export interface BigWigData extends DebouncedData {
    type: "bigwig";
    channel?: PrimaryPositionalChannel;
    url: UrlSourceRef;
    pixelsPerBin?: number | ExprRef;
}

export interface BigBedData extends DebouncedData {
    type: "bigbed";
    channel?: PrimaryPositionalChannel;
    url: UrlSourceRef;
    windowSize?: number | ExprRef;
}

export interface TabixData extends DebouncedData {
    channel?: PrimaryPositionalChannel;
    url: UrlSourceRef;
    indexUrl?: IndexUrlSourceRef;
    addChrPrefix?: boolean | string;
    windowSize?: number;
}
```

- [ ] Run type/schema-adjacent checks:

```bash
npm --workspaces run test:tsc --if-present
```

Expected: either no TypeScript workspace checks exist, or affected spec types
compile. If schema generation complains about new type names, run the normal
schema build command used in this repository.

- [ ] Commit:

```bash
git add packages/core/src/spec/data.d.ts
git commit -m "feat(core): define multi-url source specs"
```

### Task 2: Add URL Descriptor Normalization Helper

**Files:**

- Create: `packages/core/src/data/sources/urlDescriptor.js`
- Test: `packages/core/src/data/sources/urlDescriptor.test.js`

- [ ] Write tests covering scalar templates, deduplication, `maxUrls`, base URL
  resolution, and sibling `indexUrl` templates:

```js
import { describe, expect, it, vi } from "vitest";
import { normalizeUrlDescriptors } from "./urlDescriptor.js";

function createRuntime(values) {
    return {
        createExpression: (expr) => {
            const fn = () => values[expr];
            fn.subscribe = () => () => undefined;
            return fn;
        },
        watchExpression: (expr, listener) => {
            const fn = () => values[expr];
            fn.subscribe = () => () => undefined;
            return fn;
        },
    };
}

describe("normalizeUrlDescriptors", () => {
    it("expands scalar template values and attaches fields", async () => {
        const descriptors = await normalizeUrlDescriptors({
            url: {
                template: "coverage/{sample}.bw",
                values: ["A", "B"],
                field: "sample",
            },
            baseUrl: "https://example.org/spec/",
        });

        expect(descriptors).toEqual([
            {
                url: "https://example.org/spec/coverage/A.bw",
                fields: { sample: "A" },
            },
            {
                url: "https://example.org/spec/coverage/B.bw",
                fields: { sample: "B" },
            },
        ]);
    });

    it("uses ExprRef values for template expansion", async () => {
        const descriptors = await normalizeUrlDescriptors({
            url: {
                template: "coverage/{sample}.bw",
                values: { expr: "visibleSamples" },
                field: "sample",
            },
            paramRuntime: createRuntime({ visibleSamples: ["A"] }),
        });

        expect(descriptors).toEqual([
            { url: "coverage/A.bw", fields: { sample: "A" } },
        ]);
    });

    it("deduplicates by resolved url and indexUrl", async () => {
        const descriptors = await normalizeUrlDescriptors({
            url: {
                template: "variants/{cancer}.vcf.gz",
                values: ["ovarian", "ovarian"],
                field: "cancer",
            },
            indexUrl: { template: "variants/{cancer}.vcf.gz.tbi" },
        });

        expect(descriptors).toEqual([
            {
                url: "variants/ovarian.vcf.gz",
                indexUrl: "variants/ovarian.vcf.gz.tbi",
                fields: { cancer: "ovarian" },
            },
        ]);
    });

    it("throws when maxUrls is exceeded", async () => {
        await expect(
            normalizeUrlDescriptors({
                url: {
                    template: "coverage/{sample}.bw",
                    values: ["A", "B"],
                    field: "sample",
                    maxUrls: 1,
                },
            })
        ).rejects.toThrow("resolved 2 URLs, exceeding maxUrls 1");
    });
});
```

- [ ] Implement `normalizeUrlDescriptors()` with these rules:

```js
// @ts-check
import { isExprRef, withoutExprRef } from "../../paramRuntime/paramUtils.js";
import { concatUrl } from "../../utils/url.js";

/**
 * @typedef {object} UrlDescriptor
 * @prop {string} url
 * @prop {string} [indexUrl]
 * @prop {Record<string, import("../../spec/channel.js").Scalar>} [fields]
 */

/**
 * @param {{
 *   url: any,
 *   indexUrl?: any,
 *   baseUrl?: string,
 *   paramRuntime?: { createExpression: (expr: string) => () => any },
 * }} options
 * @returns {Promise<UrlDescriptor[]>}
 */
export async function normalizeUrlDescriptors(options) {
    const descriptors = expandUrl(options.url, options);
    const resolved = descriptors.map((descriptor) => ({
        ...descriptor,
        url: concatUrl(options.baseUrl, descriptor.url),
        indexUrl: descriptor.indexUrl
            ? concatUrl(options.baseUrl, descriptor.indexUrl)
            : undefined,
    }));

    return dedupeAndLimit(resolved, getMaxUrls(options.url));
}

function expandUrl(urlSpec, options) {
    if (isUrlTemplate(urlSpec)) {
        return expandTemplate(urlSpec, options.indexUrl, options);
    }
    const value = isExprRef(urlSpec)
        ? options.paramRuntime.createExpression(urlSpec.expr)()
        : urlSpec;
    const values = Array.isArray(value) ? value : [value];
    return values.map(normalizeDescriptor);
}

function expandTemplate(templateSpec, indexUrlSpec, options) {
    const values = resolveValues(templateSpec.values, options.paramRuntime);
    if (!Array.isArray(values)) {
        throw new Error("URL template values must resolve to an array.");
    }

    return values.map((value) => {
        const scalar = assertScalar(value);
        const fields = { [templateSpec.field]: scalar };
        return {
            url: fillTemplate(templateSpec.template, templateSpec.field, scalar),
            indexUrl: isIndexTemplate(indexUrlSpec)
                ? fillTemplate(indexUrlSpec.template, templateSpec.field, scalar)
                : withoutExprRef(indexUrlSpec),
            fields,
        };
    });
}

function resolveValues(values, paramRuntime) {
    return isExprRef(values)
        ? paramRuntime.createExpression(values.expr)()
        : values;
}

function normalizeDescriptor(value) {
    if (typeof value == "string") {
        return { url: value };
    }
    if (value && typeof value == "object" && typeof value.url == "string") {
        return value;
    }
    throw new Error("URL descriptor must be a string or an object with url.");
}

function fillTemplate(template, field, value) {
    const placeholder = "{" + field + "}";
    if (!template.includes(placeholder)) {
        throw new Error(`URL template must contain ${placeholder}.`);
    }
    return template.replaceAll(placeholder, encodeURIComponent(String(value)));
}

function dedupeAndLimit(descriptors, maxUrls) {
    const byKey = new Map();
    for (const descriptor of descriptors) {
        const key = descriptor.url + "\n" + (descriptor.indexUrl ?? "");
        if (!byKey.has(key)) {
            byKey.set(key, descriptor);
        }
    }
    const result = Array.from(byKey.values());
    if (maxUrls !== undefined && result.length > maxUrls) {
        throw new Error(
            `URL expansion resolved ${result.length} URLs, exceeding maxUrls ${maxUrls}.`
        );
    }
    return result;
}

function assertScalar(value) {
    if (
        value == null ||
        typeof value == "object" ||
        typeof value == "function"
    ) {
        throw new Error("URL template values must be scalar in this version.");
    }
    return value;
}

function isUrlTemplate(value) {
    return value && typeof value == "object" && "template" in value;
}

function isIndexTemplate(value) {
    return value && typeof value == "object" && "template" in value;
}

function getMaxUrls(value) {
    return isUrlTemplate(value) ? value.maxUrls : undefined;
}
```

- [ ] Run:

```bash
npx vitest run packages/core/src/data/sources/urlDescriptor.test.js
```

Expected: tests pass after implementation.

- [ ] Commit:

```bash
git add packages/core/src/data/sources/urlDescriptor.js packages/core/src/data/sources/urlDescriptor.test.js
git commit -m "feat(core): normalize multi-url descriptors"
```

### Task 3: Wire Reactive Template Values

**Files:**

- Modify: `packages/core/src/data/sources/urlDescriptor.js`
- Test: `packages/core/src/data/sources/urlDescriptor.test.js`

- [ ] Add an exported watcher helper so sources can reload when nested
  `url.values` changes:

```js
/**
 * Watches ExprRefs nested inside URL expansion specs.
 *
 * @param {{
 *   url: any,
 *   indexUrl?: any,
 *   paramRuntime: { watchExpression?: Function, createExpression: Function },
 *   listener: () => void,
 *   registerDisposer?: (disposer: () => void) => void,
 * }} options
 */
export function watchUrlDescriptorExpressions(options) {
    const expressions = collectUrlExpressions(options.url, options.indexUrl);
    for (const expr of expressions) {
        const fn = options.paramRuntime.watchExpression
            ? options.paramRuntime.watchExpression(expr, options.listener, {
                  scopeOwned: !options.registerDisposer,
                  registerDisposer: options.registerDisposer,
              })
            : options.paramRuntime.createExpression(expr);
        if (!options.paramRuntime.watchExpression && fn.subscribe) {
            const unsubscribe = fn.subscribe(options.listener);
            options.registerDisposer?.(unsubscribe);
        }
    }
}

function collectUrlExpressions(url, indexUrl) {
    const expressions = [];
    if (isExprRef(url)) {
        expressions.push(url.expr);
    }
    if (isUrlTemplate(url) && isExprRef(url.values)) {
        expressions.push(url.values.expr);
    }
    if (isExprRef(indexUrl)) {
        expressions.push(indexUrl.expr);
    }
    return expressions;
}
```

- [ ] Add a test that a nested `values` ExprRef is registered with
  `watchExpression`:

```js
it("watches nested template value expressions", () => {
    const watched = [];
    watchUrlDescriptorExpressions({
        url: {
            template: "coverage/{sample}.bw",
            values: { expr: "visibleSamples" },
            field: "sample",
        },
        paramRuntime: {
            watchExpression: (expr) => {
                watched.push(expr);
                return () => [];
            },
            createExpression: () => () => undefined,
        },
        listener: () => undefined,
    });

    expect(watched).toEqual(["visibleSamples"]);
});
```

- [ ] Run:

```bash
npx vitest run packages/core/src/data/sources/urlDescriptor.test.js
```

Expected: all URL descriptor tests pass.

- [ ] Commit:

```bash
git add packages/core/src/data/sources/urlDescriptor.js packages/core/src/data/sources/urlDescriptor.test.js
git commit -m "feat(core): watch multi-url expressions"
```

### Task 4: Update Eager UrlSource

**Files:**

- Modify: `packages/core/src/data/sources/urlSource.js`
- Test: `packages/core/src/data/sources/urlSource.test.js`

- [ ] Add tests for URL templates and descriptor fields:

```js
test("UrlSource expands URL templates and attaches descriptor fields", async () => {
    global.fetch = /** @type {any} */ (
        vi.fn(async (url) => {
            if (url == "segments/A.tsv") {
                return new Response("start\tend\n1\t2\n", { status: 200 });
            }
            if (url == "segments/B.tsv") {
                return new Response("start\tend\n3\t4\n", { status: 200 });
            }
            throw new Error(`Unexpected URL: ${url}`);
        })
    );

    const source = new UrlSource(
        {
            url: {
                template: "segments/{sample}.tsv",
                values: ["A", "B"],
                field: "sample",
            },
            format: { type: "tsv" },
        },
        createViewStub()
    );

    expect(await collectSource(source)).toEqual([
        { sample: "A", start: 1, end: 2 },
        { sample: "B", start: 3, end: 4 },
    ]);
});

test("UrlSource rejects conflicting descriptor fields", async () => {
    global.fetch = /** @type {any} */ (
        vi.fn(async () => new Response("sample\tvalue\nB\t1\n", { status: 200 }))
    );

    const source = new UrlSource(
        {
            url: [
                {
                    url: "segments/A.tsv",
                    fields: { sample: "A" },
                },
            ],
            format: { type: "tsv" },
        },
        createViewStub()
    );

    await expect(collectSource(source)).rejects.toThrow(
        'Descriptor field "sample" conflicts with loaded datum.'
    );
});
```

- [ ] Replace ad hoc URL-array handling with `normalizeUrlDescriptors()` and
  attach descriptor fields before propagation:

```js
const descriptors = await normalizeUrlDescriptors({
    url: this.params.url,
    baseUrl: this.baseUrl,
    paramRuntime: this.paramRuntime,
});

const urls = descriptors.map((descriptor) => descriptor.url);
const format = getFormat(this.params, urls);
```

Use a helper:

```js
function attachFields(datum, fields) {
    if (!fields) {
        return datum;
    }
    for (const [key, value] of Object.entries(fields)) {
        if (key in datum && datum[key] !== value) {
            throw new Error(
                `Descriptor field "${key}" conflicts with loaded datum.`
            );
        }
    }
    return { ...fields, ...datum };
}
```

- [ ] Ensure `UrlSource` registers nested URL expression watchers by calling
  `watchUrlDescriptorExpressions()` in the constructor and reloading on changes.

- [ ] Run:

```bash
npx vitest run packages/core/src/data/sources/urlSource.test.js
```

Expected: existing URL source tests and new descriptor tests pass.

- [ ] Commit:

```bash
git add packages/core/src/data/sources/urlSource.js packages/core/src/data/sources/urlSource.test.js
git commit -m "feat(core): expand multi-url eager sources"
```

### Task 5: Extend BigWigSource for Multiple Descriptors

**Files:**

- Modify: `packages/core/src/data/sources/lazy/bigWigSource.js`
- Test: `packages/core/src/data/sources/lazy/bigWigSource.test.js`

- [ ] Extract per-file BigWig state:

```js
/**
 * @typedef {object} BigWigHandle
 * @prop {import("@gmod/bbi").BigWig} bbi
 * @prop {number[]} reductionLevels
 * @prop {Record<string, import("../../../spec/channel.js").Scalar>} [fields]
 * @prop {string} url
 */
```

Replace the single `#bbi` and `#reductionLevels` with:

```js
/** @type {BigWigHandle[]} */
#handles = [];

/** @type {string} */
#descriptorSignature = "";
```

- [ ] Normalize descriptors during initialization, create one BigWig handle per
  descriptor, and load headers in parallel. Keep the existing single-string
  behavior as a one-descriptor case.

- [ ] Load each descriptor for each discrete chromosome interval. Preserve
  descriptor order in the published rows:

```js
const chunksByDescriptor = await Promise.all(
    this.#handles.map((handle) =>
        this.discretizeAndLoad(interval, {
            load: (d, signal) =>
                handle.bbi
                    .getFeatures(d.chrom, d.startPos, d.endPos, {
                        scale: getScale(handle),
                        signal,
                    })
                    .then((features) =>
                        mapFeatures(d.chrom, features, handle.fields)
                    ),
        })
    )
);

const featureChunks = chunksByDescriptor
    .filter(Boolean)
    .flatMap((chunks) => chunks);
```

- [ ] Extend readiness so the descriptor signature is part of readiness:

```js
isDataReadyForDomain(request) {
    return (
        this.#loadedDescriptorSignature === this.#descriptorSignature &&
        super.isDataReadyForDomain(request)
    );
}
```

- [ ] Add tests with a registered/stubbed BigWig module or a local helper seam.
  The test should assert that two descriptors produce tagged rows and that
  changing the descriptor set makes readiness false until reload.

- [ ] Run:

```bash
npx vitest run packages/core/src/data/sources/lazy/bigWigSource.test.js packages/core/src/view/dataReadiness.test.js
```

Expected: BigWig multi-descriptor tests pass and existing readiness tests remain
green.

- [ ] Commit:

```bash
git add packages/core/src/data/sources/lazy/bigWigSource.js packages/core/src/data/sources/lazy/bigWigSource.test.js
git commit -m "feat(core): load multiple bigwig descriptors"
```

### Task 6: Validate Paired Index URLs with Tabix

**Files:**

- Modify: `packages/core/src/data/sources/lazy/tabixSource.js`
- Test: `packages/core/src/data/sources/lazy/tabixSource.test.js`

- [ ] Normalize both `url` and sibling `indexUrl` into descriptors. If
  `indexUrl` is omitted, apply the existing `url + ".tbi"` default per
  descriptor.

- [ ] Keep header handling per descriptor. For `TabixTsvSource`, column/header
  discovery must either require compatible headers across descriptors or fail
  fast with a clear error when headers disagree.

- [ ] Add tests that assert:

```js
// Input:
url: {
    template: "variants/{cancer}.vcf.gz",
    values: ["ovarian"],
    field: "cancer",
},
indexUrl: {
    template: "variants/{cancer}.vcf.gz.tbi",
}

// Expected normalized pair:
url === "variants/ovarian.vcf.gz"
indexUrl === "variants/ovarian.vcf.gz.tbi"
fields.cancer === "ovarian"
```

- [ ] Run:

```bash
npx vitest run packages/core/src/data/sources/lazy/tabixTsvSource.test.js packages/core/src/data/sources/lazy/tabixSource.test.js
```

Expected: Tabix template/index tests pass. Existing Tabix TSV header behavior
remains unchanged for single-file sources.

- [ ] Commit:

```bash
git add packages/core/src/data/sources/lazy/tabixSource.js packages/core/src/data/sources/lazy/tabixSource.test.js packages/core/src/data/sources/lazy/tabixTsvSource.test.js
git commit -m "feat(core): support multi-url tabix descriptors"
```

### Task 7: Publish SampleView visibleSamples

**Files:**

- Modify: `packages/app/src/sampleView/sampleView.js`
- Test: `packages/app/src/sampleView/sampleView.test.js`

- [ ] Allocate a passive SampleView-scoped parameter:

```js
/** @type {(value: string[]) => void} */
#visibleSamplesParam;

/** @type {string[]} */
#lastVisibleSamples = [];
```

Initialize it alongside the existing `height` param:

```js
this.#visibleSamplesParam =
    this.#gridChild.view.paramRuntime.allocateSetter(
        "visibleSamples",
        [],
        true
    );
```

- [ ] Update it from `SampleHierarchy`, not from closeup or viewport state:

```js
#updateVisibleSamplesParam() {
    const samples = this.leafSamples;
    if (arraysEqual(samples, this.#lastVisibleSamples)) {
        return;
    }
    this.#lastVisibleSamples = samples;
    this.#visibleSamplesParam(samples);
}
```

Call it after samples are loaded and when the sample hierarchy subscription
fires.

- [ ] Add tests that create a SampleView, verify `visibleSamples` equals the
  sample hierarchy leaves, then dispatch a filter/group action and verify the
  param changes only according to `SampleHierarchy`.

- [ ] Run:

```bash
npx vitest run packages/app/src/sampleView/sampleView.test.js
```

Expected: SampleView tests pass, including visible sample parameter behavior.

- [ ] Commit:

```bash
git add packages/app/src/sampleView/sampleView.js packages/app/src/sampleView/sampleView.test.js
git commit -m "feat(app): publish visible sample ids"
```

### Task 8: Integration Test for SampleView Multi-BigWig

**Files:**

- Test: `packages/app/src/sampleView/sampleViewLazyReady.test.js`
- Optional helper changes: `packages/core/src/data/sources/lazy/mockLazySource.js`

- [ ] Add a test-only lazy source or extend `MockLazySource` to accept URL
  descriptors and publish rows tagged by descriptor fields.

- [ ] Add a SampleView spec using:

```js
data: {
    lazy: {
        type: "mockMultiUrl",
        channel: "x",
        url: {
            template: "signals/{sample}.mock",
            values: { expr: "visibleSamples" },
            field: "sample",
            maxUrls: 2,
        },
    },
}
```

- [ ] Assert that the collector has facet batches for the visible samples after
  lazy readiness resolves.

- [ ] Assert that expanding the sample hierarchy beyond `maxUrls` clears the
  previous data and reports the over-limit state instead of leaving stale rows.

- [ ] Run:

```bash
npx vitest run packages/app/src/sampleView/sampleViewLazyReady.test.js
```

Expected: readiness waits for the multi-url lazy source and the collector facets
match visible sample IDs.

- [ ] Commit:

```bash
git add packages/app/src/sampleView/sampleViewLazyReady.test.js packages/core/src/data/sources/lazy/mockLazySource.js
git commit -m "test(app): cover sample-driven multi-url loading"
```

### Task 9: Documentation and Schema Artifacts

**Files:**

- Modify: `packages/core/src/spec/data.d.ts`
- Modify generated schema/docs artifacts only if the repository build updates
  them.

- [ ] Tighten user-facing JSDoc for `UrlTemplate`, `UrlDescriptor`, `maxUrls`,
  and `indexUrl` template inheritance. Use the `__Default value:__` convention
  only where documenting an actual default.

- [ ] Run:

```bash
npm run build
npm run build:docs
```

Expected: schema/docs build succeeds. If generated artifacts change, inspect
them and include only relevant generated changes.

- [ ] Commit:

```bash
git add packages/core/src/spec/data.d.ts
git commit -m "docs(core): document multi-url source specs"
```

If schema or docs generation changes additional files, inspect them with
`git status --short` and stage only the generated schema/docs files that were
changed by the build. Commit those generated artifacts with:

```bash
git commit -m "build(core): update multi-url schema artifacts"
```

### Task 10: Final Verification

**Files:**

- No planned source edits.

- [ ] Run focused tests:

```bash
npx vitest run packages/core/src/data/sources/urlDescriptor.test.js packages/core/src/data/sources/urlSource.test.js packages/core/src/data/sources/lazy/bigWigSource.test.js packages/core/src/data/sources/lazy/tabixTsvSource.test.js packages/app/src/sampleView/sampleViewLazyReady.test.js
```

Expected: all focused tests pass.

- [ ] Run broader checks:

```bash
npm --workspaces run test:tsc --if-present
npm run lint
```

Expected: type checks and lint pass.

- [ ] Inspect diff:

```bash
git diff --stat
git diff
```

Expected: remaining diff is empty. If not empty, either commit intentional
changes or revert only changes made during this implementation.

- [ ] If `git diff` shows intentional uncommitted fixes, inspect the paths with
  `git status --short`, stage only those implementation files, and commit with:

```bash
git commit -m "fix(core): stabilize multi-url source behavior"
```

Skip this step if the working tree is already clean.

# URL Templates and Multiple Files

URL templates are an advanced data input feature. Most embedded GenomeSpy
visualizations only need a single eager or lazy data source. URL templates are
intended for complex visual analytics workflows, especially cohort views where
the current filtering, grouping, or sample hierarchy determines which files are
relevant.

Common cases include one file per sample, one file per patient, or one file per
cohort partition. Instead of loading every possible file, a visualization can
load a bounded set of resolved URLs and attach the template value to each loaded
row.

## URL Templates

A URL template expands a list of scalar values into URLs. The same value is
substituted into the URL and attached as a row field.

```json title="Example: Per-sample URL template"
{
  "url": {
    "template": "signals/{sample}.bw",
    "values": ["S1", "S2"],
    "field": "sample"
  }
}
```

This resolves to two files, `signals/S1.bw` and `signals/S2.bw`. Rows loaded
from the first file receive `"sample": "S1"`, and rows loaded from the second
file receive `"sample": "S2"`.

The attached field is useful when the loaded file does not already contain the
facet or sample identity. The attached value must not conflict with a field
already present in the loaded data.

Duplicate resolved URLs are loaded only once. Use `maxValues` to prevent
accidental broad loading when a template is driven by interactive state. If the
number of distinct resolved URLs exceeds `maxValues`, the source loads no data.
This lets a visualization show a separate annotation, for example asking the
user to filter to a smaller set of samples.

If some expanded files may be unavailable, set `onLoadError` to `"skip"` to
load the remaining files and write a warning to the browser console.

The template object accepts the following properties:

SCHEMA UrlTemplate

## Reactive Values

The `values` property may use an [expression](../expressions.md) reference. This
is useful when the set of files is controlled by application state or
parameters.

```json title="Example: URL template driven by a parameter"
{
  "params": [
    {
      "name": "samplesToLoad",
      "value": ["S1", "S2"]
    }
  ],
  "data": {
    "lazy": {
      "type": "bigwig",
      "url": {
        "template": "signals/{sample}.bw",
        "values": { "expr": "samplesToLoad" },
        "field": "sample"
      }
    }
  }
}
```

!!! info "GenomeSpy App SampleView"

    GenomeSpy App's SampleView is a common use case for reactive URL templates,
    because the currently visible samples can determine which files are loaded. See
    [Visible sample parameters](../../sample-collections/visualizing.md#visible-sample-parameters)
    for App-specific parameters such as `visibleSamples` and
    `visibleSampleMetadata`.

This mechanism is intended for focused sets of files, such as tens of signal
tracks. It is not a good way to display hundreds or thousands of BigWigs at
once.

## Eager Files

Eager URL templates work well when each file can be parsed into compatible rows.
This is useful for sample-specific or patient-specific tabular files.

```json title="Example: Eager per-sample TSV files"
{
  "data": {
    "url": {
      "template": "segments/{sample}.tsv",
      "values": ["S1", "S2"],
      "field": "sample"
    },
    "format": { "type": "tsv" }
  }
}
```

Each loaded row receives the `sample` field from the template value unless the
row already contains the same value.

## Lazy BigWig Files

BigWig templates are useful for per-sample signal data, such as ATAC-seq,
ChIP-seq, CUT&Tag, RNA coverage, methylation signal, or other genomic signal
tracks.

```json title="Example: Per-sample BigWig signal"
{
  "data": {
    "lazy": {
      "type": "bigwig",
      "url": {
        "template": "coverage/{sample}.bw",
        "values": { "expr": "samplesToLoad" },
        "field": "sample"
      }
    }
  }
}
```

The BigWig source loads data for the current genomic interval from each resolved
file and attaches the sample field to the returned rows.

## Indexed Files

Formats such as Tabix-backed TSV, GFF3, and VCF use an index file. Keep
`indexUrl` as a sibling of `url`.

```json title="Example: Tabix files with index URL template"
{
  "data": {
    "lazy": {
      "type": "tabix",
      "url": {
        "template": "variants/{sample}.vcf.gz",
        "values": { "expr": "samplesToLoad" },
        "field": "sample"
      },
      "indexUrl": {
        "template": "variants/{sample}.vcf.gz.tbi"
      }
    }
  }
}
```

If `indexUrl` is omitted, sources that have a default index naming convention
use it. For example, Tabix defaults to the data URL plus `.tbi`.

## Current Limitations

- The expression or `values` property must resolve to an array. Each item in
  the array must be a scalar value.
- Object-valued metadata templates, such as one file per patient or cancer type,
  require additional design.
- BigWig, BigBed, and Tabix-backed sources support multi-file lazy loading.
- BAM and indexed FASTA should be treated as single-file sources unless their
  docs state otherwise.
- Loading is snapshot-based. Rows are propagated after the active set of files
  has completed for the current request.

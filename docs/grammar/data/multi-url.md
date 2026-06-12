# URL Templates and Multiple Files

URL templates and descriptor-based row tagging are advanced data input features.
Most embedded GenomeSpy visualizations only need a single eager or lazy data
source. These features are intended for complex visual analytics workflows,
especially cohort views where the current filtering, grouping, or sample
hierarchy determines which files are relevant.

Common cases include one file per sample, one file per patient, or one file per
cohort partition. Instead of loading every possible file, a visualization can
load a bounded set of resolved URLs and attach the file identity to each loaded
row.

## URL Descriptors

A URL descriptor is an object form of a URL. It can include:

- `url`: the data file URL
- `indexUrl`: the index file URL for indexed formats such as Tabix
- `fields`: fields attached to every datum loaded from the URL

Descriptor fields are useful when the loaded file does not already contain the
facet or sample identity. For example, rows loaded from a per-sample BigWig file
can be tagged with the sample ID before they reach faceting or downstream
transforms.

Descriptor fields must not conflict with fields already present in the loaded
data. If a descriptor field would overwrite a different value, loading fails.

## URL Templates

A URL template expands a list of scalar values into URL descriptors. The same
value is substituted into the URL and attached as a row field.

```json title="Example: Per-sample URL template"
{
  "url": {
    "template": "signals/{sample}.bw",
    "values": ["S1", "S2"],
    "field": "sample",
    "maxValues": 20
  }
}
```

This resolves to two files, `signals/S1.bw` and `signals/S2.bw`. Rows loaded
from the first file receive `"sample": "S1"`, and rows loaded from the second
file receive `"sample": "S2"`.

Duplicate resolved URLs are loaded only once. Use `maxValues` to prevent
accidental broad loading when a template is driven by interactive state.

## Reactive Values

The `values` property may use an expression reference. This is useful when the
set of files is controlled by application state or parameters.

```json title="Example: URL template driven by visibleSamples"
{
  "data": {
    "lazy": {
      "type": "bigwig",
      "url": {
        "template": "signals/{sample}.bw",
        "values": { "expr": "visibleSamples" },
        "field": "sample",
        "maxValues": 20
      }
    }
  }
}
```

In GenomeSpy App's SampleView, `visibleSamples` is derived from the current
sample hierarchy. This makes it possible to move from a cohort-level view to
detailed signal tracks for the currently relevant samples.

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
      "field": "sample",
      "maxValues": 50
    },
    "format": { "type": "tsv" }
  }
}
```

Each loaded row receives the `sample` field from the descriptor unless the row
already contains the same value.

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
        "values": { "expr": "visibleSamples" },
        "field": "sample",
        "maxValues": 20
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
        "values": { "expr": "visibleSamples" },
        "field": "sample",
        "maxValues": 20
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

- Template values are scalar in the current version.
- Object-valued metadata templates, such as one file per patient or cancer type,
  require additional design.
- BigWig, BigBed, and Tabix-backed sources support multi-file lazy loading.
- BAM and indexed FASTA should be treated as single-file sources unless their
  docs state otherwise.
- Loading is snapshot-based. Rows are propagated after the active set of files
  has completed for the current request.

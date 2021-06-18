# Data Input

GenomeSpy inputs tabular data as `"csv"`, `"tsv"`, and `"json"` files.
Currently, the only supported bioinformatic file format is non-indexed
`"fasta"`. Other formats such as _BED_ or _BigWig_ are not directly supported.
They must be first converted into one of the above tabular formats.

GenomeSpy can load data from external files or use inline data. You
can also use generators to generate data on the fly and modify them using
[transforms](transform/index.md).

The `data` property of the view specification describes a data source. The
following example loads a tab-delimited file. By default, the format is inferred
from the file extension. However, in bioinformatics, CSV files are often
actually tab-delimited and the `"tsv"` format must be specified explicitly.

```json
{
  "data": {
    "url": "fileWithTabs.csv",
    "format": { "type": "tsv" }
  },
  ...
}
```

With the exception of the unsupported geographical formats, the data property of
GenomeSpy is identical to Vega-Lite's
[data](https://vega.github.io/vega-lite/docs/data.html) property.

!!! warning "Type inference"

    GenomeSpy uses
    [vega-loader](https://github.com/vega/vega/tree/master/packages/vega-loader)
    to parse tabular data and infer its data types. Vega-loader is sometimes
    overly eager to interpret strings as a dates. In such cases, the field types
    need to be specified explicitly. On the other hand, explicit type
    specification also gives a significant performance boost to parsing
    performance.

## Bioinformatic formats

### FASTA

The type of _FASTA_ format is `"fasta"` as shown in the example below:

```json
{
  "data": {
    "url": "16SRNA_Deino_87seq_copy.aln",
    "format": {
      "type": "fasta"
    }
  },
  ...
}
```

The FASTA loader produces data objects with two fields: `"identifier"` and
`"sequence"`. With the [`"flattenSequence"`](transform/flatten-sequence.md)
transform you can split the sequences into individual bases (one object per
base) for easier visualization.

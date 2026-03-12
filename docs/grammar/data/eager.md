# Eager Data Sources

_Eager_ data sources load and process all available data during the
initialization stage. They are suitable for small data sets as they do not
support partial loading or loading in response to user interactions. However,
eager data sources are often more flexible and straightforward than
[lazy](lazy.md) ones.

The `data` property of the view specification describes an eager data source.
GenomeSpy supports four eager source forms directly in a view specification:
loading data from `url`, embedding it inline with `values`, binding it by
`name`, and generating numeric rows with `sequence`. This model is based on
Vega-Lite and is mostly compatible, but the sections below describe GenomeSpy's
behavior directly.

GenomeSpy can read eager data as `"csv"`, `"tsv"`, `"dsv"`, and `"json"`, as
well as additional URL-based formats such as [`"bed"`](#bed),
[`"bedpe"`](#bedpe), [`"fasta"`](#fasta), and [`"parquet"`](#parquet). Whatever
the source, the data is treated as a table of records that can be further
processed with [transforms](../transform/index.md).

## Overview

The following eager source forms are available:

| Form       | Purpose                                  | Typical use                                    |
| ---------- | ---------------------------------------- | ---------------------------------------------- |
| `values`   | Embed data directly in the specification | Small examples, constants, test data           |
| `url`      | Load data from one or more files         | CSV/TSV/JSON and other eager file formats      |
| `name`     | Bind a dataset by name                   | Root-level `datasets` or runtime-provided data |
| `sequence` | Generate a numeric sequence              | Derived coordinates, bins, synthetic data      |

## Inline Data

Use `values` when the data is already available in the specification. The most
common form is an array of objects, where each object becomes one data record.

```json title="Example: Inline object array"
{
  "data": {
    "values": [
      { "category": "A", "value": 5 },
      { "category": "B", "value": 8 }
    ]
  }
}
```

A single object is treated as a one-row dataset:

```json title="Example: Inline single object"
{
  "data": {
    "values": { "x": 1, "y": 2 }
  }
}
```

Arrays of primitive values are also allowed. In that case, GenomeSpy wraps each
value into an object with a `data` field.

```json title="Example: Inline scalar array"
{
  "data": {
    "values": [1, 2, 3]
  }
}
```

This produces rows equivalent to:

```json
[{ "data": 1 }, { "data": 2 }, { "data": 3 }]
```

Finally, `values` may also be a string. String values are parsed according to
`data.format`, so the format type must be specified explicitly.

```json title="Example: Parsing inline CSV text"
{
  "data": {
    "values": "x,y\n1,2\n3,4",
    "format": { "type": "csv" }
  }
}
```

!!! warning "Type inference"

    GenomeSpy uses
    [vega-loader](https://github.com/vega/vega/tree/master/packages/vega-loader)
    to parse tabular data and infer its data types. Vega-loader is sometimes
    overly eager to interpret strings as dates. In such cases, the field types
    need to be specified explicitly. On the other hand, explicit type
    specification also gives a significant performance boost to parsing
    performance.

!!! warning "Handling empty (NA) values"

    Empty or missing values must be presented as **empty strings** instead of `NA`
    that R writes by default. Otherwise type inference fails for numeric fields.

## URL Data

Use `url` to load eager data from files. The URL may be absolute or relative to
the page where GenomeSpy is embedded.

Relative URLs are resolved against the current view's effective `baseUrl`.
Base URLs are inherited through the view hierarchy and can be overridden in
nested views. If a nested view defines a relative `baseUrl`, it is resolved
against the parent view's `baseUrl`.

```json title="Example: Loading a single file"
{
  "data": {
    "url": "data.tsv",
    "format": { "type": "tsv" }
  }
}
```

GenomeSpy can also load multiple files and concatenate their rows. This is
useful when later transforms reshape each file into a common form before the
results are concatenated. Each input file is processed as its own batch, so
batch-sensitive transforms can reset their internal state between files. For
example, this works well when each patient has a separate mutation file with
different sample-specific VAF columns that are folded into a compatible long
format with [`"regexFold"`](../transform/regex-fold.md).

```json title="Example: Loading multiple files"
{
  "data": {
    "url": ["part1.tsv", "part2.tsv"],
    "format": { "type": "tsv" }
  }
}
```

If you have many files, you can place the file list in a separate file with
`urlsFromFile`.

```json title="Example: Loading file URLs from a manifest"
{
  "data": {
    "url": { "urlsFromFile": "variant-file-list.tsv", "type": "tsv" },
    "format": { "type": "tsv" }
  }
}
```

The manifest file must be either a JSON array of strings or a CSV/TSV file
with a single column named `url`.

Relative URLs inside a `urlsFromFile` manifest are resolved relative to the
manifest file itself, not the surrounding view specification.

GenomeSpy also supports gzip-compressed eager files transparently. URLs ending
in `.gz`, `.bgz`, or `.bgzf` are decompressed automatically, and format
inference uses the uncompressed extension. For example, `variants.tsv.gz` is
treated as a TSV file.

## Tabular Formats

GenomeSpy supports the following general-purpose eager formats:

- `"csv"` for comma-separated text
- `"tsv"` for tab-separated text
- `"dsv"` for delimited text with a custom single-character delimiter
- `"json"` for JSON arrays and nested JSON documents

In many cases, the format can be inferred from the file extension. For example,
`data.csv`, `data.tsv`, and `data.json` are recognized automatically. If the
extension is ambiguous or does not reflect the real contents, specify
`data.format.type` explicitly.

In bioinformatics, files with a `.csv` extension are often actually
tab-delimited. In such cases, use `"tsv"` explicitly instead of relying on the
filename.

For `"dsv"`, you must also specify the delimiter:

```json title="Example: Custom-delimited text"
{
  "data": {
    "url": "data.txt",
    "format": {
      "type": "dsv",
      "delimiter": "|"
    }
  }
}
```

For `"json"`, you can optionally use `format.property` to read a nested array
from the loaded JSON document:

```json title="Example: Reading nested JSON data"
{
  "data": {
    "url": "data.json",
    "format": {
      "type": "json",
      "property": "values.items"
    }
  }
}
```

## Parsing Field Types

The `format.parse` property controls how field values are converted from text to
typed values.

For `"csv"`, `"tsv"`, and `"dsv"`, GenomeSpy enables automatic type inference by
default. Numeric fields are converted to numbers, booleans to booleans, and so
on. If you want full control over parsing, provide an explicit parse mapping.
This is also faster, because GenomeSpy does not need to scan the data to infer
field types. For large delimited files, explicit `format.parse` mappings are
strongly recommended.

```json title="Example: Explicit parse mapping"
{
  "data": {
    "url": "samples.tsv",
    "format": {
      "type": "tsv",
      "parse": {
        "sample_id": "string",
        "value": "number"
      }
    }
  }
}
```

When `parse` is an object, only the listed fields are converted. Other fields
remain strings.

If `parse` is omitted for `"csv"`, `"tsv"`, and `"dsv"`, GenomeSpy uses
automatic type inference. If `parse` is set to `null`, type inference is
disabled and delimited fields remain strings.

## Named Data

Use `data.name` when the data should be supplied separately from the view
specification.

```json title="Example: Named data source"
{
  "data": {
    "name": "myResults"
  }
}
```

One way to provide named data is the root-level `datasets` property, which
embeds reusable datasets in the root specification and exposes them by name.

```json title="Example: Root-level datasets"
{
  "datasets": {
    "myResults": [
      { "x": 1, "y": 2 },
      { "x": 2, "y": 3 }
    ]
  },
  "data": {
    "name": "myResults"
  }
}
```

Another way is the [JavaScript API](../../api.md#named-data), which can provide
or update named data at runtime. Named datasets must be arrays. If a named
dataset is not found, GenomeSpy treats it as empty data.

## Sequence Generator

Use `sequence` to generate a numeric sequence instead of loading rows from an
external source. This is useful for synthetic coordinates, repeated structures,
and examples.

```json title="Example: Sequence generator"
{
  "data": {
    "sequence": {
      "start": 0,
      "stop": 5,
      "step": 1,
      "as": "x"
    }
  }
}
```

This generates the rows:

```json
[{ "x": 0 }, { "x": 1 }, { "x": 2 }, { "x": 3 }, { "x": 4 }]
```

`start` and `stop` are required. The `stop` value is exclusive, `step` defaults
to `1`, and the output field name defaults to `"data"`. Sequence parameters may
also use expression references.

## Additional Formats

The following additional formats are supported by the eager `url` data source.
Most bioinformatic data formats are supported through [lazy](lazy.md) data.

### BED

[BED](https://genome.ucsc.edu/FAQ/FAQformat#format1) parsing is based on
[@gmod/bed](https://github.com/GMOD/bed-js) and supports BED3-BED12 fields.
Output uses standard BED field names such as `chrom`, `chromStart`, `chromEnd`,
and optional BED/BED12 fields.

Behavior details:

- Leading `browser`, `track`, and `#` lines are skipped before the first data
  row.
- BED12 rows use BED12 field names (for example `thickStart`, `thickEnd`,
  `itemRgb`, `blockCount`, `blockSizes`, `blockStarts`).
- `strand` is normalized to numeric codes: `"+"` -> `1`, `"-"` -> `-1`, and
  any other value -> `0`.
- `blockSizes` and `blockStarts` are parsed from comma-separated text into
  numeric arrays.
- Non-BED12 extra columns are preserved as positional fallback fields (`fieldN`).

#### Example

EXAMPLE examples/docs/grammar/data/eager/bed.json height=160

For larger BED files, consider using the lazy [BigBed data
source](lazy.md#bigbed) instead of the eager `url` source.

### BEDPE

[BEDPE](https://bedtools.readthedocs.io/en/latest/content/general-usage.html#bedpe-format)
is parsed as tab-delimited text with positional columns. It is commonly used
for paired loci, such as structural variant breakpoints and link/arc
annotations between two regions. The required leading fields are
`chrom1, start1, end1, chrom2, start2, end2`; common optional fields are
`name, score, strand1, strand2`. BEDPE files are typically headerless.

Behavior details:

- Leading `browser`, `track`, and `#` lines are skipped before the first data
  row.
- If a header row is present, it is detected when the first six columns match
  the required BEDPE prefix; headerless files use the default BEDPE column
  order or explicit names from `format.columns`.
- Sentinel normalization: `.` -> `null` for string fields (`chrom*`, `name`);
  `-1` and `""` -> `null` for coordinates; `""` -> `null` for `score`.
- `strand1` and `strand2` are normalized to numeric codes: `"+"` -> `1`,
  `"-"` -> `-1`, and any other value -> `0`.
- Extra trailing columns are preserved as positional fallback fields (`fieldN`,
  with 1-based indexing).
- Rows with fewer than six columns are rejected with a parse error.

#### Example

EXAMPLE examples/docs/grammar/data/eager/bedpe.json height=160

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

The FASTA loader produces data objects with two fields: `identifier` and
`sequence`. With the [`"flattenSequence"`](../transform/flatten-sequence.md)
transform you can split the sequences into individual bases (one object per
base) for easier visualization.

### Parquet

[_Apache Parquet_](https://en.wikipedia.org/wiki/Apache_Parquet) is a
column-oriented binary storage format designed for efficient analytics on large
tables. Compared to row-oriented text formats, it usually provides better
compression and faster column scans. For larger datasets, Parquet is strongly
recommended over delimited text formats because it can be processed much more
quickly.
In GenomeSpy, Parquet is decoded into row objects similarly to `"csv"` and
`"tsv"` formats supported by the `url` data source.

The type of _Parquet_ format is `"parquet"`:

```json
{
  "data": {
    "url": "data.parquet",
    "format": {
      "type": "parquet"
    }
  }
}
```

Current constraints:

- Only Snappy-compressed Parquet files are supported.
- 64-bit integer values that require JavaScript `BigInt` are not supported.

!!! info "Writing compatible Parquet files in R"

    The following example shows how to write compatible Parquet files in R
    using the `arrow` package:

    ```r
    library(arrow)
    library(dplyr)

    data.frame(x = 123L, y = 1.23) |>
      arrow_table() |>
      mutate(
        across(where(is.integer), ~ arrow::cast(., int32())),
        # Using float32 instead of double is optional but can significantly reduce file size
        across(where(is.double),  ~ arrow::cast(., float32()))
      ) |>
      write_parquet("data.parquet")
    ```

The implementation is based on
[hyparquet](https://github.com/hyparam/hyparquet).

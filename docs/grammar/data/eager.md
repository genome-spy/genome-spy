# Eager Data Sources

_Eager_ data sources load and process all available data during the
initialization stage. They are suitable for small data sets as they do not
support partial loading or loading in response to user interactions. However,
eager data sources are often more flexible and straightforward than
[lazy](lazy.md) ones.

GenomeSpy inputs eager data as tabular `"csv"`, `"tsv"`, `"json"`, and
[`"parquet"`](#parquet) files or as non-indexed [`"fasta"`](#fasta) files. Data
can be loaded from URLs or provided inline. You can also use generators to
generate data on the fly and further modify them using
[transforms](../transform/index.md).

The `data` property of the view specification describes a data source. The
following example loads a tab-delimited file. By default, GenomeSpy infers the
format from the file extension, ignoring a trailing compression suffix such as
`.gz`. Gzip-compressed URL resources are decompressed automatically. However,
in bioinformatics, CSV files are often actually tab-delimited, and you must
specify the `"tsv"` explicitly:

```json title="Example: Eagerly loading data from a URL"
{
  "data": {
    "url": "fileWithTabs.csv",
    "format": { "type": "tsv" }
  },
  ...
}
```

With the exception of url arrays and the unsupported geographical formats, the
data property of GenomeSpy is identical to Vega-Lite's
[data](https://vega.github.io/vega-lite/docs/data.html) property.

!!! warning "Type inference"

    GenomeSpy uses
    [vega-loader](https://github.com/vega/vega/tree/master/packages/vega-loader)
    to parse tabular data and infer its data types. Vega-loader is sometimes
    overly eager to interpret strings as a dates. In such cases, the field types
    need to be specified explicitly. On the other hand, explicit type
    specification also gives a significant performance boost to parsing
    performance.

!!! warning "Handling empty (NA) values"

    Empty or missing values must be presented as **empty strings** instead of `NA`
    that R writes by default. Otherwise type inference fails for numeric fields.

## URL Data

Data can be loaded from a URL using the `url` property. The URL can be absolute
or relative to the page where GenomeSpy is embedded.

Files stored as gzip-compressed resources on the server can be referenced
directly with their `.gz` URLs. GenomeSpy infers the underlying format from the
uncompressed extension, so `variants.tsv.gz` is treated as `"tsv"`.

In addition to loading data from a single URL, you can also load data from
multiple URLs by providing an array of URLs. This is useful when files have
different columns that are [folded](../transform/regex-fold.md) (pivoted) into a
long (tidy) format. The transformation pipeline is automatically initialized
for each URL, and the final data is a concatenation of the results from all
URLs.

```json title="Example: Loading data from multiple URLs"
{
  "data": {
    "url": [
      "fileWithTabs1.tsv",
      "fileWithTabs2.tsv"
    ],
    "format": { "type": "tsv" }
  },
  ...
}
```

When the number of URLs is large, it is more convenient to place the list of
files in a separate file instead of the view specification.

```json title="Example: Loading data from multiple URLs listed in a file"
{
  "data": {
    "url": { "urlsFromFile": "variant-file-list.tsv", "type": "tsv" },
    "format": { "type": "tsv" }
  },
  ...
}
```

The file containing the list of URLs must be a JSON file with a single string
array or a tabular file with a single column named `url`.

## Named Data

When embedding GenomeSpy in a web application or page, data can be added or
updated at runtime using the [API](../../api.md). Data sources are referenced by a
name, which is passed to the `updateNamedData` method:

```json
{
    "data": {
        "name": "myResults"
    }
    ...
}
```

```js
const api = await embed("#container", spec);
api.updateNamedData("myResults", [
  { x: 1, y: 2 },
  { x: 2, y: 3 },
]);
```

Although named data can be updated dynamically, it does not automatically
respond to user interactions. For practical examples of dynamically updated
named data, check the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package.

## Additional Formats

The following additional formats are supported as eager data with the `url` source.
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

```json
{
  "data": {
    "url": "regions.bed",
    "format": {
      "type": "bed"
    }
  }
}
```

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

```json
{
  "data": {
    "url": "events.bedpe",
    "format": {
      "type": "bedpe"
    }
  }
}
```

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
compression and faster column scans.
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

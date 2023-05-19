# Static Data Sources

_Static data_ lacks indexing capabilities, rendering it incapable of being
loaded partially or during subsequent user interactions. As a result, the
entirety of the non-indexed static data must be loaded during the application
startup. However, static data sources are often more flexible and
straightforward to use than dynamic data sources.

GenomeSpy inputs static data as tabular `"csv"`, `"tsv"`, and `"json"` files, or
non-indexed [`"fasta"`](#fasta) files. Data can be loaded from external files or
provided inline. You can also use generators to generate data on the fly and
modify them using [transforms](../transform/index.md).

The `data` property of the view specification describes a data source. The
following example loads a tab-delimited file. By default, the format is inferred
from the file extension. However, in bioinformatics, CSV files are often
actually tab-delimited and the `"tsv"` format must be specified explicitly:

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

!!! warning "Handling empty (NA) values"

    Empty or missing values must be presented as **empty strings** instead of `NA`
    that R writes by default. Otherwise type inference fails for numeric fields.

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

## Bioinformatic Formats

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
`"sequence"`. With the [`"flattenSequence"`](../transform/flatten-sequence.md)
transform you can split the sequences into individual bases (one object per
base) for easier visualization.

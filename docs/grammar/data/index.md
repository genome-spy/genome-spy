# Data Input

Like [Vega-Lite's data model](https://vega.github.io/vega-lite/docs/data.html),
GenomeSpy utilizes a tabular data structure as its fundamental data model,
resembling a spreadsheet or database table. Each data set in GenomeSpy is
considered to consist of a set of records, each containing various named data
fields.

In GenomeSpy, the `data` property within a view specification describes the
data source. In a hierarchically [composed](../composition/index.md) view
specification, the views inherit the data, which may be further
[transformed](../transform/index.md), from their parent views. However, each
view can also override the inherited data.

Non-indexed _[eager](eager.md)_ data, which is fully loaded during the
visualization initialization stage, can be provided as inline data (`values`) or
by specifying a URL from which the data can be loaded (`url`). Additionally, you
can use a `sequence` generator for generating sequences of numbers.

GenomeSpy provides several _[lazy](lazy.md)_ data sources that load data
on-demand in response to user interactions to support large genomic data sets
comprising millions of records. These data sources enable easy handling of
standard bioinformatic data formats such as [indexed
FASTA](lazy.md#indexed-fasta) and [BigWig](lazy.md#bigwig).

Furthermore, GenomeSpy enables the creation of an empty data source with a given
`name`. This data source can be dynamically updated using the
[API](eager.md#named-data), making it particularly useful when embedding
GenomeSpy in web applications.

- [Eager data](eager.md)
- [Lazy data](lazy.md)

# Data Input

Similar to [Vega-Lite's data
model](https://vega.github.io/vega-lite/docs/data.html), GenomeSpy utilizes a
tabular data structure as its fundamental data model, resembling a spreadsheet
or a database table. Each data set in GenomeSpy is considered to consist of a
set of records, each containing various named data fields.

In GenomeSpy, the `data` property within a view specification describes the
source of data. In a hierarchically [composed](../composition/index.md) view
specification, the views inherit the data, which may be further
[transformed](../transform/index.md), from their parent views. However, each
view can also override the inherited data.

[_Static_](static.md) data that is loaded during the visualization
initialization stage can be provided as inline data (`values`) or by specifying
a URL from which the data can be loaded (`url`). Additionally, you can use a
`sequenece` generator for generating sequences of numbers.

To support large genomic data sets comprising millions of records, GenomeSpy
provides several _[dynamic](dynamic.md)_ data sources that load data on-demand
in response to user interactions. These data sources enable an easy handling of
common bioinformatic data formats such as [indexed
FASTA](dynamic.md#indexed-fasta) and [BigWig](dynamic.md#bigwig).

GenomeSpy also allows the creation of an empty data source with a given `name`,
which you can dynamically update using the [API](static.md#named-data). This
feature is useful when GenomeSpy is embedded in web applications.

- [Static data](static.md)
- [Dynamic data](dynamic.md)

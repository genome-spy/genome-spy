# Data Input

GenomeSpy inputs tabular data as _CSV_, _TSV_, or _JSON_ files. Currently,
common bioinformatic data formats such as _BED_ or _BigWig_ are not directly
supported. They must be first converted into one of the tabular formats above.

GenomeSpy can load data from external files or use inline data. You
can also use generators to generate data on the fly and modify them using
[transforms](transform/index.md).

The `data` property of the view specification describes a data source. The
following example loads a tab-delimited file. By default, the format is
inferred from the file extension. However, in bioinformatics, `.csv` files
are often tab-delimited and the format must be specified explicitly.

```json
{
  "data": {
    "url": "fileWithTabs.csv",
    "format": { "type": "tsv" }
  },
  ...
}
```

With the exception of the geographical formats, the data property of GenomeSpy
is identical to Vega-Lite's
[data](https://vega.github.io/vega-lite/docs/data.html) property.

!!! warning "Type inference"

    GenomeSpy uses
    [vega-loader](https://github.com/vega/vega/tree/master/packages/vega-loader)
    to parse tabular data and infer its data types. Vega-loader is sometimes
    very eager to infer text as dates. In such cases, the field types need to
    be specified explicitly. On the other hand, explicit type specification also
    has a significant positive effect on parsing performance.

TODO: Grouped data, ungroup transform

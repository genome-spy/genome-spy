---
"@genome-spy/core": minor
---

The BAM lazy data source now supports a `tags` option for exposing SAM auxiliary
tags in encodings, filters, and tooltips. This makes it possible to visualize
haplotype assignments, cell barcodes, and other annotations stored in BAM records.

For example, adding `"tags": ["HP", "CB"]` to a BAM source definition exposes
`tag_HP` and `tag_CB` fields on each read. A field has the value `undefined` when
the read lacks the requested tag.

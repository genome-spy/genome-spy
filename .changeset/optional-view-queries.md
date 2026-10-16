---
"@genome-spy/core": minor
---

Add optional visualization data access through `@genome-spy/core/view-query`.
Apps can inspect track/source metadata, read loaded transformed records, query a
captured viewport or interval scope, and opt into reading retained source rows
before display transforms. Per-view scale access also supports unnamed scales.

Add `PointSelectionApi.setValue(keys)` to select loaded records using the source
unit view's `encoding.key`. Membership works across mark types and drives normal
conditional encodings and subscriptions. Apps keep thresholds, summaries, and
other analysis in their own code; data reads never fetch missing records.

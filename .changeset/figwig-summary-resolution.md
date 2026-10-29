---
"@genome-spy/core": minor
---

<!-- category: improvement -->

Use Figwig summaries at closer zoom levels in fast mode to avoid large raw-data
reads. The new `maxSummaryPixels` option controls the detail tradeoff independently
of raw-data binning; exact mode retains its existing resolution.

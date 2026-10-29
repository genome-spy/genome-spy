---
"@genome-spy/core": minor
---

<!-- category: improvement -->

Default Figwig browsing to fast mode and use summaries at closer zoom levels to
avoid large raw-data reads. Summary values are approximate and treat missing
bases as zero; set `mode: "exact"` for raw-derived, missing-aware bin means. The
new `maxSummaryPixels` option controls summary detail independently of raw binning.

---
"@genome-spy/core": patch
"@genome-spy/app": patch
---

<!-- category: improvement -->

Reduce unnecessary Figwig transfers by loading only requested index and summary
sections and reusing summary metadata independently of raw indexes. Integrity
checks for unused sections run when those sections are requested.

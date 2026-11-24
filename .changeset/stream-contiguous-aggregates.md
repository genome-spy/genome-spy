---
"@genome-spy/core": patch
---

<!-- category: improvement -->

Reduce buffering for single-field aggregates when the dataflow guarantees that
each group's rows arrive together.

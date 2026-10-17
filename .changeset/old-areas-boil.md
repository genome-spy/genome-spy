---
"@genome-spy/core": patch
---

<!-- category: improvement -->

Reduce the retained memory used by unique-ID indexes and speed up their
construction, improving loading and data updates for large datasets. Lookups
preserve current collector ordering and support IDs beyond the 32-bit range.
Speed up numeric array sorting while preserving ordinary-array results and
safe-integer precision.

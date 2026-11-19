---
"@genome-spy/core": minor
---

<!-- category: feature -->

Allow omitting the data type for direct numeric and color encodings that
explicitly set `scale: null`.

A disabled scale applies locally, so layers can combine direct values with
scaled encodings on the same channel.

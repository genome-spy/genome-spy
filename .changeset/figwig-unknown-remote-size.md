---
"@genome-spy/core": patch
"@genome-spy/app": patch
---

<!-- category: fix -->

Allow remote Figwig signal tracks and sample metadata to load when CORS does not
expose the `Content-Range` header. The updated reader continues to validate known
physical file sizes and reject truncated reads.

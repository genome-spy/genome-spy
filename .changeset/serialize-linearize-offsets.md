---
"@genome-spy/core": patch
---

<!-- category: fix -->

Serialize `linearizeGenomicCoordinate` offsets before embedding them in its
specialized setter. Malformed values remain data instead of being interpreted
as executable code, with no additional work in the per-row path.

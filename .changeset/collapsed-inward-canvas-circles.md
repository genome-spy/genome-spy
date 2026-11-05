---
"@genome-spy/core": patch
---

<!-- category: fix -->

Fix Canvas circle edge coverage when an inward stroke fills the entire interior.
Translucent fill and stroke now blend before the nominal circle is painted.

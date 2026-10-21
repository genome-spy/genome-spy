---
"@genome-spy/core": patch
---

<!-- category: fix -->

Reserve enough width for every column in vertical categorical legends. Legends
with multiple columns no longer clip later labels or overlap the plot because
only one column's width was allocated.

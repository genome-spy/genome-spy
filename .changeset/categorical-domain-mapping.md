---
"@genome-spy/core": patch
---

<!-- category: fix -->

Keep categorical positions, colors, and other ordinal styles aligned with the
current explicit domain when categories are reordered, removed, or restored.
This also fixes domains arriving after data has been encoded, while preserving
category identity for picking and selections.

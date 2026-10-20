---
"@genome-spy/core": patch
---

Fix WebGL charts with band rulers failing to load before the first pointer
event when no initial cursor coordinate is supplied. Keep the ruler working
as it appears and clears when the pointer enters and leaves the chart.

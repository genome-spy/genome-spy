---
"@genome-spy/core": major
---

<!-- category: improvement -->

Remove the legacy `rangeStep` option from band and point scales.

Use `width` or `height` with `{ step: ... }` for view sizing. For standalone or
offset scales, set an explicit `range`. Three unpadded bands at a step of `20`
use `[0, 60]`.

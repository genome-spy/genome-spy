---
"@genome-spy/core": minor
---

Derive scale settings from data with the new `values` transform, which publishes
a field as a read-only array parameter. For example, index-scale `gapPositions`
can now use cluster boundaries loaded from a file or calculated from metadata.

The new `branch` declaration runs a side pipeline without filtering or mutating
the main rows. Branches can tap the current input or use an independent eager
source, and ordinary parameter changes can update their outputs through cached
replay.

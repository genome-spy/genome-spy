---
"@genome-spy/core": patch
---

<!-- category: fix -->

Infer the row-ID encoding needed by point-selection conditions on marks with
picking disabled. Coordinated highlighting through shared outer selections no
longer requires an explicit `uniqueId` encoding on each consuming mark.

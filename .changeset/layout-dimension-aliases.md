---
"@genome-spy/core": patch
---

<!-- category: fix -->

Allow computed parameters to reference a view's automatic `width` and `height`
during initialization. Aliases now track layout changes correctly, while explicit
parameters with these names retain precedence.

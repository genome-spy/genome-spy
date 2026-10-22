---
"@genome-spy/core": patch
---

<!-- category: fix -->

Fix scale domain expressions and selection references to resolve parameters in
the view that declares the encoding channel, preserving that scope when the
channel is inherited. Child declarations can now use local parameters with a
shared scale.

If a parameter such as `width` or `height` shadows a value previously read from
the shared scale owner, declare a computed alias there, such as
`{ "name": "sharedWidth", "expr": "width" }`, and reference that alias in the
domain expression. Redeclare an inherited channel in the child when its domain
needs child-local parameters.

---
"@genome-spy/core": minor
"@genome-spy/playground": minor
---

Playground now underlines missing encoding fields, unknown parameter names, and
syntax errors in expressions and interaction filters, alongside the existing
data-loading diagnostics. The highlight follows formatting and disappears when
the specification is corrected.

Embedders can locate these errors using the `getSpecOrigin` option and
`getSpecErrorLocation(error)` helper. Data-loading reports include `errorLocation`
when a processing failure identifies an encoding or expression, so embedders can
point users to the declaration that needs correcting instead of the data URL.

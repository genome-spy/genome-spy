---
"@genome-spy/core": minor
---

Locate missing encoding fields and unknown parameter names in expressions using
the `getSpecOrigin` embed option and `getSpecErrorLocation(error)` helper.
Data-loading reports include `errorLocation` when a processing failure identifies
an encoding or expression, so embedders can point users to the declaration that
needs correcting instead of the data URL.

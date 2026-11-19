---
"@genome-spy/core": major
---

<!-- category: improvement -->

Remove the `@genome-spy/core/utils/setOperations.js` deep import.

Replace these helpers with native `Set` methods. To preserve the former
`intersection(a, b)` iteration order, filter the second set against the first
and construct a new set from the result.

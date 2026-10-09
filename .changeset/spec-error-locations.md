---
"@genome-spy/core": minor
"@genome-spy/playground": minor
---

Playground now underlines declarations responsible for missing encoding fields,
missing static top-level `datum` fields, invalid expressions and interaction
filters, invalid or duplicate parameter names, missing `push: "outer"` targets,
and transform construction failures such as invalid regular expressions,
alongside the existing data-loading diagnostics. Highlights follow formatting
and disappear when the specification is corrected.
Missing fields with spaces, punctuation, or escaped property names now report
errors instead of silently producing empty plots.
Missing flat fields in transform properties also highlight the affected property
or array entry, including grouping, sorting, and lookup fields.

Error displays and console reports include available specification locations.
Playground shows the message and specification path in an error card with a
"Show in editor" action. Data-loading failures retain their local indicators with
added location context.

Missing flat fields in encodings, transforms, and expressions now report an error
on any processed row, including expression references inside guards and
conditional branches. Ensure these fields are present in the input data or
produced by an earlier transform. For optional values, include
`null` (or `undefined` in JavaScript-provided data); use `isValid` when `null`
should count as missing. Computed keys and nested properties retain their existing
behavior.

Embedding applications can use the `getSpecOrigin` option and
`getSpecErrorLocation(error)` helper to connect errors to declarations in an
editor or generated specification. This supports editor diagnostics and feedback
for LLM agents that revise specifications. Data-loading reports include
`errorLocation` when a processing failure identifies an encoding, expression, or
transform, so embedders can point users to the declaration that needs correcting
instead of the data URL.

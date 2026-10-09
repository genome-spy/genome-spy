---
"@genome-spy/core": minor
"@genome-spy/playground": minor
---

Playground now underlines declarations responsible for missing encoding fields,
invalid expressions and interaction filters, duplicate parameter names, missing
`push: "outer"` targets, and transform construction failures such as invalid
regular expressions, alongside the existing data-loading diagnostics. Highlights
follow formatting and disappear when the specification is corrected.
Missing fields with spaces, punctuation, or escaped property names now report
errors instead of silently producing empty plots.

Embedding applications can use the `getSpecOrigin` option and
`getSpecErrorLocation(error)` helper to connect errors to declarations in an
editor or generated specification. This supports editor diagnostics and feedback
for LLM agents that revise specifications. Data-loading reports include
`errorLocation` when a processing failure identifies an encoding or expression,
so embedders can point users to the declaration that needs correcting instead of
the data URL.

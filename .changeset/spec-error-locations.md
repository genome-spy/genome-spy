---
"@genome-spy/core": major
"@genome-spy/playground": minor
---

Playground now underlines declarations responsible for missing encoding fields,
missing static top-level `datum` fields, invalid expressions and interaction
filters, duplicate parameter names, missing `push: "outer"` targets, and transform
construction failures such as invalid regular expressions, alongside the existing
data-loading diagnostics. Highlights
follow formatting and disappear when the specification is corrected.
Missing fields with spaces, punctuation, or escaped property names now report
errors instead of silently producing empty plots.

**Breaking:** Expressions now require statically referenced top-level `datum`
fields to exist on the first row reaching each evaluator, including references
inside guards and conditional branches. Ensure these fields are present in the
input data or produced by an earlier transform. For optional values, include
`null` (or `undefined` in JavaScript-provided data); use `isValid` when `null`
should count as missing. Computed keys and nested properties retain their existing
behavior.

Embedding applications can use the `getSpecOrigin` option and
`getSpecErrorLocation(error)` helper to connect errors to declarations in an
editor or generated specification. This supports editor diagnostics and feedback
for LLM agents that revise specifications. Data-loading reports include
`errorLocation` when a processing failure identifies an encoding or expression,
so embedders can point users to the declaration that needs correcting instead of
the data URL.

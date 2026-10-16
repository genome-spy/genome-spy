---
"@genome-spy/core": minor
---

Run an explicit `formula`, `filter`, `sample`, `aggregate`, or `window` pipeline
on viewport or interval-brush records with `ViewHandle.transformData()`. Analysis
uses an isolated flow and leaves the visualization unchanged. Input overflow
rejects before calculation; output limits apply after the complete pipeline.
A generated request schema is available as `@genome-spy/core/transform-data-schema.json`.

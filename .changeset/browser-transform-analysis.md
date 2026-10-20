---
"@genome-spy/core": minor
---

Run an explicit `formula`, `filter`, `sample`, `aggregate`, or `window` pipeline
on viewport or interval-brush records with `ViewHandle.data.transform()`. Analysis
uses an isolated flow and leaves the visualization unchanged. Input overflow
rejects before calculation; output limits apply after the complete pipeline.
Designed primarily for agentic use, it lets agents query loaded data and receive
summaries or selected records without loading the full raw dataset into their context.
A generated request schema is available as `@genome-spy/core/transform-data-schema.json`.

Record readback is grouped under `ViewHandle.data` alongside analysis. Replace
`view.readData(options)` with `view.data.read(options)` when using the readback
API added since the last release. Dataset updates remain under `view.datasets`.

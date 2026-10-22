---
"@genome-spy/core": minor
---

<!-- category: feature -->

Publish read-only array parameters from data with the new `values` transform,
for example to derive index-scale gaps from metadata. The new `branch`
declaration forks the current input for summaries while preserving the main
rows, and ordinary parameter changes can update outputs through cached replay.

Lazy genomic sources can also publish outputs from successfully loaded windows.
Aggregations span physical input files, and ungrouped empty input produces a
count of zero.

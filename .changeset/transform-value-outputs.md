---
"@genome-spy/core": minor
---

<!-- category: feature -->

Publish read-only parameters from data with the new `values` and `count`
transforms, for example to derive index-scale gaps from metadata or summarize a
result without removing its rows. The new `branch` declaration prepares outputs
in side pipelines while preserving the main rows, and ordinary parameter changes
can update outputs through cached replay.

Lazy genomic sources can also publish outputs from successfully loaded windows,
for example to display a message after a BigWig track loads an empty region.

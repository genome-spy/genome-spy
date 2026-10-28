---
"@genome-spy/app": minor
---

<!-- category: feature -->

Derive sample identity and display labels from a configured metadata source,
so Figwig and matrix datasets no longer need a separate sample-list file. Use
`samples.identity: "metadata"` for a single source or reference a source by id.
Identity preserves source order and loads independently of lazy metadata columns.

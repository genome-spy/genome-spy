---
"@genome-spy/core": minor
"@genome-spy/app": minor
"@genome-spy/app-agent": minor
---

<!-- category: feature -->

Add categorical membership to point selections with typed raw values, scoped
selection APIs, and expression helpers including allocation-free membership tests.
Link categorical positions, colors, and shapes across plots with independent scales.
Category selections also support App history, bookmarks, and agent parameter
actions without requiring record keys.

Point capabilities and snapshots now distinguish `membership: "records"` from
`"categories"`; after narrowing to `type: "point"`, check membership before reading
record `data` or category `encodings` and `values`. For semantic-zoom sampling,
record and interval leaves referenced by appearance conditions independently
preserve their matching rows, including under `and` and `not`. Category leaves
and conditions used only for drawing order do not preserve rows.

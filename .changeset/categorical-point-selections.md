---
"@genome-spy/core": major
---

<!-- category: feature -->

Add categorical membership to point selections with typed raw values, scoped
selection APIs, and expression helpers across WebGL, WebGPU, Canvas, and SVG.

Point capabilities and snapshots now distinguish `membership: "records"` from
`"categories"`; after narrowing to `type: "point"`, check membership before reading
record `data` or category `encodings` and `values`. For semantic-zoom sampling,
record and interval leaves referenced by appearance conditions independently
preserve their matching rows, including under `and` and `not`. Category leaves
and conditions used only for drawing order do not preserve rows.

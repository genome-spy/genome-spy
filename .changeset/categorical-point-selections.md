---
"@genome-spy/core": major
---

<!-- category: feature -->

Add categorical membership to point selections with typed raw values, scoped
selection APIs, and expression helpers. Point capabilities and snapshots now
distinguish `membership: "records"` from `"categories"`; after narrowing to
`type: "point"`, check membership before reading record `data` or category
`encodings` and `values`.

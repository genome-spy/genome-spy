---
"@genome-spy/core": minor
---

<!-- category: feature -->

Support dendrograms on categorical band scales, so heatmaps can encode original
sample and gene IDs. Each supplied tree can publish its ordered leaf categories
to a shared scale through parameter pushing, including when the tree presentation
is hidden. Shared outputs use bare ancestor parameter declarations, with ownership
inferred from the publishing transform. Existing index-scale dendrograms remain
compatible.

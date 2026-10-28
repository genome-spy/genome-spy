[GenomeSpy Core API](../index.md) / CoordinateQueryResult

# Type Alias: CoordinateQueryResult

> **CoordinateQueryResult** = \{ `kind`: `"coordinate"`; `interval`: [`CoordinateInterval`](CoordinateInterval.md); \} \| \{ `kind`: `"not-coordinate"`; \} \| \{ `kind`: `"invalid-coordinate"`; `code`: `"syntax"` \| `"unknown-contig"` \| `"bounds"` \| `"order"` \| `"ambiguous-contig"`; `message`: `string`; \}

Syntax-only results have the same shape as assembly-validated results.

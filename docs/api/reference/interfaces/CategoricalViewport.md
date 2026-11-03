[GenomeSpy Core API](../index.md) / CategoricalViewport

# Interface: CategoricalViewport

Exact navigation snapshot for a band or point scale.

## Properties

### interval

> **interval**: \[`number`, `number`\]

Half-open category-rank interval; endpoints may be fractional.

***

### gapRanks?

> `optional` **gapRanks?**: \[`number`, `number`\]

Fractional gap-edge ranks. Preserve these for exact restoration through grouping gaps.

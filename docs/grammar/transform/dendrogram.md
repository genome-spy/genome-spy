# Dendrogram

The `"dendrogram"` transform turns a precomputed clustering tree into
parent–child edges for a [link mark](../mark/link.md). It preserves merge heights
and computes node positions along an index or categorical band scale.

EXAMPLE examples/docs/grammar/transform/dendrogram/dendrogram.json height=320

This index-scale example uses an offset scale to keep branches aligned with
rows while zooming.

## Choosing a scale

|                    | [Index scale](../scale.md#index-scale)                  | [Band scale](#categorical-band-scales)              |
| ------------------ | ------------------------------------------------------- | --------------------------------------------------- |
| Leaf values        | Integer positions, typically dense: `0, 1, 2, …`        | Category IDs, such as `"Sample A"` or `"TP53"`      |
| Order              | Determined by the numeric indices                       | Determined by the order of categories in the domain |
| Sample/gene labels | Require separate metadata or a mapping from the indices | Can use the category values directly                |
| Navigation         | Zooming and panning                                     | Currently unsupported                               |
| Interval brushing  | Supported                                               | Currently unsupported                               |

In encodings, `"nominal"` and `"ordinal"` describe categorical data; `"band"` is the
positional scale type used to place those categories.

## Input tree

Each input row describes a node. The root's parent is `null`; every other parent
identifies another node. For an index scale, leaves have explicit integer
positions along the scale. Internal nodes need no row position.

```json
[
  { "id": "A", "parent": "AB", "height": 0, "row": 0 },
  { "id": "B", "parent": "AB", "height": 0, "row": 1 },
  { "id": "C", "parent": "root", "height": 0, "row": 2 },
  { "id": "AB", "parent": "root", "height": 1 },
  { "id": "root", "parent": null, "height": 3 }
]
```

```json
{
  "type": "dendrogram",
  "key": "id",
  "parentKey": "parent",
  "height": "height",
  "leafIndex": "row"
}
```

Each subtree's leaves must form a contiguous run in the ordered leaf sequence;
indices may have gaps. Input row order does not determine leaf order.

With faceted data, each facet is processed as a separate tree. Otherwise, each
input file is processed as a separate tree.

For a data-preparation workflow, see the
[clustered heatmap example](../../examples/generic/clustered-heatmap.md#preparing-the-data).

## Categorical band scales

To generate a category order from the tree, use `leaf` for sample or gene IDs
and `siblingOrder` for the order of children under each parent.

```json
{
  "type": "dendrogram",
  "key": "id",
  "parentKey": "parent",
  "height": "height",
  "leaf": "sample",
  "siblingOrder": "childOrder",
  "param": { "name": "sampleOrder", "push": "outer" }
}
```

The transform traverses the ordered tree and can publish its leaf categories
with `param`. A string declares a local output. To share the domain with a
sibling heatmap, declare `{ "name": "sampleOrder" }` in their common ancestor's
`params`, then push as above. Set the shared band scale's
`domain` to `{ "expr": "sampleOrder" }`. Each axis can have its own tree and
output; no numeric heatmap positions or separate domain arrays are needed.

The example below shows imaginary z scores for four samples and four genes,
with a precomputed tree on each axis.

EXAMPLE examples/docs/grammar/transform/dendrogram/clustered-heatmap-band.json height=470 spechidden

To align the tree with an existing band domain, use `leafOrder` instead of
`siblingOrder`. Each subtree must remain contiguous among the tree's leaves,
even if the domain includes extra categories that reserve band slots.

Publishing an order with `param` requires a single tree and does not support
facets. See [output parameters](values.md#output-parameters) for scope and
lifecycle rules.

## Output and placement

One output row represents each non-root node's incoming edge. Child metadata,
such as labels or colors, is copied to that row. Generated fields overwrite
same-named metadata. The optional `as` array changes the output field names.

| Fields                         | Meaning                                     |
| ------------------------------ | ------------------------------------------- |
| `sourceId`, `targetId`         | Parent and child node IDs                   |
| `sourceHeight`, `targetHeight` | Their supplied merge heights                |
| `sourceIndex`, `targetIndex`   | Integer row anchors                         |
| `sourceValue`, `targetValue`   | Category anchors in categorical mode        |
| `sourceOffset`, `targetOffset` | Relative displacements from the row anchors |

For the [input tree](#input-tree) above, the generated fields are shown below.
Each column is one output row; copied child metadata is omitted.

| Field          | `AB` → `A` | `AB` → `B` | `root` → `C` | `root` → `AB` |
| -------------- | ---------- | ---------- | ------------ | ------------- |
| `sourceId`     | `"AB"`     | `"AB"`     | `"root"`     | `"root"`      |
| `targetId`     | `"A"`      | `"B"`      | `"C"`        | `"AB"`        |
| `sourceHeight` | 1          | 1          | 3            | 3             |
| `targetHeight` | 0          | 0          | 0            | 1             |
| `sourceIndex`  | 0          | 0          | 1            | 1             |
| `targetIndex`  | 0          | 1          | 2            | 0             |
| `sourceOffset` | 0.5        | 0.5        | 0.25         | 0.25          |
| `targetOffset` | 0          | 0          | 0            | 0.5           |

Internal positions are midpoints of the outermost child positions, split into
an anchor and a fractional offset. Band scales use `sourceValue` and `targetValue`
category anchors instead of `sourceIndex` and `targetIndex`.

For a horizontal dendrogram, encode heights on `x`/`x2`, anchors on `y`/`y2`
with `band: 0.5`, and fractions on `yOffset`/`y2Offset`. Give the primary offset
scale an explicit domain `[0, 1]` and range
`[0, { "expr": "-height * bandstep('y', height)" }]`. Both offset channels then use
the full padded row step. See [offset channels](../mark/index.md#offset-channels)
and the [`bandstep()` helper](../expressions.md#bandstep).

Empty input or a tree with a single node produces no edges.

## Parameters

### Common options

SCHEMA IndexDendrogramParams key parentKey height as description

### Index scales

SCHEMA IndexDendrogramParams leafIndex

### Band scales

SCHEMA SiblingOrderedDendrogramParams leaf param

Choose exactly one ordering option:

#### Order from the tree

SCHEMA SiblingOrderedDendrogramParams siblingOrder

#### Explicit leaf order

SCHEMA ExplicitlyOrderedDendrogramParams leafOrder

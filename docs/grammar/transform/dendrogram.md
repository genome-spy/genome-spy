# Dendrogram

The `"dendrogram"` transform turns a precomputed clustering tree into
parent–child edges for a [link mark](../mark/link.md). It preserves merge heights
and computes node positions along an index or categorical band scale.

EXAMPLE examples/docs/grammar/transform/dendrogram/dendrogram.json height=320

The example uses supplied merge heights and a single link mark. The offset scale
converts each derived fraction to part of the current row step. Clustering and
leaf ordering happen before the specification is rendered.

## Input tree

Each input row describes a node. The root's parent is `null`; every other parent
identifies another node. Leaves have explicit integer positions along the index
scale. Internal nodes need no row position.

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

Node IDs may be strings or finite numbers. IDs and leaf indices must be unique.
Each subtree's leaves must form a contiguous run in the ordered leaf sequence;
the indices themselves may have holes. Input row order is independent of leaf
order. Missing parents, cycles, and incompatible leaf orders are rejected.
The transform supports binary, unary, and multifurcating trees.

Clustering is performed before supplying the tree. A
[SciPy linkage matrix](https://docs.scipy.org/doc/scipy/reference/generated/scipy.cluster.hierarchy.linkage.html)
can be converted by numbering leaves `0…n−1` and merge nodes `n+i`, assigning
each merge's two children their parent ID, and copying the third matrix column
to the merge height. Give leaves height zero and use a chosen leaf permutation
to assign their row positions. In an
[R `hclust` object](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/hclust.html),
negative `merge` references identify leaves and positive references identify
earlier merges; copy `height` and use `order` to assign zero-based row positions.
Keep labels as separate metadata, so node identity remains independent of order.

## Categorical band scales

Categorical heatmaps can encode their original sample and gene IDs directly.
Use `leaf` for the category field and `siblingOrder` for a numeric ordering field
on every non-root node. Sibling ranks must be distinct within each parent; they
may repeat under different parents. Internal nodes need no category and the
root needs no rank. Input row order does not determine orientation.

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

Categories must be unique strings, finite numbers, or booleans. Numeric `1`
and string `"1"` remain distinct. For intentional external alignment, replace
`siblingOrder` with `leafOrder`: a complete domain array or an expression reading
ordinary parameters. Include every leaf; extra categories reserve band slots.
Subtree leaves must remain contiguous among actual tree leaves. Transform outputs
and scales derived from them cannot feed `leafOrder`.

Publication supports one unfaceted tree from an eager source per completed flow.
A single leaf publishes its category with no edges; empty input publishes `[]`.
Loading or invalid input retains the last successful domain. Unchanged arrays
retain identity and do not notify consumers again. See
[output parameters](values.md#output-parameters) for pushing and lifecycle limits.

See the [two-axis categorical heatmap](../../examples/generic/clustered-heatmap-band.md)
for a complete example with imaginary z scores.

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

An internal node is placed midway between its extreme direct children. For an
unbalanced tree, positions may include quarters or eighths of a row. The
transform separates each position into an integer anchor and a fraction, so the
index scale continues to receive integers.

Categorical mode emits `sourceValue` and `targetValue` instead of the index
fields. Each names the category at the integer part of the node's leaf rank;
the offset fields contain the remaining fraction. The same padded-step offsets
work on band scales, including reversal and resize, without recomputing layout.

For a horizontal dendrogram, encode heights on `x`/`x2`, anchors on `y`/`y2`
with `band: 0.5`, and fractions on `yOffset`/`y2Offset`. Give the primary offset
scale an explicit domain `[0, 1]` and range
`[0, { "expr": "-height * bandstep('y', height)" }]`. Both offset channels then use
the full padded row step. See [offset channels](../mark/index.md#offset-channels)
and the [`bandstep()` helper](../expressions.md#bandstep).

On index scales, zoom and pan update scale mappings without recomputing the tree.
Resize works in both modes.
Grouping gaps can move parents away from their children's visual midpoints;
branches remain connected and leaves remain aligned. With multifurcations,
separate edges may overlap on a shared trunk, so transparency and picking follow
ordinary paint order. Point selections and tooltips identify the child edge;
index-scale interval selections retain the link mark's endpoint semantics.
Index heatmaps continue to select integer rows; band interval brushing is unsupported.

Without publication, a facet contains one complete tree and can span several
physical files. Outside facets, each input file contains one tree. Empty input or a single leaf
produces no edges. Heights are preserved, including linkage inversions. Very
small derived fractions near large row indices retain JavaScript's floating-point
precision limits.

## Parameters

SCHEMA DendrogramParams

# Dendrograms on categorical band scales

Status: proposed; implementation has not started.

## Goal

Support a clustered heatmap whose y axis contains sample names, whose x axis
contains gene names, and whose cells contain synthetic z scores. Both axes use
categorical band scales. A sample dendrogram sits to the left and a gene
dendrogram sits above the matrix. Authors should not need numeric row/column
fields or formula/lookup transforms to translate dendrogram anchors to categories.

Keep existing index-scale specifications and their output unchanged. Retain
precomputed clustering, supplied merge heights, and the existing link marks.

## Current implementation and constraints

Investigated at local commit `3fb913668` on `master`.

- `packages/core/src/data/transforms/dendrogram.js` validates integer
  `leafIndex` values, computes internal positions, and emits integer anchors
  plus fractional offsets. The transform does not consult scales.
- `packages/core/src/spec/transform.d.ts` exposes only that numeric input mode.
  The eight output slots are IDs, heights, anchors, and offsets.
- `packages/core/src/marks/link.js` supports ordinary positional scales and
  secondary endpoint offsets. It does not require an index scale.
- `packages/core/src/utils/expression.js` already implements signed
  `bandstep()` for band, point, index, and locus scales. Its step includes inner
  padding; using `bandwidth()` instead would misplace internal joins.
- `packages/core/src/scales/scalePosition.js` already supports band-center
  placement. Existing immediate rendering, SVG, and GPU paths should consume
  categorical anchors through their ordinary encoders.
- Band domains must be explicit. The domain array determines category order;
  stable GPU category IDs are a separate concern and must not become layout ranks.
- `packages/core/src/scales/scaleInstanceManager.js` explicitly defers dynamic
  explicit categorical reordering/removal on WebGL. Initial asynchronous
  publication of an ordered domain can encounter the same identity/order issue.
- `packages/core/src/rendering/svg/dendrogram.test.js` and
  `packages/core/scripts/testDendrogramRenderers.mjs` already exercise alignment,
  fractional offsets, interaction, and several renderers for index scales.
- The existing DepMap example is intentionally a zoomable index-scale example.
  Add a smaller band example rather than replace it.

Baseline sizes: dendrogram implementation 258 lines; transform tests 285;
SVG dendrogram tests 141; endpoint-offset tests 211. Measure the focused diff
after implementation and recheck any growth outside categorical normalization,
validation, and meaningful regression coverage.

## Established designs

[D3 band scales](https://d3js.org/d3-scale/band) map domain values through an
ordered category index and separate band width from band step. Follow that
model: use ranks to calculate the tree and category values to encode its marks.

[Vega's tree transform](https://vega.github.io/vega/docs/transforms/tree/) keeps
tree layout coordinates separate from display projection. Preserve GenomeSpy's
equivalent boundary, including its supplied merge heights and current midpoint
convention, rather than introduce a scale-aware tree layout or replace it with
a generic hierarchy layout. These are design comparisons; no upstream code
needs to be copied or adapted.

## Proposed public contract

Extend `DendrogramParams` with two mutually exclusive input modes. Use a shared
base and a TypeScript union so schema generation and runtime validation enforce
the same contract.

| Mode                    | Required properties                             | Default anchor output fields |
| ----------------------- | ----------------------------------------------- | ---------------------------- |
| Existing numeric layout | `leafIndex: Field`                              | `sourceIndex`, `targetIndex` |
| Categorical layout      | `leaf: Field`, `leafOrder: Scalar[] \| ExprRef` | `sourceValue`, `targetValue` |

`key`, `parentKey`, `height`, and the optional eight-element `as` tuple retain
their meanings. In categorical mode, tuple positions five and six contain
category anchors; the other slots keep their existing semantics. Do not emit
additional numeric-index aliases or change existing numeric defaults.

Example sample-tree transform, using proposed syntax:

```json
{
  "type": "dendrogram",
  "key": "id",
  "parentKey": "parent",
  "height": "height",
  "leaf": "sample",
  "leafOrder": { "expr": "sampleOrder" }
}
```

Declare the order once at the common composition owner and use it for both
the transform and its shared scale:

```json
{
  "params": [
    {
      "name": "sampleOrder",
      "value": ["Sample C", "Sample A", "Sample D", "Sample B"]
    },
    { "name": "geneOrder", "value": ["TP53", "MYC", "EGFR", "BRCA1"] }
  ],
  "scales": {
    "x": {
      "type": "band",
      "domain": { "expr": "geneOrder" },
      "paddingInner": 0.08,
      "paddingOuter": 0.12
    },
    "y": {
      "type": "band",
      "domain": { "expr": "sampleOrder" },
      "paddingInner": 0.08,
      "paddingOuter": 0.12
    }
  }
}
```

This is a shared configuration fragment, not a complete specification. Put its
parameters and scales in the same effective owner scope, including when a title
creates an implicit wrapper. Verify the final example's resolved ownership.

### Ordering and validation

- `leaf` identifies a field on leaf records, independent of the tree node ID.
  Internal nodes need no value in that field.
- Categories are strings, finite numbers, or booleans, matching `Scalar`.
  Keep typed values distinct, such as `1` and `"1"`.
- `leafOrder` is the full ordered category domain, not a sort direction or a
  list of tree node IDs. It must contain unique valid scalars. Reject missing
  categories, duplicate leaf categories, malformed arrays, and mixed input modes.
- Extra domain categories are allowed and reserve ordinary band slots. Use
  their full-domain ranks for layout. Check subtree contiguity in the sequence
  of tree leaves, preserving the existing treatment of holes in numeric indices.
- Preserve missing-parent, root, cycle, height, and tree-order validation.
  Numeric mode keeps its current integer bounds and unordered-input contract.
- Read an expression-backed order as a batch-stable snapshot through existing
  transform expression/replay machinery. Rebuild the category-to-rank map when
  that ordered value changes; avoid per-row expression evaluation.
- The supported initial visualization uses a fixed categorical domain for the
  embed lifetime. Reactive input evaluation must not be advertised as general
  live band reordering support while the WebGL limitation remains.

### Layout and placement

Normalize each leaf category to its rank in `leafOrder`. Run the existing tree
validation and midpoint algorithm on those numeric positions. For a position
`p`, emit `leafOrder[Math.floor(p)]` as its anchor and `p % 1` as its offset.
For example, position `1.25` uses category `leafOrder[1]` with offset `0.25`.
That anchor is a positioning reference; it is not the internal node's identity.

Keep one tree-layout implementation. Numeric mode uses the same layout and its
current integer-anchor emission. Preserve child metadata, fresh edge identities,
file provenance, reset behavior, and facet isolation.

The horizontal sample dendrogram uses:

```json
{
  "y": { "field": "sourceValue", "type": "nominal", "band": 0.5 },
  "y2": { "field": "targetValue", "band": 0.5 },
  "yOffset": {
    "field": "sourceOffset",
    "type": "quantitative",
    "scale": {
      "domain": [0, 1],
      "range": [0, { "expr": "-height * bandstep('y', height)" }]
    }
  },
  "y2Offset": { "field": "targetOffset" }
}
```

Its x/x2 channels encode source/target merge heights. The vertical gene tree
uses categorical x/x2, quantitative y/y2, and x/x2 offsets with
`width * bandstep('x', width)`. Explicit shared `type: "band"` is needed for
link marks, whose nominal positional defaults must not choose another scale.
Use the existing signs and `band: 0.5` behavior for normal and reversed scales.
Resizing and padding changes update projection without rerunning tree layout.

## Required example

Create `examples/docs/examples/generic/clustered-heatmap-band.json` and a
matching documentation page. Use one `surround` with top and left dendrograms
and the heatmap as `spec`. Both trees receive the ordinary order parameters
above; the heatmap directly encodes `sample` on y and `gene` on x.

Use this deterministic, explicitly imaginary matrix, stored as 16 inline
`{ sample, gene, z }` records in the specification:

| Sample / gene | TP53 |  MYC | EGFR | BRCA1 |
| ------------- | ---: | ---: | ---: | ----: |
| Sample C      |  1.6 |  1.1 | -0.9 |  -1.4 |
| Sample A      |  1.2 |  0.8 | -1.1 |  -0.8 |
| Sample D      | -0.4 | -0.7 |  1.3 |   0.9 |
| Sample B      | -1.5 | -1.2 |  0.8 |   1.5 |

Provide two small inline, precomputed illustrative trees with categorical leaf
fields and no numeric row/column fields:

- Sample tree: merge C/A at height 0.6, merge that group with D at 1.4, then
  merge with B at 2.6. Its unbalanced structure exercises fractional joins.
- Gene tree: merge TP53/MYC at 0.7, EGFR/BRCA1 at 0.9, then merge at 2.2.

Show sample and gene labels on ordinary categorical axes. Use a diverging z-score
color scale centered at zero, with domain `[-2, 2]`, and tooltips containing the
original sample, gene, and z value. Explain that these values and trees are
illustrative, rather than claim that GenomeSpy computed a clustering.

The deliberate nonalphabetical sample/gene order must be visible. Exercise
nonzero inner/outer padding, container resizing, and reversed sample direction
in tests. Keep the example readable and offline: no hosted data or preprocessing
script is necessary. Retain the existing index example for zoom, pan, and gaps.

## Relationship to issue #513 and draft PR #575

[Issue #513](https://github.com/genome-spy/genome-spy/issues/513), "Allow FlowNodes
to publish reactive parameters," addresses a useful next step: derive a band
domain from a completed tree rather than author an order array separately.

[Draft PR #575](https://github.com/genome-spy/genome-spy/pull/575), inspected at
`2c41f9657a56588499cb70e52111cbaace47e7c4`, supplies producer-owned array outputs,
`values`, and structural `branch`. It remains a draft, and explicitly defers
output-driven dataflow scheduling and lazy-source outputs. Its current flow-input
guards reject published output parameters as inputs to other transforms.

Consequences for this plan:

1. Initial categorical support does not depend on #575. A shared ordinary
   order parameter already gives the scale and transform one source of truth.
2. Do not demonstrate a `values`-published `sampleOrder` consumed by
   `dendrogram.leafOrder`, or an indirect version using `domain('y')`. That
   would require the downstream-flow ordering that #575 deliberately rejects.
3. A later integration should let the tree layout itself publish its ordered
   categories, using #575's output binding and successful-completion boundary.
   Then dependency direction is tree layout -> order output -> band scale;
   the producing transform does not read that scale or its own output.
4. `values` over the current edge rows is insufficient: parent anchors repeat
   and are not a complete ordered leaf list. Use the layout's actual leaf order.
5. Reuse output equality, read-only ownership, initialization, scope, failure,
   and disposal contracts. Do not implement a second publisher or scheduler.

The tree-owned extension needs a separate design increment after #575's API is
settled. Settle where leaf order originates when `leafOrder` is omitted, how
the output is declared, and how one producer represents files/facets. Do not
silently pick the last tree's order for a multi-tree flow.

Also resolve scope and rendering before claiming the extension works end to
end. A producer in a side-track scope cannot publish directly into an ancestor's
scale scope under #575. One possible composition is an outer vconcat owning
the gene-tree pipeline/x scale, with a gene-tree mark above a sample-tree-owned
surround/y scale containing the matrix. Marks inherit their producer's edges;
the matrix overrides its data. Verify exported plot alignment rather than add
fake views, duplicate layout pipelines, or a named-dataset subsystem.

Finally, test matrix-first and tree-first asynchronous completion on every live
backend. A nonempty published domain arriving after category IDs were assigned
must still use its intended order. The current WebGL limitation can make this
a prerequisite even for initial publication, not merely later interactive
reordering. Do not work around it by assuming URL load order or rebuilding
whole specifications. Keep that follow-up separate from basic band support.

## Non-goals and alternatives

- No clustering algorithm, automatic optimal leaf ordering, tree pruning,
  categorical zoom/pan, grouping gaps for bands, or general category sorting.
- No changes to link geometry, picking semantics, renderer APIs, or the App's
  sample-order state unless the representative tests expose a concrete defect.
- No dependency on #575's unfinished lazy-output or flow-scheduling work.
- Reject a scale-aware dendrogram transform: it would couple layout to views,
  create domain feedback risks, and complicate standalone transform use.
- Reject documenting manual lookup/formula mappings as the feature: the goal
  is to remove that authoring burden.
- Reject replacing all anchors with continuous ranks: it would bypass shared
  categorical scales and weaken existing index behavior and selection semantics.
- Keep required explicit ordering rather than infer order from arbitrary tree
  row arrival or alphabetically sort sample/gene identifiers.

## Implementation milestones

### 1. Add categorical layout inputs and outputs

Outcome: literal and ordinary-parameter-backed categorical order produce
category anchors and fractional offsets through the existing layout.

Affected areas: `spec/transform.d.ts`, `data/transforms/dendrogram.js`, its tests,
and `spec/schema.test.js`. Follow the existing transform expression lifecycle;
do not add a second tree layout, rank owner, or replay queue.

Verification: retain numeric behavior; cover a deliberately shuffled tree with
nonalphabetical categories, internal fractional anchors, extra domain slots,
typed scalar identity, renamed outputs, and invalid/missing/duplicate categories.
Use representative boundary cases instead of duplicating the existing tree
validation matrix. A focused real spec test must exercise parameter scope,
the collector's category values, and the shared band domain. Preserve facet/file
isolation and dataset replacement with the same categorical domain.

Docs/migration: document both input modes and mode-specific defaults in the
transform reference using `write-genomespy-docs`; regenerate schemas. Existing
numeric users need no migration. Use `write-genomespy-changeset` for a Core
minor feature fragment and reuse it for the remaining milestone.

Tentative commit: `feat(core): support categorical dendrogram anchors`

Review gate: public grammar and generated schema, tree-layout equivalence,
batch/replay semantics, and downstream category encoders.

### 2. Verify both axes and deliver the synthetic heatmap

Outcome: a documented 4-by-4 categorical heatmap renders both trees in alignment
on Canvas2D, WebGL, WebGPU, and SVG export.

Affected areas: the new shared example and documentation page, docs example
index/navigation, `rendering/svg/dendrogram.test.js`, and
`scripts/testDendrogramRenderers.mjs`. Prefer extending the existing test harness
with a band fixture over copying it. Follow `examples/README.md` and the
`test-genomespy-views`, `debug-genomespy-web`, and documentation skills.

Verification: assert shared scale resolution, leaf endpoints at cell centers on
both axes, connected internal joins, preserved merge heights, and ordinary
categorical axis labels. Cover resize, nonzero padding, sample reversal, and
one diagonal-link presentation. Verify GPU/Canvas pixels as well as SVG geometry;
SVG export alone does not verify GPU category mapping. Smoke-test edge picking,
tooltips, point selection, and PNG/SVG export. Keep index navigation regressions.
Do not promise interval brushing or navigation on a noninvertible band scale.

Docs/migration: add the polished example and screenshot, explain shared order
parameters and the index/band tradeoff, and link from the dendrogram reference.
Build schemas before editing example specs. Update the feature changeset.

Tentative commit: `docs(core): demonstrate clustered heatmaps on band scales`

Review gate: inspect final cross-renderer integration and the actual example,
including scale ownership, axes, labels, selections, and export.

## Final integration verification and acceptance

- [ ] The example uses sample strings on y and gene strings on x, with all 16
      imaginary z-score cells and two precomputed dendrograms.
- [ ] No author-provided numeric positions or index-to-category mappings appear
      in that example. Each category order is declared once.
- [ ] Leaves align with their corresponding cell centers, internal branches
      stay connected, and merge heights remain correct in both orientations.
- [ ] Padding, reversal, resize, categorical labels, picking, and export agree
      across the live backends and SVG within appropriate pixel tolerances.
- [ ] Existing index-mode outputs, zoom/pan, grouping gaps, file/facet behavior,
      and fresh edge identities retain their contracts.
- [ ] Focused Vitest suites use `--reporter=agent`; Core types, lint, schemas,
      shared-example validation, docs generation/build, and release checks pass.
      Run the complete unit suite if expression/runtime or shared encoder code
      changes beyond the dendrogram implementation.
- [ ] Run `npm -w @genome-spy/core run test:dendrogram:renderers` and inspect
      the new synthetic example plus `dendrogram-gaps.json` and the existing
      clustered DepMap heatmap. Exercise band resize/reversal and index
      navigation/reset. Record unavailable backend checks explicitly.
- [ ] Review related tests for overlapping implementation assertions; preserve
      behavioral contracts and keep representative subsystem/rendered tests.
- [ ] Assess the focused production-code delta and simplify duplicated paths.
- [ ] Reconcile every task, commit the final task record when delivery is
      authorized, and delete this temporary plan in a later commit before a PR.

Open review questions are limited to the public naming (`leaf`, `leafOrder`,
`sourceValue`, `targetValue`) and schema presentation of the union. The selected
initial design and example do not wait on a scheduler or renderer redesign.
Tree-published domains are a documented follow-up, outside these milestones.

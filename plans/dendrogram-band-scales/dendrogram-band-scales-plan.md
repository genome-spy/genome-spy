# Dendrograms on categorical band scales

Status: implementation underway; milestones 1 and 2 are complete. This branch is stacked on
`codex/transform-value-outputs` ([PR #575](https://github.com/genome-spy/genome-spy/pull/575)).

## Goal and dependency

Support a heatmap with sample IDs on y, gene IDs on x, synthetic z scores in the
cells, a sample dendrogram on the left, and a gene dendrogram above. Each
precomputed tree supplies its own ordering. Its dendrogram transform emits
categorical anchors and publishes that order for the corresponding shared band
scale. Matrix cells and annotation tracks keep encoding their original IDs.
Authors do not maintain separate domain arrays or numeric matrix positions.

Use #575's producer-owned outputs as a prerequisite, following
[issue #513](https://github.com/genome-spy/genome-spy/issues/513). Do not build a
second publisher, scheduler, or named-dataset system. Preserve existing numeric
`leafIndex` specifications and outputs. Computing the clustering itself remains
a separate feature; this increment handles supplied trees.

The stack was inspected at #575 head `f014c90d2420dc49f8169486958743d034b185e6`.
It includes `968531599`, the WebGL categorical-mapping fix from #595. Dynamic
categorical domains are now a supported foundation, including data arriving
before its explicit domain. Keep that behavior in integration verification.
When #575 merges, rebase this branch onto `master` and retarget any stacked PR.

## Current implementation and architectural boundaries

Abbreviated source paths are relative to `packages/core/src/`; other paths are
repository-relative.

- `packages/core/src/data/transforms/dendrogram.js` buffers a tree, validates
  integer leaf positions, and computes internal midpoints. Its eight output
  fields describe edge IDs, heights, integer anchors, and fractional offsets.
- `packages/core/src/data/flowOutput.js` and
  `packages/core/src/paramRuntime/viewParamRuntime.js` provide #575's read-only
  array outputs and successful source/replay publication boundary. Declaration
  discovery currently recognizes `values`; output ownership is local to a view.
- `packages/core/src/data/transforms/values.js` projects a scalar field into an
  array. It must not become an obligatory adapter for another transform that
  already computes an ordered array. Dendrogram edge rows repeat anchors and
  cannot reconstruct the complete leaf domain, especially for a single leaf.
- `packages/core/src/view/view.js` reserves output declarations, while
  `view/flowBuilder.js`, `data/flowHandle.js`, and dataflow initialization/pruning
  own producer paths and lifetimes. Extend those existing boundaries when
  resolving an ancestor-owned output; do not equate layout ancestry with a data
  dependency or put GPU state in views.
- The existing `link` mark, band-center placement, signed `bandstep()`, and
  secondary endpoint offsets already support categorical projection. Changes to
  renderer algorithms are not expected.
- Shared scales resolve expressions in their owner's lexical scope. A side
  view's local output is invisible to its parent and siblings. #575's root-owned
  summary branches solve the gap example but do not directly express two side
  views publishing their own orders into one ordinary `surround`.
- #575 rejects published outputs as source/transform inputs. This feature needs
  only tree-to-scale publication and must preserve that rejection.

The existing implementation is 258 lines; its transform tests are 285 and its
SVG dendrogram tests 141. Record the focused production-code delta during
implementation and justify growth in shared publication/lifecycle code.

## Design references

[D3 band scales](https://d3js.org/d3-scale/band) separate category identity from
ordered display slots. Compute tree positions in numeric rank space, then emit
category values for the ordinary scale encoders.

[Vega tree layout](https://vega.github.io/vega/docs/transforms/tree/) keeps layout
coordinates independent of their display projection. Preserve GenomeSpy's
existing supplied heights and midpoint convention. Reuse #575's transform-value
publication design rather than couple tree layout to a live scale. These are
architectural references; no upstream code needs copying or adaptation.

## Public contract

All new syntax below is proposed. Final spelling is an API review gate; the
ownership, ordering, and lifecycle semantics must be resolved before implementing
rendered examples.

### Numeric compatibility and categorical mode

Keep numeric mode unchanged: `leafIndex: Field`, integer anchors named
`sourceIndex`/`targetIndex`, existing bounds, gaps in indices, and the same
file/facet behavior. Do not require publication or a view runtime for pure numeric
layout.

Categorical mode uses `leaf: Field`, an ordering input described below, and an
optional `param` output declaration. Default anchor fields become `sourceValue`
and `targetValue`; IDs, heights, offsets, child metadata, and fresh edge identity
retain their meanings. The eight-element `as` tuple retains its slot semantics.
The presence of `leaf` selects categorical mode; reject conflicting numeric mode
properties through a type union, generated schema, and runtime validation.

Categories are strings, finite numbers, or booleans, matching `Scalar`. Keep typed
values distinct, such as `1` and `"1"`. Reject duplicate leaf categories and retain
all existing node-ID, parent, root, cycle, height, and contiguity validation.

### Tree-owned ordering

Publication does not discover a biologically meaningful order from an unordered
parent table. Give categorical mode an explicit structural ordering input:

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

`siblingOrder` names a finite numeric ordering field on each non-root node.
Values must be distinct within each sibling set; they may repeat in different
sets and need not be consecutive. Sort each node's children by that field and
traverse the ordered tree left-to-right. Assign dense ranks to the resulting leaf
categories. This works for unary, binary, and multifurcating trees. The root needs
no sibling rank, and internal nodes need no leaf category. Input row/file arrival
order does not choose branch orientations.

The tree itself therefore carries its chosen orientation, using local child
ranks rather than global heatmap row/column positions. A future clustering
transform can supply those orientations after optional optimal leaf ordering.
This feature does not perform clustering or optimize the supplied order.

Retain an optional alternative for externally controlled alignment:
`leafOrder: Scalar[] | ExprRef` instead of `siblingOrder`. It lists the complete
ordered domain and may refer to ordinary parameters. Require unique valid values
and include every leaf category. Extra categories reserve normal band slots, as
holes do in numeric input. Use full-domain ranks and validate subtree contiguity
in the sequence of actual leaves. Publish that same complete domain if `param`
is present. Read expression inputs through existing batch-stable replay helpers.
Do not allow outputs, including the transform's own output or `domain()` derived
from it, to feed this input. This mode is optional; the primary example must use
structural order and no hand-written domain arrays.

Require exactly one categorical ordering input. Numeric mode retains its existing
unordered-input contract. Categorical layout without `param` remains usable for
standalone computation or externally supplied band domains.

### Explicit output ownership

A string `param: "sampleOrder"` keeps #575's local declaration semantics. For a
shared output, explicitly reserve a read-only output slot at the ancestor owner:

```json
{
  "name": "clusteredHeatmap",
  "params": [
    { "name": "sampleOrder", "output": true },
    { "name": "geneOrder", "output": true }
  ]
}
```

The transform's object-form `param` uses existing `push: "outer"` parameter
scoping to bind the nearest ancestor declaration with the same name. The target
must be a read-only output slot; reject missing targets, ordinary writable or
derived parameters, duplicate producers, and collisions with ordinary parameters.
No view name is needed for publication. Implicit title or side-group wrappers
must not change lexical lookup, and a nearer declaration shadows farther ones.

These are output declarations, not writable variable parameters. They reserve
#575's `FlowOutput`, initially unready with an empty array, and accept no `value`,
`expr`, binding, selection, transition, debounce, or `push` configuration. They
cannot be set through embedding APIs or restored from App provenance. The same
binding form must work for `values` and dendrogram outputs. Do not add an
imperative `setValue()` path or a dendrogram-specific registry.

Use a concrete construction boundary:

1. In the owner's `View` constructor, reserve its explicit output slots and local
   string-form transform outputs before registering ordinary parameters. Thus an
   owner expression such as `length(sampleOrder)` and an earlier center view can
   bind before the side views exist. Declaration order within `params` does not
   matter; imports and wrappers need no whole-hierarchy declaration scan.
2. As descendant views are constructed, resolve each object-form target and record
   its unique producer declaration/view on the existing output handle. This
   identifies the required flow even when its presentation is hidden. After
   hierarchy construction, reject shared slots without exactly one producer
   declaration. Bind each required producer's real `FlowNode` to that same handle
   when its flow is built, before loading its sources. Inactive owners retain
   normal deferred initialization. Preserve #575's output-input guards and producer
   provenance, including rejection of unready outputs as flow inputs.

Explicit owner declarations repeat two names in the example but require no domain
arrays. Prefer this small, predictable contract over refactoring view construction
into a global declaration phase that must resolve all descendant imports first.

Keep existing local string declarations compatible. If #575 has not acquired
output pushing when this branch is implemented, implement that capability
first using its shared primitives; do not substitute a dendrogram-specific
registry. Coordinate generic changes with the lower PR when practical.

Each shared output has one producer for its owner's lifetime. Support replacing
the tree/dataset through that same producer; keep its output ref and last
successful value while new data is pending or fails. Reject structural removal or
replacement of a shared producer while its owner survives, before detaching or
disposing it.
Hiding the tree is supported. Disposing the owning composition disposes its
producers and output refs through the existing lifecycle and prevents late
publication. Do not introduce producer takeover, rebinding, automatic retry, or
row rollback.

A shared domain must not depend on its dendrogram being visibly drawn. Track the
producer flow as a real dependency of its output owner. Include the required
producer paths, their ancestry, and data dependencies in existing initialization
and loading when the shared consumers are active, even for an initially hidden
tree presentation. Keep unrelated hidden siblings excluded. Reuse `data/flowInit.js`
and its semantic mark wiring; it does not create GPU resources, so no additional
initialization state is needed. Reuse #575's endpoint ownership/readiness and
disposal machinery instead of duplicating layout in a root summary branch.

### Publication and projection

The transform validates and lays out the complete tree, emits its edges, and
stages an immutable ordered-domain candidate. Release it only at #575's successful
completion/replay boundary, after synchronous fan-out settles and before rendering
effects. Equal arrays preserve identity and suppress value notifications. Loading
or failure retains the last successful domain; successful empty input publishes
`[]`. A single leaf publishes its category even though it emits no edges.

Initially support publication for one unfaceted tree per completed eager flow.
Reject facets and multiple logical trees when `param` is present; never silently
publish only the last partition. Preserve existing file/facet behavior for numeric
layout and nonpublishing categorical layout. Reuse #575's eager source allowlist,
including side-input dependencies, and reject unsupported lazy publishers.

Compute midpoints with the existing numeric algorithm. For position `p`, emit
`orderedCategories[Math.floor(p)]` and `p % 1`. Reuse one tree layout for both
modes; numeric mode continues emitting its integer anchor. Do not derive the
order by reading the destination scale.

```text
sample tree -> categorical layout -> edges -> left link mark
                                  -> sampleOrder -> shared y band

gene tree   -> categorical layout -> edges -> top link mark
                                  -> geneOrder   -> shared x band
```

For the horizontal sample tree, encode categories on y/y2 with `band: 0.5`,
heights on x/x2, and fractions on y/y2 offsets. Keep the offset domain `[0, 1]`
and range `[0, { "expr": "-height * bandstep('y', height)" }]`. The gene tree
uses categorical x/x2 and offsets scaled by
`width * bandstep('x', width)`, with heights on y/y2. Use `bandstep()` rather
than `bandwidth()` so padding is included. Resize, padding changes, and scale
reversal update projection without recomputing the tree.

## Required example

Create `examples/docs/examples/generic/clustered-heatmap-band.json` and its docs
page. Use one named surround, `clusteredHeatmap`, with the matrix as `spec`, a
sample tree on the left, and a gene tree above. Each tree owns its own input and
single dendrogram transform, with `siblingOrder` and an ancestor-owned output.
Reserve the two read-only output slots in the surround's `params` as above. There
is no root summary pipeline, duplicated tree layout, or extra order array.

Shared scale configuration is:

```json
{
  "name": "clusteredHeatmap",
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

This is a proposed configuration fragment, not a complete current specification.
Verify actual scale ownership beneath titles and implicit wrappers, using explicit
resolution boundaries where necessary as in #575's current heatmap.

Use 16 inline `{ sample, gene, z }` records from this explicitly imaginary matrix:

| Sample / gene | TP53 |  MYC | EGFR | BRCA1 |
| ------------- | ---: | ---: | ---: | ----: |
| Sample C      |  1.6 |  1.1 | -0.9 |  -1.4 |
| Sample A      |  1.2 |  0.8 | -1.1 |  -0.8 |
| Sample D      | -0.4 | -0.7 |  1.3 |   0.9 |
| Sample B      | -1.5 | -1.2 |  0.8 |   1.5 |

Supply two small precomputed trees whose `childOrder` values yield those orders.
Merge samples C/A at height 0.6, that group with D at 1.4, and then with B at 2.6.
Merge genes TP53/MYC at 0.7, EGFR/BRCA1 at 0.9, and both groups at 2.2. The sample
comb exercises fractional joins. Deliberately shuffle node rows to prove that
structural order, rather than source arrival, drives layout and publication.

The matrix directly encodes `sample` on y and `gene` on x. Use ordinary categorical
labels, a diverging color scale centered at zero with domain `[-2, 2]`, and
sample/gene/z tooltips. The trees and scores are illustrative; no clustering is
claimed. Keep the example offline and readable, following `examples/README.md`.
Retain the existing DepMap index example for zoom, pan, and group gaps.

## Scope, alternatives, and risks

- This branch depends on #575's eager outputs. It does not close #513's lazy
  empty-track acceptance case or implement output-driven flow scheduling.
- Clustering algorithms, optimal leaf ordering, workers/async transforms, tree
  cuts, and derived-dataset publication are separate features. A future clustering
  implementation should feed ordinary tree data and avoid scale feedback.
- No categorical zoom/pan, new band grouping-gap behavior, or arbitrary category
  sorting. Preserve existing index navigation and selection semantics.
- Do not infer tree orientation from arbitrary row arrival, alphabetical category
  sorting, or stable GPU IDs. Require structural order or an explicit domain input.
- Do not make externally authored `leafOrder` arrays the main workflow. They remain
  an alternative for intentional external alignment, without a second layout path.
- Reject scope repairs that restructure the plot solely to expose parameters or
  recompute each tree in a root branch. Explicit output ownership is shared runtime
  work and must receive its own review gate.
- Guard against feedback through owner scale/layout/visibility expressions while
  supporting ordinary order-output-to-scale consumers. Preserve #575's bound
  producer provenance rather than adding broad expression bans.
- Hidden-producer initialization, output-slot binding, and owner disposal are the
  main cross-subsystem risks. Test them before polishing the complete example.
  Generic support should stay small enough to review with the existing output
  lifecycle rather than become a new resource framework. Replacing producer
  objects under a surviving output owner is outside this increment.

## Implementation milestones

### 1. Resolve reusable output ownership and categorical-domain consumption

Completed: output slots, `push: "outer"`, selective hidden producer initialization,
read-only access, feedback guards, and disposal boundaries are implemented.
Focused publication/parameter/initialization tests and workspace type checks pass.

Outcome: two ordinary eager producers in side views can bind read-only outputs
reserved at their common scale owner, independently of title wrappers and
presentation visibility. Existing local `values.param` specifications keep working.

Affected areas: `spec/parameter.d.ts`, #575's `data/flowOutput.js`, owner-slot
reservation in `view/view.js`, parameter output binding, `view/flowBuilder.js`,
`data/flowHandle.js`, `data/flowInit.js`, `genomeSpy/viewDataInit.js`, and producer
initialization/readiness/disposal. Reuse current `FlowOutput` and flow-input guards.
Generalize declaration discovery only for known output-producing transforms; do
not add arbitrary callbacks to every transform. No new global registry is needed.

Verification: a small real spec with two `values` publishers drives both band
domains without clustering. Cover owner/center expressions that bind before side
construction, declaration order, imports/wrappers, nearest-ancestor lookup,
undeclared/unbound slots, shadowing, duplicate writers, and read-only embedding/App
access. Cover initially empty domains, source/domain arrival order, cached replay,
required hidden producers without initializing unrelated hidden siblings, dataset
replacement on the same producer, rejection of structural producer removal or
replacement, owner disposal, and direct/indirect feedback rejection. Reuse existing
publication tests instead of duplicating their complete failure matrix.

Docs/migration: extend output/`values` documentation with output pushing
and lifecycle limits using `write-genomespy-docs`; preserve string syntax. Coordinate
shared changes with #575. Use `write-genomespy-changeset` for the cumulative release
impact, keeping the lower branch's fragment separate from this feature's note.

Tentative commit: `feat(core): support pushing transform outputs to ancestor scopes`

Review gate: shared public ownership contract, declaration/binding timing, hidden
producer flow ownership, and downstream scale/App parameter consumers.

### 2. Add categorical tree layout and direct order publication

Completed: structural and explicit category ordering share numeric midpoint
layout. The transform publishes through #575's successful flow boundary, including
empty and single-leaf trees. Numeric regression and categorical contract suites
pass, including real source replacement, failed input, replay, and feedback guards.

Outcome: categorical dendrograms derive category anchors and an ordered domain
from their own tree input, preserving numeric compatibility.

Affected areas: `spec/transform.d.ts`, dendrogram transform and tests, known output
declaration discovery, and schema validation. Keep one validation/layout path and
use #575's successful publication boundary. Do not require a `values` projection.

Verification: structural sibling ordering with shuffled input, scalar categories,
unary/multifurcating trees, fractional anchors, explicit-order alternatives and
extra slots, custom `as`, and malformed/duplicate ordering inputs. Assert empty
and single-leaf outputs, equality suppression, fresh edge IDs, same-size changed
orders, and multi-tree/facet rejection for publishing flows. Preserve numeric and
nonpublishing batch contracts. Test real collector-to-output-to-scale behavior,
including a failed tree that must not publish its candidate.

Docs/migration: explain ordering inputs, output/default-field contracts, supported
source/partition limits, and index compatibility. Regenerate schemas. Add or update
the feature's Core minor changeset rather than one note per implementation commit.

Tentative commit: `feat(core): publish categorical dendrogram domains`

### 3. Deliver and verify the two-axis synthetic heatmap

Outcome: the required example renders on Canvas2D, WebGL, WebGPU, and SVG without
manual domain arrays or preprocessing of numeric matrix positions.

Affected areas: shared example/docs/navigation, existing SVG dendrogram tests, and
`packages/core/scripts/testDendrogramRenderers.mjs`. Use the `test-genomespy-views`,
`debug-genomespy-web`, and documentation skills when implementing these changes.
Extend the current harness rather than copy it.

Verification: leaf endpoints align with cell centers on both axes; internal joins
stay connected and heights stay correct. Check categorical labels, padding,
reversal, resizing, a diagonal-link variant, picking, point selection, and PNG/SVG
export. Verify actual GPU pixels as well as SVG geometry. Replace tree data on
the same producers with a compatible new leaf order and check scale/mark agreement;
hide either tree before initialization and after publication while retaining
matrix/annotation alignment.
Keep index navigation regressions. Band interval brushing remains unsupported.

Docs/migration: publish the polished spec/page/screenshot, link it from the
transform reference, and explain tree-owned domains. Build schemas before editing
example specs and reuse the feature's changeset.

Tentative commit: `docs(core): demonstrate tree-owned heatmap domains`

Final review gate: complete cross-renderer integration, ordinary surround
composition, initialization/disposal, and both new and existing examples.

## Acceptance and final verification

- [ ] Shared output ownership is explicitly resolved and reviewed using #575's
      machinery; no second publisher or expression scheduler is introduced.
- [ ] Two precomputed trees independently publish sample/gene domains into one
      common surround. Source order, titles, and hidden tree presentation do not
      alter ownership or prevent required domain publication.
- [ ] The 4-by-4 example shows all 16 imaginary z scores, original sample/gene IDs,
      categorical labels, and both trees. It has no separate domain arrays or
      numeric heatmap row/column fields.
- [ ] Empty/single-leaf trees, successful dataset replacement through the same
      producer, failed input, unchanged output, rejected structural producer
      removal/replacement, and owner disposal follow the stated contract.
- [ ] Tree geometry and published domains agree before rendering effects, without
      reading an output/domain back into the producing dataflow.
- [ ] Leaf alignment, fractional joins, heights, padding, reversal, resize, picking,
      and export agree across live backends and SVG within suitable tolerances.
- [ ] Existing numeric outputs, index navigation/gaps, identities, file/facet
      behavior, and local output declarations retain their contracts.
- [ ] Focused Vitest suites use `--reporter=agent`; applicable types, lint, schema,
      example/docs, and release checks pass. Shared output/lifecycle changes also
      warrant the complete unit suite before delivery.
- [ ] Run `node packages/core/scripts/testDendrogramRenderers.mjs`; inspect the new
      synthetic example, `dendrogram-gaps.json`, #575's branch-values example,
      and the existing DepMap heatmap. Record unavailable checks explicitly.
- [ ] Review related tests for duplication and report focused production-code
      growth, including changes made to the shared publication machinery.
- [ ] Reconcile every task and commit the final record, then delete this temporary
      plan in a later commit before creating a PR or before merge if explicitly
      retained for draft review. Do not retire the lower branch's plan here.

The first review must settle the names/shape of the read-only owner slots,
output-pushing form, and structural ordering input. Their semantics above are required;
API spelling can change without reviving manual-domain boilerplate. Clustering
implementation remains outside this plan, with the tree/output boundary available
for that later increment.

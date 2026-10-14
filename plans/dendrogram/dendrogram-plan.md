# Dendrogram implementation plan

Status: implemented and independently reviewed on `codex/dendrogram`; all four milestones complete.
Independently reviewed on 2026-10-14.

## Goal and scope

Make a heatmap-aligned dendrogram practical with one layout transform and one
link layer. Keep index-scale inputs discrete. Represent an internal node's
between-row position as an integer anchor plus a separately scaled offset.
Use the existing diagonal link shape or a new orthogonal shape to draw edges.

The first version accepts precomputed clustering trees with explicit leaf
positions. It preserves merge heights, node identities, and heatmap row order.
Grouping gaps may make joins visually asymmetric; connected branches and leaf
alignment are required, exact screen-space centering is not.

Non-goals:

- Computing distances or hierarchical clustering from an observation matrix.
- Fractional index-scale inputs, new integer packing, or changes to locus scales.
- Automatic heatmap reordering, interactive tree rotation, pruning, or reclustering.
- A general Vega-style hierarchy subsystem, radial trees, or arbitrary paths.
- Native SciPy, R, or Newick parsers in the initial implementation.
- App cohort/provenance integration; demonstrate the feature in Core first.

## Current architecture and affected contracts

Start with `ARCHITECTURE.md`, `packages/core/ARCHITECTURE.md`, and the Core
rendering, views/dataflow, and reactivity architecture documents.

| Area                 | Current implementation and implication                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Index positions      | `packages/core/src/genome/scaleIndex.js` floors inputs. `step()` includes inner/outer padding and uses the regular data step when grouping gaps are active. Preserve that positioning contract.                             |
| Grouping gaps        | `packages/core/src/genome/indexGapMapping.js` inserts fixed-width gaps at integer cuts. The mapping remains ordered, so applying it consistently preserves node connectivity.                                               |
| Public offsets       | `packages/core/src/spec/channel.d.ts` exposes scaled `xOffset`/`yOffset`; `x2Offset`/`y2Offset` exist only as internal channel names and numeric/expression mark properties.                                                |
| Offset normalization | `packages/core/src/marks/mark.js` derives secondary offsets and routes inherited scaled offsets through the primary offset resolution. `encoder/encoder.js` owns channel classification and fallback rules.                 |
| Scale resolution     | `view/resolutionPlanner.js`, `scales/scaleRules.js`, and `scales/scalePropsResolver.js` resolve primary/secondary channels and infer nested discrete offset ranges. Quantitative dendrogram offsets need an explicit range. |
| Expressions          | `packages/core/src/utils/expression.js` binds scale helpers to resolution-owned mapping refs. It currently exposes `bandwidth()` but no row-step helper.                                                                    |
| Transforms           | `packages/core/src/data/transforms/transformFactory.js` registers transforms. Buffered transforms must respect facet partitions, physical file batches, reset, and replay.                                                  |
| Immediate links      | `rendering/immediate/geometry/linkGeometry.js` and `rendering/immediate/marks/link.js` currently describe every link with four cubic control points. Canvas, SVG, and software picking consume that representation.         |
| GPU links            | `rendering/webgl/marks/link.*` and `packages/webgpu-renderer/src/marks/programs/linkProgram.js` tessellate cubic links. Both already consume internal secondary offset encoders.                                            |
| Picking              | Software picking routes links through `rendering/canvas2d/picking/renderers/index.js`; GPU picking uses the link stroke geometry. Interval selection is a separate data-coordinate contract.                                |

Use the nearest package instructions before implementation. Do not move GPU
resources into semantic marks or introduce a retained scene graph. The WebGPU
renderer must remain independent of Core grammar and hierarchy types.

## Established designs and provenance

- [Vega's hierarchy pipeline](https://vega.github.io/vega/examples/tree-layout/)
  separates `stratify`, `tree`, `treelinks`, and `linkpath`. Borrow the separation
  between node placement and link routing, while offering one focused transform
  for this use case. Its cluster layout does not supply statistical merge heights.
- [Vega LinkPath](https://github.com/vega/vega/blob/main/packages/vega-encode/src/LinkPath.js)
  routes a horizontal orthogonal edge through `(sourceX, targetY)`. This places
  the elbow at the parent's merge height. Its diagonal control points match the
  current GenomeSpy shape.
- [ComplexHeatmap dendrogram layout](https://github.com/jokergoo/ComplexHeatmap/blob/master/R/grid.dendrogram.R)
  accepts explicit leaf positions and computes internal positions bottom-up.
  Use the midpoint of the extreme direct-child positions, rather than the mean
  of all descendant leaves. For binary trees this is the two-child midpoint.
- [SciPy linkage](https://docs.scipy.org/doc/scipy/reference/generated/scipy.cluster.hierarchy.linkage.html)
  and [R hclust](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/hclust.html)
  provide merge topology and heights. R also carries plotting order; SciPy leaf
  identity and display order must be kept separate when converting its result.

GenomeSpy is MIT licensed. The inspected upstream licenses are
[Vega BSD-3-Clause](https://github.com/vega/vega/blob/main/LICENSE),
[d3-hierarchy ISC](https://github.com/d3/d3-hierarchy/blob/main/LICENSE), and
[ComplexHeatmap MIT](https://github.com/jokergoo/ComplexHeatmap/blob/master/DESCRIPTION).
No upstream code is copied by this plan and no new hierarchy dependency is
planned. If implementation copies or closely adapts code, pin the upstream
revision, retain its required notices, and add a nearby provenance comment.

## Proposed public contracts

### 1. Flat input tree and dendrogram transform

Accept one node table per tree. Field names are configurable:

```json
{
  "type": "dendrogram",
  "key": "id",
  "parentKey": "parent",
  "height": "height",
  "leafIndex": "row"
}
```

Example input:

```json
[
  { "id": "A", "parent": "AB", "height": 0, "row": 0 },
  { "id": "B", "parent": "AB", "height": 0, "row": 1 },
  { "id": "C", "parent": "ABC", "height": 0, "row": 2 },
  { "id": "AB", "parent": "ABC", "height": 1 },
  { "id": "ABC", "parent": null, "height": 3 }
]
```

Validation and layout:

- Keys are unique finite numbers or strings; preserve their types with a `Map`.
  Exactly one node has `parent: null`; every other parent must exist. Reject
  cycles and disconnected trees with an error identifying the offending node.
- Heights are finite, nonnegative values on all nodes, including leaves. Preserve
  them exactly; do not substitute topological depth or reject statistical
  linkage inversions solely because a parent height is lower than a child's.
- Leaves have distinct nonnegative integer indices below the existing `2^44`
  index input limit. Internal rows need no `leafIndex` value. Indices may have
  holes; require each subtree's leaves to be contiguous in the sorted leaf
  sequence, rather than requiring consecutive integer values.
- Input row order does not determine display order. Leaf indices are
  authoritative and must match the heatmap's row mapping. Do not silently sort
  the heatmap or repair an incompatible leaf order.
- Build adjacency and an iterative postorder traversal. Compute each internal
  row position from the minimum and maximum direct-child positions. Unary and
  multifurcating nodes work with the same rule; no binary-only representation
  is needed.
- Split each resulting position `p` into `index = floor(p)` and
  `offset = p - index`. Use ordinary JS precision and document its existing
  large-coordinate limit; avoid new high-precision fractional machinery.
- Produce one edge per non-root node, in deterministic input-child order.
  Empty input and a single-leaf tree produce an empty edge stream.

Default flat output fields, in this order:

```text
sourceId, targetId, sourceHeight, targetHeight,
sourceIndex, targetIndex, sourceOffset, targetOffset
```

Support an optional eight-entry `as` tuple of distinct, nonempty field names to
rename these fields, consistent with existing transform output naming. Reserve
the internal `UNIQUE_ID_KEY`. Each edge copies the child's input metadata except
that internal ID and adds the generated fields; generated fields take precedence.
Do not expose mutable hierarchy node references.

Mark the transform as an output-identity boundary through one small explicit
FlowNode property. Update `flowBuilder.js` to require an identifier after the
latest such boundary, even when an ancestor already assigned node IDs. Ordinary
`CloneTransform` preserves identity and must not trigger this rule merely because
it has `BEHAVIOR_CLONES`. Let the existing downstream `IdentifierTransform`
assign edge IDs; its reserved IDs may be reused on replay. Stable semantic edge
identity is the source/target node ID pair, not a promise of fresh picking numbers.

The transform collects one complete tree before publishing. A facet is one
logical tree and may span file batches; outside facets each source file is one
tree. Flush before forwarding the next logical boundary, and flush the final
tree at completion. Retain each child's physical file provenance and replay its
file boundary before emitting its edge, using `data/fileBatchUtils.js` and the
buffered `stack.js` pattern. This matters when differently shaped input files
belong to one facet: downstream transforms such as `regexFold` specialize by
file shape. Deterministic input-child output order keeps the replay contiguous.
Reset clears all topology/output state. Follow the existing buffered transform
conventions and verify optimizer behavior instead of inventing another batching
framework. Recompute on input replay, not on pan, zoom, resize, or gap changes.
Expected work is linear after sorting leaf indices for the contiguity check.

### 2. Scaled secondary offsets

Expose `encoding.x2Offset` and `encoding.y2Offset` on marks that support the
corresponding secondary positional endpoint. Use a secondary definition type
analogous to `Position2Def`: fields, expressions, datum definitions, and visual
pixel values. Resolve them through `xOffset`/`yOffset`, just as `x2`/`y2` resolve
through `x`/`y`. An independently configured secondary offset scale is not part
of this first API.

```json
{
  "yOffset": {
    "field": "sourceOffset",
    "type": "quantitative",
    "scale": {
      "domain": [0, 1],
      "range": [0, { "expr": "-height * step('y', height)" }]
    }
  },
  "y2Offset": { "field": "targetOffset" }
}
```

Both fields contribute to the shared offset domain when it is inferred. The
dendrogram recipe explicitly declares `[0, 1]`, preventing small subsets of
observed fractions from stretching to fill a row. A scaled secondary needs a
compatible primary offset definition; report a missing primary at the grammar
boundary. Unscaled secondary values remain independent pixel offsets.

Preserve precedence and compatibility:

1. Explicit secondary offset encoding wins over its same-named mark property.
2. Otherwise honor the existing numeric/parameter-expression mark property,
   including explicit zero.
3. Otherwise an implicit secondary position inherits its primary offset, while
   an explicit secondary position receives zero, as today.

Add offset-family mappings without accidentally treating offsets as normalized
positional coordinates. Audit `secondaryChannels`, `primaryChannels`, accessor
scale channels, domain contribution, view-level scale validation, legend
exclusion, inherited encoding filtering, and nested rect band defaults. Existing
grouped bars must retain their subgroup extents and implicit endpoint behavior.
Do not force every mark to accept meaningless secondary channels.

Honor within-band adjustments for scaled offsets in immediate projection too.
`prepareRangeProjection()` currently applies a band adjustment to x/y positions
but adds raw encoded offsets, while WebGPU's numeric-channel path includes the
offset band adjustment. Correct that local parity gap for both endpoints and
cover subgroup point centers and rectangle extents in Canvas/SVG. Quantitative
dendrogram offsets have a zero band adjustment.

### 3. Regular row-step conversion

Add a narrowly implemented reactive `step(channel, extent?)` expression helper
alongside `bandwidth()`. Its result is the selected band-like scale's regular
step in scale-range units. For index scales it is signed, includes padding, and
excludes the extra distance inserted at individual grouping cuts. With an
explicit logical-pixel extent, read `scale.gapMapping(extent).step` when gaps are
active. For band/point scales normalize the native positive step by range
direction; reject scale types that do not provide a meaningful step. Keep the
no-extent form for nongapped use and require an extent for gapped index scales.
Define zero-sized bootstrap placement behavior without reading stale owner
coordinates; it contributes zero pixel displacement and renders no visible ink.

Horizontal offsets use `width * step('x', width)`; vertical offsets use
`-height * step('y', height)`, because pixel y offsets increase downward while
Core's normalized y coordinates increase upward. An explicit reversed scale
changes the sign through the helper. Do not estimate the step by subtracting
`scale(channel, i + 1) - scale(channel, i)`: that may include a grouping gap.

Bind the helper to the existing mapping ref and bind the range expression to
local width/height directly. `ScaleResolution.getAxisLength()` currently chooses
the smallest member extent, and axis length is not itself a mapping-ref input.
Passing the actual extent avoids both that ambiguity and stale layout coordinates
during resize; a global mapping-publication redesign is unnecessary. Own the
offset range at the dendrogram view and verify simultaneous resize/gap changes.
The initial heatmap composition has matching row-axis extents. Arbitrary
unequal-height repeated occurrences of one logical mark are outside the recipe;
do not silently claim that one pixel-valued offset scale is occurrence-local.

For each node, all edges use the same anchor, fraction, and scale. Gaps can move
a node away from its children's visual midpoint, but keep joins connected and
leaves aligned. No transform replay or offset data rewrite is required during
navigation. Index/locus selection semantics and integer packing stay unchanged.

### 4. Orthogonal link geometry

Add `linkShape: "orthogonal"` to the Core and renderer-generic link APIs. Keep
`orient: "horizontal" | "vertical"` and preserve endpoint order:

```text
horizontal: source -> (sourceX, targetY) -> target
vertical:   source -> (targetX, sourceY) -> target
```

For a horizontal dendrogram, source is the parent and x is merge height. Two
outgoing L-shaped edges form the ordinary rectangular branch. Route after
projecting both endpoints and applying their offsets. Reversal must not sort or
exchange the source and target. A midpoint staircase is a different shape and
would put the bend at the wrong merge height.

Use exact straight segments, butt endpoint caps, and a fixed miter join at the
90-degree elbow. Collapse a zero-length leg to a straight stroke; coincident
endpoints produce no ink or hit. `segments` remains a cubic tessellation option
and does not change orthogonal geometry. Arc/dome-only height, apex, chord
limiting, and fading controls do not affect orthogonal links.

For multifurcating nodes, separate parent-child links may share part of a trunk.
Use ordinary overlapping-edge semantics: translucent strokes can darken shared
parts, independently colored edges paint in order, and the topmost painted edge
wins a hit in the shared region. Do not deduplicate trunks or promise one
unambiguous child-edge identity on shared geometry. Binary branches avoid this
shared-trunk case. A different branch-level primitive would be a product choice
if independent multifurcation styling/picking is required.

Keep the geometry extension local to links:

- Give immediate link instances an explicit cubic/polyline geometry variant.
  Preserve current cubic control-point calculations and cubic consumers.
- Canvas uses one stroked polyline; SVG emits `M/L/L` with explicit cap/join
  styles. Compute bounds from routed geometry plus stroke/join extent.
- Software picking strokes the same legs and covers the elbow join using the
  same picking ID and minimum picking width.
- WebGL and WebGPU use a small fixed stroke strip with an explicit elbow join,
  not sampled cubic control points or two overlapping translucent quads.
  Reuse existing scale, offset, style, clip, and picking accessors. Account for
  shape-dependent vertex counts and live shape changes.
- WebGPU currently lacks a link `minPickingSize` property and Core adapter
  forwarding. Add the small renderer-generic link picking-width contract and
  pass-aware stroke coverage needed to match Core, without enlarging visible
  strokes. Cover existing link shapes too; do not generalize unrelated marks.
- Preserve existing endpoint-clamping semantics and view clipping. Test the
  actual routed geometry; do not cull it using only a source anchor.

The mark owns geometry and style; the transform owns tree topology and node
positions. Add no dendrogram-specific GPU resources or general path engine.

## Milestones and review gates

### M1 — Scaled endpoint offsets and row-step ranges

- [x] Expose secondary offset definitions and wire their primary scale family.
- [x] Preserve existing property precedence, implicit endpoint fallback,
      grouped bars, and ordinary pixel-offset behavior across the renderers.
- [x] Apply discrete offset band adjustments consistently in immediate projection.
- [x] Add `step()` with reactive padding, reversal, resize, and gap semantics.

Affected areas: Core channel/spec types, `marks/mark.js`, mark channel support,
encoder helpers/accessors, resolution planning/domain inputs, scale rules,
`utils/expression.js`, and retained-renderer scale subscriptions as needed.
GPU backends already accept internal secondary offset values; verify scaled
resolution rather than adding another offset pipeline.

Verification: focused headless specs checking two different fractional endpoint
values, a primary domain contributed only by a secondary value, explicit zero
precedence, and a grouped-bars regression. Check projected SVG coordinates after
resize, reversal, padding, zoom, and a grouping cut. Run affected encoder/mark,
offset-scale, expression, and WebGPU adapter suites with the agent reporter;
inspect existing tests and consolidate overlapping normalization assertions.

Docs/migration: use `write-genomespy-docs` for channel JSDoc, mark offset docs,
scale expressions, and schema generation. Existing specs need no migration.

Tentative commit: `feat(core): support scaled secondary endpoint offsets`.
Body rationale: reuse offset scales for independent link endpoints while
preserving discrete row identities and existing offset defaults.

Review gate: scale-family wiring, public precedence, and occurrence-sensitive
step ranges are the main shared-contract risks.

M1 verification: six focused endpoint-offset SVG/scale tests cover resizing,
zoom, reversal, grouping gaps, shared domain contribution, unsupported inputs,
and grouped-bar centers. Existing encoder, mark, expression, nested-offset, and
WebGPU adapter suites passed. Core TypeScript, schema generation, and focused
lint passed. Rule endpoints retain their existing half-open interval semantics;
link endpoints use point placement at grouping cuts.

### M2 — Precomputed-tree layout to flat edges

- [x] Add `DendrogramParams`, the buffered transform, and factory registration.
- [x] Implement boundary validation, iterative layout, metadata/output naming,
      and per-tree batching/reset/replay.
- [x] Preserve physical file provenance and establish downstream edge identity
      after an upstream node identifier.
- [x] Verify the real spec-to-collector path and source-data immutability.

Affected areas: `spec/transform.d.ts`, new
`data/transforms/dendrogram.js` with colocated tests, `transformFactory.js`,
and dataflow integration tests, plus the small output-identity contract in
`data/flowNode.js` and its consumer in `view/flowBuilder.js`. Prefer one layout
implementation file unless a pure helper materially clarifies the transform;
avoid an exported hierarchy object model.

Verification: a deliberately unbalanced tree must produce quarter/eighth-row
offsets and correct merge heights/IDs. Test a multifurcation, arbitrary input
row order, nonconsecutive leaf indices, distinct numeric/string IDs, empty and
single-leaf input, invalid parent/cycle/order failures, and representative
facet/file/replay boundaries. Include two physical input shapes in one facet
followed by `regexFold`, and an explicit upstream identifier with sibling
node/link marks. Verify edge lookup resolves edge records without inherited node
IDs; replay may reuse numeric picking IDs. A deep tree must not depend on
recursive JS stack depth. Use representative contract tests, not exhaustive
object snapshots.

Docs/migration: document node-table input, explicit heatmap leaf order, output
fields/`as`, metadata precedence, and examples converting SciPy/R results in
application code. Native import adapters remain deferred.

Tentative commit: `feat(core): add a dendrogram layout transform`.
Body rationale: generate reusable edge records from precomputed trees without
coupling layout to renderer coordinates or navigation.

M2 verification: 57 focused transform/factory/dataflow tests passed, including
an unbalanced layout, a 10,000-leaf comb, heterogeneous physical file shapes
within facets, upstream identifiers with sibling node/link marks, and named-data
replacement. Core TypeScript, schema generation, and focused lint passed.

### M3 — Exact orthogonal links across backends

- [x] Extend Core/renderer shape enums and local link geometry representation.
- [x] Implement Canvas/SVG/software picking and both retained GPU paths.
- [x] Add renderer-generic WebGPU link minimum picking width and Core forwarding.
- [x] Add a renderer-generic Storybook example for orthogonal links and updates.

Affected areas: Core `spec/mark.d.ts`, immediate link geometry/visitation,
Canvas/SVG renderers, software picking, WebGL link shader/delegate, Core WebGPU
adapter/tests, and renderer `src/index.d.ts`, link program, GPU tests, examples,
and Storybook. Preserve the Core/renderer package boundary and existing shapes.

Verification: assert elbow coordinates and join coverage for both orientations,
source/target reversal, zero-length legs, coincidence, clipping, and minimum
picking width. Check translucent elbows for overlap artifacts. Test a live
orthogonal/diagonal shape switch with retained resources. SVG is the structured
geometry oracle; actual GPU raster/picking checks cover both shader backends.
Re-run representative arc/dome/diagonal tests to protect existing behavior.

Docs/migration: extend link-shape docs/gallery and generic renderer docs; build
Storybook when its example changes. Existing links remain unchanged.

Tentative commit: `feat(core): add orthogonal link geometry`.
Body rationale: draw complete rectangular tree edges with consistent joins and
picking across live renderers and exports.

Review gate: inspect routing, joins, culling, picking, export, retained updates,
and all existing shape consumers together rather than reviewing only a shader.

M3 verification: 274 focused CPU/program/shader tests and ten real WebGPU
link tests passed. WebGL picking passed at DPR 1 and 2. Checks cover exact
Canvas/SVG paths, both orientations and directions, collapsed legs, coincident
endpoints, elbow hit coverage, retained shape/width updates, translucent joins,
and existing arc/dome fading. Both package type checks, schema generation,
focused lint, Storybook build, and release checks passed. WebGPU picking uses
pipeline specialization so hit width does not enlarge visible geometry.

### M4 — Heatmap composition, documentation, and delivery

- [x] Add a compact user-facing dendrogram/heatmap example with one link layer,
      supplied merge heights, and a shared discrete row scale.
- [x] Add focused Core scenarios for grouping gaps/reversal and the existing
      diagonal presentation using the same layout output.
- [x] Complete cross-component verification and document the accepted gap
      asymmetry, selection behavior, and initial input/ordering scope.
- [x] Add/update one Core minor Changeset for the complete user-visible feature
      using `write-genomespy-changeset` and follow the fixed release-group policy.

Affected areas: `examples/docs/grammar/transform/dendrogram/`,
`examples/core/marks/link/`, transform/mark/scale-expression reference docs,
navigation/schema-derived docs, and `.changeset/`. Follow `examples/README.md`;
generate schemas before editing examples and keep documentation examples
self-contained. Update the link shape/orientation gallery and reuse
`examples/docs/grammar/mark/rect/grouped-bars.json` as a compatibility check.

Tentative commit: `feat(core): demonstrate heatmap-aligned dendrograms`.
Body rationale: make the complete layout/offset/link composition discoverable
and verify that shared row navigation keeps branches aligned.

M4 verification: the complete unit suite passed (529 files, 4,987 tests),
workspace type checks and lint passed, and schema/docs generation plus the full
documentation and Storybook builds passed. The renderer integration script
checks both row directions with fixed gaps through navigation, click/interval
selection, dataset replacement, shape changes, and raster/SVG export on Canvas,
WebGL, and WebGPU. The example preview was captured and visually inspected.

User feedback caught swapped orientation routing: a horizontal elbow must be
`(sourceX, targetY)` so splits stay at the parent merge height. Corrected all
backends and docs, and made that coordinate an explicit integration assertion.
The shared example scale is declared at its owning concat view, rather than in
an inherited encoding overridden by its children.

Independent implementation review found two short-leg defects: folded GPU
miter strips could overdraw translucent strokes, and software picking filled
beyond short butt caps. Both are fixed. GPU rendering now uses three small
rectangles (two legs and the outer corner), with deterministic fragment
ownership and continuous union coverage. Software picking uses only the outer
corner quadrant. Regression probes cover short/collapsed legs, coincidence,
both orientations/reversals, and minimum hit width at viewport edges at DPR 1 and 2 across all
three live backends. The reviewer reproduced the fixes and accepted them with
no remaining material findings or decisions requiring user input.

## Final integration verification and acceptance

Use `test-genomespy-views` for focused headless SVG contracts and
`debug-genomespy-web` for real-browser interaction checks. Avoid whole-document
snapshots and duplicated shader-string tests when visible behavior covers the
contract. Planned scenarios:

1. Unbalanced dendrogram plus heatmap: leaves align with cells; parent/child
   endpoints agree; supplied merge heights appear on the quantitative axis.
2. Pan, zoom, and resize with inner/outer padding and both range directions:
   endpoints remain joined, offset ranges update coherently, and the transform
   does not replay or replace its edge data during navigation.
3. Fixed grouping gaps, including a parent on each side of a cut: tolerate
   off-center joins while verifying connectivity, leaf alignment, and matching
   behavior in WebGL, Canvas, SVG, and experimental WebGPU. Preserve the
   existing exhausted-gap hiding policy.
4. Hover/pick each leg and elbow, show an edge tooltip, and highlight a selected
   edge using ordinary order/color encodings. A heatmap interval selection still
   operates on integer rows; do not introduce fractional-channel rejection.
   Link interval predicates retain their existing endpoint/data semantics.
5. Change the input dataset and switch orthogonal/diagonal shape: verify replay,
   correct edge lookup with permitted picking-ID reuse, buffer/vertex-count
   updates, and disposal through existing
   ownership. Retain a grouped-bars resize regression.
6. Export SVG and raster from representative live backends; verify routed paths,
   joins, offsets, clipping, and picking against the same compact fixture.

During iteration run the narrow affected suites with `--reporter=agent`. Before
delivery run the full unit suite because channel normalization and link geometry
cross shared contracts, workspace TypeScript checks, lint, relevant GPU tests,
schema/docs generation/build, shared example validation, Storybook build, and
release checks/status. Use the current package scripts and relevant skills for
browser/GPU commands; report unavailable verification precisely. Measure
production/test growth and remove duplicated paths or redundant tests before
accepting abstractions introduced by the geometry/offset changes.

Acceptance requires all three public components to compose without fractional
index inputs, ordinary heatmap selection and grouped bars to remain compatible,
and all supported renderers/exports/picking to honor the same endpoints. A
successful unit-only implementation is not sufficient for the new stroke path.

## Alternatives, risks, and decisions needing input

- A scale-wide fractional-index flag was considered in PR #559. It expands
  packing and selection contracts for a dendrogram-specific placement need;
  this plan uses ordinary offset scales and does not build on that branch.
- A Vega-like hierarchy pipeline is useful for a future general hierarchy
  feature, but adds public intermediate tree contracts without a current need.
  A single edge-producing transform is the initial choice.
- Combining several rule layers or expanding edges into rule segments can
  render the tree, but loses the convenient complete-edge datum and shape switch.
- Exact visual centering across gaps would require a different, scale-aware
  layout contract. It is intentionally excluded by the agreed design.
- The largest implementation risks are secondary-offset family normalization,
  occurrence extent/reactive range consistency, and joined stroke coverage.
  Large row coordinates retain existing JS/GPU precision limits; a leaf at a
  large index remains an integer, but very small derived fractions may round.

User input would be useful on these product choices; the proposed defaults allow
the implementation to proceed without broadening the first release:

1. **First input source:** use the flat node table above, with small SciPy/R
   conversion examples. A representative real clustering export would help
   decide whether a native importer should replace one of those examples.
2. **Leaf ordering:** require the explicit heatmap-compatible `leafIndex` field
   initially. Automatically deriving and publishing a leaf-order mapping is a
   separate API decision, especially if the App should own sample reordering.
3. **Node output:** emit links and preserve child metadata initially. Add a
   node-output mode only if separate internal-node marks/labels are needed now.
4. **Multifurcations:** support them with ordinary overlapping-edge semantics.
   Input is valuable if independently styled or separately pickable shared
   trunks are an immediate use case; that would change the drawing primitive.

## Plan review and retirement

Independent subagent review completed by `review_dendrogram_plan`. All five
actionable findings were incorporated:

1. Pass the actual occurrence extent to `step()` and observe local dimensions,
   avoiding a stale/smallest-member gap mapping during resize.
2. Add an explicit generated-output identity boundary, exclude copied internal
   IDs, and permit the identifier transform's existing numeric ID reuse on replay.
3. Retain and replay each emitted child's physical file provenance so metadata
   specialization remains valid across heterogeneous files in one facet.
4. Include link minimum-picking-width support in the renderer-generic WebGPU
   API and Core adapter, rather than assuming current visible geometry suffices.
5. Cover and correct within-band offset placement in immediate renderers as
   part of the existing grouped-bars/secondary-offset compatibility contract.

The optional multifurcation finding is documented with ordinary overlap/paint
order semantics. Special trunk deduplication remains deferred pending a concrete
styling/picking requirement. No required review finding remains unaddressed in
the plan; the product choices above remain open with explicit proposed defaults.
This is a design review, not evidence that the unimplemented feature passes tests.

No implementation commits are created by this planning task. During delivery,
complete or explicitly discard every incomplete milestone, commit the reconciled
record, then delete this temporary plan in a later commit before creating a PR
or merging. Do not merge temporary plan files.

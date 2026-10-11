# Fixed-size grouping gaps for index and locus scales

Status: approved for implementation; implementation has not started.

## Objective

Insert equal-sized gaps at arbitrary boundaries in index and locus scales.
Gaps retain their logical screen size while the scale is zoomed or panned.
The immediate use cases are chromosome separation on linear genomic tracks
and clustered heatmaps with gaps along either or both axes. The coordinate
model should also be usable by a future circular layout, without implementing
that layout now.

## Goals and non-goals

- Support the same gap properties wherever scale properties are accepted,
  including encoding-level `scale` and view-level `scales` definitions.
- Keep the grammar flat; do not introduce a nested gap configuration object.
- Preserve within-band placement independently of a gap after the band.
- Give half-open interval endpoints explicit boundary semantics. With a cut
  before 10, `[0, 10)` and `[10, 20)` must be separated by the configured gap.
- Keep numeric `invert()` defined throughout gaps so interval selections can
  start, end, or pass through them sensibly.
- Keep CPU projection, WebGL, and WebGPU consistent, including guides,
  picking, Canvas2D, and SVG export.
- Retain mark data and cut tables across navigation; update mapping parameters
  rather than rebuilding data buffers.
- Completely omit shader gap logic and gap resources when either gap property
  statically disables gaps.

The initial feature does not implement clustering, reorder matrix dimensions,
add variable per-gap sizes, add gaps to arbitrary continuous or categorical
scales, or implement polar coordinates. It does not introduce a general
dataset-reference syntax for scale properties. Ranged marks crossing gaps use
ordinary rendering between their projected endpoints; no gap-driven splitting,
masking, or clipping is needed.

## Decisions carried forward from the discussion

1. The GPU lookup returns a gap number, not a stored pixel offset. With equal
   gaps, the insertion rank in a sorted cut table is already that number;
   there is no need for a separate rank column.
2. Gap size is a uniform mapping parameter. Changing size, zoom, pan, or
   placement dimensions must not require rewriting the cut table.
3. A cut is a boundary coordinate. A cut at 10 means a gap before index 10,
   separating indices 9 and 10. It is independent of tick numbering offsets.
4. Band placement uses the band's own gap rank. Moving within band 9 must
   never encounter the cut at 10, even at the band's trailing edge.
5. Interval starts and exclusive ends at the same cut occupy opposite sides
   of that gap. Range reversal changes screen direction, not interval meaning.
6. Gap configuration uses ordinary scale ownership and resolution rules.
   View-level definitions are convenient for shared tracks, not mandatory.
7. Gaps are structurally disabled when `gapWidth` is constant zero or null, or
   `gapPositions` is constant empty or null. The corresponding scale must have
   no shader gap logic or gap resources, even if the other property is reactive.
8. Numeric `invert()` remains defined over gap interiors for interval selection.
   Map the whole gap to its cut coordinate, producing a constant inverse segment.
9. A ranged mark crossing an internal gap receives no special treatment.
   Boundary-side treatment applies only to endpoints touching a cut.

The `gapPositions` name, defaults, chromosome shorthand, and expression support
below remain proposals. Use `gapWidth` for the width property.

## Proposed grammar

Add two flat scale properties:

```ts
gapPositions?: number[] | "chromosomes" | ExprRef | null;
gapWidth?: number | ExprRef | null;
```

For example, a heatmap can define gaps directly on its encodings:

```json
{
  "encoding": {
    "x": {
      "field": "column",
      "type": "index",
      "scale": { "gapPositions": [10, 20], "gapWidth": 6 }
    },
    "y": {
      "field": "row",
      "type": "index",
      "scale": { "gapPositions": [15, 40], "gapWidth": 6 }
    }
  }
}
```

A locus scale can derive boundaries from its resolved assembly:

```json
{
  "scales": {
    "x": { "gapPositions": "chromosomes", "gapWidth": 6 }
  }
}
```

These are partial specifications. The second form requires a locus scale;
the shorthand does not infer one. It expands to internal contig boundaries
in assembly order, excluding a leading or trailing outer gap.

Proposed initial units are CSS pixels, with an empty cut list and zero width
as defaults. Omitted properties and literal null values also disable gaps.
A future polar layout
may need angular units; do not introduce a unit grammar before its coordinate
contract exists.

Normalize explicit cut lists once per configuration change into sorted,
unique integers. Validate finite safe integers within the supported index
coordinate range, and a finite nonnegative size. Reject use on unsupported
scale types. Do not discard cuts just because they are outside the current
viewport. Locus numeric cuts use the assembly's concatenated coordinates;
accepting explicit chromosomal locus objects is an open extension.

An `ExprRef` for positions evaluates to a complete boundary array or null;
width evaluates to a scalar or null. It uses existing resolution-owner parameter scope,
propagation, and lifecycle rules. This reuses an existing reference form,
without adding a nested gap configuration object. Mixed expression elements
inside the cut array are unnecessary for the first version.

For clustered matrices, the producer of the displayed row/column ordering
must also provide its boundaries. Updating that ordering and the cuts must
settle coherently. A scale-level implicit `groupby` would be ambiguous across
matrix duplicates, layers, and different sort orders, so it is deferred.

## Coordinate and endpoint contract

For an increasing output axis, let `C` be the sorted cut list and `g` the
gap size in the final logical output units:

```text
rankBefore(x) = number of cuts c < x
rankAfter(x)  = number of cuts c <= x

position(x, affinity) =
    translation + slope * (x - reference)
    + g * (rank(x, affinity) - referenceRank)
```

Here `before` and `after` refer to increasing data order. The signed output
direction applies to both the ordinary scale distance and the gap term.
Compute a signed rank difference before floating-point conversion to keep the
local calculation stable. Preserve the existing high-precision subtraction for
data coordinates.
This formula describes boundary mapping, not a replacement for index flooring
or the existing padding and alignment semantics.

For band `i`, compute its start using `rankAfter(i)`, then add
`band * signedBandwidth`. Do not look up the rank at `i + band` or interpolate
between the starts of neighboring bands. Padding and alignment still describe
band geometry; grouping gaps are a separate contribution.

For a genuine half-open interval `[a, b)`, use the after side at `a` and the
before side at `b`. Thus the two images of boundary 10 differ by exactly `g`.
One-band rectangles synthesized from a single index continue using that
band's start and width. Distinguish these cases in shared semantic encoding;
blindly changing every `x2`/`y2` lookup would also affect points, text ranges,
links, and reversed or degenerate ranges.

Audit `marks/markUtils.js`, rect/rule normalization, and ranged text before
choosing the smallest internal endpoint-affinity representation. Renderer
implementations must consume the same intent rather than infer it separately.
Do not add a public endpoint option unless existing mark semantics cannot
express the required distinction.

Ranged marks crossing an internal cut render normally between their projected
endpoints. Do not split geometry, mask fragments, or add gap-specific clipping
for their interiors. Only endpoints touching a cut need boundary-side treatment.
For example, a rect or rule encoding `[0, 20)` spans the gap before 10, while
separate marks encoding `[0, 10)` and `[10, 20)` remain separated there.
Picking and export preserve the same behavior. Strokes and point glyphs also
need not be globally clipped out of gap interiors.

## Fitting, placement, and navigation

Domain fitting must reserve room for gaps while keeping a common data slope
across groups. For a simple unpadded fit with `N` fully included gaps,
`availableDataPixels = viewportPixels - N * g`; edge cuts and partially
visible gaps need the explicit affinity/camera contract below. Existing
padding, alignment, minimum span, and reversed ranges remain applicable.

Do not derive navigation by repeatedly counting only fully visible cuts and
refitting the remaining data domain. That can change slope or translation
abruptly as a gap enters or leaves the viewport. Panning should translate
the existing mapping continuously, and anchored zoom should preserve the
pointer's position, including when it is inside a gap.

### Inversion and interval selection

Define numeric `invert()` throughout the valid output range, including gap
interiors. For a cut at `c`, both boundary images and every pixel between them
invert to `c`. A gap before 10 therefore returns 10 across its entire width;
it never returns undefined, NaN, or an invented intervening data coordinate.
The inverse is continuous through the gap edges and monotone in data order,
with a plateau over each gap. Reversed output preserves the same cut value.

An interval-selection endpoint stops at `c` while the cursor moves through
the gap, then resumes changing after entering data on the other side. This
works in both drag directions and when the gesture starts or ends in a gap.
Two endpoints inside the same gap resolve to `[c, c]`, a defined collapsed
interval. Handle zero span before applying endpoint affinity:

- Keep `[c, c]` as an active selection with no matching data. Do not convert it
  to null/inactive, which can invoke the configured `empty: true` fallback.
- Hide its rectangle and measurement labels, and exclude it from brush drag
  hit-testing. After/before projection must never turn it into a gap-wide shape.
- All CPU and GPU selection predicates return false for an active interval
  with zero span on any selected axis, including ranged-mark intersection.
- A selection-linked domain retains its last valid displayed domain (or its
  initial/default domain before a valid selection). Do not fit `[c, c]` to the
  minimum index span or synchronize that expanded domain back to the brush.
  A later explicit navigation command can publish a new nonzero interval.

These rules apply to collapsed intervals generally, including ordinary
integer-edge snapping. Gap width does not add selected indices or genomic
bases. Nonzero intervals retain existing selection and normalization behavior.

Audit `view/gridView/intervalSelectionController.js` and
`scales/selectionDomainUtils.js`, selection predicates, generated selection
rectangles, and selection-linked domain inputs through the real selection path. Projection
of stored interval endpoints, including selection overlays and translated
brushes, must use the shared start/exclusive-end affinity rather than blindly
mapping both cut endpoints to the same side.

Navigation may additionally need an internal inverse result identifying the
cut and the cursor's fractional position inside its gap. Numeric `invert()`
deliberately collapses that fraction for data selection; it must not force
pan or anchored zoom to snap to a gap edge. Decide how much additional state
navigation needs before implementing the GPU paths.

Keep any required navigation state with the existing domain/navigation owner.
Specify how explicit domain changes, `zoomTo`, transitions, reset, scale copy,
and exported layouts initialize or preserve it. Avoid an independent camera
framework. Resolve the smallest sufficient representation in milestone 1.

Core positional scales and CPU encoders currently use normalized output;
immediate rendering applies placement dimensions afterward. Fixed CSS gaps
therefore require an explicit mapping dependency on the final axis extent, or
a placement-aware projection operation. Shared domains can appear in placements
of different sizes. Do not mutate one shared scale's range while traversing
placements. Decide which mapping information is resolution-owned and which is
placement-derived, and use it consistently for rendering and inversion.

WebGL facet transforms and WebGPU `applyPlacementPixel` can scale offsets
after scale evaluation. Convert the uniform gap size with the final placement
extent or apply its contribution at the appropriate stage. DPR changes affect
raster resolution, not the gap's CSS size. Export uses its own final layout.

An overfull fit, where fixed gaps exhaust the available extent, needs an
explicit policy. Do not silently shrink configured gaps, reverse the data
slope, or clamp cuts away. Choose whether to reject that fit or enforce a
supported navigation/extent constraint during milestone 1.

## Current implementation and ownership

Relevant paths, relative to the repository root:

| Area                                | Entry points and implications                                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU index/locus mapping             | `packages/core/src/genome/scaleIndex.js`, `scaleLocus.js`, `src/scales/scalePosition.js`: affine band mapping, continuous inversion, shared band adjustment.                                                                                             |
| Scale configuration and propagation | `packages/core/src/spec/scale.d.ts`, `src/scales/scalePropsResolver.js`, `scaleInstanceManager.js`, `domainRuntime.js`, `scaleResolution.js`: resolve properties and publish coherent mapping changes.                                                   |
| Navigation                          | `packages/core/src/scales/scaleInteractionController.js`: index/locus navigation currently assumes an uninterrupted affine mapping.                                                                                                                      |
| Assembly boundaries                 | `packages/core/src/genome/genome.js`: contigs already have continuous starts and exclusive ends in assembly order.                                                                                                                                       |
| Immediate projection                | `packages/core/src/rendering/immediate/markEncoding.js`: normalized positions, band adjustments, and final placement projection shared by Canvas2D and SVG.                                                                                              |
| WebGL                               | `packages/core/src/rendering/webgl/gl/glslScaleGenerator.js`, `gl/includes/scales.glsl`, `gl/webGLHelper.js`, `rendererResources.js`, `marks/webGlMark.js`: generated high-precision mappings, textures, completed-mapping subscriptions, and uniforms.  |
| Generic WebGPU renderer             | `packages/webgpu-renderer/src/marks/scales/defs/index.js`, `src/marks/shaders/markShaderBuilder.js`, `src/marks/programs/internal/scaleResources.js`, `bindGroupBuilder.js`, `src/index.d.ts`: explicit shader/resource roles and mutable scale handles. |
| Core WebGPU adapter                 | `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`, `webGpuSurface.js`: translates resolved Core scales and binds retained updates through public renderer APIs.                                                                                  |
| Guides and inverse consumers        | `axisView.js`, `axisGridView.js`, locus ticks, ruler controllers, interval selection, scored labels, expression helpers, and App coordinate readouts consume forward or inverse mappings.                                                                |

Core owns boundary meaning, assembly expansion, resolution, and navigation.
Each renderer owns GPU packing, allocation, uploads, binding, and disposal.
Keep integer packing and shader details behind backend boundaries. Do not
import Core grammar or genome types into `webgpu-renderer`, or make WebGPU
depend on immediate projection or WebGL resources.

## GPU cut tables

Use a sorted integer table and a lower/upper-bound lookup. Start with binary
search; a short linear loop may be competitive for chromosome-sized tables,
but choose a specialization only after representative measurements. Avoid
adding an auxiliary acceleration structure without evidence that lookup cost
matters.

Use `u32` cuts where possible and the renderer's existing packed integer
representation for larger coordinates. Compare packed values as integers;
never convert large cut keys to `f32` for search. The existing 2^12 packing in
`webgpu-renderer/src/utils/highPrecision.js` is not an ordinary hi/lo u32 pair.
GPU cuts must match the supported data representation and precision limits.

WebGL can use a nearest-filtered integer texture with `texelFetch`, following
the integer selection-texture precedent in `gl/webGLHelper.js`. Share resources
by resolved scale where appropriate, and distinguish cut-content changes from
ordinary completed-mapping updates to avoid uploads during navigation.
Primary/secondary channels share the same cuts and choose endpoint affinity.

For WebGPU, prefer one packed cut storage buffer per mark, with per-scale
offset/count metadata, rather than one storage binding per axis or endpoint.
The renderer already uses bindings for packed series, placements, selections,
categorical scales, and text. It requests up to ten storage bindings per stage
when the adapter supports them; adding independent x/y tables can exhaust a
device's negotiated budget. Verify the actual combinations rather than assume
every device grants ten bindings.

Add an explicit cut resource role instead of repurposing ordinal/domain-map
buffers. Extend the generic scale factory and retained scale handle to update
cut content and scalar mapping parameters. The existing handle only exposes
domain/range updates, so it is insufficient for reactive cuts or size changes.
Keep buffer ownership mark-local initially; cross-mark WebGPU table sharing is
an optional later optimization.

### Static disabling and shader specialization

Classify gap configuration after ordinary scale-property resolution, before
shader generation and resource planning. Use the following disjunction:

```text
disabled = constant(gapWidth) && (gapWidth == 0 || gapWidth == null)
        || constant(gapPositions) && (gapPositions is empty || gapPositions == null)
```

Omitted properties use their disabling defaults. Preserve whether inputs are
constant through the Core adapter and generic renderer configuration; an
expression's current value is not evidence that it is constant. Either static
condition disables gaps independently of the other property's value or
reactivity.

For a statically disabled scale, generate the ordinary gap-free mapping:

- No gap lookup, rank adjustment, gap branch, or gap helper is emitted or run
  for that scale in visible or picking shaders.
- No gap uniform fields, gap-specific bindings, cut buffers, cut textures, or
  placeholder/dummy resources are declared or allocated for that scale.
- Gap-disabled scales contribute no entries or metadata to packed cut resources.
  A mark with another enabled scale can still own resources for that scale;
  when all its scales disable gaps, its shader and resource layout contain no
  gap infrastructure at all.

A uniform-controlled branch or multiplying the gap term by zero does not meet
this contract. Do not rely on a GPU compiler to remove unused bindings or on
zero-length allocations to represent absence. Shader specialization and
resource requirements must use the same resolved static classification.

Reactive zero/null width or empty/null positions do not, by themselves, imply
static disabling: they may later enable gaps and can retain the infrastructure
needed for those updates. Replacing the configuration across the static
disabled/enabled boundary must regenerate compatible shaders/pipelines and
resource layouts and release resources that are no longer needed. It must not
leave dummy gap resources in the disabled configuration.

Domain, pan, width, and viewport updates must not repack retained mark series
or reupload unchanged cuts. Cut changes may replace a table/bind group as
needed, with disposal following renderer ownership.

## Comparable systems and alternatives

[ComplexHeatmap](https://jokergoo.github.io/ComplexHeatmap-reference/book/a-single-heatmap.html#heatmap-split)
separates row/column splitting from `row_gap`/`column_gap` sizes. Adopt that
separation of grouping boundaries and output spacing; do not require its
clustering machinery to implement the lower-level scale feature.

[circlize](https://jokergoo.github.io/circlize_book/book/circular-layout.html)
separates sector ranges from angular `gap.after` settings. Its sector-aware
layout is useful precedent for a future circular view, but it does not supply
GenomeSpy's zoom/navigation or pixel-unit contract. These are design references;
this plan does not propose copying their implementation code.

Rejected for this feature: ordinary band padding, which varies with zoom;
inserting fake data coordinates, which changes the coordinate system; storing
cumulative pixel offsets, which duplicates the rank-times-uniform calculation;
per-index rank arrays, which scale with the full genomic domain; and separate
facets per group, which change composition and interaction semantics.

## Implementation milestones

All milestones are pending. Commit messages are tentative.

### 1. Establish mapping, endpoint, and navigation semantics

**Outcome:** a CPU reference contract for fixed gaps, band placement,
half-open endpoints, fitting, inversion, and smooth navigation.

**Affected areas:** CPU index/locus scales, scale position helpers, semantic
range normalization, navigation/domain ownership, and placement-derived
mapping inputs. Inspect downstream inverse consumers before changing contracts.

**Verification:** focused algorithm tests plus a headless scale-resolution
test exercising real domain/navigation updates. Cover `[0, 10)` / `[10, 20)`,
one-band rects, a ranged mark spanning an internal cut, band positions 0/0.5/1,
reverse output, fractional view domains,
large coordinates, empty/zero gaps, and a cut crossing each viewport edge.
Verify pointer anchoring inside both data and gaps. Specify the overfull policy
before closing this milestone. Verify the numeric inverse plateau at both gap
edges and throughout the interior, including reversed output. Exercise interval
selection through real inversion and normalization, with gestures starting,
ending, and remaining inside gaps in both drag directions.
Cover the collapsed selection's absent overlay and drag target, false CPU/GPU
membership even with `empty: true`, and unchanged selection-linked domain
without minimum-span feedback. Verify explicit navigation can resume updates.

**Documentation:** record the internal mapping contract and selected answers
to the navigation/placement questions in this plan and relevant architecture
documentation if ownership changes.

Tentative commit: `feat(core): define fixed-gap index scale mapping`

**Review gate:** mapping, endpoint intent, placement dependence, and navigation
state are the shared contract. Resolve these before duplicating them in shaders.

### 2. Implement renderer-generic WebGPU gaps

**Outcome:** the standalone renderer supports cut tables, uniform gap size,
endpoint affinity, and retained updates through a public generic scale API.

**Affected areas:** index scale definitions/factories, resource metadata,
shader generation, packed cut storage, bind groups, public types, placement
mapping, and Core's future adapter contract. Update the renderer migration
plan when this phase begins.

**Verification:** meaningful lookup/precision tests, retained resource tests,
and GPU output comparisons with the CPU reference. Exercise both axes,
primary/secondary endpoints, points, rects, rules, ranged text, placement,
picking, empty/nonempty table transitions, table replacement, and destruction.
Verify static disabling by either property, including when the other property
is reactive. Assert absence of gap shader logic, uniform fields, bindings, and
allocated resources; these are intentional specialization contracts. Exercise
mixed enabled/disabled axes and configuration replacement across the static
boundary. Inspect the binding budget with text effects, placements, and selections.
Confirm navigation and width changes
leave cut and series uploads unchanged.

**Documentation:** document the generic API and add a renderer-generic story
with pan/zoom or mapping controls and explicit gap boundaries. Build Storybook.

Tentative commit: `feat(webgpu-renderer): add fixed-gap index scales`

### 3. Expose Core grammar and integrate rendering paths

**Outcome:** ordinary scale definitions configure gaps on index/locus scales;
WebGL, the Core WebGPU adapter, and immediate projection use the same contract.

**Affected areas:** specification types/schema, property resolution, expression
binding, assembly expansion, WebGL textures/shaders, Core WebGPU retained
bindings, and Canvas2D/SVG projection. Keep cut-content revision separate from
mapping updates and preserve existing shared-scale resolution behavior.

**Verification:** headless specs cover encoding-level and view-level definitions,
shared x/x2 and y/y2 scales, chromosome expansion, parameter updates, assembly
changes, and unsupported/invalid inputs. Compare CPU, WebGL, and WebGPU
positions at cuts, with reversed output and large indices. Verify resources
survive physical scale replacement and are released with their owners.
Verify the static disabling contract through real Core specs in both GPU
backends, including constant zero/null width and constant empty/null positions.

**Documentation:** use `write-genomespy-docs` for specification JSDoc, schema,
and scale grammar documentation, and `write-genomespy-changeset` for the
user-visible feature. Existing specs need no migration when gaps are absent.

Tentative commit: `feat(core): expose grouping gaps across renderers`

### 4. Complete guides, interactions, and export integration

**Outcome:** grouped heatmaps and chromosome tracks behave coherently beyond
mark placement, including navigation, selection, readouts, guides, and export.

**Affected areas:** axes and chromosome grid ranges, ruler/selection inversion,
scored label placement, scale expressions, App coordinate consumers, SVG and
raster exports, and representative documentation examples. Verify consistent
endpoint treatment and ordinary rendering across internal cuts.

**Verification:** use `test-genomespy-views` for structured view/SVG coverage
and `debug-genomespy-web` for actual renderer and input behavior. Test repeated
placements of different sizes, DPR 1/2, resizing, gap-width updates, zoom/reset,
and export at a size different from the live viewport. Verify visible and
picking passes agree and the adjacent-interval gap contains no rect/rule hits.
In a separate spanning-interval fixture, verify the rect/rule stays continuous
and pickable across the internal gap, with matching export output.
Verify brush creation, resizing, and translation across gaps, including both
axes and reversed ranges; selection intervals remain defined and select no
extra data merely because the pointer travels across empty gap pixels.

**Documentation:** add chromosome-track and two-axis grouped-heatmap examples,
describe cut coordinates and interval endpoint behavior, and state the selected
inverse behavior and ordinary rendering of spanning marks.
Follow `examples/README.md` for shared specs.

Tentative commit: `feat(core): complete grouping-gap guides and interactions`

**Final review gate:** inspect all forward/inverse consumers and renderers
together, including the no-gap behavior and retained-update costs.

### 5. Review and simplify the complete implementation with a subagent

**Outcome:** an independent subagent reviews the completed implementation for
KISS, simplification opportunities, and code smells across the whole change.
Fix every obvious finding that does not require user input before finishing.

**Affected areas:** all changed runtime paths, shared contracts, renderer
resources, downstream consumers, tests, documentation, and the release note.
Prefer removing duplicate state and branches over adding abstractions. Include
the final cross-renderer behavior and no-gap specialization in the review.

**Verification:** run the narrow checks affected by each accepted fix, then
complete the final integration checks below. Re-review only changes that
materially alter behavior, architecture, or risk. Record any finding that needs
user input with its concrete tradeoff; do not leave obvious fixes outstanding.

**Documentation:** reconcile the implementation and review outcomes in this
plan, and update user-facing documentation when a fix changes its contract.

Tentative commit: `refactor(core): simplify grouping gap implementation`

## Final integration verification and acceptance

- Adapt `examples/docs/grammar/mark/rect/heatmap.json` into a two-axis grouped
  heatmap with point/text overlays and partition-aligned ranged marks.
- Compare adjacent `[0, 10)` / `[10, 20)` rects and rules with a separate
  `[0, 20)` mark at a cut before 10. The adjacent marks leave a gap; the
  spanning mark renders and picks normally across it, including in exports.
- Adapt `examples/docs/grammar/axis/genome-axis.json` and a genome-browser
  track to show chromosome boundaries, chromosome grids, labels, and selections.
- Exercise `examples/core/scales/large_genome_test.json` with cuts above the
  exact `f32` integer range and, where supported, above the single-u32 range.
- In a real browser, zoom and drag through cut boundaries and gap interiors,
  including partially visible edge gaps. Confirm smooth motion and constant
  measured CSS gap size in WebGL and WebGPU.
- Brush across gaps in both directions, begin/end inside a gap, and translate
  an existing selection through one. Confirm endpoints plateau at the cut,
  then resume changing in data, and a brush wholly inside one gap collapses
  to the cut without selecting extra indices or bases.
- Confirm a collapsed brush has no visible overlay, drag target, or matching
  data in CPU/WebGL/WebGPU predicates, and cannot expand through a linked
  domain. Test null/inactive fallback separately from active zero span.
- Compare representative Canvas2D and SVG output to the GPU paths. Verify
  export layout dimensions, repeated placements, range direction, endpoint
  affinity, and picking. Automated tests should protect these behaviors rather
  than generated shader strings or incidental resource layouts.
- Run focused suites during iteration, then the affected Core/renderer suites,
  workspace type checks, lint, GPU tests, documentation/schema checks, and
  Storybook build warranted by the completed changes.
- Check representative dense heatmaps and genomic tracks for lookup overhead.
  Measure cut/series uploads during navigation and size changes; add complexity
  only for a demonstrated bottleneck. Preserve the specialized no-gap path.
- Verify in WebGL and WebGPU that either statically disabling property removes
  gap shader logic and all associated uniform fields, bindings, buffers, and
  textures, even when the other property is reactive. Cover mixed axes and
  transitions caused by configuration replacement.

Acceptance requires equal configured gaps, stable within-band placement,
correct half-open adjacency, smooth navigation, matching renderer/export
behavior, ordinary scale-definition placement, and unchanged cut tables during
navigation. No existing no-gap specification should change its mapping.
Statically disabled gaps must have no shader logic or gap resource footprint.
Numeric inversion and interval selection must remain defined across every gap,
with gap interiors mapping to their boundary coordinate.
Ranged marks crossing internal gaps render normally; only endpoints touching
cuts receive special boundary-side treatment.

## Unresolved choices and risks

1. Confirm `gapPositions`, defaults, and the `"chromosomes"` shorthand;
   decide whether expression support belongs in the first implementation.
2. Choose the minimal placement-aware mapping and inverse/camera representation
   without conflicting with resolution-owned domains or differently sized views.
3. Decide whether coordinate readouts distinguish gap interiors from their cut
   coordinate using optional internal gap metadata. The numeric inverse and
   interval-selection plateau are defined above; navigation must retain any
   additional gap fraction it needs to avoid snapping.
4. Choose a policy for fits that cannot accommodate all fixed-size gaps.
5. Audit explicit band adjustments, degenerate/directed ranges, interval text,
   nested offsets, and guides so endpoint affinity does not change unrelated
   positioning semantics.
6. Verify packed integer precision, shader lookup cost, resource binding limits,
   and facet placement on actual GPU paths. Small tables make the memory cost
   modest, but do not eliminate these correctness and budget risks.

Reconcile completed or deliberately discarded work in this temporary plan,
commit that record, and delete the plan in a later commit before PR creation
or merge, following the repository planning workflow.

# Fixed-size grouping gaps for index and locus scales

Status: implemented and independently reviewed on `codex/scale-grouping-gaps`.
The revised plan was committed before implementation as `a227d3c79`. Final
verification and review outcomes are recorded below.

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

The grammar below is implemented: `gapPositions`, `gapWidth`, chromosome
shorthand, and expression references use ordinary resolved scale ownership.

## Grammar

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

Widths use CSS pixels. Omitted `gapPositions` disables gaps. When positions
are supplied, omitted `gapWidth` defaults to 6; literal null or zero width
disables gaps. Empty or null positions independently disable gaps. A future
polar layout may need angular units; no unit grammar is introduced before its
coordinate contract exists.

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

Navigation uses two fractional cut ranks at the viewport edges, stored with
the existing domain runtime as `gapDomain`. A placement-local inverse also
returns the fractional rank within a gap, while numeric `invert()` returns
only the cut coordinate. Panning translates the current mapping; anchored
zoom changes its data slope while retaining the pointer's fractional gap
position. Animated domains interpolate slope and origin, using stable
`expm1` weighting for nearly equal slopes.

Explicit domain changes and reset initialize ranks from the new domain.
Navigation and animation frames preserve them, physical scale replacement
mirrors them, and scale copy retains them. Selection-linked domain echoes do
not erase partially visible edge gaps. This extends the existing domain owner
without introducing another camera framework.

Core positional scales and CPU encoders currently use normalized output;
immediate rendering applies placement dimensions afterward. Fixed CSS gaps
therefore require an explicit mapping dependency on the final axis extent, or
a placement-aware projection operation. Shared domains can appear in placements
of different sizes. Do not mutate one shared scale's range while traversing
placements. Cuts, width, domains, and edge ranks are resolution-owned. Final
axis extents are placement-derived: immediate rendering, pointer navigation,
brushes, and rulers pass their actual extent. Canonical scale inversion uses
the resolution's axis extent. Both GPU paths derive CSS spacing from the actual
placement extent.

WebGL facet transforms and WebGPU `applyPlacementPixel` can scale offsets
after scale evaluation. Convert the uniform gap size with the final placement
extent or apply its contribution at the appropriate stage. DPR changes affect
raster resolution, not the gap's CSS size. Export uses its own final layout.

When fixed gaps exhaust a placement extent, affected geometry is hidden until
space becomes available again. GPU visibility guards handle each placement
without CPU scans of instance indices; CPU occurrence traversal applies the
same visibility rule. Inversion and navigation temporarily use ordinary domain
mapping. Gaps are never shrunk and cuts are never discarded to accommodate a fit.

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

Omitted positions disable gaps; omitted width defaults to 6 when positions
are configured. Preserve whether inputs are
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

All five milestones are complete. The tentative commit messages below
describe the original decomposition; implementation and review fixes are
integrated into one coherent feature commit because the renderer and domain
contracts must change together.

### 1. Establish mapping, endpoint, and navigation semantics — complete

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

### 2. Implement renderer-generic WebGPU gaps — complete

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

### 3. Expose Core grammar and integrate rendering paths — complete

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

### 4. Complete guides, interactions, and export integration — complete

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

### 5. Review and simplify the complete implementation with a subagent — complete

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

Completed verification:

- Full Vitest suite: 521 files, 4,901 passing tests, one skipped and two todo.
  Two additional final regressions pass in the focused renderer/resource suite
  (48 tests): WebGL uploads preserve another axis's sampler binding, and WebGPU
  text placement capacity uses logical rows before glyph expansion.
- All workspace TypeScript checks and repository lint pass. The two affected
  packages and changed files were checked again after the final review fixes.
- Five real WebGPU tests pass: exact lookup at ordinary and 2^35 coordinates,
  adjacent versus spanning interval picking, retained cut buffer reuse,
  unequal placement extents, and initial conditional endpoint edge ranks.
- Real Chromium rendering passes for the two-axis heatmap and chromosome-track
  examples in WebGL and WebGPU at DPR 1 and 2. A temporary large-coordinate
  fixture with a cut above 2^35 also passes in both renderers and was removed.
  Visual inspection caught and fixed WebGL lazy texture uploads disturbing an
  already bound axis sampler; both row and column gaps now render correctly.
- Real browser wheel zoom anchored inside a gap and direct drag were exercised
  in both renderers. The anchor remains fixed, a 25 CSS pixel drag translates
  the boundary by 25 pixels, and gap width remains 12 CSS pixels. Raster
  measurements also check adjacent rectangles and continuous spanning marks.
- Structured SVG tests verify adjacent half-open intervals, resized exports,
  reversed and degenerate ranges, and ordinary spanning geometry. Canvas2D
  uses the same placement projection path and both feature examples render.
- The real interval controller is exercised with DOM mouse gestures in both
  drag directions: beginning/ending within gaps, a gap-only collapsed brush,
  and translation. Visible bounds drive drag hit testing, including a null
  unselected axis. Selection predicates, hidden overlays, linked-domain
  retention, and explicit navigation are protected by subsystem tests.
- Static disabling is covered in Core and generic renderer tests, including
  a disabled property paired with an unbound reactive expression. Generated
  shaders, uniforms, and resources omit gap infrastructure. Replacing static
  configuration recreates compatible retained programs and releases shared
  WebGL textures independently of ordinary scale references.
- Retained resource tests verify unchanged cuts are not uploaded during domain
  or width changes. Exact integer search uses one rank table and binary search;
  no extra acceleration structure or per-index lookup array was introduced.
- Schemas, specification reference generation, API docs, and the documentation
  site build pass. The docs build uses a writable temporary uv cache. The
  generic renderer Storybook build, release policy check, and release status
  check pass. A Core minor Changeset records the feature.

The final representative examples are
`examples/docs/grammar/scale/grouping-gaps.json`,
`examples/docs/grammar/scale/chromosome-gaps.json`, and
`examples/docs/grammar/data/lazy/scale-groups.json`. They cover gaps on both
axes, hg38 chromosome boundaries with fixed 5 px gaps, and generated group
outlines. The redundant core examples were removed. All three documentation
examples have freshly captured, visually inspected screenshots. Schema
validation, formatting, the nine example-macro tests, and release-policy
checks pass. Reactive-width behavior remains covered by the integration
verification above.

Deliberately discarded verification duplication:

- A full Cartesian product of every mark, backend, placement, direction, and
  gesture was replaced by shared encoding/shader contract tests plus the
  representative browser, GPU picking, controller, and SVG fixtures above.
  No additional point/text overlays or duplicate large-genome example are
  retained solely to repeat those contracts.
- A standalone dense-scene performance benchmark was not added. Resource
  retention and the complete no-gap specialization are verified directly;
  search specialization remains deferred until a measured bottleneck warrants
  it. No performance improvement claim is made.

## Review outcomes and resolved risks

The requested independent KISS/code-smell review covered the complete runtime,
shared contracts, downstream consumers, and retained resource lifecycle. All
obvious findings were fixed without requiring user input:

- Preserve structural specialization when resolved gap enablement changes.
- Derive endpoint affinity from the actually selected peer branch, preserving
  equal/reversed intervals and ordinary no-gap rule defaults.
- Use actual placement extents for pointer navigation and capacity validation.
- Restore configured edge ranks for initial conditional WebGPU scale channels.
- Project brush bounds with half-open affinity, exclude collapsed brushes,
  and handle null unselected axes during drag hit testing.
- Release statically disabled shared WebGL cut textures even while ordinary
  scale references remain, and read current physical scales in cached callbacks.
- Stabilize animated cameras for nearly equal slopes and retain partial edge gaps.
- Validate only placements used by the logical submitted row range, including
  text whose GPU glyph instances differ from logical rows.
- Replace the per-frame array-based structure key with a two-bit axis mask.

The remaining extensions are explicit locus-object cut syntax, clustering and
ordering production, variable gap widths, and polar layout units. They remain
outside this feature's scope. Ordinary numeric readouts intentionally show the
cut coordinate within a gap; fractional rank metadata stays internal to
navigation.

All five milestones and the requested independent review are complete. The
discarded verification duplication and out-of-scope extensions are recorded
above; no unresolved findings or decisions remain. Commit this final record,
then retire the temporary plan before PR creation.

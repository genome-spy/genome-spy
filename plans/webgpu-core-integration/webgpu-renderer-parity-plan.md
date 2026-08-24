# WebGPU renderer parity plan: faceted rendering

Status: Authorized; Milestones 1–5 implemented and verified.

Date: 2026-08-21

Last reconciled review: 2026-08-24

Core owns grammar, dataflow, scale resolution, selection semantics, occurrence
traversal, and facet placement. The WebGPU adapter translates those semantics
to the generic retained renderer. WebGL remains the behavioral reference.

## Reproduced status

- `examples/docs/grammar/mark/link/link-shapes-and-orientations.json` fails
  under WebGPU before any link is drawn. The second occurrence of the same
  `viewRoot/axis_left/domain` rule mark is rejected by
  `WebGpuViewRenderingContext`. The focused runner produces an empty canvas;
  the WebGL comparison passes.
- `examples/app/expression-zscores.json?renderer=webgpu` first fails at the
  `sample-labels` text mark because it has a `facetIndex` encoder. Removing
  only that guard would not be sufficient: the heatmap itself also uses
  repeated `sampleFacetRenderingOptions`.
- `createWebGpuMarkConfig` explicitly rejects both sample-facet paths, and the
  WebGPU context explicitly rejects all repeated mark occurrences.
- The Core WebGPU runner covers `examples/core` and `examples/docs` but rejects
  `examples/app`, so App sample-facet regression coverage is currently manual.
- The focused adapter, surface, layout-result, and occurrence-helper baseline
  is green: 64 tests in five files pass before implementation.
- Layout 2.0 Phase 1 is already complete on `master` in
  `refactor(core): separate layout from rendering collection (#476)`. Core now
  has the intended arrange -> completed `LayoutResult` -> backend collection
  lifecycle, and the WebGPU coordinator consumes that result without a second
  view traversal.
- The current App/Core boundary is renderer-specific: `LocationManager` creates
  and updates a `WebGLTexture`, `View` exposes `getSampleFacetTexture()`, and
  `Mark.getSampleFacetMode()` identifies `SampleView` by looking for a
  `samples` property in an ancestor spec. `MetadataView` itself does not own
  rendering resources; it only emits the `facetIndex` semantic channel.
- Core's old `FacetView` is disabled in `ViewFactory`, marked `@ts-nocheck`, and
  still has unimplemented layout methods. Reviving the public ordinary-facet
  grammar is therefore a separate Core feature, not renderer-parity work.

The failures are architectural, not missing link or text geometry.

## Existing contracts to preserve

All facets currently share the same scale domains and other logical mark
state. The actual mark is the same for every facet. Facets differ in the data
instance range selected from the mark's buffers and in placement/clipping.

WebGL supports two sample-facet strategies whose behavior WebGPU must
preserve, but WebGPU does not need to preserve their implementation split:

1. **Range mode:** one retained logical mark and one draw call for each facet.
   Every draw selects the facet's buffer range and uses its viewport and clip.
2. **Facet-coordinate texture mode:** one retained logical mark and one draw
   for the whole facet-indexed mark. Each instance uses `facetIndex` to look up
   its coordinates on the GPU. This is used by sample labels and metadata where
   there may be up to about 2,000 sample facets.

Range mode currently has an additional performance contract that is easy to
miss: `SampleView` emits all occurrences and `BufferedViewRenderingContext`
buffers them, but `Mark.prepareSampleFacetRendering()` rejects a sample band
wholly above or below the normalized viewport before issuing its range draw.
This is important in closeup/peek mode because only a small subset of a
thousand-sample layout may intersect the viewport. In indexed mode, the
coordinate table retains offscreen coordinates and a zero height denotes a
missing or filtered sample; normal shader and viewport clipping suppress the
offscreen geometry.

App filtering does not replace the sample collection. `sampleData.ids` and its
stable `indexNumber` values describe every known sample, while the mutable
sample hierarchy describes the currently presented subset and order. The
current WebGL texture is sized from the complete `sampleData.ids` collection,
cleared to zero, and populated only for samples with current locations. WebGPU
must preserve this distinction: collection membership defines placement and
packed-data topology; filtering, grouping, sorting, and restored provenance
change presentation only.

Likewise, absence from the active or visible occurrence list is not a resource
lifetime signal. A configured logical mark may have no submitted draws because
all of its samples are filtered, clipped, or offscreen. Core view/mark ownership
and explicit disposal determine lifetime; presentation determines only the
current draw list.

The proposed WebGPU path unifies the placement representation, not necessarily
the submission strategy. A renderer-owned placement resource maps a generic
placement index to a facet rectangle. Existing `facetIndex` values translate
to a per-instance index and retain the one-draw path. Range-mode occurrences
use a draw-level index and preserve CPU visibility pruning, so data-heavy
offscreen ranges never reach a draw command. Compatible visible ranges may be
packed into one draw only when doing so does not reintroduce work for hidden
data. Ordered draw splitting remains available when overlap makes paint order
observable.

`LayoutResult` already records ordered repeated mark calls, facet identifiers,
sample-facet batch scopes, view coordinates, and clips.
`visitMarkOccurrences` already implements backend-neutral placement for
`sampleFacetRenderingOptions` and `facetIndex`. The WebGPU renderer already
supports repeated handles and `firstInstance` / `instanceCount` draw ranges.

## Relationship to Layout 2.0

Layout 2.0 Phase 1 is implemented and merged. Its implementation record later
marked the Phase 2–5 drafts as discarded implementation plans that require new
proposals based on the merged result. Facet integration must therefore use
their validated findings without reviving the broad roadmap as a prerequisite.

The relevant findings are:

- semantic repetition keys, dense placement indices, ordered render
  occurrences, and backend resource identities are different concepts;
- geometry/presentation changes, occurrence membership/order changes,
  renderer-resource structure changes, and data/scale changes are separate
  facts;
- WebGPU may regenerate a cheap ordered draw list without recreating compatible
  retained mark resources; and
- SampleView peek already changes presented sample geometry without changing
  repeated membership or rerunning general layout.

This feature has no demonstrated need for a repository-wide persistent layout
instance or occurrence identity system. `LayoutResult` may continue to contain
ephemeral ordered occurrences. Stable semantic sample/facet keys and stable
`PlacementSource` ownership provide the topology and geometry mapping needed by
the two concrete facet implementations. They must not be presented as a
general Layout 2.0 identity solution.

The current WebGPU surface already retains one handle per logical Core mark and
rebuilds a cheap frame draw array. Facet integration extends that model to
repeated occurrences. Full WebGL batch retention, general target/presented
layout transitions, semantic visibility, and incremental layout remain future
work with separate decision gates.

## Goals

- Render current repeated mark occurrences and both Core sample-facet inputs
  under WebGPU with WebGL-compatible data ranges, placement, order, clipping,
  culling, transitions, and empty-facet behavior.
- Provide the generic Core 2D placement and repeated-range contracts needed by
  a future ordinary-facet implementation without enabling facet grammar now.
- Keep exactly one retained renderer mark per logical Core mark, regardless of
  facet count.
- Keep scale domains and columnar series resident across layout-only changes.
- Keep complete sample membership and collector ranges resident across
  filtering, grouping, sorting, and restored initially filtered state; those
  operations change presentation rather than sample topology.
- Support about 2,000 sample facets without per-facet pipelines, bind groups,
  text atlases, buffers, or full mark configurations.
- Provide standalone WebGPU renderer Storybook scenes for indexed 2D placement
  and repeated range placement without importing Core concepts.
- Keep indexed labels and metadata coalescible to one draw per logical mark,
  including the approximately 2,000-facet case.
- Suppress draw-level sample ranges whose placements do not intersect the
  effective viewport and clip, particularly in closeup/peek mode.
- Use the same packed data and occurrence placement in normal and picking
  passes.
- Establish WebGL parity for every JSON specification discovered recursively
  under `examples/app/`, not only the focused sample-facet fixture.
- Keep facet grouping and placement in Core and keep the renderer free of Core
  and App types.
- Remove WebGL resource ownership and renderer detection from App sample-layout
  classes while keeping WebGL, WebGPU, Canvas2D, and SVG usable from the same
  semantic layout output.

## Non-goals

- Do not add a renderer scene graph or Core-specific facet API.
- Do not allocate one retained mark per facet, even as a temporary path.
- Do not CPU-project every datum on layout, zoom, or pan.
- Do not redesign Core faceting, App sample hierarchy, collector grouping, or
  selection grammar.
- Do not remove or rename the existing `facetIndex` grammar channel as part of
  renderer migration.
- Do not implement independent scale domains per facet now. The architecture
  must leave an extension point for them on the same logical mark.
- Do not depend on indirect multi-draw or require render bundles. Standard
  WebGPU indirect draw commands consume one argument block per call. The
  initial range-mode path uses direct draws for the Core-resolved active ranges;
  the indexed path does not need multiple draws. A profiler-gated cached
  submission path may record individual indirect draws, but it must not change
  Core's ownership of placement, clipping, or occurrence visibility.
- Do not add GPU visibility computation during parity work. Core already has
  the presentation geometry and effective clips needed to resolve active
  occurrences without readback. GPU compaction requires a separate measured
  justification.
- Do not implement ordinary-facet grammar, grid/wrap layout, headers, axes,
  margins, data grouping, or scale-resolution policy in the low-level renderer.
  Core remains responsible for producing placement rectangles.
- Do not enable or repair the dormant Core `FacetView` in this plan. Its future
  Core-owned grid/wrap, grouping, headers, axes, and scale-resolution work will
  consume the renderer-neutral placement contract established here.
- Do not extract the transitional WebGL implementation into a new renderer
  package or introduce a universal WebGL/WebGPU renderer interface as part of
  facet placement.
- Do not publish a grid-layout convenience API until a second concrete caller
  beyond tests demonstrates requirements that Core's existing layout utilities
  cannot satisfy.
- Do not remove WebGL's uniform range-draw transform merely for backend
  symmetry. Renderer-neutral ownership does not require identical WebGL and
  WebGPU execution strategies.

## Delivery sequence

Layout 2.0 Phase 1 is already present on `master`; do not reimplement it.
Implement Milestone 1 as one coherent master-first change, then merge it into
the `webgpu` branch. Do not develop the shared Core/App contract on the WebGPU
branch and later back-port it.

The master change publishes generic revisioned CPU placement primitives used by
SampleView, replaces sample-specific batch hooks with a generic
repeated-placement scope, and adapts WebGL, Canvas2D, and SVG. It preserves
WebGL range-mode visibility pruning and SampleView's layout-free peek
presentation updates. It neither enables the dormant `FacetView` nor
implements discarded Layout 2.0 phases.

This is an evolution of the existing `View.arrange()` -> `LayoutResult`
boundary, not a replacement for it. Keep the depth-first traversal and
ephemeral command result. Do not introduce a retained scene graph, dirty-node
system, renderer scheduling policy, or a general traversal rewrite. The
sample-specific hooks and backend resource lookups are the demonstrated design
problem; broader traversal cleanup remains out of scope unless implementation
uncovers a concrete blocker.

The WebGPU branch then owns Milestones 2–5: retained `PlacementSet` resources,
occurrence-to-resource frame assembly, mark shader support, packing/culling
choices, and App WebGPU coverage. This split gives the shared abstraction
multiple production backend consumers before the experimental renderer relies
on it and keeps the master commit independently testable and revertible.

## Milestone execution and reconciliation

Treat this plan as a sequence of reviewed hypotheses, not as an API
specification that implementation must preserve at any cost. Complete and
verify one milestone before starting the next. At the end of every milestone,
the implementer must:

1. Compare the implemented ownership, data shape, invalidation, resource
   lifetime, draw order, clipping, and measured cost with the assumptions in
   this plan.
2. Record any contract that became simpler, more complex, impossible, or
   unnecessary. Prefer correcting a generic Core or renderer boundary over
   retaining an adapter workaround merely to match the original wording.
3. Reconcile the remaining key decisions, milestone outcomes, verification,
   risks, and acceptance criteria before continuing. Remove superseded work;
   do not leave both the old and new paths as implied requirements.
4. Re-run earlier cross-backend tests affected by the change. A later milestone
   must not silently weaken an invariant established by an earlier one.
5. Commit the verified implementation and the reconciled planning record. For
   the master-first Milestone 1, land the implementation on `master`, then
   update and commit this plan on the `webgpu` branch after merging master and
   before Milestone 2. For Milestones 2–5, the plan reconciliation may accompany
   or immediately follow the milestone's clean implementation commit.

Do not start the next milestone while a failed verification, unexplained
performance regression, ownership ambiguity, or stale downstream plan remains.
Minor wording and test-fixture corrections need no independent review; a change
to a shared contract, public renderer API, resource lifetime, clipping/order
semantics, or performance strategy re-enters the applicable review gate below.

## Key decisions

### Publish one renderer-neutral placement source

`LocationManager` will own only sample layout and presentation computation. A
stable `PlacementSource` publishes immutable topology and geometry as one
atomically replaceable current snapshot. The Core-side conceptual shape is:

```ts
type PlacementTopology = {
  revision: number;
  /** Array position is the dense placement index. */
  facetIds: readonly (readonly Scalar[] | undefined)[];
};

type PlacementSnapshot = {
  topology: PlacementTopology;
  geometryRevision: number;
  rectangles: Float32Array;
  overlap: "disjoint" | "may-overlap";
};
```

`facetIds` enumerate complete collector topology, including members that have
no active occurrence. An entry may be `undefined` for a placement that is not
collector-faceted. Semantic keys used by the owner to construct or update this
aligned array are not renderer data. In App, the entries are derived from the
complete `sampleData.ids` collection, not from the filtered hierarchy.

The rectangle array has exactly four values per topology entry. It contains
normalized `[x, y, width, height]` rectangles and uses a monotonically
increasing geometry revision. Values for a published snapshot are never
mutated. A topology change publishes a new topology and matching geometry
atomically; a geometry-only update reuses the same topology object and
revision. Publishing geometry with a mismatched count or topology revision is
an error. Backends cache resources by source identity and update them when the
captured geometry revision changes. The current vertical layout fills `x = 0`
and `width = 1`; using rectangles keeps the semantic contract usable for a
two-dimensional facet layout without exposing a GPU representation.

`PlacementSource` also exposes a renderer-neutral disposal notification. Its
owning view or App layout helper disposes it through the existing Core view
lifecycle; backend caches subscribe and release only their own derived
resources. Disposal is idempotent. App never receives those backend resources,
and absence from a snapshot's active presentation is not disposal.

Rectangles are ordered `[x, y, width, height]`, use a top-left origin with y
increasing downward, and are normalized against an explicitly identified owner
viewport. A draw that binds the placement set supplies that owner viewport;
the renderer maps a rectangle to canvas logical pixels as
`owner.xy + rectangle.xy * owner.size` and
`rectangle.size * owner.size`. This allows one vertical placement source to be
shared by sidebar and plot draws with different widths while preventing an
implicit mix of canvas-, view-, and device-pixel coordinate spaces.

`RenderingOptions` and the completed occurrence record carry the stable
placement source and already-resolved numeric placement index explicitly:

- sidebar marks receive the source and use their encoded `facetIndex` per
  datum;
- each repeated sample-child occurrence receives the same source plus its
  placement index; and
- `facetId` remains independently responsible for choosing the collector data
  batch.

Core maps semantic sample/facet keys, collector facet IDs, and encoded facet
values to dense, zero-based placement-set indices for a topology revision.
Renderer indices never serve as collector `facetId` values, never claim to be
general layout-instance identities, and are never assumed to preserve a
semantic identifier. SampleView's current dense `indexNumber` is one possible
mapping, not a renderer requirement.

For an App sample placement source, the topology builder enumerates the complete
`sampleData.ids` membership in its stable source order, even when the initial
restored hierarchy is already filtered. Every known sample receives a placement
index and a packed collector range; a sample without data receives an empty
range. The current hierarchy must never be used as the topology source because
doing so would remap indices and repack mark data when a filter is undone.
Only adding, removing, or replacing members of `sampleData.ids` advances the
sample placement topology revision.

This complete topology is the adapter's authoritative enumeration when it packs
range-mode collector batches. Active `LayoutResult` occurrences select which
ranges are currently submitted, but they never define which ranges exist. This
keeps an initially fully filtered hierarchy valid and prevents undo from
discovering previously absent topology mid-frame.

Semantic-key resolution occurs only while building or changing facet topology,
not while publishing geometry or drawing frames. The topology builder assigns
each facet a dense index and stores that integer directly in repeated occurrence
options and in a numeric array aligned with any visually ordered location
records. Composite keys may be compared or interned at this boundary, but they
must not be serialized, hashed, or looked up once per facet on geometry-only
frames.

In particular, the current `LocationManager.#updateFacetTextureData()` lookup
through `entities[sampleLocation.key]` must disappear. Peek/scroll updates loop
over dense/aligned numeric indices and write the rectangle `Float32Array`
directly. Facet-indexed mark data is translated to the same dense integers when
its retained series/topology is built; shaders index the placement resource
directly. CPU culling likewise scans numeric rectangles and indices without
semantic-key lookup.

Arrangement captures placement-source identity, topology revision, and resolved
numeric placement indices in `LayoutResult`; it does not freeze presentation
geometry or require a key-to-index map in the render hot path. Filtering,
grouping, sorting, and provenance restoration publish a new completed result
and resolved occurrence order while retaining the membership topology and
packed mark series. A geometry-only SampleView peek/scroll frame may publish a
new immutable current snapshot with the same topology after arrangement,
preserving the existing layout-free animation path. Each backend captures one
source revision at frame collection and uses it consistently for normal/picking
work produced for that frame. App code updates CPU presentation state but never
backend GPU resources.

A snapshot also declares whether its non-empty rectangles are pairwise
disjoint. Core may set this only when its layout guarantees the invariant;
development validation checks it. Reorder transitions that temporarily overlap
publish `may-overlap` instead.

The completed `LayoutResult` plus the current immutable presentation snapshot
therefore contain everything a backend needs. A mark adapter must not scan
layout ancestors, inspect an App spec for a `samples` property, or ask a view
for a backend resource. Replace the sample-specific batch callbacks with a
generic repeated-placement batch scope only where SVG/WebGPU command grouping
still needs an explicit boundary.

Backend ownership then becomes explicit:

- **WebGL range mode:** Milestone 1 resolves the placement snapshot to the
  existing `SAMPLE_FACET_UNIFORM` values and range callback, preserving current
  pixel and culling behavior while moving ownership. A later simplification
  may use ordinary occurrence coordinates only after mark-by-mark parity proves
  the standard view transform equivalent.
- **WebGL indexed mode:** `WebGLHelper` owns and updates a texture derived from
  the placement source revision. App code never imports the WebGL texture
  helper or returns `WebGLTexture` objects.
- **WebGPU:** the surface/renderer owns and updates the indexed placement
  resource described below. It may coalesce indexed instances while retaining
  draw-level selection and CPU pruning for range batches.
- **Canvas2D and SVG:** their existing immediate occurrence visitor reads the
  same CPU source without a GPU upload.

This is a semantic sharing boundary, not a universal low-level renderer API.
Each backend retains its appropriate batching and resource representation.

### Expose placement as a first-class renderer API

The low-level renderer API will use generic `PlacementSet` handles rather than
facet, sample, row, or column concepts. A placement set contains axis-aligned
2D rectangles in draw-viewport-local normalized coordinates. The renderer owns
the GPU representation and exposes explicit replacement and destruction,
following the retained mark API. Existing draw scissoring remains separate; a
draw may request clipping to each selected placement rectangle when marks must
not bleed across panels.

Placement capability is fixed when a mark is created so pipeline and binding
layouts never change during a frame. The tentative public types are:

```ts
type PlacementSetData = {
  /** Packed viewport-local normalized [x, y, width, height] rectangles. */
  rectangles: Float32Array;
};

type PlacementSetHandle = {
  readonly placementSetId: number;
  readonly count: number;
  replace(data: PlacementSetData): void;
  destroy(): void;
};

type PlacementIndexConfig =
  { source: "draw" } | { data: Uint32Array; type: "u32" };

type DrawPlacement = {
  set: Pick<PlacementSetHandle, "placementSetId">;
  /** Required only when the mark uses source: "draw". */
  index?: number;
  clipToPlacement?: "x" | "y" | "xy";
};
```

`MarkConfig` gains an optional `placementIndex: PlacementIndexConfig`, and
`DrawCommand` gains `placement?: DrawPlacement`. Draw-index marks require a
non-negative in-range draw index. Series-index marks forbid the draw override;
their shader culls an instance whose index is outside the bound set, allowing
filtered/missing facets without an unsafe buffer read. A mark without placement
capability rejects a placement binding, while a placement-enabled mark requires
one. Normal and picking frames use the identical normalized binding.

The Core adapter passes only `PlacementSetData.rectangles` and dense indices
through this package boundary. `PlacementTopology`, semantic keys, collector
facet IDs, and topology revision policy remain Core-side and must not appear in
the renderer API.

`replace()` preserves handle identity and never rebuilds mark pipelines. It may
replace the GPU allocation and dependent bind groups when capacity grows.
Replacement validates a length divisible by four and finite non-negative
sizes. Destruction is deterministic and idempotent; using a destroyed or
unknown handle in a frame is an error.

This contract supports row facets, column facets, two-dimensional grids,
wrapped one-dimensional facets, unequal rectangles, sparse/empty panels, and
animated layout updates without creating a retained mark per panel. Core's
layout system generates those rectangles. The renderer deliberately does not
provide grid/wrap algorithms, group data, create axes or strip labels, or
resolve scales.

Placement geometry and scale state remain orthogonal. Future independent
domains may introduce per-draw or per-instance x/y scale-state resources
without adding domain data to `PlacementSet`; that is a substantial deferred
renderer design, not an existing capability promised by this plan.

### Preserve SampleView clipping and dynamic presentation

The current App path has several related but distinct dynamic geometries:

- sample children use the GridChild plot rectangle as their owner viewport and
  inherit `clipBySummary(plotCoords)`, which removes the sticky-summary strip;
- labels, metadata, and per-sample vertical axes use the corresponding owner
  rectangle with directional inherited clipping;
- each SummaryView occurrence has a sticky/interpolated summary rectangle,
  expanded by its horizontal overhang, and inherits the SampleView plot
  rectangle expanded by the same overhang; and
- group backgrounds/grid lines use interpolated group rectangles intersected
  with the non-sticky content clip.

For a SummaryView mark with self clipping, the effective clip is the directional
intersection of its occurrence rectangle and the inherited SampleView clip. A
mark without self clipping receives only the inherited clip; `clip: "never"`
continues to suppress both. Sample-facet placement is currently an additional
transform inside the GridChild owner viewport, so it must not implicitly add a
per-sample self clip that WebGL does not apply today.

`LocationManager` should publish flat numeric placement tables for the repeated
sample, summary, and group/background roles from one coherent presentation
revision. Sticky summary clamping, summary overhang, group intersection, and
sample clipping are evaluated when that revision is published, not repeatedly
through `Rectangle` getter chains during drawing. The tables may be separate
generic `PlacementSource`s because their topology and count differ, but a frame
captures all sources from the same presentation revision.

Inherited/container clips remain ordinary directional draw state. Placement
self clipping is opt-in and directional through
`clipToPlacement?: "x" | "y" | "xy"`. For draw-level occurrences, Core/WebGPU
can intersect numeric inherited and self clips and use a hardware scissor. For
a coalesced per-instance draw, the common inherited clip remains the draw
scissor and only the directional per-placement bounds travel through the
shader. Normal and picking use the same resolved clip policy and presentation
revision.

Do not replace Core's `Rectangle` class repository-wide in this work. It remains
a convenient layout value API and the compatibility mechanism for unchanged
WebGL/SVG paths. At the adapter boundary, any remaining ordinary dynamic
rectangle is read once into plain numeric `[x, y, width, height]` values per
frame; do not call `flatten()`, which allocates another closure-backed
rectangle. The high-cardinality SampleView paths use the flat placement tables
directly.

This is a focused first step toward the Layout 2.0 opportunity of separating
ephemeral layout calculations from flat rendering-facing presented geometry.
A repository-wide committed geometry store, target/presented transition model,
or replacement of closure-based rectangles requires a separate measured plan.

### Retain logical marks and index packed placements

`WebGpuSurface` will retain resources by logical Core mark. A frame assembler
will collect all occurrences before updating the retained mark. It produces two
separately invalidated artifacts:

1. A packed mark topology concatenates each distinct collector batch once and
   records stable range offsets plus per-instance placement indices. It changes
   only with collector data/batch revision, placement topology revision, or
   channel shape.
2. A resolved occurrence plan records ordered direct range indices, owner
   viewports, clips, and draw-level placement indices. It may be rebuilt cheaply
   when `LayoutResult` identity or presentation order changes without replacing
   the packed topology.

For App sample-faceted marks, the packed topology enumerates collector batches
from the placement topology's complete `facetIds`, not only batches referenced
by the current filtered occurrence list. Missing batches become empty ranges.
Thus a filter changes submitted occurrences without changing channel-series
contents or range offsets.

The Core adapter compiles semantic `LayoutResult` commands into a resolved
occurrence plan only when the layout-result identity, collector data/batch
revision, or placement topology revision changes. That compile step may resolve
`facetId` through the collector and semantic facet keys through topology maps.
It stores direct batch references or dense numeric range indices in the
resulting occurrences. Geometry revisions do not invalidate this plan.

Steady-state normal, picking, peek, and scroll frames replay the resolved plan.
They must not call `collector.facetBatches.get(facetId)`, compare or serialize
composite facet IDs, or resolve sample keys. Thus, both placement selection and
collector-range selection use precomputed integers in the frame hot path. The
initial compile, a new completed layout result, or an actual topology/data
change may perform O(facet count) semantic lookups once.

The assembler consumes explicit occurrence records rather than inferring state
from mutable marks:

```ts
type CoreMarkOccurrence = {
  mark: Mark;
  /** Direct resolved batch; no semantic lookup during frame replay. */
  dataBatch: object[];
  /** Retained for diagnostics/semantics, not consulted by the frame hot path. */
  facetId?: Scalar[];
  placement?: {
    source: PlacementSource;
    topologyRevision: number;
    index?: number;
  };
  viewport: Rectangle;
  clip?: ClipOptions;
  paintOrder: number;
  repeatedBatch?: object;
};
```

For one logical mark, the adapter establishes one channel shape and
concatenates every series-backed channel, conditional-series branch, hidden
unique ID, and per-instance placement index in the same batch order. Mark-wide
constant values and shared scale domains remain single retained slots. Text
concatenates logical strings first and performs one retained series replacement
before glyph expansion. Add a collector data revision that advances whenever a
completed batch can change; packing caches use collector identity, data
revision, facet-batch identity, and channel shape rather than array identity
alone.

Facet-specific batches will be concatenated into one retained series. The
packing cache will be keyed by source batch identity and shape so viewports,
clipping, filtering, grouping, sorting, and sample layout transitions do not
replace stable channel series. An initially filtered hierarchy still packs the
complete membership once. The placement index can be packed into the existing
`u32` series allocation; the facet rectangles use one shared renderer-owned
placement resource.

Inside a repeated batch declared `disjoint`, the assembler may regroup
occurrences by logical mark while preserving each panel's local mark order;
cross-panel draws commute because their placement bounds do not intersect.
When placements may overlap, only adjacent compatible occurrences may be
coalesced and all intervening paint order is preserved. A fixture such as
`A(panel 1), B, A(panel 2)` covers both cases. Repeated un-faceted data reuses a
packed range but follows the same ordering rule. Ordinary facets may use either
form; neither creates another retained mark.

Resource lifetime is ownership-driven rather than inferred from frame
participation. When the WebGPU adapter first retains a logical mark, it binds
handle cleanup to the owning `UnitView`/`Mark` disposal lifecycle; when a
backend first caches a placement source, it likewise binds resource cleanup to
that source's owner/disposal lifecycle. `View.disposeSubtree()` therefore
releases removed marks and placement resources, while filtering, clipping,
offscreen culling, and a frame with zero active occurrences do not. Surface
finalization destroys any remaining resources. Do not add a sweep whose only
liveness evidence is the normal or picking draw list.

The occurrence record is ephemeral and preserves the completed layout's order.
Logical `Mark` identity remains the WebGPU resource key when several
occurrences can share one compatible handle. Placement-source identity and
dense indices only select geometry; they are not a general persistent
occurrence identity model.

### Preserve visibility pruning independently of batching

Placement visibility is derived from geometry rather than stored as
SampleView-specific state. For every occurrence, the adapter maps its placement
rectangle through the owner viewport and intersects it with the effective
canvas bounds and cull clip. A rectangle with zero width or height, or one with
an empty intersection, is not visible. Partially intersecting and transitioning
rectangles remain visible.

An App sample placement snapshot always contains one rectangle per complete
sample member. Publication initializes all rectangles to zero and writes
nonzero geometry only for samples present in the current hierarchy. Filtering
therefore turns removed samples into zero-area placements without deleting
their indices or GPU-resident data. This applies equally when the first rendered
hierarchy is already filtered.

For a mark configured with a draw-level placement index, the frame assembler
drops an invisible occurrence before encoding its draw command. Range-mode
sample facets use this form initially, preserving Core's current offscreen
suppression and ensuring that the vertex cost of a data-heavy inactive facet is
zero. Filtered samples produce no range draw. Data series and GPU buffers remain
retained; filtering and other presentation changes update only the active draw
list and placement data.

For a mark configured with per-instance placement indices, one coalesced draw
remains preferable. Its vertex entry point validates the index and rejects a
zero-area or wholly offscreen rectangle before evaluating ordinary channel and
geometry work; placement clipping then prevents fragments and picks outside a
partially visible rectangle. This is the initial path for labels and metadata.
It still invokes a small vertex prefix for filtered and offscreen instances,
but their zero-area or nonintersecting placements prevent geometry and fragment
work. This avoids per-facet commands and resources. A compact visible-instance
indirection is a future profiling-driven optimization, not part of the public
placement API.

Thus one `PlacementSet` mechanism supports both existing WebGL execution
shapes. The mark/data characteristics and visibility cost determine draw-level
versus per-instance indexing; the renderer API contains no sample, peek, row,
or grid concepts.

Core owns the semantic visibility decision. The WebGPU adapter resolves each
occurrence against its owner viewport, effective clip, placement rectangle, and
paint-order constraints before low-level submission. The direct path passes
only active draw commands. An optional cached indirect path may instead pass a
stable generic range-command topology plus dense numeric active/count values
aligned with it, but those values are already resolved by Core. The renderer
must not inspect views, infer an interaction mode, interpret why a placement is
inactive, or implement a distinct closeup path.

### Profile cached indirect range submission without exposing Core semantics

After the direct range path is correct, Milestone 4 will compare it with an
optional renderer-private command cache for the high-active-count case. A
compatible ordered range sequence may be recorded in a render bundle with one
`drawIndirect` or `drawIndexedIndirect` command per topology occurrence. All
argument records for that sequence must occupy one packed `GPUBuffer`, selected
by byte offset; never allocate an indirect buffer per placement. Core-provided
inactive entries use a zero vertex, index, or instance count. Placement data,
range data, and indirect arguments remain dense arrays with no per-frame
semantic-key lookup.

This optimization amortizes JavaScript, validation, and native command-recording
cost; it is not multi-draw and does not reduce the backend draw-command count.
The renderer may select it using only generic facts such as compatible command
topology, active draw count, and measured cost. When only a small subset is
active, the CPU-pruned direct command list remains available so the renderer
does not execute a large bundle of empty indirect commands.

Bundle and indirect-argument resources are cached per compatible ordered draw
sequence and render-pass kind, not per placement. Normal and picking need
separate compatible bundles. Updating placement rectangles, ranges, or active
counts in existing buffers must not rebuild a bundle. A topology/order change,
pipeline change, render-pass compatibility change, or replacement of a bound
resource identity may rebuild it. Coarse spatial chunking is an experiment only
if one large bundle prevents profitable skipping; it must not introduce
renderer-visible sample, panel, or interaction concepts.

Do not assume that indirect `firstInstance` can carry the placement index. A
nonzero value requires WebGPU's optional `indirect-first-instance` feature. The
portable implementation must retain a recorded draw-level placement selection,
a series/range mapping available to the shader, or the direct-draw fallback.
The generic placement API must work without requesting that optional feature:
<https://www.w3.org/TR/webgpu/#indirect-first-instance>.

### Separate placement from scale state

Current positional scale domains are mark-wide and shared by all facets.
WebGPU positional outputs will use a viewport-local unit range. Every built-in
mark shader will resolve its placement index from the source datum, fetch the
placement rectangle, and map local positions through the owner viewport to the
canvas. Pixel-valued sizes, offsets, strokes, and text metrics are applied after
that transform.

The render pass can use the owner viewport and a common scissor for a coalesced
draw. Because WebGPU has no per-instance hardware viewport/scissor, every
vertex program resolves the selected placement rectangle. When directional
`clipToPlacement` is enabled it emits canvas-normalized clip bounds and axis
flags as flat inter-stage data, and a shared fragment helper discards fragments
outside the enabled bounds before mark-specific normal or picking shading. The
same transform and clip helpers must be used by point, rect, rule/tick, text,
link, and arrow programs. They expose canvas and placement dimensions because
link/arrow geometry, text range fitting and flushing, culling, and minimum pixel
sizes use different coordinate spaces.

Placement transforms and scale state must remain separate. Independent facet
domains are deferred and may require a separate scale-state resource or a
revised mark contract; this plan does not claim that the current renderer API
already supports them. Do not encode domains into the placement table or make
independent domains inherently require independent mark resources.

### Use one indexed placement contract

For `facetIndex`, Core will keep one packed mark series and translate the index
to the generic per-instance placement-index input. For
`sampleFacetRenderingOptions`, Core will initially select the same placement
set with a draw-level index while retaining each facet's data range. The
renderer API describes both as generic placement selection, not as a sample
facet. A later profiler-backed optimization may pack compatible visible ranges
with per-instance indices without changing that API.

A read-only storage buffer is the preferred renderer-private representation
because WGSL can index it directly. Before selecting it, run the most
resource-heavy text/selection/scale pipeline against WebGPU's default storage
binding limit without requesting an elevated limit. If one additional binding
does not fit, consolidate existing packed/extra buffers or use an internal
`rgba32float` texture. The public `PlacementSet` contract and Core adapter must
not expose that decision.

Text expands one source string into several glyph instances. During text layout
the renderer expands the hidden source placement-index series through the
existing `glyph.stringIndex` mapping into the packed glyph-level `u32` series.
This avoids another storage binding; the 2,000-facet test measures the resulting
allocation for representative long labels. Ranged/rotated text uses the
resolved placement rectangle instead of the current mark-wide `uViewport` for
flush, fit, and logo-size calculations. Links and arrows likewise use resolved
placement and canvas dimensions in their geometry helpers.

### Preserve picking identity

Identifier transforms assign IDs across a collector before its facet batches
are consumed. Packing must preserve those IDs. Normal and picking frames will
use the same ranges and placement data, allowing `InteractionController` to
resolve the result through the owning collector as it does today.

Repeated un-faceted data intentionally has the same ID in every occurrence. Do
not add a facet ID to the renderer pick value unless an interaction test proves
that the current Core contract is ambiguous.

### Comparable designs and provenance

Vega's scenegraph separates group placement from contained mark items, which
supports the conceptual split between a logical mark and its placements.
GenomeSpy will not adopt its scenegraph or copy code because Core intentionally
uses an ephemeral `LayoutResult`. Vega is BSD-3-Clause and GenomeSpy is MIT,
but no source adaptation is planned:
<https://github.com/vega/vega/tree/main/packages/vega-scenegraph>.

ggplot2's facet layout separates the panel identifier from x- and y-scale
identifiers (`PANEL`, `SCALE_X`, and `SCALE_Y`). Vega-Lite likewise keeps
facet/repeat composition and scale resolution above its renderer. These are
useful precedents for keeping 2D placement separate from future per-panel scale
state, while leaving grammar, grid construction, headers, and axes in Core. No
code is copied or adapted:
<https://ggplot2.tidyverse.org/reference/Facet.html>,
<https://vega.github.io/vega-lite/docs/facet.html>,
<https://vega.github.io/vega-lite/docs/repeat.html>.

The existing per-draw uniform path follows WebGPU's dynamic-offset binding
contract and remains appropriate for canvas-wide globals and ordered draw
splits. The indexed placement table complements it for coalesced placements:
<https://www.w3.org/TR/webgpu/#dom-gpubindingcommandsmixin-setbindgroup>.

Standard WebGPU currently exposes `drawIndirect` and `drawIndexedIndirect` for
one argument block per command, but no multi-draw count/stride operation. The
open GPUWeb request is not a dependency of this plan: indexed facets use one
ordinary draw and the initially visible subset of range facets uses direct draw
commands:
<https://www.w3.org/TR/webgpu/#rendering-operations>,
<https://github.com/gpuweb/gpuweb/issues/5175>.

WebGPU render bundles can cache repeated render commands while buffers bound by
those commands remain updateable. Brandon Jones's WebGPU guidance also records
an important Dawn/D3D12 implementation constraint: indirect arguments from one
buffer can be validated together, whereas one buffer per draw may trigger many
hidden validation dispatches. The Milestone 4 experiment therefore uses one
packed argument buffer and measures end-to-end frame/trace cost rather than
assuming render-pass timestamps include implementation-injected validation.
This is design guidance only; no source code is copied or adapted:
<https://toji.dev/webgpu-best-practices/render-bundles>,
<https://toji.dev/webgpu-best-practices/indirect-draws.html>.

## Alternatives considered

- **Retained mark per facet:** rejected. With 2,000 facets it would multiply
  pipelines, bind groups, buffers, and text resources and churn them during
  filtering and transitions.
- **Mirror WebGL's range uniform and texture resources:** rejected. Both inputs
  use one retained placement-set representation. Their draw-level versus
  per-instance index modes remain distinct because they have different
  visibility and batching costs.
- **Use only per-facet draws:** rejected for indexed sample facets. It would make
  command count scale to about 2,000 and discard the current one-draw advantage
  for labels and metadata.
- **Always pack range facets into one draw:** rejected for the initial path. In
  a frame where Core resolves only a small intersecting subset, it would process
  every datum in inactive sample ranges and lose the current CPU draw
  suppression. Reconsider only with a visible-range or source-index indirection
  justified by profiling.
- **Use a transform texture:** retained as a renderer-private fallback only if
  portable storage-binding limits require it. It must not split the public or
  Core integration contract.
- **Use indirect multi-draw:** rejected as both unavailable in standard WebGPU
  and unnecessary for packed, disjoint facets. Single indirect draws do not
  reduce the backend draw-command count.
- **Cache individual indirect draws in a render bundle:** retained as a
  profiling-gated range-submission optimization, not as the initial or only
  path. One packed argument buffer can make a stable high-count sequence cheap
  to resubmit, but executing many zero-count commands may lose to the direct
  Core-pruned list when few occurrences are active. The choice is generic
  renderer submission policy and does not expose SampleView or interaction
  modes.
- **CPU projection:** rejected because it would rebuild position arrays for
  scale-domain and layout changes.
- **Renderer facet objects or a retained scene graph:** rejected because either
  would duplicate Core concepts and ownership.

## Milestone 1: Renderer-neutral placement and WebGL migration

### Intended outcome

On a branch from `master`, Core gains renderer-neutral placement primitives and
SampleView publishes them through `LayoutResult`; SampleView no longer owns a
WebGL texture or exposes renderer-specific accessors. WebGL, Canvas2D, and SVG
consume the new contract with unchanged visible behavior. Merge this milestone
to `master` before integrating it into the `webgpu` branch. Do not enable or
repair dormant `FacetView` grammar in this milestone.

### Affected areas and downstream consumers

- App `LocationManager`, `SampleView`, generated label/metadata specs, and their
  layout tests
- Core `PlacementSource` topology/snapshot/lifecycle, `RenderingOptions`,
  `LayoutResult`, repeated-batch commands, and immediate occurrence helpers
- `View.getSampleFacetTexture()`, `View.getSampleFacetPosition()`,
  `Mark.getSampleFacetMode()`, sample-facet GLSL inputs, and `WebGLHelper`
- WebGL normal/picking batches plus Canvas2D and SVG sample-facet consumers

### Verification

- Unit-test stable placement-source identity, complete-membership index mapping,
  filtered/zero-height samples, reorder transitions, and layout snapshots. A
  hierarchy initially restored with a filter must still allocate entries for
  every `sampleData.ids` member and preserve their stable source indices.
- Filter, group, sort, undo, and redo the current hierarchy. Assert that they
  publish new presentation geometry and occurrence order without advancing the
  membership topology revision. Filtered entries are zero, restored entries
  reuse their previous indices, and the WebGL texture remains sized to the
  complete sample collection.
- Verify that peek and scrolling can publish geometry revisions after
  arrangement without changing topology, rebuilding WebGL batches, or causing
  normal/picking to mix placement revisions.
- Instrument a 2,000-sample geometry-only peek/scroll sequence and assert zero
  semantic-key, composite-key, or entity-map lookups after topology setup. The
  frame path performs only indexed numeric interpolation, rectangle writes,
  visibility tests, and backend upload/draw work.
- Run App SampleView and MetadataView suites plus Canvas2D/SVG sample-facet
  suites.
- Compare `examples/app/expression-zscores.json` under WebGL before and after,
  including labels, metadata, main cells, clipping, picking, filtering,
  reordering, and DPR 1 and 2.
- Verify sticky and non-sticky SummaryViews, summary overhang, group
  backgrounds/grid lines, labels/metadata, and per-sample vertical axes. Assert
  the current inherited-vs-self directional clip intersections at intermediate
  peek and scroll positions.
- Assert that range mode still supplies the same normalized uniform values and
  draw ranges; removal of `SAMPLE_FACET_UNIFORM` is not part of this milestone.
- Assert that App sample-layout modules neither import WebGL helpers nor retain
  `WebGLTexture` values, and that Core marks no longer identify SampleView from
  spec shape.
- Dispose a dynamic SampleView or a focused generic placement-source test owner
  and assert that every backend-owned resource derived from its placement
  sources is released. Also filter the hierarchy to zero active samples and
  assert that the same resources remain live until undo or actual owner
  disposal.

### Documentation and migration

Document the internal placement-source contract in Core rendering architecture.
No public App or Core spec migration is required; `facetIndex` remains valid.

Tentative commit: `refactor(rendering): separate facet placement from WebGL`.

## Milestone 2: Generic retained placement

### Intended outcome

The renderer exposes retained `PlacementSet` creation, replacement, binding,
and destruction. One retained mark handle can draw instances with different 2D
placement indices through a renderer-private indexed resource. Position scales
remain shared and normalized; normal and picking pipelines produce identical
placement. Ordered repeated draws remain valid for paint-order boundaries. Two
standalone Storybook scenes demonstrate the generic indexed and draw-level
placement contracts without a Core adapter.

### Affected areas and downstream consumers

- `packages/webgpu-renderer/src/index.d.ts`, `renderer.js`, shared WGSL globals,
  and renderer tests
- `packages/webgpu-renderer/examples/` and `stories/` placement scenes
- point, rect, rule, text, link, and arrow programs
- renderer README, migration plan, and API-direction note
- Core adapter positional ranges, text viewport state, and visible-range
  conversion

### Verification

- Unit- and GPU-test a 2-by-3 grid containing unequal rectangles, an empty
  panel, both draw-level and per-instance indices, ordered draw splitting,
  range selection, shader clipping, partial visibility, picking, placement-set
  replacement/destruction, and DPR 1 and 2.
- Type- and unit-test the fixed mark capability modes, required/forbidden draw
  indices, invalid handles, out-of-range indices, malformed rectangle arrays,
  stable handles across growth, and frame normalization shared by normal and
  picking passes.
- Exercise x-only, y-only, and xy `clipToPlacement` on antialiased points,
  rules, links, arrows, and glyph edges in visible and picking passes. Test
  ranged and rotated text, `flushX`/`flushY`, logo sizing, and unequal panel
  dimensions.
- Run the most resource-heavy text plus selection and scale configuration on a
  device requested without an elevated `maxStorageBuffersPerShaderStage`.
  Placement must not raise the portable binding requirement; consolidate
  bindings or select the private texture representation if necessary.
- Run the complete Core and docs WebGPU inventory discovered at execution time
  to catch regressions in offsets, text flushing, links, arrows, scales, and
  clipping. The investigation baseline was 102 Core and 110 docs specs; do not
  turn those counts into an allowlist.
- Add an **Indexed placements** Storybook scene that uses one retained mark and
  one coalesced draw to populate an unequal 2D rectangle grid through
  per-instance placement indices. Demonstrate a zero-area placement,
  directional clipping, and retained placement replacement through controls.
- Add a **Repeated range placements** Storybook scene that reuses one retained
  mark in ordered draw commands with different data ranges, draw-level
  placement indices, viewports, and clips. A control may change the generic
  active subset, but the scene must not model facets, samples, or interaction
  modes.
- Build Storybook with
  `npm -w @genome-spy/webgpu-renderer run build-storybook`. The stories must use
  renderer data and APIs directly and import no Core modules.

### Documentation and migration

Document viewport-local normalized positions and per-instance placement. Add
the two placement stories to the renderer's existing Storybook scene catalog.
No Core grammar migration is required.

Tentative commit: `feat(webgpu-renderer): add indexed placement transforms`.

### Implementation checkpoint (2026-08-23)

Milestones 1–2 are implemented together in foundation commit `ecf3b3b4e`. The concrete
contracts are slightly simpler than the proposal: `PlacementSource` publishes
immutable copied rectangles and complete topology, while `WebGLHelper` and the
WebGPU renderer own their derived resources. SampleView keeps its existing
range-mode uniform path for compatibility, but its indexed path now consumes
the same source. Canvas2D, SVG, and immediate mark projection read the CPU
snapshot directly; App sample-layout code no longer imports WebGL helpers or
retains `WebGLTexture` values.

The WebGPU API now has retained `PlacementSet` handles, fixed mark capability
modes, draw-level and per-instance indices, normalized placement transforms,
directional placement clipping, shared normal/picking bindings, and retained
replacement/destruction. The standalone Indexed placements and Repeated range
placements stories exercise the generic API. App sample-facet integration and
full App GPU/browser parity remain Milestones 4–5 and are intentionally not
implied by this checkpoint.

Completed verification includes focused Core/App tests, the complete WebGPU
renderer unit suite, targeted lint and TypeScript checks, and a successful
renderer Storybook build. DPR screenshot comparison and complete inventory
checks continue at later integration gates.

## Milestone 3: Packed repeated and facet-range occurrences

Status: Implemented and verified on 2026-08-24.

Reconciliation: the adapter now finishes collection before submission, packs
complete collector topology once per logical mark, and preserves the original
global occurrence order. Repeated ordinary marks use one stable adapter-owned
placement source normalized against the canvas; this also gives zero-thickness
axis views a valid one-pixel placement without invalid WebGPU viewports.
Renderer-neutral placement sources remain independently owned and their dense
indices select cached facet ranges without replay-time semantic lookups.
Normal and picking collection share the same surface-owned placement resources,
and mark/view disposal—not draw-list participation—controls retained lifetime.

The proposed disjoint regrouping optimization was unnecessary for correctness
and is deferred: preserving all encounter order is simpler and satisfies both
disjoint and overlapping paint semantics. Indexed `facetIndex` coalescing,
sample visibility pruning, high-cardinality evidence, and App recovery remain
Milestone 4.

Verification completed with 153 renderer unit tests, 70 focused Core/App
tests, both package TypeScript checks, and 50 real-GPU renderer tests. The two
named repeated-axis examples pass WebGPU/WebGL comparison. Recursive discovery
found 212 Core/docs examples: 210 passed in the full run, the remote FASTA
fixture passed on an immediate isolated rerun after a transient request abort,
and the only deterministic failure was a backend-neutral zero-height docs
playground. Giving that playground an explicit height made it pass under both
renderers, so all 212 discovered examples have passing evidence.

### Intended outcome

Core collects repeated occurrences and packs facet batches once per logical
mark. Coalescible batches receive placement indices; observable paint-order
boundaries produce ordered range draws without repeated retained resources.
The two failing docs examples render under WebGPU.

### Affected areas and downstream consumers

- `WebGpuViewRenderingContext`, `WebGpuRenderCoordinator`, and `WebGpuSurface`
- `webGpuMarkAdapter` data packing, caching, and normalized positions
- `markData` occurrence descriptors and stable facet identity
- `LayoutResult` only if a completion hook is cleaner than an explicit frame
  assembler `finish()` call

### Verification

- Unit-test repeated un-faceted data, facet-specific data, empty facets,
  changing facet sets, conditional-series packing, collector data revisions,
  unique IDs, paint order, scissors, retained updates, and explicit
  mark/placement owner disposal.
- Build a renderer-neutral Core occurrence plan whose placement topology
  contains more collector facets than its active occurrence list. Assert that
  packing follows the complete topology in stable index order, inactive
  members receive stable or empty ranges, and later activating an occurrence
  does not replace channel series, recompute range offsets, or remap placement
  indices. The actual initially filtered SampleView case is exercised in
  Milestone 4.
- Assert that replaying an unchanged resolved occurrence plan performs zero
  collector facet-map and semantic/composite-key lookups. A collector revision
  or topology revision rebuilds the resolution once, after which repeated
  normal/picking frames return to zero lookups.
- Test `A(panel 1), B, A(panel 2)` ordering with a disjoint placement snapshot
  and with overlapping placements. Only the disjoint batch may regroup the two
  A occurrences across B.
- Compare WebGPU and WebGL for:
  - `examples/docs/grammar/mark/link/link-shapes-and-orientations.json`
  - `examples/docs/grammar/composition/concat/shared-axes.json`
  - a focused Core integration fixture that emits one logical mark into a 2D
    row/column placement topology with shared x/y domains, sparse and unequal
    panel data, an empty panel, unequal panel rectangles, and axes or labels
    outside the mark panels; this is a renderer-contract fixture, not enabled
    facet grammar
- For the link example, inspect the resolved occurrence plan and rendered
  output. `GridView` arranges each shared `AxisView` repeatedly at eligible grid
  edges; every child axis mark must retain one logical renderer handle while
  drawing all ordered occurrences with their own viewport and clip. No
  occurrence may overwrite or deduplicate another merely because the Core mark
  identity is the same.
- Verify that visible and picking frames use identical ranges and order.
- Submit a frame with zero active occurrences for a still-owned repeated mark,
  then submit it again. Its retained handle and packed series must survive; only
  disposing the owning view/mark or changing an incompatible definition may
  destroy or replace them.

### Documentation and migration

Update the Core/renderer integration notes. No user-facing facet grammar is
enabled or documented by this milestone.

Tentative commit: `feat(core): render WebGPU facet ranges`.

## Milestone 4: Unified sample-facet packing

### Intended outcome

Both `facetIndex` and `sampleFacetRenderingOptions` feed the same indexed
placement contract. Each sample-faceted logical mark uses one retained mark.
Labels and metadata retain a coalesced draw; range-mode main plots submit only
Core-resolved active facet ranges. Both paths remain viable with about 2,000
samples. The milestone also records whether a generic cached indirect sequence
materially improves the high-active-count case; it does not introduce a
renderer-visible sample interaction mode.

### Affected areas and downstream consumers

- renderer placement-table ownership and update API
- optional renderer-private ordered-command and packed indirect-argument cache
- the standard placement-index input in built-in mark shaders
- Core range-batch packing, `facetIndex` translation, and App sample-coordinate
  updates
- text source-to-glyph index propagation

### Verification

- Test missing positions, zero-height filtered samples, initial filtered state,
  filter/undo/redo, reorder and transition updates, partial clipping, and text
  glyph placement. Range-mode marks submit no draws for filtered samples;
  indexed labels and metadata retain the coalesced full-membership draw and
  reject zero-area placements in the shader. No presentation-only operation may
  replace mark series, placement mappings, pipelines, or bind groups.
- After first rendering a non-empty hierarchy, filter every sample, render the
  zero-occurrence state, and undo the filter. Existing placement resources,
  retained mark handles, complete packed ranges, and dense indices must remain
  identical across the transition; only geometry and the active occurrence list
  change. A view that starts with zero occurrences may create a mark lazily on
  its first later occurrence; do not add eager GPU mark creation merely for
  this edge case.
- Add a deterministic, repository-owned 2,000-sample App harness fixture with
  labels, metadata rectangles, and a representative range-mode multi-datum
  mark. It may generate its data at test time instead of adding a large
  user-facing example. Assert one retained renderer mark per logical mark, one
  draw for coalescible indexed labels/metadata, and no range draw for a
  placement outside the effective viewport/clip. Layout-only changes must not
  replace ordinary channel series.
- Drive the actual App SampleView into closeup/peek with the 2,000-sample
  fixture and a small visible window. Assert that range draw count equals the
  visible, non-empty facet count rather than total facet count. Verify the same
  suppression in normal and picking passes, including a partially visible
  first and last facet.
- Benchmark the generic range-submission paths with the same 2,000-occurrence
  topology in two Core-produced frame plans: one with nearly every occurrence
  active and one with only a small intersecting subset. Compare the CPU-pruned
  direct list with a render bundle containing individual indirect draws backed
  by one packed argument buffer. Measure JavaScript/command-encoding time and
  end-to-end frame or browser trace time; do not rely only on render-pass
  timestamp queries. Record the decision and retain the direct path unless the
  cached path provides a repeatable material win in its target regime.
- If the cached path is retained, assert that geometry-only and active-count
  updates do not rebuild its bundles, inactive Core-resolved entries have zero
  work counts, and normal and picking use separate compatible caches with the
  same active set. Assert one packed indirect buffer per compatible ordered
  sequence, no per-placement indirect buffer, and correct operation without
  the optional `indirect-first-instance` feature. Changes in topology, paint
  order, pipeline, pass compatibility, or bound resource identity must
  invalidate the affected cache explicitly.
- Assert one placement resource per source, no per-facet pipeline/bind group,
  text atlas, buffer, or mark configuration, and one draw for coalescible
  labels/metadata. Record packed-series and expanded glyph placement-index byte
  counts for representative long labels. The logical rectangle payload is
  exactly 16 bytes per placement; the placement index adds at most one `u32`
  per logical instance, or per expanded glyph for text, before ordinary buffer
  alignment/capacity. Fail on any additional per-facet multiplication.

### Documentation and migration

Document the generic per-instance placement-index contract in the renderer
README. No App spec migration is required.

Tentative commit: `feat(core): pack WebGPU sample facets`.

### Implementation checkpoint (2026-08-24)

Status: Implemented and verified on 2026-08-24.

Reconciliation: `facetIndex` is translated to the renderer's per-instance
placement-index series while range-mode sample occurrences retain draw-level
indices. Indexed marks resolve the stable placement source from their layout
owner and submit one logical draw; range occurrences are rejected from normal
and picking frames when their dense rectangle is empty or outside the effective
viewport and clip. Text keeps its public series and draw ranges in logical
string units, expands placement indices to glyphs internally, and translates
logical draw ranges to private glyph ranges. Placement-only frames reuse the
cached index series and ordinary channel series.

The repository-owned high-cardinality evidence is split by responsibility. An
App `LocationManager` fixture publishes the complete 2,000-sample topology,
exercises filtering, undo, and actual closeup/peek geometry, and records the
exact 32,000-byte rectangle payload. An actual `SampleView` fixture generates
two data per sample, enters closeup around the middle sample, and sends fewer
than 30 visible range draws with the identical placement-index subset in normal
and picking contexts. Core separately verifies partially visible first and last
placements plus the one-draw indexed path. The adapter's logical placement
index is 8,000 bytes, and the retained text program test records exactly one
expanded `u32` index per glyph for 2,000 representative long labels. The real
App expression fixture renders complete sample and gene labels under WebGPU;
the recursive App browser gate remains Milestone 5.

The cached bundled-indirect experiment is discarded. Two 20-frame median runs
used a 2,000-command packed indirect buffer in software WebGPU. With 1,900
active occurrences, direct submission encoded in 0.0–0.1 ms and completed in
22.0 ms, while the cached bundle completed in 22.2–23.2 ms. With 20 active
occurrences, the CPU-pruned direct list completed in 2.5 ms and the 2,000-entry
bundle in 2.6 ms. The bundle produced no repeatable end-to-end win in its target
regime and necessarily retained all backend draw commands, so the simpler
portable direct path remains the only implementation. No indirect cache,
invalidation path, optional feature, or second submission strategy was added.

## Milestone 5: App sample facets, picking, and browser coverage

### Intended outcome

Range-mode sample plots and facet-indexed sidebar marks work together;
tooltips and selections resolve the correct data; the App regression is
repeatable without manual browser inspection. Every JSON specification under
`examples/app/` participates in an automated WebGPU/WebGL parity sweep.

### Affected areas and downstream consumers

- WebGPU handling of the generic repeated-placement occurrence scope
- App sample labels, metadata, main plots, summaries, transitions, and clips
- Core WebGPU picking frame assembly
- an App-aware WebGPU/WebGL comparison harness with deterministic App/sample
  readiness and recursive `examples/app/` discovery

### Verification

- Recursively discover every `*.json` specification under `examples/app/` at
  execution time; do not maintain an allowlist. The current inventory is
  `copy-numbers.json`, `expression-zscores.json`, `metadata-data-source.json`,
  `metadata-hierarchy.json`, `samples-identity.json`, and `samples.json`.
- Run every discovered App specification under WebGPU and WebGL with identical
  dimensions, DPR, data availability, and deterministic readiness. Fail on
  console/page errors, failed requests, WebGPU validation errors, missing or
  empty canvases, and material screenshot differences outside a documented
  cross-backend tolerance. Save a per-example comparison report; do not
  silently skip or approve renderer-specific discrepancies.
- Treat this inventory sweep as breadth coverage, not evidence for
  closeup/peek performance: the current checked-in App examples have too few
  samples to exercise that path. Run the repository-owned 2,000-sample App
  fixture under both renderers for the high-cardinality acceptance assertions.
- When the ignored private MCCA checkout is available, compare
  `private/MCCA-visualization/web/specs/spec.json` under WebGPU and WebGL. Its
  current sample table contains 590 rows, enough to exercise realistic
  overview-to-closeup transitions. Record initial overview, closeup/peek,
  scrolling, filtering/reordering, metadata/labels, summaries, and picking in
  the final comparison report. Do not copy private specifications or data into
  the repository; this developer validation supplements rather than replaces
  the reproducible 2,000-sample fixture.
- Exercise `examples/app/expression-zscores.json` more deeply under both
  renderers, including labels, cells, aggregate summary, axes,
  filtering/reordering, picking, and DPR 1 and 2.
- Test tooltip and selection hits in the focused repeated-placement fixture and
  in sample facets, plus overlapping paint order, repeated un-faceted data, and
  empty ranges.
- Reuse the failure categories and report shape from `runWebGpuExamples.mjs`
  so the App inventory is not a separate, weaker smoke gate.
- Run the complete Core/docs inventory, complete App WebGPU/WebGL parity sweep,
  WebGPU renderer unit/GPU tests, Core focused tests, workspace TypeScript
  checks, the renderer Storybook build, and lint.

### Documentation and migration

Document the App WebGPU/WebGL parity command. No public grammar changes are
expected.

Tentative commit: `test(app): cover WebGPU App example parity`.

### Implementation checkpoint (2026-08-24)

Status: Implemented and verified on 2026-08-24.

The App now has a deterministic screenshot harness and the Core runner supports
an App scope with recursive discovery, identical WebGPU/WebGL dimensions and
DPR, lazy-data readiness, enforced pixel thresholds, per-example reports, and
an opt-in same-datum picking comparison. The final six-spec inventory passed
under both renderers. Its worst mean RGB error was 0.00354 and its worst changed
pixel ratio was 0.00999, below the documented 0.06 and 0.15 limits. The known
small backend-specific font offset is accepted by that tolerance and was not
changed in this milestone.

The App sweep exposed three placement errors rather than cosmetic font drift.
Core now supplies placement-enabled mark channels and visible-range anchors in
owner-local coordinates while retaining absolute draw viewports. Ranged text
maps its anchors and extents through placement before applying pixel offsets,
and placement visibility compares against an offset owner viewport. These fixes
remove the doubled App viewport translation, restore the private MCCA metadata
columns, and cull/squeeze overview labels without changing fine font alignment.

The expression fixture passed WebGPU/WebGL screenshot and same-datum picking
checks at DPR 1 and 2. A focused action probe produced the same stable topology
under both renderers and DPRs while filtering `S1`–`S5` to `S1`, `S3`, `S5`,
sorting to `S5`–`S1`, and undoing both operations. The available private MCCA
checkout passed its overview screenshot comparison with 0.03223 mean RGB error
and 0.11140 changed pixels. Its 590-sample closeup/peek and scroll probe kept
topology revision 1, filtered to 272 and restored to 590, reordered samples,
and resolved the identical `MCCA0315` chromosome-4 datum and visible tooltip
under WebGPU and WebGL. No private data was added to the repository.

Final verification passed the complete 212-example Core/docs WebGPU inventory,
the recursive six-example App WebGPU/WebGL inventory, 602 focused Core/App/
renderer unit tests, all 50 renderer GPU tests, all workspace TypeScript checks,
the renderer production Storybook build, lint, and diff checks. Milestone 4's
repository-owned 2,000-sample fixture remains the reproducible high-cardinality
gate; the private MCCA check remains supplemental.

Follow-up private-spec validation covered
`private/genomespy-paper-2024-spec/spec.json`. Its sparse quantitative metadata
and LOH channels contain legitimate missing values. The WebGPU adapter now
preserves those series entries as `NaN`, matching the WebGL buffer contract,
while still rejecting positive and negative infinity. The spec passes under
both renderers with 0.02061 mean RGB error and a 0.06860 changed-pixel ratio.

A close-zoom follow-up on the same spec exposed fractional `_midpoint` values
from `filterScoredLabels`. Index and locus channel inputs are discrete: Core
now floors them before CPU scaling and WebGPU integer packing, matching WebGL's
existing typed-array conversion. Float64 series remain only a transport for
large integers. The deep RefSeq zoom renders its label and strand arrow without
console errors; the complete 212-example Core/docs WebGPU inventory and the
six-example App WebGPU/WebGL inventory remain green. The private overview still
passes with 0.02060 mean RGB error and a 0.06860 changed-pixel ratio. Smooth
sub-index label nudging remains unsupported; an offset-channel design, if
needed, is separate follow-up work.

## Post-integration review work

The final independent review found the following additional work. Each item is
implemented and committed independently so correctness, portability, API
boundaries, and simplification remain separately reviewable.

- [x] Pack arbitrarily large facet batches without spreading a complete batch
  into function arguments. Add a regression test above the JavaScript engine's
  practical argument limit.
  Tentative commit: `fix(core): pack large WebGPU facet batches safely`.
- [x] Invalidate normalized visible and picking frames whenever a retained
  placement set is replaced. Cover picking after both buffer growth and logical
  count shrinkage.
  Tentative commit: `fix(webgpu-renderer): invalidate replaced placements`.
- [x] Remove the elevated `maxStorageBuffersPerShaderStage` request and verify
  the most resource-heavy placement-enabled pipelines against the WebGPU
  default limit. Consolidate renderer-private bindings if required without
  changing the public placement contract.
  Tentative commit: `fix(webgpu-renderer): honor default storage limits`.
- [x] Reuse a clean WebGPU picking frame instead of replaying the complete Core
  command graph and resubmitting the GPU pass for every pointer move. Match the
  WebGL coordinator's dirty-frame semantics and invalidate on visible renders.
  Tentative commit: `fix(core): reuse clean WebGPU picking frames`.
- [x] Remove placement-source discovery through layout ancestors. Completed
  layout occurrences must carry placement explicitly; indexed marks that are
  arranged once for the whole placement set need an explicit owner-provided
  placement binding rather than renderer-side view discovery.
  Tentative commit: `refactor(core): make placement ownership explicit`.
- [x] Make published placement topology independent of caller-owned mutable
  facet-ID arrays. Copy and freeze each tuple and cover mutation resistance.
  Tentative commit: `fix(core): publish immutable placement topology`.
- [x] Replace exact mark-shader source rewriting with a small explicit placement
  hook shared by all supported mark vertex and fragment shaders. Generated
  placement shaders must fail loudly when the hook is missing and retain
  mark-specific geometry such as rule stroke width.
  Tentative commit: `refactor(webgpu-renderer): make placement shader hooks explicit`.
- [x] Preserve explicit placement ownership when buffered WebGL converts
  occurrences into mark-level preparation batches. Cover both visible and
  picking renders in the MCCA sample-facet visualization.
  Follow-up commit: `fix(core): forward placement to WebGL mark preparation`.

## Review gates

Every milestone ends with the reconciliation checklist above. Independent
review is concentrated at these risk boundaries:

1. **After Milestone 1:** review complete-topology production, atomic geometry
   publication, explicit disposal, hot-path lookup counts, and WebGL/Canvas2D/
   SVG parity before removing legacy view accessors or merging to `master`.
   Keep the WebGL uniform range path unless a later, separately verified
   simplification replaces it.
2. **After Milestone 2:** review the generic renderer API, portable binding and
   inter-stage limits, placement clipping/transforms in every built-in shader,
   retained replacement/destruction, and Storybook evidence before Core begins
   depending on the API in Milestone 3.
3. **After Milestone 3:** reconcile occurrence packing, repeated shared-axis
   behavior, paint order, complete-topology versus active-occurrence semantics,
   and ownership-driven resource lifetime. A separate independent review is
   required only if this milestone changes the approved Core/renderer contract;
   otherwise the implementer records the checkpoint and proceeds.
4. **After Milestone 4:** independently review the actual SampleView integration,
   zero-occurrence/filter recovery, 2,000-facet storage and draw counts, text,
   clipping/culling, normal/picking equivalence, and evidence for retaining or
   discarding cached indirect submission.
5. **After Milestone 5:** perform final cross-backend integration review using
   the complete inventories and named App interactions before reconciling and
   retiring the plan.

## Risks and unresolved details

- Conditional and ordinal positional ranges must normalize every branch
  consistently before placement.
- Partially visible sample viewports may cross canvas bounds. Placement and
  scissor handling must clip without distorting local geometry.
- Placement-table representation is renderer-private. Milestone 2 must select
  storage, consolidated storage, or texture only after the worst-case pipeline
  passes the default binding-limit gate.
- Shader clipping must match WebGL scissoring at facet edges for antialiased
  lines, links, text glyphs, and picking without excessive fragment cost.
- A coalesced per-instance draw can cheaply reject offscreen labels and
  metadata, but cannot avoid its vertex-prefix cost. Keep data-heavy range mode
  CPU-pruned until measurements justify a compact visible-instance indirection.
- Render bundles reduce CPU submission work but still execute one backend draw
  command per recorded indirect call. A bundle covering mostly inactive ranges
  may lose to the direct active-command list; retain both only if measurements
  justify the added cache and invalidation logic.
- Some WebGPU implementations inject indirect-argument validation outside the
  native render pass, so pass timestamp queries alone may hide material cost.
  Keep all arguments for a compatible sequence in one packed buffer and include
  end-to-end frame or browser trace measurements.
- Nonzero indirect `firstInstance` is optional in WebGPU. Placement indexing
  must have a portable path that neither requests `indirect-first-instance` nor
  creates per-placement bindings or resources.
- Render bundles are compatible with specific attachment formats, sample
  counts, pipelines, and bound resource identities. Normal/picking separation
  and cache invalidation must be explicit, and a buffer capacity increase must
  not leave a bundle referring to a replaced allocation.
- Flat placement bounds consume inter-stage components in every clipped mark;
  verify portable inter-stage limits and avoid mark-specific duplicate varyings.
- The initial coexistence of closure-backed ordinary rectangles and flat
  repeated placement tables must have one explicitly captured presentation
  revision per frame. Do not let summaries, groups, samples, and clips observe
  different points in a peek transition.
- The App lacks the Core screenshot harness's readiness signal. Add a real
  App/sample readiness hook instead of relying on a timeout.
- The realistic MCCA validation case lives under the Git-ignored `private/`
  tree and is unavailable to CI and most contributors. Keep it as recorded
  developer validation only; permanent acceptance must remain reproducible
  from the repository-owned high-cardinality fixture.
- Future per-facet domains require a separate scale-state design and may revise
  the mark contract. Placement must not encode domains or assume that a
  mark-wide domain is immutable forever.
- Complete topology cannot be reconstructed from active `LayoutResult`
  occurrences: a filtered initial hierarchy may contain none. The placement
  source must publish its aligned full `facetIds` enumeration independently,
  and geometry publication must reject a count or topology-revision mismatch.
- A topology-frozen `LayoutResult` and live placement source must not allow
  presentation updates to change complete-membership count or index mapping.
  Filtering, grouping, sorting, undo, and redo require a new layout result and
  occurrence plan but retain the membership topology, packed series, and range
  offsets; their placement snapshot writes zero rectangles for absent samples.
  Peek/scroll may replace rectangles without arrangement. Only an actual
  `sampleData.ids` membership change may publish a new sample topology.
- Draw-list absence cannot distinguish filtered/offscreen content from disposed
  content. Retained mark and placement resources must follow explicit Core
  ownership/disposal and surface finalization, not normal/picking occurrence
  sweeps.
- Replacing the WebGL uniform transform with ordinary occurrence coordinates
  changes `uViewportSize`, visible-range culling, and pixel-unit calculations.
  Keep the uniform path until mark-by-mark parity demonstrates equivalence.

## Acceptance criteria

- `examples/docs/grammar/mark/link/link-shapes-and-orientations.json` renders
  non-empty, WebGL-compatible output with `renderer=webgpu`, including all link
  panels and shared x/y axes. The marks inside each shared `AxisView` are
  retained once per logical Core mark and rendered at every `GridView`-owned
  repeated occurrence with the correct viewport, clip, and paint order; no
  repeated occurrence is overwritten or deduplicated by mark identity.
- Every JSON specification discovered recursively under `examples/app/`
  renders successfully with both WebGPU and WebGL. The App harness uses no
  example allowlist, reports no console/page/request/validation or empty-canvas
  failures, and finds no material screenshot difference outside its documented
  cross-backend tolerance. Adding an App example automatically adds it to this
  acceptance gate.
- When `private/MCCA-visualization/web/specs/spec.json` is available in the
  validation environment, the final report includes its WebGPU/WebGL overview,
  closeup/peek, scrolling, filtering/reordering, metadata, summary, and picking
  comparison. A material discrepancy blocks completion in that environment;
  absence of the ignored private checkout does not replace or weaken the
  repository-owned 2,000-sample App fixture.
- One retained renderer mark is used per logical Core mark regardless of facet
  count.
- Semantic sample/facet keys map deterministically to the topology revision's
  dense placement indices. Neither the dense index nor the ephemeral command
  position is exposed as a general persistent layout identity.
- A placement topology independently enumerates all aligned collector facet IDs
  even when the active layout has no occurrences. Its rectangle count always
  matches that topology, and topology-plus-geometry replacement is atomic.
- App sample topology and packed collector ranges cover the complete
  `sampleData.ids` membership even when the initial hierarchy is filtered.
  Filtering, grouping, sorting, undo, and redo preserve placement indices,
  range offsets, channel series, pipelines, and bind groups. Filtered samples
  have zero-area placement entries; they produce no range-mode draws and are
  rejected from coalesced indexed geometry by the placement shader.
- `PlacementSet` creation, replacement, binding, clipping, and destruction
  follow the typed contract; coordinate mapping is top-left, owner-viewport
  relative, normalized, and identical in visible and picking frames.
- Renderer Storybook includes standalone **Indexed placements** and **Repeated
  range placements** scenes. Together they demonstrate a retained mark reused
  across unequal 2D placements, both placement-index modes, range selection,
  clipping, and retained geometry updates without importing Core. The
  production Storybook build succeeds.
- App sample-layout code owns only CPU placement data. WebGL textures and
  WebGPU placement resources are created, updated, and destroyed by their
  respective backends; no mark discovers SampleView through ancestor spec
  inspection.
- Both range-mode and `facetIndex` sample facets use the same indexed placement
  contract and one retained mark per logical mark. Coalescible indexed marks
  use one draw; range-mode draws are bounded by visible, non-empty placements,
  not total placement count, when the repository-owned 2,000-sample App fixture
  is driven through actual SampleView closeup/peek behavior. Normal and picking
  use the same active subset throughout the transition.
- Core alone resolves occurrence visibility from layout, placement, and clips.
  The renderer receives only generic active commands or dense active/count
  values and has no SampleView, peek, closeup, row, column, or grid mode.
- The 2,000-occurrence benchmark records whether cached bundled indirect
  submission is retained. If retained, it uses one packed argument buffer per
  compatible ordered sequence, works without `indirect-first-instance`, keeps
  normal and picking active sets identical, and does not rebuild bundles for
  geometry-only or active-count updates.
- Batches that may overlap preserve original order and coalesce only adjacent
  compatible occurrences; they never create per-facet retained marks.
- Layout-only and peek/scroll geometry updates do not replace stable mark
  series, topology mappings, or scale domains. They may publish a new placement
  geometry revision without rerunning arrangement.
- A still-owned logical mark and placement source survive frames with zero
  active or visible occurrences. Dynamic subtree disposal releases their
  backend resources without waiting for surface finalization.
- Geometry-only frames perform no per-facet hash-map, `InternMap`, entity-map,
  composite-key construction, or serialized-key lookup. Semantic key resolution
  is paid only when facet topology changes; steady-state work uses dense integer
  indices and typed arrays.
- A focused Core 2D repeated-placement fixture passes with shared domains,
  sparse data, unequal and empty panels, exterior axes/labels, and one retained
  logical mark. Passing this fixture does not claim that dormant `FacetView`
  grammar is enabled.
- The resource-heavy placement pipeline runs without elevating the adapter's
  default storage-binding limit, regardless of its private buffer/texture
  representation.
- Empty, filtered, reordered, transitioning, clipped, and partially visible
  facets behave correctly at DPR 1 and 2.
- Samples, sticky/non-sticky summaries, group backgrounds, metadata/labels, and
  repeated axes share one presentation revision and preserve WebGL's
  directional inherited/self clipping semantics.
- Visible and picking passes use the same ranges and placement; tooltips and
  selections resolve the expected data.
- Existing non-faceted WebGPU inventory remains green, WebGL is unchanged, and
  the complete `examples/app/` inventory has a repeatable WebGPU/WebGL browser
  parity check.

Before merge, reconcile every milestone as completed or discarded, commit that
record, and delete this temporary plan with the other integration plans in a
later commit.

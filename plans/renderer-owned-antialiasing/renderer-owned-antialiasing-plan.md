# Renderer-owned antialiasing and semantic render scopes

Status: Independently reviewed; review blockers reconciled; ready to implement

Issues: #478, #483

## Context

The selective-MSAA implementation currently leaks a WebGPU rasterization
decision into Core. `needsCoverageAntialiasing()` identifies undecorated Core
rectangle marks, `WebGpuViewRenderingContext` propagates that classification
through view scopes, and Core supplies explicit `sampleCount` values to
`webgpu-renderer` render groups. The renderer nevertheless owns the rectangle
shader whose actual behavior determines whether shader edge coverage exists.

Plain rectangles deliberately bypass the rectangle SDF path so adjacent cells
share exact primitive edges without translucent heatmap seams. Such rectangles
benefit from multisampled primitive coverage. Rounded, stroked, shadowed, or
hatched rectangles use the shader's distance-field path and do not need MSAA.
Core should not duplicate that renderer-specific distinction.

Rectangle edge properties may be series-backed, conditional, or updateable
uniforms. Allowing their live values to switch a mark between SDF and MSAA
would make render-layer topology dynamic and require invalidation across Core
layout, retained programs, pipelines, and transient targets. Instead, one
renderer-owned function will select an immutable antialiasing mode for the
lifetime of a mark program:

- a rectangle uses MSAA only when every edge-relevant channel is provably
  static and its values describe a plain rectangle;
- every other rectangle uses shader edge coverage, including temporarily plain
  instances of a mark with dynamic edge properties.

Core already has the semantic information required for sensible layerization:
ordered view scopes, opacity, bounds, clipping, and explicit repeated-sample
batches. The renderer already has the information required for rasterization:
the normalized channels and compiled mark program. The revised contract will
preserve both without making either subsystem understand the other's grammar.

The WebGPU specification requires a render pipeline's multisample count to
match its render attachments. Consequently, sample-count selection belongs in
the renderer's pass planner rather than in a visualization adapter. MapLibre's
program-configuration architecture provides a comparable precedent for
classifying properties as constant, uniform, or data-driven before generating
a shader program. No external code will be copied or adapted.

References:

- https://gpuweb.github.io/types/interfaces/GPUMultisampleState.html
- https://github.com/maplibre/maplibre-gl-js/blob/main/ARCHITECTURE.md

The seven central production files currently contain 7,196 lines:
`renderingIntent.js`, `webGpuViewRenderingContext.js`,
`webGpuMarkAdapter.js`, `renderGroups.js`, `renderer.js`, `rectProgram.js`, and
`baseProgram.js`. The change should delete Core's 38-line rendering-intent
module and its coverage classification instead of adding a second planner
alongside the existing renderer normalizer.

## Goals

- Make `webgpu-renderer` the sole owner of the decision between shader edge AA
  and multisampled primitive coverage.
- Keep the decision immutable for a retained mark program and independent of
  live property values.
- Let Core submit semantic view scopes without specifying attachment sample
  counts.
- Support flat draw lists and hierarchical render scopes through one renderer
  normalization path.
- Use the hierarchy to form maximal, correctly bounded MSAA layers without
  changing painter's order.
- Preserve dynamic opacity pruning and flattening entirely in the renderer.
- Preserve the existing MCCA and paper-example layerization and performance.
- Reduce or contain production code by deleting duplicate classification and
  avoiding parallel flat/tree implementations.

## Non-goals

- No grammar property for choosing MSAA or SDF.
- No Core knowledge of WGSL, SDFs, sample counts, or renderer program classes.
- No per-frame switching of a retained mark between shader AA and MSAA.
- No runtime scanning of series buffers to prove that dynamic properties happen
  to be plain in the current frame.
- No reordering of ordinary sibling draws or scopes.
- No changes to picking MSAA; picking remains flat and single-sampled.
- No changes or new capabilities in the legacy WebGL renderer.
- No retained scene graph or generalized render graph.

## Key decisions

### Semantic scopes are not physical layers

Replace the Core-facing `RenderGroup.sampleCount` contract with a sample-count-
free render scope:

```ts
type RenderScope = {
    items: Iterable<RenderItem>;
    bounds: DrawRect;
    opacity?: number;
};
```

A scope states where aggregation and opacity are semantically valid. It does
not request an offscreen target. Core will emit scopes from its existing view
hierarchy and coalesce repeated instances only inside an explicit sample-facet
batch. Picking continues to submit its original flat paint order.

The renderer will treat a flat list as root-level render items and feed it to
the same normalizer. Without semantic child scopes, it may combine only
consecutive compatible draws; correctness is preserved but layerization may be
less efficient. Core will use scopes for all visible WebGPU rendering because
it owns the required hierarchy.

Most scopes disappear during normalization. Empty and zero-opacity scopes are
removed, opaque scopes are flattened when attachment compatibility permits,
and only fractional-opacity or inferred-MSAA boundaries become physical
layers.

### One rectangle function owns the AA decision

Add one function beside `RectProgram` that consumes normalized renderer channel
configs and returns an immutable mode:

```ts
type EdgeAntialiasing = "shader" | "multisample";
```

The function is authoritative for shader generation, vertex support, and
renderer layerization. The generic renderer reads only the resolved program
mode; it does not inspect rectangle channels or switch on mark types.

The relevant channel set initially matches the rectangle shader's edge and
decoration paths:

- `strokeWidth`;
- the four resolved corner-radius channels;
- `shadowOpacity`;
- `hatchPattern`.

A relevant channel is provably static only from its normalized renderer channel
representation: it must be a value channel emitted as a WGSL constant, have no
conditions or scale, expose no retained getter or update slot, and not be
uniform-backed. Core's `encoder.constant` flag alone is insufficient because
expression-backed value definitions are also constant with respect to data.
Series-backed, conditional, scaled, expression-backed, or uniform-backed
relevant channels select shader AA. Static values select MSAA only when stroke
width, corner radii, shadow opacity, and hatch are all zero.

The shader variant selected for `"shader"` always computes rectangle edge
coverage, even when current values are plain. Its vertex shader must also
expand the quad by at least one physical pixel of SDF support when current
decoration values are zero; invoking the SDF fragment path without geometry
outside the nominal primitive cannot antialias its outer edge. The
`"multisample"` variant may retain the exact-fill fast path and exact primitive
bounds because its edges receive sample coverage. Thus dynamic values never
change layer topology and never leave a plain rectangle without shader or
sample coverage.

### Core reports mutability, not AA policy

Core must accurately describe whether renderer channel values can change
without recreating a program. This is ordinary adapter configuration, not an AA
decision.

Today the adapter emits every constant encoder and rectangle property through
`liveValue(..., dynamic: true)`, even when backed by a literal. For the relevant
rectangle channels, the adapter will emit literal values as plain materialized
configs and retain expression-, condition-, or series-backed values as
updateable configs. The proof must inspect the underlying channel definitions
and property values, not merely `encoder.constant`. Expression-backed channels
retain their resource-revision subscriptions.

If a supposedly static relevant value can change while retaining the same
program, it must remain updateable and therefore use shader AA. The
implementation must not bake a value that Core later updates through a slot.

### Renderer normalization derives physical layers

The existing recursive render-item normalizer will classify draws from their
program modes and scopes bottom-up. It will produce the existing internal
sample-count-bearing groups:

- a maximal scope containing only multisample-required descendants becomes one
  four-sample accumulation;
- a mixed scope retains ordered direct items and nested MSAA regions;
- a flat mixed sequence forms only maximal consecutive MSAA runs;
- opaque compatible scopes flatten;
- zero-opacity scopes disappear;
- fractional-opacity scopes remain isolated and preserve their bounds.

The encoder continues to receive explicit internal sample counts. Pipeline and
attachment compatibility therefore remain local to `webgpu-renderer`.

The mode is structural for one retained mark program. Opacity remains dynamic
and is evaluated on every frame without Core layout or plan recompilation.

### Scope bounds remain live

Core view coordinates can be closure-backed and can change during
`onBeforeRender()` without constructing a new layout result. Semantic scope
bounds therefore cannot be frozen only in `finish()`. Core will retain the
coordinate sources needed by each ordinary or coalesced scope and refresh its
submitted bounds after view hooks on every frame, or use an equivalent explicit
geometry-revision cache proven to cover those updates.

Coalesced repeated scopes must retain every contributing coordinate source so
the refreshed bound is their current union. Directional clipping still controls
whether each axis uses the view coordinates or the full render target. This
refresh changes only numeric bounds; it does not rebuild hierarchy or AA
classification.

### Sample batches provide a narrow ordering permission

An explicit sample-facet batch guarantees repeated instances of a semantic view
have identical hierarchy and sibling order and occupy independently clipped
placements. Within that contract, Core may collect a repeated view identity
into one scope in first-seen order. Outside the batch, no sibling scope or draw
may be regrouped. Tests will cover interleaved repeated scopes and confirm that
visible order and the separate flat picking order remain intentional.

### Opacity and clipping remain orthogonal to AA classification

Scope classification depends on program AA modes, not current opacity. At
normalization time, opacity zero skips child normalization, opacity one removes
only the composition boundary and retains any semantic clipping/bounds needed
by inferred MSAA children, and fractional opacity isolates exactly once.
Transitions among zero, one, and fractional opacity must neither rebuild Core
layout nor multiply effective opacity into both mark colors and group
composition.

## Alternatives considered

### Keep the Core predicate but rename it as rendering intent

Rejected because the predicate still duplicates the renderer's active shader
path and must evolve whenever rectangle implementation details change.

### Query the renderer from Core for each mark's required sample count

Rejected because it removes duplicate property tests but leaves Core building
sample-count-bearing layer topology. Core would still understand an attachment
implementation detail and would need invalidation when a program changes.

### Reevaluate relevant values every frame

Rejected because live property changes would alter layer topology and pipeline
selection. It also requires inspecting uniform and series data that the
renderer otherwise keeps on the GPU.

### Always use MSAA for marks with dynamic edge properties

Rejected because decorated rectangles already have shader coverage and would
pay MSAA cost indefinitely. Dynamic marks instead use a stable shader-AA
variant.

### Infer semantic layers from a flat draw sequence

Rejected because the renderer cannot safely infer that interleaved sample
placements belong to one logical CNV, metadata, cytoband, or transcript scope.
Only Core owns that hierarchy and the explicit permission to coalesce repeated
sample placements.

## Risks

- Emitting all semantic scopes could increase temporary JavaScript tree size.
  Core should coalesce repeated sample scopes once per layout, and the renderer
  should flatten nonphysical scopes in one pass without creating GPU resources.
- Rebuilding arrays for every semantic scope on every paint could move the
  performance problem from GPU work to allocation pressure. Measure scope and
  array allocation in MCCA; reuse the retained frame topology if the all-scope
  representation produces material churn. Do not add a retained planner before
  measurement demonstrates the need.
- Misclassifying an updateable relevant channel as static could bake the wrong
  shader path. Tests must update the value after creation and verify that all
  such configs select shader AA.
- Shader-AA geometry that expands only for currently visible decorations would
  clip the SDF edge while dynamic properties are plain. Shader mode must reserve
  its minimum edge support independently of live decoration values.
- Freezing semantic scope bounds at layout completion would clip closure-backed
  geometry after `onBeforeRender()`. Submitted bounds must follow current
  coordinates without changing topology.
- Shader-AA rectangles that happen to be plain can show seams when tightly
  tiled. Static heatmaps remain on the MSAA path; dynamically decorated tiled
  rectangles accept this conservative tradeoff.
- Promoting a parent scope across a fractional-opacity child could change
  blending. The normalizer must retain local-opacity isolation while allowing
  compatible opaque children to accumulate.
- Flat clients can receive less efficient layerization than hierarchical
  clients. The contract must state that hierarchy is the optimization and
  composition hint; flat rendering remains correct.

## Milestone 1: Renderer-owned mark AA mode

### Intended outcome

Rectangle program construction makes one stable, testable AA decision and uses
it consistently in both shader generation and draw classification.

### Work

- [ ] Add the internal mark-program antialiasing-mode contract with a
      single-sample default for programs that provide their own coverage or do
      not need edge AA.
- [ ] Implement and unit-test the authoritative rectangle decision function
      against static plain, static decorated, series-backed, conditional, and
      updateable relevant channels.
- [ ] Generate the plain exact-fill fast path only for the multisample mode.
      Shader-mode rectangles must always compute SDF edge coverage and reserve
      at least one physical pixel of supporting quad geometry.
- [ ] Expose the immutable resolved mode to renderer normalization without
      adding it to public mark handles.
- [ ] Adjust Core's rectangle translation so literal relevant values are truly
      static while all updateable forms retain their slots and revisions.

### Affected areas and consumers

- `packages/webgpu-renderer/src/marks/programs/rectProgram.js`
- `packages/webgpu-renderer/src/marks/programs/internal/baseProgram.js`
- renderer program and shader tests
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- Core adapter tests

### Verification

- Static plain rectangles report multisample mode and use the exact-fill shader
  path.
- Static rounded, stroked, shadowed, and hatched rectangles report shader mode.
- Every data-driven, conditional, or updateable relevant property reports
  shader mode even when its initial value is zero.
- Updating a dynamic relevant slot changes appearance without changing the
  program's AA mode.
- A GPU pixel test verifies that a dynamic rectangle whose current relevant
  values are all zero still has antialiased outer edges rather than clipped SDF
  coverage.
- Static unrelated channels do not affect the decision.
- Renderer and Core adapter type checks and focused tests pass.

### Documentation and migration

Document the internal renderer ownership in the renderer README and migration
plan. No public grammar migration is needed.

Tentative commit: `refactor(webgpu): derive rectangle antialiasing in renderer`

## Milestone 2: Sample-count-free semantic scopes

### Intended outcome

Core sends hierarchy and opacity only; the renderer derives physical MSAA
layers from program modes while flat and hierarchical submissions share one
normalization path.

### Work

- [ ] Replace public `RenderGroup.sampleCount` with a sample-count-free
      `RenderScope`; keep sample count only on normalized internal layers.
- [ ] Extend the existing recursive normalizer to classify scope contents and
      form maximal ordered MSAA layers. Do not introduce a parallel planner.
- [ ] Treat flat lists as root items and group only consecutive compatible
      draws.
- [ ] Preserve dynamic opacity-zero pruning, opacity-one flattening, fractional
      isolation, bounds, clipping, resolve behavior, and target reuse.
- [ ] Change Core frame compilation to retain semantic view scopes without
      inspecting mark types or renderer definitions.
- [ ] Coalesce repeated semantic scopes only inside explicit sample-facet
      batches and preserve original flat order for picking.
- [ ] Refresh ordinary and coalesced scope bounds from their current coordinate
      sources after `onBeforeRender()` without rebuilding hierarchy.
- [ ] Delete Core's rendering-intent module, coverage fields, and
      sample-count classification.
- [ ] Remove obsolete explicit-sample-count fixtures and replace them with
      program-derived flat and hierarchical cases.

### Affected areas and consumers

- `packages/webgpu-renderer/src/index.d.ts`
- `packages/webgpu-renderer/src/renderer.js`
- `packages/webgpu-renderer/src/renderGroups.js`
- renderer unit and GPU tests, stories, and examples
- `packages/core/src/rendering/webgpu/webGpuViewRenderingContext.js`
- Core WebGPU context, surface, export, and app frame fixtures

### Verification

- A flat sequence renders correctly and partitions only consecutive
  multisample-required draws.
- An all-MSAA semantic container resolves once, including repeated sample
  placements.
- A transcript-like opacity scope contains an MSAA exon child and direct body
  draws; opacity zero, one, and fractional values take the expected dynamic
  paths without layout recompilation.
- A CNV/LOH-like container accumulates both marks in one MSAA pass and preserves
  their internal painter's order; following point marks remain direct.
- Metadata background and foreground coalesce when both renderer programs
  qualify.
- Closure-backed view coordinates update submitted MSAA and opacity bounds in
  the same frame.
- Interleaved repeated sample scopes respect the documented identical-topology
  ordering contract, while ordinary non-batch siblings retain exact order.
- Picking remains flat and single-sampled.
- Full raster and hybrid SVG export preserve scope bounds, transparency,
  selection, and document order.
- Focused renderer, Core WebGPU, Canvas2D, SVG, app view, and GPU pixel tests
  pass.

### Documentation and migration

Update the renderer public API documentation, examples, and migration plan.
Update Core rendering architecture only if its committed version needs the new
ownership statement; do not overwrite unrelated local documentation edits.

Tentative commit: `refactor(webgpu): infer MSAA from semantic render scopes`

## Review gates

### Contract review before implementation

An independent reviewer must challenge the static/dynamic boundary, shader
correctness, public flat/hierarchy contract, opacity semantics, sample-facet
coalescing, and whether the proposal actually deletes Core knowledge rather
than renaming it.

### Final integration and KISS review

Review the complete diff for duplicate AA decisions, two competing frame
paths, unnecessary retained planning, per-frame allocations, stale
`sampleCount` inputs, and tests coupled to implementation details. Compare
production line counts with the 7,196-line starting point and justify any net
growth.

## Final integration verification

### Representative browser examples

- MCCA WebGPU:
  `/?spec=private/MCCA-visualization/web/specs/spec.json&renderer=webgpu`
  - CNV, metadata, cytobands, and static plain exons retain smooth edges;
  - gene bodies, points, text, and other shader-AA marks remain direct;
  - transcript semantic opacity changes do not rebuild Core layout;
  - zoom, pan, scrolling, hover, and picking produce no console or validation
    errors.
- GenomeSpy paper WebGPU:
  `/?spec=private/genomespy-paper-2024-spec/spec.json&renderer=webgpu`
  - CNV and LOH share one inferred MSAA layer;
  - mutations remain a following direct layer;
  - closeup and visibility interactions preserve ordering.
- Renderer-generic flat and hierarchical scenes demonstrate equivalent output
  with different layerization opportunities.

### Performance gates

- MCCA MSAA attachment and composite counts remain proportional to semantic
  layers, not sample occurrences.
- Dynamic opacity changes produce no Core layout or hierarchy recompilation.
- No physical target is allocated merely because Core supplied a semantic
  scope.
- Scope-node and item-array allocation is measured after warm-up; material
  per-frame growth compared with the current branch must be removed or
  explicitly justified.
- Browser frame pacing and GPU work do not regress from the current branch.
- Production code across the central files should be no larger without an
  explicit correctness justification.

### Repository checks

- Focused WebGPU renderer program, render-group, renderer, and GPU tests.
- Focused Core adapter, WebGPU context, surface, raster export, SVG export, and
  app sample-view tests.
- Core and WebGPU renderer TypeScript checks.
- Focused lint and `git diff --check`.
- Real-browser MCCA and paper-example smoke and performance checks.

## Acceptance criteria

- `webgpu-renderer` contains the only function that decides whether a rectangle
  uses shader edge AA or multisampled coverage.
- The decision is immutable for a mark program and all dynamic relevant
  properties conservatively select shader AA.
- Shader-mode rectangles always provide edge coverage, even while their live
  decoration values are plain.
- Core submits no sample counts and contains no rectangle-specific AA
  predicate.
- Flat and hierarchical input use one normalization and encoding path.
- Core visible rendering uses semantic scopes; picking remains flat.
- CNV/LOH, metadata, cytobands, and exons retain selective MSAA in the target
  examples while unrelated marks remain single-sampled.
- Opacity zero skips branches, opacity one flattens compatible scopes, and
  fractional opacity isolates without Core recomputation.
- Export, clipping, painter's order, placement, and resource lifetimes remain
  correct.
- Legacy WebGL code and behavior remain unchanged.
- The final implementation removes the obsolete Core intent and explicit
  sample-count contract without adding a second planner.

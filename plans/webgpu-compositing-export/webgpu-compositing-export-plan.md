# Selective WebGPU compositing and export plan

Status: Ready for implementation

Reviewed by a Luna subagent before branch creation. The review tightened
placement-indexed MSAA grouping, Canvas2D opacity ownership, sample-count
selection, export serialization, migration-plan reconciliation, and
inspectable MCCA acceptance checks.

## Context

Issues [#478](https://github.com/genome-spy/genome-spy/issues/478) and
[#483](https://github.com/genome-spy/genome-spy/issues/483) need the same
missing WebGPU primitive: render an ordered subset of retained draws into a
temporary target and composite the result. Selective multisample
antialiasing (MSAA) needs a multisampled temporary attachment and resolve;
view opacity needs an isolated transparent target; export needs an
export-sized target whose draw list can be filtered without capturing or
scaling the live canvas.

Core already owns the information needed to drive the primitive. Its completed
layout traversal preserves view nesting, clipping, and paint order, while the
SVG exporter already selects contiguous raster runs and computes their crop
bounds. The low-level WebGPU renderer owns pipelines, attachments, resolves,
and texture lifetime. The legacy WebGL implementation is an intentional
deletion boundary and must not gain any new behavior.

The supplied MCCA visualization has two kinds of plain, sample-faceted
rectangles that benefit from MSAA: variable-length copy-number segments and
the metadata heatmap. Its mutation points, axes, text, summaries, and other
marks must remain on the direct single-sample path.

## Goals

- Add renderer-owned transient targets that preserve nested paint order,
  clipping, transparency, and premultiplied-alpha composition.
- Apply four-sample MSAA only to Core's plain sample-faceted rectangle intent,
  covering MCCA copy-number segments and metadata heatmaps without slowing
  unrelated marks.
- Apply view opacity once to the isolated result in WebGPU and Canvas2D rather
  than multiplying it into every child mark.
- Render WebGPU raster exports at the requested logical dimensions and pixel
  ratio.
- Rasterize selected hybrid-SVG runs with the active WebGPU backend, preserving
  transparent pixels, crop bounds, and document order.
- Keep the low-level renderer generic and Core-free, and keep backend resource
  types out of Core.

## Non-goals

- Adding, refactoring, or otherwise changing the legacy WebGL renderer.
- Enabling MSAA globally or for SDF points, rules, text, axes, summaries, or
  arbitrary rectangles.
- Exposing WebGPU-specific `useMSAA`, `useSdf`, texture, or render-pass
  properties in the visualization grammar.
- Changing picking to use visual compositing or multisampled targets.
- Adding raster formats other than PNG.
- Replacing irregular copy-number geometry with a regular-grid heatmap shader.
- Making SVG export initialize an unselected GPU backend.

## Key decisions

### One ordered render-item contract

Extend the renderer's frame input from a flat draw list to ordered render
items. A render item is either an existing retained draw or a nested group with
an opacity, sample count, logical bounds, and ordered children. The renderer
contract accepts the WebGPU-supported sample counts `1` and `4`, rejects other
values at the boundary, and keeps Core's quality policy fixed at four samples.
Direct draws remain the default and allocation-free fast path. Groups with
neither opacity nor multisampling are flattened during normalization.

The public contract describes rendering behavior, not GenomeSpy concepts. Core
translates its completed view traversal into this generic structure. Picking
continues to receive the existing flat draw list and single-sampled pipeline.

### Lazy multisample pipelines and bounded transient targets

Visible mark programs retain their current single-sample pipeline and create a
compatible four-sample variant lazily only when a multisampled group actually
draws that program. `ProgramDrawOptions` carries the active pass sample count,
and `MarkProgram` selects the matching visible pipeline while reusing the same
shader module, bind-group layouts, bind groups, and retained resources. The
sample count becomes part of the shared pipeline identity; picking remains
single-sampled and does not receive the visual sample count.

The renderer pools color textures by format, physical dimensions, sample
count, and usage. A group renders only its declared logical bounds. A
multisampled attachment resolves into a single-sampled texture, which is then
composited into its parent with premultiplied-alpha blending and the group's
opacity. Nested groups may split a parent into ordered passes; each pass loads
the parent's prior single-sampled accumulation so child composition cannot
reorder siblings.

The pool is renderer-owned, reuses released targets within and across frames,
and destroys all textures with the renderer. Empty or fully transparent groups
do not allocate targets.

### Core derives narrow antialiasing intent

Core identifies plain sample-faceted rectangle marks as the quality-sensitive
case. This semantic rule covers the MCCA copy-number segments and metadata
heatmap because both are rectangle marks indexed by the sample-facet channel.
It excludes the MCCA mutation points and all non-sample-faceted content. The
intent is renderer-neutral and internal: capable raster backends may honor it,
while WebGL remains unchanged and Canvas2D continues to use browser raster
antialiasing.

The frame-plan compiler groups contiguous selected retained draw items, not
data instances or sample-facet occurrences. Placement-indexed marks such as the
MCCA copy-ratio and metadata rectangles therefore render all placements into
one MSAA target and resolve once. Group bounds are the outward-rounded union of
the selected draw's placement occurrences intersected with their clips. No
target is allocated per segment, datum, sample, or facet. Adjacent selected
draw items may be coalesced only when that preserves the existing paint order
and clip.

The precise initial predicate is: a Core `rect` mark whose packed rendering
uses the sample-facet `facetIndex` channel and whose rectangle has no stroke,
corner radius, shadow, or hatch decoration. Metadata missing-value background
rectangles are intentionally part of the metadata heatmap and use MSAA. Tests
lock down the MCCA-shaped positive cases and the negative cases: mutation
points, labels, axes, copy-ratio summaries, selection overlays, decorated
rectangles, non-sample rectangles, and dense points remain direct.

### View opacity is local group state

Add a local-opacity accessor alongside `View.getEffectiveOpacity()`. WebGPU and
Canvas2D create a group for a view whose local opacity differs from one, render
its descendants at full view opacity, and composite the group once. Nested view
groups therefore multiply naturally. WebGL keeps its current effective-opacity
fallback and receives no changes.

Canvas2D uses a transparent offscreen canvas for isolated groups. Marks inside
an isolated group render without effective view opacity baked into their mark
alpha; each local view opacity is applied exactly once when that view's surface
is composited. Nested groups therefore multiply once per level, while the
unchanged WebGL path continues to bake effective opacity into marks. Canvas2D's
explicit MSAA setting is unchanged because the browser owns Canvas2D
antialiasing.

SVG's existing structure and hybrid-run selection remain authoritative for
document grouping and ordering. This project does not make the WebGPU renderer
interpret SVG nodes.

### Export reuses retained resources with an export layout

WebGPU export creates a fresh Core layout and independent frame plan at the
requested logical dimensions and pixel ratio, while reusing the live surface's
device, mark handles, placement resources, and rendering-item machinery. A
renderer-owned detached-target handle configures a second WebGPU canvas on the
same device and owns its context plus logical/physical dimensions; render
normalization and global uniforms use the target dimensions rather than the
renderer's live globals. Target destruction unconfigures the context and
releases target-only resources. PNG encoding waits for
`device.queue.onSubmittedWorkDone()` before using the canvas browser API; the
live canvas is never resized or captured.

The Core surface serializes exports that temporarily synchronize retained mark
configuration. Export compilation/submission does not replace the coordinator's
private live frame plan, and ordinary live frames resume only after the export
submission has captured its ordered buffer writes. Target cleanup and live
layout restoration run on both success and failure.

Hybrid SVG rasterization compiles the same export-sized layout with a mark
predicate for each SVG raster run, renders against a transparent background,
crops through the existing SVG raster-image helpers, and assigns the PNG to
the run's existing placeholder. The normal `finally` path restores the live
layout and retained mark configuration after either export path.

## Alternatives considered

### Add MSAA to the live canvas

Rejected because it penalizes dense SDF scatter plots and every other mark,
which is the performance problem behind issue #478.

### Add an MSAA flag to rectangle mark properties

Rejected because it exposes a backend mechanism in the grammar and makes
authors choose between WebGPU implementation strategies. Core can express the
narrow quality intent from existing sample-facet semantics.

### Capture and scale the live WebGPU canvas for export

Rejected because it cannot produce an independent export layout, selective
mark runs, requested pixel ratio, or reliable transparent crops.

### Build a second renderer for every export

Rejected because mark buffers, textures, fonts, and pipelines belong to the
existing device and retained handles. A second renderer would duplicate those
resources or require a much larger resource-transfer API.

### Generalize the WebGL framebuffer code

Rejected because framebuffer objects and resolve operations are backend-owned,
and the user explicitly requires no new WebGL implementation. Core shares
intent and layout, not GPU resource machinery.

## Milestone 1: Add generic WebGPU render groups

### Intended outcome

The low-level renderer can isolate, multisample, resolve, and composite nested
ordered groups while leaving ordinary frames and picking on their existing
single-pass path.

### Work

- [ ] Add typed draw/group render items, opacity/sample-count validation, and
      recursive normalization that preserves order and logical bounds.
- [ ] Pass the active sample count through `ProgramDrawOptions` and lazily
      provide visible mark pipelines for sample counts one and four; keep
      picking single-sampled and retain shader/layout/resource sharing.
- [ ] Add a renderer-owned transient color-target pool with explicit acquire,
      release, resize-keying, and destruction semantics.
- [ ] Add the texture-composite pipeline and encode nested groups with
      premultiplied alpha, correct viewport/scissor translation, transparent
      clears, resolve targets, and ordered parent loads.
- [ ] Add renderer unit and GPU tests for direct-path preservation, selective
      MSAA, opacity over overlapping marks, nesting, clipping, pooling, and
      picking isolation.
- [ ] Reconcile the transient-target and same-device-target work with
      `packages/webgpu-renderer/MIGRATION_PLAN.md`.

### Affected areas and downstream consumers

- `packages/webgpu-renderer/src/renderer.js` and public declarations
- mark pipeline construction and built-in draw methods
- renderer tests, GPU fixtures, README, migration plan, and a focused
  renderer-generic story
- Core adapter only as a later consumer of the new generic contract

### Verification

- Renderer unit tests assert pass descriptors, attachment sample counts,
  resolves, composite order, translated viewports/scissors, and resource reuse.
- GPU tests compare representative pixels for overlap opacity, nested groups,
  clipping, and MSAA edge coverage.
- Existing flat-frame and picking tests prove that no group target or
  multisample pipeline is created for ordinary draws.
- Run renderer type checks, unit tests, GPU tests, lint, and Storybook build.

### Documentation and migration

Document ordered render groups, their bounds, opacity, sample counts, target
lifetime, and the separate picking contract in the renderer README. The
renderer is unpublished, so the frame-type extension needs no compatibility
shim.

Tentative commit: `feat(webgpu-renderer): add selective render groups`

## Milestone 2: Integrate Core compositing intent

### Intended outcome

WebGPU gives four-sample coverage only to plain sample-faceted rectangles, and
WebGPU plus Canvas2D apply view opacity once per isolated view group. WebGL is
untouched.

### Work

- [ ] Add and test the local view-opacity accessor without changing
      `getEffectiveOpacity()` for legacy consumers.
- [ ] Add a renderer-neutral internal rendering-intent helper using the exact
      undecorated sample-faceted rectangle predicate above.
- [ ] Compile WebGPU view nesting and selected rectangle occurrences into
      ordered renderer groups while keeping picking flat and direct. Aggregate
      placement-indexed marks into one bounded target and resolve, never one
      target per sample facet.
- [ ] Stop baking effective view opacity into WebGPU mark channels; update group
      opacity live without rebuilding mark resources.
- [ ] Add Canvas2D offscreen view groups for true group opacity, render their
      descendants without effective-opacity baking, and retain browser-managed
      antialiasing plus selective-mark rendering.
- [ ] Cover MCCA-shaped copy-number rectangles, metadata rectangles, mutation
      points, nested opacity, clipping, and picking with focused Core/App tests.
- [ ] Expose a serializable development frame-plan summary containing group
      sample counts, bounds, and Core mark/view identities so browser smoke
      tests can prove the MCCA selection without inspecting GPU internals.

### Affected areas and downstream consumers

- Core view opacity and rendering-intent helpers
- Core WebGPU frame-plan compiler, surface, adapter, and tests
- Canvas2D immediate rendering context and tests
- App metadata generated-spec tests as an integration assertion
- WebGL consumes the unchanged effective-opacity method and flat buffered path

### Verification

- Core tests assert that copy-number-like and metadata-like rect marks produce
  four-sample groups, while points and non-sample rectangles stay direct.
- A placement-indexed multi-facet regression test asserts one MSAA group and
  one resolve for the complete retained draw, with no per-facet target.
- A live opacity update changes only group composition state, not retained mark
  series, pipelines, or picking commands.
- Canvas2D pixel/operation tests distinguish group opacity from per-mark
  opacity for overlapping children and cover nested groups.
- Run focused Core and App tests, workspace type checks, and lint.

### Documentation and migration

Update Core rendering architecture notes to describe renderer-neutral group
intent and the WebGL fallback. No public grammar or schema change is required.

Tentative commit: `feat(core): add selective compositing intent`

## Milestone 3: Add export-sized WebGPU rasterization

### Intended outcome

The active WebGPU backend renders full PNG exports and selected hybrid-SVG runs
with independent export layout, dimensions, pixel ratio, transparency, crop,
and paint order.

### Work

- [ ] Add a same-device detached renderer target with explicit logical and
      physical dimensions, target-local globals, cleanup, and queue
      synchronization before capture.
- [ ] Build full export-sized Core layout/frame plans instead of scaling the
      live WebGPU canvas, keep them independent from the coordinator's live
      frame plan, and serialize retained-resource synchronization across
      overlapping export requests.
- [ ] Add a WebGPU selective SVG rasterizer that filters each run's marks,
      renders transparent export-sized frames, crops with the shared SVG
      helpers, and fills existing placeholders in order.
- [ ] Preserve MIME validation and fallback behavior, and restore the live
      layout/resources after success or failure.
- [ ] Add full-frame, requested-size, transparent selective-run, crop, and
      hybrid-document-order tests.

### Affected areas and downstream consumers

- low-level renderer target submission and synchronization
- Core WebGPU backend, surface, frame-plan compiler, and rasterization tests
- existing generic raster export and SVG run-selection contracts
- Canvas2D fallback remains available; WebGL code is unchanged

### Verification

- Unit tests prove export globals and layout use requested logical dimensions
  and pixel ratio rather than live canvas dimensions.
- Hybrid SVG tests assert selected marks only, transparent pixels, exact crop
  placement, and raster/vector document order.
- Browser smoke-test the supplied MCCA URL with `renderer=webgpu`: smoothly
  zoom copy-number segments and metadata, inspect the serializable frame-plan
  summary to verify only those draws use multisample groups, exercise picking,
  export PNG at a non-live size, and export a hybrid SVG.
- Open the supplied URL without a renderer override to confirm the unchanged
  WebGL path still loads and interacts normally.
- Run focused Core and renderer tests, renderer GPU tests, workspace type
  checks, lint, and the relevant WebGPU example smoke suite.

### Documentation and migration

Update the renderer README and Core WebGPU integration README with detached
targets and export ownership. Existing public image-export options are reused,
so no user migration is needed.

Tentative commit: `feat(core): rasterize exports with WebGPU`

## Final integration and acceptance

- [ ] Re-run the supplied MCCA visualization with WebGPU and verify that
      copy-number segments and metadata heatmaps are the only MSAA groups.
- [ ] Verify dense point marks stay on the direct single-sample path during
      interaction and picking remains unchanged.
- [ ] Verify overlapping and nested view opacity against equivalent SVG-style
      group composition in WebGPU and Canvas2D.
- [ ] Export a non-live-size transparent PNG and a hybrid SVG containing both
      vector elements and correctly cropped WebGPU raster runs.
- [ ] Run final focused and cross-workspace checks and reconcile every task in
      this plan before delivery.
- [ ] Perform an independent smell/KISS review over the full branch, apply
      worthwhile simplifications, and repeat affected verification.

## Risks

- WebGPU canvas capture may require awaiting submitted work on some browsers;
  export must synchronize before encoding without stalling ordinary frames.
- Nested groups can force pass boundaries. Incorrect load/resolve ownership
  would erase earlier siblings or composite them twice.
- Target bounds expressed in logical pixels must round outward at the selected
  pixel ratio or antialiased edge pixels can be cropped.
- Export reuses mark handles whose positional ranges depend on layout. The
  existing final restoration is therefore part of correctness, including on
  exceptions.
- Canvas2D group surfaces can be expensive if opacity is used per sample. Keep
  the implementation lazy and bounded to views that actually isolate.
- The sample-faceted-rectangle heuristic is intentionally narrow. If a future
  use case needs different quality intent, add a backend-neutral policy rather
  than a WebGPU flag.

## Unresolved questions

- WebGPU render attachments support sample counts one and four. The renderer
  validates this generic contract and rejects any other requested value;
  failure is a WebGPU rendering error, not an implicit single-sample or
  Canvas2D fallback.
- If detached WebGPU canvases cannot be captured reliably in the supported
  Playwright browser, the same renderer target contract can use texture
  readback plus a Canvas2D encoder without changing Core's design.

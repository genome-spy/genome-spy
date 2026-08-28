# Canvas software picking renderer plan

Status: Proposed

## Context

GenomeSpy's Canvas2D compatibility renderer supports view interactions but not
datum picking. The rendering backend and interaction controller already expose
the necessary optional boundary: a coordinator can render a picking target and
the backend can read a unique ID at a logical pointer coordinate. Canvas leaves
both capabilities unimplemented.

A hidden color-key Canvas is not robust enough. Canvas antialiasing and
source-over compositing can blend neighboring IDs, particularly in dense point
clouds and highly overdrawn genomic plots. Decoding a blended RGBA pixel can
produce an ID that was never drawn at that location.

The proposed renderer is instead a small, Canvas-owned software rasterizer. It
writes datum IDs directly into a `Uint32Array`, without colors, blending, or
fractional coverage. It consumes the existing ordered `LayoutResult` and the
screen-space mark occurrences produced by `rendering/immediate/`. It is not a
general-purpose visual renderer.

The picking implementation belongs to the Canvas renderer module. The normal
Core entrypoint registers Canvas and loads its implementation dynamically when
selected. The minimal entrypoint registers no optional renderer; importing
`@genome-spy/core/rendering/canvas.js` is the explicit opt-in that makes both
Canvas rendering and software picking available. Picking is then automatic
when Canvas is active because an interactive Canvas renderer without datum
picking is not a useful compatibility target.

The design follows the binary-coverage and horizontal-run model used by
traditional aliased scan converters, but no third-party rasterizer code is
needed or planned. Skia documents aliased scan conversion as binary pixel
coverage followed by horizontal blits:
<https://skia.googlesource.com/skia/+/main/docs/architecture/CPU.md>.
Tiny-skia is BSD-3-Clause, but even its reduced CPU renderer includes fills,
strokes, gradients, patterns, clipping, blending, and image operations that are
outside this feature's scope: <https://github.com/linebender/tiny-skia>.

## Goals

- Enable Canvas tooltips, datum clicks, and point-selection hit testing through
  the existing renderer-neutral picking contract.
- Produce deterministic IDs in dense and antialiased visualizations without
  reading colors from a Canvas.
- Preserve layout traversal, facet placement, clipping, culling, semantic zoom,
  and painter order by reusing the immediate screen-space mark visitors.
- Keep pointer reads constant-time after the buffer has been rendered.
- Bound normal memory by four bytes per logical CSS pixel, independently of
  device pixel ratio.
- Provide a developer mode that colorizes the ID buffer and blits it into the
  live Canvas for visual inspection.
- Keep Canvas, SVG, WebGL, and WebGPU implementations independently loadable.
- Make the existing Canvas registration the only opt-in needed for both visual
  Canvas rendering and its software picking implementation.
- Keep the minimal entrypoint and builds that do not register Canvas free of
  software-picking code.

## Non-goals

- Visually reproduce Canvas2D output, including antialiasing, colors, alpha,
  shadows, gradients, hatches, dashes, glyph outlines, or compositing.
- Implement the Canvas API, `Path2D`, a retained scene graph, or a general vector
  path rasterizer.
- Make buffer pixels encode every datum underneath the pointer. One pixel stores
  only the topmost participating datum.
- Use the buffer to enumerate all data intersecting a lasso or interval. Those
  operations must continue to use data-space or geometry-based predicates.
- Change WebGL or WebGPU picking geometry as part of this work.
- Add picking to SVG export or introduce a live SVG picking backend. SVG remains
  an export-oriented renderer and is not a performance target for interaction.
- Add picking controls to the visualization grammar or generated JSON Schema.
- Move CPU-projected geometry into semantic marks or make the WebGPU renderer
  depend on the immediate rendering layer.

## Key decisions

### Store IDs directly at logical-pixel resolution

Add a Canvas-owned picking surface with these invariants:

- storage is a row-major `Uint32Array`;
- width and height are `Math.floor()` of the logical Canvas dimensions;
- ID `0` represents no hit;
- nonzero entries are the existing datum `uniqueId` values;
- reads floor and bounds-check logical pointer coordinates; and
- resize allocates only when dimensions change, while clear uses
  `Uint32Array.fill(0)`.

The buffer is deliberately not scaled by device pixel ratio. Pointer events and
the rendering-backend `readPickingId(x, y)` contract use logical CSS
coordinates. A device-resolution buffer would multiply memory by DPR squared
and make tiny visual antialiasing details affect interaction.

Logical Canvas dimensions may be fractional because sizing uses
`getBoundingClientRect()`. Flooring keeps the array dimensions and coordinate
mapping simple. A fractional strip narrower than one CSS pixel at the right or
bottom edge may therefore be unpickable; this is an accepted tradeoff. Reads in
that strip return ID `0`. Tests cover safe flooring and bounds checks but do not
require picking in the discarded fringe.

Expected storage is about 3.8 MiB at 1000 by 1000, 7.9 MiB at 1920 by 1080, and
31.6 MiB at 3840 by 2160. `Canvas2DSurface` owns the ID array, diagnostic byte
storage, and diagnostic scratch canvas because it already has the renderer
finalization contract. It allocates them lazily, lends the ID surface to the
coordinator during picking replay, resizes it with the live logical surface, and
releases it from `Canvas2DSurface.finalize()`. The coordinator owns only dirty
state and synchronous replay control.

### Package picking with the opt-in Canvas implementation

Keep every software-picking implementation module under
`packages/core/src/rendering/canvas2d/` and make it statically reachable only
from the dynamically imported Canvas implementation. Do not import picking code
from `minimal.js`, `renderingBackend.js`, shared immediate modules, or another
synchronous entry module.

The activation model is:

- `@genome-spy/core` registers Canvas as it does today, while the implementation
  and picker stay behind `registerCanvas.js`'s dynamic import;
- `@genome-spy/core/minimal` contains no Canvas or software-picking module;
- a minimal consumer opts into both with the existing side-effect import
  `@genome-spy/core/rendering/canvas.js`; and
- once the Canvas backend is selected, picking capabilities are exposed
  automatically, without another embed option, feature flag, or import.

The ID array is still allocated lazily. Bundling picking with Canvas therefore
adds code to the Canvas chunk but adds no picking-buffer memory to Canvas
instances that have no picking participants or never request picking.

Do not put picking primitives under `rendering/immediate/`. That directory may
provide backend-neutral screen-space geometry needed by Canvas, SVG, and
software picking, but it must not acquire the Canvas picker's storage,
rasterization policy, debug colorization, or lifecycle. SVG may benefit from
shared geometry refactors but does not construct or query an ID surface.

### Replay the retained layout only when picking is dirty

`Canvas2DRenderCoordinator` already retains the latest completed
`LayoutResult`. Extend it with a software picking context and a dirty flag:

1. A normal render marks the picking buffer dirty.
2. `renderPickingFramebuffer()` returns immediately when it is clean.
3. When dirty, it clears the ID surface and replays the latest layout into a
   picking-specific `ViewRenderingContext`.
4. `readPickingId()` performs no geometry work and reads the completed surface.

This preserves Canvas's lack of a retained scene graph and avoids imposing
picking cost on visual frames that receive no pointer interaction. It also
matches the existing WebGL lifecycle, in which the picking framebuffer is
rendered lazily after visible rendering makes it dirty.

The first implementation is synchronous. If Chromium benchmarks show an
unacceptable first-hover long task, a later change may let
`readPickingId()` return a build promise, which the existing interaction
controller already supports. That change must first add explicit cancellation
or generation invalidation tied to surface finalization; this plan does not
introduce unowned pending work. Worker rendering is deferred because the
layout, mark encoders, and datum objects are not cheaply transferable.

### Use conservative, intentionally relaxed picking geometry

The rasterizer needs a small fixed primitive set rather than arbitrary paths.
Pixels are conservatively covered: rasterization may enlarge geometry by half a
logical pixel so a pointer cell that intersects a mark is not lost merely
because its center falls outside the mark.

| Mark      | Picking representation                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rect      | Clipped integer row spans over the rectangular extent; ignore corner radii and decoration.                                                               |
| Point     | Axis-aligned square using the immediate visitor's conservative outer radius, enlarged to `minPickingSize`; ignore the authored point shape and angle.    |
| Rule/tick | Conservative thick segment using the greater of its stroke width and the minimum interactive width.                                                      |
| Link      | Adaptively flatten the cubic Bézier, then rasterize conservative thick segments using `minPickingSize`.                                                  |
| Text      | Filled rotated bounding quad derived from alignment, baseline, displayed width and height, offsets, angle, ranges, squeezing, and `logoLetters` scaling. |
| Arrow     | Thick stem plus a conservative head region derived before exact boundary-loop construction.                                                              |

Whole-link bounding boxes are explicitly forbidden. The structural-variant
example contains long arcs whose bounds overlap much of the plot, making a
bounds-only link picker both inaccurate and an overdraw pathology.

Whole-arrow bounds are also avoided for long or diagonal arrows. Extract the
projection and scalar geometry portion of `visitArrowInstances()` into a
backend-neutral `visitArrowSkeletonInstances()` helper. Its reused mutable
record contains the datum, tail, tip, tangent, normal, stem half-width, head
half-width and axis length, stroke width, repeat spacing, repeat footprint, and
geometry length. The existing visual visitor consumes that skeleton to create
boundary polygons and run polygon union when needed. Software picking consumes
the skeleton directly to rasterize the stem and conservative regions at each
actual head position. The picking path must never call `unionPolygons()`.
Canvas and SVG retain their current boundary loops and visual output.

For points, expose or share the same conservative outer radius already used by
immediate culling. It includes rotation-safe shape extent and outward stroke
padding; inward strokes and `x`/`+` line shapes are therefore handled once in
the immediate geometry path. The picking square half-size is the greater of
that radius and half the expression-resolved `minPickingSize`. Link picking
uses `max(instance.strokeWidth, resolvedMinPickingSize)`, matching the current
WebGL width rule, and deliberately ignores dash gaps.

For text, add one reusable screen-space bounds-quad calculation and use it for
both immediate culling and software picking. Ordinary text uses its final
scaled width and size after range placement and squeezing. `logoLetters` uses
the original displayed range width and height captured before its drawing
instance is normalized to `size = 1` and `width = 1`; it uses center/middle
alignment plus offsets and rotation. Normalize negative ranges around the same
center and continue to reject zero-sized logo cells. This keeps ranged logo
letters pickable over their actual displayed cell rather than a one-pixel box.

Cubic flattening uses a screen-space flatness tolerance, a maximum subdivision
depth, and reusable scratch storage. Thick segments may initially use a DDA or
major-axis walk with square stamps; this deliberately produces a small
Chebyshev-distance overestimate suitable for hit testing. Filled rectangles and
convex quads use clipped scanline spans.

### Preserve picking participation and paint order

The picking context must:

- skip marks for which `mark.isPickingParticipant()` is false;
- skip views with nonpositive effective opacity, consistent with current
  Canvas traversal;
- call `view.onBeforeRender()` once per unique view in depth-first order during
  each software picking replay, matching the rendering-context pass contract;
- apply inherited and mark-level directional clipping as an integer scissor;
- use the same occurrence and sample-facet traversal as visible Canvas;
- use the immediate visitors' semantic-threshold and visibility culling; and
- write occurrences in forward paint order, allowing later writes to replace
  earlier IDs.

Forward overwrite gives an unambiguous topmost datum even when visible Canvas
pixels contain blends from many points. The result may appear arbitrary in a
dense pile, but it is deterministic and agrees with framebuffer-style painter
order. Nearest-center scoring would require another per-pixel value and would
be a different interaction policy.

Do not filter picking merely because a datum's visible fill or stroke alpha is
zero. Existing GPU picking primarily follows picking participation and picking
geometry rather than visible color blending. Any deliberate difference from
WebGL must be captured in tests and the Canvas renderer documentation.

The diagnostic visualization displays the exact participant-filtered ID
surface. A visualization whose marks have `tooltip: null` and no point
selections may therefore display only the empty/background color. This is
intentional: debug mode inspects real picking behavior rather than an
all-marks coverage approximation.

### Keep immediate geometry backend-neutral

Add a `SoftwarePickingViewRenderingContext` under `rendering/canvas2d/`. It
owns Canvas-specific picking policy but consumes the same immediate occurrence
visitors as Canvas and SVG. The primitive ID rasterizer remains independent of
`CanvasRenderingContext2D`; only diagnostic visualization uses Canvas APIs.

Avoid copying coordinate projection or facet traversal into mark-specific
picking code. Where visible Canvas and software picking need identical setup,
extract a small helper for occurrence selection, clip bounds, and mark
rendering options rather than introducing a general scene-graph abstraction.

The immediate visitors currently yield each source datum, allowing the picking
renderer to encode its existing `uniqueId` directly without a per-frame token
map. This preserves the current backend contract and the collector lookup used
by `InteractionController`.

### Make the ID surface visually inspectable

Add a developer-only API:

```ts
api.debug.setPickingBufferVisualization(enabled: boolean): boolean;
```

The method returns whether the active backend supports this diagnostic. It is
not an `EmbedOptions` field or a specification property and is not persisted.
Add `setPickingBufferVisualization(enabled): boolean` as an optional
`RenderingBackend` capability implemented by Canvas and backed by
`Canvas2DSurface` state. The embed debug method is available only after
successful `embed()` resolution, returns `false` on WebGL/WebGPU or after
finalization, and never remembers an unsupported request for a future backend.
Canvas returns `true` when it applies a changed or already-current mode.
Enabling or disabling requests a render.

When enabled, a Canvas render performs or refreshes the picking pass and then
blits a colorized representation over the live Canvas instead of leaving the
normal visualization visible. This keeps sizing, positioning, interaction, and
cleanup attached to the existing surface and avoids managing a second DOM
canvas. Disabling the mode schedules a normal repaint.

Colorization is diagnostic only:

- ID `0` uses a stable empty/background color;
- each nonzero 32-bit ID is hashed to a stable, opaque, high-contrast RGB color;
- collisions in the 24-bit diagnostic palette are acceptable because the
  actual picking surface remains 32-bit and is never decoded from the colors;
- conversion reuses one `ImageData`-compatible byte buffer;
- `putImageData()` writes the logical image into a reused scratch canvas because
  it ignores the live context transform;
- the live context resets its transform, clears the full physical backing
  store, disables image smoothing, and uses `drawImage()` from the scratch
  canvas; and
- destination width and height are the floored picking dimensions multiplied
  by the live physical-to-logical ratios. Any discarded fractional logical
  fringe stays at the empty/background color rather than stretching the final
  picking row or column across it.

Keep colorization and blitting out of normal picking measurements. The software
surface should expose a target-context blit helper internally so tests can
verify visualization without entangling ID rasterization with the live Canvas.

### Instrument and guard the hot path

Use the existing performance profiler categories for Canvas picking replay and
debug blitting. Primitive loops must avoid per-pixel objects and avoid
per-instance temporary arrays where reusable scratch storage is sufficient.

The first version uses one contiguous buffer. Sparse tiles are deferred: they
add maps and indirection, while dense point clouds allocate nearly every tile
anyway. Before choosing an explicit maximum-pixel guard, measure realistic 4K
and unusually large logical canvases. Allocation failure must be reported as a
clear renderer error rather than silently disabling picking.

## Alternatives considered

### Hidden Canvas with encoded colors

Rejected. Antialiasing and compositing make edge and overdraw pixels ambiguous.
Neighbor searches can recover some single-shape edges but cannot reliably
identify the intended source in a dense blended pixel.

### Geometry index only

Rejected as the primary picker. A point-oriented spatial index is effective for
sparse glyphs, but long links or arrows overlap many cells or produce huge
candidate sets. Exact testing also reintroduces mark-specific geometry and
paint-order resolution for every pointer event.

### Rasterize only a small tile around the pointer

Deferred. Without a retained geometry index, each newly visited tile still
requires iterating all relevant data. Repeated tile rebuilds during pointer
movement can cost more than one full cached logical-pixel surface.

### Use Canvas without antialiasing

Rejected because browsers do not provide a general switch that disables
Canvas2D path antialiasing and compositing for this purpose.

### Import or compile a general software rasterizer

Rejected for the initial implementation. General libraries solve color,
coverage, blending, path joins, clipping, and image problems that an integer ID
surface does not have. A custom fixed primitive set is smaller, easier to audit,
and can deliberately relax picking geometry.

### Register software picking separately from Canvas

Rejected. It would permit a Canvas renderer that still lacks tooltips, clicks,
and point selections, and would require users of the minimal entrypoint to know
about two coupled side-effect imports. Canvas registration is the feature
boundary; buffer allocation remains lazy within it.

### Add the same picking path to SVG

Rejected. SVG is used for structured export, where DOM construction and mark
element counts are already too expensive for a low-latency picking target. The
software buffer solves the interactive Canvas compatibility gap and must not
turn SVG export into another live backend.

### Exact point, text, and arrow outlines

Rejected as the default. Exact outlines increase implementation and execution
cost while making small shapes harder to acquire. The relaxed bounds are an
intentional interaction feature, not a visual fallback.

### Keep a separate visible debug canvas

Rejected for the initial diagnostic mode. A sibling or overlay canvas adds DOM
layout, sizing, stacking, and lifecycle behavior. Replacing the live Canvas
contents while the mode is enabled is simpler and makes pointer coordinates
directly comparable with displayed picking pixels.

## Milestone 1: Add the integer picking surface and primitive rasterizer

### Intended outcome

A DOM-independent module can resize, clear, rasterize conservative primitives,
preserve overwrite order, read IDs, and produce bytes for diagnostic
colorization.

### Work

- [ ] Add the logical-size `Uint32Array` surface with explicit zero-background,
      resize, clear, bounded read, and disposal behavior.
- [ ] Add clipped row-span fills for rectangles and convex polygons.
- [ ] Add square point coverage and conservative thick-segment rasterization.
- [ ] Add adaptive cubic flattening with a bounded depth and reusable scratch
      storage, feeding the thick-segment primitive.
- [ ] Add stable ID-to-RGB diagnostic colorization without changing stored IDs.
- [ ] Instrument primitive counts and elapsed picking/debug phases through the
      existing profiler without logging from the hot path.

### Affected areas and downstream consumers

- New modules and adjacent tests under
  `packages/core/src/rendering/canvas2d/picking/`
- `packages/core/src/debug/performanceProfiler.js` only if existing phase names
  are insufficient

There is no public API or live renderer behavior in this milestone.

### Verification

- Vitest fixtures assert exact small buffers for clipping, floored fractional
  logical sizes, half-pixel boundary cases, zero-length segments, steep and
  shallow segments, cubic subdivision, overwrite order, resize, and
  out-of-bounds reads. The discarded fractional right/bottom fringe is expected
  to return ID `0`.
- Property-oriented tests ensure every write remains inside the allocated
  buffer and subdivision terminates for degenerate and extreme control points.
- A representative dense point stamp and structural-variant arc workload is
  measured in a real Chromium page before integration decisions are finalized.
- Colorization tests verify stable opaque output and a distinct background
  without treating RGB values as picking IDs.

### Documentation and migration

Document module invariants and approximation rules in the Canvas renderer
README. There is no user migration.

Tentative commit: `feat(core): add a software ID rasterizer for Canvas picking`

## Milestone 2: Integrate Canvas picking with layout replay and interactions

### Intended outcome

Canvas tooltips, datum clicks, and point selections work for rect, point,
rule/tick, and link marks, including dense scatter plots and long genomic arcs.

### Work

- [ ] Add `SoftwarePickingViewRenderingContext` with view-stack,
      once-per-view `onBeforeRender()`, occurrence, sample-facet, clipping,
      culling, opacity, and picking-participation rules.
- [ ] Add mark dispatch for rect, point, rule/tick, and link using the immediate
      instance visitors and the existing datum `uniqueId` encoding.
- [ ] Add the lazy dirty-buffer lifecycle to `Canvas2DRenderCoordinator`.
- [ ] Expose `readPickingId` from the Canvas backend and ensure surface resize
      invalidates or reallocates the picking surface.
- [ ] Make `Canvas2DSurface` the explicit owner of picking and diagnostic
      storage so its existing `finalize()` path releases all allocations.
- [ ] Keep the picking context and rasterizer inside the existing dynamically
      loaded Canvas implementation so Canvas registration enables both without
      another public option or side-effect import.
- [ ] Return ID `0` for floored-away fractional edge coordinates and after the
      surface has finalized.
- [ ] Record Canvas picking replay with the existing performance profiler.

### Affected areas and downstream consumers

- `packages/core/src/rendering/canvas2d/canvas2DRenderCoordinator.js`
- `packages/core/src/rendering/canvas2d/canvas2DSurface.js`
- `packages/core/src/rendering/canvas2d/index.js`
- `packages/core/src/rendering/registerCanvas.js` and minimal-bundle verification
- New Canvas picking context and mark adapters
- Shared immediate helpers only where needed to keep projection and facet
  traversal single-sourced
- `RenderingBackend` consumers and `InteractionController` tests

SVG, WebGL, WebGPU, export paths, and normal Canvas paint remain behaviorally
unchanged. Shared immediate changes require their relevant tests to pass.

### Verification

- Coordinator tests verify dirty, clean, resized, and finalized states and
  ensure repeated pointer reads do not replay geometry.
- Picking-context tests verify mark participation, facets, clips, semantic
  thresholds, once-per-view `onBeforeRender()`, topmost paint order, and IDs at
  representative boundaries.
- Point/link parity tests cover inward and outward point strokes, rotated and
  line-shaped points, expression-backed `minPickingSize`, link stroke width, and
  the intentional omission of dash gaps from picking.
- Canvas live tests dispatch pointer movement and clicks and assert tooltips,
  hover state, emitted datum events, and point-selection updates.
- Compare representative coordinates against WebGL picking where the software
  geometry is not intentionally more permissive.
- Verify that Canvas registration remains dynamically isolated and does not add
  Canvas modules to minimal or WebGL-only bundles.
- Extend the minimal-bundle verifier with a minimal fixture that imports
  `@genome-spy/core/rendering/canvas.js`. Assert that plain minimal has no Canvas
  or picking sources, minimal plus Canvas has a dynamically reachable Canvas
  chunk containing picking, and both synchronous minimal entries remain free of
  the implementation. Run the updated
  `npm --workspace @genome-spy/core run verify:bundle:minimal` check.

### Documentation and migration

Update the Canvas README to remove the no-picking limitation and document the
relaxed hit regions. Update user-facing renderer documentation if it currently
states that Canvas tooltips or point selections are unavailable. Document that
minimal consumers receive picking automatically from the existing
`@genome-spy/core/rendering/canvas.js` import. No grammar or schema migration is
needed.

Tentative commit: `feat(core): enable software picking in the Canvas renderer`

## Milestone 3: Complete mark coverage and add buffer visualization

### Intended outcome

Text and arrow marks participate in Canvas picking, and developers can toggle a
live colorized view of the exact logical ID buffer.

### Work

- [ ] Add a reusable rotated text bounds quad shared by culling and picking,
      including ranged/squeezed text and `logoLetters` cells whose displayed
      width and height differ from their normalized drawing instance.
- [ ] Extract `visitArrowSkeletonInstances()` and make visual arrow construction
      and picking consume it independently; prove the picking path does not
      compute boundary loops or polygon unions while preserving Canvas and SVG
      arrow output.
- [ ] Add text and arrow picking adapters with documented conservative bounds.
- [ ] Add the optional renderer capability and
      `api.debug.setPickingBufferVisualization(enabled)`.
- [ ] Define the debug method's supported, unsupported, and finalized return
      behavior without persisting unsupported requests.
- [ ] Reuse diagnostic pixel storage and a scratch canvas, then blit with
      transform-free nearest-neighbor scaling that preserves the floored logical
      extent at integer and fractional DPR. Force a current picking pass while
      enabled and restore normal rendering when disabled.
- [ ] Document the developer API and diagnostic palette semantics.

### Affected areas and downstream consumers

- Immediate text and arrow geometry helpers
- Canvas, SVG, and software-picking text/arrow renderers
- Rendering backend capability types
- `GenomeSpyBase`, `embedFactory`, and `EmbedDebugApi`
- Canvas README and developer-facing API documentation

The immediate arrow refactor is a review gate because it affects two visual
renderers and the new picker. The developer API is a second review gate because
it extends the typed embed result even though it is explicitly diagnostic.

### Verification

- Unit tests cover rotated/aligned/ranged/squeezed text, single- and
  multi-character `logoLetters`, negative ranges, and long horizontal, vertical,
  diagonal, repeated-head, and reversed arrows.
- Arrow tests verify that the picking visitor consumes skeleton geometry without
  invoking polygon construction or `unionPolygons()`.
- Existing Canvas and SVG arrow/text geometry tests remain unchanged or receive
  only intentional structural updates with identical rendered output.
- Embed API tests verify enable, disable, unsupported-backend reporting,
  post-finalization behavior, render requests, and cleanup. Public calls cannot
  occur before successful embed resolution.
- Chromium checks verify one logical picking pixel remains visually discrete at
  DPR 1, 2, and a fractional DPR; the floored logical fringe remains empty,
  colors stay stable between clean reads, and disabling the mode restores the
  visualization.
- Debug tests verify that nonparticipating marks are absent and an entirely
  nonparticipating visualization produces an empty diagnostic buffer.
- Visualized pixels and `readPickingId()` are checked against the same underlying
  ID surface; no color decoding participates in picking.

### Documentation and migration

Document the debug method as unstable developer tooling and show a short console
example. Document that the live visualization is temporarily replaced while
the mode is enabled. No specification migration is needed.

Tentative commit: `feat(core): visualize the Canvas software picking buffer`

## Final integration verification

- Run the focused Canvas2D, immediate geometry, interaction-controller, embed
  API, Canvas live, and SVG text/arrow suites with the Vitest agent reporter.
- Run workspace TypeScript checks and lint after the typed debug API is added.
- Run the Core minimal-bundle verification and inspect the production chunk
  graph: software-picking modules must be absent from the minimal build and
  dynamically contained within the Canvas implementation path.
- In real Chromium, exercise
  `examples/docs/examples/genomic-data/hcc1954-sv-cnv.json`; verify that hovering
  long overlapping arcs selects only pixels near the curve rather than the
  whole Bézier bounds.
- Exercise a synthetic million-point scatter plot at DPR 1 and 2. Verify
  deterministic topmost IDs, responsive repeated pointer reads, and an
  inspectable dense picking visualization.
- Exercise `examples/core/layout/grid/concat_points_text.json` for facets,
  points, text, and explicit `minPickingSize` behavior.
- Verify clipping, zooming, panning, resizing, semantic zoom, overlapping marks,
  Canvas fallback after WebGL initialization failure, and finalization.
- Compare profiler results for ordinary Canvas frames with and without picking
  activity. Clean-buffer pointer movement must add only constant-time reads,
  and debug colorization must have no cost while its mode is disabled.
- Run the full Core unit suite if shared immediate text or arrow geometry
  changes have wider consumers.

## Acceptance criteria

- Canvas provides the same tooltip, datum click, and point-selection interaction
  entry points as WebGL for every Canvas-supported mark type.
- Dense overdraw can never decode a blended or nonexistent ID because the
  picking path stores integers directly.
- Later painted picking participants win overlapping pixels consistently.
- Link picking follows flattened curve geometry and never fills an entire
  Bézier bounding box.
- Points, text, and arrows have explicit, tested, conservative hit regions.
- Text picking uses the final displayed bounds for ordinary, ranged, squeezed,
  and `logoLetters` instances rather than normalized drawing dimensions.
- Layout/facet/clipping/semantic-zoom behavior comes from shared immediate
  traversal rather than a parallel geometry pipeline, and each picking pass
  preserves the once-per-view `onBeforeRender()` contract.
- The cached buffer uses four bytes per floored logical pixel, is independent of
  DPR, rebuilds only while dirty, is owned by `Canvas2DSurface`, and is released
  by its existing finalization path. A subpixel right/bottom fringe may return
  no hit.
- The developer debug method can replace the live Canvas with a stable,
  nearest-neighbor colorization of the exact current ID surface and can restore
  normal rendering.
- Normal Canvas rendering, Canvas/SVG export, WebGL, and WebGPU output are
  unchanged, and no general rasterization dependency is added.
- Selecting the Canvas backend automatically exposes software picking, while
  the minimal entrypoint contains none of its implementation until the existing
  Canvas registration entry is imported.
- SVG has no picking surface, picking read API, or software-rasterizer lifecycle.

## Risks and mitigations

- **First-hover latency:** lazy replay can produce a one-time hitch after zoom or
  data changes. Measure in Chromium; use the existing asynchronous read contract
  and sliced construction only if profiling justifies the complexity.
- **Overdraw cost:** large overlapping rectangles rewrite the same spans. Keep
  native typed-array row fills and profile before considering reverse traversal
  or tile occupancy.
- **Large logical canvases:** contiguous allocation can become material at 4K
  and above. Allocate lazily, release promptly, report allocation failures, and
  consider a measured maximum or tiled fallback only after real workloads.
- **Canvas chunk growth:** bundling the rasterizer with Canvas increases its
  optional dynamic chunk. Keep the primitive set focused, verify the minimal
  bundle exclusion, and measure the Canvas chunk delta before accepting the
  implementation.
- **Approximation surprises:** point corners, text bounds, and arrow heads may be
  pickable where no visible ink exists. Keep the regions conservative but
  bounded, visualize them through the debug mode, and document the policy.
- **Fractional logical fringe:** flooring can leave less than one CSS pixel at
  the right and bottom edges unpickable. This is accepted; keep reads bounded
  and ensure debug visualization does not stretch the last stored row or column
  over the fringe.
- **Geometry drift:** shared arrow or text refactoring could alter Canvas or SVG
  output. Keep visual geometry as the source of truth and add cross-renderer
  regression tests at the refactor boundary.
- **ID palette collisions:** diagnostic RGB colors cannot uniquely represent all
  32-bit IDs. Treat colors only as visualization; reads always use the integer
  surface.
- **Ambiguous dense piles:** painter order selects one of many coincident data.
  This matches framebuffer semantics; nearest-datum behavior is a separate
  interaction feature.

## Unresolved questions

- What Chromium rebuild-time budget should trigger asynchronous slicing? Record
  representative desktop and constrained-device results before setting a hard
  threshold.
- At what logical pixel count, if any, should Canvas refuse a contiguous picking
  allocation or switch to tiles? The decision should use observed application
  sizes rather than an arbitrary initial constant.
- Should rule/tick receive a new configurable minimum picking width, or use an
  internal parity value matching current GPU coverage? Do not expand the public
  grammar without a concrete usability requirement.
- After the replacement-canvas diagnostic mode is proven, is there a real need
  for an optional side-by-side target canvas? Keep that extension out of the
  initial API unless comparison during debugging is materially cumbersome.

# Canvas2D Renderer

## Summary

Add an interactive Canvas2D rendering backend that lets GenomeSpy launch and
remain usable when WebGL2 is unavailable. The backend also supplies raster
export in that mode. It reuses the prepared view hierarchy, collectors, CPU
encoders, resolved scales, and the backend-neutral geometry extracted from the
SVG exporter.

Keep the optional implementation out of GenomeSpy's synchronous ESM dependency
graph. Normal WebGL startup should add only renderer selection and structural
backend plumbing to statically imported runtime modules. Canvas2D mark drawing,
effects, and shared CPU geometry must be reached through dynamic imports,
following the existing SVG export boundary.

The Canvas2D backend is a compatibility renderer, not a replacement for the
WebGL renderer. Its first milestone prioritizes measurable zoom and pan
performance. Broader rendering correctness follows only if that performance
slice is promising.

## Problem

GenomeSpy currently creates `WebGLHelper` unconditionally in
`packages/core/src/genomeSpyBase.js`. If WebGL2 context creation fails, launch
fails before the visualization can be used. This affects restricted virtual
desktops where browsers and applications remain available but WebGL is disabled
by policy or lacks an acceptable implementation.

The existing raster export does not solve this problem. Despite the legacy
`exportCanvas` name, `packages/core/src/genomeSpy/canvasExport.js` renders into a
WebGL framebuffer and reads the pixels back. It therefore has the same WebGL2
requirement as the live renderer.

The SVG exporter proves that most of the runtime does not require WebGL:

- `initializeViewSubtree()` initializes collectors and CPU encoders while
  skipping graphics initialization when `context.glHelper` is absent.
- `SvgViewRenderingContext` traverses the normal prepared view hierarchy.
- The SVG mark renderers project CPU-encoded values, apply mark semantics, cull
  invisible instances, and cover every current mark type.
- Headless engine and SVG tests exercise this path without WebGL.

However, the SVG implementation creates DOM elements per visible instance and
is unsuitable for frequent interactive redraws. Canvas2D can perform immediate
raster drawing without a retained DOM tree and can use a browser software
canvas when GPU acceleration is unavailable.

## Goals

- Launch Core and App visualizations without creating WebGL or WebGPU contexts
  when Canvas2D is explicitly selected.
- Fall back to Canvas2D when automatic renderer selection cannot create a
  WebGL2 context.
- Keep layout, dataflow, scales, parameters, guides, SampleView facets,
  visibility changes, and dynamic data updates on their existing CPU paths.
- Support all current mark types: `rect`, `point`, `rule`/`tick`, `text`,
  `link`, and `arrow`.
- Preserve clipping, draw order, effective view opacity, backgrounds, axes,
  legends, titles, rulers, selections, and live chrome needed by the App.
- Support live redraw during zooming and panning and record representative
  performance before completing the backend.
- Make `imageExport.raster()` produce a PNG without WebGL when the active
  backend is Canvas2D.
- Share projection, fitting, culling, and complex geometry between SVG and
  Canvas2D without introducing per-datum allocations in render hot paths.
- Keep Canvas2D implementation modules out of the synchronous ESM dependency
  graph and quantify the main-chunk impact.

## Non-goals

- Matching WebGL performance on dense datasets.
- Pixel-identical output across WebGL, Canvas2D, and SVG.
- Replacing the WebGL renderer or changing its shader, buffer, texture, and
  batching architecture.
- Introducing a persistent per-datum scenegraph or display-object hierarchy.
- Switching renderer backends after an instance has launched.
- Moving dataflow or rendering into a worker in the initial implementation.
- Datum picking in Canvas2D mode, including mark hover, data tooltips,
  datum-targeted clicks, and point-selection hit testing. WebGL picking remains
  unchanged; Canvas picking can be designed later if rendering performance
  justifies continuing the backend.
- Guaranteeing that the browser never uses a GPU internally. Canvas2D does not
  request WebGL or WebGPU, but the browser chooses whether its output bitmap and
  page compositor are hardware- or software-backed.
- Splitting the existing single-file UMD bundle. Dynamic imports produce
  separate chunks in the ESM browser build and source-module consumers, but
  Vite/Rollup currently inline optional modules into `dist/bundle/index.js` for
  the UMD format.
- Adding a Canvas2D-forced export option to a live WebGL instance. A Canvas2D
  instance uses Canvas2D for its raster export; an explicit cross-backend export
  option can be added later if a concrete use case requires it.

## Current architecture and constraints

### Reusable CPU runtime

`packages/core/src/data/flowInit.js` already treats `glHelper` as the graphics
capability boundary. Without it, marks still receive initialized encoders and
collector notifications, but shader compilation and GPU buffer updates are
skipped. This is the correct basis for Canvas2D mode: draw directly from the
current collector batch and CPU encoders rather than adding a second data model.

Conditional encoders and resolved scale objects remain live on the CPU. A
Canvas2D redraw can therefore reflect zoom domains, parameter expressions, and
selection-dependent encodings without rebuilding WebGL buffers.

Some WebGL assumptions still need small guards or separation:

- `GenomeSpy` stores sizing, lifecycle, and export access through
  `#glHelper`.
- `RenderCoordinator` constructs only buffered WebGL visual and picking
  contexts.
- `InteractionController` imports framebuffer readback and scans views after
  decoding a WebGL picking ID.
- expression listeners registered by
  `Mark.setupExprRefsNeedingGraphicsUpdate()` call `updateGraphicsData()` even
  when no graphics backend owns GPU buffers.
- `BmFontManager` can operate without a helper for the bundled fallback metrics,
  but custom font loading still attempts to create an atlas texture.

### SVG export as the semantic reference

`packages/core/src/svg/` contains approximately 2,200 lines of mark renderers
and a 1,000-line view context. Much of the mark code reproduces semantics that
Canvas2D also needs: CPU projection, minimum-size behavior, symbol and arrow
geometry, link Bézier control points, text placement, opacity, clipping, and
culling.

The SVG context also contains concerns that should not be generalized:

- DOM group hierarchy and editor-facing metadata;
- inherited presentation attributes;
- definitions, filters, masks, and pattern IDs;
- vector instance counting and hybrid WebGL raster runs;
- export-only exclusion of scrollbars.

The sharing boundary should therefore be mark occurrences and normalized
geometry, not a universal DOM/Canvas renderer abstraction.

### Static-module and bundle constraint

`GenomeSpy.exportSvg()` dynamically imports `packages/core/src/svg/index.js`.
The current ESM browser build emits SVG into its own chunk. Use the same pattern
for `packages/core/src/canvas2d/`.

Shared CPU geometry must live in a module imported only by the lazy SVG and
Canvas2D entry points. It must not be imported by `Mark`, `UnitView`,
`RenderCoordinator`, or another module in normal WebGL startup. Rollup may emit
it as a shared lazy chunk when both optional backends use it.

The only intended synchronous runtime changes are:

- renderer option parsing and a dynamic-import branch;
- a structural surface/backend contract in JSDoc or declaration-only types;
- the smallest adaptation that lets `InteractionController` operate without a
  datum picker while preserving the existing WebGL picking path;
- small no-GL guards for existing resource update and font paths.

Before and after implementation, record source line counts for affected
synchronous modules and raw plus gzip sizes for `dist/bundle/index.es.js`. The
target is no more than 2 KiB of gzip growth in the synchronous ESM entry chunk.
Any excess must be explained and checked for an accidental static Canvas2D or
shared-geometry import.

## Comparable designs and provenance

Vega is the closest established architecture. Its scenegraph supplies Canvas
and SVG renderers, mark definitions expose drawing, SVG attributes, bounds, and
picking behavior, and geometry helpers such as the rectangle path are shared
between outputs. See the
[Vega View API](https://vega.github.io/vega/docs/api/view/) and
[`vega-scenegraph` rectangle mark](https://github.com/vega/vega/blob/main/packages/vega-scenegraph/src/marks/rect.js).

Apache ECharts supports Canvas and SVG through ZRender's shared displayable
abstraction. Its guidance recommends Canvas for larger element counts while
acknowledging that renderer choice depends on the environment. See the
[ECharts Canvas versus SVG guidance](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/)
and the [ZRender repository](https://github.com/ecomfe/zrender).

GenomeSpy should adopt the proven separation of semantic geometry from output
operations, but not their retained scenegraphs. GenomeSpy's architecture
deliberately avoids per-datum scene objects, and adding them solely for a
fallback backend would increase memory use and invalidate a central design
decision.

Vega and ZRender use the BSD 3-Clause license, which is compatible with
GenomeSpy's MIT license. This proposal does not require copying their code. If a
later implementation closely adapts a helper, preserve the source attribution
and applicable license notice near that code.

The HTML standard explicitly allows a Canvas2D bitmap to be stored on the CPU
or GPU. See the
[WHATWG Canvas specification](https://html.spec.whatwg.org/dev/canvas.html#concept-canvas-will-read-frequently).
The compatibility requirement is therefore that GenomeSpy does not request a
WebGL or WebGPU context; the browser still controls Canvas backing and page
compositing.

## Proposed design

### Renderer selection

Add this Core embed option:

```ts
renderer?: "auto" | "webgl" | "canvas";
```

Semantics:

- `"webgl"` requires WebGL2 and preserves the current launch failure when it
  cannot be created.
- `"canvas"` dynamically imports the Canvas2D backend and never requests a
  WebGL or WebGPU context.
- `"auto"` tries WebGL2 first, then removes any partially created WebGL canvas,
  dynamically imports Canvas2D, and emits one non-hot-path warning that the
  compatibility renderer is active.

Use `"auto"` as the default so existing supported environments keep WebGL while
restricted desktops become usable. Keep `powerPreference` WebGL-only.

The selected backend is fixed for the instance lifetime. Context loss after a
successful WebGL launch remains governed by the current WebGL lifecycle and is
not an implicit hot-switch trigger.

### Backend and surface contract

Replace orchestration's assumption that every surface is `WebGLHelper` with a
small structural contract. The exact ownership can be refined during the first
implementation step, but the contract must provide:

- the visible `HTMLCanvasElement`;
- logical size, physical size, and device-pixel-ratio queries;
- size invalidation and finalization;
- layout-context construction;
- visual rendering;
- raster export for the active backend.

The WebGL implementation should wrap or expose the existing `WebGLHelper` and
`RenderCoordinator` behavior rather than moving GPU code into generic modules.
The Canvas2D implementation lives wholly under the lazy module boundary.

Keep `context.glHelper` optional and WebGL-specific. Canvas2D must not provide a
fake helper. Existing initialization will then continue to skip shader and GPU
buffer work. Generic canvas sizing can reuse the existing `CanvasSizeHelper`.

Change `InteractionController` only as much as needed to accept the visible
canvas independently of `WebGLHelper` and to make its existing WebGL picking
operations optional. Canvas2D supplies no picking implementation. Coordinate-
based view and scale gestures still reach the existing interaction dispatcher,
while datum hover, data tooltips, datum clicks, and point-selection hits remain
disabled.

### Shared CPU mark occurrences

Create a lazy shared module, tentatively
`packages/core/src/rendering/cpu/`, that is imported only from the SVG and
Canvas2D feature modules.

Extract these output-neutral helpers from SVG:

- collector batch selection;
- view and anchor cull bounds;
- position and range projection;
- expression-valued mark property resolution;
- SampleView facet coordinate transforms and facet-index grouping;
- point-symbol, arrow, link, rounded-rectangle, and text-fit geometry;
- per-instance conservative bounds and visibility tests.

Organize each mark around an allocation-conscious visitor, for example:

```js
visitRectInstances(mark, occurrence, (instance, datum) => {
  // The backend consumes the reusable normalized instance synchronously.
});
```

An occurrence supplies coordinates, data, effective opacity, visible bounds,
and anchor-cull bounds. A mark visitor resolves the semantic geometry once and
reuses one mutable instance record across the loop. Backends must consume it
synchronously and must not retain it.

Do not force all marks through one oversized primitive interface. Text, links,
arrows, and rectangle effects have materially different data. Small mark-specific
instance contracts keep the shared logic explicit and let SVG and Canvas2D use
native output features.

SVG renderers remain responsible for DOM emission, presentation inheritance,
numeric formatting, definitions, warnings, and export metadata. Canvas2D
renderers remain responsible for context state, path construction, paint,
native text, patterns, shadows, and offscreen compositing.

Use a small path-command sink only where complex geometry is genuinely shared.
It may expose `moveTo`, `lineTo`, `bezierCurveTo`, and `closePath`; SVG can
serialize commands while Canvas2D forwards them to a path/context. Keep numeric
polygons as arrays where that representation is already simpler.

### Canvas2D view rendering

The lazy Canvas2D module creates a visible canvas and a 2D context. Size the
backing store in physical pixels, keep layout and geometry in logical CSS
pixels, and establish the DPR transform before drawing.

`Canvas2dViewRenderingContext` participates in the existing view traversal. It
should:

- call `view.onBeforeRender()` once per visual frame as the WebGL context does;
- maintain the current coordinates and export-exclusion state;
- derive inherited and mark clipping with existing clip utilities;
- iterate the same collector batch and SampleView facet occurrences as SVG;
- draw immediately in traversal order;
- include live scrollbars and other chrome that SVG intentionally omits;
- clear and repaint the full canvas in the first implementation.

Start with full immediate redraws. Do not add a scenegraph, dirty rectangles,
or retained layer cache before representative profiling demonstrates that the
simpler renderer is insufficient.

Canvas paint should cache the last applied fill, stroke, alpha, width, dash,
font, alignment, and composite state to avoid redundant assignments. For
constant-style marks, combine consecutive non-overlapping or order-equivalent
instances into one path when doing so preserves paint order and transparency.
Do not reorder instances by style.

The initial fidelity target is at least the SVG exporter's supported semantics,
adapted for live chrome. Unsupported or approximate properties should generate
one deduplicated backend warning per view/mark rather than per datum.

### Interaction scope

Canvas2D mode registers the existing pointer and wheel events against its
visible canvas and routes coordinate-based gestures needed for zooming and
panning. It does not create a hidden picking canvas, render picking colors,
read pixels, or build a spatial hit index.

When no picker is present, `InteractionController` must keep the current datum
hover empty, avoid requesting data tooltips, and continue dispatching view- and
scale-level interactions. The WebGL backend retains its current picking
framebuffer and behavior. This explicit asymmetry keeps the Canvas performance
slice small and prevents a second rendering traversal from distorting zoom and
pan measurements.

### Raster export

Move active-backend raster export behind the backend contract. WebGL mode keeps
the existing multisampled framebuffer export. Canvas2D mode creates a detached
Canvas2D surface at the requested logical size and pixel ratio, runs the same
Canvas2D view traversal, and calls `toBlob("image/png")`.

Do not export by serializing SVG and loading it into an image. That retains SVG
DOM construction, introduces asynchronous image decoding, complicates fonts
and external resources, and provides no reusable live renderer.

### Fonts

Keep `BmFontManager` as the source of layout metrics so guide and text layout do
not diverge by backend. Separate optional atlas-texture creation from metric
loading: Canvas2D mode loads or falls back to metrics without touching WebGL.

Canvas2D draws with the configured CSS font stack and native `fillText()` /
`strokeText()`. As with SVG export, native glyph metrics will not exactly match
the SDF bitmap metrics. Preserve the SVG text placement logic as the semantic
baseline and document the approximation.

## Performance strategy

The fallback redraw cost is proportional to visible CPU-rendered instances.
This is acceptable for a compatibility renderer but must not accidentally do
more work than SVG's CPU path.

Initial requirements:

- reuse existing clipping and conservative culling;
- avoid arrays or objects allocated per datum;
- avoid a retained scenegraph;
- perform only one visual traversal per Canvas2D frame;
- avoid unnecessary high-DPR work by using the surface's resolved backing-store
  ratio exactly once in its transform;
- batch constant-style paths only when order and compositing remain equivalent;
- record CPU render time, animation-frame interval, event-to-paint latency, and
  visible instance count rather than promise a fixed frame rate.

Benchmark at least:

- a dense rect/copy-number view;
- a large point layer;
- text-heavy axes and legends;
- a SampleView with many sample facets;
- sustained wheel zoom and drag pan at both CSS-pixel and high-DPR backing
  resolutions.

Run the first measurements as soon as live `rect` and `point` layers work. Do
not wait for every mark type, raster export, or visual effect. Record Canvas2D,
SVG, and WebGL timings for the same fixed specifications where each renderer
can run, plus Canvas2D results in the target restricted desktop. Use the result
as an explicit continue/reconsider gate before broadening the Canvas backend.

If these profiles require further work, prefer static-layer offscreen caching
before dirty rectangles or a general scenegraph. Disable or shorten expensive
transitions in Canvas2D mode only if measurements show they make interaction
unusable and the behavior is documented.

## Alternatives considered

### Rasterize an SVG export into Canvas

Rejected for live rendering. It still creates an SVG element per visible mark,
requires serialization and image decoding for updates, and does not solve
picking. It remains useful only as an unrelated one-shot conversion technique.

### Implement independent Canvas mark renderers

Rejected for production. It would duplicate the SVG exporter's CPU projection,
fitting, culling, and complex geometry and would cause backend semantics to
drift. A throwaway proof of concept may draw one mark independently, but it
must not establish the final structure.

### Put Canvas operations behind one universal SVG/Canvas painter

Rejected as the primary abstraction. SVG's retained DOM, inherited attributes,
definitions, masks, editor metadata, and hybrid raster runs do not map cleanly
to Canvas immediate mode. Sharing normalized geometry while keeping emission
native is smaller and more explicit.

### Add a retained scenegraph like Vega or ZRender

Rejected for the initial feature. It would simplify dirty drawing and geometric
picking but contradicts GenomeSpy's no-scenegraph architecture, adds per-datum
memory, and expands the synchronous runtime. The shared instance visitors leave
room for a compact Canvas-only hit index later without imposing a scenegraph on
WebGL.

### Integrate Vega, ZRender, or another renderer library

Rejected. Their display objects and mark semantics do not match GenomeSpy's
mark properties, genomic scales, SampleView facets, or view hierarchy. The
dependency and adapter cost would exceed a focused Canvas2D emitter and would
inflate optional and possibly synchronous bundles.

### Statically import Canvas2D for automatic fallback

Rejected. WebGL-capable users should not download or parse the compatibility
mark renderer on startup. Automatic fallback can await a dynamic import because
launch is already asynchronous.

### Start with OffscreenCanvas and a worker

Deferred. GenomeSpy's view hierarchy, parameters, dataflow, fonts, and DOM
interactions currently live on the main thread. Transferring draw commands or
runtime state would add substantial synchronization code before the basic
renderer is validated.

## Risks and mitigations

- **Canvas is not guaranteed CPU-only:** require only the absence of explicit
  WebGL/WebGPU use and test the actual restricted desktop. Document that the
  browser controls Canvas backing and page compositing.
- **SVG refactor changes publication output:** move semantics in small
  mark-by-mark commits and keep existing structured SVG tests and snapshots
  unchanged.
- **Canvas is too slow for large cohorts:** retain culling, avoid per-datum
  allocation, run the live performance slice before completing the backend,
  and present the mode as a compatibility fallback.
- **Canvas interaction accidentally invokes WebGL picking:** make picking
  explicitly optional at the controller boundary and test that Canvas pointer
  movement, zooming, and panning perform no framebuffer render or readback.
- **Canvas bitmap limits or memory fail on very large layouts:** validate the
  requested physical size at the surface boundary and fail with the logical
  and physical dimensions. Consider tiling only after a real failing case.
- **Text layout differs from WebGL:** keep shared BMFont metrics for layout,
  reuse SVG placement semantics, and document native-font approximation.
- **Reactive callbacks touch missing GPU resources:** audit expression,
  selection-texture, scale-texture, font-texture, and disposal paths under an
  explicit Canvas2D launch test.
- **Auto fallback leaves a failed canvas behind:** make WebGL surface creation
  transactional or explicitly finalize/remove partial DOM before importing
  Canvas2D.
- **Optional code leaks into the main ESM chunk:** add bundle verification and
  inspect Rollup output for `canvas2d/` and shared CPU modules.
- **UMD grows despite dynamic import:** document the single-file format behavior
  and report the growth. A separately loaded optional UMD renderer is a future
  packaging project, not hidden scope in this feature.

## Unresolved questions

- Which restricted virtual-desktop/browser combination is the primary
  acceptance environment? Local `--disable-gpu` browser testing is necessary
  but not sufficient evidence for its policy configuration.
- Should the App show a persistent compatibility-mode badge in addition to the
  one-time warning? Core does not currently have a renderer-status UI, so this
  requires a product decision and is not required for the initial backend.
- Does UMD download size need a separate hard budget? The initial plan budgets
  the synchronous ESM chunk and reports UMD growth without redesigning the
  distribution format.
- What zoom and pan latency is acceptable for the representative restricted
  desktop? Establish the target specification and record a go/no-go expectation
  before running the performance slice instead of inventing a universal frame
  rate for all GenomeSpy visualizations.

## Acceptance criteria

- `renderer: "canvas"` completes launch while a test fails if `getContext()` is
  called with `"webgl"`, `"webgl2"`, or `"webgpu"`.
- `renderer: "auto"` uses WebGL2 when available and launches Canvas2D after a
  controlled WebGL2 creation failure without leaving duplicate canvases.
- `renderer: "webgl"` retains the current explicit failure when WebGL2 cannot
  be created.
- Every current mark type renders through Canvas2D with clipping, effective
  opacity, draw order, and representative encoded styles.
- Axes, legends, titles, backgrounds, rulers, selection brushes, scrollbars,
  and SampleView facets are visible and positioned correctly in Canvas2D mode.
- Zoom and pan redraw without GPU-resource errors and without invoking Canvas
  picking work.
- Canvas2D mode creates no picking canvas and performs no WebGL framebuffer
  rendering, pixel readback, or datum hit testing. Datum hover, data tooltips,
  datum clicks, and point-selection hit testing are documented as unsupported.
- Parameter changes, visibility changes, and dynamic data updates redraw
  without GPU-resource errors.
- `imageExport.raster()` returns a valid PNG in Canvas2D mode without WebGL.
- Existing SVG structured-output tests remain unchanged except for intentional
  internal module paths.
- The Canvas2D renderer and shared CPU geometry are absent from the synchronous
  ESM dependency graph and emitted as optional chunks.
- Before/after raw and gzip ESM main-chunk sizes are recorded; gzip growth is at
  most 2 KiB or the implementation is revised or explicitly justified.
- Representative CPU render time, animation-frame interval, event-to-paint
  latency, visible instance count, and backing resolution are recorded for the
  zoom and pan scenarios. The initial rect/point result is reviewed before the
  remaining backend is implemented.
- Every implementation step passes the mandatory subagent review and commit
  gate before work begins on the next step. Each review includes an explicit
  KISS and simplification assessment.
- Core TypeScript checks, focused Vitest suites, lint, and browser fallback
  smoke tests pass.

## Mandatory subagent review and commit gate

Apply this gate after completing the changes and verification for every
implementation step. Steps are strictly sequential; work on the next step must
not begin until the current gate is complete.

1. Leave the completed step changes uncommitted and assign a review-only
   subagent to inspect the diff since the previous completed step. The subagent
   must not edit files.
2. Ask the subagent to review correctness, regressions, tests, relevant
   `AGENTS.md` instructions, the step's outcome and acceptance criteria, and the
   lazy-import/main-bundle constraint. The review must explicitly apply KISS
   and look for code that can be deleted, duplicated paths that can be merged,
   premature abstractions or generality, avoidable state and indirection, and a
   smaller direct design that preserves the required behavior. Pay particular
   attention to simplifying or removing additions to statically imported
   modules. Findings must identify affected files and lines, explain impact,
   and propose a concrete simplification or fix where possible. If no useful
   simplification is found, the review must state that explicitly.
3. Wait for the review to finish. Do not start exploratory or implementation
   work for the next step while the review is running.
4. Commit the reviewed step changes using the step's tentative Conventional
   Commit message, adjusted if the actual scope requires it.
5. Evaluate every review finding. Apply findings that improve correctness,
   simplicity, maintainability, verification, or bundle isolation; record a
   brief rationale for findings that are rejected or deferred.
6. Run the affected step verification again after accepted fixes. Commit those
   fixes separately with an appropriate Conventional Commit message. If no
   fixes are accepted, record that no follow-up commit was necessary.
7. Confirm that the implementation commit exists, all accepted review fixes are
   committed, required checks pass, and no changes belonging to the step remain
   uncommitted. Only then proceed to the next numbered step.

## Implementation plan

### 1. Establish the lazy backend boundary

Outcome: orchestration can select a structural rendering backend while the
current WebGL behavior remains unchanged. Canvas2D has a dynamic-import entry
point but no mark renderer yet.

Affected areas:

- `packages/core/src/types/embedApi.d.ts`
- `packages/core/src/genomeSpyBase.js`
- `packages/core/src/genomeSpy/renderCoordinator.js`
- `packages/core/src/genomeSpy/interactionController.js`
- `packages/core/src/gl/webGLHelper.js`
- backend contract types or JSDoc under `packages/core/src/types/`
- focused orchestration and interaction tests

Verification:

- WebGL-focused coordinator and interaction tests retain current behavior.
- Explicit Canvas selection reaches only a mocked dynamic backend factory and
  makes no GL context request.
- Automatic selection cleans up a failed WebGL surface before invoking the
  mocked Canvas factory.
- An interaction controller without a picker still dispatches coordinate-based
  wheel and drag gestures and never attempts framebuffer readback.
- Build output confirms the placeholder Canvas module is a separate ESM chunk.
- Record baseline and resulting synchronous source line counts and bundle
  sizes.

Recorded Step 1 measurements:

- Baseline `index.es.js`: 724,106 bytes raw and 243,616 bytes using
  `gzip -c`.
- Final Step 1 `index.es.js`: 725,336 bytes raw and 244,028 bytes using
  `gzip -c`. The synchronous ESM change is +1,230 bytes raw and +412 bytes gzip,
  below the
  2 KiB gzip budget.
- Existing affected synchronous files changed from 5,100 to 5,119 lines
  combined. The new static backend factory adds 107 lines, for +126 synchronous
  source lines in total. The seven-line Canvas2D placeholder remains in its own
  171-byte optional ESM chunk.
- Core build bundling succeeds and emits the Canvas2D chunk. Typings generation
  remains blocked by the pre-existing `gff-nostream` `GFF3Feature` and
  `generic-filehandle2`/`renameRefSeqs` type mismatches; `test:tsc` additionally
  reports the pre-existing `interactionDispatcher.test.js` view-stub mismatch.
- Focused backend, interaction, coordinator, launch, and cleanup tests pass, as
  does the full Core unit suite (1,965 passed, one skipped, and two todo).

Step 1 review gate outcome:

- The reviewed implementation was committed as `f0d02afcd` before applying
  review fixes.
- The review found and the follow-up accepts three changes: allow the existing
  no-GL view-context path during Canvas launch and type it honestly, verify
  pickerless wheel/drag routing, and make `WebGLHelper` roll back its own failed
  constructor instead of deleting a canvas from generic factory code.
- The KISS review found no other useful abstraction, rendering path, or state to
  remove. The cleanup ownership change is the accepted simplification.

Documentation and migration: add the option type and internal contract only;
defer public renderer documentation until the backend is functional. Existing
options require no migration because `"auto"` preserves WebGL where available.

Tentative commit: `refactor(core): add lazy rendering backend selection`

Step gate: complete the mandatory subagent review and commit gate before
starting Step 2.

### 2. Build the live zoom and pan performance slice

Outcome: the smallest useful live Canvas2D backend renders representative
`rect` and `point` data layers and responds to zoom and pan. Its performance is
measured before work expands to all marks, raster export, or picking.

Affected areas:

- Canvas2D surface, live view context, and renderer coordinator under
  `packages/core/src/canvas2d/`
- minimal lazy CPU visitors for `rect` and `point` under
  `packages/core/src/rendering/cpu/`
- corresponding SVG `rect` and `point` helpers/renderers
- `packages/core/src/genomeSpyBase.js`
- `packages/core/src/genomeSpy/interactionController.js`
- representative dense rect and point benchmark specifications
- a temporary browser timing harness that records reproducible measurements

Verification:

- Use the `debug-genomespy-web` workflow to verify that wheel zoom and drag pan
  update scale domains and repaint the Canvas2D surface.
- Assert that Canvas2D mode creates no WebGL/WebGPU context, picking canvas, or
  framebuffer readback.
- Measure CPU render time, animation-frame interval, event-to-paint latency,
  visible instance count, canvas size, DPR, browser version, and environment.
- Run fixed dense rect/copy-number and point scenarios at multiple instance
  counts and backing resolutions.
- Compare Canvas2D with SVG and WebGL on the same machine where possible, then
  run Canvas2D on the target restricted desktop.
- Verify the SVG rect and point structured output remains unchanged after the
  shared helper extraction.
- Record the measurements and the continue/reconsider decision before starting
  Step 3. If performance is not useful, stop broadening the renderer and revise
  or retire the remaining plan.

Reproduction procedure:

- Start the Core development server with
  `npm -w @genome-spy/core run dev`, open Chromium at a 900 x 420 viewport, and
  use the normal headless launch defaults without custom GPU flags.
- In the browser console, load the retained development-only harness with
  `const { runCanvas2DBenchmark } = await import("/canvas2d/canvas2DBenchmark.js")`.
- Rect rows use `canvas-dense-rects.json`, instance counts 10,000, 25,000, and
  50,000, `fullDomain: [0, 1000]`, and `zoomDomain: [100, 900]`. Point rows use
  `canvas-dense-points.json`, instance counts 25,000, 50,000, and 100,000,
  `fullDomain: [0, 100000]`, and `zoomDomain: [10000, 90000]`.
- Call `runCanvas2DBenchmark` with the matching spec URL and domains. The
  harness performs 20 alternating warmups and 100 measured redraws. Each
  sample first restores the full domain without timing it and then times the
  zoom-domain `zoomTo` call with `{ duration: 0, renderImmediately: true }`.
  It reports p50/p95, browser identity, DPR, logical size, and backing size.
- For the DPR 2 fallback check, start the browser with device scale factor 2,
  disable `devicePixelContentBox` support in the page before launch, and verify
  the reported backing size is 1,800 x 840 before accepting the result.
- For interaction timing, warm up with five wheel and five drag gestures, then
  record 30 real gestures of each kind. Start at event dispatch and stop on the
  next animation-frame callback; verify `benchmark-x` changes and Canvas draw
  calls increase. This is an event-to-following-RAF proxy, not compositor
  instrumentation. The permanent live test repeats the domain and repaint
  assertions without platform-sensitive timing thresholds.

Recorded Step 2 measurements (pre-review):

- Environment: headless Chromium 151 on macOS, 900 x 420 logical pixels. Every
  Canvas run requested only `getContext("2d")`; no WebGL, WebGPU, picking canvas,
  or framebuffer readback was created.
- DPR 1 synchronous redraws, measured with zero-duration
  `zoomTo(..., { renderImmediately: true })` after warmup:

  | Mark  | Total instances | Visible instances |     p50 |     p95 |
  | ----- | --------------: | ----------------: | ------: | ------: |
  | rect  |          10,000 |             8,020 |  2.6 ms |  3.1 ms |
  | rect  |          25,000 |            20,050 |  6.4 ms |  6.8 ms |
  | rect  |          50,000 |            40,100 | 13.3 ms | 13.8 ms |
  | point |          25,000 |            15,125 |  4.2 ms |  4.5 ms |
  | point |          50,000 |            40,125 | 10.6 ms | 11.1 ms |
  | point |         100,000 |            80,251 | 21.8 ms | 23.1 ms |

- A DPR 2 fallback-path run used a real 1,800 x 840 backing store. The 50,000
  rect case measured 12.2/13.0 ms p50/p95 and the 100,000 point case measured
  20.9/21.4 ms. Headless Chromium's device-pixel-content-box emulation reports
  CSS pixels, so the high-DPR run disabled that observer and exercised the
  existing `window.devicePixelRatio` fallback explicitly.
- Idle animation-frame intervals were 8.3/8.8 ms p50/p95 for the rect run and
  8.3/9.5 ms for points. Real Playwright wheel and drag gestures changed the
  named x domain and repainted. Event-to-following-RAF latency was 25.4/55.5 ms
  for rect wheel, 21.1/25.3 ms for rect drag, 41.1/75.3 ms for point wheel, and
  28.7/41.2 ms for point drag. This following-RAF value is a browser paint
  proxy, not compositor instrumentation.
- Same-machine references at DPR 1: WebGL synchronous command submission was
  0.0/0.1 ms p50/p95. SVG export traversal was 65.1 ms p50 for the current rect
  viewport and 93.9 ms for points; SVG is a non-interactive reference.
- Continue decision: proceed. The simple immediate renderer is already useful
  at tens of thousands of visible instances and stays well below SVG traversal
  time without a scenegraph, retained display list, or Canvas picking. The
  target restricted virtual desktop still needs a repeat run before support is
  declared; the current environment cannot reproduce that machine policy.
- Verification before the Step 2 review: all 385 repository test files pass
  (3,216 tests passed, one skipped, and two todo), lint passes, Core JavaScript
  and Vite bundling pass, and minimal-bundle verification passes. Type checking
  reports only the three pre-existing `GFF3Feature`, `renameRefSeqs`, and
  `interactionDispatcher.test.js` errors recorded in Step 1.
- The production ESM main chunk is 722,863 bytes raw and 243,349 bytes using
  `gzip -c`, smaller than after Step 1 because Rollup extracted shared dynamic
  code. The Canvas entry chunk is 7,666 bytes raw / 2,655 bytes gzip and the
  rect CPU visitor shared by the dynamic SVG and Canvas paths is 7,084 bytes /
  2,672 bytes. Minimal-bundle verification confirms that Canvas remains absent
  from the synchronous entry. Step 2 adds only four net source lines to the
  existing synchronous runtime files (`GenomeSpyBase`, `Mark`, and the view
  context type); the implementation itself remains dynamically loaded.

Step 2 review gate outcome:

- The reviewed implementation was committed as `825dd68a3` before applying
  review fixes.
- The review found one production defect: the view-context factory dropped the
  Canvas capability that suppresses GPU buffer updates for expression-backed
  properties. The follow-up propagates the capability and exercises it through
  the real factory and a launched Canvas instance.
- The follow-up also retains the exact redraw harness and gesture assertions,
  caches requested color strings in hot mark loops, moves the mark-data tests
  to their shared CPU owner, and removes the dead point radius field.
- The KISS review rejected extracting the two tiny Canvas style helpers because
  that would add indirection without removing meaningful complexity.

Documentation and migration: no public documentation yet. Record the benchmark
specifications, environment, results, and decision in the working plan and the
eventual PR notes so the feasibility decision remains reviewable.

Tentative commit: `feat(core): add Canvas2D zoom and pan performance slice`

Step gate: complete the mandatory subagent review and commit gate, including
the performance continue/reconsider decision, before starting Step 3.

### 3. Complete shared geometry and Canvas2D mark drawing

Outcome: after a positive performance decision, SVG keeps its structured output
while all current mark types render through the shared lazy CPU geometry and
Canvas2D emitters.

Affected areas:

- remaining modules under `packages/core/src/rendering/cpu/`
- `packages/core/src/rendering/cpu/markData.js`
- `packages/core/src/svg/svgBounds.js`
- `packages/core/src/svg/svgMarkUtils.js`
- `packages/core/src/svg/renderers/*.js`
- `packages/core/src/svg/svgViewRenderingContext.js`
- remaining Canvas2D mark renderers under `packages/core/src/canvas2d/`
- `packages/core/src/fonts/bmFontManager.js`
- Canvas command-recorder tests and a small number of browser pixel smoke tests

Verification:

- Move one mark at a time and run its focused SVG and Canvas suites.
- Use the `test-genomespy-views` workflow for representative structured SVG and
  example output.
- Preserve existing SVG snapshots and warning behavior.
- Use a fake/recording 2D context for stable assertions about representative
  paths, paint, clipping, text transforms, and draw order.
- Do not rely primarily on platform-sensitive full-image pixel snapshots.
- Render representative rect, point, rule/tick, text, link, arrow, gradient,
  hatch, shadow, and SampleView cases.
- Assert that no twgl or WebGL API is called.
- Measure per-frame allocations in dense mark loops during profiling.
- Confirm shared CPU files remain in a lazy chunk and do not enter
  `index.es.js`.
- Compare relevant line counts before and after; extraction should reduce or
  hold the combined SVG semantic code size rather than add a parallel path.

Recorded Step 3 results (pre-review):

- Canvas2D now draws every current Core mark type: `rect`, `point`, `rule`
  (including the `tick` alias), `link`, `text`, and `arrow`. Axes therefore use
  the same rule/text emitters rather than a separate Canvas guide path.
- Rule ranges, link Bezier control points, arrow polygons and overlap unions,
  and all text formatting/range placement/rotation/culling live in the lazy
  `rendering/cpu` layer and feed both SVG and Canvas emitters. The Canvas hot
  loops retain immediate traversal and local requested-style caches.
- The command-recorder coverage launches one Canvas instance containing all
  mark types, verifies representative line, Bezier, closed-path, text, rect,
  and arc commands, and still observes only one `getContext("2d")` request.
  Focused tests also cover SampleView row projection and the warned base-rect
  fallback for unsupported hatches, shadows, and rounded corners.
- All 21 focused SVG/Canvas files pass (116 tests). Existing structured SVG
  link, rule, text, arrow, point, and rect output tests remain unchanged.
- A Chromium desktop smoke test at a 900 x 500 viewport rendered all six mark
  types together with generated axes. It created one canvas, requested only a
  `2d` context, and produced a non-empty 917 x 472 backing store. A synchronous
  named-scale zoom changed `[0, 1]` to `[0.1, 0.9]` and changed the canvas
  bitmap. The only page diagnostics were Lit development mode, a missing
  favicon, and the expected embedded-font fallback warning.
- Vite and minimal-bundle builds pass. The synchronous `index.es.js` remains
  722.90 kB, so Step 3 adds nothing to the static entry. The Canvas dynamic
  chunk is 12.94 kB / 4.39 kB gzip, the shared text chunk is 20.45 kB / 6.91 kB
  gzip, and the SVG chunk shrank from 45.34 kB / 14.54 kB gzip after Step 2 to
  34.46 kB / 10.89 kB gzip.
- The four moved SVG semantic renderers plus the existing Canvas rect/point
  files and index were 1,787 lines before Step 3. The corresponding SVG and
  Canvas emitters plus five new shared CPU modules are now 2,315 lines, a net
  528-line cost for four additional Canvas emitters. Within that total, the
  four SVG renderers shrink from 1,549 to 503 lines because geometry now has
  one owner.

Step 3 review gate outcome:

- The reviewed implementation was committed as `4a5f4e9b4` before applying
  review fixes.
- The review found two fidelity defects: Canvas logo letters did not normalize
  native glyph width to the encoded cell, and non-default font metrics still
  attempted to create a WebGL texture. The follow-up normalizes measured glyph
  width and loads metrics without a texture when no WebGL helper exists.
- The review also restores an allocation-free arrow count-only fast path, adds
  exact command-recorder assertions for rule, link, text, arrow, and reversed
  logo ranges, and updates the SVG architecture description.
- The KISS review removed the one-consumer text-anchor visitor and the second
  link control-point array. Text projection now reuses its range, layout, and
  instance records rather than allocating intermediate objects for every
  datum.
- Chromium 149 sampling-heap profiles used a 4 KiB interval after warmup. One
  hundred alternating redraws of 50,000 rects and 100,000 points, and 40
  redraws of 25,000 links, sampled no allocation attributed to Canvas2D or the
  shared CPU visitors. The initial dense-text profile sampled 4,128 bytes in
  `visitTextInstances`; after reusing its helper results, the same 40 redraws
  of 25,000 ranged text instances sampled none. Heap-profiler timings are not
  comparable to the uninstrumented Step 2 benchmark.
- Final verification passes all 385 repository test files (3,223 tests passed,
  one skipped, and two todo), lint, the Core production build, and minimal-
  bundle verification. Type checking still reports only the three pre-existing
  `GFF3Feature`, `renameRefSeqs`, and `interactionDispatcher.test.js` errors.
  The synchronous ESM entry remains 722.93 kB; Canvas2D remains an 11.53 kB /
  3.78 kB gzip optional chunk, with shared text geometry in a separate optional
  chunk.

Documentation and migration: update `packages/core/src/svg/README.md` to point
to the shared CPU geometry layer. No user migration.

Tentative commit: `feat(core): complete Canvas2D mark rendering`

Step gate: complete the mandatory subagent review and commit gate before
starting Step 4.

### 4. Add raster export and complete fallback integration

Outcome: explicit and automatic Canvas2D modes cover the non-picking live
renderer in Core and App, and Canvas2D raster export produces a PNG without
WebGL.

Affected areas:

- detached Canvas2D export surface under `packages/core/src/canvas2d/`
- `packages/core/src/genomeSpy/canvasExport.js` or a replacement active-backend
  export adapter
- `packages/core/src/genomeSpyBase.js`
- `packages/core/src/genomeSpy/interactionController.js`
- `packages/core/src/marks/mark.js`
- optional GL resource guards in scale, selection, font, and disposal paths
- Core/App fallback and export tests

Verification:

- Use the `debug-genomespy-web` workflow with a browser that rejects WebGL2.
- Verify initial layout, resize, zoom/pan, visibility changes, and dynamic data
  updates.
- Exercise Canvas2D App SampleView facets and live scrollbars.
- Verify pointer movement and clicks do not request picking or throw when no
  datum picker is available.
- Repeat the representative zoom and pan timing scenarios after all mark types
  are present and compare them with the Step 2 baseline.
- Decode the raster-export Blob header and verify PNG dimensions and
  transparency or configured background.
- Assert that raster export calls neither twgl nor a WebGL/WebGPU API.
- Confirm a failed automatic WebGL attempt leaves only the Canvas2D surface in
  the container.

Recorded Step 4 results (pre-review):

- Raster export is an active-backend operation. The WebGL backend retains its
  multisampled framebuffer path, while the Canvas2D backend renders the view
  into a detached canvas using the same immediate traversal as the live
  surface. The deprecated synchronous data-URL export also works in Canvas2D
  mode.
- A real Chrome 151 run rejected `webgl2`, `webgl`, and
  `experimental-webgl`, fell back automatically to one live Canvas surface,
  updated a declared dataset, and exported without any further GPU-context
  request. The PNG Blob had the standard eight-byte PNG signature, decoded to
  the requested 160 x 80 physical pixels, and had alpha zero in the transparent
  corner.
- The live fallback test covers resize-independent backing dimensions, dynamic
  named-data repaint, a newly visible view, pointer movement and a null-datum
  click without picking, Canvas PNG export, and the legacy data-URL export. The
  focused export test also covers configured background paint and MIME
  rejection before a context is created.
- The App initially exposed one remaining GPU assumption in SampleView's facet
  texture upload. `LocationManager` now keeps CPU facet positions current but
  skips the texture upload when no GL helper exists. A real App run rendered
  120 sample facets and a nonempty 1,000 x 560 Canvas bitmap with no page
  errors. Its vertical scrollbar had valid 8 x 490 geometry; close-up mode and
  a real wheel event changed the scroll offset from 0 to 300 and updated the
  scrollbar thumb to 8 x 57.63 pixels.
- The retained Chrome 151 benchmark (20 warmups, 100 redraws, DPR 1, 900 x 420)
  measured 50,000 rects at 8.6/8.8 ms and 100,000 points at 13.2/13.4 ms
  p50/p95. Both are faster than the Step 2 results in the same browser version
  (13.3/13.8 ms and 21.8/23.1 ms respectively), so completing the remaining
  mark dispatch and export did not regress the performance slice.
- All 386 repository test files pass (3,230 tests passed, one skipped, and two
  todo). Lint, Core and App builds, App test type checking, and minimal-bundle
  verification pass. Core type checking still reports only the three known
  `GFF3Feature`, `renameRefSeqs`, and `interactionDispatcher.test.js` errors.
- The synchronous Core ESM entry is 723.04 kB, up 0.11 kB from Step 3. Existing
  statically loaded Core/App production modules gain five net source lines; the
  102-line detached traversal/export implementation stays in the optional
  Canvas chunk. That chunk is 12.93 kB / 4.15 kB gzip.

Documentation and migration: no migration. Decide whether App needs a visible
compatibility-mode indicator; otherwise use a one-time warning.

Tentative commit: `feat(core): complete Canvas2D fallback and raster export`

Step gate: complete the mandatory subagent review and commit gate before
starting Step 5.

### 5. Complete documentation, bundle checks, and compatibility coverage

Outcome: the renderer is public, its limitations are clear, and synchronous
bundle growth is protected.

Affected areas:

- Core instance/API documentation under `docs/api/`
- getting-started or troubleshooting documentation for restricted desktops
- `packages/core/src/svg/README.md` and a Canvas2D subsystem README
- bundle verification scripts under `packages/core/scripts/`
- final Core/App fallback smoke tests

Verification:

- Use the `write-genomespy-docs` workflow for user-facing documentation.
- Build Core and verify Canvas2D/shared CPU modules are optional ESM chunks.
- Record before/after raw and gzip sizes for `index.es.js`, the Canvas2D chunk,
  shared CPU chunk, and the single-file UMD output.
- Run focused suites during iteration, workspace TypeScript checks, lint, and
  the full unit suite because the final integration touches launch, rendering,
  and interaction.
- Smoke-test at least one real restricted virtual desktop in addition to local
  browser GPU disabling before calling the compatibility goal complete.

Documentation and migration: document `renderer`, automatic fallback,
Canvas2D performance expectations, native-font differences, Canvas backing
caveat, raster export behavior, and the absence of datum picking, data
tooltips, datum clicks, and point-selection hit testing. Existing embeds need no
changes.

Tentative commit: `docs(core): document Canvas2D compatibility rendering`

Step gate: complete the mandatory subagent review and commit gate before
declaring the implementation plan complete.

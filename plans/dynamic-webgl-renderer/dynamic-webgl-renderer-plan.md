# Dynamically loaded legacy WebGL renderer plan

Status: Planned

## Context

Canvas2D, SVG, and the experimental WebGPU integration are already isolated
under `packages/core/src/rendering/` and loaded only when needed. The WebGL
renderer remains a transitional exception. Its surface and coordinator are
selected in `rendering/renderingBackend.js`, but its implementation is spread
through `src/gl/`, `src/genomeSpy/`, `src/fonts/`, the buffered rendering
context, and the semantic mark classes under `src/marks/`.

The tightest coupling is in `marks/mark.js` and the concrete mark classes.
They combine backend-neutral mark configuration and encoder state with TWGL
buffers, GLSL generation, programs, uniforms, textures, draw callbacks, and
resource disposal. `ViewContext.glHelper`, WebGL font textures, range and
selection textures, picking, framebuffer export, and hybrid SVG rasterization
extend that dependency into otherwise shared Core code.

The legacy implementation is expected to be deleted after WebGPU and Canvas2D
cover the required production behavior. This project therefore prioritizes
output compatibility, approximately unchanged WebGL performance, and a clean
dynamic module boundary. It does not attempt to turn the legacy renderer into
a polished reusable package.

The transition must preserve explicit selection of either GPU renderer.
Choosing WebGL loads the legacy WebGL module; choosing WebGPU loads the
existing WebGPU module. This project does not alter `webgpu-renderer` or Core's
WebGPU adapter.

Raster export and hybrid SVG rasterization must use the best usable raster
capability in this order:

1. WebGL
2. WebGPU
3. Canvas2D

"Usable" means that the selected live backend already exposes the requested
capability, or that the detached Canvas2D fallback can be initialized. The
export path must not initialize a second, unselected GPU renderer merely to
change raster backends: Core marks currently initialize resources for one GPU
backend, and duplicating that lifecycle would add complexity and memory use.
If no candidate supports the operation, rasterization is unavailable.

WebGPU currently supports its existing full raster-export path but not
selective hybrid-SVG rasterization. That missing capability is tracked in
[issue #483](https://github.com/genome-spy/genome-spy/issues/483). Until it is
implemented separately, hybrid SVG export from a WebGPU-rendered instance may
fall through to Canvas2D. No WebGPU implementation changes belong in this
project.

## Goals

- Remove WebGL, TWGL, and GLSL modules from Core's synchronous ESM entry graph.
- Load the legacy WebGL implementation only when WebGL is selected.
- Preserve `auto`, explicit `webgl`, explicit `webgpu`, and explicit `canvas`
  renderer behavior and failure semantics.
- Preserve WebGL rendering, picking, interaction, dynamic-data, font, scale,
  selection, export, and cleanup behavior.
- Keep backend-neutral mark semantics statically available to Canvas2D, SVG,
  headless workflows, and the existing WebGPU adapter.
- Route raster export and hybrid SVG rasterization through small optional
  backend capabilities instead of passing `WebGLHelper` through generic APIs.
- Add Canvas2D hybrid-rasterization support so SVG export retains a raster
  fallback when WebGL is not selected and WebGPU lacks the capability.
- Keep per-frame WebGL scheduling and draw batching approximately as fast as
  the current implementation.
- Establish reproducible Core and App visual baselines before changing the
  renderer, and compare the completed refactor against them.
- Make eventual WebGL deletion local: remove its dynamic factory/module and
  related tests without redesigning Core again.

## Non-goals

- Changing any code in `packages/webgpu-renderer/` or
  `packages/core/src/rendering/webgpu/`.
- Implementing WebGPU hybrid SVG rasterization or improving WebGPU raster
  export; issue #483 owns that work.
- Changing renderer preference policy or automatically preferring WebGPU.
- Initializing both GPU renderers for one GenomeSpy instance.
- Rewriting, optimizing, documenting, or polishing the legacy WebGL renderer
  beyond what is necessary for extraction.
- Introducing a public renderer-plugin API or a general-purpose scene graph.
- Changing the specification grammar, schema, visual defaults, or public
  renderer option values.
- Replacing the deprecated synchronous `exportCanvas()` API. It remains tied
  to the selected live backend.
- Guaranteeing a smaller UMD compatibility bundle. Rollup must inline dynamic
  modules for UMD/IIFE output; the ESM build and source-module graph are the
  code-splitting targets.

## Key decisions

### One internal WebGL module with a narrow factory boundary

Create `packages/core/src/rendering/webgl/index.js` as the only runtime entry
into the legacy implementation. `renderingBackend.js` dynamically imports this
module when `webgl` is explicitly selected or when `auto` tries WebGL.

The module owns the existing WebGL surface, render coordinator, picking,
buffered draw batching, framebuffer export/readback, shader and texture
helpers, and WebGL-specific per-mark implementations. Existing code should be
moved with minimal behavioral rewriting. Internal WebGL files may remain split
for readability, but nothing outside the dynamic module may statically import
them.

The factory returns the existing `RenderingBackend` shape plus optional raster
capabilities. Core must not expose the new internal module as a public package
subpath.

### Semantic marks remain Core-owned

`UnitView` must continue constructing the same statically imported semantic
mark classes. Canvas2D, SVG, headless tests, debugging, and the WebGPU adapter
depend on their configuration, encoders, properties, facet data, rendering
revisions, and semantic helpers.

Move WebGL-only state and operations out of these classes into backend-owned
per-mark delegates. Prefer one small internal lifecycle contract over a new
class hierarchy. The existing mark lifecycle methods may remain as thin
forwarders so dataflow and view initialization do not need a broad rewrite.
The WebGL module may store delegates in a `WeakMap<Mark, WebGLMarkState>` or an
equally direct backend-owned structure.

The lifecycle must cover only behavior already present:

- shader/program initialization and deferred compilation checks;
- vertex-buffer creation and compatible-capacity updates;
- dynamic uniform, scale, selection, and placement resource updates;
- normal and picking draw callback construction;
- mark debug information needed by existing tools; and
- complete resource disposal.

Backend-neutral property and encoder resolution stays on the semantic mark.
Avoid copying mark semantics into the WebGL module.

### Remove WebGL escape hatches from shared context

Replace direct `ViewContext.glHelper` and `graphicsDataUpdates` decisions with
the minimal renderer-resource lifecycle needed by mark/data initialization.
Headless, Canvas2D, and WebGPU contexts use a no-op or absent capability.

WebGL-specific scale-range, selection, placement, and font-texture updates must
be handled by the WebGL resource owner rather than by shared planners or font
loading code. `BmFontManager` remains responsible for metrics and bitmap URLs;
the WebGL module owns conversion of those bitmaps into WebGL textures.

This is the main architecture review gate. The contract must remain small and
must not expose WebGL types, TWGL objects, shaders, or backend-specific resource
layouts.

### Rasterization is an optional capability

Separate live rendering from optional raster operations. Core should discover
capabilities in the requested order without depending on `glHelper`:

- full raster export;
- selective transparent rendering of the mark runs chosen by SVG export.

The live WebGL backend implements both capabilities inside its dynamic module.
The existing WebGPU backend remains unchanged and contributes only its existing
full raster-export method. Canvas2D contributes full export and gains
selective-run rendering using the existing immediate renderer plus a mark
predicate.

SVG remains responsible for instance counting, run selection, placeholders,
bounds, cropping, paint order, and warning collection. A raster backend only
paints the requested marks into a transparent raster result. WebGL may retain
its reusable framebuffer implementation; Canvas2D may use a detached canvas.

Candidate initialization or unsupported-capability errors may fall through to
the next candidate. Once a capable backend starts rendering, rendering errors
must propagate rather than being hidden by another backend.

When no raster capability exists:

- `imageExport.raster()` rejects with an explicit unsupported-rasterization
  error; and
- hybrid SVG export returns the vector SVG, reports a warning, and reports no
  rasterized runs.

### Preserve the hot path

Dynamic loading and delegate lookup happen during initialization or resource
updates, not repeatedly inside individual vertex or instance loops. The
existing `RenderCoordinator`, `BufferedViewRenderingContext`, ordered batch,
draw callbacks, framebuffer reuse, and TWGL buffer-capacity behavior should
move intact wherever possible.

Measure representative launch, layout, render, pan/zoom, and picking behavior
before and after. Small noise is acceptable; a consistent regression requires
investigation before completion.

Reuse the existing generic App interaction benchmark rather than creating a
WebGL-specific microbenchmark. Although its files retain WebGPU-oriented names,
`packages/core/scripts/runWebGpuInteractionBenchmark.mjs` supports `webgl`,
`webgpu`, or both. It combines low-overhead animation cadence with Core's
private performance profiler, optional Chromium traces, interaction
correctness controls, repeated runs, and same-backend A/A noise estimation.
The WebGPU renderer contributes profiler counters through the shared private
symbol, but its instrumentation remains unchanged in this project.

Run both renderers in the baseline and final matrices. WebGL is the subject of
the comparison; unchanged WebGPU results provide a useful within-run
environmental control. Fix the acceptance tolerance from the baseline before
implementation as `max(5%, same-backend A/A relative noise bound)`, following
the benchmark's existing methodology. Use a headed hardware-backed browser;
headless or software-rendered results are diagnostic only.

### ESM is the code-splitting contract

The production ESM entry must reference WebGL only through a dynamic chunk.
Canvas2D and SVG must remain dynamically isolated, and the development-only
WebGPU adapter must remain absent from production output as it is today.

The UMD build remains a compatibility artifact. Its format cannot preserve
separate runtime chunks, so it may contain the WebGL implementation even
though the source uses a dynamic import. This constraint must be documented in
the architecture and asserted deliberately in bundle tests rather than being
mistaken for a failed extraction.

## Comparable designs and provenance

PixiJS's `autoDetectRenderer` probes an ordered WebGL/WebGPU/Canvas preference
list and dynamically imports only the chosen renderer. GenomeSpy follows that
proven selection shape but retains its own backend and lifecycle contracts.
PixiJS is MIT-licensed.

- https://github.com/pixijs/pixijs/blob/dev/src/rendering/renderers/autoDetectRenderer.ts
- https://github.com/pixijs/pixijs/blob/dev/LICENSE

Vega keeps renderer selection and registration separate from view semantics,
which supports GenomeSpy's decision to keep semantic marks outside renderer
modules. Vega is BSD-3-Clause licensed.

- https://github.com/vega/vega-view
- https://github.com/vega/vega/blob/main/LICENSE

No source code will be copied or closely adapted from either project, so no
third-party notice or nearby provenance comment is required.

## Alternatives considered

### Dynamically import complete mark subclasses

Rejected because Canvas2D, SVG, headless workflows, and WebGPU need the same
semantic mark objects before any GPU renderer is selected. It would duplicate
mark definitions or make view construction asynchronous and backend-specific.

### Add a general renderer plugin framework

Rejected as unnecessary abstraction for a temporary renderer. A private
factory and one small resource lifecycle are sufficient.

### Move helpers but leave WebGL state on semantic marks

Rejected because static imports from mark classes would keep TWGL, GLSL, and
most WebGL code in the synchronous entry graph. It would also leave WebGL
ownership scattered and make eventual deletion difficult.

### Initialize WebGL on demand only for raster export

Rejected because a WebGPU-rendered instance does not initialize WebGL mark
programs, buffers, fonts, selections, or dynamic-data updates. Maintaining two
GPU resource graphs would add lifecycle and memory costs that conflict with
the temporary, low-bloat goal.

### Keep hybrid SVG rasterization WebGL-only

Rejected because rasterization must remain available when another renderer is
selected. Canvas2D can provide the required detached selective rendering with
much less risk than changing WebGPU in this project.

### Require byte-identical generated PNG files everywhere

Rejected as the only acceptance rule because fonts, remote data, browser
versions, and GPU rasterization can introduce nondeterminism. Establish
same-environment repeatability first; use exact equality for stable examples
and reviewed pixel statistics or live inspection for known unstable cases.

## Milestone 1: Establish visual, bundle, and performance baselines

### Intended outcome

The current WebGL implementation has reproducible reference artifacts and
measurements before production code moves.

### Work

- [ ] Record the current branch revision, Node/npm versions, Playwright
      Chromium version, operating system, and device-pixel-ratio settings used
      for baselines.
- [ ] Make the Core screenshot command explicitly select `webgl` while
      preserving its current dimensions, readiness waits, and sibling-PNG
      behavior.
- [ ] Run the complete curated Core screenshot capture twice with overwrite.
      Investigate examples that differ between identical runs and document or
      isolate unavoidable instability.
- [ ] Review refreshed sibling PNGs and commit legitimate baseline changes
      separately from renderer code.
- [ ] Capture the two required private App specifications with the App harness
      at a fixed DPR and at least its existing 1200 x 700 frame. Add
      configurable dimensions before capture if either visualization needs a
      1600 x 1000 or 1920 x 1080 frame.
- [ ] Preserve ignored/local baseline artifacts for:
      `private/genomespy-paper-2024-spec/spec.json` and
      `private/MCCA-visualization/web/specs/spec.json`.
- [ ] Open both private specifications in the normal App at a 1920 x 1080
      viewport with `renderer=webgl`. Record representative zoom, pan, hover,
      tooltip, picking, resize/scroll, and App interaction checks.
- [ ] Record Core ESM/UMD bundle sizes, the synchronous-entry module set, and
      the WebGL-heavy source inventory.
- [ ] Run the existing authoritative App interaction benchmark matrix in a
      headed hardware-backed Chromium session with both WebGL and WebGPU, the
      private MCCA specification, the small App control specification, five
      counterbalanced repetitions, all six interaction cases, and DPR 1.
- [ ] Retain `summary.json`, `baseline.md`, and traces in an ignored baseline
      output directory. Confirm every required interaction/correctness control
      completes, inspect the actual GPU adapters, and fix the practical WebGL
      equivalence tolerance before implementation.

### Affected areas and consumers

- `packages/core/scripts/captureScreenshots.mjs`
- `packages/core/src/screenshotHarness.js`
- the existing App screenshot harness and WebGPU example runner, if dimension
  configuration is needed
- `packages/core/scripts/runWebGpuInteractionBenchmark.mjs`, its README, and
  Core's private performance profiler, used unchanged except for fixes proven
  necessary by the baseline run
- `packages/webgpu-renderer/src/renderer.js` profiler hooks, consumed without
  modification
- tracked PNGs under `examples/core/` and `examples/docs/`
- ignored artifacts under `output/`

Production rendering is unchanged in this milestone.

### Verification

- Two consecutive baseline runs agree for every example classified as stable.
- Every curated Core example initializes without browser, console, or HTTP
  errors.
- Both private App examples reach ready state, produce nonempty large
  screenshots, and pass the recorded live interaction checks.
- Baseline artifacts identify the exact renderer and environment.
- The MCCA interaction matrix completes with authoritative environment
  metadata, an A/A noise bound, cadence statistics, phase/counter snapshots,
  correctness controls, and traces for both renderers.

### Documentation and migration

Keep baseline instructions in the temporary plan or script help. No
user-facing documentation is required.

Tentative commit: `test(core): establish WebGL rendering baselines`

## Milestone 2: Introduce backend-neutral raster capabilities

### Intended outcome

Raster export and hybrid SVG no longer receive a `WebGLHelper`, and Canvas2D
provides the selective fallback needed when WebGL is not selected.

### Work

- [ ] Define the smallest internal optional capabilities for full raster
      export and selective SVG-run rasterization.
- [ ] Resolve usable capabilities in WebGL, WebGPU, Canvas2D order while never
      initializing a second GPU renderer.
- [ ] Adapt the existing WebGL export and SVG framebuffer code to the
      capability without changing its output or framebuffer reuse.
- [ ] Add a mark predicate or selected-mark set to Canvas2D rendering and
      implement transparent selective-run rasterization, cropping, and PNG
      embedding.
- [ ] Remove `webGLHelper` from `createSvgExport()` and GenomeSpy's SVG export
      call site.
- [ ] Preserve WebGPU's existing full `exportRaster` behavior without editing
      the WebGPU adapter; treat selective rasterization as unsupported and fall
      through to Canvas2D.
- [ ] Implement explicit no-capability behavior for full raster and hybrid SVG
      export.
- [ ] Keep synchronous `exportCanvas()` behavior unchanged.

### Affected areas and consumers

- `packages/core/src/genomeSpyBase.js`
- `packages/core/src/rendering/renderingBackend.js`
- `packages/core/src/rendering/svg/`
- `packages/core/src/rendering/canvas2d/`
- existing WebGL framebuffer/export files before their later move
- embed API export tests and App image-export consumers

No files under either WebGPU directory are changed.

### Verification

- Unit tests cover candidate priority, unsupported capabilities, initialization
  failures, render-error propagation, and cleanup.
- WebGL and Canvas2D full PNG exports preserve requested logical dimensions,
  pixel ratio, transparency/background, and MIME validation.
- Hybrid SVG tests cover contiguous paint runs, selected marks, transparent
  pixels, crop bounds, image placement, and document order for WebGL and
  Canvas2D.
- A WebGPU-selected instance uses its unchanged full raster export and falls
  through to Canvas2D for hybrid SVG.
- With all raster capabilities disabled or unavailable, full raster export
  rejects and SVG export returns vectors plus one clear warning.

### Documentation and migration

Update `docs/api/instance.md` if the documented active-backend wording or
unsupported behavior changes. No specification/schema migration is required.

Tentative commit: `refactor(core): select rasterization by backend capability`

## Milestone 3: Consolidate legacy WebGL ownership

### Intended outcome

All runtime WebGL implementation code is owned by
`packages/core/src/rendering/webgl/`, while shared Core and semantic marks have
no static TWGL, GLSL, or `WebGLHelper` dependency.

### Work

- [ ] Add the minimal renderer-resource lifecycle to the backend/view context
      and retain thin mark lifecycle forwarders where they avoid dataflow
      churn.
- [ ] Split backend-neutral mark configuration, encoders, properties, facet
      data, revisions, and debug semantics from WebGL programs, uniforms,
      buffers, vertex construction, and draw operations.
- [ ] Move each concrete mark's WebGL shader and geometry implementation into
      the WebGL module without changing generated shader source or draw order.
- [ ] Move the WebGL render coordinator and buffered rendering context under
      the module; keep backend-neutral layout and composite traversal shared.
- [ ] Move `WebGLHelper`, GLSL generation/includes, color/range/selection and
      placement textures, framebuffer readback, and legacy canvas export under
      the module.
- [ ] Separate font metrics/bitmap loading from WebGL texture creation and make
      the WebGL module own font textures.
- [ ] Move range-texture and selection-texture reactions out of shared view and
      resolution code into the WebGL resource owner.
- [ ] Preserve hidden-view lazy initialization, dynamic data updates, shared
      placements, shader compilation finalization, picking invalidation, and
      idempotent disposal.
- [ ] Remove all remaining runtime imports of `twgl.js`, `.glsl`, and legacy
      WebGL files from outside the WebGL module.

### Affected areas and consumers

- `packages/core/src/marks/`
- `packages/core/src/gl/`, which is moved or eliminated
- `packages/core/src/genomeSpy/renderCoordinator.js`
- `packages/core/src/view/renderingContext/`
- `packages/core/src/fonts/bmFontManager.js`
- `packages/core/src/view/resolutionPlanner.js`
- `packages/core/src/types/viewContext.d.ts`
- mark shader snapshots, graphics lifecycle tests, picking tests, and headless
  helpers

Canvas2D, SVG, WebGPU, headless initialization, the App's `SampleView`, and
debug tooling are downstream review targets even when their files do not
change.

### Verification

- Existing GLSL shader snapshots remain identical.
- Mark buffer-capacity, uniform, selection, facet, picking, hidden-view,
  dynamic-data, font, and resource-disposal tests pass.
- Canvas2D, SVG analysis/vector export, and headless tests import semantic marks
  without pulling in WebGL.
- A focused static-import scan fails if code outside
  `src/rendering/webgl/` imports TWGL, GLSL, or a WebGL implementation module.
- Line-count and diff-stat review confirms that the lifecycle boundary did not
  grow into a general renderer framework.

### Documentation and migration

Update `packages/core/docs/architecture/rendering.md` to describe semantic mark
ownership, the temporary WebGL delegate, and its deletion boundary.

Tentative commit: `refactor(core): consolidate the legacy WebGL renderer`

## Milestone 4: Dynamically load WebGL and enforce bundle isolation

### Intended outcome

WebGL is absent from the synchronous ESM entry graph and loads only when it is
selected, while live behavior and fallback semantics remain unchanged.

### Work

- [ ] Export the WebGL backend factory only from
      `rendering/webgl/index.js`.
- [ ] Replace the static WebGL imports in `renderingBackend.js` with a dynamic
      import used by explicit `webgl` and the existing `auto` WebGL attempt.
- [ ] Preserve explicit-renderer failure behavior and `auto` fallback to
      Canvas2D when WebGL import or context initialization fails.
- [ ] Ensure renderer destruction during or after launch releases every
      initialized resource and cannot leave a late async initialization alive.
- [ ] Extend `verifyMinimalBundle.mjs` to reject WebGL/TWGL/GLSL modules from
      the minimal and production ESM static entry graphs and to require a
      separate WebGL dynamic chunk.
- [ ] Verify that Canvas2D and SVG-only use do not request the WebGL chunk.
- [ ] Preserve the development-only WebGPU build exclusion and do not change
      its dynamic import.
- [ ] Record final ESM entry/chunk and UMD sizes against the baseline. Treat
      UMD inlining as the documented compatibility constraint.

### Affected areas and consumers

- `packages/core/src/rendering/renderingBackend.js`
- `packages/core/src/rendering/webgl/`
- `packages/core/scripts/verifyMinimalBundle.mjs`
- `packages/core/vite.config.js` and package build artifacts if chunk naming or
  publication needs adjustment
- browser, package-root, minimal, full, App, playground, React, and doc-embed
  consumers

### Verification

- Explicit `webgl`, `webgpu`, and `canvas` selections initialize only their
  intended renderer module.
- `auto` preserves current WebGL-first behavior and Canvas2D fallback.
- Import or context failure does not leave a surface, listeners, textures, or
  incomplete renderer state behind.
- The ESM entry has no static WebGL/TWGL/GLSL sources and has a reachable
  dynamic WebGL chunk.
- The minimal entry remains free of all optional renderer modules.
- Package build, source-package imports, and compatibility UMD output succeed.

### Documentation and migration

Update Core rendering architecture and any embed documentation that describes
renderer loading or fallback. No public API migration should be necessary.

Tentative commit: `refactor(core): load the legacy WebGL renderer dynamically`

## Final integration verification

Run focused tests throughout each milestone, followed by the complete relevant
checks after all milestones:

```sh
npm test -- --reporter=agent
npm --workspaces run test:tsc --if-present
npm run lint
npm -w @genome-spy/core run build
npm -w @genome-spy/core run verify:bundle:minimal
```

Repeat the Core visual suite with the same environment recorded in milestone
1:

```sh
npm -w @genome-spy/core run capture:screenshots -- --all --overwrite --renderer webgl
```

Compare every stable PNG exactly against the approved baseline. Review pixel
statistics and the images themselves for any known nondeterministic examples.
No unexplained visual change is acceptable.

Repeat the large App captures into a separate final output directory:

```sh
node packages/core/scripts/runWebGpuExamples.mjs \
  --scope app \
  --renderer webgl \
  --dpr 1 \
  --timeout-ms 120000 \
  --output-dir output/webgl-app-refactored \
  private/genomespy-paper-2024-spec/spec.json \
  private/MCCA-visualization/web/specs/spec.json
```

At `http://localhost:8080/`, open both specifications with
`&renderer=webgl` at the baseline viewport and repeat the recorded interaction
checks. Inspect console and network activity, verify that the WebGL chunk loads
only after selection, and confirm that zoom/pan, hover/picking, tooltips,
resize/scroll, and representative App operations remain correct.

Run representative Canvas2D and WebGPU smoke checks to prove that the shared
semantic-mark changes did not regress those paths. WebGPU output parity is not
a goal of this refactor, and no WebGPU files should appear in the diff.

Finally, repeat the existing interaction benchmark with the same machine,
browser, viewport, DPR, cases, selectors, run count, and renderer order used by
the baseline:

```sh
node packages/core/scripts/runWebGpuInteractionBenchmark.mjs \
  --spec private/MCCA-visualization/web/specs/spec.json \
  --control-spec examples/app/samples.json \
  --renderer both \
  --filter-selector '[data-benchmark-filter]' \
  --sort-selector '[data-benchmark-sort]' \
  --headed \
  --output-dir output/webgl-dynamic-refactored
```

Compare WebGL cadence medians, long-frame counts, normal and picking frame
durations, layout/layout-replay phases, and correctness controls with the
baseline. Use unchanged WebGPU samples as an environmental control, not as the
target performance comparison. The refactored WebGL result must remain within
the tolerance fixed from the baseline's A/A noise. Inspect Chromium traces and
profiler phase/counter changes for any regression outside that bound before
accepting it.

## Acceptance criteria

- Core's synchronous ESM entry graph contains no WebGL implementation, TWGL,
  or GLSL modules.
- Selecting WebGL dynamically loads one legacy renderer module and preserves
  current rendered output, interactions, picking, exports, and lifecycle.
- Selecting WebGPU or Canvas2D does not load the WebGL chunk during ordinary
  rendering.
- WebGL and WebGPU remain independently selectable during the transition.
- Raster export and hybrid SVG use available capabilities in
  WebGL/WebGPU/Canvas2D priority, with Canvas2D covering hybrid SVG until issue
  #483 is implemented.
- No code under `packages/webgpu-renderer/` or
  `packages/core/src/rendering/webgpu/` changes.
- Stable Core screenshots match the approved pre-refactor baselines.
- Both required private App examples match their large baselines and pass the
  live-browser interaction checklist.
- ESM bundle isolation checks, full tests, workspace type checks, lint, and
  package build pass.
- The headed MCCA interaction matrix passes all correctness controls, and
  refactored WebGL performance stays within the precommitted
  `max(5%, baseline A/A noise)` tolerance with no unexplained material
  regression.
- The final architecture leaves one obvious WebGL factory/module that can be
  deleted when the transition ends.

## Risks and mitigations

- **Mark state is deeply mixed with WebGL state.** Move code mechanically into
  per-mark delegates first and preserve shader snapshots; do not redesign mark
  semantics concurrently.
- **Resource updates may be missed after the split.** Cover dynamic data,
  expressions, scale domains/ranges, selections, fonts, placements, hidden
  views, and disposal explicitly.
- **A delegate call could enter the hot path.** Resolve delegates once and keep
  existing batched callbacks; profile before and after.
- **Dynamic imports can race destruction or fallback.** Make factory creation
  atomic, finalize partial state on failure, and test destruction during
  launch.
- **Bundle formats behave differently.** Enforce code splitting for ESM and
  document deliberate UMD inlining.
- **Screenshot baselines can be unstable.** Capture twice before implementation,
  pin the browser environment, use fixed DPR and dimensions, and separate
  remote-data instability from rendering differences.
- **Private App examples are too large for thumbnails.** Use the existing App
  harness or configurable large dimensions plus a live 1920 x 1080 browser
  pass.
- **Fallbacks could mask rendering bugs.** Fall through only for unavailable
  capabilities or initialization failures; propagate errors after rendering
  begins.

## Agent delegation strategy

Use `gpt-5.6-luna` subagents selectively for bounded, mostly read-only work
that can proceed independently. The primary agent retains ownership of the
architecture, the semantic-mark/WebGL-resource split, raster capability
semantics, performance-sensitive implementation, and final acceptance.

Suitable Luna assignments include:

- inventorying static WebGL, TWGL, GLSL, and `glHelper` dependencies before and
  after milestones 3 and 4;
- mapping focused tests and downstream consumers affected by a proposed move;
- running and summarizing focused test suites, type checks, bundle checks, and
  size measurements;
- comparing Core and App screenshot sets, identifying changed images, and
  separating repeatable differences from baseline instability;
- summarizing interaction benchmark JSON, A/A noise, profiler phases,
  correctness controls, and trace locations without deciding whether a
  regression is acceptable;
- auditing Canvas2D, SVG, App, headless, and debug consumers after shared mark
  changes; and
- verifying that WebGPU directories remain untouched and that no WebGL import
  leaks back into the synchronous ESM graph.

Do not delegate the initial lifecycle-contract design, cross-cutting edits to
semantic marks, fallback-policy decisions, hot-path optimization, or final
visual/performance judgments. Do not let subagents edit the same renderer files
concurrently. Prefer one or two Luna agents at a meaningful review boundary
over continuous delegation after every small step.

Subagent findings are review evidence, not automatic acceptance. The primary
agent must reproduce or inspect actionable failures, integrate worthwhile KISS
fixes, rerun the affected verification, and remain responsible for each
milestone's completion state.

## Review and commit strategy

Review milestone 1 together with the baseline artifacts so later comparisons
have an approved reference. The first architecture review gate is the shared
mark/resource lifecycle and raster capability from milestones 2 and 3; review
all downstream renderers and App consumers, not only the moved WebGL files.

After milestone 4, perform a final integration review focused on static import
graphs, resource cleanup, dynamic-data behavior, screenshot parity, the two
private App examples, and performance. Apply KISS improvements before each
milestone commit rather than accumulating a separate cleanup layer.

Before opening a pull request, reconcile every checklist item as completed or
discarded, commit that record, and remove this temporary plan in a later
commit. Do not merge the plan file.

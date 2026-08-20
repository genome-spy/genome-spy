# WebGPU/Core integration plan

Status: In progress — Milestone 1 complete; Milestone 2 underway

Date: 2026-08-20

Scope: `packages/core`, `packages/webgpu-renderer`, and the `first.json` proof of concept

This is a temporary implementation plan. It records the integration decisions and
review gates for an experimental WebGPU backend. It must be reconciled and removed
before the work is merged, as required by the repository workflow.

The companion [renderer API direction](webgpu-renderer-api-direction.md) records
the code-first, tree-shakeable public API direction inferred from the PoC. Its
built-in definition migration and compatibility cleanup are complete; ordered
frame submission is the next reviewable step.

## Context

GenomeSpy Core currently has three rendering paths with different levels of
coupling:

- WebGL is the primary interactive renderer. WebGL programs, buffers, shaders,
  and TWGL calls are embedded in mark classes and related helpers.
- Canvas rendering and SVG export live behind the newer rendering boundary and
  consume a backend-neutral, CPU-side mark traversal.
- `packages/webgpu-renderer` is an early, independent WebGPU library. The PoC
  now connects it to Core's view traversal, dataflow output, and layout through
  a narrow adapter, but not yet to the complete interaction or retained-frame
  lifecycle.

The initial objective—a narrow proof of concept that explicitly selects WebGPU
and renders `examples/core/first.json`, including its generated axes—is
complete. The next objective is to harden the renderer contracts demonstrated
by that slice. The broader objective is to establish an integration boundary
that can grow to full WebGL feature parity, while keeping WebGPU out of
applications that do not select it and making it possible to ship a future
GenomeSpy build without WebGL or WebGPU code.

## Current state and findings

### Core rendering

- `GenomeSpyBase` creates a `RenderingBackend`, while its shared context still
  exposes WebGL-specific state such as `glHelper` and `graphicsDataUpdates`.
- `flowInit.initializeViewSubtree` always initializes encoders, but initializes
  mark graphics only when `glHelper` exists. The current graphics lifecycle is
  therefore not a usable backend-neutral lifecycle.
- The WebGL backend is statically imported by Core. Canvas is dynamically
  imported. Adding a dynamic WebGPU import will keep WebGPU out of Core's
  synchronous module graph, but it does not by itself produce a GPU-free build.
- `UnitView` statically imports the current mark classes. Those classes combine
  semantic responsibilities with WebGL programs, TWGL, buffers, and shader
  modules. Even the current `minimal` entry therefore retains WebGL code.
- Canvas and SVG use `visitMarkOccurrences` and CPU encoders to receive projected
  drawing values. This is a good boundary for immediate-mode renderers, but not
  for WebGPU: `webgpu-renderer` is designed to receive raw values and perform
  scale transforms on the GPU.
- `BufferedViewRenderingContext` already preserves Core's traversal order,
  view coordinates, clipping, visibility, and repeated/faceted occurrences. It
  is the most useful semantic source for a WebGPU-specific coordinator, although
  the coordinator should emit WebGPU draw commands rather than WebGL requests.
- Core currently locks positional scale ranges to `[0, 1]`. Layout code projects
  those values into logical CSS pixels. The planned pixel-range migration will
  remove this mismatch, but the PoC needs an isolated compatibility mapping.
- Picking is synchronous in Core: `readPickingId(x, y)` returns a number after a
  separate picking render. WebGPU readback is asynchronous. Picking cannot be
  integrated honestly without changing Core's interaction contract.

### `webgpu-renderer`

The package already provides:

- renderer, mark, scale, value, selection, render, and picking APIs;
- rect, point, rule, link, and text programs;
- GPU scale implementations for linear, log, pow, sqrt, symlog, identity, band,
  index, threshold, quantize, and ordinal scales;
- side-effect-free public definition subpaths for every implemented mark and
  scale, without a production registry or string dispatch path;
- typed storage buffers, generated WGSL, a font atlas, blending, and basic GPU
  picking pipelines.

The package is not yet a production-ready Core backend:

- `render()` draws every registered mark in insertion order. It cannot accept
  Core's per-frame paint order or draw the same semantic mark in multiple view
  occurrences.
- There is no per-draw view rectangle, scissor/clip rectangle, opacity, or data
  range. These are required for nested views and facets.
- Width, height, range, and device-pixel-ratio semantics are ambiguous. The
  examples appear to mix physical canvas dimensions with logical pixel ranges.
- The clear color is hardcoded to white.
- Whole-renderer destruction is missing and lower-level resource destruction is
  incomplete.
- Runtime dependencies are declared by the renderer package, and its migration
  note records the code-first definition API.
- The scale set is not yet at Core parity. Notable missing or incompatible areas
  include point, locus, time/UTC, quantile, bin-ordinal behavior, null handling,
  expression/parameter accessors, and complete color and range semantics.
- GPU tests cover scale/code-generation, imported point/linear rendering,
  picking, hash, and selection paths. Browser smoke tests cover the PoC and all
  standalone mark scenes, but retained occurrence ordering and lifecycle still
  need dedicated coverage.

### What `first.json` actually requires

The source spec is a 17-row point plot with linear quantitative `x` and `y`
encodings. Core also generates guides. A credible PoC must render:

- the 17 point instances;
- axis domains, ticks, and grid lines as rule/tick geometry;
- formatted tick labels as text;
- the plot and guide view offsets at the requested logical size;
- background/clear color and resize behavior.

The required mark families (point, rule, and text), basic linear scales, and the
default Lato font are already present in `webgpu-renderer`. The example does not
require faceting, conditional encodings, selections, or picking, which makes it
a useful integration slice without pretending to prove feature parity.

## Goals

1. Add an explicitly selected, dynamically imported WebGPU backend to Core.
2. Render `examples/core/first.json`, including generated guides, using
   `@genome-spy/webgpu-renderer` and no WebGL context.
3. Establish ownership boundaries that remain viable for full feature parity:
   Core owns semantics and traversal; the adapter owns translation and resource
   identity; `webgpu-renderer` owns WebGPU resources and pipelines.
4. Make unsupported PoC features fail with actionable errors rather than render
   incorrectly or silently fall back to WebGL.
5. Verify the lazy-loading boundary so WebGPU is not part of Core's synchronous
   module graph.
6. Record the follow-up path toward a genuinely GPU-free Core distribution and
   eventual WebGL removal.
7. Use the browser-visible vertical slice to discover the renderer contracts
   that actually need hardening before generalizing `webgpu-renderer`.

## Non-goals for the PoC

- Changing `renderer: "auto"` to prefer or fall back to WebGPU.
- Full mark, scale, expression, selection, animation, faceting, or interaction
  parity.
- WebGPU picking or datum hover.
- Replacing the WebGL renderer.
- Completing Core's pixel-range migration.
- Claiming that the existing Core or `minimal` entry is GPU-free.
- Designing one lowest-common-denominator drawing API for WebGL, WebGPU, Canvas,
  and SVG.
- Perfecting `webgpu-renderer` before it has been exercised through Core.

## Proposed architecture

```text
Core runtime
  view tree, dataflow, scales, parameters, semantic mark configuration
       |
       v
RenderingBackend selection
       |
       +-- dynamic import: packages/core/src/rendering/webgpu/index.js
                               |
                               +-- WebGpuSurface
                               +-- WebGpuRenderCoordinator
                               +-- Core-to-WebGPU translator
                               +-- occurrence/resource registry
                                        |
                                        v
                           @genome-spy/webgpu-renderer
                             device, pipelines, buffers, textures
```

### Ownership and dependency direction

- `webgpu-renderer` remains Core-independent and must not import Core types or
  view classes.
- The Core adapter depends on the public `webgpu-renderer` API and translates
  Core semantics to low-level descriptors and typed columns.
- WebGPU objects must not be added to Core mark instances. The adapter owns them
  in maps keyed by semantic mark identity and, where necessary, render
  occurrence identity.
- The adapter must not emulate `glHelper`. Doing so would preserve the coupling
  that the WebGPU migration is meant to remove.
- Canvas and SVG keep their immediate-mode traversal. WebGPU receives raw data,
  scale descriptions, and render occurrences in Core's paint order instead of
  CPU-projected mark occurrences.

### Backend selection and loading

Extend the public renderer option with `"webgpu"`. `createRenderingBackend`
must load `rendering/webgpu/index.js` with a literal dynamic import only when the
option is selected. The loaded adapter may then import
`@genome-spy/webgpu-renderer` within the same lazy chunk boundary.

The PoC is explicit opt-in:

- unavailable WebGPU produces a clear initialization error;
- unsupported marks or encodings produce a contextual translation error;
- there is no silent WebGL or Canvas fallback;
- `"auto"` retains its current policy until WebGPU parity and browser support
  justify a separate decision.

Dynamic import excludes WebGPU from the initial module graph, but a bundler may
still emit the WebGPU chunk. A future CPU-only entry point or injected backend
registry is needed when the requirement becomes “do not produce any GPU chunk,”
not merely “do not load it.”

### Coordinate and DPR contract

The vertical slice should use the following provisional convention without first
redesigning the complete public `webgpu-renderer` API:

- all ranges, positions, sizes, offsets, view rectangles, and clip rectangles
  use logical CSS pixels;
- the renderer receives logical width, logical height, and DPR;
- the renderer owns physical attachment sizing:
  `canvas.width = logicalWidth * dpr` and similarly for height;
- shaders convert logical pixels to clip space using logical dimensions;
- antialiasing uses DPR only where physical-pixel width matters;
- picking targets use physical dimensions, and CSS input coordinates are
  converted exactly once at readback.

Milestone 1 should adapt the current API to this convention and change the
renderer only where incorrect output blocks `first.json`. After the example is
visible, Milestone 2 will formalize the parts of this contract that the vertical
slice demonstrates are necessary. This prevents the integration from being
designed around untested assumptions while keeping the coordinate model
explicit.

For the PoC, the adapter bridges Core's unit positional ranges:

- a scaled `x` channel gets the absolute range
  `[viewCoords.x, viewCoords.x2]`;
- a scaled `y` channel gets the inverted absolute range
  `[viewCoords.y2, viewCoords.y]`;
- an unscaled positional channel temporarily uses an identity-equivalent linear
  mapping from `[0, 1]` to the same absolute range;
- pixel-valued offsets remain logical pixel offsets;
- non-positional channels use their resolved Core scale descriptions and ranges.

This compatibility code must live in one named adapter module and be deleted
when Core adopts pixel positional ranges. It must not spread unit-range knowledge
into `webgpu-renderer`.

### Semantic translation

The PoC translator may inspect the stable semantic portions of Core marks:
resolved properties, encoders, collectors, scales, and view coordinates. It
must isolate this knowledge behind a small adapter API so that the eventual
semantic-mark extraction does not affect `webgpu-renderer`.

Initially support only the shapes needed by `first.json`:

- point, rule/tick, and text marks;
- unconditional field, datum, and value encoder branches;
- linear and temporary identity-like positional mapping;
- numeric, string, and CSS color columns;
- point size/shape/fill/stroke defaults;
- rule stroke width, color, opacity, and cap;
- text value, formatting result, alignment, baseline, color, size, and angle;
- paint order matching Core's traversal and view visibility.

Conditions, parameters, unsupported scale types, unsupported marks, facets, and
multi-occurrence cases must throw an error containing the mark type and view
path. This is preferable to silently using a subtly different scale or default.

### Draw and resource lifecycle

The vertical slice should first exercise the current persistent mark registry.
For `first.json`, the adapter may create one handle per occurrence in Core paint
order, rebuild those handles when necessary, and rely temporarily on insertion
order. This assumption must be isolated in the adapter and repeated/faceted
views must fail loudly.

If the current registry cannot preserve the example's paint order, add only the
smallest ordered-handle API required by the PoC. Do not design a complete draw
command abstraction before the integration has demonstrated its needs.

After the vertical slice, evaluate an explicit per-frame draw interface. The
full interface will eventually need commands resembling:

```ts
{
    mark,
    dataOffset,
    instanceCount,
    viewRect,
    clipRect,
    opacity,
}
```

The one-handle-per-occurrence shortcut is acceptable for `first.json` because it
has no faceted repeated unit view. Milestone 2 must use the observed update and
ordering behavior to decide whether ordered handles are sufficient or complete
draw commands are already justified.

Longer term, Core needs backend-neutral dirty/revision notifications for:

- mark configuration changes;
- data/collector changes;
- scale domain/range changes;
- parameter-driven encoding changes;
- layout and DPR changes;
- mark or view removal.

The adapter then turns revisions into create, update, draw, and destroy calls.
The PoC may rebuild narrow resources after dataflow/layout initialization, but
Milestone 1 only needs basic adapter disposal and must record any retained GPU
resources. Deterministic destruction of renderer-owned resources is hardened in
Milestone 2 before the backend is considered stable.

### Interaction boundary

Do not adapt WebGPU's asynchronous readback to Core's synchronous picking API by
blocking, returning stale IDs without an explicit contract, or hiding a promise.
The PoC should report no picking support, equivalent to a renderer without datum
picking.

A later interaction milestone must choose an asynchronous, cancellable picking
contract and define how pointer movement, stale frames, hover transitions, and
cached readback are handled. Coordinate-based interactions that do not require a
datum may remain backend-independent.

## Vertical-slice-first implementation milestones

### Milestone 1: Render `first.json` through the thinnest WebGPU path

Implementation status: Complete and reviewed on 2026-08-20.

Outcome: selecting `renderer: "webgpu"` produces a browser-visible rendering of
the complete first example, including generated guides, without first perfecting
the generic renderer API and without constructing WebGL state.

Implementation:

- add `"webgpu"` to Core's renderer option and backend capability types;
- dynamically import `packages/core/src/rendering/webgpu/index.js` only for that
  renderer selection;
- add a Core package dependency on `@genome-spy/webgpu-renderer` without adding
  a static import to normal Core entry points;
- implement a minimal surface and coordinator/context that consume Core
  traversal order, visibility, view coordinates, and background state;
- implement the isolated unit-to-pixel range shim using a provisional logical
  pixel and DPR convention;
- translate only the point, rule/tick, and text data, linear scales, and mark
  properties needed by `first.json`;
- create handles in traversal order and use the current renderer registry unless
  incorrect output proves that a small ordered-handle change is required;
- make only renderer changes that directly block the vertical slice;
- provide basic adapter disposal, return no picking support, and fail explicitly
  for unsupported semantics and repeated occurrences;
- add a dedicated dev/integration fixture that uses the unchanged
  `examples/core/first.json` and records renderer workarounds for Milestone 2.

Affected areas and downstream consumers:

- `packages/core/src/rendering`, `renderingBackend.js`, public embed/spec types,
  package dependencies, and a focused browser fixture;
- `GenomeSpyBase` and initialization may need a small backend-neutral hook for
  “data and layout are ready,” but the PoC must avoid widening `glHelper`;
- `packages/webgpu-renderer` changes only when its current API blocks correct
  point/rule/text output;
- existing renderer selection behavior remains unchanged.

Verification:

- render the example in a WebGPU-capable browser and inspect the console;
- verify the 17 points and visible rule/text guide output using a screenshot and
  targeted semantic or pixel probes;
- assert that WebGPU mode does not request a WebGL context;
- verify initially that WebGL and Canvas selection do not evaluate the WebGPU
  adapter;
- run focused Core layout/type checks and the WebGPU unit/GPU suites for any
  renderer code touched by the slice.

Documentation and migration:

- keep documentation internal to the plan and fixture at this exploratory
  stage; do not advertise a stable renderer yet;
- annotate the positional range shim with its pixel-range removal condition;
- record each API/lifecycle workaround and whether it is specific to the example
  or likely needed for general Core integration.

Tentative commit: `feat(core): prototype WebGPU rendering for the first example`

Review gate: inspect the rendered result, dependency direction, and workaround
list before redesigning `webgpu-renderer`. This is the evidence gate that decides
the scope of Milestone 2.

#### Milestone 1 implementation record

The vertical slice was implemented without changing `webgpu-renderer` runtime
behavior. Its package export map and declaration entry were corrected so Core's
downstream TypeScript consumers use the existing public types instead of
checking the renderer's implementation sources. Core now dynamically imports a
WebGPU surface, coordinator, traversal context, and mark adapter only for
explicit `renderer: "webgpu"` selection. The Core development page accepts the
renderer query parameter, so the unchanged example can be exercised with:

```text
?spec=examples/core/first.json&renderer=webgpu
```

The browser result contains all 17 point instances and the generated rule/text
guides. The adapter sends raw point values and linear scale domains to WebGPU,
while one isolated compatibility function maps Core's unit ranges to absolute
logical-pixel ranges. Explicit WebGPU selection does not construct `glHelper` or
fall back to another renderer. Unsupported semantics report the mark type and
Core view path.

Observed sizing evidence supports the provisional coordinate contract:

- at DPR 1, a 900 × 660 logical canvas used a 900 × 660 backing store;
- after viewport resize, the logical and backing sizes both changed to
  720 × 460;
- at DPR 2, the approximately 900 × 660 logical canvas used an 1800 × 1320
  backing store and retained correct mark and guide placement.

Browser request inspection showed the Core WebGPU adapter and
`webgpu-renderer` entry loading after explicit WebGPU selection. A fresh Canvas
selection did not request either module tree. The backend unit test additionally
asserts that explicit WebGPU selection calls neither the WebGL helper nor the
Canvas backend.

Milestone 1 retains the following deliberate workarounds for review in
Milestone 2:

- mark handles are rebuilt in traversal order for every painted frame;
- the surface destroys rebuilt mark handles, its resize observer, and canvas,
  but whole-renderer/device disposal remains unavailable in the low-level API;
- only a white/default clear color is accepted because the renderer hardcodes
  white;
- Core's generic `sans-serif` default is mapped to the embedded Lato atlas;
- the adapter supports only the point, rule/tick, text, scale, and property
  subset exercised by `first.json`; facets, repeated occurrences, view opacity,
  conditions, picking, and raster export fail explicitly.
- the renderer's undeclared runtime dependencies remain a Milestone 2 packaging
  task; the monorepo currently supplies them through Core's dependency graph.

Verification completed for the slice:

- focused Core backend and adapter tests: 11 passed;
- Core TypeScript check: passed;
- all workspace TypeScript checks: passed;
- existing minimal/production bundle verification: passed; WebGPU was emitted as
  a separate approximately 285 kB asynchronous chunk, confirming that lazy
  loading works but the current entries are not GPU-free distribution artifacts;
- `webgpu-renderer` TypeScript check: passed;
- `webgpu-renderer` unit tests: 97 passed;
- `webgpu-renderer` GPU tests: 41 passed;
- WebGPU browser run at DPR 1 and DPR 2: complete rendering, no renderer errors;
  the only application warning was Lit's development-mode notice.

### Milestone 2: Harden only the renderer contracts validated by the PoC

Implementation status: Built-in definition migration and bundle-proof slice
complete on 2026-08-20; ordered frame submission is next.

Outcome: the successful vertical slice no longer depends on accidental or
ambiguous renderer behavior, while unused generality remains deferred.

Completed definition slice:

- declare all runtime package dependencies;
- expose every implemented mark and scale through side-effect-free definitions;
- migrate Core and standalone examples away from string creation and the
  production scale registry;
- prove that point plus linear exclude unrelated features from a focused
  production bundle;
- keep the existing typed-column and slot-update model.

Remaining implementation:

- formalize logical-size, physical attachment, and DPR semantics demonstrated by
  the slice;
- replace the rebuild-in-creation-order workaround with the explicit ordered
  draw-list direction described in the companion API note;
- define clearing/background and resize ownership only to the extent exercised
  by Core and the standalone examples;
- add whole-renderer destruction and complete cleanup for resources owned by the
  integrated path;
- replace PoC-specific API workarounds in the Core adapter with the validated
  public renderer contracts;
- do not add picking, facets, or scale parity merely to make the API appear
  complete.

Affected areas and downstream consumers:

- `packages/webgpu-renderer/src`, public types, package manifest, examples, and
  tests;
- the Core WebGPU adapter where provisional assumptions are replaced;
- existing standalone examples may need to adopt the formal logical-size and
  lifecycle conventions.

Verification:

- package TypeScript, unit, and GPU tests;
- targeted visual/offscreen coverage for the coordinate, ordering, resize,
  clearing, and destruction behavior that was actually hardened;
- a focused bundle fixture that imports point plus linear scale and excludes
  unrelated marks, scales, and font support;
- the Milestone 1 browser fixture continues to render the same semantic output;
- existing renderer examples still initialize, render, resize, and dispose.

Documentation and migration:

- document the validated logical-pixel and ownership contracts;
- reconcile obsolete status in `packages/webgpu-renderer/MIGRATION_PLAN.md` and
  record any public API adjustment;
- update Core's rendering architecture document with the adapter boundary;
- no public promise of feature parity.

Tentative commit: `refactor(rendering): harden validated WebGPU contracts`

Review gate: review the public renderer API and lifecycle after it has concrete
Core usage, including downstream examples and the Core adapter.

### Milestone 3: Stabilize the lazy experimental backend

Outcome: the vertical slice becomes a reproducible experimental feature with
automated browser and loading-boundary coverage, without expanding its semantic
scope.

Implementation:

- turn the exploratory fixture into a WebGPU-capable Playwright smoke test;
- verify all 17 points and non-empty rule/text guide output using stable semantic
  probes, selected pixels, or a tolerant screenshot comparison;
- test logical resize and at least DPR 1 and DPR 2 where the browser environment
  permits it;
- add a bundle/module-graph guard showing that Core's synchronous production and
  minimal entry graphs contain neither the WebGPU adapter nor
  `@genome-spy/webgpu-renderer`;
- verify the WebGPU chunk is fetched/evaluated only after explicit selection;
- remove temporary diagnostics and workarounds superseded by Milestone 2;
- document the experimental renderer option and exact limitations.

Affected areas and downstream consumers:

- Core browser integration tests, example/dev harness, bundle verification, and
  user-facing renderer documentation;
- the authored `examples/core/first.json` should remain unchanged unless the
  shared-example instructions establish a compelling reason to edit it;
- WebGL, Canvas, SVG, and `"auto"` behavior remain unchanged.

Verification:

- run the browser smoke through the repository's `debug-genomespy-web` workflow;
- inspect browser console and network/module loading;
- compare against an existing renderer with tolerances for antialiasing rather
  than requiring exact cross-backend pixels;
- run focused Core layout/rendering tests, bundle verification, workspace
  TypeScript checks, and the WebGPU unit/GPU suites;
- verify deterministic disposal of the stable experimental backend.

Documentation and migration:

- use the `write-genomespy-docs` workflow for the public experimental option;
- state browser requirements, explicit opt-in, unsupported picking/faceting, and
  the absence of automatic fallback;
- update `packages/webgpu-renderer/MIGRATION_PLAN.md` with verified PoC status
  and the next parity slice.

Tentative commit: `feat(core): stabilize the experimental WebGPU backend`

Review gate: perform final integration review of rendered output, module-loading
evidence, cleanup, known limitations, and the path to the next parity slice.

## Post-PoC roadmap

The following work should be planned from an explicit feature matrix instead of
adding one-off adapter branches:

1. Extract backend-neutral semantic mark definitions from the current WebGL mark
   classes. Move WebGL programs, buffers, TWGL, and GLSL under a lazily loaded
   WebGL adapter.
2. Introduce mark/data/scale/layout revisions so every renderer has a coherent
   update lifecycle independent of `glHelper`.
3. Replace the occurrence-per-handle PoC with ordered draw commands supporting
   data ranges, view rectangles, scissor clips, opacity, and repeated/faceted
   occurrences.
4. Land Core's breaking pixel-range migration and delete the unit-range adapter.
5. Work through parity slices: remaining mark types, scale types, conditions and
   expressions, textures/fonts, nested clipping, faceting, selections, and
   animation/transitions.
6. Redesign picking around asynchronous readback and port selection/hover
   behavior.
7. Add cross-renderer semantic and tolerant visual parity fixtures, with WebGL as
   the temporary reference rather than a permanent shared implementation.
8. Add a dedicated CPU-only entry or backend-loader configuration that does not
   emit WebGL or WebGPU modules. Expand the static-graph verifier to reject TWGL,
   GLSL, WebGL, and WebGPU dependencies from that entry.
9. After a supported feature matrix and migration period, decide whether
   `"auto"` should prefer WebGPU, then deprecate and remove WebGL.

The CPU-only packaging work is structurally dependent on semantic/WebGL
separation. Merely adding WebGPU as a dynamic import does not satisfy it.

## Alternatives considered

### Emulate `glHelper` and reuse WebGL mark methods

Rejected. The methods expose WebGL concepts and would force the WebGPU adapter to
imitate programs, buffers, and synchronous draw/pick behavior. It would entrench
the coupling scheduled for removal.

### Feed WebGPU through the Canvas/SVG immediate renderer

Rejected as the primary path. It would project values on the CPU, bypass
WebGPU-side scales and selections, and create a slow immediate GPU renderer. The
immediate traversal remains appropriate for Canvas and SVG.

### Move Core semantics into `webgpu-renderer`

Rejected. The package should remain reusable and independent of Core's view,
dataflow, expression, and specification classes. Translation belongs at the
dependency boundary in Core.

### Build a universal rendering abstraction before the PoC

Deferred. WebGL, retained GPU rendering, Canvas, and SVG have materially
different lifecycles. A universal API designed before observing the WebGPU
integration would likely reproduce a lowest-common-denominator abstraction. The
PoC instead defines a narrow semantic-to-WebGPU adapter and records the reusable
contracts that emerge.

### Complete the Core pixel-range migration first

Reasonable but not required for the experiment. It would reduce adapter code,
but couples a broad breaking layout change to an early backend validation. The
recommended PoC isolates a disposable range shim and removes it immediately
after the pixel migration. If that migration is already ready to land, reverse
the order and omit the shim.

### Use a general GPU abstraction such as luma.gl

Not recommended. `webgpu-renderer` already owns WebGPU-specific pipeline and
buffer abstractions, and WebGL is intended to disappear. Introducing another GPU
layer would add weight without removing the Core semantic adapter.

## Risks and mitigations

- **A convincing screenshot hides a wrong lifecycle.** Test resize, destruction,
  lazy loading, and ordered guide drawing in addition to the initial pixels.
- **Unit/logical/physical coordinates become mixed.** Define one logical-pixel
  contract and confine the temporary unit-range bridge to one module.
- **Persistent handles lose Core paint order.** Isolate creation-order reliance
  in the vertical slice and rebuild handles deterministically; add explicit frame
  order during hardening if updates make that assumption invalid.
- **Facets appear to work while drawing wrong data.** Fail on repeated
  occurrences until data ranges and per-draw state are implemented.
- **Core internals leak into the generic package.** Keep all Core imports and
  translations in `packages/core/src/rendering/webgpu`.
- **Dynamic import is mistaken for a GPU-free distribution.** Add separate
  static-graph assertions now and plan a CPU-only entry after WebGL extraction.
- **Picking is made superficially synchronous.** Keep it unsupported in the PoC
  and design the asynchronous interaction contract separately.
- **Font and text differences make exact screenshots flaky.** Use semantic
  probes and tolerant visual checks, while keeping a focused deterministic text
  fixture in `webgpu-renderer`.
- **Browser/CI WebGPU support is inconsistent.** Detect capability, distinguish
  unsupported infrastructure from rendering failures, and retain lower-level GPU
  tests alongside the browser smoke.
- **Hoisted undeclared dependencies mask packaging failures.** Declare runtime
  imports and test the package through its workspace/public entry.

## Open decisions

1. Should the future CPU-only product be a named entry such as
   `@genome-spy/core/cpu`, or should consumers inject a backend loader registry?
   A named entry is the clearer first implementation.
2. What is the smallest generic draw descriptor that covers Core occurrences?
   The PoC showed that creation order requires rebuilding every handle, so the
   companion API note settles on explicit ordered draws. Exact field names and
   batching rules remain subject to the Step 2 review gate.
3. Core's pixel-range migration did not precede the PoC. Keep the isolated
   unit-to-pixel adapter shim until that migration lands, then remove it and
   test the native range contract directly.
4. Where should public font registration and atlas ownership live? The embedded
   default is sufficient for `first.json`, but not for parity.
5. What asynchronous picking semantics should Core expose for stale pointer
   requests and hover transitions?
6. What browser support threshold must be reached before `"auto"` may select
   WebGPU? This is explicitly a post-parity product decision.

## Acceptance criteria for the PoC

- `renderer: "webgpu"` renders `examples/core/first.json` with 17 points and
  visible axis/grid rule and text output.
- The plot, guide offsets, background, logical resize, and tested DPR values are
  correct within documented visual tolerances.
- WebGPU mode never requests or initializes a WebGL context.
- WebGPU adapter and package code are imported only after explicit WebGPU
  selection and are absent from Core's synchronous entry graphs.
- WebGL, Canvas, SVG, and `"auto"` behavior remain unchanged.
- Unsupported PoC semantics fail with the mark type and view path.
- Renderer and adapter resources are destroyed deterministically.
- `webgpu-renderer` unit, type, and GPU suites pass; focused Core unit, layout,
  bundle, type, and browser checks pass.
- Documentation labels the backend experimental and does not imply picking,
  facets, dynamic-update parity, automatic fallback, or a GPU-free Core build.

## Design references and license check

These projects were reviewed for established integration patterns. No source is
planned to be copied or adapted in the PoC.

- [PixiJS `autoDetectRenderer`](https://github.com/pixijs/pixijs/blob/dev/src/rendering/renderers/autoDetectRenderer.ts)
  demonstrates asynchronous renderer selection with renderer-specific dynamic
  imports and ordered preferences. The useful pattern is the lazy factory, not
  PixiJS's scene graph or common renderer hierarchy. PixiJS is MIT licensed.
- [Vega View API](https://vega.github.io/vega/docs/api/view/) keeps renderer
  choice behind a semantic visualization runtime. The useful pattern is placing
  backend choice above rendering mechanics; GenomeSpy should not introduce a
  Vega scene graph solely for this integration. Vega is BSD-3-Clause licensed.
- [deck.gl's WebGPU guide](https://deck.gl/docs/developer-guide/webgpu) shows a
  layer-oriented system preserving its application API while porting GPU
  resources and features incrementally. Its documented WebGPU limitations also
  support maintaining an explicit parity matrix. deck.gl is MIT licensed.

MIT and BSD-3-Clause are compatible design references for GenomeSpy's MIT
repository. If implementation later copies or adapts source rather than merely
following an architectural idea, preserve the applicable copyright and license
notice and record the provenance in the change.

## Baseline verification already performed

Before writing this plan:

- `@genome-spy/webgpu-renderer` TypeScript checks passed;
- its unit suite passed: 22 files and 97 tests;
- its WebGPU suite passed: 41 tests;
- the focused Core layout snapshot for `first.json` passed.

These results establish that the present low-level implementation and example
layout are a stable starting point. They do not establish rendered visual parity,
which is first demonstrated in Milestone 1 and automated in Milestone 3.

# WebGPU renderer API direction

Status: In progress — definition migration complete; ordered frames next

Date: 2026-08-20

Scope: the public boundary of `@genome-spy/webgpu-renderer` and its use by the
Core WebGPU adapter

This is a temporary design note associated with the WebGPU/Core integration
plan. It records the API direction suggested by the `first.json` proof of
concept and the subsequent design discussion. It does not define a stable
public API yet.

## Decision summary

Evolve `webgpu-renderer` into a code-first, retained GPU renderer whose features
are selected by importing concrete mark and scale definitions. The renderer
should consume those definitions, typed channel data, and an explicit ordered
draw list. It should not interpret a miniature visualization grammar through
central string registries.

Core remains responsible for specification semantics, views, layout, dataflow,
encoders, scale resolution, and paint-order traversal. Its WebGPU adapter is an
anti-corruption layer that translates those concepts into the smaller generic
renderer API. `webgpu-renderer` remains independently usable and must not import
Core types or reproduce Core's view hierarchy.

The direction is inspired by CandyGraph's separation between explicitly
imported renderables and a renderer that only knows generic primitive and
composite contracts. We should adopt that dependency shape, not CandyGraph's
specific WebGL implementation, coordinate-system hierarchy, or `instanceof`
dispatch.

```text
GenomeSpy Core
  grammar, view tree, encoders, dataflow, resolved scales
                         |
                         v
Core WebGPU adapter
  semantic translation, occurrence identity, ordered draws
                         |
                         v
@genome-spy/webgpu-renderer
  imported definitions, retained handles, GPU resources, frame execution
```

## Evidence from the PoC

The PoC rendered all 17 points and the generated rule and text guides from
`examples/core/first.json` at DPR 1 and 2. It established that the basic
renderer model is viable:

- typed, columnar channel data is a good handoff from Core;
- keeping scale transforms on the GPU avoids a CPU projection path;
- structural mark creation plus cheap scale and value slot updates is useful;
- GPU pipelines, buffers, textures, and bind groups belong in the low-level
  renderer rather than Core marks;
- the unit-to-pixel mismatch can remain an isolated Core adapter concern until
  Core completes its pixel-range migration.

At the initial PoC checkpoint, the integration also exposed friction that was
architectural rather than a missing mark feature:

- `renderer.createMark("point", config)` dispatches through a central string
  switch, which statically imports every built-in mark program;
- the scale registry likewise imports every built-in scale definition and
  selects one by a runtime `type` string;
- `render()` draws every registered mark in creation order, so Core currently
  rebuilds all handles each frame to recover paint order;
- a semantic mark cannot be submitted naturally for several view occurrences
  with different viewports, clips, opacities, or instance ranges;
- clear color, logical size, physical attachment size, and DPR are not yet a
  coherent public frame contract;
- destruction stops at individual marks, and some internal work can initiate
  rendering outside the host's frame schedule;
- the package root exposes scale-code-generation internals even though the
  intended public surface is described as small.

At that checkpoint, the lazy Core integration emitted an approximately 285 kB
asynchronous WebGPU chunk (about 116 kB gzip). Dynamic import kept it off the
Canvas path, but the central imports prevented consumers from retaining only
the marks, scales, and text support that they used. The definition migration
below removed those central imports; the old size remains a PoC baseline rather
than a description of the current module graph.

## Goals

1. Keep `webgpu-renderer` generic and useful without GenomeSpy Core.
2. Make built-in marks, scales, and optional facilities independently
   tree-shakeable through explicit imports.
3. Preserve retained GPU resources and the existing efficient slot-update
   model.
4. Let a host submit an explicit paint-ordered frame with per-occurrence state.
5. Define logical-pixel, DPR, clearing, invalidation, and destruction contracts
   suitable for both Core and standalone users.
6. Keep Core grammar details and view objects out of the renderer API.
7. Migrate incrementally, keeping the working `first.json` slice as the
   integration fixture.

## Non-goals

- Moving Core's declarative grammar, encoder branches, scale resolution, or
  view hierarchy into `webgpu-renderer`.
- Adding a general-purpose scene graph or adopting CandyGraph's composite
  coordinate-system model. Core already owns composition and traversal.
- Replacing readable channel names with positional arguments or numeric codes.
  Compression handles repeated property names; removing eager imports and
  registries is the material bundle-size improvement.
- Completing mark, scale, picking, interaction, or text parity as part of the
  API refactor.
- Supporting both code-first and declarative APIs in the renderer core. A
  compatibility facade can be considered later as a separate entry or package.
- Copying CandyGraph source. It is an architectural reference only.

## Proposed public model

### Integration feedback policy

The renderer is unpublished and Core is its sole consumer. The contracts in
this note are hypotheses to validate through integration, not compatibility
requirements. If they force awkward translation, confuse ownership, introduce
unnecessary work, or prevent important optimizations, call that out explicitly
and propose a breaking improvement. Do not preserve a poor renderer API by
burying compensating behavior in the Core adapter.

Integration-driven changes must still keep the package generic. The renderer
must not import Core types, reproduce the visualization grammar, or adopt a
Core-specific view hierarchy merely because Core exposed the design problem.

### Imported immutable definitions

Marks and scales should be concrete imports rather than names resolved by a
global registry:

```js
import { createRenderer } from "@genome-spy/webgpu-renderer";
import { pointMark } from "@genome-spy/webgpu-renderer/marks/point";
import { linearScale } from "@genome-spy/webgpu-renderer/scales/linear";

const renderer = await createRenderer(canvas);
const points = renderer.createMark(pointMark, {
  channels: {
    x: {
      data: xValues,
      scale: linearScale({ domain: [0, 10], range: [20, 620] }),
    },
    y: {
      data: yValues,
      scale: linearScale({ domain: [0, 10], range: [420, 20] }),
    },
    size: { value: 100 },
  },
});
```

The spelling is illustrative, not a settled API. A definition may be an object,
factory result, or class instance. Whichever representation is selected, it
must be immutable, reusable across marks, and free of mutable GPU state. It may
provide validation, WGSL emission, resource requirements, and defaults. The
renderer-created handle owns the device-specific mutable state.

This removes global registration and lets the imported module graph determine
which features are bundled. Custom definitions use the same interface as
built-ins instead of mutating a process-wide registry.

### Retained mark handles

`createMark` should return the canonical handle for the retained resource, not
an ID that must be passed back into renderer methods. The handle should expose
only updates that preserve its pipeline and resource shape:

```js
points.series.replace({ x: nextX, y: nextY });
points.scales.x.setDomain([2, 8]);
points.values.size.set(144);
points.destroy();
```

Series replacement is definition-owned. Text handles accept logical strings
and per-string numeric channels through the same slot; the text implementation
may rebuild glyph layout and derived buffers while retaining its pipeline and
font atlas. The generic renderer must not dispatch on the text definition.

Changes to structural properties, such as a different mark definition, output
arity, sharing layout, or stop count baked into a pipeline, may require a new
handle. That distinction should be explicit rather than hidden behind a
general-purpose mutable config object.

### Explicit ordered draws

Resource lifetime and frame occurrence are different concepts. A retained mark
may be drawn zero, one, or several times in a frame. The host should provide an
ordered draw list with per-occurrence state:

```js
renderer.render({
  clearColor: [1, 1, 1, 1],
  draws: [
    {
      mark: points,
      viewport: { x: 20, y: 20, width: 600, height: 400 },
      scissor: { x: 20, y: 20, width: 600, height: 400 },
      opacity: 1,
      firstInstance: 0,
      instanceCount: 17,
    },
  ],
});
```

The renderer must preserve list order. Batching is allowed only when it does not
change visible ordering. The descriptor should remain GPU-oriented and generic:
it should not contain Core views, facets, mark classes, or scale-resolution
objects.

An explicit list solves the PoC's rebuild-per-frame workaround and supports
faceted or repeated Core occurrences without duplicating buffers and pipelines.
It also gives standalone users direct control over paint order and clipping.

### Surface, sizing, and lifecycle

The public surface contract should use logical CSS pixels consistently:

- `resize({ width, height, dpr })` receives logical dimensions and makes
  physical attachment sizing explicit;
- viewports, scissors, scale ranges, offsets, and picking coordinates use
  logical pixels;
- the renderer performs the logical-to-physical conversion exactly once;
- `render` accepts the clear color and the complete ordered frame;
- no font upload, atlas work, or other asynchronous preparation may submit a
  visible frame behind the host's back;
- asynchronous preparation should signal readiness or invalidation so the host
  can schedule another frame;
- `destroy()` releases renderer-owned buffers, textures, layouts, observers,
  and contexts, while each retained handle has deterministic destruction.

The convenience factory can continue to acquire and configure a device for a
canvas. An advanced construction path may later accept an existing device and
context, but it is not required to unblock Core.

### Picking

Picking should eventually consume the same ordered draw list so clipping,
occurrence ranges, and topmost order match the visible frame. Its asynchronous
result remains explicit. The API refactor must not disguise WebGPU readback as
Core's current synchronous picking contract; Core will adapt after its
interaction API is redesigned.

## Package and tree-shaking shape

The root entry should expose only renderer construction, stable public types,
errors, and small utilities that are genuinely universal. Feature modules
should have side-effect-free subpath exports, for example:

```text
@genome-spy/webgpu-renderer
@genome-spy/webgpu-renderer/marks/point
@genome-spy/webgpu-renderer/marks/text
@genome-spy/webgpu-renderer/scales/linear
@genome-spy/webgpu-renderer/scales/identity
@genome-spy/webgpu-renderer/scales/band
@genome-spy/webgpu-renderer/fonts/lato
```

A consumer importing point plus linear scale must not pull in rect, rule, link,
text, font-atlas code, or unrelated scales. Barrels that eagerly re-export all
features would defeat this goal even after removing the runtime switch. The
package export map, runtime JavaScript, and declarations must describe the same
surface.

Add a small production bundle fixture that asserts module inclusion or size for
representative imports. Tree-shaking is a tested contract, not an assumption
based on source layout. The Core lazy chunk should also be measured after each
migration slice.

## Core integration boundary

The Core adapter continues to perform all semantic translation:

```text
Core mark + collector + encoder + resolved scale
                         |
                         +-- choose imported renderer definitions
                         +-- construct typed channel columns
                         +-- synchronize retained handles by revisions
                         +-- emit ordered occurrence draws
                         v
                  renderer frame API
```

The current adapter directly inspects encoder branches and mark properties. That
is acceptable as a discovery layer, but it should eventually consume stable
backend-neutral semantic descriptors extracted from Core's WebGL-bound mark
classes. The low-level renderer API must not expand to absorb those Core details
merely to make the adapter shorter.

Core should lazily import a backend module that in turn imports exactly the mark
and scale definitions supported by that backend slice. A future CPU-only Core
entry still requires separation of the existing WebGL classes; improving
`webgpu-renderer` tree-shaking alone does not remove WebGL from Core.

## Migration sequence

This sequence refines Milestone 2 of the main integration plan. Each step ends
at a reviewable boundary; it does not authorize implementing all renderer
parity work at once.

### Step 1: Establish definitions and bundle proof

Implementation status: Complete and reviewed on 2026-08-20.

Outcome: one mark and one scale can be imported without the built-in registries
or unrelated implementations.

- define the minimum immutable mark- and scale-definition contracts;
- add side-effect-free subpath exports for point and linear scale;
- migrate their current validation, resource, and WGSL hooks without changing
  rendering behavior;
- add a tiny production bundle fixture proving unrelated marks, scales, and font
  code are absent;
- keep the old name-based path only as a temporary migration aid if an existing
  standalone example still requires it.

Affected areas: renderer public types, export map, point program, linear scale
definition, focused tests, and bundle fixture.

Verification: package type and unit tests, point GPU smoke, bundle module graph,
and current standalone point example.

Documentation: document the experimental definition contract and its structural
versus dynamic properties.

Tentative commit: `refactor(webgpu): introduce importable renderer definitions`

Review gate: confirm the definition shape supports a built-in and a small custom
definition without global registration.

#### Step 1 implementation record

The first slice uses small value-based protocols:

- `pointMark` is a frozen object with a diagnostic `type` and a
  `createProgram` hook. It holds no renderer or GPU state.
- `linearScale(options)` returns a channel-scale config carrying one shared,
  frozen `ScaleDef`. The config remains ordinary caller-owned data; renderer
  slots own mutable GPU updates.
- identity remains the only implicit scale. Every other generic scale config
  must carry a definition.

The ordinary renderer no longer imports built-in mark programs or a scale
registry. Shader generation, validation, and resource planning consume the
definition attached to each scale config. WGSL dependencies are definition
references rather than registry names.

Public subpaths now expose:

```text
@genome-spy/webgpu-renderer
@genome-spy/webgpu-renderer/marks/point
@genome-spy/webgpu-renderer/marks/rect
@genome-spy/webgpu-renderer/marks/rule
@genome-spy/webgpu-renderer/marks/link
@genome-spy/webgpu-renderer/marks/text
@genome-spy/webgpu-renderer/scales/identity
@genome-spy/webgpu-renderer/scales/linear
@genome-spy/webgpu-renderer/scales/log
@genome-spy/webgpu-renderer/scales/pow
@genome-spy/webgpu-renderer/scales/sqrt
@genome-spy/webgpu-renderer/scales/symlog
@genome-spy/webgpu-renderer/scales/quantize
@genome-spy/webgpu-renderer/scales/band
@genome-spy/webgpu-renderer/scales/index
@genome-spy/webgpu-renderer/scales/ordinal
@genome-spy/webgpu-renderer/scales/threshold
```

The production Rollup fixture for point and linear contains their
implementations but excludes rect, rule, link, text, every unrelated scale
definition, and font support. Its current unminified output is approximately
224 kB across 41 included modules. This is a module-selection baseline, not a
bundle-size target:
the point program still uses substantial generic channel, resource, selection,
color, and picking infrastructure.

Verification completed for the slice:

- public-package TypeScript fixture: passed;
- renderer unit tests: 24 files and 101 tests passed, including custom mark and
  scale definitions that require no global registration;
- renderer GPU tests: 42 passed, including a new imported point/linear render
  and picking smoke;
- point/linear module-graph assertion: passed;
- Core and renderer TypeScript checks: passed;
- focused Core WebGPU adapter/backend tests: 11 passed;
- browser smoke of `first.json`: complete point and guide rendering; the only
  console error was the development server's missing favicon.

The review accepted imported, value-based definitions and scale configs that
carry their definition as the built-in migration path. The exact custom
authoring contract remains intentionally undocumented while
`MarkDefinition.createProgram` and the breadth of `ScaleOptions` are still
experimental. No production global registration is needed by the code-first
path.

#### Compatibility cleanup

After the initial checkpoint, the temporary compatibility entry proved to add
more maintenance surface than value. All standalone examples and the Core PoC
were migrated to imported definitions, the string dispatch hooks were removed
from `Renderer`, and the scale registry was deleted. Tests that need the full
scale catalog now assemble it in test-only code. No production compatibility
facade remains.

Every implemented mark and scale now has a side-effect-free public subpath.
Cleanup verification covers the renderer unit and GPU suites, public-package
type imports for the complete built-in catalog, the point/linear bundle graph,
Core type and adapter tests, the `first.json` browser fixture, and every
standalone renderer scene.

### Step 2: Add ordered frame submission and migrate the PoC

Outcome: Core renders `first.json` without rebuilding retained handles merely to
establish paint order.

- make retained handles the canonical update and destruction API;
- add an explicit ordered draw list with viewport, scissor, opacity, and
  instance range fields needed by Core;
- formalize logical size, DPR, clear color, and renderer destruction;
- keep the Core adapter on imported definitions while migrating it to the new
  frame API;
- retain the isolated unit-to-pixel shim until Core's pixel-range migration.

Affected areas: renderer frame/lifecycle API, Core WebGPU surface and
coordinator, adapter tests, and the `first.json` browser fixture.

Verification: existing renderer suites, handle reuse across frames, two draws
of one handle with distinct clips, PoC output at DPR 1 and 2, resize, and
deterministic disposal.

Documentation: update renderer examples and reconcile superseded sections of
`packages/webgpu-renderer/MIGRATION_PLAN.md`.

Tentative commit: `refactor(webgpu): submit explicit ordered draw frames`

Review gate: inspect whether the generic draw descriptor covers Core
occurrences without exposing Core concepts.

### Step 3: Slice optional facilities

Implementation status: built-in mark and scale subpaths, registry removal, and
compatibility removal completed early on 2026-08-20; optional feature slicing
remains.

Outcome: optional facilities can be imported independently, while every
supported mark and scale remains available through a tree-shakeable definition
and the renderer core contains no built-in name switch.

- separate optional text/font, picking, and advanced scale facilities;
- decide whether a declarative convenience facade has demonstrated enough value
  to live in a separate entry or package.

Affected areas: renderer marks, scales, optional facilities, examples, Core
adapter feature matrix, exports, and migration notes.

Verification: per-feature unit/GPU coverage, public-package consumer fixtures,
bundle assertions for several import combinations, and Core parity fixtures.

Documentation: publish the stable code-first API only after the feature matrix
and lifecycle are supportable.

Tentative commits: one conventional commit per independently reviewable mark,
scale, or optional facility slice.

Review gate: confirm optional facilities can be separated without reintroducing
a registry or eager feature imports.

## Alternatives considered

### Keep string types and improve the registry

Not preferred. Per-feature modules plus explicit registration could improve
tree-shaking, but callers would still coordinate names, registrations, runtime
validation, and global mutable state. Imported definition values express the
dependency directly and give TypeScript or JSDoc a stronger connection between
a definition and its config.

### Mirror the visualization grammar more completely

Rejected. It would duplicate Core semantics, make the generic package larger,
and force Core to translate from one declarative grammar into another. The
renderer needs structural GPU descriptions and draw occurrences, not a second
visualization runtime.

### Adopt CandyGraph's API literally

Rejected. CandyGraph's renderables, coordinate systems, composites, and WebGL
command cache solve a related problem, but Core already owns composition and
WebGPU has different pipeline and resource constraints. The useful idea is
explicitly imported renderable behavior behind a small renderer protocol.

### Expose only renderer methods keyed by mark IDs

Not preferred as the canonical API. It is workable internally, but handles
provide direct ownership, typed update slots, and deterministic destruction.
Ordered draws can still use stable internal IDs without exposing them to users.

### Build a declarative compatibility facade immediately

Deferred. Maintaining two creation paths while the definition contract changes
would obscure tree-shaking regressions and double the surface to test. If
standalone demand appears, the facade should translate to the code-first core
from a separate entry so consumers do not pay for it accidentally.

## Risks and mitigations

- **A new API changes names but not bundle output.** Enforce subpath imports,
  side-effect-free modules, and bundle module-graph tests before migrating all
  features.
- **Definitions accumulate mutable device state.** Keep them immutable and put
  buffers, pipelines, slots, and caches in renderer-owned handles.
- **The draw descriptor becomes a disguised Core view.** Restrict it to generic
  GPU occurrence state and validate it with a standalone multi-viewport example.
- **A shared handle cannot represent Core facets efficiently.** Include instance
  ranges from the beginning and test multiple draws of one handle before
  claiming faceting support.
- **Two public creation paths drift.** Keep one canonical code-first path; defer
  or isolate any compatibility facade.
- **Refactoring outruns integration evidence.** Migrate point plus linear first,
  keep `first.json` green, and review the contracts before expanding the slice.
- **Text or scale internals trigger hidden frame submissions.** Define explicit
  invalidation/readiness and keep frame submission under caller control.

## Open decisions

1. Should a definition be an immutable object, a factory result, or a class
   instance? Prefer the smallest value-based protocol; prototype identity must
   not be required for dispatch.
2. Should scale definitions live directly in channel configs or be bound to a
   channel through a separate builder? The answer should preserve cheap domain
   and range slots.
3. Should coordinate-system transforms be a first-class generic draw concept,
   or are channel scales plus viewport state sufficient for GenomeSpy's needs?
   Do not add the abstraction until a second use case requires it.
4. Does the renderer own backing-store sizing, or does it validate a size owned
   by the host? Either can work, but logical and physical dimensions must not be
   inferred inconsistently.
5. How should GPU scale resources be shared when one resolved Core scale feeds
   several mark handles?
6. Should an advanced factory accept an existing `GPUDevice` and context? This
   is useful for embedding but can follow the Core-blocking contracts.
7. If a declarative facade is later justified, should it be a subpath entry or a
   separate package?

## Acceptance criteria

- A standalone consumer can construct and draw a point mark without importing
  Core or registering string names.
- Importing point plus linear scale excludes unrelated marks, scales, and font
  code from a measured production bundle.
- Core's adapter translates `first.json` into retained handles and an ordered
  frame without recreating all handles on every paint.
- One retained handle can be drawn multiple times with distinct viewports,
  scissors, opacities, and instance ranges.
- The public contract defines logical pixels, DPR, clear color, caller-controlled
  frame submission, invalidation, and deterministic destruction.
- The renderer contains no Core imports or Core-specific view, facet, encoder,
  or scale-resolution types.
- Public JavaScript exports, package export metadata, declarations, examples,
  and documentation agree.
- Existing WebGL, Canvas, SVG, and explicit WebGPU lazy-loading behavior remains
  unchanged while the renderer API migrates.

## Design reference and provenance

- [CandyGraph](https://github.com/wwwtyro/candygraph) explicitly imports scales,
  primitives, axes, and coordinate systems, then submits renderables to a small
  renderer. Its
  [renderer implementation](https://github.com/wwwtyro/candygraph/blob/master/src/candygraph.ts)
  depends on generic renderable contracts rather than a central visualization
  grammar. That dependency direction informed this note.
- CandyGraph is licensed under
  [the Unlicense or MIT](https://github.com/wwwtyro/candygraph/blob/master/LICENSE),
  which is compatible with GenomeSpy's MIT license. No CandyGraph source has
  been copied or adapted for this design.

If implementation later adapts source rather than the architectural idea,
preserve the applicable copyright and license notice and record the provenance
in the change.

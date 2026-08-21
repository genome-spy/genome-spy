# WebGPU Renderer (Prototype)

This package is a renderer-only prototype for GenomeSpy. It is intentionally
low-level: WebGPU only, marks + WGSL shaders + GPU resources. There is no
dataflow engine, view hierarchy, or expr/param system here. The caller is
responsible for updating uniforms, feeding columnar data, and scheduling renders.

It is designed to be usable outside GenomeSpy: a generic, low-level library
for GPU-accelerated visualization. It currently lives in the GenomeSpy
monorepo to satisfy GenomeSpy’s requirements, but it may grow beyond them.

## Development Status

This package is unpublished work in progress. GenomeSpy Core is currently its
only consumer, and the API has no backward-compatibility commitment. Core
integration is expected to test the design: when the API forces awkward
translation, unclear ownership, unnecessary work, or blocks useful
optimizations, call the problem out explicitly and propose a better contract.
Breaking changes are preferable to preserving a poor boundary at this stage.

The renderer must remain generic despite this freedom. Improvements motivated
by Core should express reusable rendering concepts rather than import Core
types or reproduce its visualization grammar.

## Purpose

- Provide GPU-accelerated scales and rendering for visualization marks.
- Accept columnar, typed-array inputs (storage buffers + vertex pulling).
- Keep the public API small and data-first.

## What This Is (and Is Not)

- **Is:** a low-level rendering backend you can drive from another system.
- **Is not:** a full visualization grammar or runtime (no transforms, layout,
  or declarative spec handling in this package).

## Core Concepts

- **Series channels** are columnar buffers (`TypedArray`) uploaded to storage
  buffers.
- **Value channels** are uniforms (scalar or vectors). If `dynamic: false`, the
  value is inlined into WGSL to enable shader optimizations.
- **Scales** run on the GPU. Domains and ranges are updated per mark.
- **Definitions** are immutable imported values that provide mark or scale
  behavior. Renderer-created programs and slots own all mutable GPU state.

## Scales (d3 Mental Model)

Scales follow d3/Vega-Lite semantics, but they are not d3 objects. The renderer
compiles scale logic into WGSL and updates GPU resources directly.

Similarities:

- Same core families: `linear`, `log`, `pow`, `sqrt`, `symlog`, `identity`,
  `band`, `threshold`, `quantize`, `ordinal`.
- `domain` and `range` have the same intent as in d3.
- Clamping and rounding mirror d3 behavior for continuous scales.
- `scaleSequential` is represented as a continuous scale with an interpolator
  range (a color ramp texture is generated and sampled in WGSL).

Differences:

- No runtime scale objects or methods like `ticks`, `nice`, or `invert`; those
  are outside the renderer’s scope.
- Categorical domains are explicit `u32` arrays (string categories are
  preprocessed by the caller); values may be sparse, so ordinal/band use a GPU
  hash map to remap them.
- Piecewise/threshold stop counts are fixed at pipeline creation time; changing
  the number of stops requires a new mark.
- `index` is a renderer-specific scale for large, ordered integer domains (for
  example, genomic coordinates). It behaves like a band scale over an integer
  axis but does not require an explicit categorical domain list, making it
  suitable for huge index spaces and smooth zoom/pan windows. Domain values are
  supplied as JS numbers (effectively f64) to preserve precision when updating
  the window. See [High-Precision Index Scale](#high-precision-index-scale).

### Why GPU Scales?

Running scales on the GPU avoids per‑frame CPU recomputation when domains or
ranges change and keeps columnar data resident on the device for large, highly
interactive datasets. It also enables conditional encoding (selections) to run
directly in shaders without CPU-side filtering, and supports high‑precision
mapping of very large integer indices (for example, genomic coordinates)
without expanding vertices on the CPU.

## API (Public Surface)

- `createRenderer(canvas, { format?, alphaMode?, onInvalidate? })`
- `renderer.createMark(definition, config)` (returns `{ markId, series, scales, values, selections }`)
- `handle.series.replace(channels, count?)`
- `renderer.updateGlobals({ width, height, dpr })`
- `renderer.render({ draws?, clearColor? })`
- `renderer.destroyMark(markId)`
- `renderer.destroy()`

Type definitions live in `packages/webgpu-renderer/src/index.d.ts`. A draw
command references a retained handle and may provide a logical-pixel viewport,
scissor rectangle, and instance range. The ordered commands define both visible
and picking order without recreating mark resources. Omitting `draws` uses
creation order and a full-canvas viewport.

`updateGlobals({ width, height, dpr })` uses logical CSS-pixel dimensions. The
host owns the canvas backing size and should set it to `width * dpr` by
`height * dpr`; the renderer converts viewports and scissors to physical pixels
once when encoding the frame.

Asynchronous resource preparation never submits a frame implicitly. When text
atlas loading changes visible output, `onInvalidate` asks the host to schedule
and submit its current frame again.

The renderer owns its WebGPU device and all resources created for retained
marks. Call `destroyMark(markId)` when removing one mark while keeping the
renderer alive, and call `destroy()` when disposing the canvas integration.
`destroy()` is idempotent, releases every renderer-owned resource, unconfigures
the canvas context, and prevents subsequent rendering or handle updates.

Viewport-local position ranges are the caller's responsibility. This lets one
handle be reused in several same-shaped viewport occurrences; varying scale
ranges per occurrence will require a separate draw-time scale-state contract.

Built-in marks and scales are selected through side-effect-free subpath
imports:

```js
import { createRenderer } from "@genome-spy/webgpu-renderer";
import { pointMark } from "@genome-spy/webgpu-renderer/marks/point";
import { linearScale } from "@genome-spy/webgpu-renderer/scales/linear";
```

Mark subpaths are available for point, rect, rule, link, and text. Every
implemented scale has a factory subpath: identity, linear, log, pow, sqrt,
symlog, quantize, band, index, ordinal, and threshold. Identity is implicit when
a channel and its mark default have no scale; use `identityScale()` to override
a scaled mark default. Importing one feature does not include unrelated marks,
scales, or font support.

### GenomeSpy Core integration boundary

Core may use the package-root renderer API, documented mark handles and update
slots, and built-in definitions from the `marks/*` and `scales/*` subpaths. Its
imports must remain inside `packages/core/src/rendering/webgpu/`. Core must not
import renderer `src/*` internals, instantiate program classes, inspect
definition implementation fields, or depend on WGSL and GPU resource layouts.

This boundary defines the current dependency direction, not an obligation to
preserve an insufficient API. If integration cannot be expressed cleanly
through it, revise the renderer API and this section together instead of
embedding the workaround in Core.

## Definition contract (experimental)

A mark definition exposes its diagnostic type and a `createProgram` factory. A
scale config carries an immutable scale definition used by validation, resource
planning, and WGSL emission. Definitions contain no device, buffer, texture, or
other mutable renderer state, so callers can reuse them across marks.

The exact custom-definition authoring API is not stable. Built-in definition
values are the supported entry point during this migration. There is no global
registry or string-based compatibility entry.

## Quick Example

```js
import { createRenderer } from "@genome-spy/webgpu-renderer";
import { pointMark } from "@genome-spy/webgpu-renderer/marks/point";
import { linearScale } from "@genome-spy/webgpu-renderer/scales/linear";

const renderer = await createRenderer(canvas);
const x = new Float32Array([0, 0.5, 1]);
const y = new Float32Array([0.2, 0.8, 0.4]);
const points = renderer.createMark(pointMark, {
  channels: {
    x: {
      data: x,
      type: "f32",
      scale: linearScale({ domain: [0, 1], range: [20, 620] }),
    },
    y: {
      data: y,
      type: "f32",
      scale: linearScale({ domain: [0, 1], range: [420, 20] }),
    },
    size: { value: 100 },
  },
});

points.scales.x.setDomain([0.1, 0.9]);
points.series.replace({ x, y });
renderer.render({
  draws: [
    {
      mark: points,
      viewport: { x: 0, y: 0, width: 640, height: 440 },
      scissor: { x: 20, y: 20, width: 600, height: 400 },
    },
  ],
});
```

`count` is optional when at least one series channel is provided. The renderer
infers it from the series buffer lengths. For value-only marks, the count
defaults to `1`, so pass an explicit value when you want a different count.

## Slot Handles for Series, Scales, and Values

`createMark` returns slot handles that replace logical series and update scales
and dynamic values without looking up the mark through the renderer. Scale and
value slots are prevalidated at mark creation. A slot group exists only when
you define a scale or dynamic value for that channel, so you can treat it as
present in your own mark configs.

```js
const { scales, values, selections } = renderer.createMark(pointMark, {
  channels: {
    // ...
  },
});

const brushColor = scales.color.conditions.brush;
const brush = selections.brush;

scales.x.setDomain([0, 10]);
brushColor.setRange(["#000", "#f00"]);
values.size.set(4);
brush.set({ x: [0, 10] });
```

`default` refers to the unconditional branch of a channel. The group also
exposes `setDomain`/`setRange` (or `set`) convenience methods that forward to
the default slot, so `scales.x.setDomain(...)` and `scales.x.default.setDomain(...)`
are equivalent. Conditional slots are keyed by selection name
(`conditions.brush`, etc.) and always refer to the branch guarded by that
selection.

## Series Buffer Sharing

If multiple channels reference the same `TypedArray` at mark creation, the
renderer treats them as a shared series buffer and reuses a single GPU binding.
Sharing is determined by `TypedArray` identity and stays fixed for the mark.
`series.replace()` requires every series-backed logical channel configured on
the mark. Channels in a shared group must still use the same array instance
(you can swap to a new array as long as the group stays shared). Array lengths
may change. If you need a different sharing pattern, recreate the mark.

Text handles accept logical strings in the `text` series. The text definition
rebuilds glyph layout and expands the other per-string series as a complete set
while retaining the pipeline and font atlas. Numeric arrays must contain one
value per logical string; glyph-expanded arrays are renderer internals. Shared
source arrays remain shared after expansion. Scalar text requires an explicit
count.

## Selections & Conditional Encoding

The renderer supports selection-driven conditional encoding on the GPU. A
channel can declare conditions that switch between literal values or full
channel+scale branches. Selection predicates are always evaluated in data
domain space.

- `single`: a selected `uniqueId` (u32 uniform).
- `multi`: a set of selected IDs (hash-table buffer).
- `interval`: one or more scalar input ranges evaluated with AND semantics.
  Each target has an input name and may declare a ranged-datum endpoint with
  `intersects`, `encloses`, or `endpoints` hit testing.

Conditional channel branches are normalized into internal synthetic channels
(`fill__cond0`, etc.) for shader generation; users only define conditions on
the original channel.

When the default and conditional branches of a logical channel contain exactly
one series-backed branch, replace it using the original channel name. Multiple
series-backed branches remain valid for mark creation and rendering, but public
series replacement for that channel is not supported yet.

Update selection state via slot handles (`selections.brush.set(...)`). Interval
slots expose their stable `targets` order and accept a complete replacement;
omitted or `null` targets are inactive, and unknown target names are rejected.
Selection updates write the existing uniforms/buffers without rebuilding the
mark or bind group. For example, an x+y brush uses
`selections.brush.set({ x: [0, 10], y: [2, 8] })`.

## High-Precision Index Scale

The `index` scale supports large coordinate spaces with fractional domain
starts for smooth zooming/panning.

- **u32 series:** use `Uint32Array` and `inputComponents: 1`.
- **Large indices:** pass `Float64Array` series with `inputComponents: 2`.
  The renderer packs values into `[hi, lo]` u32 pairs internally.

This is designed for genome-scale coordinates (for example, human-sized
genomes and much larger ones such as axolotl or wheat), where integer indices
exceed the precision of f32.

Domain updates accept JS numbers. For advanced usage, you can pre-pack domains
or series with the helpers exported from `src/index.js`:

- `packHighPrecisionU32`, `packHighPrecisionU32Array`
- `packHighPrecisionDomain`

## Examples

Open `examples/basic.html` in a WebGPU-capable browser. Use a local server
because ES modules do not load from `file://` URLs.

## Storybook (Dev)

Storybook is set up for interactive examples and knobs.

- Start: `npm -w @genome-spy/webgpu-renderer run storybook`
- Build: `npm -w @genome-spy/webgpu-renderer run build-storybook`

Note: Storybook is pinned to 8.x for now because the 10.x addon set is not
fully published yet. The upgrade notice is safe to ignore.

## Tests

- GPU tests: `npm -w @genome-spy/webgpu-renderer run test:gpu`
- Tree-shaking contract: `npm -w @genome-spy/webgpu-renderer run test:bundle`
- Type checks: `npm -w @genome-spy/webgpu-renderer run test:tsc`
- Unit tests: `npx vitest --run --config vitest.config.js --root packages/webgpu-renderer`

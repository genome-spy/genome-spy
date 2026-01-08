# WebGPU Renderer (Prototype)

This package is a renderer-only prototype for GenomeSpy. It is intentionally
low-level: WebGPU only, marks + WGSL shaders + GPU resources. There is no
dataflow engine, view hierarchy, or expr/param system here. The caller is
responsible for updating uniforms, feeding columnar data, and scheduling renders.

It is designed to be usable outside GenomeSpy: a generic, low-level library
for GPU-accelerated visualization. It currently lives in the GenomeSpy
monorepo to satisfy GenomeSpy’s requirements, but it may grow beyond them.

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

- `createRenderer(canvas, options)`
- `renderer.createMark(type, config)` (returns `{ markId, scales, values, selections }`)
- `renderer.updateSeries(markId, channels, count?)`
- `renderer.updateValues(markId, values)`
- `renderer.updateGlobals({ width, height, dpr })`
- `renderer.render()`
- `renderer.destroyMark(markId)`

Type definitions live in `packages/webgpu-renderer/src/index.d.ts`.

## Custom Scales (Experimental)

You can register custom scale metadata with:

```js
import { registerScaleDef } from "@genome-spy/webgpu-renderer";

registerScaleDef("myScale", {
    input: "numeric",
    output: "f32",
    domainRange: true,
    params: [],
    continuous: true,
});
```

This registers the scale in the validation registry. WGSL emission hooks will
be added in later phases of the scale-def consolidation.

## Quick Example

```js
import { createRenderer } from "@genome-spy/webgpu-renderer";

const renderer = await createRenderer(canvas);
const { markId, scales } = renderer.createMark("rect", {
    channels: {
        x: {
            data: new Uint32Array([0, 1, 2]),
            type: "u32",
            scale: { type: "band", domain: [0, 1, 2] },
        },
        y: { value: 0, type: "f32", dynamic: true },
        fill: { value: [0.2, 0.5, 0.8, 1.0] },
    },
});

scales.x.setRange([0, canvas.width]);
renderer.render();
```

`count` is optional when at least one series channel is provided. The renderer
infers it from the series buffer lengths. For value-only marks, the count
defaults to `1`, so pass an explicit value when you want a different count.

## Slot Handles for Scales and Values

`createMark` returns slot handles that let you update scales and dynamic values
without string lookups. Slots are prevalidated at mark creation; updates are
lean and do not re-run full validation. A slot group exists only when you
define a scale or dynamic value for that channel, so you can treat it as
present in your own mark configs.

```js
const { scales, values, selections } = renderer.createMark("point", {
    channels: { ... },
});

const brushColor = scales.color.conditions.brush;
const brush = selections.brush;

scales.x.setDomain([0, 10]);
brushColor.setRange(["#000", "#f00"]);
values.size.set(4);
brush.set(0, 10);
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
When updating series data, all channels in the group must be updated together
with the same array instance (you can swap to a new array as long as the group
stays shared). Array lengths may change. If you need a different sharing
pattern, recreate the mark.

## Selections & Conditional Encoding

The renderer supports selection-driven conditional encoding on the GPU. A
channel can declare conditions that switch between literal values or full
channel+scale branches. Selection predicates are always evaluated in data
domain space.

- `single`: a selected `uniqueId` (u32 uniform).
- `multi`: a set of selected IDs (hash-table buffer).
- `interval`: numeric range over a specified channel (vec2 uniform).

Conditional channel branches are normalized into internal synthetic channels
(`fill__cond0`, etc.) for shader generation; users only define conditions on
the original channel.

Update selection state via slot handles (`selections.brush.set(...)`), which
write the selection uniforms/buffers without rebuilding the mark.

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
- Type checks: `npm -w @genome-spy/webgpu-renderer run test:tsc`
- Unit tests: `npx vitest --run --config vitest.config.js --root packages/webgpu-renderer`

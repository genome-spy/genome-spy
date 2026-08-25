# WebGPU Renderer (Prototype)

A low-level, retained WebGPU renderer for GPU-accelerated visualization marks.
It accepts columnar typed-array data, evaluates scales and conditional
encodings in WGSL, and keeps mark resources resident across frames.

> **Development status:** This package is unpublished work in progress.
> GenomeSpy Core is its only current consumer, and the API has no
> backward-compatibility commitment.

## Quick start

This example creates a retained point mark, updates its data and x-scale, and
submits one ordered draw.

```js
import { createRenderer } from "@genome-spy/webgpu-renderer";
import { pointMark } from "@genome-spy/webgpu-renderer/marks/point";
import { linearScale } from "@genome-spy/webgpu-renderer/scales/linear";

const canvas = document.querySelector("canvas");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("The page must contain a canvas element.");
}

const width = 640;
const height = 440;
const dpr = window.devicePixelRatio ?? 1;

canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;
canvas.width = width * dpr;
canvas.height = height * dpr;

const renderer = await createRenderer(canvas);
renderer.updateGlobals({ width, height, dpr });

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
    size: { value: 100, dynamic: true },
  },
});

const nextX = new Float32Array([0.1, 0.5, 0.9]);
const nextY = new Float32Array([0.3, 0.7, 0.5]);

points.batchUpdates(() => {
  points.scales.x.setDomain([0.1, 0.9]);
  points.values.size.set(120);
  points.series.replace({ x: nextX, y: nextY });
});

renderer.render({
  draws: [
    {
      mark: points,
      viewport: { x: 0, y: 0, width, height },
      scissor: { x: 20, y: 20, width: 600, height: 400 },
    },
  ],
});
```

`count` is inferred when at least one series channel is present. Value-only
marks default to one instance; pass `count` explicitly when they should draw a
different number. Call `renderer.destroy()` when the canvas integration is
removed.

## Rendering model

### What the renderer owns

The renderer owns its WebGPU device and all GPU resources created for retained
marks and placement sets. A mark keeps compatible pipelines, buffers,
textures, and bindings across draws and retained updates.

Definitions are immutable imported values that describe mark or scale
behavior. Renderer-created programs and slot handles own mutable GPU state.

### What the host owns

The host supplies data, layout, frame order, and scheduling. It is responsible
for:

- setting the canvas backing size and logical dimensions;
- providing typed-array or literal channel values;
- supplying viewport-local scale ranges;
- submitting ordered frames; and
- scheduling another frame when `onInvalidate` fires.

The package has no dataflow engine, view hierarchy, layout system,
transformation pipeline, or declarative visualization grammar. It does not
evaluate a host application's expression or parameter language.

### Channels

- **Series channels** contain columnar `TypedArray` data uploaded to storage
  buffers.
- **Value channels** contain scalar or vector values. They are inlined into WGSL
  by default; set `dynamic: true` to store them in uniforms and expose update
  slots.
- **Scales** map channel inputs on the GPU. Their domains and ranges can be
  updated without recreating the mark when their shape stays compatible.
- **Inputs** are non-visual series available to visibility and selection
  predicates.

## Public API

### Package entry points

The package root exports `createRenderer` and `RendererError`. Built-in marks
and scales use explicit, side-effect-free subpaths so bundlers can exclude
unused features.

Available mark subpaths are `marks/point`, `marks/rect`, `marks/rule`,
`marks/link`, `marks/arrow`, and `marks/text`. Scale subpaths are
`scales/identity`, `scales/linear`, `scales/log`, `scales/pow`, `scales/sqrt`,
`scales/symlog`, `scales/quantize`, `scales/band`, `scales/index`,
`scales/ordinal`, and `scales/threshold`.

Advanced helpers have their own typed subpaths:

| Subpath           | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `high-precision`  | Pack large integer series and index-scale domains.             |
| `scale-authoring` | Experimental WGSL scale-emission helpers.                      |
| `debug`           | Enable renderer resource logging.                              |
| `fonts/lato`      | Register the embedded Lato Regular font as the default preset. |

Importing one mark or scale does not include unrelated marks, scales, or font
assets. The Lato entry point is the only intentional registration side effect.

### Renderer lifecycle

The main operations are:

| API                                              | Purpose                                                    |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `createRenderer(canvas, options?)`               | Create and configure the device and canvas context.        |
| `renderer.updateGlobals({ width, height, dpr })` | Set logical canvas dimensions and device pixel ratio.      |
| `renderer.createMark(definition, config)`        | Create a retained mark and its update handles.             |
| `renderer.createPlacementSet(data)`              | Create retained normalized placement rectangles.           |
| `renderer.render(frame?)`                        | Submit an ordered visible frame.                           |
| `renderer.renderPicking(frame?)`                 | Set the ordered frame used for on-demand picking.          |
| `renderer.pick(x, y)`                            | Resolve a pick ID asynchronously at a canvas coordinate.   |
| `renderer.destroyMark(markId)`                   | Release one retained mark.                                 |
| `renderer.destroy()`                             | Release all renderer resources and unconfigure the canvas. |

`destroy()` is idempotent. Rendering and retained handle updates fail after
destruction.

### Canvas sizing and invalidation

`updateGlobals({ width, height, dpr })` uses logical CSS-pixel dimensions. The
host owns the canvas backing size and should set it to `width * dpr` by
`height * dpr`. The renderer converts viewports, scissors, attachments, and
picking coordinates to physical pixels.

Asynchronous preparation never submits a frame implicitly. Pass an
`onInvalidate` callback to `createRenderer` and schedule the current frame
again when, for example, a text atlas becomes ready.

### Ordered draws and picking

A draw command references a retained mark and may provide a logical-pixel
viewport, scissor rectangle, visible range, instance range, and placement.
Array order defines paint order. The same normalized ordering and ranges can
be used for visible and picking frames without recreating mark resources.

Omitting `draws` renders retained marks in creation order using the full canvas
viewport. One mark handle may appear in several draws with different
viewports, clips, and ranges.

Viewport-local position ranges are the caller's responsibility. This lets one
handle serve several same-shaped viewport occurrences. Occurrence-local scale
domains would require a separate draw-time scale-state contract.

## Retained updates

### Mark handles and slots

`createMark` returns a handle containing `series`, `scales`, `values`,
`properties`, `extraValues`, `scalarSlots`, and `selections`. These handles
update retained resources directly without looking up the mark through the
renderer.

Scale and value slots exist only for channels configured with a scale or
dynamic value. `default` identifies an unconditional channel branch, while
`conditions` contains branches keyed by selection name.

```js
const { scales, values } = points;

scales.x.setDomain([0, 10]);
values.size.set(4);
```

`scales.x.setDomain(...)` is a convenience form of
`scales.x.default.setDomain(...)`.

Conditional scale and value slots are keyed by selection name. For example,
`mark.scales.color.conditions.brush.setRange(...)` updates the color scale used
by a condition guarded by `brush`.

### Built-in mark properties

Built-in marks expose their updateable non-channel options through typed
`properties` slots. These slots use API values rather than shader
representations: arrow angles are degrees, enum-like options are strings, and
Boolean options remain Boolean.

```js
arrows.properties.headAngle.set(35);
arrows.properties.headShape.set("open");
labels.properties.viewport.set([0, 0, 640, 480]);
```

`extraValues` is the low-level counterpart for custom mark definitions whose
configuration intentionally names extra uniforms. Compose the custom config
type with `ExtraValueMarkOptions` to type their initial `dynamicValues`.
Built-in uniform names are implementation details and are not a public update
contract.

### Batched updates

Individual slot mutations take effect immediately. Use `batchUpdates` when
several related values change together so the renderer uploads uniforms,
rebuilds bindings when necessary, and invalidates picking only once.

```js
points.batchUpdates(() => {
  points.scales.x.setDomain([0, 10]);
  points.values.size.set(4);
});
```

### Series replacement

`mark.series.replace(channels, count?)` replaces every series-backed logical
channel configured on the mark. Array lengths may change. The replacement must
preserve the mark's channel shape and buffer-sharing groups; recreate the mark
when those structural contracts change.

If several channels reference the same `TypedArray` at mark creation, the
renderer packs them as one shared series. Sharing is based on array identity.
Those channels must receive the same replacement array instance to remain
shared.

## Scales

### D3 and Vega-Lite similarities

The scale configs follow familiar d3 and Vega-Lite semantics, but they are not
runtime d3 objects. The renderer compiles their mapping logic into WGSL and
updates GPU resources directly.

- `domain` and `range` have the usual mapping intent.
- Continuous-scale clamping and rounding follow d3 behavior.
- Sequential scales use a continuous scale with an interpolator range; the
  renderer creates a color-ramp texture and samples it in WGSL.
- Built-in families include `linear`, `log`, `pow`, `sqrt`, `symlog`,
  `identity`, `band`, `threshold`, `quantize`, `ordinal`, and `index`.

### Constraints and differences

- The renderer does not provide `ticks`, `nice`, `invert`, or other runtime
  scale methods.
- Categorical domains are explicit `u32` arrays. The caller preprocesses
  string categories, and ordinal and band scales use a GPU hash table to map
  sparse values.
- Piecewise and threshold stop counts are fixed at pipeline creation. Recreate
  the mark to change their lengths.
- Identity is implicit when a channel and its mark default have no scale. Use
  `identityScale()` to override a scaled mark default explicitly.

### Why scales run on the GPU

GPU scales keep columnar data resident while domains or ranges change. This
avoids per-frame CPU projection for large interactive datasets and lets
conditional encodings and high-precision integer mapping run directly in the
shader.

### High-precision index scale

The renderer-specific `index` scale maps large ordered integer domains without
an explicit categorical domain list. It behaves like a band scale over an
integer axis and supports fractional domain starts for smooth zooming and
panning.

- Use `Uint32Array` with `inputComponents: 1` for ordinary u32 indices.
- Use `Float64Array` with `inputComponents: 2` for larger indices. The renderer
  packs them into `[hi, lo]` u32 pairs.

Domain updates accept JavaScript numbers. Advanced callers can pre-pack values
through the high-precision subpath:

```js
import {
  packHighPrecisionDomain,
  packHighPrecisionU32,
  packHighPrecisionU32Array,
} from "@genome-spy/webgpu-renderer/high-precision";
```

## Placement and visibility

### Placement sets

A placement set contains normalized `[x, y, width, height]` rectangles relative
to a draw viewport. It is retained independently of marks and can be replaced
or destroyed without recreating their pipelines.

Faceted views and small multiples are primary use cases. One retained mark and
its shared scale state can be reused across many facet rectangles instead of
creating GPU resources for every panel. The caller remains responsible for
facet grouping, layout, data ranges, and scale-resolution policy; the renderer
treats facets as generic indexed placements.

A mark chooses one placement-index mode at creation:

- `{ source: "draw" }` selects a rectangle from each draw command.
- `{ data: Uint32Array, type: "u32" }` selects a rectangle per instance.

Draw-level placement is useful for facet-specific data ranges, ordered panels,
and CPU visibility pruning:

```js
const placements = renderer.createPlacementSet({
  rectangles: new Float32Array([0, 0, 0.5, 1, 0.5, 0, 0.5, 1]),
});

const mark = renderer.createMark(pointMark, {
  placementIndex: { source: "draw" },
  channels: {
    // ...
  },
});

renderer.render({
  draws: [{ mark, placement: { set: placements, index: 1 } }],
});
```

Per-instance placement keeps compatible instances, such as labels or metadata
belonging to many facets, in one draw:

```js
const mark = renderer.createMark(pointMark, {
  placementIndex: { data: new Uint32Array([0, 1]), type: "u32" },
  channels: {
    // ...
  },
});

renderer.render({ draws: [{ mark, placement: { set: placements } }] });
```

The rectangle payload is 16 bytes per placement before capacity alignment. A
per-instance index adds four bytes per logical instance. A zero-area rectangle
suppresses that placement in both normal and picking passes. Set
`clipToPlacement` to `"x"`, `"y"`, or `"xy"` when geometry must be clipped to
the selected rectangle.

### Visibility predicates

Every built-in mark accepts an immutable `visibleWhen` predicate. It can
compare scalar channels, non-visual `inputs`, and retained `scalarSlots`, and
combine leaves with non-empty `all` and `any` nodes. The same predicate runs in
normal and picking vertex pipelines.

```js
const mark = renderer.createMark(pointMark, {
  count: scores.length,
  channels: {
    // ...
  },
  inputs: {
    score: { data: scores, type: "f32" },
  },
  scalarSlots: {
    threshold: { value: 0.5, type: "f32" },
  },
  visibleWhen: {
    compare: ">=",
    left: { input: "score" },
    right: { slot: "threshold" },
  },
});

mark.scalarSlots.threshold.set(0.75);
```

Visibility affects rendering and picking only. It does not filter data,
aggregates, or scale domains.

## Selections and conditional encoding

Selection predicates run on the GPU in data-domain space. Conditional channel
branches may switch between literal values or complete channel-and-scale
configs.

Supported selection types are:

- `single`: one selected `uniqueId` in a u32 uniform;
- `multi`: selected IDs in a GPU hash table; and
- `interval`: one or more scalar input ranges combined with AND semantics.

An interval target can name a ranged-datum endpoint and use `intersects`,
`encloses`, or `endpoints` hit testing. For a mark configured with an interval
selection named `brush`, update its state through the corresponding slot:

```js
mark.selections.brush.set({ x: [0, 10], y: [2, 8] });
```

Interval slots expose their stable target order. A complete replacement may
omit a target or set it to `null` to make it inactive; unknown targets are
rejected.

Conditional branches are normalized to private synthetic channels for shader
generation. When a logical channel has exactly one series-backed branch,
replace it through the original channel name. Marks with several series-backed
branches render correctly, but independent public replacement of those branches
is not yet supported.

## Text and fonts

Import the embedded Lato preset only when a text mark needs it:

```js
import { textMark } from "@genome-spy/webgpu-renderer/marks/text";
import "@genome-spy/webgpu-renderer/fonts/lato";

const labels = renderer.createMark(textMark, {
  channels: {
    // text, x, and y channel definitions
  },
  font: "Lato",
});
```

Text series and draw ranges use logical strings. The retained text program
builds private glyph geometry, maps glyphs back to logical series, and keeps
the pipeline and atlas when `series.replace()` changes the strings. Numeric
text channels contain one value per logical string; scalar text replacement
requires an explicit count. Empty strings are valid, and shared logical source
arrays remain shared.

The renderer accepts host-provided font resources at the GenomeSpy Core
integration boundary. Standalone users do not need to construct or expose the
bundled preset's font metrics and bitmap resources.

## Integration and extension boundaries

### GenomeSpy Core

Core imports only the package root, documented mark and scale subpaths, and
advanced public helpers. Its imports stay under
`packages/core/src/rendering/webgpu/`.

Core must not import renderer implementation modules, instantiate program
classes, inspect definition internals, or depend on WGSL and GPU resource
layouts. If the public contract forces an awkward workaround, revise the
renderer API and this boundary together instead of embedding Core concepts in
the renderer.

### Custom definitions

A mark definition provides a diagnostic type and a `createProgram` factory. A
scale config carries an immutable definition used by validation, resource
planning, and WGSL emission. Definitions contain no device, buffer, texture, or
other mutable renderer state, so they can be reused across marks.

Custom definition authoring remains experimental. Built-in definitions are the
supported entry points during migration. There is no global registry or
string-based compatibility API.

## Examples and development

### Browser examples

Open [examples/basic.html](examples/basic.html) through a local server in a
WebGPU-capable browser. The example picker includes points, bars, hatches,
scales, rules, links, text, and ranged text. ES modules do not load from
`file://` URLs.

### Storybook

Storybook contains interactive retained-renderer scenes and controls.

- Start: `npm -w @genome-spy/webgpu-renderer run storybook`
- Build: `npm -w @genome-spy/webgpu-renderer run build-storybook`

Storybook remains on 8.x because its 10.x addon set is not fully published.
The upgrade notice can be ignored.

### Verification

- Package delivery checks: [scripts/README.md](scripts/README.md)
- Unit tests:
  `npx vitest --run --config vitest.config.js --root packages/webgpu-renderer`
- GPU tests: `npm -w @genome-spy/webgpu-renderer run test:gpu`
- Tree-shaking contract:
  `npm -w @genome-spy/webgpu-renderer run test:bundle`
- Type checks: `npm -w @genome-spy/webgpu-renderer run test:tsc`

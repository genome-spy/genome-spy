# Rendering modules

This directory contains renderer orchestration and the modular rendering
implementations that are independent of GenomeSpy's original WebGL path. The
layout keeps backend ownership explicit, avoids pulling optional renderers into
the synchronous ESM entry, and leaves a clear location for an eventual WebGPU
renderer.

## Directory layout

- `renderingBackend.js` selects the live backend and exposes its capabilities,
  such as surface sizing, rendering, raster export, and optional picking.
- `canvasSizeHelper.js` provides backend-neutral logical and physical surface
  sizing.
- `canvas2d/` owns live Canvas2D rendering and detached PNG export.
- `svg/` owns structured SVG export, including hybrid raster-run discovery and
  document paint order.
- `immediate/` projects and culls mark occurrences for Canvas2D and SVG. Its
  mark visitors and geometry helpers are backend-neutral.

Canvas2D and SVG are loaded dynamically. Keep their implementation modules,
and the immediate-mode modules they use, out of statically imported production
entry points.

## Dependency boundaries

Dependencies point from Canvas2D and SVG into `immediate/`, never in the other
direction. The immediate layer must not import Canvas2D, SVG, WebGL, or WebGPU
code. Backend-specific emitters translate its projected occurrences into their
own drawing operations; there is intentionally no universal path or low-level
drawing interface shared by every renderer.

The existing WebGL implementation is a transitional exception. Its programs,
buffers, textures, uniforms, and draw code remain in `src/marks/` and
`src/gl/`. Do not move or wrap that code merely to make the directory tree
symmetrical.

SVG hybrid rasterization is another deliberate, narrow exception.
`svg/raster/webgl.js` may use the existing WebGL renderer to rasterize selected
contiguous mark runs, but it remains a lazy leaf. SVG continues to own visible
instance counting, run selection, placeholders, cropping, and paint order.

## Future WebGPU renderer

A WebGPU implementation should live in `rendering/webgpu/` and may coexist with
the current WebGL path during migration. WebGL can continue calling the
mark-owned rendering methods while WebGPU dispatches semantic marks through
renderer-owned implementations.

WebGPU should own its device and surface state, pipelines, buffers, textures,
bind groups, shaders, render passes, and picking resources. Per-mark GPU state
should be held by the renderer, for example in maps keyed by mark identity,
rather than added to mark instances. This keeps semantic marks usable by
multiple backends and makes backend lifetime and disposal explicit.

The shared boundary should remain high-level: prepared views, semantic mark
state, encodings, scales, render scheduling, surface management, export, and
capabilities. WebGPU should not emulate `glHelper`, inherit WebGL resource
assumptions, or depend on the immediate-mode CPU projection layer merely
because both execute some CPU code. A WebGPU renderer can reuse backend-neutral
semantics while choosing its own batching, resource, and shader architecture.

Avoid introducing placeholder WebGPU modules or a generalized rasterizer
contract before a second GPU backend needs those abstractions. Add common
interfaces only when two concrete implementations demonstrate the same stable
requirement.

For broader runtime context, see
[`../../docs/architecture/rendering.md`](../../docs/architecture/rendering.md).

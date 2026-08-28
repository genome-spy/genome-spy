# Rendering modules

This directory contains renderer orchestration and backend-owned rendering
implementations. Optional renderers stay outside Core's synchronous ESM entry
graph and expose only the capabilities needed by shared orchestration.

## Directory layout

- `renderingModuleRegistry.js` holds the renderer loaders enabled by the active
  package entrypoint or explicit opt-in imports.
- `renderingBackend.js` selects a registered live backend and exposes its
  surface, coordinator, raster operations, and optional picking capability.
- `canvasSizeHelper.js` provides backend-neutral logical and physical surface
  sizing.
- `canvas2d/` owns live Canvas2D rendering and detached rasterization.
- `svg/` owns structured SVG export, including hybrid raster-run discovery and
  document paint order.
- `immediate/` projects and culls mark occurrences for Canvas2D and SVG.
- `webgl/` owns the complete legacy WebGL implementation: TWGL, GLSL, mark GPU
  delegates, batching, picking, textures, framebuffer export, and cleanup.
- `webgpu/` is the development-only adapter for the independently selectable
  WebGPU renderer.

## Dependency boundaries

Semantic mark classes under `src/marks/` retain configuration, encoders, data,
and rendering revisions. A selected retained-mode backend may attach an opaque
per-mark delegate through the renderer-resource lifecycle; shared code does not
import its buffers, shaders, textures, or helper types.

Canvas2D and SVG depend on `immediate/`, never the other way around. The
immediate layer must not import Canvas2D, SVG, WebGL, or WebGPU code. There is
intentionally no universal low-level drawing interface shared by every
renderer.

The `register*.js` modules are the only static bridge to renderer factories.
Their dynamic imports keep WebGL, Canvas2D, and SVG out of the minimal entrypoint
unless explicitly enabled. Keep all TWGL and GLSL imports
under `webgl/`; adding one elsewhere would pull the temporary renderer back
into the synchronous ESM graph.

Raster export and hybrid SVG use optional capabilities rather than a WebGL
helper. A selected GPU backend is never initialized a second time for export;
Canvas2D may provide a detached fallback. SVG retains ownership of visible
instance counting, run selection, placeholders, cropping, and paint order.

The WebGL directory is a deletion boundary, not a reusable renderer framework.
When WebGPU and Canvas2D cover production needs, removing the dynamic WebGL
factory and its directory should remove the legacy renderer without another
shared-Core redesign.

For broader runtime context, see
[`../../docs/architecture/rendering.md`](../../docs/architecture/rendering.md).

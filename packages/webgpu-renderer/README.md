# WebGPU Renderer (Prototype)

This package is a minimal, renderer-only prototype for GenomeSpy. It focuses on
WebGPU execution only: marks, WGSL shaders, GPU buffers, and a basic render loop.
There is no dataflow, view hierarchy, or param/expr system here.

## Goals

- Columnar typed-array inputs
- Storage buffers + vertex pulling
- Clean, data-first API
- No texture handles leaked in public API

## Status

Prototype. Expect missing features and TODOs.

## Quick Start (Manual)

Open `examples/basic.html` in a browser that supports WebGPU.
You may need a local server due to module imports.

## API (Sketch)

- `createRenderer(canvas, options)`
- `renderer.createMark(type, config)`
- `renderer.updateInstances(markId, fields, count)`
- `renderer.updateGlobals({ width, height, dpr })`
- `renderer.render()`

See `examples/basic.html` for usage.

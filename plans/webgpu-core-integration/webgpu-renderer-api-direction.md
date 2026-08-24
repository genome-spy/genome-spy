# WebGPU renderer API direction

Status: Complete and reconciled; ready to retire.

Date: 2026-08-21

Final reconciliation: 2026-08-24

This note records the final disposition of the API questions that guided Core
integration. The implemented contract and declarations are the source of truth.

## Implemented contract

`@genome-spy/webgpu-renderer` is code-first and retained:

- concrete mark and scale definitions are imported explicitly;
- Core translates grammar, encoders, resolved scales, and completed layout
  occurrences;
- retained marks own pipelines, buffers, textures, and update slots;
- hosts submit ordered draws with explicit viewport, scissor, opacity, range,
  and optional placement state;
- retained `PlacementSet` handles support draw-level and per-instance indices
  without exposing Core facet concepts;
- placement geometry remains separate from future occurrence-local scale
  state;
- normal and picking frames share normalized placement, ranges, and identity;
  and
- resource destruction and asynchronous invalidation are explicit.

The renderer remains independent of Core types, view objects, declarative
grammar, grouping, and layout algorithms.

## Resolved questions

### Occurrence placement

Core/App publish immutable renderer-neutral placement topology and geometry.
WebGL and WebGPU derive and own backend resources. Complete sample membership
defines stable dense indices; presentation updates may replace geometry without
repacking mark data. Ordered overlapping occurrences remain separate, while
indexed labels and metadata may coalesce. Independent facet domains are
explicitly deferred to a separate scale-state design.

### Resize ownership

The host owns CSS and backing-store canvas dimensions. It supplies logical
width, logical height, and DPR through `Renderer.updateGlobals()`. The renderer
owns attachments and picking resources derived from those values. Core's
`WebGpuSurface` implements this split through `CanvasSizeHelper`.

### Optional construction and validation

An existing-device/context factory is discarded until a concrete embedding
consumer requires it. Public-import bundle fixtures now verify the export map
and exclusion of unrelated programs and font assets. Development-only
diagnostic stripping remains a package backlog item; boundary safety checks
stay enabled meanwhile.

## Preserved boundaries

- No renderer scene graph or Core-specific facet abstraction.
- No synchronous facade over asynchronous WebGPU picking.
- No declarative compatibility layer without a concrete consumer.
- Feature modules remain side-effect-free except the documented opt-in font
  registration entry point.

All API-direction questions are implemented, transferred to the package
migration backlog, or explicitly discarded. This note can be deleted in the
next commit with the other temporary plans.

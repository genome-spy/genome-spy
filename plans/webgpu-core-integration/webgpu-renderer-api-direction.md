# WebGPU renderer API direction

Status: Follow-up design — the core retained-renderer contract is implemented;
occurrence-specific scale state and resize ownership remain open.

Date: 2026-08-21

This temporary note records only the API decisions that still guide the
experimental WebGPU integration. Completed migration steps and PoC history have
been removed; see Git history for those details.

## Current contract

`@genome-spy/webgpu-renderer` is code-first and retained:

- concrete mark and scale definitions are imported explicitly;
- Core translates grammar, encoders, resolved scales, and view traversal;
- retained marks own pipelines, buffers, textures, and update slots;
- hosts submit an explicit ordered draw list with per-occurrence viewport,
  scissor, opacity, and instance-range state;
- logical pixels and DPR are explicit renderer inputs;
- asynchronous preparation invalidates the host instead of submitting hidden
  frames; and
- renderer and mark destruction is deterministic and idempotent.

The renderer remains independent of Core types, view objects, facet concepts,
and declarative grammar. No source code was copied from the architectural
references used during the original design.

## Remaining design questions

### Occurrence-specific scale state

The draw list supports repeated use of one retained mark, but Core currently
stores positional scale ranges on the retained handle. Repeated occurrences
whose pixel ranges differ are therefore not supported. The next design must
choose one of:

- draw-time scale ranges in the occurrence descriptor;
- a layout-instance resource that binds occurrence-local scale state; or
- another generic mechanism that preserves retained resources without making
  the renderer aware of Core views.

The decision must cover scale sharing, dynamic range updates, clipping, opacity,
instance ranges, and normal/picking draw parity.

### Resize ownership

The API accepts logical dimensions and DPR, but ownership of backing-store
resizing between the host and renderer is not final. Choose one authoritative
owner and make logical-to-physical conversion happen exactly once. Verify
viewports, scissors, picking coordinates, and attachment sizes together.

### Optional construction and validation

An advanced factory accepting an existing `GPUDevice` and context may be useful
for embedding, but is not required by Core. A production bundle fixture should
eventually verify that importing only selected marks and scales excludes
unrelated programs and font code. Validation should remain enabled until the
repository has a documented compile-time development/production build
contract.

## Boundaries and non-goals

- Do not move Core grammar, encoders, scale resolution, dataflow, or view
  hierarchy into the renderer.
- Do not add a renderer scene graph or a Core-specific facet abstraction.
- Do not disguise asynchronous WebGPU picking as Core's synchronous API.
- Do not add a declarative compatibility facade until a concrete consumer needs
  it; if added, keep it outside the code-first core path.
- Keep feature modules side-effect-free and tree-shakeable.

## Acceptance before retiring this note

- One retained mark can be drawn multiple times with distinct occurrence-local
  scale state, viewport, scissor, opacity, and instance range.
- Resize behavior is explicit and consistent for rendering and picking.
- Standalone imports and production bundle checks agree with the public export
  map and declarations.
- Core, WebGL, Canvas, and SVG behavior remain unchanged for non-WebGPU users.

Before merge, resolve or explicitly discard every open question, commit that
record, then delete this temporary note with the other plans.

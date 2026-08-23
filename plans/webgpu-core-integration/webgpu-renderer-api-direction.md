# WebGPU renderer API direction

Status: Follow-up design — the core retained-renderer contract is implemented;
occurrence placement direction is selected and resize ownership remains open.

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

### Occurrence placement and future scale state

The selected current direction keeps one retained mark and shared scale domains
while separating placement from channel data:

- App/Core share a renderer-neutral, revisioned CPU placement source through
  rendering options and `LayoutResult`; App code owns no GPU resource.
- WebGL derives its facet-coordinate texture from that source inside the
  WebGL backend, while WebGPU derives a renderer-private indexed resource
  inside the WebGPU surface/renderer.
- The renderer exposes retained, updateable `PlacementSet` handles containing
  generic 2D normalized `[x, y, width, height]` rectangles relative to an
  explicit owner viewport, with top-left origin and downward y. Mark creation
  fixes whether draws select one placement or a `u32` series selects per
  instance; scissoring and directional x/y/xy `clipToPlacement` remain draw
  state.
- Core packs facet data once and adds a generic `u32` placement index.
- A renderer-owned placement resource maps the index to a rectangle; storage
  is preferred only if it fits the default binding budget.
- Both range-mode batches and high-cardinality `facetIndex` marks use this same
  contract. Indexed marks can coalesce to one draw; data-heavy range batches
  retain draw-level indices so offscreen facets are CPU-pruned in closeup mode.
- Semantic sample/facet keys are resolved to dense indices only when topology
  changes. Geometry-only frames, culling, series updates, and draw submission
  use numeric arrays and direct indexing with no per-facet map or composite-key
  lookup.
- Ordered draw splitting is reserved for overlapping occurrences whose paint
  order would otherwise change.
- Positional scale output is viewport-local and normalized before placement.

Placement and scale state remain separate. If Core later supports independent
facet domains, the renderer must add generic draw-time or per-instance scale
overrides on the same retained mark. Independent domains must not require
per-facet mark programs or make the renderer aware of Core facet types.

This contract replaces the current `View.getSampleFacetTexture()` escape hatch
and `Mark.getSampleFacetMode()` ancestor-spec inspection. Canvas2D and SVG read
the same CPU source directly; sharing placement semantics does not require a
universal low-level renderer interface.

The layout result freezes occurrence topology and the semantic-key-to-dense-
index mapping, but the source may publish immutable geometry revisions between
layout passes. This preserves SampleView peek/scroll as layout-free presentation
updates. A backend captures one revision per frame; topology changes still
require a new layout result.

SampleView publishes flat role-specific placement tables for samples,
summaries, and groups/backgrounds from one presentation revision. Common
container clips remain directional draw state; mark self clipping intersects
the placement only when Core requests it. The renderer never receives Core's
closure-backed `Rectangle` graph.

Core may regroup non-contiguous occurrences only inside a repeated batch whose
placement snapshot guarantees pairwise-disjoint non-empty rectangles. Batches
that may overlap retain original order and coalesce only adjacent compatible
occurrences.

The renderer does not implement facet grammar, grid/wrap algorithms, data
grouping, headers, axes, or scale-resolution policy. Core supplies rectangles.
Future per-panel x/y scale state remains a separate, substantial extension
from placement geometry and may require a revised mark contract.

The detailed design and milestones are in
`webgpu-renderer-parity-plan.md`.

Layout 2.0 Phase 1 is already merged. The renderer-neutral Core/App/WebGL
placement contract must be implemented and merged on `master` first. The
`webgpu` branch then consumes that contract; it must not become the source
branch for a later Core back-port. Discarded later Layout 2.0 phases are not
prerequisites.

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

- One retained mark can be drawn repeatedly at ordered paint boundaries or
  once with per-instance placement indices; both forms share scale state and
  retained resources.
- The placement API leaves a separate extension point for future
  occurrence-local scale domains on the same retained mark.
- Resize behavior is explicit and consistent for rendering and picking.
- Standalone imports and production bundle checks agree with the public export
  map and declarations.
- Core, WebGL, Canvas, and SVG behavior remain unchanged for non-WebGPU users.

Before merge, resolve or explicitly discard every open question, commit that
record, then delete this temporary note with the other plans.

# WebGPU renderer parity plan: remaining work

Status: Functional parity milestones complete; faceted rendering postponed.

This note contains only parity work that is not already complete. Core owns
grammar, dataflow, scale resolution, selection semantics, and occurrence
traversal. The WebGPU adapter translates those semantics to the generic
retained renderer, while WebGL remains the behavioral reference.

## Completed parity boundary

The renderer and adapter now support the completed interval-selection and
scalar-visibility contracts, including retained updates and normal/picking
pipeline behavior. Their implementation plans and detailed test recipes were
completed and removed from this document.

The following remain explicit unsupported capabilities rather than accidental
gaps: quantile and bin-ordinal scales, time/UTC scales, and interval predicates
over two-component high-precision index/locus inputs.

## Remaining milestone

### Faceted and sample-faceted rendering — postponed

The adapter still rejects `options.sampleFacetRenderingOptions` and
`mark.encoders.facetIndex`. WebGL renders one occurrence per facet with
facet-specific data and coordinates. WebGPU does not yet model occurrence
ownership, retained draw lifetimes, facet-local selections, or facet-scoped
picking.

Do not implement, redesign, or expand this work until explicitly authorized.
When resumed, it must:

- reuse Core's occurrence traversal and facet-coordinate calculations;
- create one retained draw/configuration per visible facet occurrence;
- preserve draw ordering, clipping, visible-range culling, opacity, and empty
  facet behavior;
- define facet-local unique-ID and selection scoping before facet picking; and
- keep facet grouping and placement in Core, with no Core-specific concepts in
  `packages/webgpu-renderer`.

Tentative commit after authorization:
`feat(core): render WebGPU facet occurrences`.

## Verification when resumed

Use representative faceted and sample-faceted examples under WebGL and WebGPU.
Verify visible output, empty facets, clipping, ordering, selections, tooltips,
and picking at DPR 1 and 2. Run the full example runner afterward and record
every remaining failure in `webgpu-core-integration-plan.md`.

Before merge, resolve or explicitly discard this postponed milestone, commit
that record, then delete this temporary plan with the other plans.

# Separate sample placements from camera scrolling

## Goal

Keep the sample placement buffer resident during a fully open SampleView scroll.
Preserve the same row positions, clipping, paint order, picking, and exports.
The first version covers translation of fixed row and group geometry. Opening
and closing close-up mode can change row heights and gaps independently and
continues to publish new geometry.

## Ownership and contract

App's `LocationManager` owns the sample geometry and scroll offset. Its
`#updatePlacementGeometry` currently walks the full sample set and publishes a
fresh rectangle snapshot on each scroll. Core's `PlacementSource` owns the
stable topology and context-independent geometry snapshot. The WebGPU adapter
turns it into a renderer-owned placement set. A geometry revision currently
calls `PlacementSetHandle.replace` with the entire array.

Extend the placement snapshot with a translation in the rectangle coordinate
space and a revision for that translation. Keep dense placement indices,
geometry updates, and disposal on the existing source. The default translation
is zero. Start with translation only. There is no need for a matrix or a
SampleView-specific renderer resource.

The WebGPU renderer would expose an update for the placement set's translation.
It would keep the instance buffer and its binding alive and publish the
translation in a uniform. Compose the translation with the existing placement
rectangle before calculating vertex positions or placement clipping. The
CPU-side culler and detached export must use the same effective rectangles.
Picking invalidates when either geometry or translation changes. Layout
producers that publish full rectangles keep their current path. App's
interaction coordinates, sticky chrome, and sidebar scales keep their existing
owners.

The design follows the separation between retained attributes and a viewport or
layer transform used by deck.gl. GenomeSpy only needs translation at this
boundary.
[deck.gl primitive layers](https://deck.gl/docs/developer-guide/custom-layers/primitive-layers)

## Alternatives and risks

Updating only visible rectangles would reduce payload size but require tracking
the visibility window, invalidating rows leaving the viewport, and maintaining
complete topology for stable picking IDs. Keep sparse geometry updates for a use
case with independent row movement. A placement transform handles this case
directly.

Keep changes to the retained occurrence walk separate. A camera translation
removes the full-table rewrite but the current CPU culler still visits offscreen
occurrences. The profiling results put most close-up scrolling CPU in Core draw
preparation, so measure CPU savings before adding a second path for placement
transforms. Verify precision for long sample lists and avoid separate transforms
in picking, clipping, and export.

If the occurrence walk remains the bottleneck, consider a separate Core contract
that lets layout producers supply a conservative visible range or set of
placement indices. The retained frame plan could use it to select draw
candidates while preserving recorded paint order. Sources with arbitrary
positions or overlapping placements could continue using the existing culler.
This would leave the renderer's draw API unchanged.

## Implementation and verification

1. Define effective placement coordinates in Core and add the generic renderer
   translation. Verify zero translation, clipped and overlapping placements,
   mixed translated and ordinary placements, invalidation, and equivalent
   visible, picking, and detached draws. Document coordinate units and
   composition order on the experimental renderer API. Tentative commit
   `feat(webgpu): translate retained placement sets`.
2. Publish stable unscrolled rectangles and live translation from
   `LocationManager` while close-up is fully open. Preserve sticky summaries,
   reordering, collapsed groups, resizing, and closing behavior. Exercise an
   ordinary repeated view and a grouped 20-attribute SampleView using normal
   drawing, picking, and export. Compare WebGL and WebGPU output and verify that
   a close-up scroll publishes zero placement-table replacements and one
   placement translation per changed frame. Confirm the change in per-frame CPU
   at 1,536 samples and a larger cohort. Tentative commit
   `perf(app): translate sample placements during close-up scrolling`.

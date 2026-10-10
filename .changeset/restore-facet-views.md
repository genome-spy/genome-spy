---
"@genome-spy/core": minor
---

Add `facet` composition for displaying data groups as wrapped columns or a
row/column matrix, with shared scales, axes, and legends, group labels, and
scrollable viewports. Cell titles, backgrounds, guide layering, clipping, and
visible-cell culling follow the existing layout rules.

Child transforms run independently within each facet, including aggregates that
drop the facet fields, window calculations, stacks, sampling, and pileup.
Buffered transforms and self-lookups span physical files while preserving row
shapes through grouping, sorting, and replay. Child filters retain empty input
cells; a child with its own dataset repeats that data in every cell.

Independent positional scales and axes, unsupported placement transforms, and
explicit `collect.groupby` on inherited facet data fail with clear errors.
Wrapping column counts must be positive integers. Pointer events and point
selections route into the pointed facet cell, and shared interval brushes use
that cell's plot bounds. Picking and tooltips distinguish repeated cells even
when they share the same datum. Mark hits and custom tooltip contexts expose a
`facetId` tuple identifying the pointed cell.

Pan and zoom update shared scales using the pointed cell's plot bounds, also
inside scrolled facet viewports. Existing viewport drag-scrolling and gesture
cleanup apply to facet cells.

Removing a facet or disposing its visualization cancels active interval-brush
gestures and releases their document listeners.

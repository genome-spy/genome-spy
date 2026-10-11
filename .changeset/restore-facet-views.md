---
"@genome-spy/core": minor
"@genome-spy/app": minor
---

Add `facet` composition for displaying data groups as wrapped columns or a
row/column matrix, with shared scales, axes, and legends, group labels, and
scrollable viewports. Cell titles, backgrounds, guide layering, clipping, and
visible-cell culling follow the existing layout rules.
The App specification types and JSON Schema also support facet composition.
Axes appear along the occupied outer edges, including incomplete wrapped rows,
while grid lines remain in every cell. Axes scroll and clip with the grid.
Facets without fixed cell dimensions fill their container from startup, before
their categories have loaded.
The facet grammar example shows the complete Anscombe quartet in four responsive,
outlined plots.
The grammar guide starts with examples, then explains facet arrangements,
layout, headers, and interactions. It includes a per-sample BigWig example,
compares facets with App sample views, and summarizes the supported differences
from Vega-Lite.

Facet fields support ascending, descending, and explicit category order with
`sort`. Explicit arrays order present values without creating absent categories;
unlisted values retain input order even when matrix rows are interleaved.
Set a facet field's `header` to `null` or `{ "labels": false }` to hide category
labels and reclaim their space.
Numeric category labels support D3 number formatting through `header.format`.
Facet headers support view-title placement and named styles, including
horizontal track labels and overlays inside the plot. Reserved labels grow to
fit their text, while existing default placement and header bands are preserved.
Configure shared defaults with `config.header`, `config.headerRow`, and
`config.headerColumn`, using the same property names as view titles.
Each facet dimension displays its field name as a shared title outside the
category labels. A string or view-title object `title` customizes it, and
`title: null` hides it. `header: null` hides
both the field title and category labels; `labels: false` hides only the labels.
Facet `spacing` accepts separate `row` and `column` gaps as well as one number.

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
inside scrolled facet viewports. Navigation also works in the gaps between cells,
where wheel zoom prevents page scrolling. Existing viewport drag-scrolling and
gesture cleanup apply to facet cells.
Keyboard zoom uses the same cell bounds and gap anchors as pointer navigation.

Removing a facet or disposing its visualization cancels active interval-brush
gestures and releases their document listeners.
Rulers use the pointed cell's coordinates, retain their values across cell
transitions, and keep document drags anchored to their starting cell.
WebGL rulers appear immediately on hover and after re-entering a facet, without
requiring a layout refresh.
Layout refreshes preserve hover identity for unchanged facet categories.
Unsupported child viewports fail with an error directing authors to put the
viewport on the facet container.
Imported facet children must resolve to unit, layer, or multiscale plots;
unsupported compositions fail clearly instead of repeating incorrect groups.
Independent per-cell scales and legends fail clearly, while layers can retain
separate non-positional scales shared across cells.
Category values provide the cell labels, independently of shared field titles.
Unchanged facet labels are retained across layout refreshes without restarting
their dataflow.
Large facet grids avoid quadratic bounds calculations during layout.

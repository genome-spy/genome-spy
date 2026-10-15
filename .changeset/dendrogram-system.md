---
"@genome-spy/core": minor
---

Add support for dendrograms aligned with heatmap rows or columns while keeping
index scales discrete. Leaves stay aligned and branches remain connected during
zooming, panning, and resizing.

The new `dendrogram` transform lays out precomputed node tables using explicit
leaf indices and merge heights. It emits parent–child edges with integer anchors
and relative offsets for rendering with a single link mark.

The new `x2Offset` and `y2Offset` encoding channels independently displace
secondary endpoints using the corresponding `xOffset` or `yOffset` scale.

The reactive `bandstep()` expression helper returns the regular spacing between
adjacent bands, including padding. `bandwidth()` returns the band size without
that padding. Dendrogram offsets can follow row or column spacing during zooming
and resizing, including scales with grouping gaps.

Link marks now support `linkShape: "orthogonal"` with horizontal and vertical
orientations across WebGL, WebGPU, Canvas, and SVG. Right-angle joins remain
consistent across rendering and picking.

Canvas and SVG now honor within-band placement on nested offset scales, so
points align with their corresponding grouped bars.

WebGPU link picking now honors `minPickingSize`, making thin links easier to
select.

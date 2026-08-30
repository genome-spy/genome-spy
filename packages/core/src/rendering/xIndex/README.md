# Renderer-neutral x indexing

This folder maps sorted x/x2 data intervals to contiguous integer ranges owned
by a renderer adapter. It deliberately has no renderer resources or lifecycle.

`buildMarkXIndex` reuses Core's existing allocation-free binned-range utility.
`createMarkXIndexSpec` and `resolveMarkXIndexQuery` centralize eligibility and
the live query. The query includes one viewport of guard space on both sides;
exact geometry culling remains renderer-owned. Geometry extending farther than
a viewport from its x coordinate is outside this optimization's guarantee.

Canvas2D indexes stable source-row batches. The Core WebGPU adapter indexes its
packed instance ranges. WebGL retains its private vertex index as a behavioral
compatibility oracle, and SVG does not use viewport-dependent indexing.

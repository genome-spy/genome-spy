# Renderer-neutral x indexing

This folder maps sorted x/x2 data intervals to contiguous integer ranges owned
by a renderer adapter. It deliberately has no renderer resources or lifecycle.

`XRangeIndexBuilder` validates the stable build-time contract and produces an
allocation-free binned query. `createMarkXIndexSpec` and
`resolveMarkXIndexQuery` centralize Core eligibility and the conservative
visible/picking envelope. Unsupported or unbounded geometry must use the
adapter's complete native range.

Canvas2D indexes stable source-row batches. The Core WebGPU adapter indexes its
packed instance ranges. WebGL retains its private vertex index as a behavioral
compatibility oracle, and SVG does not use viewport-dependent indexing.

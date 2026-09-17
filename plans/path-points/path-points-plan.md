# Canonical MSDF path-points feasibility record

Status: complete and reconciled; retained until plan retirement

## Question and decision

The experiment asked whether arbitrary closed SVG paths could replace the
hard-coded point-shape SDFs while preserving fill, variable centered strokes,
rotation, holes, picking, and sharp corners.

The answer is yes. Canonical msdfgen v1.13 first proved that the visible seams
were implementation defects rather than an inherent MSDF limitation. The
subsequent sparse WebGPU generator reached acceptable quality and substantially
lower generation latency without CPU per-texel work or texture upload.

Production work moved to
[`production-integration-plan.md`](production-integration-plan.md). Detailed
GPU architecture and provenance are summarized in
[`wgsl-msdf-atlas-design.md`](wgsl-msdf-atlas-design.md) and implemented in
`packages/webgpu-renderer/src/symbols/`.

## Completed outcome

- Canonical msdfgen v1.13 was compiled to a small WASM oracle with a narrow,
  versioned path-oriented ABI.
- The earlier focused `text-shaper` rasterizer was rejected because acute
  corners produced false outside pockets and white seams.
- A side-by-side Storybook comparison covered stars, bow-ties, curves, holes,
  rotations, and variable strokes at DPR 1 and 2.
- A simplified WebGPU generator preprocesses contours and edge colors on the
  CPU, rasterizes conservative quadratic-edge regions, atomically retains
  nearest distances, and completes sign and correction passes on the GPU.
- Static TrueType `glyf` outlines, metrics, composites, GPOS pair adjustment,
  and legacy `kern` fallback proved that the same atlas path supports text.
- `rgba16float` visibly improved delivered symbol and text quality over
  normalized eight-bit output.
- The production point mark now accepts built-in names or SVG paths. A fixed
  circle alone retains the analytic fast path.
- Canonical WASM and its sources live in the separate `msdfgen-oracle`
  repository. Explicit development tooling downloads a checksum-pinned
  release; no production module imports it.

## Selected boundaries

- Public path input is a closed SVG path, not an exposed edge buffer or atlas
  handle.
- The renderer owns parsing, finite-table interning, atlas generation, caching,
  GPU resources, and destruction.
- CPU preprocessing is acceptable because it scales with path edges rather
  than atlas pixels.
- Quads rotate in the vertex shader. The fragment shader only reconstructs
  coverage from the atlas.
- Path-specific bounds and directional miter extents minimize quad padding.
- Exact canonical channel equality is not required; visible topology and
  bounded coverage are the compatibility contract.
- Tessellation was not selected because dynamic screen-space stroke semantics,
  joins, and antialiasing would require substantially more geometry machinery.

## Accepted residuals

- Small convex corners can differ slightly from canonical output.
- Acute star tips can show isolated subpixel stroke blemishes at particular
  rotations and widths.
- Atlas circles are slightly rougher than the analytic circle.
- Arbitrary self-intersections, open contours, stroke caps/dashes, and complete
  SVG fill semantics are unsupported.

Focused regressions reject the previously observed deep seams, detached
spikes, missing rectangle strokes, vertical sign streaks, and clipped outer
miters. Further visual tuning is justified only if a representative production
consumer violates those bounds.

## Reconciled unfinished items

- Direct inspection of every decoded canonical atlas channel was discarded.
  Final reconstruction comparisons and topology-focused regressions provide a
  more useful compatibility boundary for the intentionally non-identical GPU
  generator.
- Large-scale shader-cost, atlas-memory, and range-class measurements were
  transferred to the production integration plan.
- Public normalization, fill-rule, finite-domain limits, and exceptional stroke
  range remain production API decisions rather than PoC blockers.

## Verification record

The completed PoC exercised unit, TypeScript, lint, Storybook, browser WebGPU,
WASM comparison, rotation invariance, acute-corner, atlas-growth, picking, and
multi-million-point fixtures. Historical measurements and intermediate visual
iterations remain available in Git history.

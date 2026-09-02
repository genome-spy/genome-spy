# Canonical MSDF path points and sparse GPU atlas plan

Status: Feasibility proven; prototype frozen pending production integration

## Summary

Use the existing experimental `PathPoint` mark to answer one narrow feasibility
question: does the canonical msdfgen algorithm eliminate the visible seams and
corner artifacts produced by the focused `text-shaper` rasterizer?

The first implementation milestone vendors the dependency-free core of
[msdfgen v1.13](https://github.com/Chlumsky/msdfgen/releases/tag/v1.13),
compiles it to WebAssembly, and exposes only arbitrary path construction and
MSDF generation. The existing JavaScript SVG parser remains responsible for
producing closed contours of line, quadratic, and cubic segments. FreeType,
Skia, TinyXML, libpng, font loading, and the msdfgen command-line application
are excluded.

Canonical output removed the original artifacts and established a visual
oracle. A simplified WebGPU generator based on sparse quadratic-stroke
rasterization now produces the atlas directly on the GPU and removes the
catastrophic tile artifacts of the runtime WASM route. Its implementation and
remaining font-scale design work are recorded in
[`wgsl-msdf-atlas-design.md`](wgsl-msdf-atlas-design.md). The WASM generator is
retained as the development oracle and comparison backend.

The motivation and broader problem inventory remain in
[`problem-inventory.md`](problem-inventory.md). Upstream boundaries and the
conditional text work are described in
[`text-shaper-adaptation.md`](text-shaper-adaptation.md).
Production graduation is planned separately in
[`production-integration-plan.md`](production-integration-plan.md).

## Current evidence

The renderer plumbing is already sufficient to run the experiment:

- a temporary internal `PathPoint` mark builds a fixed atlas from SVG paths;
- the vertex shader rotates conservative quads and the fragment shader derives
  fill and variable-width outline coverage from one MSDF;
- the Storybook scene exercises built-ins, curves, holes, acute stars, rotation,
  size, and stroke width; and
- focused unit, type, lint, and WebGPU tests have passed for this route.

The current GPU route preprocesses contours and edge colors on the CPU, draws
conservative edge-local rectangles, atomically retains nearest channel
distances, and applies even-odd sign and a lightweight correction in compute.
It intentionally does not reproduce canonical msdfgen byte for byte.

The PoC quality gate is now closed. Small convex corners can still differ
slightly from the canonical WASM oracle, and acute stars retain occasional
subpixel stroke blemishes. The diamond's apparent tip flattening is not quad
clipping: a rotated render retains a measured guard band inside the expanded
quad. Focused tests reject the earlier deep seams, detached spikes, missing
strokes, and clipped miters. Further artifact tuning is postponed until a
production consumer demonstrates that the accepted residuals matter.

The focused `text-shaper` rasterizer demonstrated the overall rendering route,
but its acute-corner output contains white seams and false outside pockets. It
omits or approximates substantial parts of canonical msdfgen, including robust
curve-distance selection, overlap behavior, and interpolation error correction.
Patching individual routines is recreating msdfgen without a reliable parity
boundary and is no longer the selected production direction.

## Goals

- Generate the current path-symbol atlas with canonical msdfgen v1.13.
- Determine visually and numerically whether canonical edge coloring, distance
  selection, and error correction eliminate the known acute-corner artifacts.
- Keep the path parser, atlas packing, renderer resources, and PathPoint shader
  independent of the rasterizer implementation.
- Record the minimum WASM source set, compressed package cost, initialization
  behavior, generation time, texture memory, and browser compatibility.
- If feasibility passes, design a WGSL backend for direct generation into large
  GPU-resident symbol and glyph atlases.
- Keep upstream provenance and licenses auditable and updates mechanically
  comparable to the pinned revision.

## Non-goals

- Making `PathPoint` public or replacing the current `Point` mark in this plan.
- Integrating custom symbols into the Core grammar or the WebGL, Canvas, and SVG
  renderers.
- Loading or shaping fonts during the WASM feasibility milestone.
- Bundling FreeType, Skia, TinyXML, libpng, or msdfgen extensions.
- Supporting arbitrary self-intersecting SVG input or reproducing the complete
  SVG stroke model. The feasibility fixtures use a provisional even-odd input
  rule so their expected signs are testable.
- Settling public size normalization, user-configurable fill rules,
  `inwardStroke`, atlas growth, eviction, or persistent caching.
- Implementing WGSL before the canonical WASM output passes the visual gate.
- Keeping two production MSDF generators merely as fallbacks. The experiment
  should select one direction and remove superseded code.

## Key decisions

### Vendor the original core instead of translating it

Place the pinned upstream source, local C ABI wrapper, and reproducible build
under the package's build-only vendor directory:

```text
packages/webgpu-renderer/vendor/msdfgen/
```

Place only the generated runtime module, loader, README, and required license
notice in the published source tree:

```text
packages/webgpu-renderer/src/vendor/msdfgen/
```

Use upstream C++ directly. Keeping build-only source outside `src/` avoids
shipping roughly 420 kB of C++ in the npm package. Do not transliterate the
algorithm into JavaScript or selectively copy another partial implementation.
The vendor README records
the v1.13 tag, full commit, included files, excluded modules, compiler version,
flags, and local wrapper API. Generated files must be reproducible from the
checked-in source and normal package consumers must not need Emscripten.

msdfgen is MIT licensed. Preserve its license and copyright notice. The
existing Vega-derived parser remains in its own vendor subtree. Any future
code adapted from `text-shaper` remains under `src/vendor/textShaper/`, as
previously required, but its MSDF rasterizer is removed when the canonical
backend proves usable.

### Keep the binding path-oriented and bulk-oriented

The wrapper accepts a compact typed command stream describing contours and
line, quadratic, and cubic segments. JavaScript performs SVG tokenization, arc
conversion, deduplication, and provisional normalization, then submits a whole
shape in one call. The wrapper performs:

1. construction of `msdfgen::Shape` and `Contour` objects;
2. shape validation and normalization required by the core;
3. `Shape::orientContours()` to interpret unoriented input with the even-odd
   rule and rewrite it for msdfgen's nonzero-winding machinery;
4. canonical `edgeColoringSimple` with an explicit angle threshold and
   deterministic seed;
5. `generateMSDF` with overlap support and canonical edge-priority error
   correction explicitly enabled; and
6. conversion to the existing RGB8 atlas-tile contract.

Do not expose C++ object handles or make one boundary call per edge. The API
must also be usable later with glyph outlines produced by a font reader.

### Embed the feasibility binary and instantiate it synchronously

The current `buildPathAtlas` contract is synchronous because mark resources are
created synchronously. For the feasibility spike, generate an embedded binary
module and instantiate it once, synchronously, at module evaluation. Use a tiny
GenomeSpy-owned loader around a standalone WASM artifact rather than shipping
the Emscripten JavaScript runtime. Repeated atlas builds reuse the same instance
and its linear memory; expected validation failures return status codes, while
instantiation failure or a WASM trap fails module/mark creation loudly.

Embedding deliberately favors a small, self-contained experiment over a
production loading policy. Record that WebAssembly compilation may require an
appropriate CSP, verify browser main-thread and worker instantiation, and smoke
test Node, Vite, Storybook, tree-shaken bundles, and the packed tarball. Normal
package consumers do not need Emscripten. If the experiment graduates, compare
an emitted asset and explicit renderer preload before choosing the production
loading contract; this plan does not turn mark creation asynchronous.

### Use a versioned, fixed-layout C ABI

Expose `msdf_render_v1` plus `_malloc`, `_free`, memory, and an ABI-version
constant. A single call receives:

- `u32[contourCount + 1]` contour offsets into the edge arrays;
- `u32[edgeCount]` edge kinds (`1` line, `2` quadratic, `3` cubic);
- `f64[edgeCount * 8]` fixed-stride control points (`p0` through `p3`, with
  unused points ignored for lines and quadratics);
- explicit edge/contour counts, image width/height, affine scale/translation,
  pixel range, output pointer, and output capacity; and
- an RGB8, tightly packed, top-to-bottom output contract with
  `rowStride = width * 3` and zero distance encoded by msdfgen's canonical
  byte conversion.

JavaScript allocates and copies whole arrays, calls once per tile, copies the
result, and frees every allocation. It validates closed contours, finite
coordinates, monotonic offsets, exact coordinate capacity, dimensions, and
safe byte counts before calling WASM. The wrapper validates again and returns
stable status codes for ABI mismatch, invalid arguments, invalid contours,
insufficient output capacity, and invalid shapes. C++ exceptions are disabled
and never cross the ABI; allocation failure or an internal trap is fatal and is
reported by the loader as an exception. Pin the Emscripten version and flags,
and record SHA-256 hashes for the generated binary and representative output.

### Keep rasterization behind one adapter

`pathAtlas.js` depends on a GenomeSpy-owned rasterizer adapter rather than
vendor internals. During the gate, both generators received the same normalized
path commands and produced the same tile metadata. The comparison route never
entered the public mark configuration.

The gate had three possible outcomes:

- if canonical msdfgen removes the artifacts and packages acceptably, delete
  the JavaScript rasterizer and its implementation-detail tests;
- if the same artifacts remain, record that MSDF reconstruction is unsuitable
  for the required strokes and reconsider tessellation or geometric stroking;
  or
- if output succeeds but WASM packaging is unacceptable, retain the canonical
  output as an oracle while evaluating WGSL before selecting production code.

Canonical msdfgen passed visually, so the focused JavaScript rasterizer was
removed. The adapter now isolates the WASM implementation and provides the
future replacement boundary for WGSL generation.

### Treat WGSL as a sparse generation backend

WGSL does not replace SVG/font parsing or topology handling. A future compute
design should keep irregular, low-volume preprocessing on the CPU and move the
parallel texel work to the GPU:

```text
SVG or glyph outline
    -> normalized, colored line/quadratic edge buffer
    -> per-entry atlas job buffer
    -> conservative edge-region render pass with atomic distance selection
    -> WGSL sign/normalization and correction passes
    -> GPU-resident atlas texture
```

The canonicalized GPU input must preserve contour offsets, edge adjacency, and
any edges split or altered by msdfgen normalization and coloring. The design
must target large and incremental font atlases, not only the 14-symbol fixture.
It should batch many tiles per dispatch, use offsets into a shared edge buffer,
avoid readback, and define how newly generated tiles become visible to rendering
without stalling the queue.

## Alternatives considered

### Continue repairing the `text-shaper` rasterizer

This preserves a synchronous JavaScript implementation but leaves GenomeSpy
responsible for a subtle, incomplete fork. The observed seams demonstrate that
the missing pieces are correctness-critical rather than optional refinements.

### Translate the complete msdfgen core to JavaScript

This avoids WASM loading but requires maintaining a large manual translation of
geometry, polynomial solvers, edge selectors, contour combiners, coloring, and
error correction. It offers less confidence and a more expensive upstream
update path than compiling the original core.

### Implement WGSL immediately

Per-texel distance evaluation maps well to compute, but an immediate GPU port
would lack a trusted reference and combine algorithm validation with GPU
numerics, batching, synchronization, and shader portability. Establishing the
canonical CPU result first makes failures attributable.

### Use the PlayCanvas msdfgen WASM package unchanged

It is a useful Emscripten reference but exposes a font/glyph-oriented API and
includes FreeType. Path points need arbitrary contour construction and should
not pay for font loading in this milestone.

### Tessellate fills and strokes

Geometry provides exact join and miter-limit behavior and remains the fallback
if canonical MSDF output fails. It does not establish the shared atlas route
needed for scalable text effects and therefore is outside this feasibility
implementation.

## Milestone 1: Canonical msdfgen WASM backend

### Intended outcome

The existing atlas builder can generate its RGB tiles through a reproducible,
minimal msdfgen v1.13 WASM module without changing mark or shader behavior.

### Work

- [x] Vendor the exact dependency-free core source set, MIT license, revision
      manifest, and local wrapper under build-only `vendor/msdfgen/`, with the
      generated runtime and packaged license under `src/vendor/msdfgen/`.
- [x] Add a reproducible Emscripten build command that omits extensions and
      exports only memory plus the narrow bulk rasterization entry point.
- [x] Implement and test the documented `msdf_render_v1` fixed-layout ABI,
      status codes, contour closure, coordinate/Y orientation, normalization,
      edge-coloring parameters, transformation, distance range, output bounds,
      and allocation ownership.
- [x] Generate an embedded binary module, instantiate it synchronously once,
      and document fatal initialization/trap behavior and repeated reuse.
- [x] Add a GenomeSpy-owned rasterizer adapter so `pathAtlas.js` does not import
      vendor internals.
- [x] Preserve the existing tile, gutter, UV, and atlas-entry contracts while
      selecting the WASM backend.
- [x] Fail loudly for malformed, open, empty, or degenerate command streams at
      the parser/adapter boundary.

### Affected areas and consumers

- `packages/webgpu-renderer/src/vendor/msdfgen/**`
- `packages/webgpu-renderer/src/symbols/**`
- experimental `PathPoint` initialization and tests
- package build, asset inclusion, and tree-shaking verification

No Core or public renderer API changes are allowed in this milestone.

### Verification

- Unit-test lines, quadratic and cubic curves, multiple contours, holes,
  both nested-contour windings under the provisional even-odd policy, overlaps,
  coordinate orientation, deterministic output, and invalid input.
- Verify that a square and circle have the expected inside/outside sign and
  that atlas gutters cannot observe adjacent tiles.
- Build the package without requiring Emscripten at consumer install time.
- Smoke-test synchronous initialization and reuse in Node, Vite/Storybook, the
  WebGPU browser test, a worker, the tree-shaking fixture, and the packed
  tarball. Record the CSP requirement of the embedded strategy.
- Run focused Vitest, package TypeScript checks, lint, and the WebGPU test.
- Record source lines, WASM bytes, compressed package delta, initialization
  latency, and cold/warm generation time for the 14-symbol atlas.

### Documentation and migration

- Document exact provenance, license, build prerequisites, build command, ABI,
  and excluded upstream modules in the vendor README.
- Verify that the packed package includes the msdfgen MIT notice and the
  existing Vega Scenegraph BSD-3-Clause notice and source mapping.
- Update the renderer migration plan to name canonical WASM as the active
  feasibility backend.

### Tentative commit

`feat(webgpu): generate path MSDFs with canonical wasm`

## Milestone 2: Artifact-removal feasibility gate

### Intended outcome

Representative screenshots and texture-level comparisons establish whether
canonical msdfgen fixes the visible defects at the required stroke widths.

### Work

- [x] Add a side-by-side Storybook comparison using identical paths, atlas
      geometry, point size, rotation, fill, stroke, and stroke width.
- [x] Include the known acute star seam, bow-tie triangles, rotated square,
      circles, curves, nested holes in both source winding orders, overlaps,
      very small symbols, and the full 160-point grid.
- [ ] Inspect decoded atlas channels as well as final reconstructed output so
      generator artifacts are distinguishable from quad or atlas clipping.
- [x] Capture representative output at DPR 1 and 2. Fractional DPR remains a
      production-resolution-policy check rather than a feasibility blocker.
- [x] Record a pass, revise, or reject decision and remove the losing
      rasterizer when the evidence is conclusive.

### Acceptance criteria

- At point diameters 8, 16, 32, and 64 CSS pixels; rotations 0, 15, 30, and 45
  degrees; stroke widths 0, 1, 2, and 4 CSS pixels; and DPR 1 and 2, the known
  star-tip fixture has no background-connected white seam and no outside pocket
  larger than one device pixel after excluding the one-pixel AA transition.
- Square and triangle miters remain connected to their expected outer tip and
  do not touch the quad boundary in atlas-UV or final-output inspection.
- Curves remain smooth as stroke width increases; no generator-induced
  polygonization or channel-colored fringe is visible.
- Nested contours in either source winding order produce the expected even-odd
  hole after `orientContours()`; the selected overlap fixture has an even-odd
  exclusion in the overlap and matches overlap-enabled canonical output.
- Rendering and picking agree on covered and transparent regions.
- Any remaining defect is localized by comparing raw channel textures,
  reconstructed zero-distance coverage, expanded quad bounds, and final
  filtered output; padding is not used to hide an algorithmic seam.

### Verification

- Run the full renderer unit suite, focused WebGPU suite, package type checks,
  lint, package build, and Storybook build.
- Compare source and package size before and after removing the superseded
  rasterizer.
- Record atlas generation and upload measurements separately.

### Documentation and migration

- Add the measured result and decision to this plan and the migration plan.
- If feasibility fails, stop before font or WGSL work and write the geometric
  fallback decision.

### Tentative commit

`test(webgpu): validate canonical path msdf output`

## Canonical WASM findings

The visual feasibility gate passes. With the existing 256-pixel tiles,
32-texel range, 104-texel shape padding, atlas UV contract, fragment decoder,
and expanded quads unchanged, canonical msdfgen removes the white seams and
false outside pockets at the acute star and bow-tie tips. Large rotated squares,
triangles, circles, and 0-4-pixel outlines remain connected and unclipped in the
Storybook stress grid. The focused `text-shaper` rasterizer and its tests were
removed after this comparison.

The first canonical build uses msdfgen v1.13 commit
`1874bcf7d9624ccc85b4bc9a85d78116f690f35b` and Emscripten 6.0.9. The generated
WASM is 60,312 bytes raw / 28,653 bytes gzip with SHA-256
`7a867281d6b993a7cf23ec59b47268d22bdcf50b0b0ab7e0d7f84044c905ca09`.
The embedded base64 module is 80,613 bytes raw / 37,302 bytes gzip; the loader
and path adapter add 9,576 bytes raw / 2,475 bytes gzip before bundling.
The default single-star atlas output has SHA-256
`8015afe51c4644e289b472dd7f4a6c00280c578b0a204189ad32b6c78524a4ad`.

On the development machine, synchronous module import, decoding, compilation,
and initialization took about 21 ms in Node. Building the 14-shape,
1032-by-1032 atlas took about 357 ms cold and 340 ms warm. The atlas itself
remains 4,260,096 bytes. Canonical generation is therefore a successful visual
oracle but is not yet the preferred large-font population route.

msdfgen requires bit-identical adjacent endpoints. Arc-to-cubic conversion can
leave a closing point a few floating-point units from the initial move point,
so the GenomeSpy adapter now snaps an approximately closed final endpoint before
crossing the ABI. Focused tests cover arcs, open-contour rejection, same-winding
nested holes, and overlapping contours under the provisional even-odd policy.

The corrected Path Points story and focused WebGPU render/pick test run without
renderer errors. The remaining black quads around near-zero-size symbols with a
multi-pixel outline are the already documented finite-quad extreme: the stroke
is larger than the requested symbol, not an MSDF channel seam.

## Review gate: shared edge and atlas contract

If Milestone 2 passes, review the CPU-to-GPU contract before designing WGSL.
The contract must serve paths and glyphs without importing text layout into the
renderer or baking WASM-specific memory ownership into atlas management.

## Milestone 3: Sparse WebGPU proof of concept and font-scale design

### Intended outcome

A reviewed design and PathPoint implementation establish whether sparse
edge-local GPU generation can serve large, incremental glyph atlases while
matching canonical msdfgen closely enough for the accepted visual range. This
milestone remains a proof of concept, not a production font system.

### Work

- [x] Inventory the canonical pipeline into CPU preprocessing, embarrassingly
      parallel per-texel work, and neighborhood-dependent correction passes.
- [x] Specify packed post-normalization/post-coloring edge, contour adjacency,
      atlas-job, transform, and result layouts with explicit alignment and
      capacity limits.
- [x] Design batched dispatches that process many variable-edge-count glyphs,
      preserve queue ordering, and write directly into an atlas storage texture.
- [x] Implement conservative per-edge raster regions, atomic nearest-distance
      selection, global even-odd sign, and lightweight correction in WebGPU.
- [x] Integrate the generated texture into PathPoint without bitmap upload or
      GPU readback and keep WASM selectable in Storybook for comparison.
- [x] Decide whether edge coloring remains JavaScript/WASM preprocessing or is
      ported only after measurement shows it matters.
- [x] Define f32 numerical tolerances and difficult curve fixtures against the
      WASM oracle.
- [x] Specify error-correction passes, intermediate storage, dirty-region
      handling, and incremental tile publication.
- [x] Design benchmarks for 14 symbols and representative 256-, 1,024-, and
      4,096-glyph atlas populations, including incremental additions.
- [ ] Transferred to the production integration plan: measure shader
      compilation, representative glyph batches, bounded scratch memory, atlas
      growth, and cross-device behavior. The PoC already records local symbol
      generation and five-million-point draw measurements.
- [x] Define host-level atlas reconstruction after creation of a replacement
      renderer/device, consistent with the renderer's terminal device-loss
      contract and without requiring CPU bitmap readback.

### Acceptance criteria

- The design has no per-texel CPU work and no GPU-to-CPU atlas readback.
- One dispatch sequence can generate many glyph tiles with different edge
  ranges and atlas destinations.
- Output comparison covers acute corners, quadratic/cubic extrema, degenerate
  controls, holes, overlaps within the selected policy, and error-correction
  neighborhoods.
- Numerical tolerances are stated in encoded texels and reconstructed screen
  coverage, not only raw channel bytes.
- The benchmark separates cold pipeline compilation from warm batched and
  incremental generation.
- Font parsing, shaping, and layout remain separate consumers of the shared
  outline and atlas contracts.

### Current local measurement

In headless Chromium using Metal, the two-stage 16-symbol 520-by-520 atlas
completed in 3.8-5.1 ms warm after 0.6-0.9 ms of CPU preprocessing and
submission. Canonical WASM took 103-104 ms warm at the same tile, spread,
padding, and atlas size. The first GPU call completed in 8.0 ms. These figures
establish local feasibility only; representative fonts and other adapters
remain unmeasured.

For draw-time cost, each atlas entry now carries normalized path bounds and
four directional unit-stroke miter extents. Five million visible square points
at 1,024 by 768 completed 20-22% behind the hard-coded point shader across
two- and four-pixel fill-only cases and a two-pixel, one-pixel-stroke case on
the same local Metal adapter. Path-specific bounds removed the previous
2.38-times stroked result caused by a global four-width quad allowance.

### Documentation and migration

- Write the WGSL design as a focused companion under `plans/path-points/` only
  after the WASM feasibility gate passes.
- Update the migration plan with the selected ownership and review boundary.

### Tentative commit

`docs(webgpu): design compute-generated msdf atlases`

## Milestone 4: Printable-ASCII TrueType proof of concept

### Scope and rationale

Before designing shaping or a public text mark, prove that ordinary TrueType
quadratic outlines can use the same sparse GPU atlas and draw path as symbols.
The first slice supported printable ASCII, horizontal advances, and one common
font-unit scale. It now also includes focused basic-Latin pair positioning:
GPOS `kern` Pair Adjustment and legacy `kern` fallback. GSUB, complex shaping,
hinting, variation axes, CFF outlines, and line breaking remain postponed.

The minimal parser is adapted from text-shaper and stays entirely under
`src/vendor/textShaper/`, with its provenance and modifications documented.
Renderer-owned conversion of TrueType contours to SVG-style quadratic paths
stays outside the vendor subtree.

### Work

- [x] Vendor the minimal SFNT, `cmap`, metrics, `loca`, and quadratic `glyf`
      parsing needed for printable ASCII, with explicit bounds checks and
      failures for unsupported outline formats.
- [x] Convert TrueType on/off-curve points into closed quadratic path strings,
      preserving implied on-curve midpoints and flipping the font y axis.
- [x] Add a shared `unitsPerEm` normalization option to GPU and canonical WASM
      atlas generation so narrow and short glyphs retain a common text scale.
- [x] Lay out a few ASCII strings using only advance widths and render each
      visible glyph through the temporary PathPoint mark.
- [x] Add parser/path conversion tests and a browser-level GPU rendering smoke
      test with a real SIL Open Font License TrueType font.
- [x] Inspect fill and variable-width stroke quality at several text sizes,
      record atlas dimensions and generation time, and decide whether a
      dedicated temporary PathText mark is justified.
- [x] Measure the adapted JavaScript source and minified/gzipped bundle delta.
- [x] Parse the `latn` or `DFLT` GPOS `kern` feature, explicit and class-based
      Pair Adjustment subtables, and type-9 extension wrappers.
- [x] Parse horizontal legacy `kern` format 0 only when usable GPOS kerning is
      absent, and apply first/second glyph placement and advance adjustments.
- [x] Cover explicit pairs, class pairs, extension lookup dispatch, legacy
      fallback, and renderer-owned pen placement with focused tests.

### Acceptance criteria

- Printable ASCII used by the scene maps to glyphs with correct advances,
  baseline-relative placement, and basic horizontal pair adjustments.
- Every glyph is normalized by the font's `unitsPerEm`, rather than expanded to
  fill its tile independently.
- The GPU atlas preserves counters and sharp quadratic corners at the inspected
  sizes; variable stroke remains within the atlas and draw bounds.
- Empty glyphs such as space advance the pen without consuming an atlas entry.
- Unsupported CFF outlines fail explicitly in this proof of concept rather
  than silently producing corrupt paths.
- Adapted code has exact upstream revision, license, source mapping, and local
  modifications recorded under `src/vendor/textShaper/`.

### Feasibility decision

If the visual and cost checks pass, follow with a dedicated text-facing mark
and decide the production parser/shaping boundary. If they fail, retain the
scene and measurements as evidence and do not expand the parser into shaping.

### Current result

Source Code Pro produced 94 non-empty outlines for the 95 printable ASCII
characters; space advances without an atlas tile. Nine ordinary ASCII
characters use composite glyphs, so the minimal reader includes recursive
component transforms and point attachment in addition to simple outlines.

The Storybook Path Text scene uses 128-pixel tiles, 24-pixel distance range,
24-pixel shape padding, and a shared 1,000-unit em scale. Its 10-by-10 layout is
1,300 by 1,300 texels, or 6.45 MiB as the final RGBA8 texture. Earlier local
Chrome/Metal measurements with 96-pixel tiles parsed the font in 4.3 ms; atlas
submission plus completion took 25 ms cold, then 12.8 and 11.2 ms warm. The
larger current atlas has not been timed systematically, so those figures remain
feasibility evidence rather than a current benchmark.

The adapted reader, parser, positioning extension, and renderer-owned contour
converter contain 43,218 source bytes. Bundling only the converter entry and
its parser dependencies produces 13,640 minified bytes and 4,819 gzip bytes.
Compared with the outline-only slice, basic kerning adds 5,215 minified bytes
and 1,589 gzip bytes. Visual inspection passed for un-stroked 76-pixel text and
1.5- to 2.5-pixel strokes at 45 and 32 pixels. A dedicated PathText mark is
postponed: the proof of concept already exercises the intended atlas and draw
path, while async font ownership and a public text layout contract need
separate design.

The focused positioning extension selects the default language system of
`latn`, then `DFLT`, and applies all referenced `kern` lookups in feature order.
It supports Pair Adjustment formats 1 and 2, extension positioning that targets
Pair Adjustment, and horizontal placement/advance fields. A real proportional
Lato TrueType probe returned the expected negative adjustments for `AV`, `To`,
`Wa`, `Yo`, and `LT`; Source Code Pro remains visually unkerned because it is a
monospaced font. Lookup flags, device/variation adjustments, the `dist` feature,
and non-default language selection are explicitly deferred.

## Risks

- A minimal core build may still produce a larger binary or more initialization
  complexity than the renderer package can justify.
- Emscripten glue can dominate the core binary unless the wrapper and exports
  remain narrow.
- Canonical msdfgen without Skia preprocessing does not promise arbitrary
  self-intersecting or malformed paths.
- Synchronous decoding and compilation of an embedded WASM binary adds module
  evaluation cost and may conflict with restrictive content-security policies.
- Browser bundlers and CSP policies may treat emitted WASM assets differently.
- WGSL f32 numerics may diverge from canonical curve-distance results around
  degenerate or nearly coincident geometry.
- Variable edge counts cause divergent GPU loops; large glyph atlases need
  batching and edge-layout measurements rather than assuming compute is fast.
- Error correction may require multiple passes and intermediate memory, reducing
  the expected WGSL advantage.

## Decisions carried into production integration

- Canonical WASM remains a development oracle and must leave production import
  graphs; it is not a runtime fallback.
- The simple deterministic edge coloring is sufficient for the accepted PoC
  quality gate. Revisit it only with a failing production fixture.
- Visual tolerances are coverage-based rather than byte equality: deep seams,
  detached spikes, missing stroke sides, and clipped miters are regressions;
  the documented subpixel corner differences are accepted.
- `rgba16float` is the initial production atlas format because its quality
  improvement is visible. Cross-device support is an integration gate.
- Large glyph jobs, bounded scratch allocation, tight packing, and atlas growth
  are transferred to `production-integration-plan.md`.

## Final integration verification

- Exercise the Path Points story at ordinary and stress sizes, rotation, and
  variable stroke widths, including the specific star seam that triggered the
  backend replacement.
- Run renderer Vitest, TypeScript, lint, WebGPU, Storybook, tree-shaking, and
  package-content checks.
- Verify repeated scene mounting and renderer destruction release all atlas,
  buffer, and temporary generation resources; device loss remains terminal and
  recovery means host creation of a new renderer.
- Record reproducible screenshots, timings, compiler information, source size,
  binary size, gzip/package delta, and the final feasibility decision.

## Feasibility conclusion

The project proceeds to production integration. Canonical WASM proves the
quality ceiling, while the CPU + WGSL generator is fast and visually adequate
for custom symbols and basic TrueType text. The permanent design must retain
analytic built-in points, share GPU atlas infrastructure across paths and
glyphs, tightly pack incremental entries, and keep WASM out of the production
runtime. The remaining work is tracked in
[`production-integration-plan.md`](production-integration-plan.md).

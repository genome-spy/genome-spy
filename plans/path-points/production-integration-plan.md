# Production integration plan for GPU paths, fonts, and text effects

Status: active; core path/font integration complete, production gates remain

## Objective

Finish the path-point and TrueType work as a production-quality WebGPU feature
without compromising common scatter-plot performance or pulling font code into
point-only bundles. Promote the completed text-effects PoC only through
backend-neutral semantics that Canvas2D and SVG can also represent.

Historical experiments are condensed in the sibling feasibility records.
Implementation details and provenance live in
`packages/webgpu-renderer/src/symbols/README.md` and the focused adaptation
notices.

## Completed baseline

- One renderer-owned sparse WebGPU MSDF generator serves symbols and glyphs
  using bounded scratch resources and `rgba16float` output.
- A fixed regular circle keeps the minimal analytic point shader. Fixed named
  shapes, SVG paths, and finite variable shape tables use shared path atlases.
- Path-specific bounds and miter extents minimize quad expansion. Centered and
  inward point strokes have explicit representability clamps.
- The production text mark accepts immutable TrueType resources, lazily adds
  required glyphs, grows shared atlases without changing coordinates, and
  preserves logical-string layout, replacement, placement, picking, baselines,
  ranged text, kerning, and 2 by 2 small-text supersampling.
- The focused static-TTF reader supports `glyf` outlines, composites, Unicode
  `cmap`, horizontal metrics, GPOS Pair Adjustment, and legacy `kern` fallback.
- The 47,064-byte Lato-derived Default Font is loaded through a separate entry.
  Point-only bundles exclude the font and parser.
- Core keeps BMFont measurement for now while its dynamically loaded WebGPU
  integration lazily resolves exact family/weight/style descriptors to TTFs.
  The temporary example catalog and application catalogs require no API key
  and are absent from WebGL-only execution.
- Core's required lollipop, text-quality, text-baseline, and plenty-of-points
  examples render through WebGPU. Late view insertion participates in outline
  preparation and deduplicates repeated font requests.
- Canonical msdfgen is maintained in the separate `msdfgen-oracle` repository.
  Explicit development tooling downloads a checksum-pinned release into an
  ignored directory; production bundles and exports do not reference it.
- The comparison harness checks both rendered symbols and final atlas texels.
  Per-path median, sign, and near-contour statistics separate generator errors
  from filtering, quad bounds, and known overlapping-contour behavior.
- Endpoint pseudo-distances cover concave as well as convex corners, and
  independently signed RGB candidates retain msdfgen-style channel topology
  before global even-odd sign correction.
- The glyph-based text-effects PoC renders label-major shadow, outline, and
  fill layers in one draw. Effect-free text retains its direct glyph fast path.
- Text program-key lookup is constant time and does not serialize label
  contents during zoom or pan.

## Current architecture decisions

### Point shapes

- Public point values are built-in names or closed SVG path strings.
- Only a mark whose shape is the fixed regular circle uses the analytic route.
  Variable shape domains represent circles as paths too.
- Raw strings are interned before GPU upload; instance buffers contain numeric
  shape identifiers.
- A mark's resolved path table is finite. Adding an unseen path requires mark
  recreation until an incremental-symbol contract is deliberately designed.

### Fonts and loading

- The renderer receives a ready immutable `TrueTypeFont`; it does not choose a
  family or fetch implicitly.
- `createTrueTypeFont(bytes)` is synchronous and device-neutral.
  `loadTrueTypeFont(url)` is an explicit fetch convenience.
- Higher-level catalogs map exact normalized family/weight/style tuples to TTF
  sources and load only descriptors actually requested by initialized views.
- When no family is specified, Core tries Default Font for regular text and
  matching Lato variants for unsupported implicit weight/style combinations.
  Explicit missing families fail rather than silently substituting.
- Core BMFont measurement remains until renderer-specific measurement becomes
  a separate, justified refactor.

### Atlas ownership and quality

- Renderer caches use exact font or canonical path-table identity and own all
  GPU resources for the device lifetime.
- Symbol atlases are immutable; font atlases append and grow geometrically.
- RGB stores MSDF; glyph alpha additionally stores regular signed distance.
- Linear filtering and `rgba16float` are the current quality baseline.
- Ordinary entries are not duplicated for uncommon wide effects. A compact
  wide-range tier is added only for cases that the ordinary tier cannot
  represent usefully.

### Text effects

- One logical label paints all shadow glyphs, then all outline glyphs, then all
  fills before advancing to the next label.
- Only glyph quads are emitted; there is no dynamic whole-label scratch atlas.
- RGB MSDF drives fill/outline and alpha SDF drives the initial shadow/glow.
- Effect-only pixels do not participate in picking.
- Portable Core semantics must map to Canvas2D and SVG even if blur kernels and
  exact pixels differ. WebGL parity is optional because that backend is being
  phased out.

## Non-goals

- Replacing the analytic fixed-circle path.
- General SVG stroking, open contours, caps, dashes, or configurable joins.
- GSUB, complex scripts, bidi, font fallback runs, variable fonts, CFF,
  WOFF2, color fonts, or browser font discovery.
- A mandatory hosted font service or implicit Google Fonts request.
- Per-label effect textures or exact translucent glyph-union composition.
- Persistent cross-session atlas caches.
- Exact pixel equality between WebGPU, Canvas2D, SVG, and WebGL.

## Milestone 1: Close performance and compatibility gates

Status: in progress

### Intended outcome

Representative interaction and scale workloads have recorded CPU, GPU, memory,
and bundle baselines, with no content-sized work in animation-frame identity or
resource checks.

### Cleared gate

- Manual profiling of `msa.json` zooming and panning after the constant-time
  text program-key fix found interaction performance acceptable.
- Automated WebGPU stress coverage now grows and rebinds an outline atlas over
  four 4,096-label updates, then verifies stable reuse across repeated 12,000
  label / 72,000 glyph replacements.
- `benchmark:font-atlas` provides a reproducible synthetic-font workload that
  separates layout/upload time, time to GPU completion, steady atlas reuse,
  static rendering, growth history, and final RGBA16F texture bytes.

### Work

- Re-run the five-million-point benchmark for fixed analytic circles, fixed
  path symbols, and variable shapes.
- Run and record headed `benchmark:font-atlas` results on target adapters, then
  separately measure Default Font download/parsing and peak scratch bytes.
- Measure single-sample versus supersampled text fragment cost while retaining
  supersampling wherever small-text quality materially benefits.
- Confirm point-only, custom-point, custom-font, and Default Font browser and
  packed-package deltas.
- Exercise DPR 1 and 2 and at least two available WebGPU adapter families.

### Verification

- Keep the program-key regression that proves text contents are not inspected.
- Record reproducible commands, hardware/adapter, fixture size, and results.
- Smoke-test MSA, lollipop, text quality, text baseline, and plenty-of-points
  during real zoom/pan and picking interactions.

Tentative commit: `perf(webgpu): validate path and text hot paths`

Review gate: inspect any new retained caches or batching changes against Core's
mark lifecycle and point-only bundle boundary.

## Milestone 2: Add a compact wide-range point tier

### Intended outcome

Small stroked path points retain useful outline width without making ordinary
symbols or stroke-free points sample unnecessarily large atlas entries.

### Work

- Select the tier from required stroke-to-diameter ratio and DPR.
- Keep the ordinary detailed tier for normal and large marks.
- Compute entry padding and quad expansion from the selected range plus actual
  path/miter bounds.
- Retain a final clamp for requests exceeding both tiers.
- Avoid pre-generating both tiers for every path unless measurements show that
  lazy generation costs more.

### Verification

- Extend the tiny-point stress matrix across shapes, centered/inward strokes,
  rotations, DPR 1 and 2, and zero-stroke cases.
- Check texture cache behavior and compare draw time/cache misses against the
  current single tier.
- Confirm fixed circles remain entirely outside the atlas system.

Tentative commit: `feat(webgpu-renderer): add wide-range point atlases`

## Milestone 3: Promote portable text effects

### Intended outcome

Core exposes one outline and one shadow/glow with consistent paint order and
logical-pixel parameters across WebGPU, Canvas2D, and SVG.

### Work

- Define Core properties for shadow color, opacity, blur, and x/y offset.
  Continue using text stroke properties for the outline.
- Specify defaults, condition/expression behavior, scale support, picking,
  bounds, export, and invalid-value handling.
- Pass the channels through the WebGPU adapter without losing the effect-free
  shader/resource specialization.
- Render stroke before fill in Canvas2D and use SVG paint order plus a filter
  for shadow/glow. Document that backend blur kernels can differ.
- Decide whether legacy WebGL receives a minimal compatible implementation or
  explicitly remains unchanged.
- Profile dense dynamic-label workloads with shadow only, outline only, and
  both. Add a wide-effect glyph tier only if representative use exceeds the
  ordinary range.

### Verification

- Add specification/type/schema tests and focused backend render/export tests.
- Exercise light/dark heterogeneous backgrounds, rotation, small text,
  translucent glyph overlap, labels crossing clips, and dynamic updates.
- Verify label-major painter order and fill-only picking in overlapping labels.

### Documentation

Document supported effects, logical-pixel units, backend differences, and the
deliberate per-glyph overlap limitation.

Tentative commit: `feat(core): add portable text outline and shadow effects`

Review gate: approve the public cross-backend property contract before schema
and documentation are finalized.

## Milestone 4: Finalize public contracts and retire plans

### Intended outcome

The branch is documented, measured, free of prototype production paths, and
ready for PR review.

### Work

- Document custom path constraints, normalization, fill rule, finite-domain
  behavior, font table support, shaping omissions, loading, and failures.
- Decide and document a device-based maximum for unique path tables.
- Validate `rgba16float` storage/filter/copy support and specify fallback or
  required-feature behavior.
- Decide whether the renderer's legacy bitmap-text route remains as a supported
  compatibility path; this does not force Core measurement to change.
- Run repeated mount/update/destroy cycles and terminal device-loss recovery.
- Reconcile and then delete temporary files under `plans/path-points/` in a
  later commit before merge.

### Verification

- Run renderer/Core unit, type, lint, GPU, Storybook, build, tree-shaking, and
  package-content checks.
- Run the recursive example/font inventories and representative Canvas2D/SVG
  exports.
- Retain package-content and tree-shaking guards that reject oracle source,
  WASM, loaders, and comparison adapters from production artifacts.

Tentative commit: `docs(core): document path points and outline fonts`

## Risks and unresolved decisions

- `rgba16float` capabilities may differ across target adapters.
- Ordinary path-point atlases now agree with canonical msdfgen at the
  near-contour median and sign level. Small residual corner differences come
  from channel layout and filtered subpixel coverage; same-winding overlapping
  contours remain the material generator discrepancy.
- Small high-stroke points need a range tier that improves quality without
  wasting cache bandwidth on common points.
- Fixed-width font atlases can fragment; repacking would improve occupancy but
  broaden invalidation.
- High-edge-count glyph batches may expose sign-loop or atomic contention.
- The public path fill rule, normalization, unique-path limit, and unseen-path
  update behavior need explicit contracts.
- Exact weight/style matching is intentionally simpler than CSS matching.
- Basic Latin kerning is not full shaping; unsupported scripts need explicit
  failure or fallback behavior.
- SDF shadows are not Gaussian and translucent glyph effects can overlap.

## Acceptance criteria

- Fixed circles retain their original analytic performance and allocate no
  atlas resources.
- Custom paths and glyphs use the shared GPU generator without CPU per-texel
  work, readback, or bitmap upload.
- Shared atlases grow/rebind safely and release all resources with the renderer.
- MSA zoom/pan contains no work proportional to total label content unless the
  labels themselves actually change.
- Common point/text bundles preserve the measured tree-shaking boundaries.
- The earlier major seam, spike, sign-streak, missing-stroke, and clipping bugs
  remain covered by focused GPU regressions.
- Core font loading remains lazy, exact, API-key-free, and absent from WebGL-only
  execution.
- Public text effects have implementable WebGPU, Canvas2D, and SVG semantics.
- Remaining minor MSDF and per-glyph effect differences are documented.

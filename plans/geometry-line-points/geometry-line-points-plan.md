# Detect line point shapes from geometry

Status: independently reviewed proposal for replacing the runtime approach in
PR #683. Plan delivery is authorized; runtime implementation remains pending.
Based on PR #683 at `087c41eda633e2f81df48bbbb62425a1d80e8dc9`
and master `d8547c2a9`.

## Recommendation

Replace the name-based `lineKinds` switch with parsed centerline geometry.
For this PR, support symbols composed of independent straight open subpaths.
Render their union with a generic oriented-rectangle distance function in the
point program. Keep filled contours on the existing MSDF path.

This covers arbitrary user-supplied straight-line symbols, including translated,
diagonal, asymmetric, and multi-arm shapes. It preserves butt caps and logical
pixel stroke widths, including tiny symbols with thick strokes. It does not
require identifying a familiar silhouette or recovering a skeleton from a
filled polygon.

## Ownership and existing contracts

- `packages/webgpu-renderer/src/symbols/pointShapes.js` owns the built-in paths.
  Change `+` to `M-1 0H1M0-1V1` and `x` to
  `M-1-1L1 1M-1 1L1-1`. These match Core's centerlines in
  `packages/core/src/rendering/immediate/geometry/pointPath.js`.
- Point-shape preparation owns geometry classification and normalized endpoints.
  Use `svgPathToGlyphPath` so relative commands, H/V, and repeated coordinates
  follow the existing parser. Do not recognize names in rendering code.
- `src/marks/point.js` and `src/marks/programs/pathPointProgram.js` consume the
  prepared table. The generic renderer owns GPU buffers and disposal. Core's
  `createPointShapeConfig` continues passing strings and stable shape IDs.
- `src/symbols/sparsePathAtlasLayout.js` remains a closed-contour atlas generator.
  Fonts and the MSDF oracle do not acquire open-path or symbol-paint semantics.
- Reuse the oriented-box distance calculation already present in
  `src/marks/programs/ruleProgram.js`, `intervalDistance`. Share a small helper
  only if extracting it is clearer than keeping the short formula local.
  Its single-segment thin-stroke compensation is a reference, not a complete
  coverage algorithm for overlapping or very short segments.

## Detection contract

Classify after parsing, before rasterization, once per shape-table preparation:

1. All drawable subpaths explicitly close: use existing filled-path behavior.
   Thin polygons, including the current custom thick-plus polygon, remain filled.
2. All drawable subpaths are open and each follows one straight supporting line:
   use line geometry. Accept L/H/V paths with intermediate collinear vertices;
   take the projected minimum and maximum so retracing is handled correctly.
   Discard zero-length subpaths, and reject a table entry with no visible geometry.
3. Mixed open/closed paths, open subpaths with bends, and open curves receive a
   clear unsupported-geometry error. They are already rejected by the existing
   atlas boundary. Full SVG stroking is a separate extension, requiring explicit
   joins and caps; do not silently close them or render disconnected segments.

Use a scale-relative floating-point tolerance for collinearity. Closure is a
command/topology property, not a test of endpoint equality. An explicitly closed
degenerate contour retains existing filled-path behavior; it is not an implicit
request for line paint.

This is a point-symbol convention, not SVG's general fill rule. SVG fills open
paths using an implicit closing edge, so absence of Z alone is insufficient to
infer that arbitrary SVG geometry has no interior. A closed contour's signed
area is also insufficient: opposing lobes of a self-intersecting shape can
cancel while retaining filled regions.

## Geometry and rendering

Prepare each line as two normalized endpoints. Normalize the entire shape with
`(endpoint - overallBoundsCenter) / normalizationSpan`, using span 2 for point
marks, and then multiply by sqrt(size) in the shader. Never recenter individual
subpaths: relative arm placement must survive normalization. Named x/plus thus
have endpoint coordinates of +/-0.5 before size scaling. Translating the entire
source path leaves the centered point symbol unchanged, matching existing atlas
centering. Keep source shape IDs stable. A shape descriptor identifies either a
filled atlas entry or a range of line segments; there are no x/plus-specific
kinds, rotations, or lengths.

Keep atlas acquisition and deduplication for the closed-path subset. Store line
endpoints in a renderer-owned read-only buffer. For mixed tables, descriptors map
original shape IDs to the appropriate subset. Line-only programs omit atlas
resources through geometry-based shader specialization; avoid dummy atlas paths.
The point program still draws one quad per occurrence in the existing pass.
Distinguish source shape count from compact filled-atlas count: validate the
encoded shape against the source table before resolving its descriptor. The
existing `uPathCount` guard must not reject valid line IDs. Register owned
descriptor/line buffers through existing extra-resource disposal; retain borrowed
ownership for shared atlases.

The test-only `comparisonPathPointMark` and WASM/quantized oracle subclasses
instantiate `PathPointProgram` directly with closed `paths` and consume
`PATH_POINT_SHADER_BODY`. Adapt these callers to the filled-only specialization
as needed. Do not retain a second runtime compatibility path or add open-path
semantics to the atlas generator or fonts.

For each segment, scale its endpoints by sqrt(size), form its unit tangent and
normal, and express the fragment position relative to its midpoint. With length
L and half stroke width h, evaluate the ordinary rectangle SDF:

```text
q = abs([along, across]) - [L/2, h]
d = length(max(q, 0)) + min(max(q.x, q.y), 0)
```

The minimum across segments gives the union's geometric inside/outside test.
It does not, by itself, provide correct subpixel coverage. Resolve coverage for
the union and apply paint once so translucent crossings do not receive opacity
twice. Apply the encoded point angle to the complete shape, with no built-in
rotation offset. Use the same nominal geometry for picking. Expand bounds by
stroke width and the chosen AA support, and preserve minimum picking enlargement
for positive-size symbols. Cull nonpositive size or width before applying
minimum picking enlargement.

### Implementation gate: subpixel union coverage

Choose and qualify union-aware AA before treating this rendering design as
complete. Plain `clamp(0.5 - d)` overstates thin geometry, while applying the rule
renderer’s width compensation after a minimum-distance union can undercount
crossings. Very short butt-ended segments also need length attenuation. Taking
the maximum or sum of independently filtered segment coverages does not generally
give the filtered geometric union.

Use independent pixel-area references. For a centered device pixel and geometry
fully spanning that pixel along its long axis, the box-filter targets are:

- A 0.1-device-pixel-wide strip: coverage 0.1.
- Two perpendicular strips of that width: union coverage 0.19.
- A centered 0.1 by 0.1 rectangle: coverage 0.01.

Include a rotated fractional-width case against independent polygon/pixel-area
integration. Record the chosen filter or approximation, its AA support, and
numerical tolerances justified by that method; do not make an implementation's
own formula its oracle. An unresolved failure of this gate requires revising the
coverage approach before the PR can leave draft. No complete AA algorithm is
claimed by this proposal.

Retain PR #683's effective-stroke-paint selection with fill fallback. Lines use
centered stroke semantics independently of the filled-shape alignment channel;
integration with #661 must use its canonical `strokeAlign` contract. Size scales
centerline length; strokeWidth remains in logical pixels. Retained paint, size,
width, and angle changes update existing channels without reparsing geometry or
rebuilding an atlas.

## Why not classify or render using only the atlas?

The current x/plus paths describe filled polygons. Their fields contain no
reliable distinction between intended line thickness and intentional filled
area. Looking for positive texels also misclassifies undersampled thin shapes.

An unsigned nearest-centerline distance field supports round-capped strokes via
`distance <= width/2`, but does not preserve butt caps. Endpoint tangent/cap
constraints and overlapping subpaths need additional information; a single
nearest-distance sample does not supply it. The generic segment SDF preserves
the current cap contract and avoids finite atlas distance-range limits.

References: [SVG fill semantics](https://www.w3.org/TR/SVG2/painting.html#FillProperties)
and [SVG cap semantics](https://www.w3.org/TR/SVG2/painting.html#StrokeLinecapProperty).
This proposal reuses repository geometry; no external implementation is copied.

## One implementation milestone

Tentative commit: `fix(webgpu-renderer): derive line point geometry from paths`.

Replace PR #683's name-specific runtime branch, add point-shape preparation and
generic segment coverage, and update the existing path-point showcase with a
custom asymmetric multi-line symbol. Document the accepted path subset and its
paint/width contract in the renderer README. Reassess release impact at delivery;
the renderer is currently unpublished. Keep Core's adapter free of classification.

Acceptance and verification:

- Named x/plus and their resolved path strings produce equivalent coverage and
  picking, including duplicates in a mixed line/filled table.
- A custom multi-arm symbol with arbitrary directions exercises full width,
  butt endpoints, translucent crossings, rotation, clipping, and retained updates
  at representative DPR 1/2 settings. Include a tiny symbol with a wide stroke.
  Verify fractional-width strips, thin crossings, and very short segments using
  the independent references above. A translated asymmetric multi-subpath symbol
  must preserve relative endpoint layout and anchor placement.
- Parser-level tests cover H/V/relative notation, collinear retracing, empty
  geometry, unsupported bends/curves/mixed topology, and a closed thin polygon.
  Remove tests that require all built-ins to be closed or deliberately make
  resolved built-ins behave differently from their names.
- Existing filled-path, hole, font, and atlas tests continue protecting those
  contracts. Run focused renderer unit/GPU tests and applicable types/lint.
  Exercise the filled-only direct program/oracle consumers and stable source IDs
  when line entries occur before and after entries in the compact filled table.
- Exercise a real Core mixed-shape view with parameter updates and picking.
  Custom straight-line path support is WebGPU-specific; existing named-symbol
  Canvas/SVG/WebGL semantics provide the reference for width and butt caps.

Main risk: per-fragment work scales with segment count. The expected symbols
contain a few segments. Do not introduce a cache, tessellator, or benchmark suite
preemptively; use representative existing GPU coverage and investigate concrete
performance concerns before extending to complex paths.

Full open curves, joined polylines, configurable caps/joins, mixed fill/line
subpaths, and skeleton extraction from filled contours are outside this PR.
They must not be claimed as supported by this straight-line geometry contract.

## Independent plan review

Codex subagent review on 2026-11-05 found the geometry and detector scope coherent
and identified one material gap plus two clarifications. The plan now records
union-aware subpixel coverage as an unresolved implementation gate, defines
shape-wide normalization explicitly, and covers mixed-table counts, resource
ownership, and filled-only program consumers. Runtime changes and GPU validation
are pending; this review does not qualify the proposed renderer implementation.

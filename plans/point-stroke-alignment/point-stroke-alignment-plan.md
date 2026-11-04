# Point stroke alignment: bounded design and native proof

Base: master 0923989b2. #604 follow-up; shared StrokeAlign declaration is in
#657, now rebased onto master. This branch contains planning only. No dependency
or production-code changes are authorized by the proof milestone.

## Scope and ownership

PointMark owns the canonical resolved alignment. Reuse its existing property,
configuration and reactive-expression machinery. Explicit/configured strokeAlign
wins; otherwise inwardStroke true maps to inside and false to center. Do not set
a center default that silently overrides legacy configuration. Keep the legacy
property supported and deprecate it in specification docs.

Renderer owners consume the canonical result; no duplicate logical datums,
scene graph, generic effects framework or cross-backend resources. Immediate
projection owns nominal point dimensions and conservative bounds; native painters
and software picking consume those occurrences. WebGL and WebGPU own coverage,
extrusion and picking. The adapter uses the WebGPU package's public channels.
Both built-in and path-point WebGPU programs are consumers; font/atlas ownership
and text are out of scope. Ordinary point defaults, x/+ arm thickness, fill fallback,
minimum picking, datum identity and geometric zoom remain supported.

Sources: ARCHITECTURE.md; packages/core/docs/architecture/rendering.md;
packages/core/src/marks/{point,markUtils}.js; config/{markConfig,mergeConfig}.js;
rendering/immediate/{marks/point,geometry/pointPath}.js;
rendering/{canvas2d,svg}/renderers/point.js; WebGL point shaders;
WebGPU pointProgram/pathPointProgram and Core webGpuMarkAdapter.

## Native representation to prove

Nominal contours stay unchanged. Radius scaling is not a general contour offset:
it changes normal band width on diamonds/triangles and distorts concave crosses.
Try the existing native shape path with ordinary centered stroking; doubled
stroke clipped to the original contour for inside; doubled stroke with inverse
nominal clipping/masking for outside. Preserve nominal fill underneath paint
where overlap is real. No per-point readback, generic contour engine or new library.

This is a candidate, not an accepted implementation. #646 explicitly permits
Canvas's outside-style approximation for rules only. It does not relax point
coverage, translucent paint or common-opacity contracts. Do not apply it to points
without a separate maintainer decision. SVG retains vector output; check the
scope of the existing internal AA exception before relying on it for points.

References studied (design comparison, no copied code):

- SVG's centered stroke painting: https://www.w3.org/TR/SVG/latest/painting.html
- SVG strokes draft's clipping model: https://www.w3.org/TR/svg-strokes/
- Canvas source-over/lighter operations:
  https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation

## Gate and success criteria

1. Run an isolated candidate through actual Core embed/raster/SVG export.
   Circle, diamond, concave cross and mixed x/+; DPR 1/2; opaque and translucent
   paints, transparent border, oversized band, rotation. Compare nominal coverage,
   geometric extent and internal edge alpha/color against independent masks or
   analytical shape references. Preserve ordinary picking/fallback controls.
2. Stop the candidate if the shared-coverage contract fails. Do not build a
   larger mask/compositing implementation by default. Identify the exact failed
   contract, the smallest coherent next scope, and a concrete size estimate.
3. Only after a passing representation and scope agreement, implement one
   point-family slice: canonical compatibility mapping, required renderer
   consumers, bounds/picking, specification/docs/schema and Core minor Changeset.
   Tentative commit: feat(core): support aligned point strokes.
4. Final integration must include a rotated concave symbol beside x/+ with
   conditional/transparent stroke, reactive alignment and export/picking. No
   rectangle, arrow, rule, text or atlas changes.

## Native proof outcome: candidate rejected

Actual Core embedding, Canvas PNG export, vector SVG export rasterized in Chrome,
and live Canvas picking were exercised in an isolated archive of master. No
source replacement in the working repository, no drawing-context readback,
no extra GPU backend and no dependencies. Pixels are read only from decoded
exports. The temporary candidate uses the existing point paths and native
clip/mask operations; it is not a production implementation.

Six shapes share a mark: circle, diamond, cross rotated 23 degrees, square rotated
12 degrees, x and +. Size is 400 (nominal diameter 20), band width 4. Each alignment
is evaluated with opaque paints and 0.5 fill/stroke paint alpha, at DPR 1/2.
Unoutlined exports provide independent nominal coverage Cf. Comparisons use
premultiplied channels to avoid low-alpha PNG unpremultiplication artifacts.

For the fully opaque outside case, Co must be 1 at partial nominal-edge samples;
combined alpha must therefore be 255:

| Circle outside | Partial-edge samples | Failed samples | Minimum actual alpha |
| -------------- | -------------------: | -------------: | -------------------: |
| DPR 1          |                   48 |             48 |                  176 |
| DPR 2          |                  112 |            112 |                  177 |

Inside clipping also fails the circle coverage/paint test. Centered native
strokes pass the sampled paint-composition gate on all four filled shapes, for
both paint states and DPRs. Across the sampled points the new failures are in
curved circle clipping; that does not qualify every polygon, angle or browser.
Vector SVG remains free of image/filter elements but has native boundary AA
differences and is not qualified as exact shared coverage.

The x/+ fill-fallback raster is unchanged in Canvas and SVG; live Canvas picking
still hits both line shapes. SVG has no separate picking backend. Full aligned
picking/bounds, oversized bands, reactive config precedence and performance are
not qualified by this prototype. They are deferred because the first required
coverage gate failed, not silently treated as passing.

Evidence is retained outside the repository at:
`/Users/okusupreme/.codex/visualizations/2026/10/26/01a177b3-ba10-71b1-bb64-a4584cdb56bd/point-stroke-alignment-proof/`
(results.json, proofPointAlignment.mjs, patch-proof.py). The script reuses the
existing testRenderers runner in an isolated master archive. No new permanent
validation harness is proposed.

This rejects the small clip-and-stroke candidate under the strict Canvas point
contract. It does not prove strict native point composition impossible. Do not
repeat the rejected large per-occurrence mask work from #646 or extend the rule
exception to points without an explicit decision.

## Recommended first implementation scope

A full Core point-API PR is not ready while its native representation is unsettled.
Keep that public API and inwardStroke deprecation out of the next small PR.

The smallest independently useful alternative is **WebGPU point alignment** through
its renderer-generic API, including both analytic-circle and path-point programs.
Core is the sole current consumer, so update its adapter in the same change to
map existing legacy values (true -> inside, false -> center) without changing the
Core grammar or creating a second Core setting. The unpublished renderer can
replace its boolean channel rather than retaining a compatibility framework.

Concrete proposed scope (estimate, not an implementation measurement):

| Area                                                         |    Files | Estimated raw changes |
| ------------------------------------------------------------ | -------: | --------------------- |
| Point/path-point programs, public channel type, Core adapter |        4 | +65-110 / -25-60      |
| Existing GPU suites and adapter regression                   |        3 | +80-140 / -20-40      |
| Existing point/path scenes, story controls and symbol docs   |        4 | +40-70 / -5-15        |
| Total                                                        | about 11 | +185-320 / -50-115    |

Target at most 120 added production JS lines and no new dependencies. Re-scope
before implementation if a bounded GPU proof requires atlas/resource changes,
a generic normalization layer, or exceeding that budget. No Core release
fragment is expected if all existing Core behavior stays identical; reassess
observable behavior at delivery. Do not edit MIGRATION_PLAN until the renderer
phase actually begins.

Success gate before coding this alternative: generic public WebGPU point configs
support all alignments on both shader paths, with full-band width, independent
fill, transparent/oversized bands and conservative picking/quad bounds. A closed
custom path and concave named shape exercise the path program. Core controls
must retain legacy defaults, x/+ thickness/fallback and picking. Keep font/atlas
ownership, path generation, other marks and common-opacity migration out of scope.
Common-opacity handling and native/Core compatibility still need their own
explicit contract review before the eventual Core API slice; do not claim the
renderer foundation completes #604.

Tentative commit: feat(webgpu-renderer): support aligned point strokes.
No production work on this alternative starts without the next scope agreement.

## Status

- [x] Architectural ownership and current native code traced.
- [x] Bounded native proof completed; small clipping candidate rejected.
- [x] Smallest coherent alternative and explicit size budget prepared.
- [ ] User scope decision: native point contract and/or WebGPU foundation next.
- [ ] Bounded GPU proof before implementing the alternative.

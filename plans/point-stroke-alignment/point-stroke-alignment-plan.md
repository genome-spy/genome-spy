# Point stroke alignment: bounded design and native proof

Base: master 0923989b2. #604 follow-up; shared StrokeAlign declaration is in
#657, now rebased onto master. The narrow WebGPU renderer slice is authorized
and in progress on codex/webgpu-point-stroke-alignment. Earlier proof milestones
remain recorded below; no new dependencies, atlas or x/+ fixes are included.

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

The agreed first slice is renderer-only alignment **within the existing path
atlas distance range**. Stroke widths retain the current range clamp; the
analytic-circle route does not have that atlas limit. Document this beside the
public channel and in the symbol guide, including the numeric mapping
inside=0, center=1 (default), outside=2. Do not promise unrestricted path widths
or complete #604 point conformance.

Success gate: both shader paths implement the alignment extents and combined
coverage within that existing representable range. Transparent paints preserve
nominal fill; oversized inward strokes consume small interiors without negative
geometry. Wide outside requests must preserve and characterize the existing cap,
rather than satisfy an unrestricted-width gate. A closed custom path and rotated
concave symbol exercise path geometry. Preserve Core legacy defaults and current
x/+ thickness/fallback/picking exactly; correcting its known arm-width semantics
is a separate slice. Atlas generation/resources, native painters, new Core grammar,
other marks and common-opacity migration remain out of scope.

Production channel migration is part of this slice, not an optional cleanup:
update both programs and the public channel type, the sole Core adapter, existing
point-composition and path-point-definition GPU tests (including retained value
updates), the adapter regression, point/path scenes and their story controls, and
src/symbols/README.md. Remove standalone inwardStroke references rather than add
a compatibility layer. Core's legacy property and expressions remain supported
through the adapter. Search the renderer package for remaining channel consumers
and keep internal source assertions aligned with the public behavioral tests.

The independent geometry gate requires zero unexpected stable-pixel mismatches
for every shape, alignment and DPR, including every new outside case. Its sole
exception is the observed existing concave-cross centered pixel at DPR 1:
logical (41,28), expected white, actual RGBA (213,213,255,255). Permit only this
exact case/pixel/color; require that legacy pixel to match baseline exactly.
An unexpected mismatch must fail, not merely be recorded in the result summary.

The composition oracle samples nominal coverage from the candidate program with
zero stroke. This tests composition algebra, not geometry independently. Native
SVG supplies the separate contour oracle, and baseline frame parity protects the
existing rendering contract. Keep these roles distinct in reports.

Tentative commit: feat(webgpu-renderer): support aligned point strokes.
The narrow scope and geometry proof gate are agreed and passed. Production
implementation is now authorized for this renderer-only milestone.

## Status

- [x] Architectural ownership and current native code traced.
- [x] Bounded native proof completed; small clipping candidate rejected.
- [x] Smallest coherent alternative and explicit size budget prepared.
- [x] Narrow renderer scope agreed: retain the documented atlas cap and existing x/+ behavior.
- [x] Bounded GPU proof completed; compatibility and normal-width alignment pass.
- [x] Production implementation after the geometry-gate rerun; atlas and x/+ fixes stay separate.

## Bounded WebGPU proof (authorized)

The next user instruction authorizes the isolated GPU proof, not production
implementation. The candidate changes only the two point programs, public channel
name and legacy Core adapter mapping in a temporary checkout. No atlas generation,
resource ownership or native painter changes. Compare inside/center against the
unmodified baseline, and test outside against independent coverage/geometry.
Explicitly separate existing path-distance clamping and the documented x/+ arm
semantics backlog from any introduced regression. Both public shader routes,
transparent paint, retained updates, fallback and picking must be exercised.

## WebGPU proof result

**Bounded normal-width rendering and compatibility pass. The unrestricted point
contract is not yet qualified.** The prototype is isolated; only this plan changes
in the working repository. No dependency, atlas or resource-ownership changes.

Prototype: replace the standalone boolean channel with numeric strokeAlign
(inside=0, center=1 default, outside=2). Reuse existing inner/fill/outer coverage,
extrude by the requested outward extent and retain the existing pick/minimum-size
policies. Core's adapter maps its current legacy property to 0/1; Core exposes no
new grammar. Four source/type files: **+28/-32 raw lines**. This fits the 120-added-
production-line budget without adding helpers, state or frameworks.

Actual public createRenderer/createMark/render/pick/batchUpdates/series.replace
paths were tested in isolated baseline/candidate checkouts, at DPR 1/2:

- Analytic circle and path program forced through a closed circle path, a custom
  square path and a concave named cross rotated 23 degrees.
- 54 paired standalone frame cases are byte-exact (maximum error 0), including
  existing centered/inward paints, fractional scope opacity, wide centered
  strokes, mixed x/+ fallback, retained replacement and original pick IDs.
  The new outside code also preserves the fallback mixture byte-for-byte and
  returns the original IDs for all four shapes.
- All three alignments meet the sampled premultiplied coverage formula within
  0.8 byte, using nominal coverage from the candidate with zero stroke.
  Transparent strokes preserve the nominal frame within 1 byte (path cases are exact).
- A four-pixel outside band has the same full-frame coverage envelope as the
  baseline's eight-pixel centered band: maximum error 0 for all shapes/DPRs.
  Border picking succeeds; scissor picks remain hit/empty as intended.
- Common scope opacity 0.5 produces half the premultiplied frame within 0.5 byte.
  Oversized inward paint consumes each nominal interior without negative geometry.
- Independent SVG contours agree at the sampled stable pixels except for one
  concave centered fringe pixel at DPR 1. That mode's full frame is byte-exact to
  baseline; this is an existing SVG/MSDF difference, not a new alignment change.
- A negative control restoring the old outside quad size fails the envelope
  assertion. No WebGPU validation errors were reported in the passing runs.

Actual Core public embedding, export, reactive legacy expressions and picks were
also exercised with each public renderer export resolved to its isolated checkout.
All 16 baseline/candidate Core frame pairs are byte-exact, including analytic
circles and mixed circle/cross/x/+; picked datum shapes are preserved.

### Two existing limits, measured rather than expanded into this slice

1. **Path atlas distance range.** A 16-pixel path symbol with a requested 20-pixel
   outside band is clamped by the existing distance field. At x=55 for center
   32.25/radius 8, the analytic circle is opaque blue while the path circle,
   custom square and cross are clear. The baseline's equivalent wide centered
   stroke has the same limitation. Correcting it requires a separate resource/
   representation decision; do not hide it with shader extrapolation or an atlas
   workaround. Thus full-width semantics for arbitrarily wide path borders fail.
2. **Existing Core x/+ arm semantics.** Baseline and candidate pictures, fallback
   colors, thickness and picking are preserved exactly. Preservation is not a fix
   for the documented WebGPU arm-semantics backlog: + arms are 3 px for either
   strokeWidth 2 or 6 at size 400, and about 4.5 px at size 900. The WebGL control
   produces about 2/6 px and remains 2 px when size changes. Core's required
   stroke-only width contract is therefore still unimplemented on WebGPU.

The first renderer-only scope can preserve current behavior and support alignment
within the existing representable range. It cannot claim complete #604 point
conformance. The reviewed narrow scope explicitly retains these limits and
documents them; their fixes stay separate. No line-shape rewrite or atlas change
has been added to the candidate.

Evidence (scripts, candidate patch, machine-readable results and negative control):
`/Users/okusupreme/.codex/visualizations/2026/10/26/01a177b3-ba10-71b1-bb64-a4584cdb56bd/webgpu-point-alignment-proof/`.
No performance claim is made by these correctness/preservation checks.

## Sol review reconciliation and geometry-gate rerun

Both requested Sol reviews recommend the narrow renderer slice as independently
useful, with appropriate ownership and no unnecessary abstractions/dependencies.
Their conditions are incorporated above: bounded width semantics, explicit public
limitations, complete required-consumer migration, and an asserted geometry gate.
The scope does not include the atlas or x/+ fixes.

- [x] Replace the unrestricted-width gate with the existing representable-range contract.
- [x] Record the full channel-migration consumers and public documentation requirements.
- [x] Distinguish zero-stroke composition control from the independent SVG geometry oracle.
- [x] Assert zero unexpected geometry mismatches and tightly characterize the known fringe.
- [x] Rerun the actual baseline/candidate proof at DPR 1/2.
- [x] Confirm omitted outside extrusion fails the geometry comparison itself.

Rerun outcome: **24 geometry cases, zero unexpected mismatches**. Exactly the
characterized legacy centered-cross pixel is accepted at DPR 1; every new outside
case has zero exceptions. Its corresponding legacy pixel matches baseline exactly.
All 54 paired standalone frames and 16 actual Core compatibility frames remain
byte-exact; fallback, retained updates, outside/scissor picking and common scope
opacity checks pass. Existing atlas caps and x/+ behavior remain unchanged.

The negative control omits outside extrusion in the isolated analytic shader.
The geometry gate itself rejects the resulting stable-pixel mismatches before
the envelope gate runs. The temporary shader was restored afterward. This
complements the earlier smaller-quad control caught by the full-frame envelope.
Updated scripts/results and geometry-gate-summary.json are retained in the
evidence folder above. No production files or dependencies were changed.

## Production milestone

- [x] Replace the boolean channel in both programs and migrate the sole Core adapter.
- [x] Document numeric alignment and the retained atlas width cap.
- [x] Migrate existing GPU tests and extend actual rendering coverage for outside
      composition, extrusion, scissor picking, retained updates and rotated concave paths.
- [x] Add the point/path story controls through the existing scene runners.
- [x] Finish package/type/story checks and rerun the independent geometry/Core proof
      against the exact production shader and adapter files.
- [x] Review the final diff and report exact size before opening a PR.

Core's legacy property, resource ownership, atlas generation and x/+ semantics
remain unchanged. This unpublished renderer/API migration has no release impact;
no Changeset is required. Retain this working plan until delivery reconciliation.

### Implementation verification

Implementation commit: 7dfd94105. Both shader paths use the existing combined
coverage; no new helper, resource, dependency or Core grammar is introduced.
Default alignment remains centered; Core's live legacy property maps to 0/1.
The path story uses its existing restart lifecycle so switching the atlas oracle
still recreates the selected backend. The point story updates retained values.

- 19 actual point GPU tests pass in Chrome/Metal, including DPR 1/2 composition,
  outside picking/scissor and equivalent outer-coverage envelopes. The envelope
  assertion compares alpha: different alignments intentionally paint different
  interior colors. Rotated concave picking and all three pathological-width
  clamp modes use the existing path suite.
- 318 renderer unit tests and 79 focused program/Core-adapter tests pass.
- Renderer and Core TypeScript checks, focused ESLint and Storybook build pass.
- The reviewed independent geometry gate passes with the exact production files:
  24 cases, zero unexpected mismatches; only the exact existing centered-cross
  fringe is accepted. All 54 standalone and 16 Core paired frames are byte-exact,
  preserving reactive legacy properties, x/+ fallback/width and datum picking.
- Release policy passes. Existing unrelated fragments plan a minor fixed-group
  release; this unpublished renderer change needs no new fragment.

Final deliverable size against master 0923989b2, excluding this temporary plan:
13 files, +187/-84 raw lines. Runtime JS under the two packages' src trees is
+27/-31 non-comment lines (net -4), excluding declarations/tests. Examples and
story code add the retained controls; the complete deliverable stays within the
reviewed size budget. No PR has been opened. Retire this plan before merge.

Updated production proof results and logs are in the evidence folder above.

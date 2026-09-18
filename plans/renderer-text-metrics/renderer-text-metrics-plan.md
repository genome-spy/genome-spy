# Renderer-owned text measurement

Status: implementation in progress.

## Recommendation

Let the selected live renderer provide the text metrics used by dataflow and
shared view layout. Let each drawing backend use its own metrics for local text
placement, range fitting, squeezing, and culling. Export must not replace the
live measurement provider or replay dataflow.

Canvas and SVG can share a browser-native measurement implementation backed by
a detached Canvas2D context. WebGL retains its BMFont implementation. WebGPU
should expose measurement from the same outline-text layout implementation it
uses for drawing, through a documented public package export.

This deliberately permits export typography to differ from live typography.
Data-derived label selection and spacing remain based on the live renderer.

## Current implementation

- `packages/core/src/data/transforms/measureText.js` requests a BMFont entry
  during transform initialization and calls `font.metrics.measureWidth` for
  each defined field. Reactive font-size changes replay the transform.
- `packages/core/src/data/transforms/truncateText.js` also requests BMFont
  metrics and uses them to choose a prefix plus ellipsis. It must migrate too;
  export retains the already-truncated value just like other dataflow results.
- `packages/core/src/fonts/bmFontMetrics.js` sums glyph advances, divides by
  `common.base`, and multiplies by the requested size. Kerning is explicitly
  TODO. It iterates UTF-16 code units, substitutes missing glyphs, and estimates
  vertical metrics from individual glyphs and SDF padding.
- `packages/core/src/rendering/webgl/gl/dataToVertices.js` uses that same width
  and advances to construct text geometry. Its shader uses the retained width
  for ranged fitting. Replacing only its measurement with native measurement
  would break agreement with its glyph positioning.
- `packages/core/src/rendering/immediate/marks/text.js` also reads
  `mark.font.metrics`. Its width affects range placement, squeeze/visibility,
  rotated bounds, and culling. Canvas drawing, Canvas software picking, SVG
  output, and SVG visible-instance counting share this traversal.
- `packages/core/src/rendering/canvas2d/renderers/text.js` draws native fonts,
  but supplies the BMFont-derived width as `fillText`'s `maxWidth`. This may
  compress native text; it does not guarantee expansion to that width.
- `packages/core/src/rendering/svg/renderers/text.js` sets `textLength` and
  `lengthAdjust="spacingAndGlyphs"` even for ordinary, unranged text. Consequently
  native SVG typography is forced to the BMFont-derived width.
- `axisView.js` generates width transforms and reads BMFont height;
  `titleView.js` and `legendView.js` use shared BMFont helpers. Legends also
  generate width transforms. These affect layout, not just drawing.
- `TextMark` currently requests both a BMFont and, when supported, an outline
  font. `genomeSpyBase.js` constructs a `BmFontManager` for every live backend.
  A native custom font therefore still triggers unrelated BMFont loading.
- `genomeSpy/viewDataInit.js` and dynamic subtree initialization already await
  font readiness before source loading/replay. Headless bootstrap and layout
  test utilities supply their own font managers.
- WebGPU receives `mark.outlineFont` while shared measurements stay BMFont-based.
  Its public `fonts/truetype` type exposes glyph advances and pair adjustments,
  but no whole-string measurement. The font README documents a TrueType default
  with GPOS kerning. Core should not reconstruct that renderer's text layout.
- SVG export creates a destination-sized layout from the prepared hierarchy;
  it does not rebuild dataflow. Native drawing currently has no explicit
  `document.fonts` readiness barrier.

## Goals and non-goals

Goals: measurements agree with the renderer that consumes them; exports preserve
live state; native typography is no longer stretched to BMFont widths; loading
remains outside synchronous dataflow and drawing hot paths.

Non-goals: implement WebGL kerning/shaping, guarantee identical label selection
across backends, rerun collision filtering on export, embed fonts in SVG, provide
a new public measurement-provider option, or implement arbitrary late font
replacement. A standalone SVG opened elsewhere still depends on available fonts.

## Contract and ownership

Use one small internal provider contract, selected by the backend at startup:

```ts
interface TextMetricsProvider {
    requestFont(config: FontConfig): FontMeasurement;
    waitUntilReady(): Promise<void>;
}

interface FontMeasurement {
    measureWidth(text: string, fontSize: number): number;
    getHeight(fontSize: number): number;
}
```

`FontConfig` uses the existing family, style, and weight properties. The methods
are always synchronous. Before the requested face is ready, they explicitly use
the provider's deterministic default-font measurement; after
`waitUntilReady()`, they use the requested face. Width means advance width in
logical pixels, not ink bounds or device pixels. `getHeight` is a stable
font-level layout extent, not the bounding box of the measured string. Keep the
existing WebGL cap-height-plus-descent convention. The native provider measures
`Mg` at the requested size and uses its actual ascent plus descent; the outline
provider uses the corresponding font-wide vertical metrics. No glyph, bitmap,
or GPU resource fields belong in this contract.

Expose the provider as `RenderingBackend.textMetrics` and
`ViewContext.textMetrics`. Keep the provider identity fixed for the live view
tree. `measureText` requests its font in `initialize()` and retains the returned
measurement handle. Keep existing expression replay and undefined-field behavior.
`truncateText` uses the same request/measurement path, preserving its existing
limit, ellipsis, and null-value semantics. Resolve style and weight even when
the family is implicit; do not retain its current default-font shortcut.
Axis/title/legend measurement helpers use the same live provider, including
font requests that occur during view construction and dynamic insertion.

Preserve the existing pre-load font barrier, generalized to include measurement
and renderer resource preparation. A view may receive the documented default-
font provisional sizes before the barrier. Invalidate size caches after
readiness so later layout uses the requested face. Dataflow starts after the
barrier and therefore never observes provisional metrics. Do not add readiness
state to handles, per-row promises, or a second reactive invalidation system.

Backend implementations:

| Backend | Measurement source | Drawing agreement |
| --- | --- | --- |
| WebGL | Existing BMFont metrics | Same advances and normalization as vertex construction |
| Canvas2D | Dedicated Canvas2D `measureText` context | Same native font descriptor and text settings as drawing |
| SVG | Same native provider as Canvas2D | Native browser approximation for SVG text; no per-label DOM measurement |
| WebGPU | Public outline-text measurement API | Same layout/kerning rules and font object as renderer text geometry |

The native provider shares font-family fallback formatting and weight
normalization with drawing. Measure at the requested font size, not at one pixel
and multiply: browser font behavior need not be perfectly scale invariant.
Explicitly align kerning, direction, and supported spacing settings between
measurement and drawing. Start with existing grammar settings, not new ones.
Retain prepared font handles and the last context font setting.

Add only an ASCII fast path for the pathological dense-sequence case in
`examples/docs/examples/genomic-data/msa.json`, where most text instances are
single `A`, `C`, `T`, or `G` letters at one size. Each native font measurement
handle retains one exact font size and a 128-element `Float64Array` of advance
widths, using `NaN` for an unmeasured entry. A size change clears the array and
replaces the retained size. Cache only strings whose length is one and whose
UTF-16 code unit is below 128. Measure all non-ASCII and multi-code-unit strings
whole without caching; never sum character advances to measure a string.

Logo ink bounds use a separate 128-element array at the fixed reference size
described below. An undefined entry is unmeasured, `null` records zero-area ink,
and other entries contain the measured native bounds. Cell dimensions,
rotation, placement, and squeeze factors do not enter either cache. Share the
handle between drawing and picking so repeated sequence letters are measured
once within a stable font size. Do not introduce Unicode maps, size-bucket maps,
eviction policies, or a general string-cache abstraction.

BMFont resources remain WebGL implementation details. `TextMark` requests a
backend-neutral measurement handle during construction, even if no transform
measures that mark. The selected provider's `requestFont()` registers preparation
of the corresponding backend font resources as well as measurement readiness.
Each backend factory creates its provider and private font store together. The
WebGL adapter retrieves the prepared BMFont from that store by normalized font
configuration; the WebGPU adapter/provider similarly shares its private outline
font store. The provider itself owns only bounded JavaScript state and a detached
Canvas context, so it needs no separate disposal contract; renderer resources
retain their existing backend lifetime. Do not defer the first font request
until adapter render preparation: that happens after the current data-loading
barrier. The concrete initialization order is:

1. View/mark construction and transform initialization register font requests.
2. Await the selected provider's pending preparation, then invalidate provisional
   layout sizes.
3. Load/replay data and prepare drawing using ready fonts.

Use the same order for dynamic insertion and newly visible subtrees. Backend
resources remain private; the measurement handle exposes no resource lookup.
Avoid
introducing a generic resource registry or moving unrelated renderer lifecycle
code. Native-only rendering must not load BMFont metadata just to measure text.
Headless layout tests receive an explicit deterministic provider; do not silently
fall back to BMFont in a native rendering test.

Before migrating WebGPU consumers, add and document a public whole-string
measurement operation under a supported font subpath. It accepts the prepared
font, text, and size and returns advance width. Its implementation shares the
renderer’s positioning/kerning logic without materializing glyph geometry or
outline arrays for every measured row. Verify it against rendering layout in
renderer-owned tests; Core must not import private layout modules.

## Immediate drawing and export

Pass a prepared destination measurement handle into `visitTextInstances` through
its options. The neutral visitor must not reach into `mark.font` or discover a
renderer. Canvas drawing and picking use the same provider; SVG counting and
emission use the same provider. Hybrid SVG raster runs continue using the metrics
of their actual raster backend; mixed typography is an accepted consequence.

For ordinary text, remove the BMFont-based `fillText` maximum width and SVG
`textLength`/`lengthAdjust`. Keep explicit stretching for sequence-logo cells.
Use native width to compute fitting and squeeze decisions. When shrinking text,
prefer drawing at the measured base size under a uniform transform so the drawn
width follows the computed scale exactly; preserve anchor, offsets, rotation,
fade, and existing range-padding semantics. Changing font size instead would
require verifying/reconciling the final size's measurement near fit boundaries.

For ordinary immediate text, retain the existing nominal `size` height and
baseline conventions in this change. `getHeight()` serves guide layout; it does
not promise exact per-string ink bounds. Rotated and vertical range fitting
still use the rotated advance-width-by-nominal-height rectangle, now with the
correct destination width. Test both axes for preserved placement and squeeze
semantics, not exact ink containment. Exact ordinary-text baseline/ink geometry
is a separate change. Logo cells below explicitly need ink bounds because they
stretch the visible glyph to a prescribed rectangle.

Logo cells are a separate issue: immediate traversal currently uses BMFont glyph
height and SDF padding, while Canvas measures the logo's native width. Replace
that calculation with destination-native ink bounds in the logo drawing path,
keeping the shared cell rectangle as the culling/picking bound. This is a narrow
backend-specific glyph-bounds helper, not an expansion of advance-width semantics.
Keep current multi-character-logo behavior explicit and test it.

### Native logo placement

Keep this in scope so Canvas/SVG logo drawing no longer requires a BMFont.
Add a shared native helper beside `rendering/nativeText.js`; do not add ink
metrics to `FontMeasurement`. Measure with a fixed, ordinary reference size
(for example 100 logical pixels), the resolved family/style/weight, left text
alignment, and alphabetic baseline. Draw at that same reference size under a
transform. Avoid one-pixel measurement and its sensitivity to rounding.

From Canvas `actualBoundingBoxLeft`, `actualBoundingBoxRight`,
`actualBoundingBoxAscent`, and `actualBoundingBoxDescent`, derive local bounds:

```text
xMin = -actualBoundingBoxLeft
xMax =  actualBoundingBoxRight
yMin = -actualBoundingBoxAscent
yMax =  actualBoundingBoxDescent
sx = cellWidth  / (xMax - xMin)
sy = cellHeight / (yMax - yMin)
```

Map their center to the cell center. In application order, translate the ink
center to zero, scale by `(sx, sy)`, apply existing local `dx`/`dy`, rotate by the
mark angle, and translate to the cell center. The offsets stay in logical pixels
and must not be scaled by the glyph stretch. Preserve current signed range
orientation where applicable. Canvas uses context transforms and `fillText`
without `maxWidth`; SVG uses the equivalent matrix with `x=y=0`, start anchor,
alphabetic baseline, and no `textLength` or heuristic baseline offset.

The immediate visitor publishes only cell geometry and text for logos, removing
its glyph lookup and `SDF_PADDING` calculation. Culling and picking retain the
existing rotated cell rectangle. For empty or zero-area ink (for example spaces),
skip the logo consistently in drawing, SVG counting, and picking; never divide
by a zero extent. Resolve this through the shared native helper before those
paths diverge. Multi-character text remains one stretched cell with the existing
warning; measure the entire string rather than only its first character.

Verify A/C/G/T, a descender, italic overhang, spaces, multi-character text,
non-square cells, rotation, and nonzero offsets. Check the transformed ink
rectangle against the cell mathematically and inspect Canvas/SVG in a real
browser with the same loaded font. Canvas-measured bounds remain an approximation
for SVG in other engines or with substituted fonts. WebGL/WebGPU logo geometry
is unchanged by this native helper.

Add a dense MSA case using ordinary squeezed single-letter text as well as a
logo case. Instrument native measurement calls: repeated cells with the same
ASCII letter/font/base size should measure once after preparation, including
across repaints and picking while that size remains current. A different base
size clears the advance cache; different cell sizes reuse logo bounds. Verify
that multi-character and non-ASCII strings bypass both caches.

Export rules:

1. Dataflow measurements, filtered labels, packing, and guide layout keep using
   the live provider. Export-size arrangement may still run as it does today.
2. Export drawing requests destination fonts and uses destination measurements
   for local fitting and visibility. It never mutates the live provider.
3. Reuse the existing asynchronous image-export entry points to prepare native
   fonts before counting/drawing. Use `document.fonts.load` for requested faces;
   `document.fonts.ready` alone does not initiate a requested face's load. Neither
   mechanism downloads an arbitrary named family or converts BMFont assets into
   native fonts. Existing browser fallback families remain valid.
   Add one SVG-owned helper that creates a native provider, collects requests
   from text marks in the prepared hierarchy, and awaits it. Use the returned
   provider in asynchronous `analyzeSvgExport()`, vector export, and hybrid
   export before the first counting traversal. Reuse that provider for counting
   and emission within one operation. Low-level synchronous SVG rendering may
   accept a prepared provider; without one, it uses currently available browser
   fonts and retains its documented readiness limitation.
4. Synchronous internal rendering consumes prepared resources. Deprecated
   synchronous export can only use fonts already available; do not invent a
   blocking load or claim readiness. Keep its limitation documented.

For example, a WebGL-measured gene label may reserve a slightly different arrow
gap in SVG, or collision filtering may retain a different set than a fresh
native visualization would. Accept and document this. A label rejected upstream
cannot be restored by the destination renderer. Titles or legends can likewise
have imperfect reserved space after cross-backend export.

## Established pattern and alternatives

[Vega's text utility](https://github.com/vega/vega/blob/main/packages/vega-scenegraph/src/util/text.js)
uses Canvas measurement, font descriptors, and a bounded width cache. This
supports sharing a native measuring implementation for browser output. Use
only single-character caching here, following the local WebGPU font lookup
pattern above rather than Vega's general string cache. Per-visualization
ownership avoids export/live interference from a global mutable metric selector.
No upstream code is copied in this proposal;
check and preserve license/provenance if implementation copies code.

The [HTML Canvas specification](https://html.spec.whatwg.org/multipage/canvas.html#dom-context-2d-measuretext)
defines native text measurement. It does not establish exact parity with SVG
across all engines. Browser integration checks are needed for the supported
fonts and settings. Font loading follows the
[CSS Font Loading API](https://drafts.csswg.org/css-font-loading/#font-face-set-load).

Rejected alternatives: native metrics for all renderers would disagree with
WebGL glyph geometry; forcing native output to BMFont width preserves the
current typography problem; swapping providers and replaying dataflow during
export adds state restoration and collision/layout churn; measuring each SVG
label through attached DOM adds layout work and another lifecycle.

## Implementation milestones

- [x] **Live measurement contract and renderer integration.** Add the provider
  types, backend/context wiring, readiness integration, BMFont and native
  providers, and a public WebGPU measurement entry point. Move transform and
  axis/title/legend measurements, including `truncateText`, to this contract.
  Select the BMFont and outline providers for WebGL and WebGPU; activate the
  native provider for immediate rendering in the next milestone when its
  destination measurement can be passed through traversal. Verify custom
  style/weight (including implicit family), transform-only font requests,
  mark-only font requests, truncation, reactive size, dynamic subtree insertion,
  headless layout, and default WebGL compatibility. Test WebGPU measurement
  against its own rendered-text layout, including pair adjustments. Update the
  rendering architecture with provider ownership. Tentative commit:
  `feat(core): use renderer-owned metrics for text measurement`.
- [x] **Native fitting, output, and export preparation.** Inject destination
  measurements into immediate traversal, picking, counting, and exports. Remove
  ordinary native dependence on BMFont metrics and width forcing, and implement
  consistent squeeze transforms. Keep the live Canvas context on BMFont metrics
  until the logo milestone removes the last immediate-renderer BMFont dependency;
  ordinary Canvas drawing and SVG export already use destination-native metrics.
  Verify
  ranged/rotated text, both axes, clipping, flush/padding, squeeze thresholds,
  software picking, SVG counts, the ASCII fast path, and native font readiness
  for standalone analysis as well as export. Preserve nominal ordinary-text
  height semantics.
  Assert export does not replay sources/transforms or change live measurements.
  Update native-renderer and text-mark docs with intentional output differences.
  Tentative commit: `fix(core): fit native text using destination font metrics`.
- [x] **Native logo ink bounds.** Remove the remaining BMFont dependency from
  Canvas/SVG logo traversal, activate the Canvas native provider, and implement
  fixed-reference native ink bounds,
  zero-area handling, transforms, counting, and picking. Verify logo placement
  and the ASCII bounds cache using the cases above. Tentative commit:
  `fix(core): fit native sequence logos using ink bounds`.
- [ ] **Integration acceptance.** Exercise the measure-text table, ranged-text,
  sequence-logo, scored-refSeq-genes, shared-hconcat-legend, and title-styles
  examples under WebGL and Canvas, plus WebGPU where supported. Use
  `examples/docs/examples/genomic-data/msa.json` as the primary cross-renderer
  check for both ordinary squeezed single-letter text and stretched logo letters,
  including vector and hybrid SVG export. Zoom/pan gene tracks, vary reactive
  font size, and export PNG. Include kerning pairs such as AV/To, whitespace,
  italic overhang, custom fonts, non-ASCII/missing glyphs, and repeated exports.
  Check natural native typography, agreement of rendered bounds and picking,
  and unchanged live state afterward. Use real-browser checks for metrics; mocks
  alone cannot establish kerning or font loading. Run focused unit suites,
  workspace type checks, and lint; use layout/SVG and browser skills for their
  respective verification. Publish the export limitations in user docs.
  Tentative commit:
  `test(core): cover renderer text measurement and export consistency`.

Review the provider/readiness/public WebGPU API boundary before implementation
spreads through consumers, then review final cross-backend behavior. No separate
review gates are needed for each small test or documentation adjustment.

## Risks and remaining decisions

Browser-native measurements are environment-dependent. Explicit font loading
and real-browser tests reduce surprises but cannot make portable SVG pixel-exact.
Late host-page font changes are outside the initial contract; applications should
prepare fonts before initialization/export. Do not add automatic dataflow replay
for arbitrary font-loading events in this change.

The WebGPU public measurement signature needs agreement with its text-layout
owner; require a whole-string API that reuses rendering logic, not a Core-side
sum of exposed glyph metrics. Verify the selected native `Mg` height convention
with representative axis and title regressions. Neither concern changes the
central live-versus-destination measurement rule.

# Path points and MSDF problem inventory

## Why start with path points

The current WebGPU point shader is a useful implementation for a fixed set of
symbols, but it is a poor extension point. Each shape is a hand-written WGSL
distance function selected by a branch, and point rotation is evaluated in the
fragment shader. This makes arbitrary user shapes impossible and makes every
new built-in a shader change.

Path points isolate the central technical question: can one path-to-MSDF
pipeline provide scalable fill, outline, rotation, and picking quality for
symbols? The experiment is substantially smaller than font support while
exercising most of the rendering machinery that fonts would later reuse.

The related issues are:

- [#236 Custom point mark shapes](https://github.com/genome-spy/genome-spy/issues/236)
- [#362 Replace a-frame fonts with text-shaper](https://github.com/genome-spy/genome-spy/issues/362)
- [#105 Text effects such as outline and drop shadow](https://github.com/genome-spy/genome-spy/issues/105)
- [#474 Align point stroke geometry across WebGL, Canvas, and SVG](https://github.com/genome-spy/genome-spy/issues/474)

Historical quality and behavior reports that should inform later validation
include [#149](https://github.com/genome-spy/genome-spy/issues/149),
[#234](https://github.com/genome-spy/genome-spy/issues/234),
[#288](https://github.com/genome-spy/genome-spy/issues/288), and
[#84](https://github.com/genome-spy/genome-spy/issues/84).

## Problems the complete project can solve

### Point symbols

- **Hard-coded symbol vocabulary.** SVG path input makes the vocabulary
  extensible without adding WGSL for every symbol.
- **Custom Vega-like shapes.** Users can supply familiar SVG path strings; the
  built-in symbols can use the same representation.
- **Divergent implementations.** A common path description gives WebGPU,
  Canvas, and SVG renderers a shared source shape, even if each backend renders
  it differently.
- **Rounded SDF corners.** MSDFs retain multiple edge distances near a corner,
  producing materially sharper, miter-like outlines than thresholding an
  ordinary single-channel SDF.
- **Conflated `x` and `+` semantics.** Closed path silhouettes let
  `strokeWidth` consistently mean outline width. Arm thickness becomes part of
  the path or a separately named future parameter.
- **Shader complexity.** Shape-specific analytic branches become an atlas
  lookup and one shared distance decoder.
- **Fragment-shader rotation.** Instanced quads can be rotated once per vertex,
  reducing fragment work and making padded bounds explicit.
- **Inconsistent picking.** The same MSDF coverage can drive visible color and
  picking, including holes and transparent regions.
- **Difficult built-in maintenance.** Adding or revising a built-in becomes a
  path-data change that can be previewed and tested independently.

### Text and font infrastructure enabled by the same foundation

- **Fixed pre-generated font atlases.** Runtime glyph rasterization can produce
  an atlas from the actual font and glyph set in use.
- **Limited glyph coverage.** Static TrueType fonts, including many Google
  Fonts, can contribute glyphs through their `cmap` rather than through a
  preselected atlas character list.
- **Large-text and zoom quality.** MSDF glyphs remain useful over a wider scale
  range than ordinary bitmap glyphs.
- **Text outlines and halos.** The same signed distance can produce a dynamic
  outline, improving contrast on heterogeneous visualization backgrounds.
- **Additional text effects.** Shadow, glow, selection halo, and focus emphasis
  can reuse glyph coverage without separate pre-baked atlases.
- **Font metrics and basic kerning.** A focused static-TrueType reader can
  provide real advances and positions, with legacy `kern` plus GPOS pair
  adjustment covering basic Latin kerning in modern fonts.
- **Shared resource management.** Point symbols and glyphs can eventually share
  atlas packing, texture upload, deduplication, caching, and GPU lifecycle
  concepts.

## What the proof of concept actually solves

The first experiment directly addresses custom path symbols and validates a
cleaner point stroke model. It also tests vertex rotation, coverage-based
picking, atlas resource ownership, and the visual suitability of MSDF outlines.

The original path-point experiment did **not** solve font loading, kerning,
text layout, Core API design, cross-renderer parity, or production atlas
caching. The follow-up printable-ASCII slice now proves static TrueType outline
loading, metrics, and basic GPOS/legacy pair positioning, but it is still not a
general shaping or production atlas system.

## Open problems and rationale

### SVG path parsing and normalization

SVG syntax includes smooth curves, arcs, relative commands, compact number
syntax, and implicit command repetition. A partial parser would appear to work
until real user paths expose its gaps. Adapting the focused parser used by
[Vega Scenegraph](https://github.com/vega/vega/tree/main/packages/vega-scenegraph/src/path)
is attractive because it matches the desired user model and has existing path
fixtures. It must remain a small attributed adaptation rather than a dependency
on the entire scenegraph package.

Vega custom symbols use a square `[-1, 1]` coordinate convention and interpret
`size` as bounding-box area. GenomeSpy may eventually match that rule exactly,
but the proof of concept deliberately uses a simple aspect-preserving internal
normalization. Its purpose is to compare rendering feasibility, not settle the
public size contract. Side-by-side results will inform that later decision.

### MSDF robustness

MSDF generation depends on contour orientation, edge coloring, winding, and
distance evaluation. Self-intersections, overlapping contours, tiny features,
coincident control points, and holes can expose artifacts. The proof of concept
uses known-good paths and records failures without choosing a public fill rule
or promising arbitrary self-intersecting input. Those policies are graduation
work if the basic approach is feasible.

### Stroke semantics and miter limits

MSDF threshold bands give sharp, miter-like joins, which is likely good enough
for point symbols and text outlines. This is not identical to geometric SVG
stroking. An acute theoretical miter can exceed the stored distance range or
atlas padding, and there is no exact bevel transition at an SVG `miterLimit`.

The initial contract should therefore promise a high-quality outline within a
documented width/scale range, not complete SVG stroke equivalence. If exact
joins, caps, dashes, or open paths become necessary, use a geometric stroker or
tessellator for that separate use case.

### Atlas resolution, distance range, and padding

A larger tile and distance range improve wide outlines and corner quality but
consume more texture memory. Too little padding clips a rotated thick outline;
too much wastes the atlas. The proof of concept stores range in atlas texels,
uses separate shape padding plus a one-texel extruded gutter, maps UVs to texel
centers, and uses one linearly filtered mip level. The vertex shader derives the
exact atlas-to-device-pixel distance scale from point diameter, device-pixel
ratio, and atlas shape resolution, then passes it flat to the fragment shader.
The comparison must still measure the actual 0-4-pixel stroke range at small
and large point sizes.

### Texture filtering and device-pixel ratios

Small symbols and fractional device-pixel ratios are where atlas filtering and
distance-scale errors tend to become visible. Results must be checked at several
DPRs and sizes. Mipmapping may help minification but complicates atlas edge
padding and texture generation, so it should be added only if measurements show
a need.

The PathText comparison exposed the opposite problem at large text: a
40-texel/em glyph enlarged to 76 CSS pixels looked acceptably close to the WASM
oracle at DPR 1 but visibly rounded at DPR 2, where it covered 152 device
pixels. A diagnostic 152-texel/em atlas removed the undersampling but made the
fixed ASCII atlas unnecessarily large. The story therefore retains a smaller
80-texel/em atlas, while production text remains responsible for selecting or
generating an appropriate resolution class from glyph size and DPR.

### Atlas population and lifetime

A fixed startup atlas is sufficient for the story. A production renderer needs
answers for asynchronous generation, duplicate paths, many data-driven unique
symbols, texture growth, eviction, reuse between marks, device loss, and
possibly persistent caching. The proof of concept should expose timing and
resource ownership clearly but must not prematurely implement this policy.

### Fill, outline, bounds, and picking

The renderer eventually needs one geometry contract for visible coverage,
clipping bounds, culling, and picking. The proof of concept only needs
conservative padded quads and matching render/pick coverage for its curated
scene. Centered versus outer stroke, invisible-stroke bounds, and
`inwardStroke` remain explicit graduation questions rather than blockers.

### Bundle size and provenance

Importing `text-shaper` through its broad font entry would bring far more code
than path points need. A focused adaptation is expected to be much smaller, but
its size must be measured from the actual package build. The source is MIT and
some rasterizer portions derive from FreeType; the pinned source revision,
licenses, notices, and modifications must remain visible in the repository.

### Fonts are more than outlines

Once font work begins, TrueType outline extraction is only one part of correct
text. Static Google Fonts commonly need `cmap`, horizontal metrics, and GPOS
pair adjustment; legacy `kern` remains a useful fallback. GSUB, script shaping,
bidi, fallback, variable axes, CFF, color glyphs, and WOFF2 are separate scope
decisions. Path-point success must not be interpreted as having solved those
text-layout problems.

## Main risks

- The adapted rasterizer may be small but costly to maintain against upstream.
- Some valid SVG paths may rasterize poorly enough to require a more robust
  implementation or preprocessing.
- Sharp-corner quality may fail at the stroke widths and symbol sizes users
  actually need.
- Atlas generation could cause noticeable startup latency for large symbol or
  glyph sets.
- An unconstrained custom-shape channel could create unbounded atlas pressure.
- A supposedly shared point/text abstraction could become more complicated
  than two small, purpose-specific wrappers around shared primitives.
- The prototype could accidentally become public before sizing, path
  normalization, cache policy, and error behavior are settled.

## Questions for the review gate

- Do the provisional MSDF outlines look sufficiently mitered for symbols and
  text effects to justify defining production semantics?
- What maximum stroke width and scale range can one atlas entry support without
  clipping or objectionable artifacts?
- If the experiment succeeds, should public point `size` exactly follow Vega's
  path bounding-box-area rule?
- Which fill rule and contour-validation behavior should a public path contract
  use?
- Is a fixed per-symbol tile acceptable, or does quality require variable-sized
  atlas entries?
- Does the runtime generation and package-size cost justify replacing the
  analytic built-ins, or should paths be an additional route?
- Should built-ins and user paths share one atlas and cache identity?
- How many unique data-driven paths should one mark or renderer accept?
- Is MSDF coverage precise enough for picking, or should picking use a cheaper
  conservative shape?
- Which font container and shaping capabilities belong in GenomeSpy, and which
  should remain optional or delegated to the browser?

# Selective WebGL Rasterization for SVG Export

## Summary

GenomeSpy should be able to export hybrid SVG documents in which dense or
otherwise unsuitable mark layers are embedded as raster images while axes,
titles, labels, and sparse marks remain editable vector elements. Rasterized
content must be rendered by GenomeSpy's existing WebGL renderer. Canvas2D is
not a mark renderer; it may only be used to encode pixels read from WebGL as a
PNG for embedding in the SVG.

This follows the established mixed-mode export model used by Matplotlib, where
selected artists are rasterized in SVG/PDF output while axes and text remain
vector. See [Rasterization for vector graphics](https://matplotlib.org/stable/gallery/misc/rasterization_demo.html).

The existing architecture makes this feasible. `canvasExport.js` already
renders the normal view tree into an RGBA framebuffer using
`BufferedViewRenderingContext`, and `SvgViewRenderingContext` already sees each
mark at the correct point in the view hierarchy with its coordinates, clip,
and rendering options.

## Goals

- Render selected mark layers with the existing WebGL programs, buffers,
  textures, scales, clipping, and facet logic.
- Embed each rasterized result as a transparent PNG `<image>` in the
  corresponding SVG mark/view group.
- Preserve sibling draw order and keep non-rasterized axes, titles, labels, and
  marks as native SVG.
- Support a configurable raster pixel ratio independently of SVG logical size.
- Avoid generating a large vector DOM before deciding to rasterize.
- Return enough export information to identify content that was rasterized and
  why.
- Keep all rasterization implementation in the dynamically imported SVG export
  subsystem except for small reusable framebuffer utilities.

## Non-goals

- Implementing any mark with the Canvas2D drawing API.
- Replacing the normal interactive WebGL renderer.
- Preserving editability of individual instances inside a rasterized layer.
- Rasterizing the complete visualization when ordinary PNG export is more
  appropriate.
- Supporting arbitrary partial overlap reordering in the first increment.
- Solving general grammar faceting, which remains outside the SVG export scope.
- Choosing final automatic thresholds before export-size measurements exist.

## Terminology

- **Raster target:** A mark occurrence or contiguous view subtree selected for
  WebGL rasterization.
- **Capture bounds:** The logical CSS-pixel rectangle covered by the embedded
  image.
- **Raster pixel ratio:** Physical PNG pixels per logical SVG pixel.
- **Hybrid export:** An SVG containing both native vector elements and embedded
  raster images.

## Key decisions

### WebGL remains the only mark renderer

Raster targets are rendered by calling the same `mark.render()` callbacks used
for the interactive canvas. A `BufferedViewRenderingContext` targets an
offscreen framebuffer with `picking: false`. This preserves shader-based scale
transforms, expressions, selection styling, hatches, shadows, fading, and
SampleView facet uniforms without porting them to another renderer.

Canvas2D may receive the completed RGBA pixels through `putImageData()` solely
to use the browser's PNG encoder. A dedicated PNG encoder is an alternative,
but it adds complexity without improving mark fidelity.

### Start at mark/UnitView granularity

A UnitView is the safest initial raster boundary:

- It naturally represents one graphical layer.
- The SVG context can insert the `<image>` exactly where the mark group would
  have appeared.
- Layered plots retain vector siblings in the correct order.
- Instance count and mark type are available before SVG elements are emitted.
- Axes, titles, and legends remain vector without special handling.

Rasterizing an arbitrary composite subtree is useful later, particularly for
SampleView aggregation, but requires capture scopes spanning multiple
`renderMark()` calls.

### Use an export-sized framebuffer first

The first implementation should reuse one transparent framebuffer sized to the
full SVG export at the configured raster pixel ratio. Each capture clears and
renders only its selected mark, then reads only the physical-pixel rectangle
corresponding to its capture bounds.

This is deliberately conservative: existing absolute viewport, half-pixel,
scissor, and culling calculations remain unchanged. The allocation is no larger
than the existing full PNG export at the same size and pixel ratio. A later
optimization may use smaller framebuffers by translating all view and clip
rectangles by the capture origin.

### Embed self-contained PNG data

The SVG `<image>` must use an embedded data URL rather than a Blob URL, because
the saved SVG must remain portable after the browser session ends. Its `x`,
`y`, `width`, and `height` use logical SVG pixels; the PNG dimensions include
the raster pixel ratio.

The image remains inside a named mark/view `<g>` and receives the same effective
SVG clip path as the vector mark group. WebGL clipping already removes pixels,
but retaining the SVG clip guards against interpolation at cropped edges and
keeps the hierarchy understandable in editors.

## Proposed architecture

### Public entry point

`GenomeSpy.exportSvg()` passes the existing `WebGLHelper` and rasterization
options into the dynamically imported SVG module. This does not create another
WebGL context; mark GPU resources belong to the existing context and are reused.

A tentative option shape is:

```js
await genomeSpy.exportSvg({
  rasterization: {
    pixelRatio: 3,
    maxVectorElements: 10_000,
  },
});
```

The exact selection API is unresolved. The implementation should internally
support an explicit predicate or selected-view set before exposing automatic
thresholds publicly.

### SVG rendering context

`SvgViewRenderingContext.renderMark()` obtains the mark data before emission
and asks a rasterization policy whether the occurrence should remain vector.

- Vector: call the existing SVG mark renderer.
- Raster: create the normal mark group, append an `<image>` placeholder, and
  give the WebGL rasterizer the mark, current coordinates, rendering options,
  effective clip, placeholder, and diagnostic metadata.

The decision must happen before invoking the SVG renderer so dense instance
elements are never constructed and discarded.

### WebGL rasterizer

A new module under `packages/core/src/svg/raster/` should own:

- Creation and deletion of the reusable RGBA framebuffer.
- Construction of a `BufferedViewRenderingContext` for a capture.
- Rendering the selected mark callbacks with transparent clear color.
- DPR-aware capture-bound rounding.
- Cropped `readPixels()` and WebGL-to-SVG Y-axis conversion.
- Unpremultiplication of transparent pixel colors.
- PNG encoding and assignment to the `<image>` placeholder.

The rasterizer should be export-scoped and finalized in a `finally` block so
framebuffers and attachments cannot leak if a capture fails.

### Capture bounds

Bounds must be rounded outward in physical pixels:

```text
left   = floor(logicalLeft   * pixelRatio)
top    = floor(logicalTop    * pixelRatio)
right  = ceil (logicalRight  * pixelRatio)
bottom = ceil (logicalBottom * pixelRatio)
```

The embedded logical rectangle is derived back from these physical bounds.
This preserves fractional placement while guaranteeing that edge pixels are
not omitted.

For a mark clipped in both directions, the effective clip rectangle is the
natural capture bound. A one-directional clip uses the full export extent in
the other direction. An unclipped mark initially uses the full export bounds;
geometry-aware bounds and effect padding can be added later.

### Transparency

GenomeSpy shaders and blending use premultiplied alpha. `gl.readPixels()`
therefore returns premultiplied RGB values, while `ImageData` represents
unpremultiplied colors. Before PNG encoding, every nonzero-alpha pixel must be
converted approximately as follows:

```text
rgb = min(255, round(rgb * 255 / alpha))
```

This is required to prevent dark translucent edges and shadows when the PNG is
composited over vector content. The conversion should be shared with
transparent full-canvas PNG export if tests confirm the same issue there.

### Draw order and opacity

The `<image>` replaces its mark group at the same traversal position, so vector
siblings before and after it retain their SVG paint order. Effective view and
mark opacity is already applied by WebGL and must not be applied again to the
SVG image.

Rasterizing multiple marks into one image is allowed only when they form a
contiguous draw-order range. Combining noncontiguous layers would change
compositing relative to intervening vector marks.

### SampleView

The normal WebGL path already consumes `facetId`,
`sampleFacetRenderingOptions`, SampleView facet textures/uniforms, and the
GridChild clip. Rendering a single occurrence into a framebuffer should
therefore be correct without special shaders.

However, SampleView currently invokes its child view once per visible sample.
A naïve mark-level implementation may create one PNG per sample. This is a
correct fallback but not an acceptable final optimization for thousands of
samples.

A later capture-scope increment should aggregate repeated callbacks that share
the same raster target and GridChild clip into one image. This must preserve
sample transition ordering when facets overlap. If a safe aggregation boundary
cannot be identified through existing `pushView()`/`popView()` calls,
SampleView should expose an explicit rendering-context capture scope around its
repeated sample loop rather than relying on class-name detection.

## Rasterization policy

The policy should be developed in this order:

1. Internal explicit selection used by tests and development.
2. Public explicit selection by view selector or export-only mark predicate.
3. Automatic selection using an estimated SVG element count.
4. Optional export-size and elapsed-time diagnostics for tuning defaults.

Raw datum count is only an approximation. A renderer-specific estimator may
account for cases such as rectangle shadows, while most point, rule, link,
arrow, and text instances contribute one primary element. The estimator should
remain conservative and inexpensive.

Rasterization should be reported as export metadata, not as an unsupported
property warning. A tentative result extension is:

```ts
interface SvgRasterizationInfo {
  viewPath: string;
  markType: string;
  instanceCount: number;
  reason: "explicit" | "element-limit" | "unsupported-vector-feature";
  pixelRatio: number;
}
```

Whether this becomes a new `rasterized` result field or structured diagnostics
is unresolved.

## Alternatives considered

### Canvas2D mark renderer

Rejected. It would duplicate scale, geometry, clipping, faceting, and visual
property behavior already implemented in WebGL and WGSL/GLSL.

### Rasterize the completed main canvas

Rejected for selective layers. Once layers have been composited into the main
canvas, their pixels cannot be separated. The selected layer must be rendered
again into an isolated framebuffer.

### Generate vector SVG, then rasterize selected DOM groups

Rejected. It pays the cost and memory of constructing the dense SVG content,
depends on browser SVG rasterization behavior, and cannot reproduce unsupported
shader effects reliably.

### Dedicated cropped framebuffer from the start

Deferred. Translating every view coordinate, clip rectangle, and culling bound
is feasible but expands the first implementation's correctness surface. A
full-sized reusable framebuffer with cropped readback establishes fidelity
first.

### Rasterize complete view subtrees only

Deferred. It can reduce image count and is useful for SampleView, but loses more
editability and requires a capture scope spanning nested and repeated views.

## Risks and mitigations

- **Dark alpha fringes:** Unpremultiply readback pixels and add transparent
  compositing tests.
- **GPU memory limits:** Validate requested dimensions against
  `MAX_RENDERBUFFER_SIZE` and `MAX_TEXTURE_SIZE`; return an actionable error or
  lower the pixel ratio. Add tiling only if required.
- **Missing effect pixels:** Start with effective clip/full-export bounds and
  round outward. Add geometry bounds only with conservative effect padding.
- **Framebuffer antialiasing differs from the default canvas:** Prefer a higher
  raster pixel ratio initially. Consider multisampled framebuffer resolve as a
  later quality option.
- **GL state is changed during export:** Perform captures synchronously within
  export and rely on the existing `exportSvg()` cleanup render to restore the
  visible canvas. Ensure every framebuffer path unbinds in `finally`.
- **Large embedded data URLs:** Crop readback, compress as PNG, and avoid many
  repeated SampleView images through later aggregation.
- **Changed draw order:** Rasterize only one mark or a contiguous subtree per
  image and retain its exact SVG insertion point.
- **Mutable rendering options:** Snapshot clip and facet options when a capture
  is deferred rather than retaining objects that SampleView may reuse.

## Implementation plan

### 1. Extract robust framebuffer readback

**Outcome:** A reusable helper reads a DPR-aware framebuffer rectangle, flips
it, optionally unpremultiplies alpha, and encodes a PNG.

**Affected areas:**

- `packages/core/src/gl/webGLHelper.js` or a focused export utility.
- Existing canvas export tests and new transparent-pixel tests.

**Verification:** Test crop orientation, transparent color recovery, fractional
bounds, and opaque output compatibility.

**Documentation/migration:** None; internal refactor only.

**Tentative commit:** `fix(core): support transparent cropped WebGL readback`

### 2. Add an explicit single-mark raster capture

**Outcome:** The SVG subsystem can replace one explicitly selected UnitView
mark with a WebGL-rendered `<image>` while preserving vector siblings.

**Affected areas:**

- New `packages/core/src/svg/raster/` modules.
- `packages/core/src/svg/index.js`.
- `packages/core/src/svg/svgViewRenderingContext.js`.
- `packages/core/src/genomeSpyBase.js` for passing `WebGLHelper` internally.

**Verification:** A browser integration fixture with vector rules/text around a
rasterized point layer; assert SVG hierarchy and compare the hybrid rendering
against ordinary WebGL.

**Documentation/migration:** Keep the selection hook internal at this step.

**Tentative commit:** `feat(core): rasterize selected SVG mark layers with WebGL`

### 3. Add pixel-ratio, limits, diagnostics, and cleanup

**Outcome:** Captures have configurable resolution, validate GPU limits, report
rasterization metadata, and release all framebuffer resources on success and
failure.

**Affected areas:**

- SVG export option/result types.
- Rasterizer lifecycle and error handling.
- Core API tests.

**Verification:** Test multiple sequential captures, oversized requests,
resource cleanup, custom logical export size, and pixel ratios above one.

**Documentation/migration:** Document that raster resolution remains fixed when
the SVG is scaled for print.

**Tentative commit:** `feat(core): configure SVG raster layer resolution`

### 4. Add explicit public selection

**Outcome:** Callers can select raster targets using a stable export-only API,
preferably based on existing view selectors rather than implementation classes.

**Affected areas:**

- `SvgExportOptions` and related public types.
- View selection/validation helpers.
- API documentation and App export UI only if a control is desired.

**Verification:** Select one layer in a multi-layer example, reject ambiguous or
invalid selectors clearly, and confirm unspecified layers remain vector.

**Documentation/migration:** Add a concise hybrid-export example. No default
behavior changes yet.

**Tentative commit:** `feat(core): select raster layers in SVG exports`

### 5. Add automatic dense-layer selection

**Outcome:** Export can rasterize marks whose estimated SVG complexity exceeds
a configured limit without first constructing their elements.

**Affected areas:**

- Renderer complexity estimators.
- Rasterization policy and diagnostics.
- Dense synthetic fixtures.

**Verification:** Confirm boundary behavior around the threshold, vector axes
and titles, reduced SVG element count/file size, and deterministic diagnostics.

**Documentation/migration:** Automatic rasterization should initially be opt-in.
Document the fidelity/file-size tradeoff.

**Tentative commit:** `feat(core): rasterize dense SVG mark layers automatically`

### 6. Aggregate SampleView captures

**Outcome:** Repeated sample facets belonging to the same selected layer and
GridChild clip are rendered into one image rather than one image per sample.

**Affected areas:**

- Raster capture scopes in the rendering-context API.
- `packages/app/src/sampleView/sampleView.js` if an explicit GridChild scope is
  required.
- SampleView SVG/browser tests.

**Verification:** Expanded, collapsed, scrolled, sticky-summary, and transition
states; ensure y positions, clipping, draw order, and image count are correct.

**Documentation/migration:** Internal optimization; document only observable
limitations if any remain.

**Tentative commit:** `perf(app): aggregate SampleView SVG raster captures`

### 7. Evaluate smaller or multisampled framebuffers

**Outcome:** Decide from measurements whether translated cropped framebuffers,
MSAA resolve, or tiled rendering are justified.

**Affected areas:** Rasterizer internals only unless new quality options are
exposed.

**Verification:** Compare memory, export time, edge quality, and output size on
representative dense examples and high-DPI exports.

**Documentation/migration:** Record the chosen quality/performance defaults.

**Tentative commit:** `perf(core): optimize SVG raster capture framebuffers`

## Initial testing material

- A small layered point/rule/text spec to verify exact sibling ordering.
- `examples/docs/examples/generic/upsetr-mutations.json` to keep axes, labels,
  and sparse matrix structure vector while selectively rasterizing a chosen
  mark layer.
- A dense point or rect fixture generated in a test rather than committed as a
  huge JSON file.
- `packages/app/src/sampleView/sampleView.js` examples for the aggregation step.
- A transparent-shadow fixture placed over differently colored SVG backgrounds
  to expose premultiplied-alpha errors.

## Acceptance criteria

- At least one selected dense mark is rendered exclusively by WebGL and appears
  as one embedded PNG `<image>` in the correct SVG group.
- Vector siblings before and after the image preserve their draw order and
  remain editable.
- The hybrid rendering matches the ordinary WebGL rendering at the configured
  raster pixel ratio, including clipping and opacity.
- Transparent edges composite without dark halos in Chrome, Firefox, Safari,
  and at least one vector editor used for publication workflows.
- Custom logical export dimensions and raster pixel ratios work together.
- Rasterization is reported through structured export information.
- GPU resources are released after both successful and failed exports.
- Automatic rasterization does not occur silently until its policy and default
  threshold are explicitly approved.
- SampleView either aggregates repeated captures correctly or remains excluded
  from automatic rasterization with a clear documented limitation.

## Unresolved questions

- Should explicit selection use existing view selectors, a callback available
  only to JavaScript callers, or an export-only property in the specification?
- Should rasterization diagnostics extend the result with a `rasterized` field
  or use a more general structured diagnostics collection?
- What raster pixel ratio should the App offer by default for publication use?
- Should unsupported vector-only features automatically request WebGL fallback,
  or should that remain separate from density-based rasterization?
- What complexity estimator and default threshold give useful file-size savings
  without surprising users?
- Is one image per SampleView GridChild sufficient, or must independently named
  sample layers remain separate for editor workflows?
- When should tiled or multisampled rendering be introduced, based on measured
  GPU limits and visual quality?

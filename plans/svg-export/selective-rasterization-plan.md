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

- Render over-threshold mark layers with the existing WebGL programs, buffers,
  textures, scales, clipping, and facet logic.
- Combine maximal contiguous runs of over-threshold mark layers into transparent
  PNG `<image>` elements. Adjacent rasterized layers should not create separate
  images merely because they are separate marks.
- Include all SampleView facets and all adjacent over-threshold marks in the run
  in one image, regardless of the number of samples.
- Preserve sibling draw order and keep non-rasterized axes, titles, labels, and
  marks as native SVG.
- Support a configurable raster pixel ratio independently of SVG logical size.
- Avoid generating a large vector DOM before deciding to rasterize.
- Return enough export information to summarize the rasterized mark types,
  instance counts, and threshold.
- Keep ordinary SVG export fully functional when no WebGL context is available,
  including in headless and batched processing environments.
- Let App users configure optional rasterization in a Save SVG dialog rather
  than hard-coding export options in the toolbar action.
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
- Selecting individual views for rasterization by name, path, selector, or
  callback.

## Terminology

- **Raster target:** A logical mark/UnitView whose visible-instance count is
  above the threshold, including all of its repeated SampleView rendering
  requests.
- **Raster run:** A maximal contiguous paint-order sequence of compatible
  raster targets. One raster run is emitted as one embedded image.
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

### Rasterization is an optional capability

The vector SVG exporter must not require a WebGL context, GPU resources, canvas
readback, or PNG encoding support. Rasterization is an optional acceleration
and file-size feature layered on top of vector export, not a prerequisite for
it. This preserves reliable headless and batched SVG generation.

The raster implementation should sit behind a second dynamic import inside the
SVG subsystem. It is loaded only when `maxVectorInstances` is configured, at
least one mark exceeds the threshold, and a usable existing WebGL context is
available. The normal SVG module graph must not statically import framebuffer,
readback, or browser PNG-encoding code.

If rasterization is requested but no WebGL context is available, export
continues as an all-vector SVG and returns one structured warning that the
rasterization option was ignored. It must not fail, silently omit marks, or emit
placeholder images. Unsupported SVG properties continue to use their existing
warnings.

### Select marks, but emit contiguous raster runs

A UnitView is the safest initial selection boundary:

- It naturally represents one graphical layer.
- Layered plots retain vector siblings in the correct order.
- Instance count and mark type are available before SVG elements are emitted.
- Axes, titles, and legends remain vector without special handling.

Selection granularity must not dictate image granularity. After selection, the
exporter combines the maximal contiguous run of compatible raster targets and
inserts one image at that run's paint-order position. A vector mark, axis,
title, background, or other painted SVG content closes the pending run. Thus
two rasterized layers separated by vector content remain separate images.

Combining a run intentionally gives up the individual SVG groups of its marks.
The image should be placed in a named raster-run group under the nearest common
SVG parent of the participating views. Empty per-mark and per-UnitView groups
should be omitted. This keeps files small while retaining meaningful hierarchy
around the hybrid content.

### Use an export-sized framebuffer first

The first implementation should reuse one transparent framebuffer sized to the
full SVG export at the configured raster pixel ratio. Each capture clears and
renders one raster run, then reads only the physical-pixel rectangle
corresponding to the run's capture bounds.

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

The image remains inside a named raster-run `<g>`. If every target has the same
effective SVG clip, the group receives that clip as an additional edge guard.
Different clips do not prevent batching: WebGL applies each target's own
scissor/clip while drawing, and pixels outside those clips stay transparent.

## Proposed architecture

### Public entry point

`GenomeSpy.exportSvg()` passes rasterization options and the existing
`WebGLHelper`, if available, into the dynamically imported SVG module. It does
not create a WebGL context for export. When a helper is supplied, mark GPU
resources belong to its existing context and are reused.

A tentative option shape is:

```js
await genomeSpy.exportSvg({
  rasterization: {
    pixelRatio: 3,
    maxVectorInstances: 10_000,
  },
});
```

`maxVectorInstances` is the only selection control. A mark remains vector when
its non-culled instance count is at most the threshold and is rasterized when
the count is larger. Omitting the option disables rasterization. This keeps the
behavior predictable and avoids relying on view paths, which are not stable
identifiers. Supplying the option without an available WebGL context produces
an all-vector export with a warning.

### App export dialog

The App's **Save SVG** menu item should open a dedicated dialog modeled on
`saveImageDialog.js`. The dialog displays the current logical visualization
dimensions and offers:

- A **Rasterize dense marks** checkbox. It is off by default so SVG export
  remains purely vector unless the user opts in.
- A positive integer **Maximum vector instances** input, enabled only when
  rasterization is selected. Start with 10,000 as a practical editable default;
  this is a UI convenience, not a Core default.
- A **Raster scale factor** control, enabled only when rasterization is
  selected. It controls `pixelRatio` and should use the same clear scale-factor
  language as the PNG dialog.

The dialog passes `maxVectorInstances` and `pixelRatio` to `exportSvg()`, owns
the existing file-picker/download flow, and reports returned warnings through
the App's dialog UI or existing warning mechanism. No per-view controls are
provided. The toolbar should only open the dialog; export and download logic
should not remain duplicated in `toolbar.js`.

### SVG rendering context

`SvgViewRenderingContext.renderMark()` obtains the mark data before emission
and asks a rasterization policy whether the logical mark should remain vector.

- Vector: call the existing SVG mark renderer.
- Raster: append a target record to the pending raster run and buffer every
  rendering request for that mark together with its coordinates, rendering
  options, effective clip, and diagnostic metadata.

The decision must happen before invoking the SVG renderer so dense instance
elements are never constructed and discarded. Repeated SampleView callbacks
must find the existing raster target rather than creating additional targets.

The context needs a flattened paint-operation stream in addition to the view
hierarchy. A pending run is extended only while raster targets are consecutive
and compatible. Emitting any vector paint operation flushes it. Entering or
leaving structural groups alone does not split a run; the exporter computes the
nearest common parent for the final run and omits empty groups. This permits
stacked sibling UnitViews to share an image without combining noncontiguous
content.

Targets are compatible when they use the same WebGL context, export pixel
ratio, compositing surface, and raster capture lifecycle. Capture rectangles
and WebGL clips may differ because the run uses their union for readback and
retains each draw request's own clip. Future blend modes or isolated compositing
groups may introduce additional run boundaries.

### WebGL rasterizer

A new module under `packages/core/src/svg/raster/` should own:

- Creation and deletion of the reusable RGBA framebuffer.
- Collection and execution of raster-target callbacks using the same mark-wise
  batching model as `BufferedViewRenderingContext`.
- Rendering all targets in one raster run, in paint order, after one transparent
  clear.
- DPR-aware capture-bound rounding.
- Cropped `readPixels()` and WebGL-to-SVG Y-axis conversion.
- Unpremultiplication of transparent pixel colors.
- PNG encoding and assignment to the `<image>` placeholder.

The rasterizer should be export-scoped and finalized in a `finally` block so
framebuffers and attachments cannot leak if a capture fails. Each raster run is
cleared, rendered, read back, and encoded once after traversal has collected
all of its callbacks.

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

For a mark clipped in both directions, the effective clip rectangle is its
natural capture bound. A one-directional clip uses the full export extent in
the other direction. An unclipped mark initially uses the full export bounds.
A run's capture bounds are the union of its targets' bounds; geometry-aware
bounds and effect padding can be added later.

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

The `<image>` replaces the whole raster run at the position of its first paint
operation, so vector siblings before and after it retain their SVG paint order.
Effective view and mark opacity is already applied by WebGL and must not be
applied again to the SVG image.

Rasterizing multiple marks into one image is required when they form a maximal
compatible contiguous draw-order range. Combining noncontiguous layers is
forbidden because it would change compositing relative to intervening vector
marks. Ordinary source-over compositing needs no special handling because the
targets are replayed in their original order into the same transparent buffer.

### SampleView

The normal WebGL renderer already batches requests by mark. Its callbacks
consume `facetId`, `sampleFacetRenderingOptions`, SampleView facet
textures/uniforms, and the shared GridChild clip. Raster export must retain this
boundary: all sample facets of a raster target are rendered into the same
framebuffer capture. When adjacent SampleView marks exceed the threshold, all
facets of all those marks become one embedded image.

One image per sample or per adjacent raster target is not an acceptable
fallback. A visualization may have thousands of samples and several stacked
dense layers; fragmenting those into images would make both the SVG DOM and PNG
encoding cost unreasonable. A raster target is therefore keyed by mark
identity, while the emitted image is keyed by raster run, not by an individual
`renderMark()` callback.

The callbacks must execute in the same order as the existing buffered WebGL
renderer. If the SVG traversal cannot infer the complete repeated-mark scope,
SampleView should expose an explicit rendering-context scope around its sample
loop rather than relying on class-name detection.

## Rasterization policy

Rasterization uses one user-supplied maximum vector-instance count. The count
must include only instances that the SVG renderer would actually emit after
viewport, clip-region, `cullByVisibleRange`, and invalid-value culling. An
instance is counted once even if its renderer emits several SVG elements, such
as a rectangle with a shadow.

For SampleView, the count is the sum of visible instances across all sample
facets rendered for the logical mark. This prevents a mark with few instances
per sample but thousands of samples from accidentally remaining vector.

Counting must reuse the SVG renderer's instance traversal and culling logic.
Renderers should expose a shared visible-instance iterator or visitor that can
either count instances or emit elements; a separate approximate estimator
would eventually drift from actual export behavior. Counting may traverse the
data once before rendering, but it must not construct SVG elements.

The comparison is deliberately simple:

```text
visibleInstanceCount > maxVectorInstances => raster
visibleInstanceCount <= maxVectorInstances => vector
```

There is no view selector, path override, per-mark callback, or automatic
default. Tests select rasterized content by choosing a threshold around known
fixture counts.

Unsupported SVG properties remain warnings and do not independently trigger
rasterization. This keeps fallback behavior separate from the density policy.

Rasterization should be reported as export metadata, not as an unsupported
property warning. A tentative result extension is:

```ts
interface SvgRasterizationInfo {
  targets: Array<{
    markType: string;
    instanceCount: number;
  }>;
  reason: "instance-threshold";
  maxVectorInstances: number;
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

Rejected as the primary batching rule. It loses more editability than necessary
and cannot combine adjacent selected layers cleanly when their nearest useful
boundary is a layered parent. Paint-order runs provide the same image-count
benefit without forcing all content in a subtree to be rasterized.

### Emit one image per selected mark

Rejected. It is straightforward, but needlessly repeats PNG, `<image>`, clip,
and group overhead for stacked rasterized layers. It is especially poor for
SampleView, where many samples and several adjacent dense marks should still
produce one image.

### Select individual views

Rejected. View paths are not reliable identifiers, and a selector or callback
API adds configuration and testing surface for a feature with little expected
use. A global visible-instance threshold addresses the practical file-size
problem without making specifications export-aware.

### Create a WebGL context during SVG export

Rejected. Context creation is not reliable in headless environments and the
marks' buffers, textures, and programs belong to the context used during normal
rendering. Without an existing compatible context, the exporter keeps the
content vector and reports that rasterization was unavailable.

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
- **Large embedded data URLs:** Crop readback, compress as PNG, and combine each
  maximal contiguous run, including all of its SampleView facets, into one
  image.
- **Changed draw order:** End a run at every intervening vector paint operation,
  replay raster targets in their original order, and insert the image at the
  run's first paint position.
- **Lost editor hierarchy:** Name the raster-run group, place it under the
  nearest common SVG parent, include every target in diagnostics, and omit only
  groups that would otherwise be empty.
- **Incorrect cross-clip batching:** Preserve the clip/scissor on each WebGL
  draw request. Apply a shared outer SVG clip only when every target has the
  same effective clip.
- **Mutable rendering options:** Snapshot clip and facet options when a capture
  is deferred rather than retaining objects that SampleView may reuse.
- **Optional WebGL becomes an accidental dependency:** Keep raster code behind
  its own dynamic import and test SVG export in an environment with no WebGL or
  canvas PNG encoder. Fall back to vector output with one warning when a
  threshold was supplied.

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

### 2. Add shared visible-instance counting

**Outcome:** Each supported SVG mark renderer can count the instances it would
emit without constructing SVG elements, using the same traversal and culling
logic as vector emission. SampleView counts are aggregated across facets.

**Affected areas:**

- SVG renderer helpers and mark renderers under
  `packages/core/src/svg/renderers/`.
- `packages/core/src/svg/svgViewRenderingContext.js` for SampleView aggregation.

**Verification:** For representative point, rect, text, rule, link, and arrow
marks, compare the reported count with the emitted primary instance count.
Cover viewport clipping, `cullByVisibleRange`, invalid values, and several
SampleView facets.

**Documentation/migration:** None; this is an internal counting contract.

**Tentative commit:** `refactor(core): share SVG instance culling with raster policy`

### 3. Add threshold-based contiguous-run raster capture

**Outcome:** When `maxVectorInstances` is supplied, the SVG subsystem replaces
marks above the threshold with WebGL-rendered `<image>` elements while
preserving vector siblings. Maximal compatible contiguous runs produce one
image. All SampleView facets of every mark in a run are included in that image
from the outset.

**Affected areas:**

- New `packages/core/src/svg/raster/` modules.
- `packages/core/src/svg/index.js`.
- `packages/core/src/svg/svgViewRenderingContext.js`.
- `packages/core/src/genomeSpyBase.js` for passing an optional `WebGLHelper`
  internally.
- `packages/app/src/sampleView/sampleView.js` only if an explicit capture scope
  is required.

**Verification:** Use a layered browser integration fixture containing two
adjacent over-threshold layers surrounded by under-threshold vector rules/text.
Assert that the two layers emit one image and preserve the rendering of the
ordinary WebGL output. Insert an under-threshold vector layer between the dense
layers and assert that two images are emitted. Add a SampleView case whose
aggregate count exceeds the threshold; assert that multiple adjacent dense
marks emit exactly one `<image>` with correct sample y positions and
per-request GridChild clipping. Confirm that equality with the threshold stays
vector and that omitting the option produces an all-vector export.
Run the same export without a WebGL context, assert complete vector output and
one rasterization-unavailable warning, and verify that the raster submodule was
not loaded.

**Documentation/migration:** Document the threshold as an opt-in SVG export
size control and state that it counts visible instances, not source rows or SVG
elements.

**Tentative commit:** `feat(core): rasterize dense SVG layer runs with WebGL`

### 4. Add pixel-ratio, limits, diagnostics, and cleanup

**Outcome:** Captures have configurable resolution, validate GPU limits, report
rasterization metadata, and release all framebuffer resources on success and
failure.

**Affected areas:**

- SVG export option/result types.
- Rasterizer lifecycle and error handling.
- Core API tests.

**Verification:** Test multiple separated runs, unioned capture bounds,
oversized requests, resource cleanup, custom logical export size, and pixel
ratios above one. Diagnostics must list every target in each run.

**Documentation/migration:** Document that raster resolution remains fixed when
the SVG is scaled for print.

**Tentative commit:** `feat(core): configure SVG raster layer resolution`

### 5. Add the App Save SVG dialog

**Outcome:** **Save SVG** opens a dialog where users can opt into dense-mark
rasterization, set `maxVectorInstances`, and choose the raster pixel ratio. The
dialog performs the export and download using the selected options.

**Affected areas:**

- A new dialog under `packages/app/src/components/dialogs/`.
- `packages/app/src/components/toolbar/toolbar.js`.
- Focused App component tests.

**Verification:** Test the default all-vector submission, enabled threshold and
pixel-ratio values, control enablement, file-picker and anchor-download paths,
cancel behavior, and surfaced export failures. Confirm that the toolbar has no
remaining SVG download implementation.

**Documentation/migration:** Keep the dialog copy concise and explain that only
dense mark layers become pixels while axes and labels stay vector.

**Tentative commit:** `feat(app): configure rasterization when saving SVG`

### 6. Evaluate smaller or multisampled framebuffers

**Outcome:** Decide from measurements whether translated cropped framebuffers,
MSAA resolve, or tiled rendering are justified.

**Affected areas:** Rasterizer internals only unless new quality options are
exposed.

**Verification:** Compare memory, export time, edge quality, and output size on
representative dense examples and high-DPI exports.

**Documentation/migration:** Record the chosen quality/performance defaults.

**Tentative commit:** `perf(core): optimize SVG raster capture framebuffers`

## Initial testing material

- A small layered point/rect/rule/text spec to verify adjacent-run merging and
  exact sibling ordering around intervening vector content.
- `examples/docs/examples/generic/upsetr-mutations.json` to keep axes, labels,
  and sparse matrix structure vector while a low test threshold rasterizes its
  denser mark layers.
- A dense point or rect fixture generated in a test rather than committed as a
  huge JSON file.
- `packages/app/src/sampleView/sampleView.js` examples for mark-batched facet
  capture.
- A transparent-shadow fixture placed over differently colored SVG backgrounds
  to expose premultiplied-alpha errors.

## Acceptance criteria

- A maximal contiguous run of over-threshold marks is rendered exclusively by
  WebGL and appears as one embedded PNG `<image>` under their nearest common
  SVG parent.
- Two over-threshold marks separated by painted vector content emit two images
  and preserve the intervening content's compositing order.
- Every rasterized SampleView run emits one image containing all sample facets
  of all adjacent over-threshold marks, even with thousands of samples.
- Rasterization decisions use the exact post-culling instance count, aggregate
  repeated SampleView facets, and rasterize only when the count is strictly
  greater than `maxVectorInstances`.
- Omitting `maxVectorInstances` produces no density-based rasterization.
- SVG export succeeds without a WebGL context and without loading raster-module
  dependencies. When `maxVectorInstances` is supplied in that environment, all
  marks remain vector and one actionable warning is returned.
- The App's **Save SVG** action opens a dialog that defaults to vector output
  and passes the enabled instance threshold and raster scale factor to Core.
- Vector siblings before and after the image preserve their draw order and
  remain editable.
- The hybrid rendering matches the ordinary WebGL rendering at the configured
  raster pixel ratio, including clipping and opacity.
- Transparent edges composite without dark halos in Chrome, Firefox, Safari,
  and at least one vector editor used for publication workflows.
- Custom logical export dimensions and raster pixel ratios work together.
- Rasterization is reported through structured export information.
- GPU resources are released after both successful and failed exports.
- Unsupported SVG properties continue to produce warnings rather than silently
  requesting rasterization.

## Unresolved questions

- Should rasterization diagnostics extend the result with a `rasterized` field
  or use a more general structured diagnostics collection?
- What raster pixel ratio should the App offer by default for publication use?
- When should tiled or multisampled rendering be introduced, based on measured
  GPU limits and visual quality?

# Viewport Clipping Fix Plan

## Rationale

Viewport clipping is currently represented as a single rectangle. That makes all
clipping effectively two-dimensional, even when only one direction should be
constrained. Scrollable viewports expose this limitation clearly: axes should be
clipped along the scroll direction, but ticks, labels, and domain lines often
need to extend in the perpendicular direction.

The current workaround in `GridView` creates a very large rectangle to emulate
one-direction clipping. This is hard to reason about and still causes visible
artifacts, including missing axis domain lines and hard-clipped tick labels in
scrollable viewports. GitHub issue #237 describes the same underlying need:
viewport clipping should be definable separately for the `x` and `y`
directions.

## Proposed Solution

Introduce an explicit directional clipping model for rendering options. Instead
of treating `clipRect` as "clip both axes", represent clipping as a rectangle
plus independent `clipX` and `clipY` semantics.

At a high level:

- Keep the existing rectangle-based behavior as the default for normal mark
  clipping.
- Add a structured clipping option that can express directional clipping without
  fake infinite rectangles.
- Update `Mark.setViewport()` so it derives the effective WebGL viewport and
  scissor rectangle from the requested clipping dimensions.
- Update `GridView` scrollable-axis rendering to request clipping only along the
  scroll direction.
- Preserve existing behavior for ordinary clipped marks, clipped child views,
  and non-scrollable axes.

The main code paths to inspect and likely modify are:

- `packages/core/src/marks/mark.js`
- `packages/core/src/view/gridView/gridView.js`
- `packages/core/src/view/renderingContext/bufferedViewRenderingContext.js`
- `packages/core/src/view/renderingContext/simpleViewRenderingContext.js`
- `packages/core/src/types/rendering.d.ts`
- `packages/core/src/view/layout/rectangle.js`
- focused tests under `packages/core/src/view/gridView/`

## Detailed Refactor Plan

### Phase 1: Add Explicit Clip Semantics Without Behavior Changes

Tentative commit: `feat(core): add directional clipping options`

Start by adding a small internal clipping representation while preserving the
current public rendering behavior. Existing `clipRect` callers should continue
to mean "clip both x and y".

Recommended shape:

- Add a `ClipOptions` interface in `packages/core/src/types/rendering.d.ts`
  that stores the rectangle plus independent direction flags.
- Keep `RenderingOptions.clipRect?: Rectangle` for compatibility.
- Add `RenderingOptions.clip?: ClipOptions` or a similarly named structured
  option for new callers.
- Add the same structured field to `BufferedRenderingRequest`, because
  `BufferedViewRenderingContext` snapshots clipping options before marks are
  drawn.
- Normalize clipping in one helper so old and new inputs cannot drift:
  `clipRect` becomes `{ rect: clipRect, clipX: true, clipY: true }`.

The conceptual clipping states should be explicit:

- `clipX: false, clipY: false`: no clipping
- `clipX: true, clipY: false`: clip x only
- `clipX: false, clipY: true`: clip y only
- `clipX: true, clipY: true`: clip both dimensions

This phase should not change rendered output. It creates a checkpoint where the
new model exists, but all existing visualizations still clip exactly as before.

### Phase 2: Make Rectangle Clipping Direction-Aware

Tentative commit: `feat(core): add directional rectangle intersections`

Add focused geometry helpers to `packages/core/src/view/layout/rectangle.js`.
The goal is to remove fake infinite rectangles from callers and make directional
intersection explicit.

Possible helpers:

- `intersectX(rectangle)` keeps this rectangle's `y` and `height`, but clips
  `x` and `width` to the other rectangle.
- `intersectY(rectangle)` keeps this rectangle's `x` and `width`, but clips
  `y` and `height` to the other rectangle.
- `intersect(rectangle)` remains the existing two-direction intersection.

Add tests in `packages/core/src/view/layout/rectangle.test.js` that cover
overlap, non-overlap, and identity-like cases for both helpers. These helpers
should be simple and deterministic; they should not know anything about axes,
scrollbars, WebGL, or marks.

### Phase 3: Simplify Mark Viewport Setup Around a Clip Mask

Tentative commit: `refactor(core): derive mark viewport from clip mask`

Update `Mark.setViewport()` in `packages/core/src/marks/mark.js` to accept the
normalized clip options rather than only a bare rectangle. This is also the
right place to simplify the method by making clipping state explicit before
computing WebGL state.

The current implementation has two operational paths: a full-canvas viewport
with scissor disabled, and a clipped viewport with scissor enabled. With
directional clipping, the semantic model should be the four `clipX`/`clipY`
states above. The full-canvas path is then only the `clipX === false &&
clipY === false` optimization, not a separate conceptual mode.

Suggested helper shape inside `mark.js`:

- Normalize the input into `{ rect, clipX, clipY }`.
- Derive `usesScopedViewport = clipX || clipY`.
- Derive `effectiveViewport`:
  - no clipping: no scoped viewport is needed
  - x-only: intersect x bounds, keep original y bounds
  - y-only: intersect y bounds, keep original x bounds
  - xy: intersect both bounds
- Derive `xClipOffset` only when `clipX` is true.
- Derive `yClipOffset` only when `clipY` is true.
- Keep GL viewport/scissor application separate from uniform computation.

Important details:

- `clip: true` on a mark should still clip to the mark's own `coords` in both
  directions when no inherited clip exists.
- Existing inherited `clipRect` should still behave as two-direction clipping.
- For x-only clipping, compute `clippedCoords` by intersecting only x bounds.
- For y-only clipping, compute `clippedCoords` by intersecting only y bounds.
- Keep the current pixel offset and rounding-error compensation behavior.
- Re-check `xClipOffset`, `yClipOffset`, and `uViewScale` carefully. These
  uniforms are derived from the effective clipped viewport, so directional
  clipping must not introduce shifts in the non-clipped direction.

The WebGL scissor call still receives a rectangle. Directional clipping changes
how that rectangle is derived; it does not require non-rectangular scissoring.

### Phase 4: Thread Clip Options Through Rendering Contexts

Tentative commit: `refactor(core): thread clip options through render contexts`

Update render contexts so buffering and immediate rendering share the same
normalized clipping semantics.

Required changes:

- `BufferedViewRenderingContext.renderMark()` should store the structured clip
  option on each request.
- `BufferedViewRenderingContext.#buildBatch()` should pass that structured clip
  option to `mark.setViewport()`.
- `SimpleViewRenderingContext.renderMark()` should do the same for immediate
  rendering.
- `CompositeViewRenderingContext`, `SvgViewRenderingContext`, and
  `DebuggingViewRenderingContext` likely do not need behavior changes, but they
  should continue accepting the wider `RenderingOptions` type.

This phase should also remain visually compatible when all callers still use
old `clipRect` semantics.

### Phase 5: Replace the GridView Scrollable-Axis Hack

Tentative commit: `fix(core): clip scrollable axes by direction`

After compatibility is covered, update scrollable-axis rendering in
`packages/core/src/view/gridView/gridView.js`.

The current code builds an approximate directional clip by intersecting with a
viewport rectangle whose non-clipped dimension is widened to
`-100000..100000`. Replace that with an explicit directional clip:

- For left/right axes in vertically scrollable content, clip along `y`.
- For top/bottom axes in horizontally scrollable content, clip along `x`.
- Preserve normal `clipRect` behavior from ancestors by composing it with the
  axis scroll-direction clip.
- Keep axes positioned using `translatedCoords`; only the clipping semantics
  should change.

This is the phase that should fix the visible scrollable viewport artifacts:
the domain line should remain visible, and ticks/labels should not be clipped
in the perpendicular direction.

### Phase 6: WebGPU Migration Note

Tentative commit: `docs(core): note WebGPU clipping migration context`

The `webgpu` branch and standalone `packages/webgpu-renderer` package do not
currently provide reusable directional clipping code. The lower-level renderer
still lists viewport/scissor management as future work. This Core refactor
should therefore define clipping semantics locally, while keeping the model
clean enough to map later to renderer-level viewport/scissor state.

## Risks

- WebGL scissor rectangles are still rectangular, so directional clipping must
  be translated carefully into a concrete rectangle before calling
  `gl.scissor(...)`.
- Mark viewport uniforms depend on the clipped rectangle. Changing how the
  effective rectangle is computed can shift rendering by a pixel or alter
  alignment for rules, rect strokes, and text.
- Axis rendering uses layered views whose marks have `clip: false`; inherited
  clipping must constrain only the intended direction without disabling
  necessary clipping for scrollable content.
- Buffered rendering groups requests by mark. Any new clipping representation
  must remain stable and comparable enough for the existing batching model.
- Picking and normal rendering should continue to use matching coordinate and
  clipping semantics.

## Tests

Add focused tests before changing behavior where possible.

Recommended coverage:

- A compatibility test verifies that old `clipRect` options normalize to
  two-direction clipping.
- `Rectangle.intersectX()` and `Rectangle.intersectY()` preserve the
  non-clipped dimension and clip only the requested dimension.
- `Mark.setViewport()` receives equivalent effective clipping for legacy
  two-direction clips before any `GridView` behavior is changed.
- A scrollable vertical viewport with a bottom axis keeps the axis domain line
  visible.
- A scrollable vertical viewport clips the axis along `y` but does not hard-clip
  bottom-axis ticks or labels along `x`/perpendicular overhang.
- A scrollable horizontal viewport exercises the symmetric case for left/right
  axes.
- Existing clipped marks still clip in both directions by default.
- Existing render-order behavior for clipped content, axes, view strokes, and
  scrollbars remains unchanged.

Useful commands:

```bash
npx vitest run packages/core/src/view/gridView/gridView.test.js
npx vitest run packages/core/src/view/layout/rectangle.test.js
npm --workspaces run test:tsc --if-present
```

If rendering snapshots are needed, prefer the existing layout and rendering test
helpers used by `packages/core/src/view/gridView/gridView.test.js` and related
layout snapshot tests.

Manual WebGL verification is a feasible complement to Vitest coverage:

- Start the dev server with `npm start`.
- Open `http://localhost:8080/?spec=examples/core/layout/grid/scrollable_viewport2.json`.
- Confirm the scrollable viewport shows the bottom axis domain line.
- Confirm tick labels are not hard-clipped in the perpendicular direction.
- Scroll the viewport and confirm content is still clipped along the scroll
  direction.
- Smoke-test an ordinary clipped-mark example to confirm default two-direction
  clipping still behaves as before.

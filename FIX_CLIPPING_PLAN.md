# Scrollable Viewport Directional Clipping Plan

## Goal

Migrate scrollable viewport clipping to use directional clipping consistently.
The target behavior is:

- vertical scrollable viewports clip scrollable content and axes along `y`
  only, unless a child mark explicitly requires both-direction clipping
- horizontal scrollable viewports clip scrollable content and axes along `x`
  only, unless a child mark explicitly requires both-direction clipping
- view strokes, backgrounds, axes, ticks, and labels are not unintentionally
  shortened in the perpendicular direction
- legacy `clipRect` behavior remains compatible for ordinary clipped marks and
  non-scrollable views

## Current State

Already implemented on this branch:

- `ClipOptions` with `{ rect, clipX, clipY }` in
  `packages/core/src/types/rendering.d.ts`
- `normalizeClipOptions(...)` in `packages/core/src/types/rendering.js`
- directional `Rectangle.intersectX(...)` and `Rectangle.intersectY(...)`
- `Mark.setViewport(...)` accepts directional clip options and derives WebGL
  scissor state through `createViewportScope(...)`
- `BufferedViewRenderingContext` and `SimpleViewRenderingContext` pass
  normalized clip options to marks
- `GridView` creates directional clips for scrollable child content and
  scrollable axes

Known remaining problem:

- `GridView` still computes `clippedChildCoords` from `clipRect` using
  `viewportCoords.intersect(options.clipRect)`, which clips both directions.
  Decorations such as view strokes then render using that already-shortened
  rectangle. In the scrollable viewport example, the upper scrollable region now
  loses the right and bottom view-stroke edges.

The branch therefore has mixed semantics: mark rendering understands
directional clipping, but some layout/decorations still treat `clipRect` as the
source of truth.

## Design Direction

`clipRect` should become a compatibility input, not the internal source of
truth for scrollable viewport clipping. Inside GridView, decisions should use
`ClipOptions` and explicitly derive the geometry needed for each purpose.

Use these meanings:

- `clip`: directional rendering/scissor contract
- `clip.rect`: the concrete rectangle used by lower-level renderers when a
  rectangle is still required
- directionally clipped coordinates: geometry used for backgrounds, strokes,
  child visible bounds, hit testing, and layout-facing bookkeeping
- `clipRect`: legacy compatibility field for old callers, eventually derived
  from `clip.rect` rather than independently computed

## Next Implementation Steps

### Step 1: Add Directional Coordinate Helper For GridView

Tentative commit: `refactor(core): derive grid child bounds from clip options`

Add a helper near the existing GridView clipping helpers:

- Input: `coords`, `clip`
- Output: a rectangle clipped according to `clip.clipX` and `clip.clipY`
- Behavior:
  - no clip: return `coords`
  - `clipX && clipY`: `coords.intersect(clip.rect)`
  - `clipX`: `coords.intersectX(clip.rect)`
  - `clipY`: `coords.intersectY(clip.rect)`

Use this helper instead of raw `viewportCoords.intersect(options.clipRect)` for
child visible bounds.

This is the main fix for the current regression: a vertically scrollable region
should not shorten the view-stroke rectangle along `x`.

### Step 2: Remove `clippedChildCoords` As A Rectangular Assumption

Tentative commit: `refactor(core): use directional child clip bounds`

Rename or split `clippedChildCoords` so its meaning is explicit. The current
name hides that it was historically clipped in both directions.

Suggested names:

- `visibleChildCoords`: directionally clipped viewport coordinates used for
  backgrounds and view strokes
- `childClip`: the directional `ClipOptions` passed to child rendering

Then update these uses in `packages/core/src/view/gridView/gridView.js`:

- background fill rendering
- child content rendering
- background/view stroke rendering
- any saved `renderItems` fields that carry child visible bounds

The stroke should render using directionally clipped visible bounds, but with
`clipRect` cleared when appropriate so the stroke itself is not scissored again.

### Step 3: Audit Axis Clip Composition

Tentative commit: `fix(core): compose scrollable axis clips directionally`

Review the independent-axis block in `GridView`.

The current axis code builds a directional `axisClip`, combines it with
`options.clip`, and then sets `clipRect = clip?.rect`. That may still be too
coarse when parent and axis clips constrain different dimensions.

Expected behavior:

- bottom/top axes in horizontally scrollable content get `clipX: true`
- left/right axes in vertically scrollable content get `clipY: true`
- perpendicular overhang for ticks, labels, and domain strokes remains visible
- inherited parent clipping is preserved only for the dimensions it actually
  clips

If a rectangular compatibility field must be passed, derive it from the combined
clip after the directional composition. Do not independently intersect the axis
coordinates with a rectangular `clipRect`.

### Step 4: Add Regression Tests For Decoration Geometry

Tentative commit: `test(core): cover directional scrollable decorations`

Add focused Vitest coverage before each behavior change where possible.

Recommended tests in `packages/core/src/view/gridView/gridView.test.js`:

- vertical scrollable viewport receives `clipX: false, clipY: true` for
  scrollable child content
- horizontal scrollable viewport receives `clipX: true, clipY: false`
- view stroke/background geometry for vertical scrolling preserves full
  horizontal width
- view stroke/background geometry for horizontal scrolling preserves full
  vertical height
- explicitly clipped child marks still produce both-direction clipping

The current failing visual case should be represented by a non-WebGL test that
patches the background stroke render method and inspects the coordinates passed
to it.

### Step 5: Manual WebGL Verification

Tentative commit: none unless documentation is updated.

Manual verification remains necessary because the bug is visual WebGL output.

Run:

```bash
npm start
```

Open:

```text
http://localhost:8080/?spec=examples/core/layout/grid/scrollable_viewport2.json
```

Check:

- upper scrollable region keeps right and bottom view-stroke edges visible
- bottom axis domain line is visible
- tick labels are not hard-clipped in the perpendicular direction
- content is still clipped along the scroll direction
- ordinary clipped-mark examples still clip in both directions

## Risks

- Keeping both `clipRect` and `clip` alive can reintroduce contradictory state.
  Prefer deriving rectangular compatibility fields from `clip`, not the other
  way around.
- View strokes and backgrounds use geometry, not only scissor state. Fixing
  mark clipping is insufficient if decoration coordinates are already clipped
  incorrectly.
- Combining parent and child directional clips is subtle when different
  dimensions come from different rectangles.
- Existing tests can pass while WebGL output is visibly wrong; add tests that
  inspect decoration coordinates and keep manual visual verification.

## Verification Commands

Use focused checks while iterating:

```bash
npx vitest run packages/core/src/view/gridView/gridView.test.js
npx vitest run packages/core/src/marks/mark.test.js
npx vitest run packages/core/src/view/renderingContext/simpleViewRenderingContext.test.js
npm --workspace @genome-spy/core run test:tsc
```

Before considering the branch complete:

```bash
npm test
```

## WebGPU Note

The `webgpu` branch and standalone `packages/webgpu-renderer` package do not
currently provide reusable directional clipping code. The lower-level renderer
still lists viewport/scissor management as future work. This Core migration
should define directional clipping semantics locally while keeping the model
clean enough to map later to renderer-level viewport/scissor state.

# Directional Clipping Plan

## Goal

Use directional clipping consistently across scrollable viewports and mark
self-clipping.

The target behavior is:

- vertical scrollable viewports clip scrollable content and axes along `y`
  only
- horizontal scrollable viewports clip scrollable content and axes along `x`
  only
- inherited container clipping still applies to axis chrome and marks that opt
  out of self-clipping
- mark self-clipping follows the zoomable scale direction by default
- explicit mark `clip` settings override the default
- legacy `clipRect` behavior remains compatible for callers that still provide
  only a rectangle

## Current State

Implemented on this branch:

- `ClipOptions` with `{ rect, clipX, clipY }` in
  `packages/core/src/types/rendering.d.ts`
- `normalizeClipOptions(...)` in `packages/core/src/types/rendering.js`
- directional `Rectangle.intersectX(...)` and `Rectangle.intersectY(...)`
- `Mark.setViewport(...)` accepts directional clip options and derives WebGL
  viewport/scissor state through `createViewportScope(...)`
- `Mark.setViewport(...)` separates inherited/container clipping from mark
  self-clipping
- `BufferedViewRenderingContext` and `SimpleViewRenderingContext` pass
  normalized clip options to marks
- `GridView` uses directional clip options for scrollable child content,
  scrollable axes, and child visible bounds
- scrollable viewport decorations use directionally clipped geometry, so view
  strokes are not shortened in the perpendicular direction

Manual verification for `examples/core/layout/grid/scrollable_viewport2.json`
has confirmed:

- axis domain lines are visible and clipped at the scrollable viewport edges
- the lightgray view stroke right edge inside the scrollable viewport is visible
- plot marks remain clipped along the scroll direction

## Design Direction

Keep these concepts separate:

- `clip`: inherited/container clipping and directional rendering contract
- self clipping: clipping caused by a mark's own `clip` property
- `clip.rect`: the concrete rectangle used by lower-level renderers
- directionally clipped coordinates: geometry used for backgrounds, strokes,
  child visible bounds, and layout-facing bookkeeping
- `clipRect`: legacy compatibility field, derived from `clip.rect` where a
  rectangular field is still needed

The important semantic distinction is:

- `clip: false` means no mark self-clipping, but inherited clipping still
  applies
- `clip: "never"` means no mark self-clipping and no inherited clipping
- directional values should control only mark self-clipping

## Remaining Implementation Steps

### Step 1: Extend Mark `clip` Spec Values

Tentative commit: `feat(core): add directional mark clip values`

Extend the mark spec type from:

```ts
boolean | "never"
```

to:

```ts
boolean | "x" | "y" | "never"
```

Semantics:

- `true`: self-clip in both `x` and `y`
- `false`: do not self-clip; still honor inherited clipping
- `"x"`: self-clip only horizontally
- `"y"`: self-clip only vertically
- `"never"`: ignore self clipping and inherited clipping

Update user-facing JSDoc in `packages/core/src/spec/mark.d.ts` with concise
wording. Mention that `"x"` and `"y"` refer to clipping direction in screen
space and that inherited clipping from parent containers still applies unless
`"never"` is used.

### Step 2: Derive Directional Default Clip From Zoomable Scales

Tentative commit: `fix(core): default mark clipping by zoom direction`

Change the default mark clip getter in `packages/core/src/marks/mark.js`.

Current behavior:

- any zoomable `x` or `y` scale returns `true`
- `true` self-clips in both directions

Target behavior:

- only `x` zoomable: default `clip` is `"x"`
- only `y` zoomable: default `clip` is `"y"`
- both zoomable: default `clip` is `true`
- neither zoomable: default `clip` is `false`

Explicit spec/config/style `clip` values must continue to take precedence over
the zoomability-derived default.

### Step 3: Map Mark Clip Values To Self-Clip Options

Tentative commit: `refactor(core): map mark clip to directional self clip`

Add a small helper near `createViewportScope(...)` in
`packages/core/src/marks/mark.js`:

- input: resolved mark clip value and mark coordinates
- output: directional self-clip options or no self clip

Mapping:

- `true` -> `{ rect: coords, clipX: true, clipY: true }`
- `"x"` -> `{ rect: coords, clipX: true, clipY: false }`
- `"y"` -> `{ rect: coords, clipX: false, clipY: true }`
- `false` -> no self clip
- `"never"` -> no inherited clip and no self clip

Then combine inherited clip options with self-clip options before calling
`createViewportScope(...)`.

Watch for the existing composition smell: when two clips constrain the same
direction, the result should use the intersection of the two ranges, not simply
replace the earlier range with the later one.

### Step 4: Tighten Clip Composition

Tentative commit: `fix(core): intersect same-direction clip composition`

Review and update `combineClipOptions(...)` in `GridView` or move a shared
version to `packages/core/src/types/rendering.js` if mark self-clip composition
also needs it.

Expected composition:

- if only one clip constrains a direction, keep that range
- if both clips constrain `x`, intersect their x ranges
- if both clips constrain `y`, intersect their y ranges
- keep unconstrained directions unconstrained

Add focused tests for nested/inherited clipping so parent clips cannot be
widened by child or axis clips.

### Step 5: Tests And Schema Artifacts

Tentative commit: `test(core): cover directional mark clip defaults`

Add or update tests for:

- default clip is `"x"` when only the x scale is zoomable
- default clip is `"y"` when only the y scale is zoomable
- default clip is `true` when both scales are zoomable
- explicit `clip: true`, `false`, `"x"`, `"y"`, and `"never"` override defaults
- `Mark.setViewport(...)` self-clips only in the requested direction
- inherited scrollable viewport clipping still applies when `clip` is `false`,
  `"x"`, or `"y"`

If schema or docs artifacts are checked in or required by CI, regenerate them
after changing `packages/core/src/spec/mark.d.ts`.

### Step 6: Manual WebGL Verification

Tentative commit: none unless documentation or example files are updated.

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
- axis domain lines are visible
- y-axis tick labels are clipped only by the scrollable viewport, not by
  internal child-view boundaries
- content is still clipped along the scroll direction
- ordinary explicitly clipped marks still clip in both directions

Also verify a zoomable x-only case for issue #237:

- marks touching the top or bottom plot edge are not clipped along `y`
- marks remain clipped along `x`

## Risks

- Keeping both `clipRect` and `clip` alive can reintroduce contradictory state.
  Prefer deriving rectangular compatibility fields from `clip`, not the other
  way around.
- Combining parent and child directional clips is subtle when different
  dimensions come from different rectangles.
- `clip: false` and `clip: "never"` must remain distinct. The former still
  honors inherited clipping; the latter does not.
- Existing tests can pass while WebGL output is visibly wrong; keep manual
  visual verification for scrollable viewports and edge strokes.

## Verification Commands

Use focused checks while iterating:

```bash
npx vitest run packages/core/src/marks/mark.test.js
npx vitest run packages/core/src/marks/markConfigPrecedence.test.js
npx vitest run packages/core/src/view/gridView/gridView.test.js
npx vitest run packages/core/src/types/rendering.test.js
npm --workspace @genome-spy/core run test:tsc
```

Before considering the branch complete:

```bash
npm test
```

## PR Note

The eventual PR should mention:

```text
Closes #237
```

## WebGPU Note

The `webgpu` branch and standalone `packages/webgpu-renderer` package do not
currently provide reusable directional clipping code. The lower-level renderer
still lists viewport/scissor management as future work. This Core migration
should define directional clipping semantics locally while keeping the model
clean enough to map later to renderer-level viewport/scissor state.

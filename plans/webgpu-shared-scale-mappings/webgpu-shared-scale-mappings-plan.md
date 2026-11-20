# Share whole scale mappings in WebGPU

## Completion

PR #754 implements the whole-scale handle, viewport-local ranges, and bounded
hardware viewports for cropped attachments. Chrome checks covered SampleView
scrolling, track navigation, unequal-width resize and rejoining, fixed-width
gaps, and labeled pileup raster output at device pixel ratios 1 and 2. Safari
26.5 passed the cropped opacity regression. Shared scales uploaded once per
changed navigation frame in both benchmark fixtures.

The existing explicit placement-clipping issue inside offset opacity groups is
documented in the shader and deferred. GenomeSpy's adapter leaves that option
unset. Further standalone placement and export variants are outside this PR's
acceptance checks. Shared band membership and grouping cuts remain mutable.

## Background

Keep the upload savings from the
[position-scale prototype](../webgpu-shared-position-poc/webgpu-shared-position-poc-plan.md)
with one scale source per channel. The Chrome audit found that SampleView labels
and metadata bars both spanned 608 px. Text used `[0, 608]` and bars used
`[10.5, 618.5]` because they included the canvas origin. Aligned tracks already
used matching ranges. The labeled pileup example has the same text and rectangle
coordinate mismatch as SampleView.

## Coordinate and scale ownership

- Core's `ScaleResolution` owns the semantic scale. The WebGPU adapter converts
  Core's unit positions to viewport-local logical pixels, preserving reversal,
  categorical viewport, and grouping gaps. The renderer receives ordinary scale
  configs.
- The scale maps data to its configured range. Cartesian marks interpret
  positional outputs as local logical pixels. `DrawCommand.viewport` places
  those coordinates on the canvas. The scissor controls optional clipping.
  Viewport size alone leaves a supplied scale range intact. Keeping the range in
  the scale's output values also leaves room for a future coordinate system to
  interpret the existing marks' x and y outputs as angle and radius.
- The renderer owns each shared scale's mapping, resources, and validation. A
  channel supplies either a local scale config or a shared handle. Keep
  within-band anchors and interval-edge choices on each channel. Follow the
  ordinary scale-range convention used by
  [D3 scales](https://d3js.org/d3-scale/linear).

```js
const scale = renderer.createSharedScale(
  indexScale({ domain: [100, 200], range: [0, 608] })
);
const x = { data: starts, scale };
const x2 = { data: ends, scale };
```

## Implementation and checks

1. **Use local coordinates consistently.** Unify the adapter's text and non-text
   range calculations in
   [`webGpuMarkAdapter.js`](../../packages/core/src/rendering/webgpu/webGpuMarkAdapter.js).
   Apply the canvas origin once through the existing draw viewport or placement
   path in
   [`webGpuViewRenderingContext.js`](../../packages/core/src/rendering/webgpu/webGpuViewRenderingContext.js).
   The current renderer uses the draw rectangle as its hardware viewport, so a
   pane-sized viewport can clip labels and ticks before the scissor runs. Start
   with the existing canvas-sized viewport and placement path for overflow. If
   needed, separate the logical draw origin from the hardware viewport inside
   the renderer.
   [WebGPU primitive clipping](https://www.w3.org/TR/webgpu/#primitive-clipping)

   Keep text fitting in local coordinates before applying the draw origin. Check
   the labeled pileup and a placed scene for alignment, picking, and raster
   export. Include an unclipped label or tick that crosses its pane boundary and
   a partially off-canvas placement. Widening a standalone draw's viewport at a
   nonzero origin should preserve its scale offsets. Tentative commit
   `refactor(webgpu): use viewport-local Cartesian ranges`.

2. **Replace the prototype's position-only handle.** Add
   `createSharedScale(config)` in the renderer and accept its handle directly in
   `channel.scale`. Resolve it through the existing channel normalization.
   Remove `createSharedPositionScale` and `scale.sharedPosition`. Reuse the
   existing scale definitions and binding path for the layouts the prototype
   already supports. For other layouts, creation returns `undefined` and the
   caller uses a local config.

   The handle owns the domain, range, band rank window, and grouping cuts.
   Shared consumers read mapping updates from the handle. Keep the current
   per-mark tables as derived caches where needed and refresh them when their
   inputs change. Retain the no-op upload guard for packed navigation updates.
   Document the API and lifetime in the
   [renderer types](../../packages/webgpu-renderer/src/index.d.ts).

   Reuse the adapter's one-handle-per-resolution lifecycle in
   [`webGpuSurface.js`](../../packages/core/src/rendering/webgpu/webGpuSurface.js).
   Share one effective mapping per resolution and use local configs for
   consumers with a different range. The adapter keeps the shared range stable
   while marks are bound to it. On layout changes, reconcile the bindings before
   retiring the old handle or submitting draws. A renderer-only test should
   exercise a handle used by two draws at different origins, an update visible
   in both, and an ordinary local scale. Tentative commit
   `refactor(webgpu): share complete scale mappings`.

## Acceptance

- The grouped 20-attribute SampleView shares one y mapping across labels and
  metadata during close-up scroll. Aligned tracks share one x mapping during
  zoom and pan. Each scene makes one shared-scale upload per frame when the
  packed mapping changes and zero otherwise. Count these uploads separately from
  other writes.
- Unequal-width views still fill their respective widths and preserve tick
  values, label placement, and fixed-pixel grouping gaps. Resize a pair of views
  from equal to unequal widths and back. Check that each uses its own effective
  range throughout and sharing resumes when they match.
- Review the diff and production SLOC by package before preparing the separate
  WebGPU PR. The implementation stays within the experimental WebGPU path.

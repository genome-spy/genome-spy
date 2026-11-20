# Share whole scale mappings in WebGPU

## Evidence

A shared Core scale has one domain and one range. The WebGPU adapter creates
local renderer scale configs from it and puts each draw's pixel projection into
their ranges. The channel config then borrows the shared bounds and grouping
gaps while keeping its own projected range.

A Chrome audit of the current branch found these ranges among channels drawing
with the same shared scale handle in the same frame.

| Scene                                               | First pixel range                          | Second pixel range                       |
| --------------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| Aligned 24-track fixture, shared x                  | `[10.5, 1190.5]` on 48 endpoints           |                                          |
| Grouped SampleView during close-up scroll, shared y | `[0, 608]` on the text row-label endpoints | `[10.5, 618.5]` on 60 metadata endpoints |
| Labeled pileup example, shared x                    | `[0, 1180.19]` on text                     | `[10.51, 1190.70]` on rectangles         |

The SampleView labels and metadata bars cover the same 608-pixel span with
different origins. Text uses viewport-local pixels. The metadata bars use the
canvas offset in their scale range. Axis ticks and placed plot marks also use
different origins. A single common pixel range would shift one consumer unless
its projection is applied elsewhere.

## Proposed ownership

Separate layout projection from scale mapping. The shared scale owns the domain,
the range in scale output units, and the scale-specific mapping data. For band
scales, category membership and the visible rank window have distinct meanings.
Draw geometry owns the conversion to local pixels and canvas placement. Endpoint
anchors and interval edge behavior remain channel properties.

Give every channel exactly one scale source. A channel's `scale` accepts a local
scale config or a renderer-owned handle returned by `createSharedScale(config)`.
Consuming channels point directly at the handle. Scale type, domain, range, and
mapping data come from that one source. The scale definition controls its GPU
representation. Use the same contract for future color scales and derived range
textures.

```js
const scale = renderer.createSharedScale(
  indexScale({ domain: [100, 200], range: [0, 1] })
);

const x = { data: starts, scale };
const x2 = { data: ends, scale };
```

Core continues to own the semantic scale through its `ScaleResolution`. Its
adapter publishes one current mapping to the renderer handle. The renderer owns
bindings, derived gap data, and disposal. Channel geometry owns endpoint anchors
and interval edge choices. Draw geometry owns the projection from scale output
to pixels, including the span used to fit pixel-sized gaps and text.

Start with `DrawCommand.viewport`, placements, and scissor. Text and rectangles
should consume the same scale range in the labeled pileup fixture. Scope bounds
and picking should apply the same projection. The renderer requires a viewport
to fit inside the canvas. A projected mark or placement can extend past the
canvas and be clipped there. Establish the coordinate convention and test that
case before deciding whether it needs an independent draw transform.

Deck.gl provides a precedent for keeping screen projection and viewport extents
together. Its design uses a separate projection interface for shaders and CPU
coordinates.
[deck.gl Viewport](https://deck.gl/docs/api-reference/core/viewport)

## Trade-off

Aligned tracks already have equal pixel ranges. Keying shared resources by pixel
range would split the SampleView row scale into two resources and require
keeping that grouping current across resize and export. Resolve the coordinate
convention first and use one shared mapping for both consumers.

## Implementation and verification

1. Normalize draw coordinates for a mixed text-and-rectangle scene. Use the
   labeled pileup example to check alignment, picking, scissoring, and raster
   export at DPR 1 and 2. Confirm correct viewport bounds for clipped and placed
   draws before removing either Core range translation. Tentative commit
   `refactor(webgpu): separate scale mapping from draw projection`.
2. Replace the experimental position-only handle and its attachment field with
   the single scale-source contract after both consumers use the same range.
   Verify grouped SampleView scrolling and regrouping, aligned track pan and
   zoom, and the pileup example. Keep one shared scale write per changed
   navigation frame and check that channel normalization resolves exactly one
   scale source. Verify that a shared channel has no local scale fields to
   override. Document the mapping and viewport units in the renderer types.
   Tentative commit `refactor(webgpu): share complete scale mappings`.

# Point Culling Plan

This follow-up PR investigates and implements anchor-based visibility culling
for marks that should not be pixel-clipped at scrollable viewport edges. The
initial motivation is axis tick labels in scrollable viewports: label glyphs
should render fully when their tick anchor is visible, but labels whose anchors
fall outside the visible scroll range should disappear.

## Rationale

Directional clipping fixed the main scrollable viewport issues, but axis text at
the scrollport edge can still be cut by the inherited clip rectangle. Expanding
the clip rectangle is fragile because text overhang depends on font metrics,
alignment, baseline, angle, and label content.

The cleaner model is to separate two concerns:

- Pixel clipping: scissor clipping of rendered pixels.
- Instance culling: deciding whether a mark instance should be rendered based on
  its anchor position after scale transformation.

For axis labels, pixel clipping should be disabled, while instance culling should
still use the inherited visible range.

## Proposed Axis-Label Solution

1. Mark generated axis label text as not pixel-clipped.
   - Axis label text marks can use `clip: "never"` so glyphs are not cut at the
     scrollport edge.

2. Add an internal, opt-in culling mode for text mark anchors.
   - Tentative property name: `cullByVisibleRange`.
   - Values: `"x"`, `"y"`, `true`, or `false`.
   - For axis labels:
     - top/bottom labels cull by `"x"`.
     - left/right labels cull by `"y"`.

3. Preserve inherited clipping separately from pixel clipping.
   - `clip: "never"` must disable scissor clipping.
   - The inherited clip still needs to be available as the visible range for
     culling.
   - This likely requires render requests to carry both a pixel clip and a
     visible clip, or a richer prepared clip object.

4. Compute visible unit ranges during viewport setup.
   - Convert inherited clip bounds into the mark's unit coordinate space.
   - Use the actual inherited clip rectangle intersected with the view coords.
   - Keep the calculation in the render/viewport setup path because scroll
     offsets are dynamic.

5. Cull text in the vertex shader.
   - The text vertex shader already computes the scaled text anchor.
   - If the anchor is outside the visible range for the selected direction, move
     the vertex outside the viewport and return.
   - If the anchor is inside, render the full glyph without pixel clipping.

## Generic Mark Feature

After the axis-label case works, evaluate making the mechanism generic for
point-like marks:

- Good candidates:
  - non-ranged text marks
  - point marks
  - other marks whose visibility is naturally determined by a single anchor

- Poor candidates:
  - rect marks
  - ranged text using `x2` or `y2`
  - rule marks
  - link marks
  - any mark whose visual extent is defined by secondary positional channels

The generic version should stay internal at first. Anchor-based culling changes
visual semantics and should not become a public mark feature until it has clear
use cases beyond axis labels.

## Risks

- The main architectural risk is confusing pixel clipping with visibility
  culling. The implementation must keep these concepts separate.
- `clip: "never"` currently means no inherited pixel clipping. It must not erase
  the inherited visible range needed for culling.
- Shader changes affect picking too. Culled labels should not participate in
  picking.
- Ranged text and point-like text must be distinguished carefully. Anchor culling
  is not appropriate when secondary positional channels define the visible
  extent.
- A generic feature may add unnecessary API surface. Keep it internal until it
  proves useful.

## Tests

- Add focused unit tests for render request preparation if a separate visible
  clip is introduced.
- Add shader snapshot updates for text mark changes.
- Add a grid/axis layout test that verifies generated axis labels receive the
  internal culling mode.
- Manually smoke-test:
  - `examples/core/layout/grid/scrollable_viewport2.json`
  - vertical scrolling: edge labels are fully rendered when their tick anchor is
    visible and disappear when scrolled out.
  - horizontal scrolling, if an example is available or added.

## Tentative Commits

1. `feat(core): add visible-range culling for axis labels`
2. `test(core): cover axis label visible-range culling`
3. Optional: `feat(core): generalize visible-range culling for point marks`


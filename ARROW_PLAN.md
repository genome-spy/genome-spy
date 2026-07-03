# Arrow Mark Plan

## Rationale

GenomeSpy needs a first-class `arrow` mark for interval-like genomic and
protein visualizations where direction is part of the visual semantics. The mark
should support directional genes, transcripts, alignments, protein domains, and
other ranged features without requiring authors to assemble arrows from multiple
primitive marks.

The arrow is an interval mark. Position, interval length, color, opacity,
stroke, and now direction can be data-driven through visual encodings. Shape
configuration remains mark-level state: head shape, head angles, head placement,
head width, stem width, start notch, minimum stem length, and repeated heads are
mark props backed by uniforms.

## Current Design

The implementation follows the `rect` mark pipeline. `x`, `x2`, `y`, and `y2`
define a rectangle-like local coordinate system. The vertex shader computes
arrow-space dimensions and per-arrow geometry constants. The fragment shader
uses signed distance fields to render the visible arrow as a union of stem and
head shapes, with standard GenomeSpy fill, stroke, opacity, antialiasing, and
picking behavior.

Arrow space uses `x` for arrow length and `y` for width perpendicular to the
arrow direction. In the canonical reverse direction, negative `x` points toward
the arrowhead. Orientation maps screen-space x/y into this arrow space.

## Public Surface

### Positional and Style Encodings

- `x`, `x2`, `y`, and `y2` define the interval.
- `fill`, `stroke`, `fillOpacity`, `strokeOpacity`, and `strokeWidth` follow
  existing mark conventions.
- `direction` should become an arrow-only visual encoding channel.

### Direction Encoding

`direction` should be promoted from a simple mark prop to a discrete scaled
visual encoding channel. The scale lets arbitrary source values map to the two
visual directions. For example, strand values can map `+` and `-`, numeric
values can map `1` and `-1`, and text values can map `forward` and `backward`.

Example:

```json
"encoding": {
  "direction": {
    "field": "strand",
    "type": "nominal",
    "scale": {
      "domain": ["+", "-"],
      "range": ["forward", "reverse"]
    }
  }
}
```

No legend should be created for `direction`. It is a visual control channel for
arrow geometry, not a guide-producing style channel.

`mark.direction` can remain as a constant shorthand and default. If
`encoding.direction` is present, the encoding should take precedence.

### Shape Props

- `orient`: `"horizontal"` or `"vertical"`, inferred from the encoding when not
  specified.
- `headShape`: `"triangle"` or `"open"`.
- `headAngle`: outer head angle in degrees, clamped to `[1, 90]`.
- `headNotchAngle`: triangle head notch angle in degrees, clamped to `[1, 90]`.
  Open heads use `headAngle` for the notch edge.
- `headWidth`: head width in pixels or as a proportion of mark thickness.
- `headWidthUnit`: `"px"` or `"proportion"`.
- `startNotch`: whether the arrow tail has a notch. The notch slope follows the
  head slope.
- `stemWidth`: stem width in pixels or as a proportion of mark thickness.
  Negative values hide the stem; their magnitude still controls open-head
  thickness.
- `stemWidthUnit`: `"px"` or `"proportion"`.
- `minStemLength`: minimum visible stem length in pixels. It adjusts effective
  slopes for short non-repeated arrows.
- `headPlacement`: `"inside"` or `"outside"`. Inside keeps the whole head in
  the encoded interval. Outside places the head beyond the encoded interval so
  that the head starts at the interval endpoint.
- `headRepeat`: whether heads are repeated along the arrow.
- `headSpacing`: requested repeated-head spacing. The effective spacing is at
  least the rendered head footprint, including stroke.

## Remaining Implementation Plan

### Step 1: Promote `direction` to an Encoding Channel

Files:

- Modify `packages/core/src/spec/channel.d.ts`.
- Modify `packages/core/src/spec/mark.d.ts`.
- Modify `packages/core/src/marks/arrow.js`.
- Modify `packages/core/src/marks/arrow.common.glsl`.
- Modify `packages/core/src/marks/arrow.vertex.glsl`.
- Modify `packages/core/src/marks/arrow.fragment.glsl`.

Work:

- Add `direction` to `ChannelWithScale` so it can use a discrete scale.
- Add a direction channel definition type that accepts nominal/ordinal fields,
  datum definitions, expression definitions, value definitions, and conditions.
- Do not include `LegendMixins` in the direction channel type.
- Make `direction` a discrete channel whose range values are `"forward"` and
  `"reverse"`.
- Ensure `direction` remains supported only by `ArrowMark` at first by listing
  it in `ArrowMark.getSupportedChannels()` and `ArrowMark.getAttributes()`.
- Remove `uDirection` as a mark uniform.
- Read `getScaled_direction()` in the vertex shader and pass the value to the
  fragment shader as a flat varying.
- Keep `mark.direction` as a constant shorthand through the existing
  mark-prop-to-encoding path.

Verification:

- Add focused tests for:
  - mark prop fallback to constant direction
  - explicit `encoding.direction` overriding the mark prop
  - arbitrary domain values mapping through a scale to forward/reverse
  - no legend being produced for `direction`
- Run `npx vitest run packages/core/src/marks/arrow.test.js`.
- Run the narrow schema test that covers generated channel types.

Tentative commit: `feat(core): encode arrow direction`

### Step 2: Update Examples

Files:

- Keep `examples/core/marks/arrow/arrow_playground.json` focused on
  mark-prop controls.
- Add a simple direction-encoding example under `examples/core/marks/arrow/` or
  `examples/docs/grammar/mark/arrow/`.

Work:

- Do not use `encoding.direction` in the arrow playground. The playground should
  remain a shape-parameter playground.
- Add another small example with two arrows.
- Use a `direction` field to drive both the y band scale and
  `encoding.direction`.
- Use a discrete direction scale with arbitrary domain values such as `+` and
  `-`, mapping to `"forward"` and `"reverse"`.
- Keep shape parameters bound through mark props.
- Keep the example small and self-contained.

Verification:

- Parse the changed JSON examples.
- Run `npx vitest run packages/core/examples.schema.test.js` when schema output
  is current.

Tentative commit: `test(core): exercise encoded arrow direction`

### Step 3: Update User-Facing Docs

Files:

- Modify `packages/core/src/spec/channel.d.ts`.
- Modify `packages/core/src/spec/mark.d.ts`.
- Modify `docs/grammar/mark/arrow.md` if more prose is needed beyond schema
  docs.
- Regenerate schema/docs artifacts when ready.

Work:

- Document `encoding.direction` as the preferred data-driven way to set arrow
  direction.
- Document `mark.direction` as constant shorthand/default behavior.
- State that `direction` uses a discrete scale but does not create a legend.
- Explain that scale range values are `"forward"` and `"reverse"`.

Verification:

- Run schema/docs generation once the code and docs are stable.
- Inspect generated schema descriptions for stale props or removed names.

Tentative commit: `docs(core): document arrow direction encoding`

### Step 4: Final Focused Verification

Run focused checks before broader workspace checks:

- `npx vitest run packages/core/src/marks/arrow.test.js`
- `npx vitest run packages/core/src/marks/shaderSnapshot.test.js`
- `npx vitest run packages/core/examples.schema.test.js`
- `npx vitest run packages/core/examples.test.js`

Then run broader checks before opening a PR:

- `npm --workspaces run test:tsc --if-present`
- `npm run lint`
- `npm test`

If generated schema or docs artifacts changed, also run:

- `npm run build`
- `npm run build:docs`

Tentative commit: `test(core): update arrow direction snapshots`

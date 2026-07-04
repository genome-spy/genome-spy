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
size, head proportions, start notch, minimum stem length, and repeated heads are
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
- `size` can be used as a visual encoding channel for data-driven arrow stem
  thickness. Encoded size values resolve to pixels.
- `direction` is an arrow-only visual encoding channel.

### Direction Encoding

`direction` is a discrete scaled visual encoding channel. The scale lets
arbitrary source values map to the two visual directions. For example, strand
values can map `+` and `-`, numeric values can map `1` and `-1`, and text values
can map `forward` and `backward`.

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

`mark.direction` is the constant shorthand and default. If `encoding.direction`
is present, the encoding takes precedence.

### Shape Props

- `orient`: `"horizontal"` or `"vertical"`, inferred from the encoding when not
  specified.
- `headShape`: `"triangle"` or `"open"`. Open-head thickness is based on
  resolved `size`, even when `stem` is `false`.
- `headAngle`: outer head angle in degrees, clamped to `[1, 90]`.
- `headNotchAngle`: triangle head notch angle in degrees, clamped to `[1, 90]`.
  Open heads use `headAngle` for the notch edge.
- `size`: arrow stem thickness. Numeric mark-prop values are pixels. Arrow mark
  also accepts a mark-prop-only relative form: `{ "band": number, "channel"?:
  "x" | "y" | "auto" }`. The default should be `{ "band": 0.45 }`.
- `minSize`: minimum resolved arrow stem thickness in pixels. The default should
  be `1` so band-relative arrows remain visible in dense views.
- `stem`: whether the stem is drawn. `false` hides the stem while still using
  the resolved `size` for open-head thickness. The default should be `true`.
- `headWidth`: multiplier of resolved `size`. For example, `2` makes the head
  twice as wide as the stem. This replaces the old pixel/proportion unit model.
  The resolved head width should be clamped to the available perpendicular lane
  unless a later use case proves that protruding outside the lane is needed.
- `startNotch`: whether the arrow tail has a notch. The notch slope follows the
  head slope.
- `minStemLength`: minimum visible stem length in pixels. It adjusts effective
  slopes for short non-repeated arrows. It is ignored when `stem` is `false`.
- `headPlacement`: `"inside"` or `"outside"`. Inside keeps the whole head in
  the encoded interval. Outside places the head beyond the encoded interval so
  that the head starts at the interval endpoint.
- `headSpacing`: `null` disables repeated heads and is the default. A numeric
  value enables repeated heads and gives the requested spacing as a multiplier
  of resolved `size`. The effective spacing is at least the rendered head
  footprint, including stroke.

### Removed or Redefined Props

- Remove `stemWidth`; use `size`.
- Remove `stemWidthUnit`; numeric `size` is pixels and relative size uses
  `{ "band": number }`.
- Remove `headWidthUnit`; `headWidth` is a multiplier of resolved `size`.
- Remove `headRepeat`; `headSpacing: null` disables repeated heads and numeric
  `headSpacing` enables them.
- Remove negative-width stem hiding; use `stem: false`.
- Remove arrow `units` enum plumbing in JS and the `UNIT_PX` /
  `UNIT_PROPORTION` constants in GLSL once unit props are gone.

### Band-Relative Size Resolution

`size: { "band": 0.8 }` is an arrow mark property form, not a general visual
encoding channel definition. It should be accepted in mark props, config, and
styles. It should not be accepted in `encoding.size`, where ordinary
field/datum/value/expression channel semantics continue to apply and produce
per-datum pixel sizes.

The relative form resolves against a reference span:

- If `channel` is `"x"` or `"y"`, use that channel.
- If `channel` is omitted or `"auto"`, infer the perpendicular channel from
  `orient`: horizontal arrows use `y`, vertical arrows use `x`.
- If `orient` is expression-based, `channel` must be explicit because automatic
  channel inference cannot be done once per mark instance in the current uniform
  model.
- If the reference channel has a band-like scale with `bandwidth()`, use that
  bandwidth.
- If no usable band-like scale exists on the reference channel, use the view
  size along that channel. Thus, a horizontal arrow with no `y` scale can still
  use `size: { "band": 0.8 }` to occupy 80% of the view height.

This makes `band` mean "fraction of the available perpendicular lane" for the
arrow mark. The lane is usually a scale bandwidth but falls back to the view
span when no perpendicular band scale exists.

The resolved band-relative mark size should be clamped by `minSize` after the
band or view span has been multiplied by `band`. Numeric mark sizes and encoded
sizes should also be clamped by `minSize` unless a later use case needs an
explicit way to allow zero-width arrows.

If `encoding.size` is present, it overrides `mark.size` for the per-datum stem
thickness. `mark.size` remains the default/fallback used when `encoding.size` is
absent. `encoding.size` does not accept the `{ "band": ... }` form in this
step.

Band-relative size depends on scale range and view size. The resolved uniform
value must be updated when the reference scale range changes and when the view
is resized.

Data-driven band-relative ranges, such as
`"scale": { "range": [0, { "expr": "bandwidth('y')" }] }`, are useful but
should be handled later through a general expression/scale-range design. The
initial arrow work should not depend on that broader feature.

## Remaining Implementation Plan

### Step 1: Update Public Contract and Defaults

Files:

- Modify `packages/core/src/spec/mark.d.ts`.
- Modify `packages/core/src/spec/channel.d.ts`.
- Modify `packages/core/src/config/defaults/markDefaults.js`.
- Modify `packages/core/src/config/markConfig.test.js`.

Work:

- Add an arrow-only relative size type, e.g. `{ "band": number, "channel"?:
  "x" | "y" | "auto" }`.
- Replace public `stemWidth` and `stemWidthUnit` with arrow `size`.
- Remove public `headWidthUnit`; make `headWidth` a multiplier of resolved
  `size`.
- Add `minSize`, default `1`.
- Add `stem`, default `true`.
- Remove public `headRepeat`.
- Make `headSpacing` nullable. `null` disables repeated heads; numeric values
  enable repeated heads and give spacing as a multiplier of resolved `size`.
- Set arrow default `size` to `{ "band": 0.45 }`.
- Set arrow default `headSpacing` to `null`.
- Update built-in styles to use `size`, `minSize`, and `stem` instead of
  `stemWidth`, `stemWidthUnit`, `headWidthUnit`, `headRepeat`, or negative
  widths.
- Add/update config tests that assert the new defaults and styles.

Verification:

- Run `npx vitest run packages/core/src/config/markConfig.test.js`.
- Search the edited defaults and specs for stale public `stemWidth`,
  `stemWidthUnit`, `headWidthUnit`, and `headRepeat` references.

Tentative commit: `feat(core): define arrow size parameters`

### Step 2: Support Encoded Pixel Size

Files:

- Modify `packages/core/src/marks/arrow.js`.
- Modify `packages/core/src/marks/arrow.common.glsl`.
- Modify `packages/core/src/marks/arrow.vertex.glsl`.
- Modify `packages/core/src/marks/arrow.fragment.glsl` if varying names or SDF
  inputs need to change.
- Modify `packages/core/src/marks/arrow.test.js`.
- Update `packages/core/src/marks/__snapshots__/shaderSnapshot.test.js.snap`.

Work:

- Add `size` to `ArrowMark.getSupportedChannels()` and
  `ArrowMark.getAttributes()`.
- Keep `encoding.size` as an ordinary numeric channel whose resolved value is
  pixels.
- Make `encoding.size` override mark-level `size`.
- Clamp encoded and numeric mark-level sizes by `minSize`.
- Replace shader `uStemWidth`, `uStemWidthUnit`, `uHeadWidthUnit`, and related
  naming with resolved-size uniforms/varyings.
- Remove arrow unit enum handling and GLSL `UNIT_PX` / `UNIT_PROPORTION`
  constants.
- Remove `uHeadRepeat`; derive repeat behavior from nullable `headSpacing`.
- Make `headWidth` and non-null `headSpacing` multiply resolved size.
- Clamp resolved head width to the available perpendicular lane.
- Implement `stem: false` by hiding the stem while still using resolved size for
  open-head thickness and head geometry.
- Ignore `minStemLength` when `stem` is `false`.

Verification:

- Add focused tests for numeric `size`, encoded `size`, `encoding.size`
  overriding mark-level `size`, `minSize` clamping, `stem: false`,
  `minStemLength` being ignored when `stem` is false, and nullable
  `headSpacing` controlling repeated heads.
- Run `npx vitest run packages/core/src/marks/arrow.test.js`.
- Run `npx vitest run packages/core/src/marks/shaderSnapshot.test.js`.

Tentative commit: `feat(core): encode arrow size`

### Step 3: Support Band-Relative Mark Size

Files:

- Modify `packages/core/src/marks/arrow.js`.
- Modify `packages/core/src/marks/arrow.vertex.glsl` if the resolved band size
  is passed as a uniform.
- Modify `packages/core/src/marks/arrow.test.js`.

Work:

- Resolve `size: { "band": n }` from the inferred perpendicular channel:
  horizontal arrows use `y`, vertical arrows use `x`.
- Resolve `size: { "band": n, "channel": "x" | "y" }` from the explicit
  channel.
- Use the channel bandwidth when the reference channel has a band-like scale.
- Fall back to the view span along the reference channel when no usable band
  scale exists.
- Require explicit `size.channel` when `orient` is expression-based.
- Clamp the resolved band/view-span size by `minSize`.
- Update the resolved uniform when the reference scale range changes and when
  the view is resized.
- Keep `{ "band": ... }` invalid for `encoding.size`; data-driven
  band-relative size ranges remain deferred to the later general
  `bandwidth()` expression/range work.

Verification:

- Add focused tests for band-scale resolution, view-span fallback, explicit
  channel override, expression-based `orient` requiring `size.channel`, and
  range/resize updates.
- Run `npx vitest run packages/core/src/marks/arrow.test.js`.

Tentative commit: `feat(core): support band-relative arrow size`

### Step 4: Update Examples and Snapshots

Files:

- Modify `examples/core/marks/arrow/arrow_playground.json`.
- Modify `examples/core/marks/arrow/arrow_styles.json`.
- Add or modify a small example under `examples/core/marks/arrow/` if the
  existing examples cannot show view-span fallback clearly.
- Update `packages/core/__snapshots__/examples.test.js.snap`.

Work:

- Keep the arrow playground focused on shape parameters.
- Add controls for numeric `size`, encoded `size`, `stem`, `minSize`,
  `headWidth`, and nullable `headSpacing`.
- Add a simple example/view that demonstrates `size: { "band": 0.8 }`
  resolving against the view span when no perpendicular band scale exists.
- Keep `encoding.direction` examples separate from the playground.
- Update built-in style examples so each style uses one practical size mode.

Verification:

- Run `npx vitest run packages/core/examples.schema.test.js`.
- Run `npx vitest run packages/core/examples.test.js -u` if snapshots need to
  be updated.

Tentative commit: `test(core): update arrow size examples`

### Step 5: Update User-Facing Docs and Schema Artifacts

Files:

- Modify `packages/core/src/spec/mark.d.ts`.
- Modify `docs/grammar/mark/arrow.md` if schema docs need supporting prose.
- Regenerate schema/docs artifacts when ready.

Work:

- Document arrow `size` as pixels or as `{ "band": number }`.
- Document that `{ "band": number }` resolves against the perpendicular band
  bandwidth or, when no band scale exists, the perpendicular view span.
- Document that `encoding.size` is supported for data-driven pixel thickness and
  overrides mark-level `size`, but does not accept `{ "band": ... }`.
- Document `minSize` and `stem`.
- Document that `minStemLength` is ignored when `stem` is `false`.
- Document `headWidth` as a multiplier of resolved `size`, clamped to the
  available perpendicular lane.
- Document nullable `headSpacing`: `null` disables repeated heads and numeric
  values enable repeated heads with spacing as a multiplier of resolved `size`.
- Regenerate schema/docs artifacts if the repository requires generated output
  for spec changes.

Verification:

- Run the schema/docs generation commands that are normally required for changed
  spec types.
- Inspect generated schema descriptions for stale public `stemWidth`,
  `stemWidthUnit`, `headWidthUnit`, and `headRepeat` references.

Tentative commit: `docs(core): document arrow size parameters`

### Step 6: Final Focused Verification

Run focused checks before broader workspace checks:

- `npx vitest run packages/core/src/config/markConfig.test.js`
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

Tentative commit: `test(core): verify arrow size parameterization`

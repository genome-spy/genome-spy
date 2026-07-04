# Arrow Mark Plan

## Rationale

GenomeSpy needs a first-class `arrow` mark for directional genomic, protein,
and general segment visualizations. The mark should support genes, transcripts,
read alignments, protein domains, and arbitrary directed relationships without
requiring authors to assemble arrows from multiple primitive marks.

The arrow should behave like a directional `rule`: endpoints define the
centerline, while arrow-specific mark props control the rendered head, stem,
notches, size, and repeated heads. Position, color, opacity, stroke, size, and
direction can be data-driven through visual encodings. Shape configuration
remains mark-level state backed by uniforms where possible.

## Target Design

### Rule-Style Geometry

The arrow mark should follow the `rule` mark endpoint model instead of the
`rect` mark interval model:

- `x`, `y`, `x2`, and `y2` define a directed centerline segment.
- Horizontal, vertical, and diagonal arrows use the same geometry path.
- The vertex shader computes the segment tangent, normal, and arrow-local
  coordinates.
- The fragment shader renders the arrow in arrow-local space as signed distance
  fields for the stem and head, using the existing fill, stroke, opacity,
  antialiasing, and picking behavior.
- There is no public `orient` prop. Any orientation needed by implementation is
  derived from the effective endpoints.

Arrow-local space should keep one explicit convention: negative local `x` points
in the reverse direction, toward the reverse arrowhead. Public direction values
then choose which endpoint is treated as the head endpoint.

### Endpoint Completion

Arrow should adapt the existing `rule` endpoint completion behavior. The exact
implementation should share or mirror the rule helper instead of inventing a
second interpretation.

Expected cases:

- `x` and `x2` only: horizontal arrow centered in the view or lane.
- `y` and `y2` only: vertical arrow centered in the view or lane.
- `x` only: full-height vertical arrow at `x`.
- `y` only: full-width horizontal arrow at `y`.
- `x`, `y`, `x2`, and `y2`: arbitrary segment, including diagonal arrows.
- `x`, `y`, and `x2`: horizontal segment with `y2 = y`.
- `x`, `y`, and `y2`: vertical segment with `x2 = x`.

Tests should document any inherited rule behavior that is less obvious, such as
zero-baseline completion.

### Direction Encoding

`direction` is an arrow-only visual encoding channel. It uses a discrete scale
so arbitrary source values can map to the two visual directions. For example,
strand values can map `+` and `-`, numeric values can map `1` and `-1`, and text
values can map `forward` and `backward`.

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

No legend should be created for `direction`. It is a geometry control channel,
not a guide-producing style channel.

`mark.direction` is the constant shorthand and default. If
`encoding.direction` is present, the encoding takes precedence.

With the rule-style endpoint model:

- `"forward"` places the primary arrowhead at the secondary endpoint
  (`x2`, `y2`).
- `"reverse"` places the primary arrowhead at the primary endpoint (`x`, `y`).
- Endpoints should not be sorted automatically. Authors who want genomic
  interval semantics should provide normalized start and end positions, then use
  `direction` to choose the head endpoint.

### Size Model

`size` is the arrow thickness control.

- Numeric mark-prop `size` values are pixels.
- `encoding.size` is supported and resolves to per-datum pixel values.
- `encoding.size` overrides mark-level `size`.
- The default arrow style should use a pixel size, so diagonal arrows work by
  default. The planned default is `size: 12`.
- `minSize` clamps the resolved size after mark-prop or encoded size resolution.
- `stem: false` hides the stem while still using resolved `size` for head
  geometry, especially open heads.
- `headWidth` is a multiplier of resolved `size`.
- `headSpacing: null` disables repeated heads. Numeric `headSpacing` enables
  repeated heads and is interpreted as a multiplier of resolved `size`.

`stemWidth`, `stemWidthUnit`, `headWidthUnit`, and `headRepeat` are removed.
Negative stem widths are not a public hiding mechanism; use `stem: false`.

### Band-Relative Size

The mark-prop-only form `size: { "band": number, "channel"?: "x" | "y" |
"auto" }` remains useful for lane-filling arrows, but only for axis-aligned
arrows.

Band sizing resolves against a reference span:

- If `channel` is `"x"` or `"y"`, use that channel.
- If `channel` is omitted or `"auto"`, infer the perpendicular channel from the
  effective axis-aligned arrow direction.
- If the reference channel has a band-like scale with `bandwidth()`, use that
  bandwidth.
- If no usable band-like scale exists on the reference channel, use the view
  size along that channel.

Band sizing should be rejected with a clear error for diagonal-capable arrows.
In practice, a spec is diagonal-capable when both screen axes can vary between
the primary and secondary endpoints after endpoint completion. An explicit
`size.channel` does not make band sizing valid for diagonal arrows.

`encoding.size` does not accept the `{ "band": ... }` form. Data-driven
band-relative sizes, such as scale ranges based on `bandwidth()`, should be
handled later through a general scale-range expression design.

### Built-In Styles

Built-in arrow styles should use the same public parameterization as user specs:

- The default arrow is pixel-sized and supports diagonal arrows.
- `arrow-transcript` is pixel-sized. It uses thin stroked repeated heads for
  gene-annotation-like transcript arrows.
- `arrow-block` uses `size: { "band": 1 }` for full-lane thick blocks.
- `arrow-block-notch` also uses `size: { "band": 1 }` and enables
  `startNotch`.

No built-in style should depend on hidden negative widths or removed repeat
flags.

## Remaining Implementation Plan

### Step 1: Rule-Style Encoding Contract

Files:

- Modify `packages/core/src/marks/arrow.js`.
- Modify `packages/core/src/marks/arrow.test.js`.
- Modify `packages/core/src/spec/mark.d.ts`.
- Modify `docs/grammar/mark/arrow.md` if supporting prose is needed.

Work:

- Remove the public `orient` prop from arrow mark docs, typings, defaults, and
  uniform registration.
- Adapt arrow positional encoding completion to match `rule`.
- Prefer extracting or sharing a small rule endpoint-completion helper if the
  existing rule code makes that practical.
- Preserve the arrow-only `direction` channel and document the endpoint-based
  meaning of `forward` and `reverse`.
- Add tests for the rule-style partial encoding cases and for diagonal arrows.

Verification:

- Run `npx vitest run packages/core/src/marks/arrow.test.js`.
- Search for stale public arrow `orient` references.

Tentative commit: `refactor(core): use rule-style arrow endpoints`

### Step 2: Rule-Aligned Vertex Geometry

Files:

- Modify `packages/core/src/marks/arrow.js`.
- Modify `packages/core/src/marks/arrow.vertex.glsl`.
- Modify `packages/core/src/marks/arrow.common.glsl`.
- Modify `packages/core/src/marks/arrow.fragment.glsl` only where varying names
  or local-space assumptions need to change.
- Update `packages/core/src/marks/__snapshots__/shaderSnapshot.test.js.snap`.

Work:

- Switch the arrow vertex path from rect-like geometry to rule-like strip
  geometry.
- Compute segment tangent and normal from the effective endpoints.
- Pass arrow-local coordinates to the fragment shader along the tangent and
  normal axes.
- Keep the fragment shader's SDF model focused on local arrow geometry rather
  than screen-axis orientation.
- Preserve `headPlacement`, including outside placement, by expanding the
  generated strip along the segment tangent in the vertex shader.
- Handle degenerate zero-length arrows explicitly.

Verification:

- Run `npx vitest run packages/core/src/marks/arrow.test.js`.
- Run `npx vitest run packages/core/src/marks/shaderSnapshot.test.js`.

Tentative commit: `refactor(core): render arrows as rule-aligned strips`

### Step 3: Direction and Head Semantics

Files:

- Modify `packages/core/src/marks/arrow.vertex.glsl`.
- Modify `packages/core/src/marks/arrow.fragment.glsl`.
- Modify `packages/core/src/marks/arrow.test.js`.
- Add or update a small direction example under `examples/core/marks/arrow/`.

Work:

- Make all head placement logic use the selected head endpoint instead of an
  implied horizontal or sorted interval.
- Ensure `"forward"` and `"reverse"` flip the arrow-local coordinate system
  consistently for horizontal, vertical, and diagonal arrows.
- Keep repeated heads anchored from the selected head endpoint.
- Keep `startNotch`, `minStemLength`, `stem`, and open/triangle head geometry
  consistent after direction flips.
- Add a simple example with two arrows where a `direction` field drives both the
  y band scale and the direction channel.

Verification:

- Run `npx vitest run packages/core/src/marks/arrow.test.js`.
- Run `npx vitest run packages/core/examples.schema.test.js`.

Tentative commit: `feat(core): support endpoint-based arrow direction`

### Step 4: Pixel and Band Size Rules

Files:

- Modify `packages/core/src/config/defaults/markDefaults.js`.
- Modify `packages/core/src/marks/arrow.js`.
- Modify `packages/core/src/marks/arrow.test.js`.
- Modify `packages/core/src/config/markConfig.test.js`.
- Modify `packages/core/src/spec/mark.d.ts`.

Work:

- Set the default arrow size to a pixel value, planned as `12`.
- Keep encoded `size` as per-datum pixels and valid for diagonal arrows.
- Keep `minSize`, `stem`, `headWidth`, and `headSpacing` semantics from the
  current parameterization.
- Reject `size: { "band": ... }` for diagonal-capable arrows with a clear
  error.
- Allow band sizing for axis-aligned arrows and resolve it against the
  perpendicular scale bandwidth or view span.
- Update built-in styles so `arrow-transcript` is pixel-sized, while
  `arrow-block` and `arrow-block-notch` use `size: { "band": 1 }`.

Verification:

- Run `npx vitest run packages/core/src/config/markConfig.test.js`.
- Run `npx vitest run packages/core/src/marks/arrow.test.js`.

Tentative commit: `feat(core): constrain arrow band sizing to axis-aligned arrows`

### Step 5: Examples and Snapshots

Files:

- Modify `examples/core/marks/arrow/arrow_playground.json`.
- Modify `examples/core/marks/arrow/arrow_styles.json`.
- Add or update diagonal and direction examples under
  `examples/core/marks/arrow/`.
- Update `packages/core/__snapshots__/examples.test.js.snap`.

Work:

- Remove `orient` from examples.
- Keep the playground focused on shape and size controls without using
  `encoding.direction`.
- Add a compact diagonal arrow example using numeric or encoded pixel size.
- Add the separate direction example described in Step 3.
- Keep style examples aligned with the built-in styles and their size modes.

Verification:

- Run `npx vitest run packages/core/examples.schema.test.js`.
- Run `npx vitest run packages/core/examples.test.js -u` if snapshots need to
  be updated.

Tentative commit: `test(core): update rule-style arrow examples`

### Step 6: Documentation and Schema Cleanup

Files:

- Modify `packages/core/src/spec/mark.d.ts`.
- Modify `packages/core/src/spec/channel.d.ts` if direction or size channel docs
  need updates.
- Modify `docs/grammar/mark/arrow.md`.
- Regenerate schema/docs artifacts if required.

Work:

- Document arrow as a rule-style directed segment mark.
- Document endpoint completion, diagonal support, and direction semantics.
- Document that band-relative `size` is mark-prop-only and axis-aligned-only.
- Document that default arrow sizing is pixel-based.
- Document the built-in style intent and which styles use band sizing.
- Remove stale docs for `orient`, `stemWidth`, `stemWidthUnit`,
  `headWidthUnit`, and `headRepeat`.

Verification:

- Run `npm -w @genome-spy/core run build:schema`.
- Run `npm --workspaces run test:tsc --if-present`.
- Inspect generated schema descriptions for stale removed props.

Tentative commit: `docs(core): document rule-style arrow mark`

### Step 7: Final Focused Verification

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

If generated docs artifacts changed, also run:

- `npm run build`
- `npm run build:docs`

Tentative commit: `test(core): verify rule-style arrow mark`

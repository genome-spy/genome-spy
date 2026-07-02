# Arrow Mark Plan

## Rationale

GenomeSpy needs a first-class `arrow` mark for interval-like genomic and
protein visualizations where direction is part of the visual semantics. Current
marks can approximate some cases, but they do not provide a compact way to draw
directional intervals, repeated strand chevrons, centromere-like shapes, or
protein-domain arrows with consistent GPU-rendered geometry.

The mark should behave like an interval mark: data controls position, length,
color, opacity, and stroke through existing visual encodings, while arrow shape
configuration is controlled by mark props. In practice, those props become mark
uniforms. This keeps the geometry configuration stable per layer, avoids
expanding the encoding surface, and lets authors create separate layers for
different arrow styles or strand directions.

## Use Cases

- Read alignments and structural annotations that need a single directional
  head at one endpoint.
- Gene and transcript tracks that need repeated chevrons along the body to show
  strand direction.
- Protein features where domains may be shown as full-height directional
  blocks.
- Centromere or cytoband tracks that need symmetric or opposing arrow-like
  shapes.
- Overview tracks where very short intervals must remain legible without
  producing distorted arrowheads.

## Proposed Parameters

These parameters are mark props, not visual encoding channels. They are intended
to be uniform-backed and constant for a mark layer.

### Orientation and Direction

- `orient`: `"horizontal"` or `"vertical"`.
- `direction`: `"forward"` or `"reverse"`.
- `heads`: `"end"`, `"start"`, `"both"`, or `"none"`.

`orient` controls whether the arrow runs along x or y. `direction` controls
which side is considered forward after the interval has been sorted. `heads`
controls where arrowheads are drawn.

### Head Shape

- `headShape`: `"triangle"`, `"angle"`, or `"stealth"`.
- `headLength`: numeric length.
- `headLengthUnit`: `"px"` or `"proportion"`.
- `headWidth`: numeric width.
- `headWidthUnit`: `"px"` or `"proportion"`.

`triangle` is the filled block arrowhead and should be the default. `angle`
covers chevrons and strand arrows. `stealth` provides a more compact filled head
for dense annotation tracks.

### Stem Shape

- `stemWidth`: numeric width.
- `stemWidthUnit`: `"px"` or `"proportion"`.

The stem width controls the rectangular body of the arrow. Proportional sizing
uses the mark thickness in the orthogonal direction. Pixel sizing keeps the body
stable across varying row heights.

### Repeated Heads

- `headRepeat`: boolean.
- `headSpacing`: pixel spacing between repeated heads.
- `headOffset`: pixel offset before the first repeated head.
- `repeatMode`: `"body"` or `"whole"`.
- `repeatPhase`: `"mark"` or `"view"`.

Repeated heads support UCSC-style gene tracks and other strand-direction cues.
`body` repeats heads only where there is stem space. `whole` allows repeated
heads across the full arrow extent. `mark` anchors the pattern to each interval;
`view` anchors it to screen space so adjacent marks align visually.

### Short and Clipped Intervals

- `shortArrow`: `"shrinkHead"`, `"triangle"`, or `"hide"`.
- `headPlacement`: `"inside"` or `"outside"`.
- `clippedHead`: `"hide"` or `"showAtViewportEdge"`.

`shortArrow` defines behavior when the arrow is too short for the configured
head and stem. `shrinkHead` preserves the arrow shape by reducing head length.
`triangle` collapses the mark to a triangular glyph. `hide` suppresses geometry
that cannot be drawn legibly.

`headPlacement` defines whether the arrowhead is included in the encoded
interval or placed outside the encoded stem endpoint. The `"inside"` mode keeps
the whole arrow within the encoded interval and squeezes the head when the
interval becomes short. The `"outside"` mode extends the head beyond the
encoded endpoint. `clippedHead` controls whether a head is shown when the true
endpoint is outside the visible viewport.

## High-Level Design

The implementation should follow the existing `rect` mark more closely than the
`point` mark. The arrow is an interval mark with the same basic positional model
as `rect`: `x`, `x2`, `y`, and `y2` define a rectangle-like local coordinate
system, and the fragment shader computes the actual visible shape with signed
distance functions.

The vertex shader should produce local pixel coordinates and half-size values
similar to the rect mark. The fragment shader should normalize orientation and
direction so the core SDF can assume a left-to-right horizontal arrow. It should
then compute a union of the stem SDF and one or more head SDFs. Fill, stroke,
opacity, picking, and antialiasing should reuse the same conventions as existing
mark shaders.

Rougier's antialiased arrow shader snippets are useful references for the
triangle, angle, stealth, line-distance, and segment-distance SDF math. They
should be adapted to GenomeSpy's current GLSL style and rendering conventions
rather than copied wholesale.

The first implementation should prioritize a compact, stable API:

- Interval geometry based on `x`, `x2`, `y`, and `y2`.
- `orient`, `direction`, and `heads`.
- `triangle` and `angle` head shapes.
- Pixel and proportional `headLength`, `headWidth`, and `stemWidth`.
- Fill, stroke, opacity, and picking behavior aligned with `rect`.

Repeated heads and viewport-edge clipped heads can be added after the base mark
is stable, because they add patterning and clipping semantics that should be
tested separately.

## Documentation and Testing Notes

The public mark props should be documented in `packages/core/src/spec/mark.d.ts`
using user-facing wording. The JSON schema and docs artifacts may need to be
regenerated after adding the new type.

Focused tests should cover schema acceptance, shader snapshot stability, mark
factory registration, and rendering or layout behavior for representative arrow
configurations. Visual smoke examples should include a simple interval arrow, a
reverse strand arrow, a protein-domain-style arrow, and a repeated-chevron gene
track once repetition is implemented.

## Incremental Implementation Plan

The implementation should proceed in small, testable slices. Keep the mark
usable after each completed slice, even if the first slices render a simplified
shape.

### Step 1: Define the Public Spec Surface

Files:

- Modify `packages/core/src/spec/mark.d.ts`.
- Modify `packages/core/src/config/defaults/markDefaults.js`.
- Modify `packages/core/src/config/markConfig.js` if mark-specific config
  typing or defaults require it.
- Test with `packages/core/src/spec/schema.test.js` or a focused new schema
  assertion.

Work:

- Add `"arrow"` to `MarkType`.
- Add an `ArrowProps` interface extending `MarkPropsBase`,
  `SecondaryPositionProps`, and `FillAndStrokeProps`.
- Add the first-pass props:
  - `orient`
  - `direction`
  - `heads`
  - `headShape`
  - `headLength`
  - `headLengthUnit`
  - `headWidth`
  - `headWidthUnit`
  - `stemWidth`
  - `stemWidthUnit`
  - `shortArrow`
  - `headPlacement`
- Add repetition props only if the first implementation includes repeated
  heads. Otherwise keep them documented in this plan and add them in Step 8.
- Write user-facing JSDoc for every public prop, including default values.

Verification:

- Run `npx vitest run packages/core/src/spec/schema.test.js`.
- Confirm a minimal arrow spec validates against the generated core schema.

Tentative commit: `feat(core): add arrow mark spec surface`

### Step 2: Register a Minimal Arrow Mark

Files:

- Create `packages/core/src/marks/arrow.js`.
- Create `packages/core/src/marks/arrow.common.glsl`.
- Create `packages/core/src/marks/arrow.vertex.glsl`.
- Create `packages/core/src/marks/arrow.fragment.glsl`.
- Modify `packages/core/src/view/unitView.js`.
- Modify or add focused tests near `packages/core/src/marks/mark.test.js` if
  needed for mark factory behavior.

Work:

- Add an `ArrowMark` class following the structure of `RectMark`.
- Register `"arrow": ArrowMark` in `markTypes`.
- Support interval-position channels `x`, `x2`, `y`, and `y2`.
- Initially render a rectangle-shaped SDF through the arrow shaders. This keeps
  the pipeline testable before arrow-specific geometry is added.
- Register uniform-backed mark props in `finalizeGraphicsInitialization()`.
- Map enum props to small integer uniforms in JavaScript instead of branching on
  strings in GLSL.

Verification:

- Run a focused mark factory or initialization test.
- Run `npx vitest run packages/core/src/marks/shaderSnapshot.test.js` and update
  snapshots only after inspecting the generated shaders.

Tentative commit: `feat(core): register arrow mark`

### Step 3: Port the Rect-Like Interval Pipeline

Files:

- Modify `packages/core/src/marks/arrow.js`.
- Modify `packages/core/src/marks/arrow.vertex.glsl`.
- Modify `packages/core/src/marks/arrow.fragment.glsl`.
- Reuse `RectVertexBuilder` from `packages/core/src/gl/dataToVertices.js`
  unless arrow-specific vertex expansion becomes necessary.

Work:

- Use the rect mark's six-vertex interval geometry.
- Produce local pixel coordinates equivalent to `vPosInPixels`.
- Produce half-size values equivalent to `vHalfSizeInPixels`.
- Preserve minimum width and height behavior if the arrow mark supports
  `minWidth` and `minHeight`; otherwise keep the first pass simpler and require
  explicit interval sizes.
- Reuse GenomeSpy's existing `distanceToColor(...)` conventions for fill,
  stroke, transparency, and picking.

Verification:

- Add or update a focused rendering/layout test that confirms an arrow mark
  creates the expected view hierarchy and initializes without runtime errors.
- Run `npx vitest run packages/core/examples.schema.test.js` after the schema
  includes `arrow`.

Tentative commit: `feat(core): render arrow intervals with rect geometry`

### Step 4: Implement Core Arrow SDFs

Files:

- Modify `packages/core/src/marks/arrow.fragment.glsl`.
- Use `tmp/Rougier2014Antialiased2D-code/arrows.glsl` as a math reference, not
  as a direct copy.

Work:

- Add local helpers for:
  - axis-aligned box SDF
  - line distance
  - segment distance
  - triangle head SDF
  - angle head SDF
- Normalize orientation and direction at the start of the fragment shader so
  the core SDF can assume a left-to-right horizontal arrow.
- Build the arrow as a union of stem and head distances.
- Implement `heads: "end"`, `"start"`, `"both"`, and `"none"`.
- Implement `headShape: "triangle"`, `"angle"`, and `"stealth"`.

Verification:

- Add shader snapshots for representative combinations:
  - horizontal forward triangle
  - horizontal reverse triangle
  - both-headed triangle
  - angle head
- Run `npx vitest run packages/core/src/marks/shaderSnapshot.test.js`.

Tentative commit: `feat(core): add arrow signed-distance shapes`

### Step 5: Add Shape Sizing Semantics

Files:

- Modify `packages/core/src/marks/arrow.js`.
- Modify `packages/core/src/marks/arrow.common.glsl`.
- Modify `packages/core/src/marks/arrow.fragment.glsl`.
- Add focused tests near the arrow mark or shader snapshots.

Work:

- Implement pixel and proportional units for `headLength`, `headWidth`, and
  `stemWidth`.
- Interpret proportional width relative to the mark thickness in the orthogonal
  direction.
- Implement `headPlacement: "inside"` and `"outside"`.
- Implement `shortArrow: "shrinkHead"`, `"triangle"`, and `"hide"`.
- Fail fast in JavaScript for unknown enum values.

Verification:

- Add tests or snapshots that cover short intervals and both unit modes.
- Run `npx vitest run packages/core/src/marks/shaderSnapshot.test.js`.

Tentative commit: `feat(core): support arrow shape sizing props`

### Step 6: Wire the Arrow Playground

Files:

- Create or update `examples/core/marks/arrow/arrow_playground.json`.
- Update example snapshots if the shared example suite includes the new file.

Work:

- Keep the playground self-contained with inline data.
- Bind params to mark props through `{ "expr": "paramName" }`.
- Include controls for direction, heads, head shape, head length, head width,
  stem width, head placement, and short-arrow behavior.
- Keep positional and color values in normal encodings.

Verification:

- Run `npx vitest run packages/core/examples.schema.test.js`.
- Run `npx vitest run packages/core/examples.test.js -u` only after inspecting
  the new snapshot and confirming the view hierarchy is expected.
- Start the dev server with `npm start` and open
  `http://localhost:8080/?spec=examples/core/marks/arrow/arrow_playground.json`
  for a visual smoke test.

Tentative commit: `test(core): add arrow mark playground example`

### Step 7: Add User-Facing Docs

Files:

- Modify the relevant docs page under `docs/grammar/mark/` or create a new
  arrow mark page if the mark documentation is organized by mark type.
- Add a small docs example under `examples/docs/` only after the core example is
  stable.
- Regenerate schema/docs artifacts if the docs build requires them.

Work:

- Document the mark's interval semantics.
- Explain which properties are mark props and which visual properties remain
  encodings.
- Explain how to use separate layers for per-strand or per-style variation.
- Include one concise example for a directional interval.

Verification:

- Run `npm run build:docs` after the schema is regenerated.

Tentative commit: `docs(core): document arrow mark`

### Step 8: Add Repeated Heads

Files:

- Modify `packages/core/src/spec/mark.d.ts`.
- Modify `packages/core/src/marks/arrow.js`.
- Modify `packages/core/src/marks/arrow.common.glsl`.
- Modify `packages/core/src/marks/arrow.fragment.glsl`.
- Extend `examples/core/marks/arrow/arrow_playground.json` with repetition
  controls.

Work:

- Add `headRepeat`, `headSpacing`, `headOffset`, `repeatMode`, and
  `repeatPhase`.
- Implement repeated `angle` heads first, because repeated filled triangle heads
  can visually dominate dense gene tracks.
- Keep the repetition loop bounded or formula-based so fragment cost stays
  predictable.
- Decide whether repeated heads participate in picking as visible geometry; the
  expected behavior is yes.

Verification:

- Add shader snapshots for repeated heads in `body` and `whole` modes.
- Run the arrow playground and verify that repeated chevrons are stable during
  zooming.

Tentative commit: `feat(core): support repeated arrow heads`

### Step 9: Final Verification

Run the focused checks first:

- `npx vitest run packages/core/src/spec/schema.test.js`
- `npx vitest run packages/core/src/marks/shaderSnapshot.test.js`
- `npx vitest run packages/core/examples.schema.test.js`
- `npx vitest run packages/core/examples.test.js`

Then run broader checks before opening a PR:

- `npm --workspaces run test:tsc --if-present`
- `npm run lint`
- `npm test`

If docs or generated schema artifacts changed, also run:

- `npm run build`
- `npm run build:docs`

Tentative commit: `test(core): update arrow mark snapshots`

## Current Planning Artifact

The target playground spec is
`examples/core/marks/arrow/arrow_playground.json`. It intentionally uses the
future `arrow` mark and will fail current schema validation until the arrow mark
spec surface is implemented.

# Bidirectional arrow plan

Status: active

## Objective

Allow an `"arrow"` mark to place equivalent arrowheads at both encoded
endpoints by accepting `"both"` in the existing `direction` mark property and
encoding channel. Preserve the current `"forward"` and `"reverse"` behavior
and keep WebGL, WebGPU, Canvas2D, SVG export, and picking geometrically
consistent.

## Current design and findings

- `direction` is already the correct semantic surface. It is both a mark
  property and a discrete encoding channel, and the renderers receive it per
  datum. Adding a separate `bidirectional` boolean would create conflicting
  states and would be less useful for data-driven marks.
- Core currently maps `"forward"` and `"reverse"` to renderer codes `0` and
  `1`. WebGL and WebGPU use shader branches, while the renderer-neutral
  immediate path reverses its projected endpoints. Canvas2D, SVG, and Canvas
  software picking all consume that immediate geometry.
- Direction scale defaults are separate from the renderer's supported-value
  mapping. The automatic range should remain `["forward", "reverse"]` so an
  existing third data category does not silently change from a repeated
  one-way mapping to `"both"`; users opt into bidirectionality with an explicit
  value or range.
- `headSpacing` and `startNotch` describe a single direction of travel.
  Repeated heads do not express a useful ordering when both endpoints are
  heads, and a start notch has no unique start.
- `headNotchAngle` is different from `startNotch`: it controls the concavity of
  triangle heads and remains meaningful for a bidirectional triangle arrow.
  Open heads intentionally continue using `headAngle` for both edges.
- `headPlacement` remains meaningful. `"inside"` keeps both heads within the
  encoded interval; `"outside"` extends both heads beyond their respective
  endpoints.
- Short-arrow adjustment currently reserves `minStemLength` against one head.
  An inside bidirectional arrow must reserve the requested center stem after
  accounting for two equal heads, so each head receives at most half of the
  available non-stem length.
- The WebGPU vertex shader currently expands outside-head geometry toward the
  secondary endpoint even for `"reverse"`. The fragment shader mirrors the
  shape, so a reverse outside head can fall outside its quad. Bidirectional
  support should fix and regression-test that existing parity issue rather
  than build on it.

Established systems support endpoint heads as one direction mode. Graphviz
uses `dir="both"` for a head at each end, and SVG exposes independent
`marker-start` and `marker-end` positions:

- <https://graphviz.org/docs/attr-types/dirType/>
- <https://www.w3.org/TR/svg-markers/>

The proposal adopts only the established `"both"` vocabulary and endpoint
semantics. No external implementation is copied or adapted.

## Decisions

### Extend `direction` with `"both"`

Define `ArrowDirection` as `"forward" | "reverse" | "both"` and add `"both"`
to the discrete direction value mapper. The existing codes remain stable:

| Value       | Code | Heads              |
| ----------- | ---: | ------------------ |
| `"forward"` |    0 | Secondary endpoint |
| `"reverse"` |    1 | Primary endpoint   |
| `"both"`    |    2 | Both endpoints     |

The endpoint meaning is independent of numeric ordering, reversed scales, and
whether the arrow is horizontal, vertical, or diagonal.

Keep the automatic direction scale range as `["forward", "reverse"]` for
backward compatibility. `"both"` is available through a mark value,
expression, scale-less encoded value, or an explicitly configured discrete
range.

### Give `"both"` explicit precedence over one-way decorations

For a datum whose resolved direction is `"both"`:

- draw exactly one head at each endpoint;
- do not repeat heads, even when `headSpacing` is non-null;
- do not draw `startNotch`, even when it is true;
- continue to apply `headShape`, `headAngle`, `headWidth`, `headPlacement`,
  fill, stroke, and opacity to both heads;
- preserve the existing head-shape rule: `headNotchAngle` shapes both triangle
  heads, while open heads continue using `headAngle` for their inner edge;
- when `stem` is false, draw the two standalone endpoint heads;
- apply `minStemLength` symmetrically to inside triangle heads.

These are defined semantics, not validation fallbacks. They allow one
data-driven mark to contain forward, reverse, and bidirectional rows while
sharing mark-level shape properties. Documentation and tests must make the
precedence visible. Unknown direction values should still fail at the encoding
boundary rather than render as forward arrows.

### Represent endpoint heads directly in shared geometry

Keep the encoded primary-to-secondary axis as the canonical axis and derive
`headAtStart` and `headAtEnd` from the direction. Do not construct a
bidirectional arrow by unioning two complete one-way arrows: their full stems
would fill the head notches and make short-arrow adjustment difficult to keep
consistent.

The immediate renderer should carry the two endpoint-head flags in its reused
skeleton record. Change `visitArrowHeadPositions` so its callback receives the
tip plus the tangent and normal for that specific head; the start head uses the
opposite tangent and normal from the end head. Canvas/SVG polygon construction
and Canvas software picking must consume that per-head orientation instead of
reusing the instance axis. Its bidirectional stem is a symmetric double-pointed
polygon under the two heads. The WebGL and WebGPU signed-distance
implementations should use the equivalent symmetric stem and the minimum
distance to the two mirrored heads.

For outside placement, expand the draw bounds independently at the start and
end. For inside placement, calculate the effective shared head slope with
`(segmentLength - minStemLength) / 2` as the maximum per-head allowance. The
same calculation and edge cases must be kept equivalent in JavaScript, GLSL,
and WGSL.

## Alternatives considered

- A `bidirectional` boolean was rejected because it would overlap with the
  existing `direction` property and channel, create contradictory
  configurations, and require a second encoding to make the behavior
  data-driven.
- Independent `headStart` and `headEnd` booleans would be more general, but the
  extra combinations and encodings are not needed for this use case. The
  existing direction enum already describes the intended semantic choice.
- Rejecting `"both"` whenever `headSpacing` or `startNotch` is configured was
  rejected because those are mark-level properties while direction may vary by
  datum. A mixed mark should not need separate layers merely to share its
  styling.
- Rendering two opposing one-way arrow occurrences was rejected because it
  would duplicate picking identities and strokes, alter opacity, fill head
  notches incorrectly, and complicate clipping and export ordering.

## Non-goals

- Do not add independent start-head and end-head properties.
- Do not add `direction: "none"`; a headless segment is already better
  expressed with a rule mark, and it is not required for bidirectional arrows.
- Do not add separate styles, sizes, colors, or shapes for the two heads.
- Do not change the meaning or numeric codes of `"forward"` and `"reverse"`.
- Do not make repeated bidirectional patterns or alternate head directions
  along the stem.
- Do not add configuration warnings for intentionally inapplicable
  `headSpacing` or `startNotch`; the documented per-datum precedence is
  deterministic.

## Milestone 1: Build the shared immediate geometry

Status: completed

### Intended outcome

The renderer-neutral geometry, Canvas2D, SVG export, and Canvas software
picking can draw the same two-headed geometry, including inside/outside
placement and short arrows. The public type, schema, and discrete code mapping
remain unchanged until every GPU backend is ready.

### Work

- Replace the immediate renderer's reverse-only endpoint swap with explicit
  exhaustive direction resolution at the encoder-to-geometry boundary.
  Refactor its reused skeleton and head visitor so each endpoint head has the
  correct tip, tangent, and normal without adding per-frame allocations to the
  skeleton hot path.
- Add the symmetric stem polygon, two-head visitation, bidirectional culling
  bounds, outside expansion, and symmetric short-arrow slope calculation.
  Disable repeated heads and the start notch only for bidirectional instances.

### Affected areas and downstream consumers

- Shared semantic/immediate rendering:
  `packages/core/src/rendering/immediate/marks/arrow.js`; Canvas2D, SVG, and
  software picking consume this path.

### Verification

- Immediate tests use internal fixtures for constant values, expressions,
  scale-less fields, and explicit scale ranges without exposing the value in
  the public type or schema yet. Invalid scale-less values fail before geometry
  is built.
- Immediate/SVG tests place tips at both exact endpoints and cover triangle and
  open heads, `stem: false`, inside and outside placement, and a short arrow
  with nonzero `minStemLength`. Include focused assertions showing that
  `headSpacing` and `startNotch` have no effect on a bidirectional datum while
  still affecting forward/reverse data in the same mark.
- Canvas software-picking tests hit both heads and the stem but not the empty
  corners of the arrow's bounding rectangle, including outside placement at
  both ends.
- Degenerate fixtures cover `headWidth: 0`, `stem: false`, segment length less
  than or equal to `minStemLength`, and zero-length coincident endpoints. They
  must produce finite geometry or the existing intentional no-output result.
- Run the focused schema, encoder, immediate, SVG, Canvas, and software-picking
  Vitest suites with the `agent` reporter plus the Core TypeScript check.

### Documentation and migration

No public documentation or migration is introduced in this internal
milestone.

Tentative commit: `feat(core): add shared bidirectional arrow geometry`

## Milestone 2: Add WebGL geometry and picking parity

Status: completed

### Intended outcome

The default WebGL backend renders and picks bidirectional arrows with the same
endpoint, placement, and short-arrow semantics as the immediate path.

### Work

- Add the `2` direction code and equivalent two-head distance geometry to the
  WebGL shaders. Extend Core's internal discrete direction mapper and its tests
  so `"both"` reaches WebGL only after the shader supports code `2`.
- Add a symmetric double-pointed stem for `"both"`, suppress repetition and
  the start notch per instance, and apply the two-head short-arrow allowance.
- Expand both sides of the vertex strip for outside placement and keep normal
  and picking passes on the same signed-distance result.

### Affected areas and downstream consumers

`packages/core/src/rendering/webgl/marks/arrow.{common,vertex,fragment}.glsl`,
WebGL direction mapping, shader snapshots, live rendering, and GPU picking.

### Verification

- Update shader snapshots for the third direction path, symmetric outside
  expansion, and two-head distance evaluation.
- Add a real WebGL browser probe that renders and picks both endpoint heads,
  the center stem, and empty bounding-box corners. Include inside, outside,
  short, and reverse-outside instances so source snapshots are not the only
  geometry evidence.
- Run focused WebGL unit tests and the browser probe at DPR 1 and 2.

### Documentation and migration

No additional migration or documentation is introduced in this milestone.

The focused WebGL browser probe compiled the real shader and confirmed visible
forward, reverse, and bidirectional outside-placement rows. It also queried the
GPU picking buffer at DPR 1 and 2: both endpoint heads and the center stem hit
the same datum, while an empty corner of the arrow bounds remained empty.

Tentative commit: `feat(core): render bidirectional arrows in WebGL`

## Milestone 3: Add WebGPU parity, examples, and documentation

### Intended outcome

The generic WebGPU renderer and Core adapter support bidirectional arrows, the
reverse/outside expansion bug is fixed, and the complete feature is documented
and demonstrated across backends.

### Work

- Add a public frozen WebGPU direction-code export with forward `0`, reverse
  `1`, and both `2`; use it in the renderer GPU test and Core adapter instead of
  duplicating magic numbers.
- Add symmetric bidirectional geometry to the WebGPU arrow program and make
  outside expansion direction-aware for all three values, fixing reverse
  outside placement.
- Extend `ArrowDirection`, `ArrowProps.direction`, `DirectionDef`, schema
  fixtures, and channel documentation with `"both"`. Test direct mark values,
  expression values, `encoding.direction: { value: "both" }`, scale-less
  fields, explicit ranges, and invalid values. Keep the automatic direction
  range `["forward", "reverse"]` unchanged.
- Add or update a focused WebGPU arrow Storybook scene as required for a
  substantial renderer capability. Update `packages/webgpu-renderer/MIGRATION_PLAN.md`
  only if this work changes a tracked migration phase.
- Update `examples/core/marks/arrow/arrow_direction.json` to exercise an
  explicit three-value direction range and include horizontal, vertical, and
  diagonal cases. Regenerate its checked PNG and example snapshots.
- Update `docs/grammar/mark/arrow.md` and the arrow playground. Add a direction
  control and explain that `"both"` suppresses `headSpacing` and `startNotch`,
  while `headNotchAngle` continues to apply only to triangle heads. Regenerate
  `docs/genome-spy-schema.json` and verify the schema-derived type
  documentation through the normal docs workflow.

### Affected areas and downstream consumers

- `packages/webgpu-renderer/src/marks/{arrow.js,arrow.d.ts}` and
  `packages/webgpu-renderer/src/marks/programs/arrowProgram.js`.
- WebGPU arrow GPU tests, Storybook examples, and Core's WebGPU adapter.
- `examples/core/marks/arrow/arrow_direction.{json,png}`, example snapshots,
  `examples/docs/grammar/mark/arrow/arrow-playground.json`, the arrow grammar
  page, and generated schema artifacts.

### Verification

- WebGPU adapter tests translate `"both"` through the exported code contract.
- The WebGPU GPU test uses pixel and picking probes at both endpoints and
  includes a reverse outside-head regression probe at DPR 1 and 2.
- Degenerate WebGPU cases match the immediate/WebGL results for zero head
  width, hidden stems, over-constrained minimum stems, and zero-length
  endpoints.
- Build the affected Storybook and visually compare its arrow scene.
- Run focused WebGPU unit/GPU tests, Core adapter tests, workspace TypeScript
  checks, docs/schema generation checks, and lint for touched files.
- Compare the representative static direction example through WebGL,
  Canvas2D, SVG, and WebGPU, including zoom/clipping at both ends.

### Documentation and migration

Release notes should identify `"both"` as the new value and state its
interaction with `headSpacing`, `startNotch`, `headPlacement`, and
`minStemLength`. Existing specifications require no migration.

Tentative commit: `feat(core): complete bidirectional arrow support`

## Review gate

Review after milestone 1 at the shared geometry boundary, then review the final
renderer integration after milestone 3. In particular, compare endpoint
orientation, expansion, short-arrow slope adjustment, stroke/picking coverage,
and clipping across immediate, WebGL, and WebGPU paths. Do not accept a
renderer-specific approximation or a solution that duplicates two full arrow
instances.

## Final integration verification

Use the arrow playground plus one static direction example to exercise a mixed
data set containing `"forward"`, `"reverse"`, and `"both"`. Verify both filled
and open heads; toggle repetition, start notch, inside/outside placement, stem
visibility, and minimum stem length; then zoom until each endpoint is clipped
independently. Export the same view to SVG and compare its endpoint geometry to
the live Canvas2D, WebGL, and WebGPU renderers. Confirm tooltip and picking
identity remains one datum/mark occurrence rather than two overlapping arrows.

## Risks

- JavaScript, GLSL, and WGSL contain parallel geometry math. Small differences
  in head slope, outside offset, or stroke allowance can cause backend drift;
  shared numerical fixtures and endpoint probes are more valuable than shader
  source assertions alone.
- Very short inside arrows can force both heads to 90 degrees and leave no
  center stem. That is the expected limiting shape when `minStemLength` cannot
  fit, but it needs a stable finite result with no divide-by-zero or NaN.
- SVG polygon union and stroked overlapping heads can expose seams or duplicate
  outlines. Tests should cover visible stroke as well as fill-only output.
- Expanding both ends changes culling and clipping bounds. Missing one endpoint
  would produce backend-specific disappearance near a viewport edge.

## Unresolved questions

No public-contract question needs to block implementation. During visual
verification, very short open-head arrows may reveal that a separate symmetric
blunting rule would look better than the current open-head behavior. Treat that
as follow-up visual tuning unless it causes invalid geometry or backend drift;
do not expand this feature's API to solve it.

## Acceptance criteria

- `direction: "both"` is valid through the mark property and encoding channel.
- The automatic direction range remains `["forward", "reverse"]`; an explicit
  value or range is required to select `"both"`.
- Both endpoints use the same configured head geometry and placement.
- Bidirectional instances have no repeated heads and no start notch.
- `headNotchAngle` shapes both triangle heads; open heads preserve their
  existing `headAngle`-derived inner edges.
- `minStemLength` is applied symmetrically for short inside arrows.
- WebGL, WebGPU, Canvas2D, SVG, and all picking paths agree on representative
  horizontal, vertical, diagonal, inside, outside, open, filled, and stemless
  cases.
- Existing forward/reverse examples and tests remain unchanged except for
  intentional schema/range snapshot updates.
- Invalid direction values fail consistently before renderer-specific geometry
  is built.

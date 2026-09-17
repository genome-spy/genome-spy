# Glyph-based text effects feasibility record

Status: proof of concept complete; public integration deferred outside branch

## Result

The WebGPU renderer can produce a practical outline plus one shadow or glow
without assembling dynamic labels into temporary textures. Each logical label
expands to glyph quads in label-major paint order:

1. all shadow glyphs;
2. all outline glyphs; and
3. all fill glyphs.

The renderer submits the expanded stream in one instanced draw. This preserves
label order while keeping dynamic text glyph-based.

## Implemented design

- RGB MSDF supplies crisp fill and outline boundaries.
- The existing `rgba16float` atlas alpha component carries regular signed
  distance for stable SDF shadow/glow coverage at no additional texture cost.
- A zero-offset shadow acts as a glow.
- `stroke`, `strokeWidth`, and `strokeOpacity` are the prototype outline
  controls.
- `shadowColor`, `shadowOpacity`, `shadowOffsetX`, `shadowOffsetY`, and
  `shadowBlur` are renderer text channels.
- Shadow offsets are logical screen pixels and remain screen-directed after
  glyph rotation.
- Fill covers the inner half of the centered stroke, matching SVG/Canvas paint
  order and preventing translucent fill from revealing stroke underneath.
- Picking uses fill coverage only.
- Dynamic and series-backed effects provision their glyph layers once; zero
  values cull in the vertex shader without rebuilding layout.
- Effect-free text retains direct `glyphs[i]` indexing, one quad per glyph, and
  no render-item buffer.
- Effects currently require a TrueType outline font. Legacy bitmap text fails
  explicitly when effects are requested.

The dedicated `WebGPU Renderer/Scenes/Text Effects` Storybook scene exposes
retained controls for outline, shadow/glow, size, rotation, colors, offsets,
blur, and background contrast.

## Accepted limitations

- The shadow is a smooth scalar-distance ramp, not a Gaussian convolution.
- Separate translucent glyph effects accumulate where neighboring glyph quads
  overlap; exact whole-label alpha composition is intentionally absent.
- The ordinary atlas spread limits exceptionally wide outlines and shadows.
- Only one shadow/glow layer is supported.
- Core grammar, Canvas2D, SVG export, and WebGL compatibility semantics are not
  implemented by this renderer-level PoC.

Per-label scratch atlases were rejected because GenomeSpy labels are highly
dynamic. A separate blurred glyph atlas remains a possible later quality tier,
but it is not required for the initial portable effect API.

## Verification record

- Unit tests cover effect classification, exact label-major render-item order,
  effect-free specialization, retained replacement, and bitmap rejection.
- GPU tests verify RGB/alpha atlas data, outline/shadow/fill rendering,
  fill-only picking, atlas growth, baseline behavior, and shader validation.
- Storybook builds and the scene was visually inspected with rotated acute
  glyphs and live effect controls.
- Text program identity now depends only on font and effect variants; label
  contents are never serialized in the animation-frame hot path.

## Deferred production follow-up

The following items are explicitly discarded from this branch's scope. The
renderer proof of concept may merge, but no public grammar contract is implied.

1. Define a backend-neutral Core API for one outline and one shadow/glow.
2. Map the same paint order to Canvas2D and SVG; decide whether legacy WebGL
   receives parity or is allowed to remain unchanged while it is phased out.
3. Add a wide-effect atlas tier only if representative labels exceed the
   ordinary distance range.
4. Profile glyph-instance expansion and fragment cost on dense label workloads.
5. Document the deliberate glyph-overlap and non-Gaussian blur differences.

These deferred opportunities are reconciled in
[`production-integration-plan.md`](production-integration-plan.md).

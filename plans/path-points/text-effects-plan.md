# Glyph-based text effects plan

Status: implementation underway; milestone 1 complete

## Summary

Add an initial text-outline and drop-shadow implementation to
`@genome-spy/webgpu-renderer` without assembling complete strings into temporary
textures. Preserve the existing logical-string paint order by expanding each
string into a label-major stream of glyph-layer quads: all shadow glyphs for
one label, then all outline glyphs, then all fill glyphs, before advancing to
the next label.

Keep the current RGB MSDF for crisp fill and outline boundaries. Use the unused
alpha component of the existing `rgba16float` outline-font atlas for a regular
signed distance field. Evaluate the first shadow/glow approximation directly
from that scalar distance in the fragment shader. Do not add a blurred glyph
atlas or a per-label scratch atlas in this slice.

The implementation is intentionally a renderer-level proof of concept. Its
property semantics must remain implementable using Canvas `fillText`/
`strokeText` and SVG text strokes and filters, but Core grammar and export
integration are deferred until the visual and performance tradeoffs have been
evaluated.

## Goals

- Render text in label-major layer order while retaining one final draw call.
- Use only glyph quads; do not introduce per-label quads or textures.
- Preserve the current one-quad-per-glyph path when effects are statically
  absent, including its direct `glyphs[i]` indexing and resource bindings.
- Support dynamic or series-backed outline and shadow values without rebuilding
  text layout when only values change.
- Treat the existing `stroke`, `strokeWidth`, and `strokeOpacity` text channels
  as the outline controls for the prototype.
- Add `shadowColor`, `shadowOpacity`, `shadowOffsetX`, `shadowOffsetY`, and
  `shadowBlur` text channels. A zero-offset shadow is a glow.
- Use RGB MSDF samples for fill and outline and a scalar SDF sample for the
  soft shadow.
- Demonstrate the behavior and its limitations in a focused Storybook scene
  with interactive outline and shadow controls.
- Preserve logical-string draw ranges, retained series replacement, rotation,
  ranged text, placement, edge fading, and fill-based picking.
- Restrict this first effect implementation to GPU-generated TrueType outline
  fonts. Reject configured effects on legacy bitmap-font text with a clear
  validation error.

## Non-goals

- Exact whole-string alpha compositing. Independently rendered translucent
  glyph outlines and shadows may accumulate where glyph effects overlap.
- A true Gaussian convolution, a preblurred glyph texture, or a per-label
  scratch atlas.
- Pixel-identical output between WebGPU, Canvas, and SVG.
- Core text-mark grammar, Canvas2D, SVG, or legacy WebGL implementation in this
  slice.
- Multiple simultaneous shadow layers. Glow is the zero-offset form of the one
  shadow layer.
- Increasing the ordinary outline-font distance range or adding effect-specific
  atlas quality classes before the Storybook fixture demonstrates a need.
- Making effects part of picking geometry.

## Decisions

### Store true distance beside the MSDF

The sparse GPU generator already finds the nearest unsigned distance
independently for the three colored edge sets before applying the common
inside/outside sign. The minimum of those unsigned channel distances is
therefore the nearest distance to any edge. Write
`min(unsignedR, unsignedG, unsignedB) * sign` to alpha before RGB
interpolation-error correction. Preserve alpha through the correction pass
without modifying it.

For `rgba16float`, store all four signed atlas-pixel distances directly. For
the development `rgba8unorm` output, encode alpha as
`0.5 + distance / (2 * spread)`, matching RGB. Existing point and text decoders
continue reading only RGB unless they explicitly request scalar distance.

This is equivalent in purpose to the true-distance channel of an MTSDF, but it
does not require another edge traversal, texture, or compute dispatch.

### Expand glyphs into a label-major render-item stream

Keep the existing immutable glyph layout buffer. Effect-enabled text adds a
render-item buffer whose
entries identify a glyph and one of three layers:

1. shadow/glow;
2. outline; and
3. fill.

For each logical string, emit every enabled layer in that order before emitting
items for the next string. The generated channel accessors map a render item to
its glyph and then to `glyph.stringIndex`, so all layers retain the parent
string's channel cardinality and picking identifier.

Effect-enabled and effect-free text are compile-time program/resource variants.
The effect-free variant retains the current direct `glyphs[i]` series lookup,
does not bind a render-item buffer, and emits exactly one instance per glyph.
The effect-enabled variant uses
`glyphs[renderItems[i].glyphIndex].stringIndex` for logical series lookup.

Effects are provisioned from normalized channel analysis, not the values of
every frame:

- absent effects and literal width, opacity, or color-alpha values that make an
  effect impossible emit no render items;
- series-backed, conditional, or `dynamic: true` effects emit their layer for
  every glyph and cull zero-opacity/zero-width occurrences in the vertex
  shader, including when their initial value is zero;
- a conditional effect is provisioned whenever any branch can produce visible
  coverage; and
- retained value updates do not rebuild the render-item buffer.

Maintain an exclusive prefix sum from logical strings to render items. Draw
ranges remain expressed in logical strings and translate through this prefix
sum. Rebuild both glyph and render-item buffers when `replaceSeries` changes the
text layout.

All items remain procedural six-vertex quads, allowing one instanced draw call.
The current outline-font glyph quad already covers the glyph's padded atlas
tile. Every layer keeps that tile's existing UV mapping; it does not stretch
the nominal glyph UV rectangle when an effect is enabled. The one-pixel packed
gutter remains outside the sampled tile and protects bilinear taps from
neighboring glyphs. Shadow items translate the already padded quad in
screen-space after glyph rotation, while outline and fill items keep the glyph
position. This gives screen-directed light offsets that match the existing
rectangle shadow convention.

Clamp outline and shadow softness to the signed-distance extent represented by
the ordinary 24-atlas-pixel spread, less the antialiasing guard. Offsets do not
consume distance range because they translate geometry rather than shifting UV.
If the Storybook fixture demonstrates that this range is inadequate, record a
wide-effect atlas quality class as production follow-up; do not add it to this
prototype.

### Evaluate the initial shadow from scalar distance

Use the alpha SDF for shadows and glows. Convert signed device-pixel distance
to coverage with one fixed piecewise rule:

- when clamped blur is zero, use the existing linear one-device-pixel
  antialiasing ramp; and
- otherwise use `smoothstep(-blur, blur, distance)` after converting distance
  and blur to device pixels.

This is a deliberately inexpensive soft-distance approximation rather than a
Gaussian convolution. It should avoid the channel-switch artifacts that make
wide effects from the RGB median visually unstable.

Interpret nonnegative `shadowBlur` in logical screen pixels and scale it by
device pixel ratio. Negative values clamp to zero. Shadow offsets are also
logical pixels but remain screen-space after text rotation. Range fitting and
anchor culling continue to use fill bounds in this prototype; effect pixels may
extend beyond a fitted range but remain subject to the enclosing render scissor.
Viewport edge fading evaluates the translated shadow position for shadow items
and the ordinary glyph position for outline/fill items.

Use premultiplied source-over blending. Picking ignores shadow and outline
items and evaluates the original fill contour only. Edge fading applies to all
visible layers consistently.

### Accept glyph-overlap artifacts explicitly

Separate glyph quads mean translucent effects can accumulate where neighboring
glyph outlines or shadows overlap. This is an accepted initial limitation.
Label-major layer ordering nevertheless prevents an earlier label's fill from
incorrectly covering a later label's effect.

Do not hide the limitation with a per-label texture. If it proves unacceptable,
the next experiment is a lazily generated, per-font glyph shadow atlas or a
different blending strategy. A dynamic per-label atlas remains out of scope.

### Keep the API portable

The prototype uses existing stroke channels as its outline vocabulary and
preserves `strokeWidth` as the total centered-stroke width. Its visible outer
portion is the exterior half of that width; the outline layer emits only the
exterior ring so a translucent fill does not reveal stroke underneath it. The
eventual Core mapping can render them with `strokeText` followed by `fillText`
on Canvas and `paint-order="stroke fill"` on SVG. The shadow tuple matches the
existing rectangle shadow properties and maps to Canvas shadow state and an SVG
filter. Backend blur kernels may differ while preserving the same conceptual
layer order and logical-pixel parameters.

## Milestone 1: Atlas distance channel and glyph-layer contract

Status: complete

### Intended outcome

Outline-font atlas texels contain RGB MSDF plus scalar signed distance in alpha,
and text programs can address a label-major render-item stream without changing
logical draw-range semantics.

### Affected areas and downstream consumers

- Sparse GPU atlas generation and format-specific output mapping.
- Text layout GPU buffers, generated series indexing, draw-range translation,
  retained text replacement, and picking.
- Point/path decoders remain RGB-only and must not change visually.

### Verification

- Add Playwright GPU readback assertions for signed alpha inside, near, and
  outside a contour in both float and normalized output.
- Test exact render-item order and prefix sums for empty, single-glyph, and
  multi-glyph strings with each effect combination.
- Test logical draw-range translation and retained text replacement.
- Test static zero width/opacity/color alpha, dynamic initial zero, series,
  and conditional effect provisioning.
- Assert that effect-free text binds no render-item buffer, uses the direct
  glyph indexing expression, and retains its previous GPU instance count and
  buffer-size profile.
- Run renderer unit tests, type checks, and focused GPU atlas tests.

Tentative commit: `feat(webgpu-renderer): prepare glyph-layer text effects`

## Milestone 2: SDF outline and shadow rendering

### Intended outcome

The text program renders optional shadow/glow, outline, and fill glyph layers
in label-major order from one draw call. Static effect-free text retains the
current render-item count and visual path.

### Affected areas and downstream consumers

- Text channel definitions and public TypeScript channel names.
- Text vertex geometry, fragment coverage, edge fading, opacity composition,
  and picking behavior.
- TrueType-only validation for the initial effect path.
- Retained dynamic/value updates for effect channels.

### Verification

- Shader-contract tests cover RGB/alpha sampling, layer culling, shadow offset,
  blur extent, outer-outline coverage, premultiplied composition, and
  fill-only picking.
- GPU tests compare effect-free text with the current baseline and sample
  expected shadow/outline regions for rotated and unrotated glyphs.
- GPU picking tests sample shadow-only and outline-only pixels and require no
  hit. An overlap fixture verifies the encoded label-major layer order.
- Exercise effect extents at the ordinary spread limit, rotated glyphs, and
  atlas growth/copying without neighboring-tile contamination.
- Exercise translucent outline overlap as a documented limitation rather than
  asserting whole-string union behavior.

Tentative commit: `feat(webgpu-renderer): render SDF text outlines and shadows`

## Milestone 3: Interactive Storybook evaluation

### Intended outcome

A focused Storybook scene makes outline and shadow quality, padding, dynamic
updates, and overlap artifacts easy to inspect without recreating the mark.

### Affected areas and downstream consumers

- A dedicated renderer-generic `textEffectsScene` using the default TrueType
  font and returning `{ cleanup, update }`.
- Storybook controls for outline width, outline opacity, shadow opacity, blur,
  horizontal/vertical offset, font size, rotation, and background contrast.
- The renderer migration backlog and this plan's recorded feasibility result.

### Verification

- Build Storybook.
- Inspect small and large text, light-on-dark and dark-on-light text, zero-blur
  shadows, zero-offset glow, rotated text, acute glyphs, and overlapping glyphs.
- Back controls with `dynamic: true` value channels and retained value handles.
  Confirm controls update without recreating the renderer or reparsing the
  font.
- Capture a browser screenshot and check the console for validation errors.

Tentative commit: `test(webgpu-renderer): demonstrate dynamic text effects`

## Review gates

- Review the atlas alpha contract and label-major render-item design before
  implementation because they affect shared MSDF output and text indexing.
- Review the final Storybook result and effect-free fast path after integration.

## Acceptance criteria

- Effect-free outline-font text uses one quad per glyph and remains visually
  unchanged, with no additional render-item resource or lookup.
- A potentially dynamic shadow adds one shadow quad per glyph; an outline adds
  one outline quad per glyph.
- Draw ranges and painter's order remain logical-label based.
- Shadows use the scalar alpha SDF and show no RGB channel-switch artifacts.
- Outline and shadow values update through existing retained handles.
- Picking excludes all effect-only coverage.
- The Storybook example exposes the requested knobs and runs without browser or
  WebGPU validation errors.
- Remaining translucent-overlap and SDF-blur limitations are recorded before
  the plan is marked complete.
- Legacy bitmap-font text rejects configured effects until a separate effect
  path is designed.

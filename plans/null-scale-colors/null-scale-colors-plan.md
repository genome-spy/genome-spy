# Direct color encodings with a disabled scale

[Issue #713](https://github.com/genome-spy/genome-spy/issues/713) reproduces a
WebGL crash when a rectangle's `fill` field contains CSS hex colors and sets
`scale: null`. Support direct paint on `color`, `fill`, and `stroke` using the
existing syntax.
[Vega-Lite's disabled scale](https://vega.github.io/vega-lite/docs/scale.html#disable)
has the same field semantics. GenomeSpy needs a compact GPU representation of
the parsed paint because its marks read numeric attributes and storage buffers.

## Contract and ownership

- A nominal or ordinal field may supply strings that `d3-color` accepts. Null
  paint is transparent. Reuse Core's CSS parser for GPU conversion and preserve
  renderer error context for invalid colors where available. Fields still need
  to be present on every row.
- The resolver represents a disabled scale as a pass-through function with
  `type === "null"`. Check the resolved type in both GPU backends. Canvas2D and
  SVG already consume the original paint strings through the immediate encoder.
  No schema change or migration is needed. Scaled colors retain their current
  range mapping.
- Both GPU backends store data-dependent direct paint as one straight RGBA8 word
  per value, with red in the low byte and alpha in the high byte. Clamp and
  round each component independently. Keep constant paint and the existing
  mark-level alpha composition. Core owns parsing and packing. Each GPU backend
  owns decoding the word to normalized RGBA before shading.
- Packing fits the existing integer buffers at four bytes per value. Four floats
  would require 16 bytes, and a palette would add resources and a lookup.

## Implementation

Deliver this as one milestone, tentatively
`feat(core): support direct color encodings with disabled scales`.

1. Add one packing helper alongside `cssColorToRgba`. Reuse it when converting
   data in WebGL's `GeometryBuilder` and WebGPU's `createColorBranch`.
2. In WebGL, select the existing integer attribute path for disabled color
   scales. Generate a small GLSL ES 3.00 unpack using shifts and masks and skip
   range texture creation in `WebGLHelper`. Use the same conversion for scaled
   datum uniforms, including parameter-driven datum values. Condition values
   keep their existing vec4 path.
3. In WebGPU, replace the adapter's existing four-float direct-color fallback
   with its existing cached integer series path. Expose a small renderer-owned
   RGBA8 UNORM decoder using the resource-free mapping hooks and WGSL's
   `unpack4x8unorm`. The adapter uses the renderer's public entry point.
4. Document the syntax in the scales guide and add a Core minor changeset. Keep
   tests focused on parsing and the renderer paths that the fix changes.

## Verification

- Render the issue's rectangle with the WebGL default and the WebGPU renderer.
  Use non-symmetric component values to catch reversed bytes. Also exercise
  translucent paint, null paint, and a conditional value alongside a direct
  field. Verify parameter-driven datum updates through WebGL.
- Check that the direct encoding uses one 32-bit word, allocates no palette, and
  retains the original paint in CPU/SVG output. Check a neighboring ordinal
  color path and ordinary picking on the rendered mark. Use independent scales
  if combining direct and scaled paint in one layer spec.
- Run the focused regression tests, type checks for both packages, lint and
  release checks. Review the combined implementation and measure the runtime
  source change against the branch base.

## Completion

Plan and implementation reviews are complete. The implementation retains WebGPU
accessor errors as causes to preserve specification locations, and the WebGL
regression test exercises the real range-texture helper.

Chrome pixel checks passed on Canvas2D, WebGL, and WebGPU for direct color,
alpha, null paint, conditional overrides, reactive datum, and a layer with
direct and ordinal colors. Picking and SVG export also passed. The 192 focused
tests, both package type checks, lint, and release checks passed.

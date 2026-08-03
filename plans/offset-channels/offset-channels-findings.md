# Offset channels: findings

## Scope

This document records how positional offsets and `dx`/`dy` work in the
following implementations:

- Vega at commit
  [`c03b7d0f`](https://github.com/vega/vega/tree/c03b7d0fe369be1a6e81d23dc899aef6eb7da967)
- the local Vega-Lite checkout at commit
  [`f0e76dfc`](https://github.com/tuner/vega-lite/tree/f0e76dfc7efa720817249f612f66599e2ca5ead4)
- GenomeSpy on the `feature/offset-channels` branch before offset-channel
  implementation

The motivating request is
[GenomeSpy issue #230](https://github.com/genome-spy/genome-spy/issues/230).

## Terminology

The four endpoint names are independent:

| Position | Primary endpoint | Secondary endpoint |
| --- | --- | --- |
| Horizontal | `x` / `xOffset` | `x2` / `x2Offset` |
| Vertical | `y` / `yOffset` | `y2` / `y2Offset` |

An *offset channel* maps data, a datum, an expression, or a visual value to a
pixel displacement. An *offset property* is a mark-level default pixel
displacement. A *nested offset scale* is an offset scale whose pixel range is
derived from the bandwidth of a discrete positional scale; it is what enables
grouped bars and grouped points.

## Vega

Vega does not expose `xOffset` and `yOffset` as separate top-level encoding
channels. Instead, a Vega value reference may contain an `offset`. Vega first
evaluates the value reference and its scale and then adds the offset. The
offset may itself be a constant, signal, field reference, or scaled value
reference.

For example, Vega-Lite can generate the following Vega encoding:

```json
{
  "x": {
    "scale": "x",
    "field": "category",
    "offset": {
      "scale": "xOffset",
      "field": "group"
    }
  }
}
```

The relevant implementation is
[`packages/vega-parser/src/parsers/encode/entry.js`](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-parser/src/parsers/encode/entry.js),
where `enc.offset` is added after scale and multiplier evaluation.

Vega also exposes `dx` and `dy` as text-mark encode properties. They are
declared with the other text properties in
[`packages/vega-schema/src/encode.js`](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-schema/src/encode.js).
They are not a general substitute for endpoint offsets.

Because Vega positional scales have pixel ranges, both the base position and
the added offset are in pixels when the expression is evaluated.

## Vega-Lite

### Public model

Vega-Lite exposes only `xOffset` and `yOffset` as encoding channels. Their
definitions accept a scale-backed field or datum, or a numeric visual value.
The public declarations are in
[`src/encoding.ts`](https://github.com/tuner/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/encoding.ts)
and
[`src/channeldef.ts`](https://github.com/tuner/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/channeldef.ts).

Vega-Lite exposes all four names as mark properties:

- `xOffset`
- `yOffset`
- `x2Offset`
- `y2Offset`

The secondary offsets are not encoding channels. They are visual mark
properties, declared in
[`src/mark.ts`](https://github.com/tuner/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/mark.ts).

### Compilation to Vega

`positionOffset` chooses between an encoding-driven offset and a mark
property. Encoding-driven behavior exists only for `xOffset` and `yOffset`.
The resulting reference is attached to Vega's `offset` member of `x`, `y`,
`x2`, or `y2`. See
[`src/compile/mark/encode/offset.ts`](https://github.com/tuner/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/compile/mark/encode/offset.ts).

Encoding definitions take precedence over the matching primary mark property.
The primary and secondary properties otherwise describe separate endpoints.

### Primary and secondary coupling

For explicitly ranged geometry, the endpoint properties are independent:

- `xOffset` affects `x`.
- `x2Offset` affects `x2`.
- `yOffset` affects `y`.
- `y2Offset` affects `y2`.

Vega-Lite propagates a primary offset when the secondary position is implicit
or generated. The range compiler asks for `x2Offset`/`y2Offset` when the
secondary endpoint is explicit, but falls back to the corresponding primary
offset when it must synthesize the endpoint. See
[`src/compile/mark/encode/position-range.ts`](https://github.com/tuner/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/compile/mark/encode/position-range.ts).

Specialized binned-rect compilation follows the same principle using
`offset2 ?? offset`; see
[`src/compile/mark/encode/position-rect.ts`](https://github.com/tuner/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/compile/mark/encode/position-rect.ts).

The observable rules are:

| Geometry | Effect of a primary offset |
| --- | --- |
| Point or text with only `x`/`y` | Moves the anchor |
| Rect represented by an anchor plus width/height | Moves the whole rect |
| Range with an implicit/generated secondary endpoint | Propagates to the generated endpoint |
| Range with an explicit secondary endpoint | Affects only the primary endpoint |

### Nested offset scales

For discrete grouping, Vega-Lite creates an independent scale for `xOffset`
or `yOffset`. The default scale is band-like, and its pixel range is derived
from the bandwidth of the corresponding primary positional scale. A grouped
bar is compiled approximately as:

```json
{
  "x": {
    "scale": "x",
    "field": "category",
    "offset": { "scale": "xOffset", "field": "group" }
  },
  "width": { "signal": "bandwidth('xOffset')" }
}
```

Consequences of this coupling include:

- grouped bars use the offset scale's bandwidth as bar width;
- grouped points use the midpoint of the offset band;
- the primary positional scale becomes a band scale when nested offsets need a
  band to occupy;
- step-based view sizing may apply the configured step to either the primary
  position or the nested offset;
- offset scale padding controls spacing between subgroups.

The scale range logic is in
[`src/compile/scale/range.ts`](https://github.com/tuner/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/compile/scale/range.ts),
and default scale-type inference is in
[`src/compile/scale/type.ts`](https://github.com/tuner/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/compile/scale/type.ts).

Vega-Lite primarily treats encoding offsets as nested positions within a
discrete primary position. It drops a nested offset on a continuous primary
position in normalization. GenomeSpy has genomic use cases for explicit pixel
offsets on continuous and locus positions, so exact replication of that
restriction would be counterproductive.

### `dx` and `dy`

Vega-Lite inherits `dx` and `dy` as mark configuration properties from Vega.
It does not expose them as encoding channels. They are text/glyph adjustments,
whereas `xOffset` and `yOffset` translate positional anchors.

## GenomeSpy today

### Public schema

GenomeSpy declares `xOffset` and `yOffset` only on `MarkPropsBase`. It has no
`x2Offset` or `y2Offset` properties. The documentation says that each primary
property affects both corresponding endpoints.

Conversely, `dx` and `dy` are included in `ChannelWithScale` and in the public
`Encoding` interface. Their definitions accept the same broad mark-property
forms as other numeric channels. See
[`packages/core/src/spec/channel.d.ts`](../../packages/core/src/spec/channel.d.ts)
and
[`packages/core/src/spec/mark.d.ts`](../../packages/core/src/spec/mark.d.ts).

### Mark offsets

`mark.xOffset` and `mark.yOffset` are applied in `Mark.setViewport()` by adding
them to the view translation. This moves every datum and both endpoints of a
ranged mark. It also means that offsets are mark-wide uniforms rather than
data-driven GPU attributes. See
[`packages/core/src/marks/mark.js`](../../packages/core/src/marks/mark.js).

The offsets are logical CSS pixels. The viewport code normalizes them against
the canvas or scoped viewport before writing `uViewOffset`.

The same code adds an unconditional half-pixel translation for raster
alignment. That adjustment is independent of public offsets and must remain
when mark offsets move out of viewport setup.

### Point `dx` and `dy`

Only the point mark exposes `dx` and `dy` as GPU attributes and supported
channels. The point vertex shader adds them to the scaled point position after
dividing by `uViewportSize`:

```glsl
vec2 pos = vec2(getScaled_x(), getScaled_y()) +
    vec2(getScaled_dx(), getScaled_dy()) / uViewportSize;
```

See
[`packages/core/src/marks/point.js`](../../packages/core/src/marks/point.js)
and
[`packages/core/src/marks/point.vertex.glsl`](../../packages/core/src/marks/point.vertex.glsl).

This has two notable semantics:

1. `dx` and `dy` are applied before sample-facet positioning, so vertical
   displacement is scaled by the sample facet's height instead of remaining a
   fixed pixel displacement.
2. Positive `dy` increases GenomeSpy's unit-space y coordinate, while positive
   `mark.yOffset` moves down in screen space. The two current mechanisms use
   opposite vertical sign conventions.

The widely used RefSeq gene annotation example uses expression-backed `dx` to
place strand triangles beside text labels:
[`examples/docs/examples/genomic-data/scored-refSeq-genes.json`](../../examples/docs/examples/genomic-data/scored-refSeq-genes.json).

### Text `dx` and `dy`

Text supports `dx` and `dy` only as mark properties. They are stored in the
text mark's uniform block and applied to glyph geometry. They are not part of
the text mark's encoding channels. See
[`packages/core/src/marks/text.js`](../../packages/core/src/marks/text.js)
and
[`packages/core/src/marks/text.vertex.glsl`](../../packages/core/src/marks/text.vertex.glsl).

These properties should remain distinct from anchor offsets. Text `dx`/`dy`
belong to glyph layout and rotation; `xOffset`/`yOffset` move the positional
anchor in screen axes.

### Other marks

Rect, rule, arrow, link, and text shaders read only their scaled positional
channels. None can currently offset endpoints per datum. For example:

- rects read and sort `x`, `x2`, `y`, and `y2` before constructing geometry;
- rules and arrows derive their tangent from the two endpoints;
- links derive curves and arc height from the two endpoints;
- ranged text uses both endpoints for alignment, squeezing, and clipping.

Offsets must therefore be incorporated before each mark calculates derived
geometry, not added only to the final vertex position.

### Scale and coordinate constraints

GenomeSpy's positional scales currently have locked unit ranges `[0, 1]`.
Other visual channels may have arbitrary ranges, including pixel-valued
ranges. The generic encoder, scale-resolution, GLSL scale generation, and
attribute builders already support new scale-backed channels.

An offset channel can therefore return logical pixels today. The renderer must
convert those pixels to unit coordinates at the last responsible point. After
the planned positional pixel-range migration, the offset values can be added
directly and the combined pixel position can be normalized once for rendering.

### Current inconsistency summary

| Feature | Point | Text | Rect/rule/arrow/link |
| --- | --- | --- | --- |
| `mark.xOffset` / `mark.yOffset` | Whole-mark viewport translation | Whole-mark viewport translation | Whole-mark viewport translation |
| encoded `dx` / `dy` | Supported | Not supported | Not supported |
| mark `dx` / `dy` | Converted to point encodings | Glyph properties | Not supported |
| independent secondary offsets | Not applicable | No | No |

## Conclusions

1. GenomeSpy's encoder and GPU architecture can support `xOffset` and
   `yOffset` channels without waiting for positional pixel ranges.
2. Offsets should be represented internally in logical pixels, then converted
   at the rendering boundary while positions remain unit-valued.
3. `x2Offset` and `y2Offset` should be mark properties, not public encoding
   channels, to match Vega-Lite.
4. Primary offsets affect explicit primary endpoints only. They propagate to
   secondary geometry only when that geometry is implicit or size-based.
5. Point `dx`/`dy` need a compatibility path. Removing them immediately would
   break the gene annotation track and other existing specifications.
6. Automatic grouped bars require more than adding two shader attributes: they
   require a nested offset scale whose pixel range and bandwidth depend on the
   primary positional scale and view size.

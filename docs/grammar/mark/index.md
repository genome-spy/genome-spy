# Marks

![Marks](../../img/block-mark.svg){align="right" style="width: 30%"}

In GenomeSpy, visualizations are built from marks, which are geometric shapes,
such as points, ticks, arrows, rectangles, and lines, that represent data
records, or rows in a tabular dataset. These marks are mapped to the data using the
`encoding` property,
which specifies which visual channels, such as `x`, `color`, and `size`, should
be used to encode the data fields. By adjusting the encodings, you can present
the same data in a wide range of visual forms, such as scatterplots, bar charts,
and heatmaps.

```json title="Example: Specifying the mark type"
{
  ...,
  "mark": "rect"
  ...,
}
```

## Properties

Marks also support various properties for controlling their appearance or
behavior. The properties can be specified with an object that contains at least
the `type` property:

```json title="Example: Specifying the mark type and additional properties"
{
  ...,
  "mark": {
    "type": "rect",
    "cornerRadius": 5
  },
  ...,
}
```

## Encoding

While mark properties are static, _i.e._, same for all mark instances,
`encoding` allows for mapping data to [visual channels](#channels) and using
data-driven visual encoding.

It's worth noting that while all visual encoding channels are also available as
static properties, not all properties can be used for encoding. Only certain
properties are suitable for encoding data in a meaningful way.

```json title="Example: Specifying visual channels with the encoding property"
{
  ...,
  "mark": "rect",
  "encoding": {
    "x": {
      "field": "from", "type": "index"
    },
    "x2": {
      "field": "to"
    },
    "color": {
      "field": "category", "type": "nominal"
    }
  },
  ...
}
```

The schematic example above uses the `"rect"` mark to represent the data rows.
The `"from"` field is mapped to the positional `"x"` channel, and so on. You can adjust
the mapping by specifying a [scale](../scale.md) for the channel.

### Channels

#### Position channels

All marks support the two position channels, which define the mark instance's
placement in the visualization. If a positional channel is left unspecified, the
mark instance is placed at the center of the respective axis.

##### Primary channels

`x`
: The position on the _x_ axis

`y`
: The position on the _y_ axis

##### Secondary channels

Some marks, such as `"arrow"`, `"rect"`, and `"rule"`, also support secondary
positional channels, which allow specifying an interval that the mark should
cover in the visualization.

`x2`
: The secondary position on the _x_ axis

`y2`
: The secondary position on the _y_ axis

##### Offset channels

`xOffset` and `yOffset` displace encoded positions in logical pixels. Positive
`xOffset` values move right, and positive `yOffset` values move down. Offset
channels accept constants, expressions, and scale-backed field or datum
definitions.

`xOffset`
: Horizontal displacement from `x`

`yOffset`
: Vertical displacement from `y`

For ranged marks, an implicit `x2` or `y2` endpoint inherits the corresponding
primary offset. An explicitly encoded secondary endpoint is independent and
has no offset by default. Set the `x2Offset` or `y2Offset` mark property to
displace an explicit secondary endpoint. These secondary offsets are mark
properties, not encoding channels.

###### Nested offset scales

A discrete field, datum, or expression on `xOffset` or `yOffset` creates a
nested band scale when the matching primary position uses a band scale. The
offset range is measured in logical pixels and spans the primary band.
Point-like marks use subgroup centers, while rectangles cover subgroup band
extents.

The primary scale's `paddingInner` and `paddingOuter` control spacing between
groups and default to `0.2` when a nested offset scale is present. The offset
scale's padding controls spacing between marks within each group. Explicit
padding values override the defaults.

See the [grouped bar example](rect.md#grouped-bars).

```json title="Nested bands for grouped bars"
{
  "width": { "step": 12 },
  "encoding": {
    "x": { "field": "category", "type": "nominal" },
    "xOffset": {
      "field": "group",
      "type": "nominal",
      "scale": { "paddingInner": 0.15 }
    }
  }
}
```

As described in [Step sizing](../composition/concat.md#step-sizing), a
step-based width or height normally describes a positional scale step. When a
discrete offset scale is present, it describes each offset step by default. Use
`{ "step": 12, "for": "position" }` to make the step describe each primary
category instead. An explicit offset-scale `range` remains a pixel range and is
not replaced by nested-band inference.

#### Other channels

`color`
: Color of the mark. Affects `fill` or `stroke`, depending on the `filled` property.

`fill`
: Fill color

`stroke`
: Stroke color

`opacity`
: Opacity of the mark. Affects `fillOpacity` or `strokeOpacity`, depending on the `filled` property.

`fillOpacity`
: Fill opacity

`strokeOpacity`
: Stroke opacity

`strokeWidth`
: Stroke width in pixels

`size`
: Depends on the mark. `"point"`: the area of the rectangle that encloses the mark instance. `"rule"` and `"link"`: stroke width. `"text"`: font size.

`shape`
: Shape of `"point"` marks.

`angle`
: Rotational angle of `"point"` and `"text"` marks.

`text`
: Text that the `"text"` mark should render for a mark instance.

`tooltip`
: Rows shown by the default tooltip handler. A single definition shows one row.
  An array shows multiple rows in the specified order. Rows can use field,
  expression, datum, or value definitions. If omitted, the default handler shows
  the hovered datum's properties. If `null`, raw datum rows are hidden for the
  mark. The `mark.tooltip` property is separate and selects or disables the
  tooltip handler.

```json
{
  "encoding": {
    "tooltip": [
      { "field": "name", "title": "Read" },
      { "field": "mapq", "title": "Mapping quality" },
      { "expr": "datum.mapq >= 20 ? 'pass' : 'low'", "title": "Status" }
    ]
  }
}
```

#### Non-visual channels

Some channels carry metadata for interaction features and are not encoded into
visual mark properties.

`key`
: Defines a stable identity for rows. This is used by point-selection
  persistence in the GenomeSpy App. The key can be a single field definition
  or an array of field definitions for a composite key. For composite keys, the
  field order is significant.

#### Channels for sample collections

The [GenomeSpy app](../../sample-collections/visualizing.md#specifying-a-sample-view) supports an additional channel.

`sample`
: Defines the track (or facet) for the sample

### Visual Encoding

GenomeSpy provides several methods for controlling how data is mapped to visual
channels. The most common method is to map a [field](#field) of the data to a
channel, but you can also use [expressions](#expression), [values](#value), or
[data values](#datum) belonging to the data domain.

For interaction-driven styling, see [Conditional
Encoding](../conditional-encoding.md).

Expect for the `value` method, all methods require specifying the data type
using the `type` property, which must be one of: `"quantitative"`, `"nominal"`,
or `"ordinal"`, `"index"`, or
[`"locus"`](../genomic-coordinates.md#encoding-genomic-coordinates).
The first three types are equivalent to the [Vega-Lite
types](https://vega.github.io/vega-lite/docs/type.html) of the same name.

#### Field

`field` maps a field (or column) of the data to a visual channel.

```json
{
  "encoding": {
    "color": { "field": "significance", "type": "ordinal" }
  },
  ...
}
```

#### Expression

`expr` applies an [expression](../expressions.md) before passing the value for
a scale transformation.

```json
{
  "encoding": {
    "color": { "expr": "datum.score > 10", "type": "nominal" }
  },
  ...
}
```

#### Value

`value` defines a value on channel's _range_, skipping the scale transformation.

```json
{
  "encoding": {
    "color": { "value": "red" }
  },
  ...
}
```

#### Datum

`datum` defines a value on the _domain_ of the scale used on the channel. Thus,
the scale transformation will be applied.

```json
{
  "encoding": {
    "color": { "datum": "important", "type": "ordinal" }
  },
  ...
}
```

#### Chrom and Pos

See [Genomic Coordinates](../genomic-coordinates.md).

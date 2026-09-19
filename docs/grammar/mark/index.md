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
  "mark": "rect"
}
```

## Properties

Marks also support various properties for controlling their appearance or
behavior. The properties can be specified with an object that contains at least
the `type` property:

```json title="Example: Specifying the mark type and additional properties"
{
  "mark": {
    "type": "rect",
    "cornerRadius": 5
  }
}
```

A mark property applies to every mark instance rendered by that mark. Many
properties also accept an [expression reference](../expressions.md), allowing
the shared value to react to parameters or the viewport without making it
data-driven:

```json title="Example: Specifying a mark property with an expression reference"
{
  "mark": {
    "type": "point",
    "size": { "expr": "min(0.5 * pow(zoomLevel(), 1.5), 200)" }
  }
}
```

Explicit mark properties override defaults from
[config and styles](../config.md#mark-defaults). If an `encoding` specifies the
same visual channel, the encoding takes precedence over the mark property.
Mark-specific properties are documented on each mark's page.

### Shared properties

SCHEMA MarkConfig style cursor x y color opacity clip xOffset yOffset x2Offset y2Offset tooltip

## Encoding

While mark properties are shared by all rows rendered by a mark, `encoding`
maps data to [visual channels](#channels) and allows each mark instance to have
different visual properties.

Visual encoding channels can also be set as shared mark properties. Other mark
properties cannot be encoded because they do not meaningfully vary by row.

```json title="Example: Specifying visual channels with the encoding property"
{
  "mark": "rect",
  "encoding": {
    "x": {
      "field": "from",
      "type": "index"
    },
    "x2": {
      "field": "to"
    },
    "color": {
      "field": "category",
      "type": "nominal"
    }
  }
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

A discrete field, datum, or expression on an offset channel can create a
[nested offset scale](../scale.md#nested-offset-scales) for grouped marks.

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
: Depends on the mark. `"point"`: the area of the rectangle that encloses the
  mark instance. `"rule"` and `"link"`: stroke width. `"arrow"`: stem
  thickness. `"text"`: font size.

`shape`
: Shape of `"point"` marks.

`angle`
: Rotational angle of `"point"` and `"text"` marks.

`direction`
: Direction of `"arrow"` marks.

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

`order`
: Keeps selected instances visible above unselected ones. In a dense plot,
  highlighting a point or arc with a different color is not enough if other
  instances cover it. Give selected instances a higher order level to draw
  them last, bringing the highlighted instances to the foreground.
  The condition's `value` and the fallback `value` define two finite numeric
  levels; lower levels draw first. Use one selection parameter or a selection
  union in the condition. Relative order within each level is preserved.
  Equal levels and constant definitions have no ordering effect. When all
  referenced selections are empty, instances retain their original order.
  Ordering applies within one mark occurrence, and picking keeps the original
  order.

```json title="Draw selected points above unselected points"
{
  "params": [{ "name": "picked", "select": "point" }],
  "mark": "point",
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "y", "type": "quantitative" },
    "order": {
      "condition": { "param": "picked", "value": 1 },
      "value": 0
    }
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

`search`
: Exposes one or more fields to the GenomeSpy App's
  [search behavior](../../sample-collections/app-features.md#search).

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

Most scaled field, expression, and datum definitions require a `type` property.
Secondary position definitions such as `x2`, metadata channels, and some text
definitions do not. Value definitions do not use a data type because their
values already belong to the channel's visual range.

The available data types are `"quantitative"`, `"nominal"`, `"ordinal"`,
`"index"`, and
[`"locus"`](../genomic-coordinates.md#encoding-genomic-coordinates). The first
three are equivalent to the [Vega-Lite
types](https://vega.github.io/vega-lite/docs/type.html) of the same name.

#### Field

`field` maps a field (or column) of the data to a visual channel.

```json
{
  "encoding": {
    "color": { "field": "significance", "type": "ordinal" }
  }
}
```

#### Expression

`expr` applies an [expression](../expressions.md) before passing the value for
a scale transformation.

```json
{
  "encoding": {
    "color": { "expr": "datum.score > 10", "type": "nominal" }
  }
}
```

#### Value

`value` defines a value on channel's _range_, skipping the scale transformation.

```json
{
  "encoding": {
    "color": { "value": "red" }
  }
}
```

#### Datum

`datum` defines a value on the _domain_ of the scale used on the channel. Thus,
the scale transformation will be applied.

```json
{
  "encoding": {
    "color": { "datum": "important", "type": "ordinal" }
  }
}
```

#### Common definition properties

Field, expression, and datum definitions can include a `scale` that maps data
values to visual values. Positional channels can include an `axis`, and other
scaled channels can include a `legend`. Set `scale`, `axis`, or `legend` to
`null` to disable it. See [Scales](../scale.md), [Axes](../axis.md), and
[Legends](../legend.md).

Use `title` to label an encoded field in guides and tooltips, and `format` to
format numeric labels and text. On position definitions, `band` selects a
relative position within a scale band: `0` is the beginning, `0.5` the center,
and `1` the end.

Definitions can also include `condition` for interaction-driven values. See
[Conditional Encoding](../conditional-encoding.md).

#### Chrom and Pos

See [Genomic Coordinates](../genomic-coordinates.md).

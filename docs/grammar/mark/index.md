# Marks

![Marks](../../img/block-mark.svg){align="right" style="width: 30%"}

In GenomeSpy, visualizations are built from marks, which are geometric shapes,
such as points, rectangles, and lines, that represent data objects (or rows in
tabular data). These marks are mapped to the data using the `encoding` property,
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

While mark properties are static, _i.e._, same for all mark instances, `encoding`
allows for mapping data to the visual channels.

It's worth noting that while all visual encoding channels are also available as
static properties, not all properties can be used for encoding. Only certain
properties are suitable for encoding data in a meaningful way.

```json title="Example: Using of the encoding property"
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

The schematic example above uses the `"rect"` mark to represent the data objects.
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

Some marks, such as `"rect"` and `"rule"`, also support secondary positional channels,
which allow specifying a range that the mark should cover in the visualization.

`x2`
: The secondary position on the _x_ axis

`y2`
: The secondary position on the _y_ axis

#### Other channels

`color`
: Color of the mark. Affects `fill` or `stroke`, depending on the `filled` property.

`fill`
: Fill color

`stroke`
: Stroke color

`opacity`
: Opacity of the mark. Affetcts `fillOpacity` or `strokeOpacity`, depending on the `filled` property.

`fillOpacity`
: Fill opacity

`strokeOpacity`
: Stroke opacity

`strokeWidth`
: Stroke width in pixels

`size`
: Depends on the mark. `point`: the area of the rectangle that encloses the mark instance. `rule`: stroke width. `text`: font size.

`shape`
: Shape of `point` marks.

`angle`:
: Rotational angle of `point` marks.

`text`
: Text that the `text` mark should render for a text mark instance.

#### Channels for sample collections

The [GenomeSpy app](../../sample-collections/visualizing.md#specifying-a-sample-view) supports an additional channel.

`sample`
: Defines the track for the sample

### Visual Encoding

GenomeSpy provides several methods for controlling how data is mapped to visual
channels. The most common method is to map a field of the data to a channel, but
you can also use expressions, values, or data values from the domain of a scale.

#### Field

`field` maps a field (or column) of the data to a visual channel. The `field`
property specifies the data type, which is one of: `"quantitative"`,
`"nominal"`, or `"ordinal"`, `"index"`, or `"locus"`.

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

See [Working with Genomic Data](../../genomic-data/genomic-coordinates.md).

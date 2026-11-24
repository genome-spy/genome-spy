# Raster

The raster mark draws one regular grid of cells per data record. Each record is
a **tile**. Use tiles for dense data such as contact maps, sequence alignments,
or decoded images.

EXAMPLE examples/docs/grammar/mark/raster/raster-mark.json height=190

## Tile format

The example above uses this datum as its sole `data.values` entry.

```json
{
  "dimensions": {
    "column": { "origin": 10, "step": 2, "count": 3 },
    "row": { "origin": 0, "step": 1, "count": 2 }
  },
  "fields": { "value": [1, 2, 3, 4, 5, 6] }
}
```

The record's `dimensions` object describes each grid axis by name.

| Property | Meaning                                                  |
| -------- | -------------------------------------------------------- |
| `origin` | The first cell edge in data coordinates                  |
| `step`   | The positive spacing between cell edges in data units    |
| `count`  | The positive integer number of cells along the dimension |

Cell `i` starts at `origin + i * step` and ends at `origin + (i + 1) * step`,
with indices starting at zero. In the example, `column` covers `[10, 12)`,
`[12, 14)`, and `[14, 16)`. Locus dimensions use
[linearized genomic coordinates](../genomic-coordinates.md). A locus dimension
with `step: 1000` gives cells that cover 1 kb each.

Put cell values in named arrays under `fields`. Each array has one entry per
cell, in row-major order. For a tile with three columns and two rows, the first
three entries are the first row and the next three are the second.

## Channels

Bind `x` and `y` to named grid dimensions using `dimension`. The mark derives
the cell edges from the tile. Grid dimensions support linear, index, and locus
scales. Use unpadded index and locus scales without grouping gaps.

The `color` channel's `field` names a cell array under `fields`. Quantitative
fields use a numeric color scale. Categorical fields use an ordinal color scale
with an explicit domain. For decoded images, set `color.scale` to `null` and
supply one packed RGBA8 value per cell in `0xAABBGGRR` order. Use straight alpha
and write the packed integers in decimal in JSON. In JavaScript, numeric cell
fields can use `Float32Array`, and packed images can use `Uint32Array`.

The `opacity` channel accepts values. Both `color` and `opacity` support
[cell-level selection conditions](../conditional-encoding.md#raster-cells).
Scaled rasters show cell values and tile attributes on hover. Packed RGBA8
images skip picking by default. Set `mark.tooltip` to `{ "handler": "default" }`
to enable image tooltips, or set it to `null` to disable picking.

## Properties

SCHEMA RasterProps

## Examples

### Sequence strips

For a horizontal strip, bind `x` to a grid dimension and `y` to a categorical
field on a band scale. Swap the axes for vertical strips. The band field is a
top-level field of the tile record. A sequence such as `"ACTG"` can supply the
categorical cell values, with one character per cell.

EXAMPLE examples/docs/grammar/mark/raster/sequence-strips.json height=135

### Triangle tracks

Contacts between distinct loci appear on both sides of a symmetric matrix's
diagonal. The triangle projection rotates one half by 45° and fits its diagonal
to a single genomic axis. The diagonal becomes the track baseline, so the
contact map can share its axis with tracks such as gene annotations.

![The same contact and outlined tile in the matrix and the triangle track. A hollow dot marks the tile origin in both views.](../../img/raster-triangle-projection.svg)

The highlighted contact sits horizontally at the midpoint between A and B.
Its height above the baseline is half the distance between them, measured
using the same scale as the horizontal axis. Short-range contacts sit near
the baseline, and long-range contacts appear higher up.

#### Tile placement

A tile's `column` and `row` origins locate one corner in the original matrix,
marked by the hollow dot in the figure. The same midpoint and distance rule
places that corner in the track. For example, origins at 20 Mb and 30 Mb put
the corner above 25 Mb, at a height equal to the width of 5 Mb on the locus
scale.

Each dimension ends at `origin + step * count`. The mark projects all four
corners from the starts and ends of the two dimensions. A square tile
becomes a diamond, as shown by the dark outline. Tiles that cross the matrix
diagonal are clipped at the baseline. The top of the track also clips tiles,
so zooming in shows a shorter range of contact distances at the same height.

Set the mark's `projection` to `"triangle"` and bind `x` to the column
dimension with `type: "locus"`. Omit `y`. The mark reads the other axis from
`dimensions.row` and uses the same locus scale for both dimensions.
The [HiGlass triangle track example](../data/lazy.md#triangle-track) shows the
projection with tiles loaded on demand.

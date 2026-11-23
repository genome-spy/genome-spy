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

The `opacity` channel accepts values and
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

Set the mark's `projection` to `"triangle"` and bind `x` to a locus dimension.
The second tile dimension must be named `row`. The
[HiGlass examples](../data/lazy.md#higlass) show how to load tiles for both
rectangular contact maps and triangle tracks.

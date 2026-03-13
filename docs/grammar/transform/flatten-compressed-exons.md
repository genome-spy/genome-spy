# Flatten Compressed Exons

The `"flattenCompressedExons"` transform expands a compact exon encoding into
one datum per exon.

It reads the transcript start coordinate from `start` and parses `exons` as
alternating segment lengths in `gap, exon, gap, exon, ...` order. The first gap
is typically `0`, so the first exon begins at `start`.

Each output row is a clone of the input datum with added exon interval fields.
By default, these are `exonStart` and `exonEnd`.

This transform is mainly intended to be used with an optimized gene annotation
track. Read more at [Annotation
Tracks](https://observablehq.com/@tuner/annotation-tracks?collection=@tuner/genomespy)
notebook.

## Parameters

SCHEMA FlattenCompressedExonsParams

## Example

Given the following input data:

| transcript | start | exons            |
| ---------- | ----- | ---------------- |
| TX1        | 1000  | `0,80,40,60,30,50` |

... and the transform:

```json
{
  "type": "flattenCompressedExons"
}
```

The `exons` string is interpreted as:

| Segment | Meaning                    | Result          |
| ------- | -------------------------- | --------------- |
| `0`     | Gap from `start` to exon 1 | exon 1 starts at `1000` |
| `80`    | Length of exon 1           | exon 1 ends at `1100` |
| `40`    | Gap to exon 2              | exon 2 starts at `1140` |
| `60`    | Length of exon 2           | exon 2 ends at `1200` |
| `30`    | Gap to exon 3              | exon 3 starts at `1230` |
| `50`    | Length of exon 3           | exon 3 ends at `1280` |

Flattened data is produced:

| transcript | start | exons            | exonStart | exonEnd |
| ---------- | ----- | ---------------- | --------- | ------- |
| TX1        | 1000  | `0,80,40,60,30,50` | 1000      | 1100    |
| TX1        | 1000  | `0,80,40,60,30,50` | 1140      | 1200    |
| TX1        | 1000  | `0,80,40,60,30,50` | 1230      | 1280    |

# Nested category distribution in the annotated matrix

Status: acceptance example for the authorized recursive surround increment.
Implementation is in progress. The existing flat categorical example will be
migrated in the nested-alignment milestone. See [the nesting design](surround-nesting.md) for
the implementation contract and milestones.

## Required result

Extend `examples/docs/grammar/composition/surround/annotated-matrix.json` with
one vertical stacked bar above the right metadata strip. It summarizes the
three metadata rows: Alpha = A, Beta = B, Gamma = A. A occupies two thirds of
the bar (66.7%) and B one third (33.3%). An axis on the bar's right shows
0%, 50%, and 100%.

The metadata strip retains its right-hand Alpha/Beta/Gamma axis and the matrix's
row coordinates. The distribution has its own quantitative percentage y scale.
Both use one category color scale and one Category legend; the matrix's
quantitative Value scale and legend remain separate. The distribution and
column totals fit beside each other above the matrix, without stacking their
headroom reservations.

## Proposed specification

Replace the current `surround.right[0]` with the following nested surround when
runtime nesting is implemented. Keep the rest of the categorical example,
including its explicit band domains, matrix bottom axis, and outer collected
legends. This is a future specification, not an example accepted by the current
flat-slot runtime guard.

```json
{
  "name": "rowMetadata",
  "spacing": 8,
  "data": {
    "values": [
      { "row": "Alpha", "category": "A" },
      { "row": "Beta", "category": "B" },
      { "row": "Gamma", "category": "A" }
    ]
  },
  "resolve": { "scale": { "color": "shared" } },
  "scales": { "color": { "type": "ordinal", "domain": ["A", "B"] } },
  "encoding": {
    "color": {
      "field": "category",
      "type": "nominal",
      "legend": { "title": "Category" }
    }
  },
  "spec": {
    "name": "category",
    "width": 14,
    "mark": "rect",
    "encoding": {
      "y": {
        "field": "row",
        "type": "nominal",
        "axis": { "orient": "right", "title": null }
      }
    }
  },
  "surround": {
    "top": {
      "resolve": { "scale": { "color": "shared" } },
      "views": [
        {
          "name": "categoryDistribution",
          "height": 60,
          "transform": [
            {
              "type": "aggregate",
              "groupby": ["category"],
              "fields": ["row"],
              "ops": ["count"],
              "as": ["count"]
            },
            {
              "type": "stack",
              "field": "count",
              "groupby": [],
              "sort": { "field": "category", "order": "ascending" },
              "offset": "normalize",
              "as": ["start", "end"]
            }
          ],
          "mark": "rect",
          "encoding": {
            "y": {
              "field": "start",
              "type": "quantitative",
              "scale": { "domain": [0, 1], "zoom": false },
              "axis": {
                "orient": "right",
                "title": null,
                "format": ".0%",
                "values": [0, 0.5, 1]
              }
            },
            "y2": { "field": "end" }
          }
        }
      ]
    }
  }
}
```

Declare metadata once on the nested surround. Its center consumes the original
three rows; only the top branch aggregates and normalizes them. Count metadata
rows rather than the nine matrix cells, and derive proportions through the
existing aggregate/stack transforms rather than hardcoding them. Explicit
category sorting puts A at the bottom and B at the top of the stack.

Color sharing is configured on both the nested surround and its implicit top
concat. Under the proposed one-container side construction, resolution can
ascend through that concat to the nested category scale. Positional boundaries
must not block color or legend sharing. Verify actual resolution identity,
rather than accepting two independent scales with coincidentally equal colors.

Neither metadata nor distribution encodes x: each rectangle uses the 14-pixel
plot width. They align geometrically without inventing an x scale, and must not
inherit the matrix's One/Two/Three scale as a navigation target. Outer row y
participation is exported by the nested center only; the top chart's percentage
y remains local, including its secondary `y2` encoding and right axis.

## Geometry and corner occupancy

Ignoring external axes, legends, and padding, the current plot dimensions give
the following target rectangles. Coordinates use a top-left origin; actual
guide measurement may add enclosing chrome while preserving plot alignment.

| Plot/content footprint      |   x |   y | Width | Height |
| --------------------------- | --: | --: | ----: | -----: |
| Complete composition        |   0 |   0 |   280 |    188 |
| Matrix                      |  78 |  68 |   180 |    120 |
| Column totals               |  78 |   0 |   180 |     60 |
| Row totals                  |   0 |  68 |    70 |    120 |
| Metadata strip              | 266 |  68 |    14 |    120 |
| Category distribution       | 266 |   0 |    14 |     60 |
| Nested metadata composition | 266 |   0 |    14 |    188 |

Both upper plots need 60 + 8 pixels above the shared row anchor, so headroom is
`max(68, 68) = 68`, not 136. Matrix and metadata share the same 120-pixel row
interval. The two top plots are horizontally separated by the existing
8-pixel surround gap. The percentage axis uses the distribution's own vertical
interval and its right edge; the row axis uses the metadata strip's interval.
Reserve each guide normally and keep 0%/100% labels inside the enclosing bounds.

Use the compact layout as the positive corner-occupancy case. For a negative
case, give the outer column-summary board its own right-hand structural panel
whose footprint intersects the category distribution. Reject the collision
with a located error naming the views. Do not move panels automatically or
reject harmless overlap between composite bounding boxes containing empty space.

## Acceptance and verification

- Collector output has A count 2, B count 1, and normalized intervals
  `[0, 2/3]` and `[2/3, 1]`. The metadata strip still renders three rows and the
  central matrix nine cells. There are two primary data sources in total.
- Matrix and strip share one row resolution and pixel interval. The percentage
  resolution is distinct from matrix rows and column-total measurements. Its
  right axis references that local scale and shows 0%, 50%, and 100%.
- Category marks share one color resolution and Category legend, with matching
  colors in the stack and strip. The Value legend remains independent.
- Assert plot alignment and maximum headroom in headless layout. Check stack
  proportions, categorical labels, percentage labels, local axis spans, and
  collected legends in structured SVG; inspect browser WebGL/Canvas output
  for clipping, picking/hover, and resizing.
- Hiding the distribution retains headroom required by column totals. Hiding
  column totals retains headroom required by the distribution. Hiding both
  collapses their structural headroom. Hiding the nested center hides its whole
  surround. These assertions exclude remaining guide/padding reservations.
- Interacting above the strip must not navigate matrix rows or columns; the
  percentage scale is not zoomable. Keep the separate continuous-x fixture in
  the nesting design to verify legitimate local measurement navigation.
- Verify clear rejection of colliding structural panels, and preserve the flat
  example's categorical axes and existing explicit overhang behavior.

These are future acceptance criteria. Schema validation alone does not establish
runtime support or successful rendering of the nested specification.

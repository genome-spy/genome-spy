# Surround Composition

The `surround` operator aligns marginal plots with a central plot. It is useful
for annotated heatmaps, UpSet matrices, and plots with row or column summaries.
Tracks share the center's coordinates while retaining their own measurement
scales, data, and decorations.

The central plot goes in `spec`. The optional `top`, `right`, `bottom`, and `left`
groups go inside `surround`. Each group accepts an array of plots or an object
with `views` and shared view settings.

EXAMPLE examples/docs/grammar/composition/surround/annotated-matrix.json

```json
{
  "data": { "values": [{ "column": 0, "row": 0, "total": 5 }] },
  "spec": {
    "width": 160,
    "height": 100,
    "mark": "rect",
    "encoding": {
      "x": { "field": "column", "type": "index", "axis": null },
      "y": { "field": "row", "type": "index", "axis": null }
    }
  },
  "surround": {
    "right": [
      {
        "width": 80,
        "mark": "rect",
        "encoding": {
          "x": { "field": "total", "type": "quantitative" },
          "y": { "field": "row", "type": "index", "axis": null }
        }
      }
    ]
  }
}
```

## Alignment and sizing

Top and bottom tracks share the center's x scale and stack vertically. Left and
right tracks share its y scale and stack horizontally. Tracks are ordered
top-to-bottom or left-to-right, including on the top and left sides.

The center determines the aligned plotting width and height. Set only a side
track's thickness: `height` on top/bottom, or `width` on left/right. Fixed,
growing, and step-based center sizes use the existing [sizing rules](concat.md#child-sizing).
The surround's own width and height describe the complete composition.

The surround's `spacing` separates the center from its sides. A side group's
`spacing` separates its tracks. Both default to 10 pixels. Hidden tracks collapse;
an empty or entirely hidden side also removes its gap. Hiding the center hides
the composition.

Track axes and other decorations can extend into empty corner cells when a
visible neighboring side provides room. Any excess still reserves space, so
decorations stay within the composition. If two sides compete for one corner,
the top or bottom track takes priority. Explicit `overhang: { left: true }`
(or another edge) keeps that edge's reservation; `false` removes it as usual.
Automatic corner reuse preserves padding.

## Shared settings and scales

Outer data, transforms, encodings, and parameters flow to the center and sides.
A side object can declare these settings once for its `views`, such as a shared
metadata table for several annotation columns. Center-local settings apply only
to the center. Children can override inherited data normally.

Each track has an independent perpendicular scale by default. A group's `resolve`
can share those local scales among its tracks. They remain separate from the
center and the opposite side. Non-positional scales also remain independent
by default.

Shared coordinate domains include contributions from the participating plots.
Outer `scales.x` and `scales.y` can set authoritative domains, order, reversal,
grouping gaps, and zoom settings. An aligned scale cannot be disconnected with
an independent or excluded resolution.

Configure axes on the center or individual tracks. Redundant aligned axes can
be suppressed with `axis: null`. Titles, padding, clipping, and legends use their
ordinary settings. [Collected legends](index.md#collected-legends) can combine
independent legends around the complete surround.

## Nested annotations

Side tracks can themselves use `surround`. The parent aligns a nested track's
central plotting interval, leaving room for its own annotations. In the example
above, the mutation matrix shares the expression matrix's sample rows. Its
stacked summaries share its TP53/PIK3CA column scale and use a separate percentage
scale and a right-hand axis. The tumor expression and mutation data are synthetic.

Declare shared data on the nested surround so the matrix and summaries use the
same metadata source. To share mutation-status colors and a legend, set
`resolve.scale.color` to `"shared"` on both the nested surround and its top group.
The example counts mutation statuses per gene and normalizes their stacked
counts.

Omit the externally aligned size from the nested center: `height` on left/right,
or `width` on top/bottom. The outer center supplies that plotting length. Nested
annotations extending along that dimension need fixed or step-based thicknesses.
The outer center and ordinary perpendicular track thicknesses can still grow.

Nested panels can occupy free corner space beside other regions. The layout
reserves their maximum outward extent, rather than adding the heights or widths
of panels that fit beside each other. Overlapping occupied panels cause an error
naming the conflicting views; adjust spacing or composition to separate them.
Suppressing chrome overhang does not remove space occupied by nested panels.

## Supported plots

The center accepts unit plots, layers, multiscale layers, and imports resolving
to these. Side tracks also accept nested surrounds. Nested centers, authored
concats, and facets remain unsupported. Scrollable viewports, surround-level
axes, and axes shared across regions are also unsupported. Input-owning selections and
rulers belong on the individual plots; ordinary outer parameters remain valid
shared values and `push: "outer"` targets.

## Properties

SCHEMA SurroundSpec spec surround spacing

### Side groups

SCHEMA SurroundSideSpec views spacing

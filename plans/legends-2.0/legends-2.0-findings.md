# Legends 2.0: placement findings

GenomeSpy uses Vega-compatible legend concepts, but legend placement is an
independent implementation built around GenomeSpy's view hierarchy and flex
layout. Vega-Lite is different: it chooses legend properties and resolution at
compile time, emits Vega legends, and delegates their final placement to Vega's
scenegraph layout.

This document records the observed similarities and differences. It does not
propose a design or implementation plan.

## Sources and provenance

The comparison is based on these checked-out revisions:

- GenomeSpy's current implementation on this branch, principally
  [`legendLayout.js`](../../packages/core/src/view/gridView/legendLayout.js),
  [`gridChildLegends.js`](../../packages/core/src/view/gridView/gridChildLegends.js),
  [`legendView.js`](../../packages/core/src/view/legendView.js), and
  [`gridView.js`](../../packages/core/src/view/gridView/gridView.js).
- Vega revision
  [`c03b7d0`](https://github.com/vega/vega/tree/c03b7d0fe369be1a6e81d23dc899aef6eb7da967),
  particularly its
  [legend layout](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-view-transforms/src/layout/legend.js),
  [view layout](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-view-transforms/src/ViewLayout.js),
  and
  [legend defaults](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-parser/src/config.js).
- The checked-out Vega-Lite fork at revision
  [`f0e76df`](https://github.com/tuner/vega-lite/tree/f0e76dfc7efa720817249f612f66599e2ca5ead4),
  particularly its
  [legend property rules](https://github.com/tuner/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/compile/legend/properties.ts),
  [legend parsing and resolution](https://github.com/tuner/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/compile/legend/parse.ts),
  and
  [legend assembly](https://github.com/tuner/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/compile/legend/assemble.ts).

Vega and Vega-Lite use compatible three-clause BSD licenses. No upstream code
is copied in this document.

## Shared concepts

GenomeSpy, Vega, and Vega-Lite share the following placement concepts:

- `left`, `right`, `top`, and `bottom` place legends outside the plot.
- Corner orientations place legends inside the plot.
- The default orientation is `right`.
- Legends with the same orientation are collected into a common region.
- The effective region offset is the maximum offset among its legends.
- An external legend sharing a side with an external axis is placed outside
  that axis.

GenomeSpy also inherits many Vega defaults: right orientation, an 18 px plot
offset, zero internal padding, 10 px column padding, 2 px row padding, and the
same principal label, symbol, and title defaults. GenomeSpy expresses the 18 px
offset as a default on every legend, whereas Vega expresses it as a default on
the containing orientation-group layout. Their default visible placement is
equivalent in this case.

## Placement architecture

### Vega

Vega measures the rendered legend scenegraph, groups legend items by
orientation, and runs its generic grid layout for each orientation group. The
group anchor is calculated against bounds that already include the applicable
axes and other guides. Resulting legend bounds then participate in view
autosizing.

For `autosize: fit`, Vega incorporates only the legend's perpendicular extent.
This prevents a long legend from reducing the plot's parallel dimension to
nothing; the parallel overflow may instead be clipped.

### Vega-Lite

Vega-Lite is not a separate placement engine. It determines legend
orientation, entry direction, gradient length, merging, and shared versus
independent resolution during compilation. It then emits Vega legend
definitions, leaves Vega-compatible legend layout configuration in the compiled
config, and relies on Vega for final scenegraph placement.

When composing views, Vega-Lite initially attempts to merge shared legend
components. If properties such as explicitly specified orientations conflict,
it falls back to independent child legends.

### GenomeSpy

GenomeSpy creates an explicit `LegendRegionView` for each active orientation.
External regions contribute perpendicular overhang to grid and flex sizing.
Their parallel minimum or flexible size constraints also participate in the
containing grid's dimensions. Corner regions are overlaid inside the plot and
do not contribute external overhang.

Local legends are owned by a `GridChild` and positioned relative to that
child's viewport. Shared legends are owned by the enclosing `GridView` and are
positioned around the complete child grid. Matching local and shared axes are
passed into legend placement so that the axis remains adjacent to the plot and
the legend moves outside it.

## Multi-legend region direction

Vega has a region-level layout direction distinct from the direction of entries
inside an individual legend. Its defaults arrange:

- Left and right legend regions vertically.
- Top, bottom, and corner legend regions horizontally.
- Legends with an 8 px inter-legend margin.

The direction, margin, anchor, centering, and bounds policy can be overridden
globally or for an individual orientation through `config.legend.layout`.

GenomeSpy constructs every legend region using `vconcat`. Multiple legends are
therefore stacked vertically for all orientations:

- Side legends resemble Vega's default.
- Top and bottom legends form multiple rows instead of appearing side by side.
- Multiple corner legends also form a vertical stack.

GenomeSpy's default inter-legend spacing is 10 px. The track-bottom style uses
3 px. A region takes its spacing from the first legend that creates it, so
different per-legend spacing values in one region do not define independent
gaps.

This difference concerns the arrangement of multiple complete legends, not the
arrangement of entries inside one legend.

## Individual legend entry direction

GenomeSpy and raw Vega default individual legend entries to vertical regardless
of placement orientation.

Vega-Lite adds orientation-sensitive defaults:

- Top and bottom legends use horizontal entries.
- Left and right legends use vertical entries.
- Corner gradient legends use horizontal entries.
- Corner symbol legends use vertical entries.

Consequently, a bottom legend is vertical in raw Vega and GenomeSpy but
horizontal when generated by Vega-Lite. GenomeSpy's track-bottom style changes
the orientation, title orientation, spacing, and offset, but it does not change
the entry direction.

## Region alignment and packing controls

Vega orientation groups support:

- Start, middle, and end anchors.
- Horizontal or vertical group direction.
- Configurable inter-legend margin.
- Optional centering within rows and columns.
- Flush or full bounds for packing.
- Per-orientation configuration overrides.

GenomeSpy has no equivalent public region-level controls. Side regions begin at
the plot's parallel start unless flexible content fills the available extent.
Corner regions are anchored directly to the selected inside corner.

## Free placement

Vega supports `orient: "none"` together with `legendX`, `legendY`, or custom
legend-group encodings. Such legends retain their authored coordinates and are
excluded from automatic orientation-group placement.

Vega-Lite exposes the same mechanism through `orient: "none"` and legend
container encoding.

GenomeSpy supports only four external sides and four internal corners. It does
not support `orient: "none"`, explicit legend coordinates, or arbitrary legend
container encodings.

## Dynamic placement

Vega accepts signal-backed orientation and position properties, allowing
runtime dataflow to trigger placement changes.

Vega-Lite restricts legend orientation and direction to static values.

GenomeSpy accepts an expression reference for orientation but resolves it only
during initialization. A reactive orientation change is rejected because it
would require moving the legend to a different region. Other properties, such
as disabling a legend, can be reactive and trigger layout reflow.

## Sizing and overflow

Vega derives placement and autosize contributions from measured scenegraph
bounds. Its fit-mode exception deliberately ignores parallel legend overflow
when adjusting the plot.

GenomeSpy models external thickness as overhang and models the parallel extent
as a flex constraint. It can grow the surrounding composition to satisfy fixed
legend minima. Flexible side gradients fill the available viewport extent
without independently causing the grid to grow to the browser height.

The models can produce different results for long legends, constrained
containers, nested compositions, or fit-like layouts.

## Resolution and composition

Vega places legends in whichever group contains them. Vega-Lite decides which
group during compilation: compatible shared legends are raised and merged;
incompatible ones remain independent in child groups.

GenomeSpy determines ownership through its runtime resolution hierarchy. It
also provides `excluded` and `forced` resolution behaviors in addition to
`shared` and `independent`. Some conflicting view-level and encoding-level
legend declarations fail fast rather than causing an automatic fallback to
independent legends.

## Ordering

Vega retains emitted scenegraph or specification order within each orientation
group.

GenomeSpy explicitly orders legend definitions by depth-first view order, then
case-insensitive title, field, or channel label, and finally by channel name.

## Summary of differences

| Area | Vega | Vega-Lite | GenomeSpy |
| --- | --- | --- | --- |
| Final placement engine | Vega scenegraph layout | Vega scenegraph layout | GenomeSpy flex/grid layout |
| Default side | Right | Right | Right |
| Multiple left/right legends | Vertical | Vega default: vertical | Vertical |
| Multiple top/bottom legends | Horizontal | Vega default: horizontal | Vertical |
| Multiple corner legends | Horizontal | Vega default: horizontal | Vertical |
| Default entries at top/bottom | Vertical | Horizontal | Vertical |
| Region layout controls | Anchor, direction, margin, centering, and bounds | Passed through to Vega config | None |
| Arbitrary placement | `orient: "none"`, coordinates, or encoding | Compiles to Vega | Not supported |
| Runtime orientation | Signal-backed | Static | Expression resolved at initialization |
| External size contribution | Measured scenegraph bounds | Delegated to Vega | Explicit overhang and flex constraints |
| Shared placement | Determined by containing Vega group | Compile-time merge and group ownership | Runtime resolution and `GridView` ownership |
| Legend order | Emitted order | Compiled order | Depth-first view order with label/channel tie-breakers |

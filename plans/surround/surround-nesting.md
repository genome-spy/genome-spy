# Surround: resolution boundaries and nested alignment

Status: authorized and in progress. Resolution/alignment contracts and the
revised categorical/corner design have been reviewed. The one-container side
scope is implemented and verified; nested alignment follows in milestone 5.

## Goal and scope

Extend the categorical annotated matrix with a stacked A/B distribution above
its right metadata strip and a percentage axis on the distribution's right.
[The acceptance design](surround-annotated-matrix.md) specifies its data,
schema, guide placement, compact corner geometry, and verification. Use this
case to replace wrapper plumbing with a coherent resolution boundary
and define the alignment contract needed for recursive composition. Retain the
existing public `spec` / `surround` / `views` schema and both migrated examples.

The next implementation increment should support nested surrounds in side
slots, with fixed or step-based structural insets along the externally aligned
axis. Growth of the outer center and ordinary perpendicular track thicknesses
remains supported. Growing structural insets, nested centers, compatible
authored concats, facets, spans, root axes, scrolling, and surround-owned input
controllers are separate extensions, not prerequisites of this worked case.

Architecture and code references are in [the main plan](surround-plan.md).
The [literature survey](surround-literature.md) distinguishes inner-plot
alignment targets from whole-figure layout and linked scales. The proposed
contracts draw on that distinction; no external implementation is copied.

## Additional resolution regression

The primary user-facing example is the categorical metadata distribution linked
above. It has constant x coordinates in the right region. Retain the following
continuous-x case to verify a nested local measurement scale and navigation;
the distribution example alone cannot protect that contract.

This specification describes proposed support. The current surround flat-slot
guard deliberately rejects it. `height` is omitted from the nested row bars:
their plotting height is imposed by the outer matrix, not by a total-footprint
height on the nested surround.

```json
{
  "padding": 0,
  "spacing": 8,
  "scales": {
    "x": { "name": "columns", "type": "index", "domain": [0, 2] },
    "y": { "name": "rows", "type": "index", "domain": [0, 2], "reverse": true }
  },
  "spec": {
    "name": "matrix",
    "width": 180,
    "height": 120,
    "data": {
      "values": [
        { "column": 0, "row": 0 },
        { "column": 1, "row": 1 },
        { "column": 2, "row": 2 }
      ]
    },
    "mark": "rect",
    "encoding": {
      "x": { "field": "column", "type": "index", "axis": null },
      "y": { "field": "row", "type": "index", "axis": null }
    }
  },
  "surround": {
    "right": {
      "name": "rowStatistics",
      "data": {
        "values": [
          { "row": 0, "total": 5 },
          { "row": 1, "total": 15 },
          { "row": 2, "total": 10 }
        ]
      },
      "views": [
        {
          "name": "rowSummary",
          "spacing": 8,
          "scales": {
            "x": {
              "name": "totals",
              "type": "linear",
              "domain": [0, 20],
              "zoom": true
            }
          },
          "spec": {
            "name": "rowBars",
            "width": 80,
            "mark": "rect",
            "encoding": {
              "x": { "field": "total", "type": "quantitative", "axis": null },
              "y": { "field": "row", "type": "index", "axis": null }
            }
          },
          "surround": {
            "top": [
              {
                "name": "distribution",
                "height": 40,
                "transform": [
                  {
                    "type": "aggregate",
                    "groupby": ["total"],
                    "fields": ["row"],
                    "ops": ["count"],
                    "as": ["count"]
                  }
                ],
                "mark": "point",
                "encoding": {
                  "x": {
                    "field": "total",
                    "type": "quantitative",
                    "axis": null
                  },
                  "y": {
                    "field": "count",
                    "type": "quantitative",
                    "axis": null,
                    "scale": { "domain": [0, 3], "zoom": false }
                  }
                }
              }
            ]
          }
        }
      ]
    }
  }
}
```

There are four positional scale identities:

| Scale                               | Participants             | Does not include  |
| ----------------------------------- | ------------------------ | ----------------- |
| Outer columns, index `[0, 2]`       | Matrix x                 | Row totals x      |
| Outer rows, reversed index `[0, 2]` | Matrix y and row-bars y  | Summary count y   |
| Local totals, linear `[0, 20]`      | Row-bars x and summary x | Matrix x          |
| Local count, linear `[0, 3]`        | Summary y                | Matrix/row-bars y |

Matrix and row bars share both the y resolution and its pixel interval. Row
bars and their summary share both the local x resolution and its pixel
interval. The right side's source is declared once; the summary derives its
counts from that source. No scale-domain copying or duplicated source is needed.

### Geometry without guide overhang

The summary requires 40 pixels plus an 8-pixel gap above the row-bars anchor.
The outer matrix imposes an anchor height of 120. Thus the nested footprint is
168 pixels high, and the outer center needs 48 pixels of headroom as well.

| View                        |   x |   y | Width | Height |
| --------------------------- | --: | --: | ----: | -----: |
| Complete outer composition  |   0 |   0 |   268 |    168 |
| Matrix plotting rectangle   |   0 |  48 |   180 |    120 |
| Complete nested surround    | 188 |   0 |    80 |    168 |
| Row-bars plotting rectangle | 188 |  48 |    80 |    120 |
| Summary plotting rectangle  | 188 |   0 |    80 |     40 |

With three reversed index rows, matrix and row-bar centers are both at y =
68, 108, and 148. The summary's x interval is the row bars' `[188, 268]`.
Changing outer center height to H gives total height H + 48 and preserves both
plots' y start and length. It does not stretch the matrix across the summary.

### Observed baseline, not just a hypothetical limitation

A read-only headless probe on 2026-10-16 arranged the same matrix and current
flat nested surround as children of an ordinary shared-y hconcat. It used the
real `createHeadlessEngine` and `renderToLayout`, with no source changes.
All four scale relationships above were correct. However, the matrix occupied
`(0, 0, 180, 168)` and the row bars occupied `(188, 48, 80, 120)`.
Ordinary concat aligned the complete footprints and stretched the matrix.
Correct scale identity therefore does not establish correct pixel projection.
The proposed geometry above is a design calculation, not a successful nested
surround render on the current implementation.

## One side container and one resolution boundary

Replace the generated excluded concat around each side's authored concat with
an internal boundary on that authored concat. A boundary on channel c means:

1. Resolve normally within the group. Independent child scales stay independent;
   explicit local sharing still shares. Do not change public `excluded` semantics.
2. Resolution ownership may ascend to this group, but not above it on c, even
   when a descendant requests `forced` resolution.
3. Ancestor lookup checks this group's own resolution and then stops on c.
4. An ancestor's scale/axis declaration traversal prunes this group on c.
   A traversal originating at the group still sees its internal resolutions.

Apply the boundary to x on left/right groups and y on top/bottom groups. In the
example, the outer right group's x boundary keeps totals local, and the nested
top group's y boundary keeps count local. The other channel crosses normally.

This requires consistent changes to `resolutionPlanner.getResolutionView`,
`View.getScaleResolution/getAxisResolution`, and the descendant collection in
`viewLevelScaleProps` and `viewLevelGuideProps`. Updating only ascent and lookup
would leave outer `scales.x/y` declarations ambiguous. Non-positional scales,
legend collection, data/parameter inheritance, and ordinary concat resolution
must retain their current behavior. Use one internal option, not a new public
resolution enum or a surround-only navigation filter.

Factory creation, import-origin tracking, authored names, lazy initialization,
and group visibility remain on the surviving concat. Array shorthand remains
non-addressable. The source/parameter scope of an object group remains ordinary.
Preserve perpendicular shared scale/axis identity and configuration, but correct
the current wrapper's misleading physical axis placement. For two right tracks
of widths 30 and 40 with shared local x and axis.x, the current boundary draws
one axis over their combined 80-pixel footprint (including a 10-pixel gap).
The new single hconcat should use ordinary per-column guide occurrences: one
axis over each track's own 30/40-pixel x interval, referencing the shared local
scale/configuration. A midpoint tick must fall at each plot midpoint. Apply the
corresponding per-row rule to top/bottom groups. This is an intentional guide
placement correction in the unreleased feature, not exact pixel equivalence.

## An alignment interval and its structural insets

Keep ordinary `getSize/getViewportSize` as full-footprint APIs, and `getOverhang`
as external chrome. Do not redefine overhang to include nested plots. The
existing post-layout `getTrackPlotGeometry()` is insufficient for measurement.

Introduce a small internal per-channel alignment description, derived from the
view hierarchy and cached through the existing size invalidation lifecycle:

- The plotting interval's size requirement using the existing `SizeDef`.
- Fixed before/after structural insets between that interval and the view's
  content footprint. These include nested panels, gaps, and internal guide space.
- The exposed scale resolution, or no participant for a constant-coordinate plot.

External chrome remains separately available through ordinary guide measurement.
After arrangement, expose the actual interval for geometry validation. Avoid a
second persistent participant registry, named-port schema, or occurrence graph.

Unit/layer plots expose their plotting interval. A nested surround exposes its
center's interval; it validates its own margins locally. The parent checks only
the interval and scale exposed by each direct track. It must not require every
descendant of `rowSummary` to use the outer y scale: the summary's count scale
is intentionally local. Layer validation must still catch disconnected aligned
leaf scales and secondary/remapped positional encodings; moving the validation
boundary must not silently weaken that existing contract.

The implicit side concat is itself an alignment participant. Its children must
share the imposed interval, not the complete footprint of the tallest child.
For example, adding ordinary row labels beside `rowSummary` must leave those
labels at y = 48 with height 120, rather than stretching them to 168. Mark this
generated concat with its internal aligned channel and use the same alignment
measurement/placement rule there. Deferring compatible _authored_ concats does
not remove this requirement from the generated side group.

For each edge, the group's structural extent is the maximum child structural
extent. Its total extent is the maximum child structural + chrome extent;
external group chrome is the excess of the latter over the former. Child
footprints are offset from the common anchor individually. Thus a neighboring
track's 32-pixel top axis can fit within the group's 48-pixel structural headroom
without changing the row anchor or becoming an additional external reservation.
An axis extending 64 pixels needs 16 pixels of external group chrome. Include
authored group padding/title chrome in the ordinary enclosing measurement.

Retain the existing distinction between view-owned chrome and parent-owned
GridChild axes/titles/legends. Both contribute to enclosing measurement, but
only view-owned chrome and structural insets compensate the view's own
placement. A Unit with a parent-hosted top axis still receives a 120-pixel plot
viewport, not an enlarged viewport containing that axis. Titles/legends remain
on their normal hosts, with normal footprint/padding semantics.

### Measurement and arrangement

1. Measure bottom-up, separating structural insets and external chrome. In the
   worked case the nested y insets are before = 48, after = 0.
2. Allocate the outer center's plotting width/height. Impose its y length on the
   nested center, overriding implicit theme sizing along that channel. Reject
   any explicitly authored aligned size at its actual declaration, matching
   the flat contract. Do not add equality checks for coincidentally matching sizes.
3. Reserve enough before/after space around the common interval for all children.
   Allocate the nested full footprint as anchor length + structural insets +
   external chrome; arrange its center at the imposed interval.
4. Use the existing layout recorder and decoration/rendering paths. Validate
   actual exposed intervals after arrangement within device-pixel tolerance.

In `GridView`, numeric axis slots currently represent external overhang. Nested
structural space must remain distinguishable when those slots are measured and
allocated: `#getGridOverhang`, layout width/height parameters, parent chrome,
and full-footprint consumers must not mistake nested content for external axes.
Reuse flex allocation and arrangement through a focused hook; do not duplicate
`arrange()` or make ordinary concats implicitly align nested centers.

Guide text/legend wrapping can change measured extents. Propagate the known
aligned span into child preparation, then reuse bounded layout settling and size
cache invalidation. Do not add an unconstrained recursive layout solver.

### Input uses the interval appropriate to the pointed surface

Keep full child footprints for dispatch into the nested surround: its summary
at y = 0 must remain reachable even though its exposed row interval starts at
y = 48. Continue dispatching navigation to the pointed leaf; exposing a layout
interval must not make an ancestor collect every nested scale as a zoom target.

The side concat's shared-y gap navigation is narrower. A gap beside the summary
at y = 24 must not initiate outer-row zoom. Its valid shared-row gap interval is
only `[48, 168]`. Route `GridView.#getGapZoomTarget` through the common alignment
geometry instead of taking the union of complete child footprints. Preserve the
ordinary concat result through the existing default geometry path. Apply the
same distinction to wheel claims, overlay extents, and any `getCrossTrackBounds`
consumer; do not repurpose full `GridChild.coords` as the anchor rectangle.

### Shared guide placement

Shared guide occurrences need the exposed interval too. The current shared-axis
path shrinks `viewportCoords` by `getViewOverhang()`, which would leave nested
structural space in the axis range. Replace that assumption for alignment-aware
children. Use the exposed start/length along the axis, while retaining the
normal host/full-content edge for its perpendicular baseline. An x-axis must
not be moved onto the nested body's bottom edge when a bottom panel occupies
that space. Normal local axes on the inner body retain their inner hosts.

Aligned side-group shared axes can reference the common interval. Perpendicular
shared axes have per-track occurrences as described above. Root/cross-region
shared axes remain unsupported; check forced hoisting past nested surrounds as
well as axes owned directly by them. A nested surround's empty own-resolution
map alone does not prove that no descendant axis escaped to an ancestor host.

### Overhang, corners, and growth limits

Structural insets always occupy space. Parent `overhang: false` can suppress
external chrome reservation, not erase the summary's 48-pixel structural inset.
Existing group-false geometry compensation and explicit true/false behavior on
flat tracks must remain covered by tests.

Automatic corner reuse continues for external chrome. Conservatively deny a
borrow when nested content occupies the relevant corner/adjacent headroom.
Structural panels may occupy free corner space beside another region. Measure
the maximum outward extent from the common center anchor, rather than adding
reservations for panels that fit beside each other. If an outer top track of
height 50 is added to the continuous-x example, its 58-pixel extent and the
nested 48-pixel extent require 58 pixels of headroom. Matrix/row bars start at
y = 58, the outer top plot at y = 0, and the nested summary at y = 10.

Maximum extents establish enclosing bounds, not collision freedom. Derive
occupied structural panel footprints from the existing hierarchy and reject
intersections between panels in different regions with a located error naming
the conflicting views, before painting. Compare actual panel occupancy, not
whole nested bounding boxes containing empty corners; treat a layer as one
plot and preserve intentional parent/child containment. Keep this information
derived, without a persistent occurrence graph. A conflict can be corrected by
changing authored spacing or composition; automatic relocation is deferred.
Internal guide reservations also occupy space, and external chrome must not
borrow space occupied by structural content. Preserve flat examples' existing
deterministic competing-axis priority.

Overlapping composite bounds also require occupancy-aware region selection for
input. Derive plot occupancy from `getTrackPlotPlacements` and individual guide
and padding strips, retaining the direct owning region. Use that geometry for
collision checks and point routing; after choosing a region, retain its full
bounds for dispatch. Do not expand entire composite boxes or use a reused
shared AxisView's final `coords` as all guide occurrences. Derive shared guide
strips per physical track, and restrict gap navigation to the common anchor.

Growing _aligned-axis structural insets_ require an allocation rule, not a
minimum-size approximation. For example, `height: { grow: 0.2 }` on the nested
summary cannot be converted to a fixed outset from the imposed 120-pixel anchor
without defining its growth budget. Reject this case initially rather than
silently treating it as zero. Fixed/step insets, outer growing anchors, and growth
in the nested surround's unconstrained perpendicular direction remain distinct.
Future flexible insets would need before/anchor/after allocation bands; that is
not an incidental getter change and has no promised SLOC saving.

## Validation and regression gates

- Extend the categorical annotated matrix as specified in
  [its acceptance design](surround-annotated-matrix.md): two normalized A/B
  segments, a right percentage axis, shared category colors/legend, a shared
  metadata source, and free upper-right corner occupancy. Verify absent encoded
  x participation without leaking the matrix's column scale.
- Verify maximum outward extents for compatible neighboring panels and a located
  rejection when structural panels collide. Keep guide reservations separate
  and preserve the existing flat corner policy.
- Static shape/import validation identifies supported alignment providers;
  scale identity is checked after resolution; geometry after arrangement.
  Keep located errors and reject detached exports before rendering.
- Matrix/row-bars domains, band centers, gaps, reversal, and viewport projection
  agree. Zooming the summary changes totals x, never outer columns or rows.
  Row-bars navigation can change totals x and shared rows y as configured.
- There are two primary sources in each fixture; shared side data, transforms,
  lexical parameters, `push: "outer"`, import scopes and authored selectors work.
- Hide/restore the nested summary: 48-pixel headroom collapses/restores while
  anchor length stays 120 in the continuous-x fixture without an outer top
  track. In the categorical example, the column totals retain headroom while
  the distribution is hidden. Hide the nested center: its whole surround collapses.
  Preserve initial hidden-data loading and existing domain lifecycle semantics.
- Test all four orientations, multiple tracks, fixed/step/growing outer centers,
  theme defaults, guide titles, shared local axes, collected legends, both
  overhang overrides, corner occupancy, and explicit unsupported flex insets.
- Assert shared local axis tick positions on unequal track spans, exposed
  parallel ranges with full-host perpendicular baselines, and rejection of
  forced axes escaping a nested region. Parent-owned guides must not enlarge
  the leaf plot viewport.
- Preserve ordinary concat/facet layout and resolution. Keep full-footprint API
  bounds distinct from alignment intervals and controller/input hit regions.
- Exercise headless layout and structured SVG plus browser WebGL/Canvas2D
  rendering, picking/hover, pan/zoom, and resizing. Recheck both public examples.

## Implementation milestones

### 4. One-container side scopes

- [x] Add the internal resolution boundary consistently across upward and
      downward resolution paths; remove the extra generated concat per side.
- [x] Verify flat equivalence for independent/shared scales and axes, typed
      declarations without encoded members, imports, visibility, names,
      navigation, data scopes, errors, and both migrated examples.
- [x] Review this shared resolution change before committing. Measure runtime
      and declaration SLOC; keep the existing feature changeset.

Areas: view factory/scopes, resolution planner/lookup, declaration mapping, App
selectors, surround construction. Tentative commit:
`fix(core): resolve surround side scales and axes within one scope`.

### 5. Nested side alignment with fixed structural insets

- [ ] Introduce the internal alignment description and fixed-inset allocation;
      support nested surrounds in side slots without broad descendant checks.
- [ ] Extend `annotated-matrix.json` with the nested A/B distribution and right
      percentage axis; add representative regression tests and retain the
      continuous-x resolution/navigation case.
      Retain scale/geometry validation and reject growing aligned insets clearly.
- [ ] Implement maximum outward extents for free corners and located rejection
      of colliding structural panels. Review the revised geometry contract
      before adopting it; do not introduce automatic rearrangement.
- [ ] Update grammar documentation and the existing feature note. Review KISS,
      renderer/input implications, and actual complexity before committing.
- [ ] Run final integration gates above, appropriate shared layout suites,
      workspace TypeScript/lint, schema/docs, and release checks. Reconcile tasks.

Areas: SurroundView/GridView measurement and placement, Unit/Layer alignment
providers, scale/geometry validation, Core/App schema/docs examples, rendering
and input. Tentative commit: `feat(core): align nested surround side panels`.

Compatible authored concats should be a later, evidence-driven extension: a
vconcat can expose common x and an hconcat common y only when its children share
both scale identity and one interval. Split-axis compositions cannot claim that
contract merely because they reference the same scale. No unrestricted nesting
or arbitrary grid support is promised by the broad recursive schema.

## Review questions and decision criteria

The reviewer should challenge the boundary semantics (especially declaration
mapping and local axes), structural/chrome separation, the fixed-inset scope,
and whether the proposed hooks really preserve ordinary layout and input paths.
Check that the source probe supports only the observations claimed, and that
the numeric worked example is consistent with the proposed sizing rules.

Removing a wrapper is a concrete simplification target, not a guaranteed net
reduction for recursive support. Adopt the next implementation only if it
deletes the duplicate construction path and uses one compositional alignment
rule rather than adding a recursive collection of surround-specific exceptions.

Reviewed on 2026-10-16 by `review_surround_plan`. No remaining design blocker
after clarifying implicit-side-concat alignment, tagged structural/chrome
aggregation, parent/view-owned guide geometry, shared-axis occurrences and
baselines, forced guide hoisting, and headroom exclusion from gap navigation.
The reviewer found the four scale identities and numeric geometry consistent
and the bounded fixed-inset scope justified.

The categorical-distribution and structural-corner revisions were reviewed on
2026-10-16 by `review_nested_contract`. Incorporate occupancy-aware region
selection and reject all authored aligned sizes at their actual declaration.
Fixed before/after structural insets suffice without a new solver.

Milestone 4 implementation review by the same reviewer found no blockers:
ownership ascent, lookup, and declaration pruning agree; local sharing and
forced ownership stay inside the side; data scopes/names/import origins and
non-positional sharing survive removal of the wrapper. The focused scale,
surround, concat/grid, and SVG suite passed 517 tests. Shared/forced side axes
on unequal-width tracks project midpoint ticks to each track's own midpoint.
The SVG suite also covers the categorical axes replacing the old text tracks.

These remain implementation gates for nesting, not claims of implemented
recursive support. The continuous-x future specification also
passes the current generated Core and App schemas; their broad recursion does
not establish runtime support. Plan formatting and whitespace checks pass.

# Legends 2.0 design: region layout, placement, and gradient controls

GenomeSpy already creates complete legend views and groups legends by
orientation. Legends 2.0 makes three focused changes to that machinery:

1. Arrange complete legends within each orientation region using
   orientation-dependent horizontal or vertical layout.
2. Render a legend either at its current local layout owner or in regions
   around the effective root view.
3. Add focused controls for gradient ramp dimensions, appearance, and tick
   density.

The design intentionally stops there. It covers compact track stacks and
centralized ComplexHeatmap-style compositions without introducing named slots,
arbitrary collector hierarchies, automatic placement heuristics, or new legend
merging semantics.

## Background and provenance

The current behavior and the Vega/Vega-Lite comparison are documented in
[`legends-2.0-findings.md`](legends-2.0-findings.md). Comparable collection
models in other visualization packages are documented in
[`legend-placement-ecosystem-findings.md`](legend-placement-ecosystem-findings.md).

The region-layout configuration shape and orientation-dependent defaults are
based on Vega's legend orientation-group design:

- [Vega legend layout](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-view-transforms/src/layout/legend.js)
- [Vega legend defaults](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-parser/src/config.js)

The separation between local and composition-level collection is informed by
patchwork's `keep`/`collect` model and ComplexHeatmap's composition-level
legend packing:

- [patchwork layout guide](https://patchwork.data-imaginist.com/articles/guides/layout.html)
- [ComplexHeatmap legend reference](https://jokergoo.github.io/ComplexHeatmap-reference/book/legends.html)

The gradient property names and primary-axis length semantics follow Vega's
legend API while retaining GenomeSpy's existing adaptive default:

- [Vega legend reference](https://vega.github.io/vega/docs/legends/)
- [Vega legend types](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-typings/types/spec/legend.d.ts)

Vega, Vega-Lite, patchwork, and ComplexHeatmap use licenses compatible with
using their documented design ideas as references. No upstream code is copied
by this proposal. If implementation code is later copied or closely adapted,
retain the applicable copyright and license notice near the adapted block.

## Goals

- Keep legends adjacent to their natural resolution owner or view by default.
- Allow distinct legends from anywhere in the visualization to be collected
  around the effective root view.
- Keep legend placement independent from scale and legend resolution.
- Arrange multiple complete legends horizontally at the top, bottom, and
  inside corners by default, matching Vega.
- Arrange multiple complete legends vertically at the left and right by
  default, matching Vega.
- Allow the region direction to be overridden globally or for one
  orientation.
- Reuse `LegendView`, `LegendRegionView`, `GridView`, existing overhang
  calculation, deterministic ordering, and active-legend behavior.
- Preserve the current visual result for local left and right regions and for
  regions containing only one legend.
- Allow authors to set gradient ramp length, thickness, opacity, border, and
  desired tick count without replacing the generated legend.
- Preserve adaptive gradient length when no explicit length is provided.
- Add curated examples under `examples/core/legends/` that exercise the main
  region layout, placement, and gradient-control combinations.
- Keep `docs/grammar/legend.md` focused on essential concepts instead of
  duplicating the Core legend example gallery.

## Non-goals

- Named legend slots or arbitrary destination identifiers.
- Collection at an arbitrary ancestor other than the effective root.
- Automatically choosing local or root placement from available space.
- Moving legends between destinations reactively.
- New legend deduplication, channel combination, or scale-sharing behavior.
- Free positioning equivalent to Vega's `orient: "none"`.
- Automatic wrapping of an overlong legend region.
- Full support for Vega's legend layout options such as `anchor`, `bounds`, or
  `center`.
- Redesigning entries within an individual legend.
- Vega-Lite's separate horizontal and vertical minimum and maximum gradient
  length configuration.
- Gradient-specific tick geometry controls or automatic gradient-label overlap
  removal.
- Moving the existing `spacing` property into the new layout object in this
  iteration.

## Terminology

The following concepts are independent:

- **Legend resolution:** Determines which views participate in a logical
  legend and which scale resolution supplies its values.
- **Legend definition:** Describes one complete generated legend, including its
  scale, title, orientation, symbols or gradient, and entry layout.
- **Legend placement:** Selects the layout destination for a legend definition.
- **Legend collector:** A `GridView` that owns orientation regions and renders
  their legends.
- **Legend region:** The collection of complete legends sharing one
  orientation at one collector.
- **Entry direction:** The existing `legend.direction`, which arranges entries
  inside one legend.
- **Region direction:** The new layout direction that arranges multiple
  complete legends inside one legend region.

In particular, region direction must not reuse or change `legend.direction`.

## Current implementation

Legend definitions are created by
[`legendResolution.js`](../../packages/core/src/scales/legendResolution.js).
[`gridChildLegends.js`](../../packages/core/src/view/gridView/gridChildLegends.js)
orders definitions, creates `LegendView` instances, and adds them to an
orientation-specific `LegendRegionView`.

Every `LegendRegionView` currently constructs a `vconcat` and manually computes
sizes assuming vertical packing. The region takes its spacing from the first
legend that creates it. External regions contribute overhang; corner regions
are rendered inside the plot by
[`legendLayout.js`](../../packages/core/src/view/gridView/legendLayout.js).

Local legends are owned by `GridChild`. Legends whose resolution is owned by a
`GridView` are stored in the grid's shared legend regions. The shared regions
are rendered around the complete child grid by
[`gridView.js`](../../packages/core/src/view/gridView/gridView.js).

At the visualization root,
[`viewFactory.js`](../../packages/core/src/view/viewFactory.js) already wraps
root unit, layer, and multiscale specifications, and roots with interval
selections, in a non-addressable `implicitRoot` `vconcat`. `ConcatView` extends
`GridView`, so this wrapper is already the effective root chrome host. Authored
concat roots are `GridView`s directly.

## Public specification

### Region layout configuration

Add a restricted Vega-compatible `layout` object to `LegendConfig`. It is a
configuration property of a collector, not a property of one generated legend.

```ts
type LegendRegionDirection = "horizontal" | "vertical";

interface LegendRegionLayout {
    direction?: LegendRegionDirection;
}

interface LegendLayout extends LegendRegionLayout {
    left?: LegendRegionLayout;
    right?: LegendRegionLayout;
    top?: LegendRegionLayout;
    bottom?: LegendRegionLayout;
    "top-left"?: LegendRegionLayout;
    "top-right"?: LegendRegionLayout;
    "bottom-left"?: LegendRegionLayout;
    "bottom-right"?: LegendRegionLayout;
}

interface LegendConfig extends Legend {
    layout?: LegendLayout;
}
```

The initial surface includes only `direction`. The nested object intentionally
leaves room for additional proven region-level options if concrete use cases
appear later.

Examples:

```json title="Arrange all legend regions vertically"
{
  "config": {
    "legend": {
      "layout": { "direction": "vertical" }
    }
  }
}
```

```json title="Arrange only the top-right region vertically"
{
  "config": {
    "legend": {
      "layout": {
        "top-right": { "direction": "vertical" }
      }
    }
  }
}
```

### Placement configuration

Add `placement` to `Legend`, making it available through `config.legend`, a
view-level `legends.<channel>` declaration, or an encoding-level legend object.

```ts
type LegendPlacement = "local" | "root";

interface Legend {
    /**
     * The layout destination of the legend.
     *
     * __Default value:__ `"local"`
     */
    placement?: LegendPlacement;
}
```

Placement is static. It does not accept an `ExprRef`, because changing it would
require moving a live legend subtree between collectors.

Collect all inherited legends at the root:

```json
{
  "config": {
    "legend": {
      "placement": "root",
      "orient": "right"
    }
  }
}
```

Keep most legends local but collect one explicitly:

```json
{
  "encoding": {
    "color": {
      "field": "category",
      "type": "nominal",
      "legend": {
        "placement": "root"
      }
    }
  }
}
```

### Gradient legend controls

Add the following Vega-compatible properties to `Legend`. They are also
available through `config.legend` because `LegendConfig` extends `Legend`.

```ts
interface Legend {
    /** Fixed ramp length in pixels along the gradient axis. */
    gradientLength?: number;

    /** Ramp thickness in pixels. Default: 12. */
    gradientThickness?: number;

    /** Ramp opacity. Default: 1. */
    gradientOpacity?: number;

    /** Optional ramp border color. */
    gradientStrokeColor?: string;

    /** Ramp border width in pixels. Default: 0. */
    gradientStrokeWidth?: number;

    /** Desired number of ticks for a quantitative legend. Default: 5. */
    tickCount?: number;
}
```

`gradientLength`, `gradientThickness`, and `gradientStrokeWidth` must be
non-negative. `tickCount` must be a positive integer; use `values: []` when no
ticks should be shown. `gradientOpacity` must be between zero and one. As with
the existing numeric legend properties, these controls are static in the
initial implementation and do not accept an `ExprRef`.

For example:

```json
{
  "config": {
    "legend": {
      "gradientLength": 120,
      "gradientThickness": 16,
      "gradientStrokeColor": "#888",
      "gradientStrokeWidth": 1,
      "tickCount": 4
    }
  }
}
```

## Design 1: legend-region layout

### Defaults

When no region direction is configured, use orientation-dependent defaults:

| Orientation | Region direction |
| --- | --- |
| `left`, `right` | `vertical` |
| `top`, `bottom` | `horizontal` |
| `top-left`, `top-right`, `bottom-left`, `bottom-right` | `horizontal` |

These defaults match Vega's orientation-group direction. They differ from
GenomeSpy's current vertical packing for top, bottom, and corner regions.

### Resolution precedence

Resolve a region's direction in this order:

1. `config.legend.layout[orient].direction` at the collector.
2. `config.legend.layout.direction` at the collector.
3. The orientation-dependent default above.

The configuration scopes belong to the destination `GridView`. They do not
belong to the first legend contribution in the region. This ensures that a root
collector is controlled by root configuration even when its legends originate
from differently configured descendants.

`layout` must not be copied into `LegendDefinition.legend`. The current legend
configuration resolver returns a complete `LegendConfig`, which
`LegendResolution` spreads into the individual legend properties. Region layout
must instead be extracted and resolved separately for the destination
collector, while the remaining properties continue into the legend definition.

The initial implementation does not move `spacing` into `layout`. Existing
spacing precedence and track-specific compact spacing remain unchanged. The
fact that a region currently takes spacing from its first legend remains a
known limitation rather than expanding this change into a broader spacing API
migration.

### Region sizing

Generalize `LegendRegionView` to derive physical width and height from the
active legend views and the resolved region direction:

- A horizontal region sums active legend widths plus spacing and uses the
  largest active legend height.
- A vertical region uses the largest active legend width and sums active
  legend heights plus spacing.
- An empty region has zero physical extent and contributes no overhang.
- External overhang is the region extent perpendicular to the plot edge plus
  its effective offset.
- The region's parallel constraint is its extent parallel to the plot edge.
- A corner region uses its natural packed width and height and contributes no
  external overhang.

When `gradientLength` is undefined, existing flexible gradient behavior must
continue to derive available space from the plot and real grid children rather
than growing the grid to the browser extent. An explicit `gradientLength`
replaces that flexible primary-axis size with the fixed ramp-body length
described in Design 3. The implementation may retain orientation-aware size
helpers instead of forcing every unspecified size into a fixed pixel value.

### Region rendering

Replace the hard-coded vertical child layout and vertical render allocation
with direction-aware packing. The implementation can use `hconcat` for a
horizontal region and `vconcat` for a vertical region, provided active legend
filtering and region sizing remain controlled by `LegendRegionView`.

Reactive `legend.disable` and resolution visibility continue to determine the
active legend list. When the active set changes, the region recomputes its
packed extent and requests layout reflow through the existing invalidation
path.

### Ordering

Keep the current deterministic order:

1. Depth-first source-view order.
2. Case-insensitive title, field, or channel label.
3. Channel name.

Direction changes only how that sequence fills the region. It does not reorder
the sequence.

### Overflow

The initial implementation does not wrap an overlong horizontal region. Its
parallel minimum participates in the existing flex constraints and may grow the
composition. This is equivalent to the current treatment of other fixed guide
minima and keeps wrapping out of scope until a concrete overflow case requires
it.

## Design 2: local and root placement

### Placement semantics

`"local"` preserves the current behavior:

- An independent legend belonging to a grid child is rendered around that
  child's viewport.
- A legend whose resolution is owned by a `GridView` is rendered around that
  grid's complete child layout.

`"root"` changes only the rendering destination:

- The legend definition remains owned semantically by its existing
  `LegendResolution` and source scale resolution.
- The generated `LegendView` retains its original data parent and live scale
  connection.
- The effective root `GridView` becomes its layout parent and collector.
- The source child or intermediate grid reserves no local space for it.

Root collection does not imply shared scales, shared legend resolution,
deduplication, or definition merging. Multiple independent color scales may
produce multiple distinct color legends in the same root orientation region.

### Effective root

The root destination is the outermost effective layout root, not necessarily
the authored top-level view.

```text
authored unit/layer root
          |
          v
implicitRoot: ConcatView / GridView   <-- root legend collector
    `-- authored top-level view
```

For an authored concat, that concat is already the effective root `GridView`.
`getTopLevelSpecView()` continues to return the authored view for APIs that
must bypass the wrapper, but root legend placement targets the actual layout
root.

The existing `wrapRoot` mechanism remains responsible for supplying an
implicit grid host. When `wrapRoot: false` is used internally or in tests, the
caller must provide an explicit root `GridView` to use `placement: "root"`.
Fail fast with a clear error if root placement is requested without a root
collector.

### Definition routing

Resolve `placement` as part of each `LegendDefinition`, using the same source
configuration and explicit legend precedence as other individual legend
properties. The built-in default is `"local"`.

During guide synchronization:

1. Discover legend definitions from the completed non-chrome view hierarchy.
2. Keep local definitions in their current `GridChild` or shared `GridView`
   collector.
3. Exclude root definitions from every local collector.
4. Add root definitions exactly once to the effective root `GridView`.
5. Group both the root's naturally local definitions and routed root
   definitions by orientation in the root regions.

Discovery must deduplicate resolution objects encountered through the
hierarchy. Existing `LegendResolution.getLegendDefs()` behavior continues to
deduplicate definitions that refer to the same scale resolution.

The effective root may reuse its existing shared legend region storage. A
second kind of root-only region is unnecessary because naturally root-owned
and routed root legends obey the same sizing, ordering, rendering, and
invalidation rules.

### Configuration ownership

Individual legend properties continue to come from the source legend's
configuration scopes and explicit overrides. This includes:

- `placement`
- `orient`
- Entry `direction`
- Title, label, symbol, gradient, padding, and offset properties

Region direction comes from the destination collector as described in Design
1. Consequently:

- A root `config.legend.placement: "root"` is inherited by descendant legend
  definitions.
- A descendant or encoding-level `placement: "local"` can opt one legend out.
- A root `config.legend.orient: "right"` can give collected legends a common
  side unless a closer source configuration overrides it.
- Root `config.legend.layout` determines how complete root legends are packed.

### Visibility and invalidation

A root-routed legend retains the existing active predicate based on
`legend.disable` and whether its resolution has visible non-chrome members.

When a descendant changes visibility, a reactive disable value changes, or
measured legend content grows, invalidation must reach the root collector. The
root recomputes region extents and its overhang once. No intermediate grid may
retain stale legend space.

View insertion, removal, and movement already recreate guide views after the
resolution hierarchy changes. Root legend discovery must run through the same
`syncViewGuideViews()` lifecycle so mutations cannot leave duplicate or orphaned
root legends.

### Mixed placement

Local and root legends may coexist. A visualization can therefore retain
compact legends beneath selected genome-browser tracks while collecting other
legends at the right side of the complete composition.

Legends with different placements never share a physical region even when they
have the same orientation. Placement does not split or rewrite their semantic
resolution; it only selects where each generated definition is rendered.

## Design 3: gradient legend controls

### Length and orientation

`gradientLength` controls only the ramp body's primary axis:

- It is the ramp width for a horizontal gradient.
- It is the ramp height for a vertical gradient.
- Title, legend padding, and any side-by-side title extent are additional to
  the configured length.
- Direction changes reinterpret the same value along the new primary axis; the
  value is not orientation-specific.

When `gradientLength` is undefined, preserve GenomeSpy's current adaptive
behavior. In particular, a vertical side gradient may fill the height made
available by its collector. Horizontal gradients continue to participate in
the current flex layout. This deliberately differs from Vega-Lite's clamped
plot-relative default and avoids four additional orientation-specific min/max
properties.

When `gradientLength` is specified, the generated `gradientBody` uses that
fixed pixel length instead of `grow: 1` on its primary axis. `LegendView` and
`LegendRegionView` must propagate the resulting fixed size through parallel
constraints, packed region dimensions, and overhang calculation. A fixed
legend must not stretch merely because its collector has additional space.

### Thickness and extent

`gradientThickness` replaces the current hard-coded 12-pixel ramp thickness.
It affects both the generated ramp geometry and the legend's measured
cross-axis extent. Tick marks, labels, title, padding, and offsets remain
additional to the ramp thickness.

Changing thickness must not change gradient sampling or scale semantics. The
same property applies to both continuous ramps and the bucketed ramps already
generated for threshold and quantize scales.

### Ramp appearance

`gradientOpacity` applies to the ramp samples, not to the title, ticks, labels,
background, or the complete legend group.

`gradientStrokeColor` and `gradientStrokeWidth` describe one border around the
complete ramp. Implement the border as a separate overlay mark so it does not
replace or interfere with a source `stroke` channel represented by the ramp.
No border is visible by default because `gradientStrokeWidth` defaults to zero.

### Tick density

`tickCount` replaces the current hard-coded desired count of five when the
gradient tick data source derives ticks automatically. It is a hint to the
source scale's tick generation rather than a guarantee that exactly that many
labels are produced.

An explicit `legend.values` continues to define the shown ticks and takes
precedence over `tickCount`. Formatting continues to come from the represented
channel as it does now. This iteration does not add tick length, tick color,
tick width, or label-overlap properties.

### Configuration ownership

All six properties are individual legend properties. They therefore resolve
from the source legend's configuration scopes and explicit overrides, even
when `placement: "root"` routes the rendered legend to another collector.
Unlike `config.legend.layout`, the destination collector does not override
gradient geometry or appearance.

## Key decisions

- Use one plan and one implementation stream for region layout, local/root
  placement, and gradient dimensions because all three affect
  `LegendRegionView` sizing and the `GridView` guide lifecycle.
- Use the Vega-compatible `config.legend.layout` shape, initially supporting
  only region `direction`.
- Compute orientation-dependent direction defaults rather than encoding all
  defaults as nested config values. A general configured direction can then
  override every orientation unless a specific orientation is also configured.
- Put `placement` on `Legend` so global configuration, view-level declarations,
  and individual channel legends use the same property.
- Keep placement static and fail loudly on unsupported values.
- Treat the effective root `GridView`, including `implicitRoot`, as the only
  global collector.
- Preserve semantic legend and scale resolution when routing to the root.
- Preserve distinct root legends; do not add collection-time merging or
  deduplication.
- Reuse existing region, overhang, flex, active-state, ordering, and guide-sync
  machinery.
- Use Vega's gradient property names, but preserve GenomeSpy's adaptive length
  when `gradientLength` is omitted.
- Treat explicit gradient length as ramp-body length and include titles and
  padding outside it.
- Keep gradient properties attached to the source legend when routing it to a
  root collector.
- Defer named slots, arbitrary ancestors, wrapping, and spacing redesign.

## Alternatives considered

### Keep vertical packing for every orientation

This preserves compatibility but wastes horizontal space above and below plots
and remains inconsistent with Vega. It also makes a centralized bottom legend
collection unnecessarily tall.

### Add a `stackDirection` property to each legend

This is superficially simple but assigns a region-level decision to one legend.
Multiple legends in the same region could disagree, reproducing the current
first-legend spacing ambiguity. The collector's `config.legend.layout` is a
clearer owner.

### Implement all Vega legend layout properties

Vega also supports anchors, bounds policies, centering, and margins. Adding the
full surface would create implementation and testing work without a current
GenomeSpy use case. The nested layout object remains extensible if those needs
appear.

### Add Vega-Lite's orientation-specific gradient length bounds

Vega-Lite exposes separate horizontal and vertical minimum and maximum lengths
for calculating a default gradient size. GenomeSpy already has an adaptive
flex-based default that is useful for tall track stacks. A single explicit
`gradientLength` covers the concrete adjustment use case without replacing
that behavior or adding four interacting configuration values.

### Add gradient-specific tick styling now

Tick size, color, width, and label-overlap policies could be useful, but they
expand this change from ramp adjustment into a guide styling system. Existing
`values`, label properties, and the new `tickCount` cover the immediate tick
selection and density needs. Additional tick controls can be introduced later
without changing the six properties in this design.

### Put collection in `resolve.legend`

Legend resolution describes semantic sharing and merging. Using it for layout
destination would conflate independent concerns and make it difficult to
collect distinct legends from independent scales.

### Add named slots immediately

Named destinations resemble Plotly and patchwork's guide areas, but require a
registry, missing-target semantics, nesting rules, and a public slot layout
model. Local and root placement cover the current concrete use cases with a
single routing branch.

### Extract legends into ordinary authored views

This resembles cowplot but would expose generated chrome, live scale
connections, disposal, and reactivity to user-authored layout. Keeping legends
inside the guide lifecycle retains stronger invariants.

### Force an implicit root regardless of `wrapRoot`

This would make root placement work in every internal context but would change
the established meaning of `wrapRoot: false`. Reusing the default wrapper and
requiring an explicit grid when wrapping is disabled is more predictable.

## Risks

- Horizontal top, bottom, and corner regions change existing multi-legend
  layouts.
- A horizontal region can establish a large minimum width because automatic
  wrapping is deferred.
- Flexible gradient legends may expose assumptions in the current
  perpendicular/parallel size calculations.
- Fixed gradient lengths must compose correctly with flexible sibling legends
  and both region directions without being stretched by surplus space.
- A gradient border implemented on each sampled rectangle could produce
  internal seams or replace a represented stroke scale; it must be one overlay
  around the complete ramp.
- Root collection requires hierarchy-wide discovery without duplicating
  definitions already owned by the root.
- A descendant legend extent change must invalidate an ancestor that is not
  its semantic resolution owner.
- Mutations may reveal ordering or disposal bugs if root routing is not part of
  the existing guide synchronization transaction.
- Source legend configuration and destination region configuration come from
  different scopes. Documentation must distinguish them clearly.
- Existing first-legend spacing behavior remains and may be more noticeable in
  a large root collection.
- Internal callers using `wrapRoot: false` may encounter a new fail-fast error
  if they request root placement without an explicit root grid.

## Unresolved questions

- Should root placement without an effective root `GridView` fail during view
  creation, guide synchronization, or legend-definition routing?
- Should `spacing` remain sourced from the first legend for the initial release,
  or is root collection sufficient reason to move it into
  `config.legend.layout` now?
- Should the changed top/bottom/corner default be announced as a migration in
  release notes even though single-legend regions are unaffected?
- Is `placement` the clearest public name, or would `layoutOwner` communicate
  the semantics better without implying coordinates?

None of these questions requires a generic slot system. The placement property
name and spacing scope should be settled before implementation begins.

## Implementation steps

### 1. Define region layout configuration

**Outcome:** Add the public region layout types, orientation-dependent default
helper, and collector-scope resolution without changing rendered layout yet.

**Affected areas:**

- `packages/core/src/spec/legend.d.ts`
- `packages/core/src/config/defaults/legendDefaults.js`
- `packages/core/src/config/legendConfig.js`
- `packages/core/src/config/legendConfig.test.js`
- `packages/core/src/scales/legendResolution.js`
- Generated JSON Schema artifacts

**Verification:** Test the general direction, orientation-specific override,
nearest collector config scope, and built-in orientation defaults. Run the
focused config and schema suites plus workspace TypeScript checks.

**Documentation and migration:** Add schema-derived documentation for the new
types. Do not describe the changed visual default until the rendering step is
implemented.

**Tentative commit:** `feat(core): define legend region layout configuration`

### 2. Add gradient legend controls

**Outcome:** Add the six public properties, replace hard-coded gradient
dimensions and tick count, and support fixed or adaptive ramp length without
changing the default rendering.

**Affected areas:**

- `packages/core/src/spec/legend.d.ts`
- `packages/core/src/config/defaults/legendDefaults.js`
- `packages/core/src/view/legendView.js`
- `packages/core/src/data/sources/lazy/legendGradientSource.js`
- Focused legend extent, grid legend, and layout snapshot tests
- Generated JSON Schema artifacts

**Verification:** Cover horizontal and vertical gradients with explicit and
adaptive length, thickness-dependent extent, opacity, one outer border,
automatic tick count, `values` precedence, continuous and bucketed ramps, and
configuration versus individual overrides. Run focused legend, layout,
schema, and TypeScript checks.

**Documentation and migration:** Add the new schema-derived properties and a
concise usage snippet. The complete rendered gradient-control demonstration
belongs in `examples/core/legends/` as described in step 6. Defaults preserve
existing rendering, so no migration is required.

**Tentative commit:** `feat(core): add gradient legend controls`

### 3. Implement direction-aware region packing

**Outcome:** Generalize `LegendRegionView` sizing and rendering so left/right
regions default to vertical and top/bottom/corner regions default to
horizontal, with configuration overrides.

**Affected areas:**

- `packages/core/src/view/legendView.js`
- `packages/core/src/view/gridView/legendLayout.js`
- `packages/core/src/view/gridView/gridChildLegends.js`
- `packages/core/src/view/gridView/gridView.js`
- Focused legend and layout snapshot tests

**Verification:** Add stable layout snapshots for multiple symbol and gradient
legends at all eight orientations, both region directions, mixed legend
extents, matching axes, and reactive disable. Verify parallel constraints and
external overhang. Run focused legend, grid, layout snapshot, and TypeScript
checks.

**Documentation and migration:** Update `docs/grammar/legend.md` concisely with
the difference between entry and region direction. Document the new defaults
and show the vertical compatibility override as a short snippet rather than a
new rendered docs example.

**Tentative commit:** `feat(core): support directional legend region layout`

### 4. Define local and root placement

**Outcome:** Add the static placement property to legend configuration and
carry the resolved value into each `LegendDefinition`, without changing guide
routing yet.

**Affected areas:**

- `packages/core/src/spec/legend.d.ts`
- `packages/core/src/config/defaults/legendDefaults.js`
- `packages/core/src/config/legendConfig.js`
- `packages/core/src/scales/legendResolution.js`
- Focused config and legend-resolution tests

**Verification:** Test the `"local"` default and precedence through root config,
nested config, view-level legend declaration, and channel-level legend object.
Reject unsupported placement values through schema validation.

**Documentation and migration:** Add schema-derived placement documentation.
No migration is needed because `"local"` preserves existing behavior.

**Tentative commit:** `feat(core): define local and root legend placement`

### 5. Route root legends into the effective root grid

**Outcome:** Suppress root-designated definitions at local collectors, discover
them once at the effective root, and render them through the root's existing
orientation regions.

**Affected areas:**

- `packages/core/src/view/gridView/gridChildLegends.js`
- `packages/core/src/view/gridView/gridChild.js`
- `packages/core/src/view/gridView/gridView.js`
- `packages/core/src/view/gridView/guideViewSync.js`
- `packages/core/src/view/viewFactory.js` only if root-host validation requires
  a small extension
- View mutation and layout snapshot tests

**Verification:** Cover:

- Independent child legends collected at root without merging.
- Shared and independent root legends coexisting.
- Mixed local and root placement.
- Authored concat and implicit root collectors.
- Matching root axes and all external orientations.
- Root corner overlays.
- Descendant visibility and reactive disable changes.
- View insertion, removal, movement, and disposal.
- Fail-fast behavior when `wrapRoot: false` leaves no root `GridView`.

Run focused guide, grid, mutation, layout snapshot, and TypeScript checks.

**Documentation and migration:** Explain in `docs/grammar/legend.md` that
placement does not change resolution or merge distinct legends. Add at most one
new rendered docs example for the essential local-versus-root collection
concept; keep mixed placement and layout permutations in the Core example
gallery.

**Tentative commit:** `feat(core): collect legends at the root view`

### 6. Add curated Core examples and essential documentation

**Outcome:** Add a focused Legends 2.0 gallery under
`examples/core/legends/`. Demonstrate the two motivating use cases and the new
gradient controls without making the grammar page an exhaustive showcase.

Add small, stable Core specs covering:

- `region-layout-directions.json`: multiple complete legends using the default
  side/top/corner directions and one configured override.
- `local-track-legends.json`: a vertically concatenated track stack with each
  legend adjacent to its relevant track or resolution owner.
- `root-collected-legends.json`: a matrix-like composition with distinct
  legends collected around the root.
- `mixed-placement.json`: local and root legends coexisting without changing
  their scale or legend resolutions.
- `gradient-controls.json`: horizontal and vertical ramps demonstrating fixed
  length, thickness, opacity, border, and tick count. Combine related knobs in
  one readable spec rather than creating one file per property.

Existing examples such as `corner-horizontal.json`,
`layered-legend-regions.json`, and the gradient-scale examples remain focused
on their current behavior. Reuse their small inline datasets and visual style
where useful, but do not overload them with unrelated Legends 2.0 options.

**Affected areas:**

- `examples/core/legends/`
- `examples/docs/grammar/legend/` for at most one essential new rendered docs
  example
- `docs/grammar/legend.md`
- `docs/grammar/composition/index.md` if a short placement-versus-resolution
  clarification is needed

**Verification:** Follow `examples/README.md`, validate and render every new
Core example, and build schema/docs artifacts. Confirm that placement examples
use independent mappings where the text claims collection without sharing and
that each gradient property has a visible, intentional effect.

**Documentation and migration:** Keep `docs/grammar/legend.md` concise: one
essential rendered placement example at most, short snippets for region layout
and gradient controls, schema-derived property documentation, and pointers to
the curated Core examples for broader combinations. Do not embed every new
Core example in the grammar page.

**Tentative commit:** `docs(core): add Legends 2.0 examples`

## Acceptance criteria

### Region layout

- Multiple complete legends at left and right default to vertical packing.
- Multiple complete legends at top, bottom, and all four corners default to
  horizontal packing.
- A general region direction overrides every orientation without a specific
  override.
- An orientation-specific direction overrides the general direction.
- `legend.direction` continues to control only entries inside one legend.
- External region overhang and parallel flex constraints match the packed
  physical dimensions.
- Corner regions remain inside the plot and contribute no external overhang.
- Active legend changes reflow horizontal and vertical regions correctly.
- Deterministic legend order remains unchanged.

### Placement

- Existing specifications use local placement by default.
- Local legends retain current resolution-owner and grid-child behavior.
- Root placement collects distinct descendant legends around the effective root
  without changing their scales or resolutions.
- Root-routed legends reserve space only at the root.
- Local and root legends can coexist in one visualization.
- Root orientation regions use root collector layout configuration.
- Authored concat roots and implicit roots both act as collectors.
- Missing root collector state fails clearly when implicit wrapping is disabled.
- Visibility, reactive disable, mutations, and disposal cannot leave stale,
  duplicate, or orphaned root legends.

### Gradient controls

- Omitting every new property preserves current gradient rendering and
  adaptive sizing.
- Explicit `gradientLength` fixes only the ramp body's primary-axis length for
  horizontal and vertical gradients.
- Fixed-length gradients retain their length in horizontal and vertical
  regions and compose correctly with flexible sibling legends.
- `gradientThickness` changes ramp geometry and measured cross-axis extent.
- `gradientOpacity` affects only the ramp.
- Gradient stroke properties draw one border around the ramp without changing
  the represented scale or producing seams between samples.
- `tickCount` controls automatically derived tick density, while explicit
  `values` take precedence.
- Continuous, threshold, and quantize gradient legends honor the applicable
  geometry and appearance controls.

### Examples

- `examples/core/legends/` contains focused examples for region directions,
  local track legends, root collection, mixed placement, and gradient controls.
- Every new Core example validates and renders successfully.
- The gradient-control example visibly exercises all six new properties
  without splitting them into one-property specs.
- `docs/grammar/legend.md` adds no more than one essential rendered example;
  remaining additions are concise snippets and schema-derived documentation.

### Documentation and provenance

- User-facing documentation distinguishes scale resolution, legend resolution,
  legend placement, entry direction, and region direction.
- Changed multi-legend defaults and their compatibility override are documented.
- The track-stack and centralized-matrix use cases are both demonstrated in
  the curated Core examples.
- Gradient sizing and styling controls are demonstrated with their adaptive
  default behavior explained.
- Relevant implementation comments identify behavior adapted from Vega and
  link to the durable upstream source.

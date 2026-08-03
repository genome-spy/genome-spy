# Offset channels: implementation plan

## Status and related material

Status: proposed

- [Findings](./offset-channels-findings.md)
- [GenomeSpy issue #230](https://github.com/genome-spy/genome-spy/issues/230)

## Provenance and licensing

The endpoint model, offset value-reference model, and nested-band behavior in
this proposal are based on Vega and Vega-Lite:

- Vega
  [`c03b7d0f`](https://github.com/vega/vega/tree/c03b7d0fe369be1a6e81d23dc899aef6eb7da967)
- Vega-Lite
  [`f0e76dfc`](https://github.com/tuner/vega-lite/tree/f0e76dfc7efa720817249f612f66599e2ca5ead4)

Both projects use the BSD 3-Clause license, which is compatible with
GenomeSpy's use of their design. The proposal adapts concepts and behavior; it
does not require copying implementation blocks. Any code that is later closely
adapted must retain an adjacent `Adapted from ...` comment and the applicable
license notice.

## Goals

1. Add scale-capable `xOffset` and `yOffset` encoding channels whose visual
   values are logical pixels.
2. Match Vega-Lite's endpoint semantics: `xOffset`/`yOffset` are primary
   channels, while `x2Offset`/`y2Offset` are mark properties.
3. Add all four offset mark properties, with encoding channels taking
   precedence over the matching primary properties.
4. Preserve current point `dx`/`dy` specifications, including the RefSeq gene
   annotation track, during migration.
5. Keep text `dx`/`dy` as glyph-layout properties.
6. Support explicit pixel offset scales before positional scales migrate from
   unit to pixel ranges.
7. Add Vega-Lite-style nested offset scales for grouped bars, grouped points,
   jittering, dodging, and related layouts.
8. Make the design forward-compatible with positional pixel ranges.

## Non-goals

- Do not migrate positional scales to pixel ranges in this work.
- Do not add `x2Offset` or `y2Offset` encoding channels.
- Do not add axes or legends for offset channels.
- Do not reproduce every Vega-Lite composite-mark normalization in the first
  implementation.
- Do not remove point `dx`/`dy` until a separate compatibility decision is
  made after usage and migration have been evaluated.
- Do not change text glyph-layout semantics for `dx`/`dy`.

## Public contract

### Encoding channels

Add `xOffset` and `yOffset` to `Encoding` and `ChannelWithScale`. Their channel
definitions support field, datum, expression, value, scale, and conditional
forms consistent with other numeric mark-property channels.

```json
{
  "encoding": {
    "x": { "field": "position", "type": "locus" },
    "xOffset": {
      "field": "strand",
      "type": "nominal",
      "scale": {
        "type": "ordinal",
        "domain": ["-", "+"],
        "range": [-6, 6]
      }
    }
  }
}
```

Offset visual values and scale ranges are always logical CSS pixels:

- `value` is a pixel displacement;
- `scale: null` passes through a pixel-valued datum or expression;
- a scale range contains pixel values;
- positive x moves right;
- positive y moves down, following Vega/Vega-Lite screen-space convention.

GenomeSpy intentionally permits explicit pixel offsets on continuous, index,
and locus positions. Vega-Lite primarily restricts nested offsets to discrete
positions, but the extension is needed for genomic annotations and structural
variant endpoints.

### Mark properties

Extend `MarkPropsBase` with:

```ts
xOffset?: number | ExprRef;
yOffset?: number | ExprRef;
x2Offset?: number | ExprRef;
y2Offset?: number | ExprRef;
```

The semantics are:

- `mark.xOffset` supplies the default primary x offset;
- `mark.yOffset` supplies the default primary y offset;
- `mark.x2Offset` supplies the secondary x offset;
- `mark.y2Offset` supplies the secondary y offset;
- `encoding.xOffset` overrides `mark.xOffset`;
- `encoding.yOffset` overrides `mark.yOffset`.

For an explicit `x2` or `y2`, secondary offsets are independent. For a
secondary endpoint synthesized from a primary endpoint, inherit the primary
offset unless the corresponding secondary property is explicitly set. Resolve
this distinction before mark normalization inserts synthetic `x2`/`y2`
definitions.

Examples:

```json
{
  "mark": {
    "type": "rule",
    "x2Offset": 0
  },
  "encoding": {
    "xOffset": {
      "field": "strand",
      "type": "nominal",
      "scale": {
        "type": "ordinal",
        "range": [-4, 4]
      }
    }
  }
}
```

```json
{
  "mark": {
    "type": "rule",
    "y2Offset": 8
  }
}
```

The second example can extend a lollipop stem by moving only its secondary
endpoint.

### Guides and interaction

Offset channels participate in scale and domain resolution but do not produce
axes or legends. They are not zoomable positional channels and must not be
used for interval-selection projection.

Offset geometry participates normally in GPU picking because the picking pass
uses the same vertex positions. Tooltip and selection identity remain based on
the original datum.

## Internal design

### Channel classification

Introduce explicit channel groups rather than treating offsets as positional
channels:

```ts
type OffsetChannel = "xOffset" | "yOffset";
type SecondaryOffsetProperty = "x2Offset" | "y2Offset";
```

Add helpers that map:

- `x` to `xOffset`;
- `y` to `yOffset`;
- `x2` to `x2Offset`;
- `y2` to `y2Offset`;
- an offset channel/property back to its positional endpoint.

Do not make `getPrimaryChannel("xOffset")` return `x`. Offset scales need their
own resolution and domain. Update the resolution planner to register offset
scale members while explicitly excluding them from axis and legend members.

### Pixel-space invariant

Keep offset encoders and offset-scale ranges in logical pixels throughout the
CPU and GPU scale pipelines.

While positional encoders return unit coordinates, mark shaders should follow
this conceptual sequence:

```glsl
vec2 base = applySampleFacet(vec2(getScaled_x(), getScaled_y()));
vec2 offsetPx = vec2(getScaled_xOffset(), -getScaled_yOffset());
vec2 position = base + offsetPx / uViewportSize;
```

Offsets must be added after sample-facet positioning so that a ten-pixel offset
remains ten pixels in every facet. Shared helpers should express the conversion
and sign convention consistently across shaders.

When positional scales later return pixels, preserve the offset encoder
contract and change only the composition boundary:

```glsl
vec2 positionPx = basePositionPx + offsetPx;
vec2 position = positionPx / uViewportSize;
```

No offset schema or scale migration should be required.

### Endpoint resolution

Normalize each mark to four effective endpoint offsets:

```text
effective x offset  = encoding.xOffset ?? mark.xOffset ?? 0
effective y offset  = encoding.yOffset ?? mark.yOffset ?? 0
effective x2 offset = explicit mark.x2Offset
                      ?? (implicit x2 ? effective x offset : 0)
effective y2 offset = explicit mark.y2Offset
                      ?? (implicit y2 ? effective y offset : 0)
```

The nullish distinction matters: an explicit secondary offset of zero prevents
inheritance.

Do not expose synthesized secondary offsets as public encoding channels. The
mark can generate internal shader accessors or uniforms for the effective
secondary values.

Apply endpoint offsets before derived geometry:

- rect: before sorting endpoints, calculating size, minimum-size clamping, and
  rounded-corner geometry;
- rule and arrow: before calculating tangents, caps, minimum length, arrowhead
  placement, and extrusion;
- link: before calculating chord length, control points, arc apex, and fading;
- ranged text: before range alignment, squeezing, flush behavior, and culling;
- point: after sample-facet placement and before visible-range culling.

### Mark properties and viewport setup

Remove public `xOffset`/`yOffset` handling from `Mark.setViewport()`. Retain the
independent half-pixel raster-alignment correction there. Convert scalar or
expression-backed primary offset properties to the same effective-offset path
used by encoding channels.

This changes explicitly ranged marks from GenomeSpy's old whole-mark
translation to endpoint-specific Vega-Lite behavior. Existing repository uses
of mark offsets currently have points, text, or implicit secondary endpoints,
so inheritance preserves their geometry. Add a migration note for external
specifications that combine a mark offset with an explicit secondary endpoint:
set the matching `x2Offset`/`y2Offset` to the same value to retain whole-range
translation.

### Scale behavior before nested bands

The first scale-capable implementation must support explicit pixel ranges:

- quantitative data defaults to pass-through only when `scale: null` is
  explicit;
- nominal/ordinal fields may use an explicit ordinal range for exact discrete
  displacements;
- continuous scales may use explicit numeric ranges;
- scale expressions and range updates use the existing GLSL uniform pipeline.

Require an explicit range when a discrete offset scale is not nested in a
discrete primary position. This is an explicit contract and avoids inventing a
meaningless default pixel displacement.

### Nested offset scales

Add automatic nested-band behavior as a separate implementation step after
basic offset geometry is stable.

When all of the following hold:

- `xOffset` or `yOffset` is scale-backed;
- its type is nominal or ordinal;
- the matching primary position is discrete;
- the offset scale type is not explicitly overridden with a non-band type;

infer a band offset scale. Its pixel range spans the corresponding primary
bandwidth:

```text
xOffset range = [0, x bandwidth in logical pixels]
yOffset range = [0, y bandwidth in logical pixels]
```

While primary scales use unit ranges, convert their bandwidth to pixels using
the current view width or height. Recompute the derived offset range when:

- the view is laid out or resized;
- the primary scale range changes;
- primary or offset domains change;
- padding or other relevant scale properties change.

Represent this dependency explicitly rather than hiding it in a shader. The
offset scale itself should expose a pixel range and pixel bandwidth so mark
geometry, debugging tools, and the later positional pixel migration share one
source of truth.

The dependency must be local to compatible unit views. Sharing an offset scale
across layers with the same positional resolution is useful; sharing a derived
pixel range across differently sized concat children is invalid and should
fail resolution compatibility checks or remain independent.

### Grouped marks

For point-like marks, use the midpoint of the offset band by default:

```text
position = primary band start + offsetScale(value) + offset bandwidth / 2
```

For rect/bar-like marks, use the offset band as the grouped extent:

```text
start = primary band start + offsetScale(value)
end   = start + offset bandwidth
```

Then apply the offset scale's inner padding to create space between bars.
Explicit mark sizes continue to override inferred offset bandwidth.

The current `fixCoveragePositional()` expands a discrete rect across the full
primary band. Add a nested-offset path that anchors both base endpoints at the
primary band's leading edge and obtains the subgroup extent from the offset
scale. Do not emulate grouped bars by creating a public `x2Offset` channel.

Grouped rule/tick behavior uses the offset-band midpoint unless the mark has a
band-relative thickness or another explicit size rule.

### Step-based view sizes

GenomeSpy currently interprets `{ "step": n }` against the primary positional
domain. Extend `Step` with Vega-Lite's distinction:

```ts
interface Step {
    step: number | ExprRef;
    for?: "position" | "offset";
}
```

- `for: "position"` applies the step to each primary category and fits all
  offset groups inside it.
- `for: "offset"` applies the step to each subgroup and expands the primary
  category to contain the offset domain.
- when omitted, follow Vega-Lite's default: use the offset interpretation when
  a discrete nested offset exists, otherwise use the primary position.

The view-size calculation must include offset-domain cardinality and both
scales' band padding. Keep this work in the view/scale layout layer rather than
the mark shaders.

### Point `dx`/`dy` compatibility

Retain point `dx` and `dy` in the schema as deprecated compatibility channels.
Do not silently reinterpret text `dx`/`dy`.

The compatibility behavior is:

- point `dx` produces the same visual result as a positive `xOffset`;
- point `dy` preserves its current visual direction, so its effective new
  screen-space offset is the negation of the legacy value;
- field, datum, expression, scale, condition, and mark-property forms remain
  functional;
- specifying both `dx` and `xOffset`, or both `dy` and `yOffset`, is an error
  with a migration message;
- text `dx`/`dy` remain mark properties and are not deprecated by this work.

Implement compatibility in encoding normalization or in a small legacy
adapter before shader generation. Do not duplicate all offset geometry in the
point shader. The adapter must preserve scale-domain participation and handle
the vertical sign after scale evaluation.

Update the RefSeq gene example to use `xOffset` only after the compatibility
path has a regression test proving that the old form renders identically. Keep
at least one focused compatibility test using the old `dx` form.

Removal of point `dx`/`dy` is a separate future breaking change. Before that
decision, search shared examples, documentation, App specifications, and known
downstream uses, and publish a migration note.

## Features enabled

### Grouped and dodged bars

Map a subgroup field to the offset channel. The nested scale divides each
primary band, and rect width comes from the offset bandwidth.

### Grouped points and ticks

Use the same nested scale to align points, ticks, error bars, and labels with
grouped bars. Sharing the offset scale resolution across layers keeps them
aligned.

### Jitter and beeswarm-like displacement

Map a quantitative random or layout-produced value to an offset scale with a
small pixel range. This works on discrete positions and, as a GenomeSpy
extension, on continuous/locus positions when the range is explicit.

### Lollipops

Use `y2Offset` to extend only the stem endpoint to the protein body or baseline
without changing the data-domain y value.

### Structural-variant paws

Use an ordinal `xOffset` range to move a rule endpoint left or right according
to strand, while `x2Offset: 0` leaves the other endpoint fixed. Stroke width
then remains controlled by the rule mark.

### Layered annotations

Share an offset scale across bars, points, rules, and text anchors so that all
layers use the same subgroup placement. Text `dx`/`dy` can still adjust glyph
layout after anchor placement.

## Alternatives considered

### Keep `dx`/`dy` as general channels

Rejected. Their support is mark-specific today, their vertical convention is
inconsistent with mark offsets, and they do not model secondary endpoints.
Keeping them as the primary API would remain incompatible with Vega-Lite.

### Add all four offsets as channels

Rejected for the initial design. Vega-Lite exposes only primary offset
channels. Secondary properties cover endpoint adjustments without adding
another pair of scale resolutions or unclear grouped-band semantics.

### Continue translating the viewport

Rejected. A viewport uniform cannot vary by datum, cannot move endpoints
independently, and bypasses mark-specific derived geometry.

### Store offsets in unit coordinates

Rejected. Unit-valued offsets change pixel size when a view resizes, cannot
express exact annotation spacing, and would require a public migration when
positional scales become pixel-valued.

### Wait for positional pixel ranges

Rejected. Offset values can remain pixel-valued now and be converted at the
rendering boundary. Waiting blocks useful features without reducing the public
API work.

### Implement grouped bars by rewriting data-domain positions

Rejected. It would mix layout with data semantics, fail for locus/index
positions, complicate shared layers, and make padding and resizing difficult.
A nested pixel offset scale is the established solution.

## Risks and mitigations

### Indexed rendering near viewport edges

The x index and visible-domain filtering use unoffset data positions. A mark
whose base x is just outside the viewport may be offset into view but omitted
from the rendered subset.

Mitigation: compute a conservative pixel offset extent for x-offset encoders,
convert it to a domain margin through the primary scale, and expand indexed
queries/culling. Initially require bounded configured ranges for scale-backed
x offsets used with indexed data. Fail fast when no finite bound is available.

### Shared derived ranges across different view sizes

A nested offset range depends on a particular primary bandwidth in pixels.
Accidentally sharing it across differently sized views produces incorrect
geometry.

Mitigation: include the primary positional resolution and layout owner in
offset-resolution compatibility. Share automatically across layers in the same
plot, not arbitrary concat children.

### Ranged-mark compatibility

Old `mark.xOffset`/`mark.yOffset` translated explicit secondary endpoints.
Endpoint-specific semantics will no longer do so automatically.

Mitigation: preserve inheritance for implicit endpoints, document the explicit
secondary-property migration, audit repository examples, and add a targeted
warning if feasible when an old-style primary property accompanies an explicit
secondary endpoint without its matching secondary property.

### Pixel sign and sample facets

Applying offsets before sample-facet transforms or using unit-space y signs
would produce inconsistent displacement.

Mitigation: centralize screen-pixel-to-position conversion and test positive
x/y offsets in normal, clipped, and sample-faceted views.

### Text geometry

Moving a ranged text anchor after its fit/flush calculation would make layout
and picking disagree.

Mitigation: apply endpoint offsets before all ranged-text calculations and
keep glyph-local `dx`/`dy` afterward.

### Positional pixel migration

Embedding unit conversion in every scale or accessor would make the later
migration expensive.

Mitigation: keep offset encoders pixel-valued and isolate conversion in shared
shader position helpers.

## Unresolved questions

1. Should an external specification using a primary mark offset with an
   explicit secondary endpoint receive a warning, or is the documented
   endpoint change sufficient?
2. Should point `dx`/`dy` remain accepted indefinitely as aliases, or be removed
   in the next major version after migration telemetry and downstream audits?
3. Should offset scales ever create legends when explicitly requested? The
   proposed contract says no, matching their positional role.
4. What finite default bound should indexed rendering use for expression-backed
   offsets whose range cannot be determined statically? The preferred contract
   is to require an explicit bound rather than guess.
5. Should `Step.for` ship with grouped bars or in a follow-up if fixed-size
   grouped plots already cover the immediate need?

## Implementation steps

### Step 1: Define and normalize offset semantics

Outcome:

- schema types for offset channels and four offset properties;
- channel classification and endpoint mapping helpers;
- normalization that records whether secondary endpoints were explicit;
- precedence and implicit-endpoint inheritance;
- no rendered behavior change yet.

Affected areas:

- `packages/core/src/spec/channel.d.ts`
- `packages/core/src/spec/mark.d.ts`
- `packages/core/src/encoder/encoder.js`
- mark normalization helpers in `packages/core/src/marks/`
- generated JSON Schema artifacts

Verification:

- schema/type tests for accepted and rejected forms;
- unit tests for endpoint precedence and explicit-zero secondary offsets;
- snapshot-friendly normalized encoding assertions.

Documentation and migration:

- document pixel units, signs, precedence, and endpoint inheritance;
- note the ranged-mark compatibility rule.

Tentative commit:

`feat(core): define positional offset channels and properties`

### Step 2: Render explicit pixel offsets on all marks

Outcome:

- `xOffset`/`yOffset` encoders participate in attributes and scales;
- mark properties use the effective endpoint-offset path;
- `x2Offset`/`y2Offset` adjust secondary geometry;
- offsets work with unit-valued positional ranges;
- viewport setup retains only raster alignment.

Affected areas:

- `packages/core/src/marks/mark.js`
- point, rect, rule, arrow, link, and text mark classes and shaders
- GLSL shared position helpers
- vertex builders and shader snapshots
- scale rules and resolution planning

Verification:

- mark tests for constant, field, datum, expression, condition, and scaled
  offsets;
- endpoint tests for rects, rules, arrows, links, and ranged text;
- sample-facet and clipping tests proving fixed pixel displacement;
- picking tests where available;
- focused shader snapshots.

Documentation and migration:

- add examples for lollipops and structural-variant paws;
- document explicit pixel ranges on continuous/locus positions.

Tentative commit:

`feat(core): render pixel-valued positional offsets`

### Step 3: Preserve and deprecate point `dx`/`dy`

Outcome:

- existing point `dx`/`dy` specifications render unchanged;
- conflicting legacy and new channels fail with a clear message;
- text `dx`/`dy` remain glyph properties;
- the gene annotation migrates to `xOffset` after compatibility is proven.

Affected areas:

- point encoding normalization
- point defaults and shader accessors
- schema/JSDoc deprecation notices
- RefSeq and other examples using point `dx`/`dy`

Verification:

- before/after layout or rendered snapshots for the gene annotation;
- positive and negative legacy `dx`/`dy`, including scaled and expression
  forms;
- vertical sign regression;
- error tests for conflicting channel pairs.

Documentation and migration:

- publish old-to-new examples;
- explain why text `dx`/`dy` remain valid.

Tentative commit:

`refactor(core): route point dx and dy through offset compatibility`

### Step 4: Add nested offset scales and grouped marks

Outcome:

- discrete primary positions derive pixel-valued nested band ranges;
- points use offset-band centers;
- rects use offset-band extents;
- layered marks can share offset scales;
- offset padding controls subgroup spacing.

Affected areas:

- scale type/range inference
- scale resolution dependency tracking
- view layout invalidation
- rect coverage normalization and mark sizing
- point/rule/tick band placement

Verification:

- focused scale tests for derived ranges and resize updates;
- grouped vertical and horizontal bars;
- grouped points, ticks, labels, and layered combinations;
- padding and explicit scale override tests;
- shared-layer versus independent-concat resolution tests;
- stable layout snapshots using existing view test helpers.

Documentation and migration:

- add a grouped-bar example and a layered grouped-bar/point example;
- document offset padding and explicit ordinal displacement scales.

Tentative commit:

`feat(core): support nested offset scales for grouped marks`

### Step 5: Integrate step sizing and indexed-range margins

Outcome:

- `{ step, for }` sizes grouped charts predictably;
- indexed rendering includes marks displaced into the viewport;
- offset range changes invalidate layout and rendering correctly.

Affected areas:

- `packages/core/src/spec/view.d.ts`
- `packages/core/src/view/view.js`
- scale and layout invalidation
- x-index query/culling paths

Verification:

- primary-step and offset-step view sizes with padding;
- dynamic domain and resize tests;
- positive/negative x offsets at both viewport boundaries;
- explicit failure for unbounded indexed offsets if a safe bound cannot be
  inferred.

Documentation and migration:

- document `Step.for` and indexed-offset requirements.

Tentative commit:

`feat(core): size and cull views with nested offsets`

### Step 6: Documentation and end-to-end verification

Outcome:

- complete user-facing channel and property documentation;
- examples for the major enabled chart types;
- regenerated schemas and docs;
- browser smoke tests across resizing, zooming, sample facets, and picking.

Affected areas:

- `docs/`
- `examples/docs/`
- generated schemas
- release/migration notes

Verification:

- focused Vitest suites during implementation;
- `npm --workspaces run test:tsc --if-present`;
- `npm run lint`;
- full `npm test` before merge;
- browser smoke tests for all new examples.

Tentative commit:

`docs(core): document positional offsets and grouped marks`

## Acceptance criteria

### Basic offsets

- `encoding.xOffset` and `encoding.yOffset` accept value, field, datum,
  expression, scale, and conditional definitions.
- Their evaluated visual values are logical pixels at every view size and
  device-pixel ratio.
- Positive x moves right and positive y moves down.
- They work with quantitative, discrete, index, and locus primary positions
  when a meaningful pixel range is available.
- No offset axis or legend is created.

### Endpoint properties

- `mark.xOffset`, `mark.yOffset`, `mark.x2Offset`, and `mark.y2Offset` are
  supported.
- Primary offset channels override matching primary properties.
- Explicit secondary endpoints use independent secondary properties.
- Implicit secondary endpoints inherit the primary offset unless an explicit
  secondary property, including zero, overrides it.

### Rendering

- Point, rect, rule, tick, arrow, link, and text anchors render offsets
  correctly.
- Derived geometry, picking, clipping, visible-range culling, sample faceting,
  minimum sizes, and ranged-text fitting use the offset endpoints.
- The half-pixel raster-alignment behavior remains intact.

### Compatibility

- The existing RefSeq gene annotation renders unchanged with its old `dx`
  encoding.
- A migrated `xOffset` version renders identically.
- Existing point `dx`/`dy` value, expression, field, and scaled forms remain
  valid during the compatibility period.
- Text `dx`/`dy` remain mark properties.

### Grouped layouts

- Vertical and horizontal grouped bars derive subgroup position and width from
  an offset band scale.
- Grouped points, ticks, rules, and labels align with grouped bars when sharing
  an offset scale.
- Offset padding, resizing, dynamic domains, and supported step-size modes
  update layout correctly.
- Explicit ordinal pixel ranges remain available for genomic endpoint
  displacement instead of being forced into nested-band behavior.

# Axis label overlap removal plan

## Context

GenomeSpy chooses an approximate tick count from the axis length, but the tick
generator does not know the formatted labels' rendered widths. Consequently,
an axis that has enough room for labels such as `12M` can still overlap when a
format produces labels such as `123,234,345`.

Vega solves this after text layout. Its axis parser attaches an overlap pass to
the label mark, and the pass uses the encoded scene-item bounds rather than
changing tick generation. It offers a regular `parity` reduction and a denser
`greedy` scan, preserves endpoint labels when possible, and hides labels while
leaving tick rules intact:

- [Vega axis-label parser](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-parser/src/parsers/guides/axis-labels.js)
- [Vega overlap transform](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-view-transforms/src/Overlap.js)
- [Vega-Lite overlap defaults](https://github.com/vega/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/compile/axis/properties.ts)

Vega and Vega-Lite use the BSD-3-Clause license, which is compatible with
GenomeSpy's MIT license. The implementation will be original and adapted to
GenomeSpy's dataflow rather than copied from Vega's scenegraph transform. A
short source attribution will be retained next to the reduction algorithm.

GenomeSpy has no CPU scenegraph containing final text bounds. However, the
axis pipeline already measures labels with `measureText`, and the locus-axis
work established a collecting transform that reacts to scale domains and
layout without involving `AxisTickSource`. Extend that single reactive stage to
also decide ordinary label visibility instead of chaining another independently
reactive collector behind it.

## Goals

- Prevent overlapping labels on continuous quantitative, index, and locus
  axes when formatted label lengths vary.
- Use Vega-Lite-style defaults:
  - enable parity removal for ordinary continuous scales;
  - use greedy removal for log and symlog scales;
  - leave nominal and ordinal labels unchanged by default.
- Provide explicit `labelOverlap` and `labelSeparation` axis properties.
- Keep tick generation independent of font metrics and layout.
- Preserve all tick rules when ordinary labels are culled, matching Vega.
- Compose correctly with locus chromosome-label culling, which continues to
  remove both the numeric label and its otherwise orphaned tick rule.
- Recompute during zoom and layout changes without propagating when the set of
  retained datum `value` keys is unchanged.

## Non-goals

- Arbitrarily rotated label collision geometry.
- Changing tick-count selection or introducing a tick-generation feedback loop.
- Collision handling for nominal or ordinal labels by default.
- Collision avoidance between labels belonging to separate axes or views.
- General-purpose two-dimensional mark-label placement.
- Culling chromosome labels against each other.

## Public API

Add the following properties to `Axis` and `AxisConfig` through the existing
schema-generating TypeScript definitions:

```ts
labelOverlap?: boolean | "parity" | "greedy";
labelSeparation?: number;
```

Semantics:

- `false` disables overlap removal.
- `true` selects `parity`, matching Vega's public property semantics.
- `"parity"` and `"greedy"` select a method explicitly.
- When omitted, continuous quantitative, index, and locus axes default to
  `greedy` for log and symlog scales and `parity` otherwise. Nominal and
  ordinal axes behave as if `false`.
- `labelSeparation` adds the requested pixel gap between retained label bounds
  and defaults to `0`, matching Vega.

The first version supports axis-aligned text rectangles only: angles equivalent
to `0`, `90`, `180`, or `270` degrees. Quarter-turn labels need only swap the
measured width and resolved font-size extent; arbitrary angles are excluded
until their anchor-aware bounds can be shared with the text renderer. Automatic
overlap removal is disabled for unsupported angles. Explicitly requesting
overlap removal with an unsupported angle fails with a clear error rather than
silently applying incorrect geometry.

## Design

### Pipeline placement

Keep one scale-reactive post-processing transform in the shared axis pipeline:

```text
AxisTickSource
    -> measureText(label)
    -> measureText(chromLabel), locus axes only
    -> axisLabelLayout
       -> ticks_main
       -> labels_main -> filter(labelVisible) -> text mark
```

`axisLabelLayout` replaces and generalizes `filterLocusAxisLabels`. It makes
two related decisions in one pass:

- chromosome conflicts remove the datum from the shared output, so both the
  numeric label and its tick rule disappear;
- ordinary density reduction sets a public internal-datum field such as
  `labelVisible`, while leaving the datum available to the tick layer;
- a plain, non-reactive filter on `labels_main` keeps only datums whose
  `labelVisible` field is true.

The chromosome decision runs first, so ordinary overlap reduction sees only
valid remaining label candidates. Axes that need neither chromosome collision
handling nor ordinary overlap removal can omit the transform.

### Label geometry

`measureText` remains the only transform that measures label strings. The new
filter receives the measured-width field and the resolved label font size.
For supported quarter-turn angles, it builds a one-dimensional interval along
the axis using the tick's scaled pixel position, width/font-size extent, and
the applicable alignment or baseline. No view traversal or mark inspection is
needed.

Using the resolved font size for text height is intentionally conservative and
avoids a second font lookup or a new measurement path. If visual verification
shows that this over-culls quarter-turn labels materially, stop and propose
extending `measureText` to publish height rather than duplicating font logic in
the overlap transform.

### Reduction methods

Candidates are processed in axis order using their one-dimensional bounds:

- `parity` first checks for overlap, then repeatedly retains every other
  candidate until adjacent retained bounds no longer overlap or only endpoint
  candidates remain.
- `greedy` keeps the first candidate and then keeps a candidate only if it does
  not overlap the last retained candidate.
- Both methods attempt to retain the final candidate by replacing the preceding
  retained candidate when needed, following Vega's endpoint policy.

The transform owns the same minimal reactive state as the current locus filter:

- source datums;
- a reusable next-output buffer;
- the published tick and visible-label sets, keyed by the unique datum `value`;
- domain and `layoutComputed` listeners.

It propagates only when either the retained tick set or visible-label set
changes. Scale position changes for unchanged sets remain the mark/scale
system's responsibility.

This avoids three independently reactive nodes. `AxisTickSource` must still
listen for scale changes because the tick candidates can change, and the one
post-processor must also listen because unchanged candidates can move into or
out of collision. Scale listeners are invoked synchronously in registration
order, not dataflow order. A domain change can therefore cause the
post-processor to evaluate the existing candidates and then evaluate once more
if the source publishes a changed candidate batch. Set-based propagation
suppression makes the first evaluation harmless when its visible sets do not
change, while the normal source-to-child propagation always leaves the final
state based on the newest batch. Do not add another scale-listening collector
downstream of this node.

### Defaults

Axis field type is available when the generated axis spec is built, while the
concrete scale type is available to the transform through its scale resolution.
The axis builder decides whether automatic overlap removal applies to the field
type. When the public property is omitted, the transform resolves the default
to `greedy` for runtime `log`/`symlog` scales and `parity` for other continuous
scale types. An explicit `true` always means `parity`.

Do not add these defaults to the global static `AXIS_DEFAULTS`, because a single
static value cannot express the nominal/ordinal exception or log/symlog method.

## Alternatives considered

### Reduce tick count after measuring labels

Rejected. It introduces a feedback loop between tick generation, measurement,
and layout, and it still needs a policy for unequal label widths. Post-processing
the candidate labels is simpler and follows Vega.

### Cull inside `AxisTickSource`

Rejected. The source does not and should not know the rendered font, axis
length-dependent label geometry, or mark configuration.

### Cull in `TextMark` or its vertex builder

Rejected for the first implementation. Text positions are primarily resolved
in shaders, and adding axis-specific neighbor logic to a general text mark
would couple rendering and guide semantics.

### Filter ticks and labels together

Rejected as the only output policy. Vega keeps ordinary tick rules, and the
ticks still communicate the scale subdivisions. The combined post-processor
therefore filters whole datums only for locus chromosome conflicts and uses a
visibility field for ordinary label density.

### Chain a second reactive label-only transform

Rejected. It would leave `AxisTickSource`, the locus filter, and the ordinary
filter independently listening to the same scale. Listener dispatch is
synchronous but follows registration order rather than dataflow order, so a
downstream filter could evaluate stale input before receiving a new upstream
batch and could evaluate repeatedly during one domain change. A single
post-processor retains the established two-listener arrangement without adding
another ordering dependency.

### Greedy only

Smaller, but rejected because parity preserves regular cadence on linear axes
and matches Vega-Lite's default. Supporting both algorithms is a small bounded
addition and gives log/symlog axes the established greedy behavior.

## Risks and stop conditions

- Text anchor and baseline handling at quarter turns may not match WebGL and SVG
  rendering. Verify all four axis orientations. If matching them requires
  copying renderer-specific branching into the transform, stop and propose a
  shared text-bounds utility before continuing.
- Endpoint retention can intentionally leave two overlapping labels on very
  short axes, matching Vega. Confirm whether GenomeSpy should preserve this
  behavior before broadening tests around it.
- The source and post-processor can both evaluate during one domain change when
  the candidate tick set changes. Verify that changed-set suppression prevents
  redundant downstream propagation. If correct output depends on listener
  registration order, stop and propose ordered dataflow invalidation rather
  than adding timing workarounds.
- Font size is a conservative height approximation. If it noticeably over-culls
  quarter-turn labels, stop and propose height output from `measureText`.
- The combined post-processor must compare both its shared tick output and its
  visible-label subset. Comparing only one set can leave the other branch stale.

## Implementation steps

### 1. Add the overlap contract and pure reduction logic

Outcome:

- Add `labelOverlap` and `labelSeparation` to the axis specification.
- Add pure, one-dimensional parity and greedy reducers operating on ordered
  candidate bounds.
- Cover variable widths, separation, endpoint retention, reversed order, and
  unsupported angles with focused unit tests.

Affected areas:

- `packages/core/src/spec/axis.d.ts`
- a new focused overlap helper or transform module and adjacent tests

Verification:

- Focused Vitest suite
- Core TypeScript check
- Schema generation/type validation as required by the spec change

Tentative commit: `feat(core): define axis label overlap reduction`

### 2. Generalize the reactive locus filter into axis label layout

Outcome:

- Replace `filterLocusAxisLabels` with one collecting `axisLabelLayout`
  transform used by both ordinary and locus axes.
- Use measured widths, resolved font size, quarter-turn geometry, runtime scale
  type, and axis length.
- Remove chromosome-conflicting datums and set `labelVisible` for ordinary
  overlap decisions.
- Recompute on domain/layout changes and publish only when the retained-tick or
  visible-label `value` set changes.

Affected areas:

- `packages/core/src/data/transforms/`
- `packages/core/src/data/transforms/transformFactory.js`
- `packages/core/src/spec/transform.d.ts`

Verification:

- Transform tests for initial layout, resize, zoom/domain updates, unchanged-set
  suppression, disposal, parity, greedy behavior, and the combined tick/label
  output contract
- Focused TypeScript and lint checks

Tentative commit: `feat(core): lay out non-overlapping axis labels`

### 3. Wire axes, defaults, and locus composition

Outcome:

- Put the shared reactive transform upstream of both axis layers and attach a
  non-reactive `labelVisible` filter to `labels_main`.
- Apply Vega-Lite-style defaults by field and runtime scale type.
- Preserve tick rules for ordinary overlap removal.
- Preserve shared tick/label removal for chromosome conflicts in the generalized
  transform.

Affected areas:

- `packages/core/src/view/axisView.js`
- axis and locus-axis integration tests
- generated example snapshots if their visible label sets change

Verification:

- Integration tests with unequal exact-number widths
- Linear parity and log/symlog greedy defaults
- Explicit enable/disable/method overrides
- All four axis orientations with supported angles
- Locus-axis composition and zoom stability
- Browser verification of the long-chromosome and synteny examples

Tentative commit: `feat(core): prevent ordinary axis label overlaps`

### 4. Document and validate the feature

Outcome:

- Document the properties, defaults, axis-aligned limitation, and the fact that
  ordinary tick rules remain visible.
- Add a compact docs example only if it communicates variable-width behavior
  better than the property documentation and integration snapshot.

Affected areas:

- `docs/grammar/axis.md`
- schema-derived documentation/artifacts
- optionally `examples/docs/grammar/`

Verification:

- `npm test`
- `npm --workspaces run test:tsc --if-present`
- `npm run lint`
- docs/schema build if generated artifacts change
- visual check at representative narrow and wide plot sizes

Tentative commit: `docs(core): document axis label overlap removal`

## Acceptance criteria

- A continuous x axis containing both short and long formatted numbers shows no
  overlapping labels at supported angles.
- Linear continuous axes use parity removal by default.
- Log and symlog axes use greedy removal by default.
- Nominal and ordinal axes retain all labels unless overlap removal is
  explicitly requested.
- `labelOverlap: false` retains every candidate label.
- `labelSeparation` is included in collision decisions.
- Ordinary label removal does not remove tick rules.
- Locus chromosome conflicts still remove both the numeric label and tick rule
  before ordinary density reduction.
- Zoom and resize do not flash labels, loop layout, or propagate unchanged
  output sets.
- Unsupported arbitrary angles are never processed using incorrect bounds.
- WebGL and SVG renderers show the same retained label set.

# Long chromosome names on locus axes

Issue: [#300](https://github.com/genome-spy/genome-spy/issues/300)

## Goal

Prevent long chromosome or contig labels from obscuring numeric locus-axis
labels. Preserve chromosome labels, numeric tick marks, zooming, panning, and
SVG export.

## Non-goals

- General-purpose axis-label collision resolution.
- Collision handling between adjacent chromosome labels.
- Changes to locus tick spacing or `scaleLocus.ticks()`.
- New user-facing axis properties.
- Reimplementation of ranged-text layout in the dataflow.

## Current behavior

- `packages/core/src/genome/scaleLocus.js` starts each chromosome's numeric
  ticks one tick step after the chromosome boundary. This happens in domain
  units and is unaware of label width.
- `packages/core/src/data/sources/lazy/axisTickSource.js` emits `{ value,
  label }` and republishes when generated tick values change.
- `packages/core/src/view/axisView.js` measures numeric labels, renders
  chromosome labels as ranged text, and applies a fixed leading-edge fade to
  numeric labels.
- SVG resolves expression-valued mark properties, but the WebGL text mark
  currently uploads its viewport-edge fade vectors only during graphics
  initialization.

## Proposed minimal design

Keep tick generation semantic and perform all pixel-dependent work in a
post-processing transform on the numeric-label branch.

```text
AxisTickSource
    { value, label, chromLabel }
        |
        +------------------------------> tick-rule branch (unchanged)
        |
        v
measureText(label -> labelWidth)
        |
        v
measureText(chromLabel -> chromLabelWidth)
        |
        v
filterLocusAxisLabels
    - filters overlapping numeric labels
    - updates the leading-edge fade parameter
        |
        v
numeric-label TextMark
```

### Tick metadata

For locus scales, `AxisTickSource` adds the chromosome name associated with
each numeric tick:

```js
{
    value: tick,
    label: format(tick),
    chromLabel: chromosome.name,
}
```

This is the only new responsibility in `AxisTickSource`. It will not inspect
the view hierarchy, resolve fonts, measure text, calculate pixels, or publish
parameters.

### Text measurement

The numeric-label view runs two existing `measureText` transforms before
collision processing:

1. Measure `label` into `labelWidth` using the numeric-label font.
2. Measure `chromLabel` into `chromLabelWidth` using the chromosome-label
   font.

`AxisView` resolves the effective numeric and chromosome font descriptors once
from axis and text-mark configuration. The same descriptors are used by the
generated text marks and their corresponding `measureText` transforms. This
keeps font precedence out of the source and collision transform.

Repeated chromosome-name measurements are acceptable because locus axes have
few ticks. Do not add a cache unless measurement shows it is useful.

### Collision transform

Add one internal collecting transform, tentatively named
`filterLocusAxisLabels`. It receives already measured widths and the following
small configuration:

- Scale channel.
- Numeric-label width field.
- Chromosome-label width field.
- Chromosome-label alignment and padding.
- Name of a local output parameter for the fade distance.

The transform obtains the locus scale and axis length from its own view. For
each tick, it uses the scale's genome and `chromLabel` to find the chromosome
interval, maps the interval and tick to pixels, and propagates the datum only
when the numeric and chromosome label bounds do not overlap.

The transform follows the existing scale-aware lifecycle in
`filterScoredLabels`: retain the latest measured tick rows and recompute on
source completion, domain changes, and layout changes. This is necessary even
when panning or resizing leaves the numeric tick array unchanged.

Tick rules and grid lines do not contain this transform and therefore retain
all tick datums.

### Leading-edge fading

The generated numeric-label unit view declares a private local parameter, for
example `chromLabelFadeDistance`. Its initial value preserves the existing
fixed behavior.

During the same collision pass, `filterLocusAxisLabels` calculates the occupied
distance of the chromosome label intersecting the leading viewport edge and
updates the local parameter. The numeric-label text mark reads it through an
ExprRef for its left-edge fade distance on horizontal axes or bottom-edge fade
distance on vertical axes.

The transform does not read the parameter it writes. The text mark does not
affect data, scales, or layout, so the dependency remains one-way:

```text
scale domain / layout -> transform -> fade parameter -> text uniform
```

Issue [#463](https://github.com/genome-spy/genome-spy/issues/463) concerns
coherent scheduling when several reactive inputs change together. It may later
deduplicate a combined domain/layout update, but it is not required to break a
cycle here. A focused test must nevertheless verify that publishing the fade
parameter does not trigger another collision pass.

Text viewport-edge fade properties will accept ExprRefs. `TextMark` will gain a
small helper that updates the fade uniform vectors when one of their components
changes. SVG already resolves these properties during export.

## Key decisions

- Keep `AxisTickSource` limited to tick generation, formatting, and chromosome
  metadata.
- Use the existing `measureText` transform for both labels; the collision
  transform consumes widths and never handles fonts.
- Filter only the numeric-label branch so numeric tick rules remain visible.
- Use one collecting, scale-aware transform for collision filtering and fade
  publication because both derive from the same measured geometry.
- Declare the output parameter in the generated label view instead of secretly
  allocating it in the transform.
- Prefer conservative culling over duplicating the full ranged-text renderer.

## Re-evaluation checkpoints and stop conditions

Re-evaluate the design after each implementation step. Stop implementation and
propose alternatives if:

- `AxisTickSource` needs font, pixel, layout, or downstream-view knowledge
  beyond `chromLabel`.
- The transform needs to inspect another view or dataflow branch.
- The bounds calculation begins duplicating substantial WebGL or SVG
  ranged-text logic.
- Updating the fade parameter re-enters the transform or causes an unstable
  propagation cycle.
- Reactive fade support requires general shader-uniform or mark-property
  infrastructure.
- The change expands beyond the focused files below without a clear
  correctness reason.

If stopped, retain no partial production workaround. Report the failed
assumption and compare these alternatives:

1. Keep only collision filtering and retain a conservative fixed edge fade.
2. Add a small axis-layout service shared explicitly by generated axis chrome.
3. Introduce a general axis-label collision facility as a separately designed
   feature.

## Implementation steps

### 1. Add chromosome metadata and measure both labels

**Outcome:** Locus tick datums contain `chromLabel`, and the numeric-label
branch contains measured widths for both pieces of text.

**Affected areas:**

- `packages/core/src/data/sources/lazy/axisTickSource.js`
- `packages/core/src/view/axisView.js`
- `packages/core/src/data/sources/lazy/axisTickSource.test.js`
- Axis structure tests

**Verification:**

- Locus ticks receive the correct chromosome name.
- Non-locus tick datum shape remains unchanged.
- Both `measureText` transforms receive the same effective font descriptors as
  their rendered labels.

**Re-evaluation:** Stop if exact font sharing requires the source or transform
to reconstruct mark configuration.

**Tentative commit:** `refactor(core): add chromosome metadata to locus ticks`

### 2. Filter colliding numeric labels

**Outcome:** The new transform consumes measured widths and suppresses every
numeric label overlapping its chromosome label.

**Affected areas:**

- New transform and focused test beside `packages/core/src/data/transforms/`
- `packages/core/src/data/transforms/transformFactory.js`
- Internal transform type in `packages/core/src/spec/transform.d.ts`
- `packages/core/src/view/axisView.js`

**Verification:**

- Short `chr22` labels preserve current visible ticks.
- A long name can suppress several numeric labels.
- Tick rules corresponding to suppressed labels remain visible.
- Internal chromosome boundaries and the leading viewport edge are covered.
- Domain and layout changes recompute visibility when source data is unchanged.

**Re-evaluation:** Keep the transform only if its layout calculation remains
small and conservative.

**Tentative commit:** `fix(core): filter locus labels obscured by chromosome names`

### 3. Publish and render the dynamic fade distance

**Outcome:** Numeric-label fading follows the measured leading chromosome
label.

**Affected areas:**

- The new collision transform
- `packages/core/src/view/axisView.js`
- `packages/core/src/marks/text.js`
- `packages/core/src/spec/mark.d.ts`
- Focused text-mark and SVG tests

**Verification:**

- Panning from a short chromosome name to a long one updates the fade distance.
- Resizing updates it without rebuilding the hierarchy.
- One collision pass causes no recursive or additional collision pass.
- WebGL requests a render after the uniform changes.
- SVG uses the current expression value in its fade mask.

**Re-evaluation:** If parameter publication loops or the TextMark change grows
beyond a small uniform subscription, stop and retain fixed fading while
proposing alternatives.

**Tentative commit:** `fix(core): adapt locus axis fading to chromosome labels`

### 4. Regression verification and cleanup

**Outcome:** Issue #300 is fixed without public API additions or unrelated axis
changes.

**Verification:**

- Run focused Vitest suites for the tick source, transform, axis view, text
  mark, and SVG export.
- Run `npm --workspaces run test:tsc --if-present`.
- Run `npm run lint` after focused tests and type checks pass.
- Inspect `git diff --stat` and the full diff. Added complexity must be
  justified by collision filtering or dynamic fading.

**Documentation/migration:** None expected because this corrects internal
generated-axis behavior without changing the grammar.

**Tentative commit:** `test(core): cover long chromosome axis labels`

## Risks and unresolved questions

- Conservative bounds may cull one extra numeric label when chromosome text is
  squeezed. Systematic over-culling is not acceptable.
- Vertical and reversed axes may expose assumptions hidden by the common
  horizontal, forward axis.
- A leading chromosome fragment with no numeric tick datum may require keeping
  the existing fade distance for that frame. Do not introduce synthetic tick
  rows solely for fading.
- Combined domain and layout changes may evaluate twice until issue #463 is
  addressed, but the final state must be coherent before rendering.

## Acceptance criteria

- The long contig name shown in issue #300 does not overlap numeric coordinate
  labels.
- More than one numeric label is culled when the measured chromosome label
  requires it.
- Short human chromosome names retain current tick density and appearance.
- Numeric tick rules remain visible when their labels are culled.
- Leading-edge fading follows the measured chromosome-label footprint during
  pan, zoom, and resize.
- WebGL and SVG output agree on visible labels and fading.
- `AxisTickSource` contains no font, pixel-layout, parameter-publication, or
  downstream-view logic.
- No new public configuration is required.
- The implementation passes its re-evaluation checkpoints; otherwise work is
  stopped and alternatives are proposed before the design expands.

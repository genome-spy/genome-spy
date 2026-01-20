# Aggregated Sample Actions

## Overview
Goal: extend sample-view actions to operate on per-sample aggregates computed over
numeric intervals (e.g., gene regions or time ranges) instead of a single value
at a locus. This enables interactive workflows such as:

- Retain samples with at least one mutation in a gene interval
- Filter samples by max logR within a region
- Group samples by copy-number coverage in an interval

The design keeps reducers pure and unchanged. The new logic lives in attribute
accessor creation and action-info formatting.

Planned UX: users brush a region to define an interval, open a context menu,
choose the field, then an aggregation op, then a sample operation (filter/group/sort).

## Why This Fits the Current Architecture
- `augmentAttributeAction` precomputes per-sample values and injects them into
  action payloads; it does not care how the values are produced.
- `sampleOperations` already works with accessors that return a single value per
  sample.
- `actionInfo` formats action payloads into readable provenance titles.

Aggregated accessors keep the same contract: `(sampleId) => singleValue`.

## Proposed Model

### Attribute Identifier Extension
Add an optional aggregation spec under `attributeIdentifier.specifier` for
view-backed attributes.

Example (conceptual):

- type: "view"
- specifier:
  - view: "cnvTrack"
  - field: "logR"
  - interval: [45600000, 45850000]
  - aggregation:
    - op: "max" | "min" | "weightedMean" | "count"

This keeps the existing attribute identity while allowing richer queries.

Interval format:
- A two-element array.
- Each element is either a numeric scalar or an object with `{ chrom, pos }`.
- `{ chrom, pos }` should be converted to concatenated coordinates early (see
  `packages/core/src/genome/genome.js`).
- Point queries should normalize to `[p, p]` rather than using a one-element
  array or a separate `point` field.

### Aggregation Semantics
Return a single value per sample. Suggested defaults:

- For segment features (intervals with x and x2):
  - `weightedMean`: mean of field weighted by overlap length
  - `max`/`min`: extrema of field among overlapping segments
  - `count`: number of overlapping segments

- For point features (x only):
  - `count`: number of points in interval
  - `max`/`min` over a field

Notes:
- If no overlaps, return `undefined`, except `count` returns `0`.

### Accessor Factory (Core Idea)
Create a helper that builds per-sample accessors from a view, collector, and
aggregation spec.

Signature (conceptual):

`createAggregatedAccessor({ view, collector, field, interval, aggregation })`

Returns:

`(sampleId) => aggregatedValue`

Implementation notes:
- Use `collector.facetBatches.get(asArray(sampleId))` to get per-sample data.
- Use view encoders for x/x2 accessors and scale type to decide point vs segment.
- Compute overlaps vs interval and reduce using the selected aggregation.
- Keep this helper testable with a fake collector and simple datum arrays.

Optional: extend `AttributeInfo` with a `valuesProvider` to support dialogs.
The provider returns per-sample aggregated values for a given scope:

`valuesProvider({ sampleIds, interval, aggregation }) => any[]`

Dialogs (quantitative or categorical) can then build histograms or category
counts from the aggregated values without knowing about collectors or marks.

### Action Payloads
Existing actions (`filterByQuantitative`, `groupByNominal`, etc.) can be reused.
The payload adds an aggregation spec to the attribute identifier. No reducer
changes are required.

### Action Info Formatting
Extend `actionInfo` to render aggregation specs into readable titles, e.g.:

- "Retain samples having max logR in CCNE1 >= 2"
- "Group by count(mutations in TP53)"

Formatting rules can live next to the existing handlers.

### Context Menu Flow (3 Levels)
Menu structure for interval-based analysis:
1. Mark/field (existing level based on encoded fields)
2. Aggregation op (min/max/weighted mean/count)
3. Sample op (filter/group/sort; reuse existing action templates)

The interval should come from the active brush/selection rectangle (see
`packages/core/src/view/gridView/gridChild.js`), and the menu should only expose
aggregation options when a selection interval is present. Otherwise, hide them.

## Implementation Plan (Proposed)
1. Define an aggregation spec shape in `packages/app/src/sampleView/types.d.ts`
   and `packages/app/src/sampleView/state/payloadTypes.d.ts` so action payloads
   can carry the interval/aggregation details.
2. Introduce a pure helper module, e.g.
   `packages/app/src/sampleView/attributeAggregation.js`, that computes an
   aggregated value from a batch + accessors + interval + mode.
3. Add a factory (new module or within
   `packages/app/src/sampleView/viewAttributeInfoSource.js`) that builds the
   per-sample accessor using the helper and the view's collector/encoders.
4. Update `packages/app/src/sampleView/state/actionInfo.js` to render aggregation
   op and interval in provenance titles.
5. Add focused tests for the helper (segments vs points, discrete vs continuous)
   and for action-info formatting.

### Key Files (Modify / Add)
Modify:
- `packages/app/src/sampleView/viewAttributeInfoSource.js` (use aggregated accessor factory)
- `packages/app/src/sampleView/types.d.ts` (aggregation spec and interval type)
- `packages/app/src/sampleView/state/payloadTypes.d.ts` (payload typing)
- `packages/app/src/sampleView/state/actionInfo.js` (format aggregation in titles)

Add:
- `packages/app/src/sampleView/attributeAggregation.js` (pure aggregation helper)
- `packages/app/src/sampleView/attributeAggregation.test.js` (unit tests)

Optional:
- `packages/app/src/sampleView/attributeAccessors.js` (accessor factory wrapper)

### Testing Ideas
- Unit tests for aggregation helper:
  - Segments: overlap vs enclosure modes, coverage, weighted mean, max/min
  - Points: count/any within interval, max field
  - Chromosomal vs numeric interval inputs
  - No overlaps returns `undefined` (except `count` returns `0`)
- ActionInfo tests:
  - Titles include aggregation op and formatted interval
  - Comparison operators are handled by existing quantitative filters

## Step-by-Step Execution Plan (With Checkpoints)
After each phase, run: `npm test`, `npm -ws run test:tsc --if-present`, and
`npm run lint`.
After completing an item or phase, update this document and mark it DONE.

### Phase 1: Remove Mark-Level Data Access
Goal: eliminate `mark.findDatumAt` usage and centralize data lookup near
SampleView/attribute accessors.

Steps:
1. DONE: Add a pure datum-lookup helper that uses collector data + accessors.
2. DONE: Replace `view.mark.findDatumAt` in `viewAttributeInfoSource.js` with the helper.
3. DONE: Replace `view.mark.findDatumAt` in `sampleView.js` context menu with the helper.
4. DONE: Add unit tests for the helper (discrete vs continuous, point vs segment).

Checkpoint 1:
- DONE: No `findDatumAt` calls remain in app code.
- DONE: Context menu still shows per-sample “value at locus”.
- DONE: Tests cover the lookup helper.
- DONE: Run `npm test`, `npm -ws run test:tsc --if-present`, `npm run lint`.

### Phase 2: Introduce Aggregation Spec + Accessor Factory
Goal: define interval-based aggregation and expose it via accessors.

Steps:
1. DONE: Extend types to include aggregation spec and interval format.
2. DONE: Add `attributeAggregation.js` with min/max/weighted mean/count implemented
   as small, pure, testable functions.
3. DONE: Add an accessor factory that returns `(sampleId) => aggregatedValue`,
   normalizing point queries to `[p, p]`.
4. DONE: Wire `viewAttributeInfoSource.js` to use the accessor factory.
5. DONE: Run `npm test`, `npm -ws run test:tsc --if-present`, `npm run lint`.

Checkpoint 2:
- Aggregated accessors return expected values for test data.
- Point queries still behave like the old “value at locus”.

### Phase 3: Dialog Support via valuesProvider
Goal: enable histogram/category dialogs to use aggregated values.

Steps:
1. DONE: Extend `AttributeInfo` with `valuesProvider({ sampleIds, interval, aggregation })`.
2. DONE: Update dialogs in `attributeDialogs/` to use `valuesProvider` when present.
3. DONE: Add tests verifying dialog inputs use aggregated values.
4. DONE: Run `npm test`, `npm -ws run test:tsc --if-present`, `npm run lint`.

Checkpoint 3:
- Threshold and advanced filter dialogs build histograms from aggregated values.
- Categorical dialogs still work for nominal data.

### Phase 4: Context Menu for Aggregations
Goal: enable brush-driven aggregate selection workflow.

Steps:
1. DONE: Read active brush interval from selection params in the view hierarchy
   (single shared interval for the sampleView subtree, excluding sidebar/metadata).
2. DONE: Show aggregation ops only when a brush is active and the context click is
   inside the brush interval.
3. DONE: Add submenu flow: field → aggregation → sample op.
4. DONE: Run `npm test`, `npm -ws run test:tsc --if-present`, `npm run lint`.

Checkpoint 4:
- Menus hide aggregation ops without an active brush.
- Aggregation selection flows into existing sample actions.

## Interval Inclusion Semantics (HitTestMode)
Interval-based aggregation should honor mark-specific inclusion rules to match
interactive selection behavior. Use `HitTestMode` (see `packages/core/src/marks/mark.js`)
to decide whether a datum is included for a given interval.

Examples:
- Segment-like rects: include on intersection vs enclosure depending on mode.
- Link/arcs: include only if the interval encloses either endpoint, not by overlap.
- Points: include if the point lies within the interval.

The aggregation helper should accept a mode (explicit or derived from the mark)
and apply the corresponding predicate before aggregating.

## Open Questions
- Do we need interval specs for non-genomic x scales?
- Do we need caching for repeated queries during interactive filtering?

## Out of Scope (for now)
- Building per-sample spatial indexes for fast interval queries.
- A full UI for composing arbitrary aggregation specs.
- New reducer types; the intent is to reuse existing actions.

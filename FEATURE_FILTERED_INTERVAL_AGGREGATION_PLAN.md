# Feature-Filtered Interval Aggregation Plan

## Goal

Allow interval aggregation attributes to aggregate only features that match a
feature-level predicate. The result should still behave as a normal
`AttributeIdentifier`, so it can be used by metadata derivation, filtering,
sorting, grouping, summaries, and plots.

Conceptually, this extends the current interval aggregation:

```sql
SELECT count(*)
FROM mutations
WHERE pos BETWEEN 1234 AND 2345
GROUP BY sampleId;
```

to:

```sql
SELECT count(*)
FROM mutations
WHERE pos BETWEEN 1234 AND 2345
  AND functionalCategory = 'frameshift'
GROUP BY sampleId;
```

## Design Principles

- Treat this as a new interval aggregation capability, not as a metadata-only
  feature.
- Expose the first UI through metadata derivation to keep the initial workflow
  focused and inspectable.
- Keep the underlying attribute representation generic so later UI can use the
  same filtered aggregation directly for filtering, plotting, grouping, and
  sorting.
- Use one predicate structure across new code paths where practical.
- Keep the first version intentionally limited to one leaf predicate. Boolean
  logic can be added later if a concrete need appears.

## Implementation Workflow

- Implement one numbered step at a time.
- Run focused verification for the step before moving on.
- Commit after each completed implementation step.
- After each step, re-evaluate the assumptions and feasibility of the remaining
  plan against what the implementation revealed.
- Update this plan before starting the next step if any assumption changed,
  work grew unexpectedly, or a simpler path became available.

## Predicate Shape

Selection expansion already has predicate types, including boolean logic, but
they are tied to selection expansion and include origin-specific constructs such
as `valueFromField`.

Introduce a generic predicate type for feature filters:

```ts
export type FeatureFilter =
    | {
          field: string;
          operator: "eq";
          value: Scalar | null;
      }
    | {
          field: string;
          operator: "in";
          values: (Scalar | null)[];
      }
    | {
          field: string;
          operator: "lt" | "lte" | "gt" | "gte";
          value: number;
      };
```

Use `operator` and `value`/`values` for new predicate payloads. Do not copy the
older `op`/`operand` pairing into this feature. Do not include `and`, `or`, or
`not` in the initial schema; keeping the tool-facing shape flat should make it
easier for agents and users to construct valid filters.

## Data Model

Extend interval-backed view attributes with an optional feature filter:

```ts
export interface IntervalSpecifier extends BaseSpecifier {
    interval: IntervalReference;
    aggregation: AggregationSpec;
    featureFilter?: FeatureFilter;
}
```

Example:

```js
{
  type: "VALUE_AT_LOCUS",
  specifier: {
    view: { scope: [], view: "mutations" },
    field: "VAF",
    interval: {
      type: "selection",
      selector: { scope: [], param: "brush" }
    },
    aggregation: { op: "max" },
    featureFilter: {
      field: "functionalCategory",
      operator: "eq",
      value: "frameshift"
    }
  }
}
```

## Implementation Steps

1. Add generic predicate types and evaluator helpers.
   - Create a shared predicate module for app-level datum predicates.
   - Support `eq`, `in`, `lt`, `lte`, `gt`, and `gte`.
   - Keep field access simple initially: literal datum keys only.
   - Leave boolean composition out of scope for the initial implementation.
   - Status: implemented in `packages/app/src/utils/predicates/featureFilter`.
     Numeric comparisons reuse shared comparison helpers and keep existing
     JavaScript comparison semantics.

2. Add `featureFilter` to interval specifier types.
   - Update `sampleViewTypes.d.ts`.
   - Update generated app/agent schemas if needed.
   - Add docs that describe the filter as applying before aggregation.
   - Status: implemented. `FeatureFilter` now lives in
     `sampleViewTypes.d.ts` so generated app-agent schemas can include the
     filter shape. The predicate evaluator imports that type through JSDoc to
     avoid a second source of truth.

3. Apply `featureFilter` in interval aggregation accessors.
   - Update `createViewAttributeAccessor`.
   - Evaluate the predicate before values and weights are collected.
   - Preserve current `count` semantics: no matching features should yield `0`;
     non-count aggregations should yield `undefined`.
   - Status: implemented. Filtering is applied before interval-matching
     features are added to aggregation values and weights. Existing aggregation
     behavior already covers empty filtered results.

4. Improve titles and generated names.
   - Include the feature filter in `AttributeInfo.title` and
     `emphasizedName`.
   - Use compact symbolic titles such as
     `max(VAF where functionalCategory = frameshift)`.
   - Update derived metadata name generation so filtered aggregations produce
     readable defaults such as `max_frameshift_VAF` or
     `frameshift_mutation_count`.
   - Status: implemented for the current leaf `FeatureFilter` shape. Generated
     names use the filter value for equality and set filters, and include the
     filter field for numeric threshold filters.

5. Expose filterable feature fields.
   - Extend selection aggregation candidate discovery to report only compact
     filterable field metadata, not precomputed filter variants.
   - Include only structural information: field name, type, title/description
     if available, and whether the field is usable as a feature filter.
   - Initially expose only encoded fields from visible, addressable views. Do
     not inspect or expose unencoded fields that merely happen to be present in
     the view data.
   - Do not include categorical values, numeric extents, thresholds, or value
     distributions in `selectionAggregation.fields`.
   - Keep volatile agent context small. Candidate context should tell the agent
     what can be inspected, not contain the inspection results.
   - Avoid showing hidden or unaddressable fields.
   - Status: implemented for encoded non-positional fields on visible,
     addressable views. `selectionAggregation.fields` now carries structural
     `filterableFields` metadata without value summaries or filtered candidate
     variants.

6. Add lazy feature-field summary support.
   - Existing `getAttributeSummary` summarizes sample-level attributes after
     aggregation, so it cannot answer raw feature-filter questions directly.
   - Existing `searchViewDatums` searches configured searchable views, but it is
     not a general field summary tool.
   - Add an app-side helper for summarizing one raw feature field in the selected
     interval and candidate view before per-sample aggregation.
   - Expose this as a separate agent tool rather than overloading
     `getAttributeSummary`. A possible name is
     `getSelectionFeatureFieldSummary`.
   - Reuse existing summary conventions where possible: exact value counts for
     bounded categorical fields, numeric extent or histogram for quantitative
     fields.
   - Use this helper from the filter dialog when the compact candidate metadata
     is insufficient.
   - Use this helper from the agent when exact filter values or numeric bounds
     are needed.
   - Status: implemented for the agent path. App exposes raw feature values for
     one encoded field inside a selected interval, and the agent exposes
     `getSelectionFeatureFieldSummary` for lazy categorical or quantitative
     summaries. Dialog reuse remains for the later UI step.

7. Add the first UI entry point.
   - Keep the existing interval aggregation operation submenu unchanged.
   - Append `Filter features and aggregate...` under `Interval aggregation`.
   - Open a dedicated dialog that lets the user choose:
     - feature filter field
     - predicate operator and value(s)
     - aggregation operation
     - aggregation field, except for item count
   - Then pass the resulting filtered aggregation attribute into the existing
     derived metadata dialog for name, group, and scale configuration.
   - Status: implemented as the first metadata-derivation entry point. The
     aggregation field remains selected by the existing field submenu, and the
     dialog chooses the feature filter and aggregation operation before handing
     the resulting attribute to the derived metadata dialog.

8. Convert the feature-filtered metadata derivation flow into a wizard.
   - Keep the generic `showDerivedMetadataDialog` path for existing direct
     "Add to sample metadata..." actions. That dialog is still useful when an
     `AttributeInfo` already exists and no feature-filter setup is needed.
   - Replace the current two-modal feature-filter flow with a single multi-step
     dialog modeled after `UploadMetadataDialog`.
   - Page 1: configure feature filter field, predicate, and aggregation.
   - Page 2: configure the derived metadata name, optional group path, and
     scale.
   - When advancing from page 1 to page 2, build the filtered interval
     `AttributeInfo`, compute sample ids and values, and validate that the
     derived values align with samples.
   - Reuse the existing derived metadata name, validation, default scale,
     observed-domain, and scale sanitization helpers.
   - Prefer extracting the final-page name/group/scale controls from
     `DerivedMetadataDialog` into a small reusable derived metadata
     configurator if the wizard would otherwise duplicate form validation,
     scale configuration, or payload construction.
   - Do not start with a generic `<gs-wizard-dialog>` component or mixin.
     Implement the feature-filtered wizard page flow locally first, following
     the `UploadMetadataDialog` page-array pattern.
   - After the second wizard exists, compare it with `UploadMetadataDialog`.
     If the navigation duplication is real, extract only the shared page-state
     mechanics into a small helper/controller: current page, first/last page,
     `canAdvance`, `advance(direction)`, and Next/Finish labeling. Keep page
     rendering and domain validation in each dialog.
   - Finish should dispatch the same `deriveMetadata` intent as
     `handleAddToMetadata`.
   - Status: implemented. The feature-filtered aggregation flow now uses a
     two-page wizard. `DerivedMetadataDialog` remains available for direct
     "Add to sample metadata..." actions, and both paths share the extracted
     `gs-derived-metadata-configurator` for name, group, and scale
     configuration. Shared page-state mechanics were extracted into
     `DialogWizardController` after comparing the feature-filtered wizard with
     `UploadMetadataDialog`.

9. Reuse generic components.
   - Use `gs-comparison-operator-buttons` for quantitative predicates.
   - Use `gs-searchable-checkbox-list` for categorical predicates.
   - Add or update Storybook stories if a new predicate editor component is
     extracted.
   - Status: implemented in the first dialog. Quantitative predicates use
     `gs-comparison-operator-buttons`, and categorical predicates use
     `gs-searchable-checkbox-list` with values collected from raw features in
     the selected interval. No new component was extracted, so the existing
     component stories remain sufficient.

10. Add agent support.
   - Extend `SELECTION_AGGREGATION` agent candidates with optional
     `featureFilter`.
   - Validate that `candidateId` and `aggregation` are copied from context.
   - Validate `featureFilter` shape and supported operators.
   - Keep the tool schema flat by accepting only one feature filter leaf.
   - Do not enumerate feature-filtered candidates in
     `selectionAggregation.fields`.
   - If the agent needs exact filter values or numeric bounds, call the lazy
     feature-field summary tool using `candidateId` and field name.
   - Explain the semantics as:
     `WHERE selected interval AND featureFilter GROUP BY sample`.
   - Status: implemented. Agent-facing `SELECTION_AGGREGATION` candidates
     accept one optional leaf `featureFilter`, validate its field against
     `filterableFields`, and materialize it into the canonical interval
     attribute.

11. Add tests.
   - Predicate evaluator unit tests.
   - Interval aggregation accessor tests for categorical and quantitative
     feature filters.
   - Count vs non-count empty-result behavior.
   - Candidate metadata tests that verify feature-filter variants are not
     enumerated.
   - Lazy feature-field summary tests for low- and high-cardinality fields.
   - Action/agent shape validation tests for filtered selection aggregation
     candidates.
   - UI tests or focused component tests for the dialog if practical.
   - Status: completed with focused coverage across the implementation:
     predicate evaluator tests, interval aggregation accessor tests, candidate
     metadata tests, lazy feature-field summary tests, agent materialization and
     action-shape validation tests, and a context-menu entry-point test. The
     dialog itself is covered through type checking and linting; no separate
     browser-level dialog test was added in this pass.

## UI Notes

Initial menu:

```text
Interval aggregation
  Item count
  Minimum
  Maximum
  Weighted mean
  Variance
  Filter features and aggregate...
```

Dialog sentence target:

```text
For each sample, count mutations in the selected region where
functionalCategory is frameshift.
```

or:

```text
For each sample, compute max(VAF) in the selected region where
functionalCategory is frameshift.
```

## Open Questions

- Should categorical values be summarized over the selected interval only, or
  over all currently loaded features for the candidate view?
- Should the raw-feature summary tool accept an optional `featureFilter` so the
  user or agent can inspect a second field after narrowing by the first?
- If boolean logic is needed later, should it be added to the internal feature
  filter shape first, or exposed through a separate advanced query builder?

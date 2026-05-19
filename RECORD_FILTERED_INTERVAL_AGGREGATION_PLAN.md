# Record-Filtered Interval Aggregation Plan

## Goal

Allow interval aggregation attributes to aggregate only records that match a
record-level predicate. The result should still behave as a normal
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

Introduce a generic predicate type for record filters:

```ts
export type RecordFilter =
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

Extend interval-backed view attributes with an optional record filter:

```ts
export interface IntervalSpecifier extends BaseSpecifier {
    interval: IntervalReference;
    aggregation: AggregationSpec;
    recordFilter?: RecordFilter;
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
    recordFilter: {
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
   - Status: implemented in `packages/app/src/utils/predicates/recordFilter`.
     Numeric comparisons reuse shared comparison helpers and keep existing
     JavaScript comparison semantics.

2. Add `recordFilter` to interval specifier types.
   - Update `sampleViewTypes.d.ts`.
   - Update generated app/agent schemas if needed.
   - Add docs that describe the filter as applying before aggregation.
   - Status: implemented. `RecordFilter` now lives in
     `sampleViewTypes.d.ts` so generated app-agent schemas can include the
     filter shape. The predicate evaluator imports that type through JSDoc to
     avoid a second source of truth.

3. Apply `recordFilter` in interval aggregation accessors.
   - Update `createViewAttributeAccessor`.
   - Evaluate the predicate before values and weights are collected.
   - Preserve current `count` semantics: no matching records should yield `0`;
     non-count aggregations should yield `undefined`.
   - Status: implemented. Filtering is applied before interval-matching
     records are added to aggregation values and weights. Existing aggregation
     behavior already covers empty filtered results.

4. Improve titles and generated names.
   - Include the record filter in `AttributeInfo.title` and
     `emphasizedName`.
   - Use compact symbolic titles such as
     `max(VAF where functionalCategory = frameshift)`.
   - Update derived metadata name generation so filtered aggregations produce
     readable defaults such as `max_frameshift_VAF` or
     `frameshift_mutation_count`.
   - Status: implemented for the current leaf `RecordFilter` shape. Generated
     names use the filter value for equality and set filters, and include the
     filter field for numeric threshold filters.

5. Expose filterable record fields.
   - Extend selection aggregation candidate discovery to report only compact
     filterable field metadata, not precomputed filter variants.
   - Include only structural information: field name, type, title/description
     if available, and whether the field is usable as a record filter.
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

6. Add lazy record-field summary support.
   - Existing `getAttributeSummary` summarizes sample-level attributes after
     aggregation, so it cannot answer raw record-filter questions directly.
   - Existing `searchViewDatums` searches configured searchable views, but it is
     not a general field summary tool.
   - Add an app-side helper for summarizing one raw record field in the selected
     interval and candidate view before per-sample aggregation.
   - Expose this as a separate agent tool rather than overloading
     `getAttributeSummary`. A possible name is
     `getSelectionRecordFieldSummary`.
   - Reuse existing summary conventions where possible: exact value counts for
     bounded categorical fields, numeric extent or histogram for quantitative
     fields.
   - Use this helper from the filter dialog when the compact candidate metadata
     is insufficient.
   - Use this helper from the agent when exact filter values or numeric bounds
     are needed.
   - Status: implemented for the agent path. App exposes raw record values for
     one encoded field inside a selected interval, and the agent exposes
     `getSelectionRecordFieldSummary` for lazy categorical or quantitative
     summaries. Dialog reuse remains for the later UI step.

7. Add the first UI entry point.
   - Keep the existing interval aggregation operation submenu unchanged.
   - Append `Filter records and aggregate...` under `Interval aggregation`.
   - Open a dedicated dialog that lets the user choose:
     - record filter field
     - predicate operator and value(s)
     - aggregation operation
     - aggregation field, except for item count
   - Then pass the resulting filtered aggregation attribute into the existing
     derived metadata dialog for name, group, and scale configuration.

8. Reuse generic components.
   - Use `gs-comparison-operator-buttons` for quantitative predicates.
   - Use `gs-searchable-checkbox-list` for categorical predicates.
   - Add or update Storybook stories if a new predicate editor component is
     extracted.

9. Add agent support.
   - Extend `SELECTION_AGGREGATION` agent candidates with optional
     `recordFilter`.
   - Validate that `candidateId` and `aggregation` are copied from context.
   - Validate `recordFilter` shape and supported operators.
   - Keep the tool schema flat by accepting only one record filter leaf.
   - Do not enumerate record-filtered candidates in
     `selectionAggregation.fields`.
   - If the agent needs exact filter values or numeric bounds, call the lazy
     record-field summary tool using `candidateId` and field name.
   - Explain the semantics as:
     `WHERE selected interval AND recordFilter GROUP BY sample`.

10. Add tests.
   - Predicate evaluator unit tests.
   - Interval aggregation accessor tests for categorical and quantitative
     record filters.
   - Count vs non-count empty-result behavior.
   - Candidate metadata tests that verify record-filter variants are not
     enumerated.
   - Lazy record-field summary tests for low- and high-cardinality fields.
   - Action/agent shape validation tests for filtered selection aggregation
     candidates.
   - UI tests or focused component tests for the dialog if practical.

## UI Notes

Initial menu:

```text
Interval aggregation
  Item count
  Minimum
  Maximum
  Weighted mean
  Variance
  Filter records and aggregate...
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
  over all currently loaded records for the candidate view?
- Should the raw-record summary tool accept an optional `recordFilter` so the
  user or agent can inspect a second field after narrowing by the first?
- If boolean logic is needed later, should it be added to the internal record
  filter shape first, or exposed through a separate advanced query builder?

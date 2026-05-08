# Retain Categories Based on Another Attribute

Plan for [issue #370](https://github.com/genome-spy/genome-spy/issues/370).

## Goal

Add an App action that keeps all samples in a category when at least one sample
with the same category satisfies a condition on another attribute.

Example:

```sql
SELECT *
FROM samples
WHERE patient IN (
    SELECT patient
    FROM samples
    WHERE TP53_mutation_count > 0
)
```

In GenomeSpy terms, a user should be able to derive a metadata column such as
`TP53_mutation_count`, then retain all samples whose `patient` value has at
least one sample where `TP53_mutation_count > 0`.

## Scope

Implement the first slice for metadata attributes in the App:

- Category attribute: nominal or ordinal metadata, for example `patient`.
- Condition attribute: quantitative, nominal, or ordinal metadata, for example
  `TP53_mutation_count` or `diagnosis`.
- Quantitative condition: threshold comparison using the existing operators
  `lt`, `lte`, `eq`, `gte`, and `gt`.
- Categorical condition: membership using the `in` operator and a `values`
  array. Multi-value categorical conditions can require either any selected
  value or all selected values to occur within the retained category.

Conditions on non-metadata attributes can be added later after the state action
exists.

## Implementation Steps

1. Add a new sample action in
   `packages/app/src/sampleView/state/sampleSlice.js`.

   Suggested name: `retainCategoriesByAttribute`.

   The action payload should include:

   - `attribute`: the attribute whose category values are retained.
   - `condition.attribute`: the attribute tested inside each category.
   - `condition.operator`: comparison operator.
   - `condition.operand`: numeric threshold.

   The reducer should find category values where at least one current sample
   satisfies the condition, then retain every current sample whose category
   value is in that set.

2. Extend action augmentation in
   `packages/app/src/sampleView/state/sampleSlice.js`.

   `augmentAttributeAction(...)` currently handles actions with one
   `payload.attribute`. Add a special path for the new action that resolves and
   stores values for both `attribute` and `condition.attribute`.

   Keep reducers pure by storing the category values in `_augmented.values` and
   the condition values in `_augmented.conditionValues`.

3. Add or extend operation helpers in
   `packages/app/src/sampleView/state/sampleOperations.js`.

   Suggested helper:

   ```js
   retainCategoriesByCondition(samples, categoryAccessor, conditionAccessor, operator, operand)
   ```

   This helper should preserve sample order and only filter the sample array.

4. Update payload types in
   `packages/app/src/sampleView/state/payloadTypes.d.ts`.

   Add a `RetainCategoriesByAttribute` interface. Document the user-visible
   semantics because these payload docs are also used by agent/schema behavior.

5. Add provenance and menu labels in
   `packages/app/src/sampleView/state/actionInfo.js`.

   The label should mention both attributes and the threshold, for example:

   `Retain patient values where any sample has TP53 mutation count >= 1`

   Reuse the existing operator formatting used by `filterByQuantitative`.

6. Add context-menu UI in
   `packages/app/src/sampleView/attributeContextMenu.js`.

   When the active attribute is nominal or ordinal, add a submenu such as:

   - `Retain patient values based on another attribute`
   - one entry per eligible metadata attribute except the active category
     attribute
   - quantitative quick actions such as `> 0`, `>= 1`, `= 0`, or
     `Choose custom threshold...`
   - categorical quick actions such as `= AML` or `= primary`

   Menu labels must follow the existing convention that `...` is reserved for
   items that open a dialog. Submenu-opening items should not use an ellipsis.
   The top-level label should include the selected attribute name when possible,
   for example `Retain patient values based on another attribute`.

   Attribute candidates in the next submenu should indicate their type. The
   mockup uses `#` for quantitative attributes and `A` for categorical
   attributes, which makes the list easier to scan. Match the existing menu
   icon style where possible. Candidate labels should use normal text, not
   full italic emphasis, even though they refer to attributes.

   The condition submenu should include a short header that makes the action
   semantics explicit before listing concrete predicates. For example, after
   choosing `TP53_mutation_count`, show:

   `Retain patient values where any sample has TP53_mutation_count...`

   Then list predicates such as `> 0`, `>= 1`, `= 0`, and
   `Choose custom threshold...`. The custom-threshold item keeps the ellipsis
   because it opens a dialog.

   For categorical condition attributes, list one `= <value>` item per
   category value for the first implementation. Multi-value categorical
   predicates can be added later with a chooser dialog if needed.

7. Add a small threshold dialog only if quick actions are not enough.

   Reuse patterns from:

   - `packages/app/src/sampleView/attributeDialogs/advancedAttributeFilterDialog.js`
   - `packages/app/src/sampleView/attributeDialogs/groupByThresholdsDialog.js`

   The dialog should choose an operator and numeric operand, then dispatch the
   new sample action.

8. Extract the searchable checkbox list into a reusable web component.

   This is a standalone refactor and should be reviewed before implementing
   the categorical multi-value functionality.

   `DiscreteAttributeFilterDialog` in
   `packages/app/src/sampleView/attributeDialogs/advancedAttributeFilterDialog.js`
   currently owns the search field, filtered checkbox list, selected count,
   keyboard navigation, exact-match Enter behavior, empty-search note, and
   optional category marker rendering. Extract that behavior into a reusable Lit
   component, for example `gs-searchable-checkbox-list`, under
   `packages/app/src/components/generic/` or near the sample-view dialogs if a
   narrower component is cleaner.

   The component should support:

   - a list of values with display labels and lowercase search text
   - externally provided selected values
   - a `change` event that reports the selected values
   - optional per-item marker rendering for the existing color swatches
   - the current keyboard behavior from the discrete filter dialog
   - stable list sizing while filtering

   After extraction, update `DiscreteAttributeFilterDialog` to use the new
   component without changing its user-visible behavior.

   Add a Storybook story for the checkbox-list component so the extracted UI
   can be reviewed independently of the sample-view dialogs.

9. Add categorical multi-value condition functionality.

   This is a separate feature change and should be reviewed independently from
   the component extraction.

   Add a dialog for categorical condition attributes that uses the reusable
   checkbox-list component to select multiple values. The context menu should
   keep single-value quick actions such as `= AML`, and add a
   `Choose values...` item for the dialog because it opens a dialog.

   Extend categorical conditions with an explicit group-level requirement:

   ```js
   {
       attribute: conditionAttribute,
       operator: "in",
       values: ["AML", "MDS"],
       required: "any" | "all"
   }
   ```

   `required: "any"` keeps the current semantics: retain a category when at
   least one sample in that category has a condition value in `values`.

   `required: "all"` retains a category only when every selected value occurs
   in at least one sample in that category. This requires reducer/helper logic
   that groups observed condition values by retained category; it cannot be
   implemented as a per-sample predicate alone.

   The dialog should make this choice explicit with concise labels, for example:

   - `Any selected value exists`
   - `All selected values exist`

   Update action info so provenance distinguishes the two cases clearly.

10. Investigate whether predicate result counts are useful and feasible.

   The mockup shows counts such as `(3 patients, 9 samples)` next to each
   predicate. This is useful only if the wording is easy to understand. Counting
   retained samples is straightforward after the action helper exists, but
   counting retained category values may need careful labeling because the
   category name is dynamic.

   A possible implementation path:

   - For each quick predicate, compute retained attribute values from current
     samples using the same helper as the reducer.
   - Count retained samples by applying those retained values to the current
     sample groups.
   - Format the result with the selected attribute name, for example
     `(3 patient values, 9 samples)`.

   Treat this as a UI refinement unless user testing shows that the count
   preview materially improves confidence.

11. Add focused tests.

   Add tests to:

   - `packages/app/src/sampleView/state/sampleOperations.test.js`
   - `packages/app/src/sampleView/state/sampleSlice.test.js`
   - context-menu tests if the menu builder gets non-trivial candidate logic

   Required cases:

   - An attribute value is retained when one member satisfies the condition.
   - All samples with a retained attribute value are kept, including members
     that do not satisfy the condition themselves.
   - Attribute values with no satisfying samples are removed.
   - Current sample group boundaries are respected if the reducer uses
     `applyToSamples(...)`.
   - Both attributes are augmented before the reducer runs.
   - Categorical `required: "any"` retains categories with at least one
     selected value.
   - Categorical `required: "all"` retains only categories containing every
     selected value.

12. Document the action in
   `docs/sample-collections/analyzing.md`.

   Add a short user-facing section under "The actions", near the existing
   retention/filtering actions. The text should explain that the action keeps
   all samples for an attribute value when at least one sample with that value
   matches a condition on another attribute.

   Example wording:

   > This action retains all samples whose value in the selected attribute has
   > at least one sample satisfying a condition on another attribute. For
   > example, after deriving a
   > `TP53_mutation_count` metadata column, you can keep all samples from
   > patients with at least one sample where `TP53_mutation_count > 0`.

## Verification

Run focused tests:

```sh
npx vitest run packages/app/src/sampleView/state/sampleOperations.test.js packages/app/src/sampleView/state/sampleSlice.test.js
```

If context-menu tests are added, include the relevant suite as well.

No Core changes are expected for the first slice. Documentation in `docs/` is
needed because the action is part of the documented interactive sample
collection workflow.

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
- Condition attribute: quantitative metadata, for example
  `TP53_mutation_count`.
- Condition: threshold comparison using the existing operators
  `lt`, `lte`, `eq`, `gte`, and `gt`.

Categorical condition attributes and conditions on non-metadata attributes can
be added later after the state action exists.

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

   `Retain patient categories where TP53 mutation count >= 1`

   Reuse the existing operator formatting used by `filterByQuantitative`.

6. Add context-menu UI in
   `packages/app/src/sampleView/attributeContextMenu.js`.

   When the active attribute is nominal or ordinal, add a submenu such as:

   - `Retain categories based on...`
   - one entry per eligible metadata attribute except the active category
     attribute
   - quantitative quick actions such as `> 0`, `>= 1`, or
     `Choose custom threshold...`

   For the first implementation, list only quantitative metadata attributes as
   condition candidates.

7. Add a small threshold dialog only if quick actions are not enough.

   Reuse patterns from:

   - `packages/app/src/sampleView/attributeDialogs/advancedAttributeFilterDialog.js`
   - `packages/app/src/sampleView/attributeDialogs/groupByThresholdsDialog.js`

   The dialog should choose an operator and numeric operand, then dispatch the
   new sample action.

8. Add focused tests.

   Add tests to:

   - `packages/app/src/sampleView/state/sampleOperations.test.js`
   - `packages/app/src/sampleView/state/sampleSlice.test.js`
   - context-menu tests if the menu builder gets non-trivial candidate logic

   Required cases:

   - A category is retained when one member satisfies the condition.
   - All samples in a retained category are kept, including members that do not
     satisfy the condition themselves.
   - Categories with no satisfying samples are removed.
   - Current sample group boundaries are respected if the reducer uses
     `applyToSamples(...)`.
   - Both attributes are augmented before the reducer runs.

9. Document the action in
   `docs/sample-collections/analyzing.md`.

   Add a short user-facing section under "The actions", near the existing
   retention/filtering actions. The text should explain that the action keeps
   all samples in a category when at least one sample in that category matches a
   condition on another attribute.

   Example wording:

   > This action retains all samples from categories where at least one sample
   > satisfies a condition on another attribute. For example, after deriving a
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

# Retain Categories Follow-Up Findings

Follow-up review notes for [issue #370](https://github.com/genome-spy/genome-spy/issues/370).

## Findings

1. `attributeContextMenu.js` still uses deprecated `AttributeInfo.name` when
   building the retain-condition attribute tree.

   Use the stable sample-metadata specifier as the path key instead, after
   narrowing to `SAMPLE_ATTRIBUTE`. Display labels can continue to use
   `node.part`, `title`, or `emphasizedName` as appropriate.

2. The agent-facing JSDoc for `retainCategoriesByAttribute` in `sampleSlice.js`
   still describes only the original quantitative-condition form.

   Update it to mention categorical `operator: "in"` conditions and
   `required: "any" | "all"` so agent/schema behavior matches the implemented
   payload.

3. `actionInfo.js` uses `attributeTitle` for both the menu title and provenance
   title of `retainCategoriesByAttribute`.

   Most neighboring action handlers use concise `attributeName` for menu titles
   and richer `attributeTitle` for provenance. Consider matching that pattern.

4. Categorical quick predicates in `attributeContextMenu.js` use the scale
   domain directly when one exists.

   The custom dialog filters to present values, but the menu can show quick
   actions for values not present in the current samples. Consider filtering
   domain values to present values in the menu too.

5. `docs/sample-collections/analyzing.md` documents the quantitative example
   but not categorical `in` conditions or the `any`/`all` requirement.

   Update the docs if categorical conditions should be user-facing in this
   release.

## Verification

The following checks passed during the review:

```sh
npx vitest run packages/app/src/sampleView/state/sampleOperations.test.js packages/app/src/sampleView/state/sampleSlice.test.js packages/app/src/sampleView/state/actionInfo.test.js
npm --workspaces run test:tsc --if-present
```

ESLint also passed on the main touched implementation files.

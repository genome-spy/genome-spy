# LLM Annotation Style Guide

This guide defines how to annotate reducers, payload types, and related docs so
the agent catalog and JSON Schema can be generated from code instead of a
hand-written mirror.

## Source Split
- Reducer JSDoc in slice files: action meaning, usage, examples.
- Payload JSDoc in typed payload definitions: field semantics, constraints, examples.
- Long-form prose in `docs/sample-collections/analyzing.md`: user-facing narrative and worked examples.

## Reducer JSDoc
Use reducer JSDoc to describe the action as a user-facing capability.

Required structure:
- First sentence: one-line summary.
- Second paragraph: when to use it.
- Optional `@see`: link to long-form docs.
- Optional `@agent.*` tags for generator metadata.
- Optional `@example`: minimal JSON payload.

Recommended tags:
- `@agent.payloadType <TypeName>`
- `@agent.category <category>`
- `@agent.requiresAttribute true|false`
- `@agent.attributeKinds quantitative|nominal|ordinal|any`

Example:

```js
/**
 * Sort samples in descending order by the chosen attribute.
 *
 * Use this when the user wants to rank samples by a single field.
 * The attribute is typically quantitative or ordinal.
 *
 * @agent.payloadType SortBy
 * @agent.category sorting
 * @agent.requiresAttribute true
 * @agent.attributeKinds quantitative,ordinal
 * @see docs/sample-collections/analyzing.md#sort
 * @example
 * {
 *   "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "age" }
 * }
 */
```

## Payload JSDoc
Use payload JSDoc for field-level meaning.

Required structure:
- Describe each field in the property JSDoc.
- Use `@example` for representative values.
- Prefer standard type constraints where possible.
- Avoid repeating action semantics here.

Example:

```ts
export interface FilterByQuantitative extends PayloadWithAttribute {
    /**
     * Comparison operator used for thresholding.
     *
     * Allowed values:
     * - `lt`
     * - `lte`
     * - `eq`
     * - `gte`
     * - `gt`
     *
     * @example "gte"
     */
    operator: ComparisonOperatorType;

    /**
     * Numeric threshold used in the comparison.
     *
     * @example 0.6
     */
    operand: number;
}
```

## Per-Action Examples

`sortBy`
- Reducer doc: sort samples in descending order by the chosen attribute.
- Payload doc: `attribute`
- Example payload:

```json
{
  "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "age" }
}
```

`filterByNominal`
- Reducer doc: retain or remove samples by exact categorical values.
- Payload doc: `values`, `remove`
- Example payload:

```json
{
  "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "diagnosis" },
  "values": ["AML"]
}
```

`groupByThresholds`
- Reducer doc: group samples into bins defined by numeric thresholds.
- Payload doc: `thresholds`
- Example payload:

```json
{
  "attribute": { "type": "SAMPLE_ATTRIBUTE", "specifier": "purity" },
  "thresholds": [
    { "operator": "lte", "operand": 0.2 },
    { "operator": "lt", "operand": 0.8 }
  ]
}
```

## Generation Rules
The generator should:
- Read the reducer name and reducer JSDoc.
- Extract `@agent.*` tags and `@example`.
- Infer the payload type from `PayloadAction<import("./payloadTypes.js").X>`.
- Read `X` from `payloadTypes.d.ts`.
- Merge reducer docs and payload docs into the agent action catalog, JSON Schema, and markdown docs.

## Fallback
If inference fails, require an explicit reducer tag:

```js
@agent.payloadType FilterByQuantitative
```

This keeps extraction deterministic without returning to a fully manual catalog.

# Intent Action Type Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `getIntentActionDocs(..., includeSchema: true)` with a dedicated type documentation lookup that lets the agent inspect complex action payload field types without dumping large transitive JSON Schema closures.

**Architecture:** Keep `getIntentActionDocs` focused on action selection and top-level payload fields. Add `getIntentActionTypeDocs` for field-level type details, backed by one central agent-facing action schema projection module. Keep reducer validation, agent-facing validation, display-type resolution, and docs-only summaries as separate named rules in that module so special cases do not drift.

**Tech Stack:** JavaScript with JSDoc types, TypeScript declaration files for generated schema/catalog inputs, Vitest, AJV, generated JSON artifacts under `packages/app-agent/src/agent/generated/`.

**Agentic Contract:** `getIntentActionDocs` is for choosing an action and seeing the top-level payload fields. `getIntentActionTypeDocs` is for constructing or repairing complex field values. Tool responses should expose the next useful lookup explicitly through `referencedTypes` and validation-repair hints, so the agent does not need to infer structure from examples or large schema dumps.

---

## Feasibility Assessment

Adding a type-querying tool is feasible and likely cleaner than continuing to expand `includeSchema`, but it must not be implemented as a naive `definitions[typeName]` lookup.

The generated action catalog currently exposes `payloadFields[].type` as human-readable TypeScript text. Some values match generated JSON Schema definition names exactly. Others are primitives or TypeScript expressions that do not exist as schema definition keys.

### Currently Exposed Payload Field Types

Direct definition lookups are possible for:

- `AttributeCondition`
- `AttributeIdentifier`
- `ColumnarMetadata`
- `ComparisonOperatorType`
- `CustomGroups`
- `ParamOrigin`
- `ParamSelector`
- `ParamValue`

Exact definition lookups are not possible for:

- `string`
- `number`
- `boolean`
- `string[]`
- `any[]` (current smell; should be replaced before shipping this tool)
- `[Threshold, ...Threshold[]]`
- `Record<AttributeName, SampleAttributeDef>`
- `SampleAttributeDef["scale"] | null`

These non-definition strings are not rare edge cases. They appear in action docs for metadata import, metadata derivation, nominal filters, threshold grouping, and group removal.

### Main Caveats

1. **Display types are not schema keys.** `payloadFields[].type` is generated from TypeScript AST text for readability. It is not a stable schema address. An action type docs tool must resolve display strings through an explicit mapping layer.

2. **Agent-facing types differ from canonical action types.** `AttributeIdentifier` must resolve to the agent-facing union of `SampleAttributeIdentifier` and `SelectionAggregationCandidate`, not the canonical app-facing `AttributeIdentifier` that can describe internal view/locus structures. This is the most important caveat: solve it with one central projection module, not one-off replacements in validation, docs, prompts, and generators.

3. **Some types are broad but still useful.** `Scale` expands into much of the visualization grammar, but the agent may legitimately define simple custom scales based on Vega/GenomeSpy semantics. Type docs should return a curated construction guide with common scale fields and examples, not an empty placeholder and not the full transitive schema. The curated `Scale` response is not a validation-complete schema; omitted scale properties are not necessarily invalid.

4. **Some types require semantic guidance, not only schema.** `AttributeIdentifier` needs instructions about copying `SELECTION_AGGREGATION` candidates from `selectionAggregation.fields`. `FeatureFilter` needs instructions about copying fields from `filterableFields` and using `getSelectionFeatureFieldSummary` when values/bounds are needed. Schema alone does not capture enough behavior.

5. **The tool schema sent to the provider is not enough.** `submitIntentAction` intentionally exposes `action` as a broad object in the provider tool schema to avoid sending the full action union. The action type docs tool must therefore provide the missing detail on demand.

6. **Action schema and tool schema both define related names.** `generatedActionSchema.json` and `generatedToolSchema.json` overlap. The resolver needs a clear lookup order:
   - agent-facing overrides from `agentActionSchema.js`
   - generated action definitions for action payload types
   - generated tool definitions for agent-only helper types
   - manual resolvers for display expressions and primitives

7. **`$ref` is still useful but needs boundaries.** Type docs may keep local `$ref`s if included definitions are present. They should not recursively include every transitive definition by default. A bounded `referenceDepth` is safer than unbounded closure.

8. **Prompt and validation guidance must change together.** If `includeSchema` is removed, the server prompt and rejection messages must tell the agent to call `getIntentActionTypeDocs` for unclear field types. Otherwise the agent will keep trying the old path.

9. **Avoid `any` in agent-facing docs.** `FilterByNominal.values` currently appears as `any[]`. Replace that with a named scalar/category type before adding the action type docs tool. Do not add `any[]` as a normal supported action type docs query; generated action docs should not expose `any`.

10. **Examples may be more useful than full schema.** Type docs should support `examples?: unknown[]`, especially for `AttributeIdentifier`, `SelectionAggregationCandidate`, `FeatureFilter`, `Threshold`, and `Scale`. Curated examples keep the design simple while giving the model enough structure to act.

11. **All relevant current field types can be made queryable with an explicit resolver.** This is feasible because the current set is small. Future action payload types can break this unless tests assert every generated `payloadFields[].type` is resolvable.

12. **Generated metadata should carry structured references.** `generatedActionCatalog.json` is already the compact action-doc source. It should expose queryable type references, not force runtime code to infer everything from display strings. Add `payloadFields[].typeRefs` and derive action-level `referencedTypes` from those references.

13. **Generated schema overlap is lower priority.** `generatedActionSchema.json` and `generatedToolSchema.json` overlap heavily, but they are internal source/validation artifacts. Do not optimize their disk size in this feature. Focus on the agent-facing contract and per-turn/tool-result payloads.

14. **Prevent drift with an explicit invariant.** Generated `payloadFields[].typeRefs`, exact display-type resolution, validation schemas, and malformed-payload repair guidance must be tested as one contract. Every generated payload field type must either be directly resolvable by `getIntentActionTypeDocs` or expose non-empty `typeRefs` that are resolvable.

## Recommended Design

### Keep `getIntentActionDocs` Compact

Return:

```ts
{
    actionType: AgentActionType;
    description: string;
    usage?: string;
    payloadFields: AgentPayloadField[]; // each field includes typeRefs
    examples: unknown[];
    referencedTypes: string[];
}
```

Do not return a `schema` property from this tool.

`referencedTypes` should be derived from generated `payloadFields[].typeRefs`, not from ad hoc runtime parsing of `payloadFields[].type`. For example:

```json
{
  "payloadFields": [
    {
      "name": "attribute",
      "type": "AttributeIdentifier",
      "typeRefs": ["AttributeIdentifier"],
      "required": true
    },
    {
      "name": "scale",
      "type": "SampleAttributeDef[\"scale\"] | null",
      "typeRefs": ["Scale"],
      "required": false
    }
  ],
  "referencedTypes": ["AttributeIdentifier", "Scale"]
}
```

The tool should still accept exact displayed field types such as `SampleAttributeDef["scale"] | null`, because the model may copy them from `payloadFields[].type`. `typeRefs` is the preferred guidance path, not the only accepted input.

### Add `getIntentActionTypeDocs`

Suggested input:

```ts
export interface GetIntentActionTypeDocsToolInput {
    /**
     * Type name copied exactly from an action `payloadFields[].type` value or
     * from a previous action type docs response's `referencedTypes`.
     */
    typeName: string;

    /**
     * How far to include referenced definitions. Use `0` for only the
     * requested type, and `1` for immediate referenced types.
     */
    referenceDepth?: 0 | 1;
}
```

Suggested result:

```ts
{
    typeName: string;
    normalizedTypeName?: string;
    description?: string;
    schema: Record<string, any>;
    definitions?: Record<string, any>;
    referencedTypes: string[];
    examples?: unknown[];
    notes?: string[];
}
```

Default `referenceDepth` should be `1`.

### Resolver Coverage Required Before Shipping

The resolver must handle every currently exposed payload field type:

| Display type | Resolution |
| --- | --- |
| `AttributeIdentifier` | Agent-facing `AttributeIdentifier` overlay with `SampleAttributeIdentifier` and `SelectionAggregationCandidate`. |
| `AttributeCondition` | Generated schema definition. |
| `ColumnarMetadata` | Generated schema definition. |
| `ComparisonOperatorType` | Generated schema definition. |
| `CustomGroups` | Generated schema definition. |
| `ParamOrigin` | Generated schema definition. |
| `ParamSelector` | Generated schema definition. |
| `ParamValue` | Generated schema definition, but consider existing targeted param validation messages when describing unions. |
| `Record<AttributeName, SampleAttributeDef>` | Object map summary. Reference summarized `SampleAttributeDef` only if `referenceDepth > 0`. |
| `SampleAttributeDef["scale"] \| null` | Normalize to `Scale \| null`, return curated `Scale` construction docs and examples. Make clear that omitted scale properties are not necessarily invalid. |
| `[Threshold, ...Threshold[]]` | Non-empty array of `Threshold`; include `Threshold`. |
| `NominalFilterValue[]` or equivalent named replacement | Array of scalar/category values used by nominal filters. This should replace the current `any[]`. |
| `string[]` | Array of strings. |
| `string` | Primitive string. |
| `number` | Primitive number. |
| `boolean` | Primitive boolean. |

### Centralize Special Cases

Keep special cases in one module. The module may still expose different helpers for validation and docs, but the rules should be declared together.

Use plain object Records for string-keyed lookup tables. These rules are keyed by stable type names and serialized schema fragments, so `Record<string, ...>` is simpler than `Map` and matches the generated JSON-like data shape. Use `Map` only if identity keys, insertion-order operations, or non-string keys become necessary.

```js
/** @type {Record<string, any>} */
const agentSchemaOverrides = {
    AttributeIdentifier: {
        anyOf: [
            { $ref: "#/definitions/SampleAttributeIdentifier" },
            { $ref: "#/definitions/SelectionAggregationCandidate" },
        ],
    },
};

/** @type {Record<string, any>} */
const primitiveTypeSchemas = {
    boolean: { type: "boolean" },
    number: { type: "number" },
    string: { type: "string" },
};

function resolveDisplayTypeExpression(typeName, definitions) {
    // Handles only the TypeScript-ish display forms emitted by the action
    // catalog: primitives, T[], [T, ...T[]], Record<K,V>, unions, and
    // indexed access such as SampleAttributeDef["scale"].
}

/** @type {Record<string, { schema: any }>} */
const docsOnlyTypeSummaries = {
    Scale: {
        schema: {
            type: "object",
            properties: {
                type: { $ref: "#/definitions/ScaleType" },
                domain: { description: "Explicit input values or extent." },
                range: { description: "Output values or named range." },
                scheme: { description: "Color scheme name or parameters." },
                reverse: { type: "boolean" },
                zero: { type: "boolean" },
            },
        },
    },
};
```

Separate rule buckets by purpose:

- `agentSchemaOverrides`: validation contract changes.
- `resolveDisplayTypeExpression`: the small supported subset of TypeScript-ish display strings from action docs.
- `docsOnlyTypeSummaries`: concise documentation for broad generated types.
- `typeExamples`: examples returned by `getIntentActionTypeDocs`.
- `typeNotes`: semantic guidance not captured by JSON Schema.

### Drift-Prevention Invariant

The generated catalog, action type docs resolver, validation schemas, and validation repair guidance must move together. Before shipping:

- Every generated `payloadFields[].type` must be directly accepted by `getIntentActionTypeDocs`.
- Every generated `payloadFields[].typeRefs[]` entry must be accepted by `getIntentActionTypeDocs`.
- Every non-primitive complex payload field should have at least one useful `typeRefs` entry.
- Malformed `submitIntentAction` responses must point the agent to `getIntentActionTypeDocs` when the failure is likely caused by an object, array, union, enum, or other complex field shape.

### Initial Non-Goals

- Do not expose every generated schema definition as a public type.
- Do not build a full TypeScript type parser.
- Do not inline the full `Scale` schema. Return curated scale docs and examples.
- Do not change intent action validation behavior.
- Do not remove the generated action catalog.
- Do not create a large `generatedActionTypeDocs.json` artifact in the first implementation. Use curated in-code docs for the small number of special types, and revisit generated action type docs only if the curated table grows.
- Do not optimize `generatedActionSchema.json` and `generatedToolSchema.json` overlap as part of this feature.

## File Structure

- Modify `packages/app-agent/src/agent/agentToolInputs.d.ts`
  - Remove `includeSchema` from `GetIntentActionDocsToolInput`.
  - Add `GetIntentActionTypeDocsToolInput`.
  - Add `getIntentActionTypeDocs` to `AgentToolInputs`.

- Modify `packages/app-agent/src/agent/agentActionSchema.js`
  - Keep shared action schema wrappers.
  - Own `agentSchemaOverrides`, `primitiveTypeSchemas`, `docsOnlyTypeSummaries`, `typeExamples`, and `typeNotes`.
  - Export a small `resolveDisplayTypeExpression` helper for wrapper expressions.
  - Replace `getAgentActionPayloadSchemaBundle` with lower-level helpers used by validation and the action type docs resolver.
  - Keep validation schema wrappers separate from docs-only summaries.

- Create `packages/app-agent/src/agent/intentActionTypeDocs.js`
  - Own the public `getIntentActionTypeDocs` response assembly and referenced-type projection for docs.
  - Delegate all schema/type special cases to `agentActionSchema.js`.
  - Keep validation concerns out of this file.

- Modify `packages/app-agent/src/agent/agentTools.js`
  - Remove `includeSchema` response handling from `getIntentActionDocs`.
  - Add `getIntentActionTypeDocs`.

- Modify `packages/app-agent/src/agent/toolCatalog.js`
  - Update malformed `submitIntentAction` rejection guidance to suggest `getIntentActionTypeDocs`.

- Modify `packages/app-agent/scripts/generateAgentActionCatalog.mjs`
  - Add `typeRefs` to each generated `payloadFields[]` entry.
  - Keep `type` as the human-readable display string.
  - Extract references with a small TypeScript AST helper, not a full TypeScript parser.

- Modify `packages/app-agent/src/agent/types.d.ts`
  - Add `typeRefs: string[]` to `AgentPayloadField`.

- Modify generated artifacts:
  - `packages/app-agent/src/agent/generated/generatedActionCatalog.json`
  - `packages/app-agent/src/agent/generated/generatedToolCatalog.json`
  - `packages/app-agent/src/agent/generated/generatedToolSchema.json`

- Modify tests:
  - `packages/app-agent/src/agent/agentTools.test.js`
  - `packages/app-agent/src/agent/toolCatalog.test.js`
  - Add `packages/app-agent/src/agent/intentActionTypeDocs.test.js`
  - Add or update generator/catalog tests that reject `any` in agent-facing payload field types.

- Modify prompt docs:
  - `packages/app-agent/server/app/prompts/genomespy_system_prompt.md`
  - Python prompt tests under `packages/app-agent/server/tests/`

## Implementation Plan

### Task 0: Remove `any[]` from Agent-Facing Action Docs

**Files:**

- Modify: `packages/app/src/sampleView/state/payloadTypes.d.ts`
- Modify generated:
  - `packages/app-agent/src/agent/generated/generatedActionCatalog.json`
  - `packages/app-agent/src/agent/generated/generatedActionSchema.json`
  - `packages/app-agent/src/agent/generated/generatedActionTypes.ts`
  - `packages/app-agent/src/agent/generated/generatedActionSummaries.json`
- Test: `packages/app-agent/src/agent/actionCatalog.test.js`

- [ ] **Step 1: Write the failing catalog test**

Add to `packages/app-agent/src/agent/actionCatalog.test.js`:

```js
it("does not expose any-typed action payload fields to the agent", () => {
    const anyTypedFields = generatedActionCatalog.flatMap((entry) =>
        entry.payloadFields
            .filter((field) => /\bany\b/.test(field.type))
            .map(
                (field) =>
                    entry.actionType + "." + field.name + ": " + field.type
            )
    );

    expect(anyTypedFields).toEqual([]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npx vitest run packages/app-agent/src/agent/actionCatalog.test.js
```

Expected: FAIL with `sampleView/filterByNominal.values: any[]`.

- [ ] **Step 3: Replace `any[]` with a named scalar/category type**

In `packages/app/src/sampleView/state/payloadTypes.d.ts`, add near `ComparisonOperatorType`:

```ts
/**
 * Exact categorical value used by nominal sample filters.
 */
export type NominalFilterValue = Scalar | null;
```

Then change `FilterByNominal.values`:

```ts
export interface FilterByNominal extends PayloadWithAttribute {
    /**
     * Exact attribute values matched by equality.
     */
    values: NominalFilterValue[];

    /**
     * Whether to remove matching samples instead of retaining them.
     *
     * If omitted or `false`, only matching samples are kept.
     */
    remove?: boolean;
}
```

- [ ] **Step 4: Regenerate agent artifacts**

Run:

```bash
npm --workspace @genome-spy/app-agent run generate:agent
```

Expected: `generatedActionCatalog.json` shows `NominalFilterValue[]` instead of `any[]`.

- [ ] **Step 5: Run the test**

Run:

```bash
npx vitest run packages/app-agent/src/agent/actionCatalog.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/sampleView/state/payloadTypes.d.ts packages/app-agent/src/agent/generated packages/app-agent/src/agent/actionCatalog.test.js
git commit -m "fix(app-agent): name nominal filter values"
```

### Task 1: Generate Queryable Type References

**Files:**

- Modify: `packages/app-agent/scripts/generateAgentActionCatalog.mjs`
- Modify: `packages/app-agent/src/agent/types.d.ts`
- Modify generated:
  - `packages/app-agent/src/agent/generated/generatedActionCatalog.json`
- Test: `packages/app-agent/scripts/generateAgentActionCatalog.test.mjs`

- [ ] **Step 1: Add failing generator test for `typeRefs`**

In `packages/app-agent/scripts/generateAgentActionCatalog.test.mjs`, add:

```js
it("generates queryable type references for action payload fields", async () => {
    const catalog = await createGeneratedActionCatalog();

    const sortBy = catalog.find(
        (entry) => entry.actionType === "sampleView/sortBy"
    );
    expect(sortBy.payloadFields).toContainEqual(
        expect.objectContaining({
            name: "attribute",
            type: "AttributeIdentifier",
            typeRefs: ["AttributeIdentifier"],
        })
    );

    const deriveMetadata = catalog.find(
        (entry) => entry.actionType === "sampleView/deriveMetadata"
    );
    expect(deriveMetadata.payloadFields).toContainEqual(
        expect.objectContaining({
            name: "scale",
            type: 'SampleAttributeDef["scale"] | null',
            typeRefs: ["Scale"],
        })
    );

    const groupByThresholds = catalog.find(
        (entry) => entry.actionType === "sampleView/groupByThresholds"
    );
    expect(groupByThresholds.payloadFields).toContainEqual(
        expect.objectContaining({
            name: "thresholds",
            type: "[Threshold, ...Threshold[]]",
            typeRefs: ["Threshold"],
        })
    );
});
```

- [ ] **Step 2: Run the generator test and verify it fails**

Run:

```bash
npx vitest run packages/app-agent/scripts/generateAgentActionCatalog.test.mjs
```

Expected: FAIL because payload field docs do not include `typeRefs`.

- [ ] **Step 3: Add `typeRefs` to the payload field type**

In `packages/app-agent/src/agent/types.d.ts`, extend `AgentPayloadField`:

```ts
/**
 * Queryable type names referenced by `type`.
 *
 * These are used by `getIntentActionTypeDocs`. Primitive display types have an empty
 * array, while wrapper expressions such as `[Threshold, ...Threshold[]]`
 * reference their inner named types.
 */
typeRefs: string[];
```

- [ ] **Step 4: Generate `typeRefs` from the TypeScript AST**

In `packages/app-agent/scripts/generateAgentActionCatalog.mjs`, update the `PayloadFieldDoc` typedef:

```js
/**
 * @typedef {object} PayloadFieldDoc
 * @property {string} name
 * @property {string} type
 * @property {string[]} typeRefs
 * @property {string} description
 * @property {boolean} required
 */
```

Add helper functions:

```js
/**
 * @param {ts.TypeNode | undefined} typeNode
 * @param {ts.SourceFile} sourceFile
 * @returns {string[]}
 */
function collectTypeRefs(typeNode, sourceFile) {
    if (!typeNode) {
        return [];
    }

    /** @type {Set<string>} */
    const refs = new Set();
    collectTypeRefsInto(typeNode, sourceFile, refs);
    return Array.from(refs).filter((name) => !isPrimitiveTypeRef(name)).sort();
}

/**
 * @param {ts.TypeNode} typeNode
 * @param {ts.SourceFile} sourceFile
 * @param {Set<string>} refs
 */
function collectTypeRefsInto(typeNode, sourceFile, refs) {
    if (ts.isTypeReferenceNode(typeNode)) {
        const typeName = typeNode.typeName.getText(sourceFile);
        if (typeName === "Record" && typeNode.typeArguments?.[1]) {
            collectTypeRefsInto(typeNode.typeArguments[1], sourceFile, refs);
        } else {
            refs.add(typeName);
            for (const argument of typeNode.typeArguments ?? []) {
                collectTypeRefsInto(argument, sourceFile, refs);
            }
        }
        return;
    }

    if (ts.isArrayTypeNode(typeNode)) {
        collectTypeRefsInto(typeNode.elementType, sourceFile, refs);
        return;
    }

    if (ts.isTupleTypeNode(typeNode)) {
        for (const element of typeNode.elements) {
            if (ts.isNamedTupleMember(element)) {
                collectTypeRefsInto(element.type, sourceFile, refs);
            } else if (ts.isRestTypeNode(element)) {
                collectTypeRefsInto(element.type, sourceFile, refs);
            } else {
                collectTypeRefsInto(element, sourceFile, refs);
            }
        }
        return;
    }

    if (ts.isUnionTypeNode(typeNode)) {
        for (const type of typeNode.types) {
            collectTypeRefsInto(type, sourceFile, refs);
        }
        return;
    }

    if (ts.isIndexedAccessTypeNode(typeNode)) {
        const objectType = typeNode.objectType.getText(sourceFile);
        const indexType = typeNode.indexType.getText(sourceFile);
        if (objectType === "SampleAttributeDef" && indexType === '"scale"') {
            refs.add("Scale");
        } else {
            collectTypeRefsInto(typeNode.objectType, sourceFile, refs);
        }
    }
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isPrimitiveTypeRef(name) {
    return name === "string" || name === "number" || name === "boolean";
}
```

In `collectInterfaceFields`, include:

```js
typeRefs: collectTypeRefs(member.type, sourceFile),
```

This helper is intentionally a small extractor for current emitted patterns, not a general TypeScript parser. The generator test documents the supported cases.

- [ ] **Step 5: Regenerate and run generator tests**

Run:

```bash
npm --workspace @genome-spy/app-agent run generate:agent
npx vitest run packages/app-agent/scripts/generateAgentActionCatalog.test.mjs
```

Expected: PASS, and `generatedActionCatalog.json` includes `typeRefs`.

- [ ] **Step 6: Commit**

```bash
git add packages/app-agent/scripts/generateAgentActionCatalog.mjs packages/app-agent/src/agent/types.d.ts packages/app-agent/src/agent/generated/generatedActionCatalog.json packages/app-agent/scripts/generateAgentActionCatalog.test.mjs
git commit -m "feat(app-agent): generate action payload type refs"
```

### Task 2: Add Type Resolver Tests

**Files:**

- Create: `packages/app-agent/src/agent/intentActionTypeDocs.test.js`
- No production code in this task.

- [ ] **Step 1: Add failing tests for direct schema-backed types**

Create `packages/app-agent/src/agent/intentActionTypeDocs.test.js`:

```js
import { describe, expect, it } from "vitest";
import { getIntentActionTypeDocs } from "./intentActionTypeDocs.js";

describe("intentActionTypeDocs", () => {
    it("returns agent-facing AttributeIdentifier docs", () => {
        const docs = getIntentActionTypeDocs({
            typeName: "AttributeIdentifier",
            referenceDepth: 1,
        });

        expect(docs).toMatchObject({
            typeName: "AttributeIdentifier",
            schema: {
                anyOf: [
                    { $ref: "#/definitions/SampleAttributeIdentifier" },
                    { $ref: "#/definitions/SelectionAggregationCandidate" },
                ],
            },
        });
        expect(docs.definitions).toMatchObject({
            SampleAttributeIdentifier: {
                properties: {
                    type: { const: "SAMPLE_ATTRIBUTE" },
                    specifier: { type: "string" },
                },
            },
            SelectionAggregationCandidate: {
                properties: {
                    type: { const: "SELECTION_AGGREGATION" },
                    candidateId: { type: "string" },
                },
            },
        });
        expect(docs.notes.join(" ")).toContain("selectionAggregation.fields");
    });

    it("returns enum docs for ComparisonOperatorType", () => {
        const docs = getIntentActionTypeDocs({
            typeName: "ComparisonOperatorType",
            referenceDepth: 0,
        });

        expect(docs.schema).toMatchObject({
            enum: ["lt", "lte", "gt", "gte", "eq"],
            type: "string",
        });
    });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npx vitest run packages/app-agent/src/agent/intentActionTypeDocs.test.js
```

Expected: FAIL because `intentActionTypeDocs.js` does not exist.

### Task 3: Implement Direct Action Type Docs

**Files:**

- Create: `packages/app-agent/src/agent/intentActionTypeDocs.js`
- Modify: `packages/app-agent/src/agent/agentActionSchema.js`

- [ ] **Step 1: Implement minimal direct resolver**

In `packages/app-agent/src/agent/agentActionSchema.js`, add the first centralized docs-only rule bucket:

```js
export const typeNotes = {
    AttributeIdentifier: [
        "Use SAMPLE_ATTRIBUTE for metadata attributes from context.",
        "Use SELECTION_AGGREGATION only by copying a candidate from selectionAggregation.fields.",
    ],
};
```

Create `packages/app-agent/src/agent/intentActionTypeDocs.js`:

```js
// @ts-check
import {
    getAgentActionSchemaDefinitions,
    typeNotes,
} from "./agentActionSchema.js";

const definitionRefPrefix = "#/definitions/";

/**
 * @param {{ typeName: string; referenceDepth?: 0 | 1 }} input
 */
export function getIntentActionTypeDocs(input) {
    const definitions = getAgentActionSchemaDefinitions();
    const schema = definitions[input.typeName];
    if (!schema) {
        throw new Error("Unsupported intent type " + input.typeName + ".");
    }

    const referenceDepth = input.referenceDepth ?? 1;
    return {
        typeName: input.typeName,
        schema: cloneJson(schema),
        definitions:
            referenceDepth > 0
                ? collectReferencedDefinitions(schema, definitions)
                : undefined,
        referencedTypes: listReferencedTypes(schema),
        notes: typeNotes[input.typeName] ?? [],
    };
}

/**
 * @param {unknown} schema
 * @param {Record<string, any>} definitions
 * @returns {Record<string, any>}
 */
function collectReferencedDefinitions(schema, definitions) {
    const result = {};
    for (const typeName of listReferencedTypes(schema)) {
        if (definitions[typeName]) {
            result[typeName] = cloneJson(definitions[typeName]);
        }
    }
    return result;
}

/**
 * @param {unknown} schema
 * @returns {string[]}
 */
function listReferencedTypes(schema) {
    const result = new Set();
    visit(schema, result);
    return Array.from(result);
}

/**
 * @param {unknown} value
 * @param {Set<string>} refs
 */
function visit(value, refs) {
    if (value === null || typeof value !== "object") {
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            visit(item, refs);
        }
        return;
    }
    const object = /** @type {Record<string, any>} */ (value);
    if (
        typeof object.$ref === "string" &&
        object.$ref.startsWith(definitionRefPrefix)
    ) {
        refs.add(object.$ref.slice(definitionRefPrefix.length));
    }
    for (const child of Object.values(object)) {
        visit(child, refs);
    }
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}
```

- [ ] **Step 2: Run direct resolver tests**

Run:

```bash
npx vitest run packages/app-agent/src/agent/intentActionTypeDocs.test.js
```

Expected: PASS for the first two tests.

### Task 4: Add Display Type Resolver Coverage

**Files:**

- Modify: `packages/app-agent/src/agent/intentActionTypeDocs.test.js`
- Modify: `packages/app-agent/src/agent/intentActionTypeDocs.js`
- Modify: `packages/app-agent/src/agent/agentActionSchema.js`

- [ ] **Step 1: Add failing tests for non-definition display types**

Append to `packages/app-agent/src/agent/intentActionTypeDocs.test.js`:

```js
it("responds tersely for primitive and obvious container display types", () => {
    expect(getIntentActionTypeDocs({ typeName: "string" }).schema).toEqual({
        type: "string",
    });
    expect(getIntentActionTypeDocs({ typeName: "string[]" }).schema).toEqual({
        items: { type: "string" },
        type: "array",
    });
    expect(getIntentActionTypeDocs({ typeName: "boolean" }).schema).toEqual({
        type: "boolean",
    });
    expect(getIntentActionTypeDocs({ typeName: "string" }).notes).toEqual([
        "Primitive type. Use the field description from action docs for semantics.",
    ]);
});

it("resolves non-empty Threshold tuple display type", () => {
    const docs = getIntentActionTypeDocs({
        typeName: "[Threshold, ...Threshold[]]",
        referenceDepth: 1,
    });

    expect(docs.schema).toEqual({
        items: { $ref: "#/definitions/Threshold" },
        minItems: 1,
        type: "array",
    });
    expect(docs.definitions).toHaveProperty("Threshold");
});

it("returns curated scale docs without expanding the full scale grammar", () => {
    const docs = getIntentActionTypeDocs({
        typeName: 'SampleAttributeDef["scale"] | null',
        referenceDepth: 1,
    });

    expect(docs.normalizedTypeName).toBe("Scale | null");
    expect(docs.schema).toEqual({
        anyOf: [{ $ref: "#/definitions/Scale" }, { type: "null" }],
    });
    expect(docs.definitions.Scale).toMatchObject({
        type: "object",
        properties: {
            type: { $ref: "#/definitions/ScaleType" },
            scheme: expect.any(Object),
        },
    });
    expect(docs.examples).toContainEqual({
        type: "linear",
        scheme: "viridis",
    });
    expect(docs.definitions.Scale.properties).not.toHaveProperty("align");
    expect(docs.definitions).not.toHaveProperty("InlineLocusAssembly");
});

it("summarizes metadata attribute definition maps", () => {
    const docs = getIntentActionTypeDocs({
        typeName: "Record<AttributeName, SampleAttributeDef>",
        referenceDepth: 1,
    });

    expect(docs.schema).toMatchObject({
        additionalProperties: { $ref: "#/definitions/SampleAttributeDef" },
        type: "object",
    });
    expect(docs.definitions.SampleAttributeDef).toMatchObject({
        type: "object",
    });
});

it("resolves the named nominal filter value array type", () => {
    const docs = getIntentActionTypeDocs({
        typeName: "NominalFilterValue[]",
    });

    expect(docs.schema).toMatchObject({
        items: {
            anyOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
                { type: "null" },
            ],
        },
        type: "array",
    });
    expect(docs.notes.join(" ")).toContain("exact category values");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npx vitest run packages/app-agent/src/agent/intentActionTypeDocs.test.js
```

Expected: FAIL on unsupported display types.

- [ ] **Step 3: Implement constrained display type resolution**

In `packages/app-agent/src/agent/agentActionSchema.js`, add centralized rule maps for semantic overrides and a tiny resolver for the TypeScript-ish display strings emitted by the generated action catalog:

```js
export const primitiveTypeSchemas = {
    boolean: { type: "boolean" },
    number: { type: "number" },
    string: { type: "string" },
};

export const docsOnlyTypeSummaries = {
    Scale: {
        schema: {
            description:
                "Scale construction guide for metadata visualization. This curated subset documents common scale properties; it is not the full validation schema.",
            properties: {
                domain: {
                    description: "Explicit input values or numeric extent.",
                },
                domainMax: { type: "number" },
                domainMid: { type: "number" },
                domainMin: { type: "number" },
                range: {
                    description: "Output colors, values, or named range.",
                },
                reverse: { type: "boolean" },
                scheme: {
                    description: "Color scheme name or scheme parameters.",
                },
                type: { $ref: "#/definitions/ScaleType" },
                zero: { type: "boolean" },
            },
            type: "object",
        },
    },
    SampleAttributeDef: {
        schema: {
            description:
                "Sample attribute definition. Use this when importing metadata and preserving column metadata such as title, type, or scale.",
            type: "object",
        },
    },
};

export const typeAliasResolvers = {
    'SampleAttributeDef["scale"]': "Scale",
};
```

Add curated examples in the same module:

```js
export const typeExamples = {
    Scale: [
        {
            type: "linear",
            scheme: "viridis",
        },
        {
            domain: [0.2, 0.8],
            range: ["#4575b4", "#ffffbf", "#d73027"],
            type: "threshold",
        },
    ],
};
```

Then add a helper that handles only the forms the generator can emit. This avoids a general TypeScript parser while removing one-off entries for wrappers like arrays, unions, rest tuples, records, and indexed access:

```js
const unionSeparator = /\s*\|\s*/;

/**
 * @param {string} typeText
 * @param {Record<string, any>} definitions
 */
export function resolveDisplayTypeExpression(typeText, definitions) {
    if (primitiveTypeSchemas[typeText]) {
        return {
            notes: [
                "Primitive type. Use the field description from action docs for semantics.",
            ],
            schema: primitiveTypeSchemas[typeText],
        };
    }

    if (definitions[typeText] || docsOnlyTypeSummaries[typeText]) {
        return {
            notes: typeNotes[typeText] ?? [],
            schema: refSchema(typeText),
        };
    }

    if (typeText.endsWith("[]")) {
        const itemType = typeText.slice(0, -2);
        const item = resolveDisplayTypeExpression(itemType, definitions);
        return {
            notes: item.notes,
            schema: {
                items: item.schema,
                type: "array",
            },
        };
    }

    const nonEmptyArrayMatch = typeText.match(/^\[(\w+), \.\.\.\1\[\]\]$/);
    if (nonEmptyArrayMatch) {
        return {
            schema: {
                items: refSchema(nonEmptyArrayMatch[1]),
                minItems: 1,
                type: "array",
            },
        };
    }

    const recordMatch = typeText.match(/^Record<[^,]+,\s*([^>]+)>$/);
    if (recordMatch) {
        const notes = typeNotes[typeText] ?? [];
        return {
            notes,
            schema: {
                additionalProperties: refSchema(recordMatch[1].trim()),
                type: "object",
            },
        };
    }

    if (typeAliasResolvers[typeText]) {
        const normalizedTypeName = typeAliasResolvers[typeText];
        return {
            normalizedTypeName,
            notes: typeNotes[normalizedTypeName] ?? [],
            schema: refSchema(normalizedTypeName),
        };
    }

    if (typeText.includes("|")) {
        const variants = typeText.split(unionSeparator);
        const resolved = variants.map((variant) =>
            variant === "null"
                ? { schema: { type: "null" } }
                : resolveDisplayTypeExpression(variant, definitions)
        );
        const normalizedTypeName = resolved
            .map((entry, index) => entry.normalizedTypeName ?? variants[index])
            .join(" | ");
        return {
            normalizedTypeName,
            notes: [
                ...(typeNotes[normalizedTypeName] ?? []),
                ...resolved.flatMap((entry) => entry.notes ?? []),
            ],
            schema: {
                anyOf: resolved.map((entry) => entry.schema),
            },
        };
    }

    throw new Error("Unsupported intent type " + typeText + ".");
}

/**
 * @param {string} typeName
 */
function refSchema(typeName) {
    if (primitiveTypeSchemas[typeName]) {
        return primitiveTypeSchemas[typeName];
    }
    return { $ref: "#/definitions/" + typeName };
}
```

Keep semantic guidance outside the resolver in `typeNotes`:

```js
export const typeNotes = {
    AttributeIdentifier: [
        "Use SAMPLE_ATTRIBUTE for metadata attributes from context.",
        "Use SELECTION_AGGREGATION only by copying a candidate from selectionAggregation.fields.",
    ],
    NominalFilterValue: [
        "Use exact category values from context, getAttributeSummary, or resolveMetadataAttributeValues results.",
    ],
    "Record<AttributeName, SampleAttributeDef>": [
        "Keys are metadata attribute names from the imported columnar metadata.",
    ],
    "Scale | null": [
        "Omit this field unless the user asks to preserve or override scale metadata.",
        "Use null to force automatic scale inference.",
    ],
};
```

In `packages/app-agent/src/agent/intentActionTypeDocs.js`, consume these exported records instead of defining local special cases. Definition collection must use `docsOnlyTypeSummaries[typeName]` before cloning a generated definition. Response assembly should use the resolver result for `schema`, `normalizedTypeName`, and notes, and should attach examples for the normalized type and directly referenced types. That is what lets `SampleAttributeDef["scale"] | null` return curated `Scale` examples without treating the whole union as a bespoke type.

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run packages/app-agent/src/agent/intentActionTypeDocs.test.js
```

Expected: PASS.

### Task 5: Add Exhaustive Catalog Coverage Test

**Files:**

- Modify: `packages/app-agent/src/agent/intentActionTypeDocs.test.js`

- [ ] **Step 1: Add a test that every action payload field type is resolvable**

Append:

```js
import generatedActionCatalog from "./generated/generatedActionCatalog.json" with { type: "json" };

it("resolves every type exposed by action payload fields", () => {
    const failures = [];

    for (const entry of generatedActionCatalog) {
        for (const field of entry.payloadFields) {
            try {
                getIntentActionTypeDocs({
                    typeName: field.type,
                    referenceDepth: 1,
                });
            } catch (error) {
                failures.push(
                    entry.actionType +
                        "." +
                        field.name +
                        ": " +
                        field.type +
                        " -> " +
                        (error instanceof Error ? error.message : String(error))
                );
            }
        }
    }

    expect(failures).toEqual([]);
});
```

- [ ] **Step 2: Run the coverage test**

Run:

```bash
npx vitest run packages/app-agent/src/agent/intentActionTypeDocs.test.js
```

Expected: PASS.

This test is important. Without it, future action JSDoc/type changes can silently add unqueryable type strings. It deliberately checks `field.type`, not only `field.typeRefs`, because the model may copy the display type exactly.

### Task 6: Add Tool Input and Generated Artifacts

**Files:**

- Modify: `packages/app-agent/src/agent/agentToolInputs.d.ts`
- Generated:
  - `packages/app-agent/src/agent/generated/generatedToolCatalog.json`
  - `packages/app-agent/src/agent/generated/generatedToolSchema.json`

- [ ] **Step 1: Change tool input contract**

In `packages/app-agent/src/agent/agentToolInputs.d.ts`, replace the `GetIntentActionDocsToolInput` example and fields:

```ts
/**
 * Read documentation, fields, and examples for one intent action. Use this
 * before constructing an unfamiliar action payload for `submitIntentAction`.
 * This tool doesn't execute the action or mutate any state. Do not repeat
 * the call if documentation is already available in the conversation history.
 *
 * @example
 * {
 *   "actionType": "sampleView/groupToQuartiles"
 * }
 */
export interface GetIntentActionDocsToolInput {
    /**
     * Intent action type whose docs should be read.
     */
    actionType: IntentActionType;
}
```

Add:

```ts
/**
 * Read schema and usage details for one intent action payload field type. Use
 * this when `getIntentActionDocs` shows a complex `payloadFields[].type` that
 * is not clear from examples alone. This tool does not execute actions or
 * mutate state.
 *
 * @example
 * {
 *   "typeName": "AttributeIdentifier",
 *   "referenceDepth": 1
 * }
 */
export interface GetIntentActionTypeDocsToolInput {
    /**
     * Type copied from an action `payloadFields[].type` value or from a
     * previous action type docs response's `referencedTypes`.
     */
    typeName: string;

    /**
     * How far to include referenced definitions. Use `0` for only the
     * requested type and `1` for immediate referenced types.
     */
    referenceDepth?: 0 | 1;
}
```

Add to `AgentToolInputs`:

```ts
getIntentActionTypeDocs: GetIntentActionTypeDocsToolInput;
```

- [ ] **Step 2: Regenerate tool artifacts**

Run:

```bash
npm --workspace @genome-spy/app-agent run generate:agent
```

Expected: generated tool schema/catalog include `getIntentActionTypeDocs`, and `getIntentActionDocs` no longer has `includeSchema`.

### Task 7: Wire Tool Handlers

**Files:**

- Modify: `packages/app-agent/src/agent/agentTools.js`
- Modify: `packages/app-agent/src/agent/agentTools.test.js`

- [ ] **Step 1: Add failing tool behavior tests**

In `packages/app-agent/src/agent/agentTools.test.js`, replace the current `includeSchema` test with:

```js
it("returns compact docs for an intent action without schema", () => {
    const runtime = createRuntimeStub();
    const tools = agentTools;

    const result = tools.getIntentActionDocs(runtime, {
        actionType: "sampleView/sortBy",
    });

    expect(result.content).not.toHaveProperty("schema");
    expect(result.content.referencedTypes).toContain("AttributeIdentifier");
});

it("returns docs for an intent payload field type", () => {
    const runtime = createRuntimeStub();
    const tools = agentTools;

    const result = tools.getIntentActionTypeDocs(runtime, {
        typeName: "AttributeIdentifier",
        referenceDepth: 1,
    });

    expect(result.text).toBe(
        "Read docs for intent type AttributeIdentifier. No action was executed."
    );
    expect(result.content.definitions).toHaveProperty(
        "SelectionAggregationCandidate"
    );
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npx vitest run packages/app-agent/src/agent/agentTools.test.js
```

Expected: FAIL because `getIntentActionTypeDocs` is not wired and `referencedTypes` is absent.

- [ ] **Step 3: Implement handlers**

In `packages/app-agent/src/agent/agentTools.js`:

- Remove `getAgentActionPayloadSchemaBundle` import.
- Import `getIntentActionTypeDocs` from `intentActionTypeDocs.js`.
- Add `referencedTypes` to action docs from generated `payloadFields[].typeRefs`:

```js
referencedTypes: getReferencedPayloadFieldTypes(entry.payloadFields),
```

- Add handler:

```js
getIntentActionTypeDocs(_runtime, input) {
    try {
        return {
            text:
                "Read docs for intent type " +
                input.typeName +
                ". No action was executed.",
            content: getIntentActionTypeDocs(input),
        };
    } catch (error) {
        throw new ToolCallRejectionError(
            error instanceof Error ? error.message : String(error)
        );
    }
},
```

Use an alias for the import to avoid naming collision:

```js
import { getIntentActionTypeDocs as getIntentActionTypeDocsContent } from "./intentActionTypeDocs.js";
```

Helper:

```js
/**
 * @param {import("./types.d.ts").AgentPayloadField[]} payloadFields
 * @returns {string[]}
 */
function getReferencedPayloadFieldTypes(payloadFields) {
    return Array.from(
        new Set(
            payloadFields.flatMap((field) => field.typeRefs)
        )
    );
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run packages/app-agent/src/agent/agentTools.test.js packages/app-agent/src/agent/intentActionTypeDocs.test.js
```

Expected: PASS.

### Task 8: Update Validation Rejection Guidance

**Files:**

- Modify: `packages/app-agent/src/agent/toolCatalog.js`
- Modify: `packages/app-agent/src/agent/toolCatalog.test.js`

- [ ] **Step 1: Update failing test**

In `packages/app-agent/src/agent/toolCatalog.test.js`, change the malformed `submitIntentAction` guidance test to:

```js
it("suggests action type docs after malformed submitIntentAction arguments", () => {
    const message = formatToolCallRejection("submitIntentAction", [
        "$.action.payload.attribute.type must be equal to one of the allowed values.",
    ]);

    expect(message).toContain("getIntentActionTypeDocs");
    expect(message).toContain("payload field type");
    expect(message).not.toContain("includeSchema");
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npx vitest run packages/app-agent/src/agent/toolCatalog.test.js
```

Expected: FAIL because message still says `includeSchema`.

- [ ] **Step 3: Update rejection message**

In `packages/app-agent/src/agent/toolCatalog.js`, replace the schema hint with:

```js
const schemaHint =
    toolName === "submitIntentAction"
        ? [
              "If an action payload field type is unclear, call " +
                  "`getIntentActionTypeDocs` with the `payloadFields[].type` " +
                  "reported by `getIntentActionDocs` before retrying.",
          ]
        : [];
```

- [ ] **Step 4: Run test**

Run:

```bash
npx vitest run packages/app-agent/src/agent/toolCatalog.test.js
```

Expected: PASS.

### Task 9: Update Prompt and Python Tests

**Files:**

- Modify: `packages/app-agent/server/app/prompts/genomespy_system_prompt.md`
- Modify tests under `packages/app-agent/server/tests/`

- [ ] **Step 1: Replace prompt references to `includeSchema`**

In `packages/app-agent/server/app/prompts/genomespy_system_prompt.md`, replace guidance equivalent to:

```md
Use `getIntentActionDocs(actionType, includeSchema)` ...
Use `includeSchema: false` first; request schemas only after examples and field docs are insufficient or validation fails.
```

with:

```md
Use `getIntentActionDocs(actionType)` before constructing unfamiliar action payloads.
If a payload field type is unclear, call `getIntentActionTypeDocs(typeName)` with the exact `payloadFields[].type` value from the action docs.
Do not request action type docs for primitive fields such as `string`, `number`, or `boolean` unless validation fails.
```

- [ ] **Step 2: Update prompt tests**

Search:

```bash
rg "includeSchema|getIntentActionDocs|getIntentActionTypeDocs" packages/app-agent/server/tests packages/app-agent/server/app/prompts/genomespy_system_prompt.md
```

Update tests that assert old prompt text. Expected new assertions:

```python
assert "getIntentActionTypeDocs" in prompt
assert "includeSchema" not in prompt
```

- [ ] **Step 3: Run Python prompt tests**

Run:

```bash
pytest packages/app-agent/server/tests/test_main.py packages/app-agent/server/tests/test_prompt_builder.py
```

Expected: PASS.

If `pytest` is unavailable in the local environment, run the server test command documented for the package and record the exact blocker.

### Task 10: Remove Old Schema Bundle Code and IncludeSchema Plumbing

**Files:**

- Modify: `packages/app-agent/src/agent/agentActionSchema.js`
- Modify: `packages/app-agent/src/agent/agentTools.js`
- Modify: `packages/app-agent/src/agent/agentTools.test.js`
- Verify generated artifacts:
  - `packages/app-agent/src/agent/generated/generatedToolCatalog.json`
  - `packages/app-agent/src/agent/generated/generatedToolSchema.json`

- [ ] **Step 1: Confirm old schema-doc path is unused**

After `getIntentActionTypeDocs` is wired, search:

```bash
rg "getAgentActionPayloadSchemaBundle|getRequiredActionPayloadSchema|includeSchema" packages/app-agent/src packages/app-agent/server packages/app-agent/LLM_PLAN
```

Keep historical `LLM_PLAN` mentions unless the current plan or active prompt would be misleading. Remove production/test references. The only remaining `includeSchema` mentions should be historical plan text or this cleanup task.

- [ ] **Step 2: Delete obsolete code**

Remove from `agentTools.js`:

```js
import { getAgentActionPayloadSchemaBundle } from "./agentActionSchema.js";

...(input.includeSchema
    ? { schema: getRequiredActionPayloadSchema(entry.actionType) }
    : {}),

function getRequiredActionPayloadSchema(actionType) { ... }
```

If only the old action-doc schema path uses these helpers, remove from `agentActionSchema.js`:

```js
const omittedDocsDefinitions = { ... }; // or equivalent old docs placeholder table
export function getAgentActionPayloadSchemaBundle(actionType) { ... }
function collectReachableDefinitions(schema, definitions) { ... }
function visitSchema(schema, definitions, visited, reachable) { ... }
```

Keep:

```js
stepVariants
getAgentActionSchemaDefinitions
createActionSchemaWrapper
createAgentActionSchemaWrapper
getActionPayloadSchema
agentSchemaOverrides
resolveDisplayTypeExpression
docsOnlyTypeSummaries
typeExamples
typeNotes
```

Keep shared helpers such as `cloneJson` if `intentActionTypeDocs.js` or the projection helpers still use them.

- [ ] **Step 3: Confirm generated tool artifacts no longer expose `includeSchema`**

After regenerating in Task 6, verify:

```bash
rg "includeSchema" packages/app-agent/src/agent/generated/generatedToolCatalog.json packages/app-agent/src/agent/generated/generatedToolSchema.json
```

Expected: no matches.

- [ ] **Step 4: Remove obsolete includeSchema tests and assertions**

Delete or rewrite tests whose only purpose was checking schema inclusion in action docs:

- `agentTools.test.js` tests that call `getIntentActionDocs` with `includeSchema: true`.
- `toolCatalog.test.js` assertions that `getIntentActionDocs` requires or accepts `includeSchema`.
- Prompt/server tests that assert `includeSchema` guidance.

The replacement coverage lives in:

- `intentActionTypeDocs.test.js` for field type docs.
- `agentTools.test.js` for `referencedTypes` in compact action docs.
- `toolCatalog.test.js` for malformed payload guidance pointing to `getIntentActionTypeDocs`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run packages/app-agent/src/agent/agentTools.test.js packages/app-agent/src/agent/actionShapeValidator.test.js packages/app-agent/src/agent/intentActionTypeDocs.test.js
```

Expected: PASS.

### Task 11: Full Verification

**Files:**

- No source edits expected.

- [ ] **Step 1: Check generated artifacts**

Run:

```bash
npm --workspace @genome-spy/app-agent run check:agent
```

Expected: all generated agent artifacts are up to date.

- [ ] **Step 2: Run app-agent TypeScript checks**

Run:

```bash
npm --workspace @genome-spy/app-agent run test:tsc --if-present
```

Expected: PASS.

- [ ] **Step 3: Run app-agent unit tests**

Run:

```bash
npm --workspace @genome-spy/app-agent test
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

Inspect:

```bash
git diff
git diff --stat
```

Commit:

```bash
git add packages/app-agent/src/agent packages/app-agent/server/app/prompts/genomespy_system_prompt.md packages/app-agent/server/tests
git commit -m "feat(app-agent): add intent action type docs tool"
```

## Open Questions

1. Should `getIntentActionTypeDocs` accept only exact `payloadFields[].type` strings, or also normalized names such as `Scale`?
   - Recommendation: accept both, but document that exact payload field strings are the supported path.

2. Should primitives be queryable?
   - Recommendation: yes, because the exhaustive resolver test is simpler and validation feedback can point to the type tool uniformly. The prompt can discourage querying primitives unless validation fails.

3. Should `referenceDepth` support values greater than `1`?
   - Recommendation: not initially. Depth `1` is enough for current action payload fields and avoids accidentally recreating the large schema dump problem.

4. Should `Scale` ever be fully expandable?
   - Recommendation: not initially. Return a curated, useful subset plus examples. Add full expansion only if there is evidence the agent needs uncommon scale properties.

5. Should `referencedTypes` be generated into `generatedActionCatalog.json` instead of computed at runtime?
   - Recommendation: yes, generate `payloadFields[].typeRefs` now. It is compact, keeps action-doc responses deterministic, and avoids duplicating display-string inference in the runtime tool handler. Keep action-level `referencedTypes` derived from those generated field refs.

6. Should type examples come from JSDoc `@example` tags or curated maps?
   - Recommendation: start with curated maps in the central projection module for high-value types. Later, teach the generator to extract type-level examples if examples become numerous.

## Self-Review

- Spec coverage: The plan covers the feasibility caveats, all currently exposed action payload field types, removal of `includeSchema`, the new tool, prompt updates, generated artifacts, and validation guidance.
- Placeholder scan: No task uses `TBD`, `TODO`, or unspecified “write tests” language. Each task names concrete files, commands, and expected results.
- Type consistency: The plan consistently uses `getIntentActionTypeDocs`, `GetIntentActionTypeDocsToolInput`, `typeName`, `referenceDepth`, `referencedTypes`, and the current `payloadFields[].type` terminology.

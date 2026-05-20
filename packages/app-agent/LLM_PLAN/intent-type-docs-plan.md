# Intent Type Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `getIntentActionDocs(..., includeSchema: true)` with a dedicated type documentation lookup that lets the agent inspect complex action payload field types without dumping large transitive JSON Schema closures.

**Architecture:** Keep `getIntentActionDocs` focused on action selection and top-level payload fields. Add `getIntentTypeDocs` for field-level type details, backed by a small resolver that maps action-catalog type strings to agent-facing schema fragments. Reuse the existing `agentActionSchema.js` projection so validation, action docs, and type docs agree about `AttributeIdentifier`.

**Tech Stack:** JavaScript with JSDoc types, TypeScript declaration files for generated schema/catalog inputs, Vitest, AJV, generated JSON artifacts under `packages/app-agent/src/agent/generated/`.

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
- `any[]`
- `[Threshold, ...Threshold[]]`
- `Record<AttributeName, SampleAttributeDef>`
- `SampleAttributeDef["scale"] | null`

These non-definition strings are not rare edge cases. They appear in action docs for metadata import, metadata derivation, nominal filters, threshold grouping, and group removal.

### Main Caveats

1. **Display types are not schema keys.** `payloadFields[].type` is generated from TypeScript AST text for readability. It is not a stable schema address. A type-doc tool must resolve display strings through an explicit mapping layer.

2. **Agent-facing types differ from canonical action types.** `AttributeIdentifier` must resolve to the agent-facing union of `SampleAttributeIdentifier` and `SelectionAggregationCandidate`, not the canonical app-facing `AttributeIdentifier` that can describe internal view/locus structures.

3. **Some types are too large to be useful.** `Scale` expands into much of the visualization grammar. `SampleAttributeDef` and `Record<AttributeName, SampleAttributeDef>` can also be too broad for action construction. Type docs should summarize or omit these unless there is a concrete agent workflow that needs full detail.

4. **Some types require semantic guidance, not only schema.** `AttributeIdentifier` needs instructions about copying `SELECTION_AGGREGATION` candidates from `selectionAggregation.fields`. `FeatureFilter` needs instructions about copying fields from `filterableFields` and using `getSelectionFeatureFieldSummary` when values/bounds are needed. Schema alone does not capture enough behavior.

5. **The tool schema sent to the provider is not enough.** `submitIntentAction` intentionally exposes `action` as a broad object in the provider tool schema to avoid sending the full action union. The type-doc tool must therefore provide the missing detail on demand.

6. **Action schema and tool schema both define related names.** `generatedActionSchema.json` and `generatedToolSchema.json` overlap. The resolver needs a clear lookup order:
   - agent-facing overrides from `agentActionSchema.js`
   - generated action definitions for action payload types
   - generated tool definitions for agent-only helper types
   - manual resolvers for display expressions and primitives

7. **`$ref` is still useful but needs boundaries.** Type docs may keep local `$ref`s if included definitions are present. They should not recursively include every transitive definition by default. A bounded `referenceDepth` is safer than unbounded closure.

8. **Prompt and validation guidance must change together.** If `includeSchema` is removed, the server prompt and rejection messages must tell the agent to call `getIntentTypeDocs` for unclear field types. Otherwise the agent will keep trying the old path.

9. **All relevant current field types can be made queryable with an explicit resolver.** This is feasible because the current set is small. Future action payload types can break this unless tests assert every generated `payloadFields[].type` is resolvable.

## Recommended Design

### Keep `getIntentActionDocs` Compact

Return:

```ts
{
    actionType: AgentActionType;
    description: string;
    usage?: string;
    payloadFields: AgentPayloadField[];
    examples: unknown[];
    referencedTypes: string[];
}
```

Do not return a `schema` property from this tool.

`referencedTypes` should be generated from `payloadFields[].type` and should include only non-primitive types worth querying. For example:

```json
{
  "payloadFields": [
    { "name": "attribute", "type": "AttributeIdentifier", "required": true },
    { "name": "scale", "type": "SampleAttributeDef[\"scale\"] | null", "required": false }
  ],
  "referencedTypes": ["AttributeIdentifier", "SampleAttributeDef[\"scale\"] | null"]
}
```

### Add `getIntentTypeDocs`

Suggested input:

```ts
export interface GetIntentTypeDocsToolInput {
    /**
     * Type name copied exactly from an action `payloadFields[].type` value or
     * from a previous type-doc response's `referencedTypes`.
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
| `Record<AttributeName, SampleAttributeDef>` | Object map summary. Reference `SampleAttributeDef` only if `referenceDepth > 0`, and keep `Scale` summarized. |
| `SampleAttributeDef["scale"] \| null` | Normalize to `Scale \| null`, return compact `Scale` placeholder by default. |
| `[Threshold, ...Threshold[]]` | Non-empty array of `Threshold`; include `Threshold`. |
| `any[]` | Array of scalar/category values used by nominal filters. Prefer a semantic description over raw `any`. |
| `string[]` | Array of strings. |
| `string` | Primitive string. |
| `number` | Primitive number. |
| `boolean` | Primitive boolean. |

### Initial Non-Goals

- Do not expose every generated schema definition as a public type.
- Do not build a full TypeScript type parser.
- Do not inline the full `Scale` schema.
- Do not change intent action validation behavior.
- Do not remove the generated action catalog.

## File Structure

- Modify `packages/app-agent/src/agent/agentToolInputs.d.ts`
  - Remove `includeSchema` from `GetIntentActionDocsToolInput`.
  - Add `GetIntentTypeDocsToolInput`.
  - Add `getIntentTypeDocs` to `AgentToolInputs`.

- Modify `packages/app-agent/src/agent/agentActionSchema.js`
  - Keep shared action schema wrappers.
  - Replace `getAgentActionPayloadSchemaBundle` or narrow it into lower-level helpers used by the new type resolver.
  - Add exported helpers for agent-facing definitions if needed.

- Create `packages/app-agent/src/agent/intentTypeDocs.js`
  - Own the type-name resolver, primitive/container handling, omission policy, and referenced-type projection for docs.
  - Keep validation concerns out of this file.

- Modify `packages/app-agent/src/agent/agentTools.js`
  - Remove `includeSchema` response handling from `getIntentActionDocs`.
  - Add `getIntentTypeDocs`.

- Modify `packages/app-agent/src/agent/toolCatalog.js`
  - Update malformed `submitIntentAction` rejection guidance to suggest `getIntentTypeDocs`.

- Modify generated artifacts:
  - `packages/app-agent/src/agent/generated/generatedToolCatalog.json`
  - `packages/app-agent/src/agent/generated/generatedToolSchema.json`

- Modify tests:
  - `packages/app-agent/src/agent/agentTools.test.js`
  - `packages/app-agent/src/agent/toolCatalog.test.js`
  - Add `packages/app-agent/src/agent/intentTypeDocs.test.js`

- Modify prompt docs:
  - `packages/app-agent/server/app/prompts/genomespy_system_prompt.md`
  - Python prompt tests under `packages/app-agent/server/tests/`

## Implementation Plan

### Task 1: Add Type Resolver Tests

**Files:**

- Create: `packages/app-agent/src/agent/intentTypeDocs.test.js`
- No production code in this task.

- [ ] **Step 1: Add failing tests for direct schema-backed types**

Create `packages/app-agent/src/agent/intentTypeDocs.test.js`:

```js
import { describe, expect, it } from "vitest";
import { getIntentTypeDocs } from "./intentTypeDocs.js";

describe("intentTypeDocs", () => {
    it("returns agent-facing AttributeIdentifier docs", () => {
        const docs = getIntentTypeDocs({
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
        const docs = getIntentTypeDocs({
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
npx vitest run packages/app-agent/src/agent/intentTypeDocs.test.js
```

Expected: FAIL because `intentTypeDocs.js` does not exist.

### Task 2: Implement Direct Type Docs

**Files:**

- Create: `packages/app-agent/src/agent/intentTypeDocs.js`
- Modify: `packages/app-agent/src/agent/agentActionSchema.js`

- [ ] **Step 1: Implement minimal direct resolver**

Create `packages/app-agent/src/agent/intentTypeDocs.js`:

```js
// @ts-check
import {
    getAgentActionSchemaDefinitions,
} from "./agentActionSchema.js";

const definitionRefPrefix = "#/definitions/";

const typeNotes = new Map([
    [
        "AttributeIdentifier",
        [
            "Use SAMPLE_ATTRIBUTE for metadata attributes from context.",
            "Use SELECTION_AGGREGATION only by copying a candidate from selectionAggregation.fields.",
        ],
    ],
]);

/**
 * @param {{ typeName: string; referenceDepth?: 0 | 1 }} input
 */
export function getIntentTypeDocs(input) {
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
        notes: typeNotes.get(input.typeName) ?? [],
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
npx vitest run packages/app-agent/src/agent/intentTypeDocs.test.js
```

Expected: PASS for the first two tests.

### Task 3: Add Display Type Resolver Coverage

**Files:**

- Modify: `packages/app-agent/src/agent/intentTypeDocs.test.js`
- Modify: `packages/app-agent/src/agent/intentTypeDocs.js`

- [ ] **Step 1: Add failing tests for non-definition display types**

Append to `packages/app-agent/src/agent/intentTypeDocs.test.js`:

```js
it("resolves primitive and array display types", () => {
    expect(getIntentTypeDocs({ typeName: "string" }).schema).toEqual({
        type: "string",
    });
    expect(getIntentTypeDocs({ typeName: "string[]" }).schema).toEqual({
        items: { type: "string" },
        type: "array",
    });
    expect(getIntentTypeDocs({ typeName: "boolean" }).schema).toEqual({
        type: "boolean",
    });
});

it("resolves non-empty Threshold tuple display type", () => {
    const docs = getIntentTypeDocs({
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

it("summarizes scale display type without expanding the scale grammar", () => {
    const docs = getIntentTypeDocs({
        typeName: 'SampleAttributeDef["scale"] | null',
        referenceDepth: 1,
    });

    expect(docs.normalizedTypeName).toBe("Scale | null");
    expect(docs.schema).toEqual({
        anyOf: [{ $ref: "#/definitions/Scale" }, { type: "null" }],
    });
    expect(docs.definitions.Scale).toMatchObject({ type: "object" });
    expect(docs.definitions.Scale).not.toHaveProperty("properties");
});

it("summarizes metadata attribute definition maps", () => {
    const docs = getIntentTypeDocs({
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npx vitest run packages/app-agent/src/agent/intentTypeDocs.test.js
```

Expected: FAIL on unsupported display types.

- [ ] **Step 3: Implement display type mapping**

In `packages/app-agent/src/agent/intentTypeDocs.js`, add a resolver before generated definition lookup:

```js
const omittedDocsDefinitions = new Map([
    [
        "Scale",
        {
            description:
                "Scale definitions are accepted but omitted from type docs because the full visualization scale schema is large. Omit scale unless the user asks to preserve or override it; use null to force automatic scale inference.",
            type: "object",
        },
    ],
    [
        "SampleAttributeDef",
        {
            description:
                "Sample attribute definitions are accepted but summarized in type docs. Use this only when importing metadata and preserving column metadata such as title, type, or scale.",
            type: "object",
        },
    ],
]);

const displayTypeSchemas = new Map([
    ["string", { schema: { type: "string" } }],
    ["number", { schema: { type: "number" } }],
    ["boolean", { schema: { type: "boolean" } }],
    ["string[]", { schema: { items: { type: "string" }, type: "array" } }],
    [
        "any[]",
        {
            schema: {
                items: {
                    anyOf: [
                        { type: "string" },
                        { type: "number" },
                        { type: "boolean" },
                        { type: "null" },
                    ],
                },
                type: "array",
            },
            notes: [
                "Use exact category values from context or resolveMetadataAttributeValues results.",
            ],
        },
    ],
    [
        "[Threshold, ...Threshold[]]",
        {
            schema: {
                items: { $ref: "#/definitions/Threshold" },
                minItems: 1,
                type: "array",
            },
        },
    ],
    [
        'SampleAttributeDef["scale"] | null',
        {
            normalizedTypeName: "Scale | null",
            schema: {
                anyOf: [{ $ref: "#/definitions/Scale" }, { type: "null" }],
            },
            notes: [
                "Omit this field unless the user asks to preserve or override scale metadata.",
                "Use null to force automatic scale inference.",
            ],
        },
    ],
    [
        "Record<AttributeName, SampleAttributeDef>",
        {
            schema: {
                additionalProperties: {
                    $ref: "#/definitions/SampleAttributeDef",
                },
                type: "object",
            },
            notes: [
                "Keys are metadata attribute names from the imported columnar metadata.",
            ],
        },
    ],
]);
```

Update definition collection to use `omittedDocsDefinitions` before cloning a generated definition.

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run packages/app-agent/src/agent/intentTypeDocs.test.js
```

Expected: PASS.

### Task 4: Add Exhaustive Catalog Coverage Test

**Files:**

- Modify: `packages/app-agent/src/agent/intentTypeDocs.test.js`

- [ ] **Step 1: Add a test that every action payload field type is resolvable**

Append:

```js
import generatedActionCatalog from "./generated/generatedActionCatalog.json" with { type: "json" };

it("resolves every type exposed by action payload fields", () => {
    const failures = [];

    for (const entry of generatedActionCatalog) {
        for (const field of entry.payloadFields) {
            try {
                getIntentTypeDocs({
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
npx vitest run packages/app-agent/src/agent/intentTypeDocs.test.js
```

Expected: PASS.

This test is important. Without it, future action JSDoc/type changes can silently add unqueryable type strings.

### Task 5: Add Tool Input and Generated Artifacts

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
export interface GetIntentTypeDocsToolInput {
    /**
     * Type copied from an action `payloadFields[].type` value or from a
     * previous type-doc response's `referencedTypes`.
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
getIntentTypeDocs: GetIntentTypeDocsToolInput;
```

- [ ] **Step 2: Regenerate tool artifacts**

Run:

```bash
npm --workspace @genome-spy/app-agent run generate:agent
```

Expected: generated tool schema/catalog include `getIntentTypeDocs`, and `getIntentActionDocs` no longer has `includeSchema`.

### Task 6: Wire Tool Handlers

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

    const result = tools.getIntentTypeDocs(runtime, {
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

Expected: FAIL because `getIntentTypeDocs` is not wired and `referencedTypes` is absent.

- [ ] **Step 3: Implement handlers**

In `packages/app-agent/src/agent/agentTools.js`:

- Remove `getAgentActionPayloadSchemaBundle` import.
- Import `getIntentTypeDocs` from `intentTypeDocs.js`.
- Add `referencedTypes` to action docs by filtering `payloadFields`:

```js
referencedTypes: getReferencedPayloadFieldTypes(entry.payloadFields),
```

- Add handler:

```js
getIntentTypeDocs(_runtime, input) {
    try {
        return {
            text:
                "Read docs for intent type " +
                input.typeName +
                ". No action was executed.",
            content: getIntentTypeDocs(input),
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
import { getIntentTypeDocs as getIntentTypeDocsContent } from "./intentTypeDocs.js";
```

Helper:

```js
/**
 * @param {import("./types.d.ts").AgentPayloadField[]} payloadFields
 * @returns {string[]}
 */
function getReferencedPayloadFieldTypes(payloadFields) {
    const primitiveTypes = new Set(["string", "number", "boolean"]);
    return Array.from(
        new Set(
            payloadFields
                .map((field) => field.type)
                .filter((type) => !primitiveTypes.has(type))
        )
    );
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run packages/app-agent/src/agent/agentTools.test.js packages/app-agent/src/agent/intentTypeDocs.test.js
```

Expected: PASS.

### Task 7: Update Validation Rejection Guidance

**Files:**

- Modify: `packages/app-agent/src/agent/toolCatalog.js`
- Modify: `packages/app-agent/src/agent/toolCatalog.test.js`

- [ ] **Step 1: Update failing test**

In `packages/app-agent/src/agent/toolCatalog.test.js`, change the malformed `submitIntentAction` guidance test to:

```js
it("suggests type docs after malformed submitIntentAction arguments", () => {
    const message = formatToolCallRejection("submitIntentAction", [
        "$.action.payload.attribute.type must be equal to one of the allowed values.",
    ]);

    expect(message).toContain("getIntentTypeDocs");
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
                  "`getIntentTypeDocs` with the `payloadFields[].type` " +
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

### Task 8: Update Prompt and Python Tests

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
If a payload field type is unclear, call `getIntentTypeDocs(typeName)` with the exact `payloadFields[].type` value from the action docs.
Do not request type docs for primitive fields such as `string`, `number`, or `boolean` unless validation fails.
```

- [ ] **Step 2: Update prompt tests**

Search:

```bash
rg "includeSchema|getIntentActionDocs|getIntentTypeDocs" packages/app-agent/server/tests packages/app-agent/server/app/prompts/genomespy_system_prompt.md
```

Update tests that assert old prompt text. Expected new assertions:

```python
assert "getIntentTypeDocs" in prompt
assert "includeSchema" not in prompt
```

- [ ] **Step 3: Run Python prompt tests**

Run:

```bash
pytest packages/app-agent/server/tests/test_main.py packages/app-agent/server/tests/test_prompt_builder.py
```

Expected: PASS.

If `pytest` is unavailable in the local environment, run the server test command documented for the package and record the exact blocker.

### Task 9: Remove Old Schema Bundle Code

**Files:**

- Modify: `packages/app-agent/src/agent/agentActionSchema.js`
- Modify: `packages/app-agent/src/agent/agentTools.js`
- Modify: `packages/app-agent/src/agent/agentTools.test.js`

- [ ] **Step 1: Remove `getAgentActionPayloadSchemaBundle` if unused**

After `getIntentTypeDocs` is wired, search:

```bash
rg "getAgentActionPayloadSchemaBundle|includeSchema" packages/app-agent/src packages/app-agent/server packages/app-agent/LLM_PLAN
```

Keep historical `LLM_PLAN` mentions unless the current plan or active prompt would be misleading. Remove production/test references.

- [ ] **Step 2: Delete obsolete code**

If only the old action-doc schema path uses these helpers, remove from `agentActionSchema.js`:

```js
const omittedDocsDefinitions = new Map([...]);
export function getAgentActionPayloadSchemaBundle(actionType) { ... }
function collectReachableDefinitions(schema, definitions) { ... }
function visitSchema(schema, definitions, visited, reachable) { ... }
function cloneJson(value) { ... } // only if no longer used
```

Keep:

```js
stepVariants
getAgentActionSchemaDefinitions
createActionSchemaWrapper
createAgentActionSchemaWrapper
getActionPayloadSchema
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
npx vitest run packages/app-agent/src/agent/agentTools.test.js packages/app-agent/src/agent/actionShapeValidator.test.js packages/app-agent/src/agent/intentTypeDocs.test.js
```

Expected: PASS.

### Task 10: Full Verification

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
git commit -m "feat(app-agent): add intent type docs tool"
```

## Open Questions

1. Should `getIntentTypeDocs` accept only exact `payloadFields[].type` strings, or also normalized names such as `Scale`?
   - Recommendation: accept both, but document that exact payload field strings are the supported path.

2. Should primitives be queryable?
   - Recommendation: yes, because the exhaustive resolver test is simpler and validation feedback can point to the type tool uniformly. The prompt can discourage querying primitives unless validation fails.

3. Should `referenceDepth` support values greater than `1`?
   - Recommendation: not initially. Depth `1` is enough for current action payload fields and avoids accidentally recreating the large schema dump problem.

4. Should `Scale` ever be fully expandable?
   - Recommendation: not through this tool initially. Full `Scale` docs belong in user-facing GenomeSpy docs, not agent action payload repair.

5. Should `referencedTypes` be generated into `generatedActionCatalog.json` instead of computed at runtime?
   - Recommendation: compute at runtime first. If repeated computation becomes awkward, add it to the generator later.

## Self-Review

- Spec coverage: The plan covers the feasibility caveats, all currently exposed action payload field types, removal of `includeSchema`, the new tool, prompt updates, generated artifacts, and validation guidance.
- Placeholder scan: No task uses `TBD`, `TODO`, or unspecified “write tests” language. Each task names concrete files, commands, and expected results.
- Type consistency: The plan consistently uses `getIntentTypeDocs`, `GetIntentTypeDocsToolInput`, `typeName`, `referenceDepth`, `referencedTypes`, and the current `payloadFields[].type` terminology.

# Intent Action Type Docs Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Execute one phase at a time, verify it, and commit before starting the next phase.

## Goal

Replace `getIntentActionDocs(..., includeSchema: true)` with a dedicated `getIntentActionTypeDocs` tool for inspecting complex intent action payload field types.

`getIntentActionDocs` should stay compact: it helps the agent choose an action and see top-level payload fields. `getIntentActionTypeDocs` should help the agent construct or repair complex field values when field descriptions and examples are insufficient.

## Agent-Facing Contract

`getIntentActionDocs(actionType)` returns:

```ts
{
    actionType: AgentActionType;
    description: string;
    usage?: string;
    payloadFields: AgentPayloadField[]; // includes typeRefs
    examples: unknown[];
    referencedTypes: string[];
}
```

It must not return a `schema` property.

`getIntentActionTypeDocs({ typeName, referenceDepth })` returns:

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

Default `referenceDepth` is `1`. Use `0` for only the requested schema fragment and `1` for immediate referenced definitions. Do not support deeper recursive expansion initially.

## Design Rules

- Generate `payloadFields[].typeRefs` into `generatedActionCatalog.json`. Derive action-level `referencedTypes` from those refs.
- Still accept exact display strings from `payloadFields[].type`, because the model may copy those values directly.
- Keep all agent-facing action schema projection rules in `agentActionSchema.js`.
- Use plain object Records for string-keyed lookup tables. Do not use `Map` unless identity keys, non-string keys, or insertion-order operations are actually needed.
- Do not build a general TypeScript parser. Support only the TypeScript-ish display forms emitted by the action catalog.
- Do not expose `any` in agent-facing action docs. Replace current `any[]` payload field docs with a named type.
- Do not inline the full `Scale` schema. Return curated `Scale` construction docs and examples. Omitted scale properties are not necessarily invalid.
- Do not optimize overlap between `generatedActionSchema.json` and `generatedToolSchema.json` in this change.

## Resolver Requirements

The action type docs resolver must handle every generated `payloadFields[].type`:

| Display type | Required behavior |
| --- | --- |
| `AttributeIdentifier` | Return agent-facing union of `SampleAttributeIdentifier` and `SelectionAggregationCandidate`. |
| `AttributeCondition` | Return generated action schema definition. |
| `ColumnarMetadata` | Return generated action schema definition. |
| `ComparisonOperatorType` | Return generated action schema definition. |
| `CustomGroups` | Return generated action schema definition. |
| `ParamOrigin` | Return generated action schema definition. |
| `ParamSelector` | Return generated action schema definition. |
| `ParamValue` | Return generated action schema definition with useful notes if needed. |
| `Record<AttributeName, SampleAttributeDef>` | Return object-map schema and summarized `SampleAttributeDef` at depth `1`. |
| `SampleAttributeDef["scale"] \| null` | Normalize to `Scale \| null`, return curated `Scale` docs and examples. |
| `[Threshold, ...Threshold[]]` | Return non-empty array of `Threshold`. |
| `NominalFilterValue[]` | Return array of scalar/category values. This replaces current `any[]`. |
| `string[]` | Return array of strings. |
| `string`, `number`, `boolean` | Return primitive schema and a note to use field docs for semantics. |

The resolver also needs to accept every generated `payloadFields[].typeRefs[]` entry.

## Centralized Rule Buckets

Keep these records/helpers in or near `agentActionSchema.js`:

- `agentSchemaOverrides`: validation/doc contract changes, currently including agent-facing `AttributeIdentifier`.
- `primitiveTypeSchemas`: schemas for `string`, `number`, and `boolean`.
- `resolveDisplayTypeExpression(typeText, definitions)`: limited support for primitives, `T[]`, `[T, ...T[]]`, `Record<K,V>`, unions, and indexed access such as `SampleAttributeDef["scale"]`.
- `docsOnlyTypeSummaries`: curated docs for broad generated types such as `Scale` and `SampleAttributeDef`.
- `typeExamples`: examples returned by `getIntentActionTypeDocs`.
- `typeNotes`: semantic guidance not captured by JSON Schema.

## Drift-Prevention Invariant

Before shipping, tests must prove:

- Every generated `payloadFields[].type` is accepted by `getIntentActionTypeDocs`.
- Every generated `payloadFields[].typeRefs[]` entry is accepted by `getIntentActionTypeDocs`.
- Every non-primitive complex payload field has at least one useful `typeRefs` entry.
- Malformed `submitIntentAction` responses point the agent to `getIntentActionTypeDocs` when the failure is likely caused by a complex field shape.
- `getIntentActionDocs` no longer supports or documents `includeSchema`.

## Phase 1: Remove `any[]` From Action Docs

**Purpose:** Avoid normalizing an intentionally vague type into the new tool contract.

**Files:**

- `packages/app/src/sampleView/state/payloadTypes.d.ts`
- `packages/app-agent/src/agent/actionCatalog.test.js`
- Generated action artifacts under `packages/app-agent/src/agent/generated/`

**Steps:**

- Add a catalog test that fails if any generated action payload field type contains `any`.
- Add a named `NominalFilterValue` type, likely `Scalar | null`.
- Change nominal filter payload docs from `any[]` to `NominalFilterValue[]`.
- Regenerate agent artifacts.

**Verify:**

```bash
npm --workspace @genome-spy/app-agent run generate:agent
npx vitest run packages/app-agent/src/agent/actionCatalog.test.js
```

**Commit:**

```bash
git add packages/app/src/sampleView/state/payloadTypes.d.ts packages/app-agent/src/agent/generated packages/app-agent/src/agent/actionCatalog.test.js
git commit -m "fix(app-agent): name nominal filter values"
```

## Phase 2: Generate Queryable Type References

**Purpose:** Make action docs explicitly tell the agent which field types are worth querying.

**Files:**

- `packages/app-agent/scripts/generateAgentActionCatalog.mjs`
- `packages/app-agent/scripts/generateAgentActionCatalog.test.mjs`
- `packages/app-agent/src/agent/types.d.ts`
- `packages/app-agent/src/agent/generated/generatedActionCatalog.json`

**Steps:**

- Add `typeRefs: string[]` to `AgentPayloadField`.
- Update the action catalog generator to collect named type references from the TypeScript AST.
- Handle current emitted forms only: type references, arrays, tuples/rest tuples, unions, indexed access, and `Record<K,V>`.
- Map `SampleAttributeDef["scale"]` to `Scale`.
- Exclude primitive refs.
- Add generator tests for at least:
  - `AttributeIdentifier` -> `["AttributeIdentifier"]`
  - `SampleAttributeDef["scale"] | null` -> `["Scale"]`
  - `[Threshold, ...Threshold[]]` -> `["Threshold"]`

**Verify:**

```bash
npm --workspace @genome-spy/app-agent run generate:agent
npx vitest run packages/app-agent/scripts/generateAgentActionCatalog.test.mjs
```

**Commit:**

```bash
git add packages/app-agent/scripts/generateAgentActionCatalog.mjs packages/app-agent/scripts/generateAgentActionCatalog.test.mjs packages/app-agent/src/agent/types.d.ts packages/app-agent/src/agent/generated/generatedActionCatalog.json
git commit -m "feat(app-agent): generate action payload type refs"
```

## Phase 3: Implement Action Type Docs Resolver

**Purpose:** Add the content builder behind `getIntentActionTypeDocs`.

**Files:**

- `packages/app-agent/src/agent/agentActionSchema.js`
- `packages/app-agent/src/agent/intentActionTypeDocs.js`
- `packages/app-agent/src/agent/intentActionTypeDocs.test.js`

**Steps:**

- Add or expose centralized rule buckets in `agentActionSchema.js`.
- Create `intentActionTypeDocs.js`.
- Resolve direct generated definitions.
- Resolve display expressions through the limited resolver.
- Collect immediate `$ref` definitions when `referenceDepth` is `1`.
- Prefer docs-only summaries over full generated definitions for broad types such as `Scale`.
- Attach relevant examples and notes.
- Add exhaustive tests for every generated `payloadFields[].type` and `payloadFields[].typeRefs[]`.

**Minimum tests:**

- `AttributeIdentifier` returns the agent-facing union and selection aggregation notes.
- `ComparisonOperatorType` returns enum docs.
- `string`, `string[]`, and `boolean` resolve tersely.
- `[Threshold, ...Threshold[]]` resolves to a non-empty array.
- `SampleAttributeDef["scale"] | null` normalizes to `Scale | null`, returns curated `Scale`, and does not include fat transitive definitions.
- `Record<AttributeName, SampleAttributeDef>` returns object-map docs.
- `NominalFilterValue[]` returns scalar/category values and notes.
- Every generated action payload field display type resolves.
- Every generated `typeRefs` entry resolves.

**Verify:**

```bash
npx vitest run packages/app-agent/src/agent/intentActionTypeDocs.test.js
```

**Commit:**

```bash
git add packages/app-agent/src/agent/agentActionSchema.js packages/app-agent/src/agent/intentActionTypeDocs.js packages/app-agent/src/agent/intentActionTypeDocs.test.js
git commit -m "feat(app-agent): add intent action type docs resolver"
```

## Phase 4: Add Tool Input and Generated Tool Artifacts

**Purpose:** Expose the new tool in generated tool schemas and remove `includeSchema` from action docs input.

**Files:**

- `packages/app-agent/src/agent/agentToolInputs.d.ts`
- `packages/app-agent/src/agent/generated/generatedToolCatalog.json`
- `packages/app-agent/src/agent/generated/generatedToolSchema.json`

**Steps:**

- Remove `includeSchema` from `GetIntentActionDocsToolInput`.
- Add `GetIntentActionTypeDocsToolInput`.
- Add `getIntentActionTypeDocs` to `AgentToolInputs`.
- Regenerate agent artifacts.
- Confirm generated tool artifacts include `getIntentActionTypeDocs`.
- Confirm generated tool artifacts do not contain `includeSchema`.

**Verify:**

```bash
npm --workspace @genome-spy/app-agent run generate:agent
rg "getIntentActionTypeDocs" packages/app-agent/src/agent/generated/generatedToolCatalog.json packages/app-agent/src/agent/generated/generatedToolSchema.json
rg "includeSchema" packages/app-agent/src/agent/generated/generatedToolCatalog.json packages/app-agent/src/agent/generated/generatedToolSchema.json
```

Expected: the first `rg` finds the new tool, and the second `rg` has no matches.

**Commit:**

```bash
git add packages/app-agent/src/agent/agentToolInputs.d.ts packages/app-agent/src/agent/generated/generatedToolCatalog.json packages/app-agent/src/agent/generated/generatedToolSchema.json
git commit -m "feat(app-agent): expose intent action type docs tool"
```

## Phase 5: Wire Tool Handlers

**Purpose:** Make compact action docs and action type docs available at runtime.

**Files:**

- `packages/app-agent/src/agent/agentTools.js`
- `packages/app-agent/src/agent/agentTools.test.js`

**Steps:**

- Remove `getAgentActionPayloadSchemaBundle` import from `agentTools.js`.
- Remove `includeSchema` response handling from `getIntentActionDocs`.
- Add `referencedTypes` to `getIntentActionDocs` from generated `payloadFields[].typeRefs`.
- Add `getIntentActionTypeDocs` handler.
- Use an import alias to avoid handler/content-builder naming collisions.
- Remove or rewrite tests that call `getIntentActionDocs` with `includeSchema: true`.

**Verify:**

```bash
npx vitest run packages/app-agent/src/agent/agentTools.test.js packages/app-agent/src/agent/intentActionTypeDocs.test.js
```

**Commit:**

```bash
git add packages/app-agent/src/agent/agentTools.js packages/app-agent/src/agent/agentTools.test.js
git commit -m "feat(app-agent): wire intent action type docs tool"
```

## Phase 6: Update Validation Repair Guidance

**Purpose:** Make malformed action payload failures tell the agent how to recover.

**Files:**

- `packages/app-agent/src/agent/toolCatalog.js`
- `packages/app-agent/src/agent/toolCatalog.test.js`

**Steps:**

- Replace old `includeSchema: true` guidance for malformed `submitIntentAction` arguments.
- New guidance should tell the agent to call `getIntentActionTypeDocs` with the relevant `payloadFields[].type` from `getIntentActionDocs`.
- Keep generic tool-schema guidance for non-action tools unchanged unless tests require a narrower edit.

**Verify:**

```bash
npx vitest run packages/app-agent/src/agent/toolCatalog.test.js
```

**Commit:**

```bash
git add packages/app-agent/src/agent/toolCatalog.js packages/app-agent/src/agent/toolCatalog.test.js
git commit -m "fix(app-agent): guide malformed actions to type docs"
```

## Phase 7: Update Prompt and Server Tests

**Purpose:** Teach the agent the new lookup workflow.

**Files:**

- `packages/app-agent/server/app/prompts/genomespy_system_prompt.md`
- Relevant tests under `packages/app-agent/server/tests/`

**Steps:**

- Replace prompt guidance that mentions `getIntentActionDocs(actionType, includeSchema)`.
- Tell the agent to call `getIntentActionDocs(actionType)` before constructing unfamiliar action payloads.
- Tell the agent to call `getIntentActionTypeDocs(typeName)` for unclear complex payload field types.
- Discourage querying primitive types unless validation failed.
- Update tests to assert `getIntentActionTypeDocs` appears and `includeSchema` does not appear in active prompt guidance.

**Verify:**

```bash
pytest packages/app-agent/server/tests/test_main.py packages/app-agent/server/tests/test_prompt_builder.py
```

If `pytest` is unavailable, run the package-documented server test command and record the blocker.

**Commit:**

```bash
git add packages/app-agent/server/app/prompts/genomespy_system_prompt.md packages/app-agent/server/tests
git commit -m "docs(app-agent): update action docs prompt workflow"
```

## Phase 8: Remove Old Schema Bundle Code

**Purpose:** Delete dead code left behind by removing `includeSchema`.

**Files:**

- `packages/app-agent/src/agent/agentActionSchema.js`
- `packages/app-agent/src/agent/agentTools.js`
- Tests touched only if cleanup exposes stale assertions

**Steps:**

- Search for old production references:

```bash
rg "getAgentActionPayloadSchemaBundle|getRequiredActionPayloadSchema|includeSchema" packages/app-agent/src packages/app-agent/server
```

- Remove `getRequiredActionPayloadSchema` from `agentTools.js` if still present.
- Remove old action-doc schema bundle helpers from `agentActionSchema.js` if only used by the deleted `includeSchema` path:
  - `omittedDocsDefinitions`
  - `getAgentActionPayloadSchemaBundle`
  - `collectReachableDefinitions`
  - `visitSchema`
- Keep validation helpers:
  - `stepVariants`
  - `getAgentActionSchemaDefinitions`
  - `createActionSchemaWrapper`
  - `createAgentActionSchemaWrapper`
  - `getActionPayloadSchema`
- Keep shared helpers such as `cloneJson` only if still used.

**Verify:**

```bash
npx vitest run packages/app-agent/src/agent/agentTools.test.js packages/app-agent/src/agent/actionShapeValidator.test.js packages/app-agent/src/agent/intentActionTypeDocs.test.js
rg "getAgentActionPayloadSchemaBundle|getRequiredActionPayloadSchema|includeSchema" packages/app-agent/src packages/app-agent/server
```

Expected: tests pass. The final `rg` has no production matches.

**Commit:**

```bash
git add packages/app-agent/src/agent/agentActionSchema.js packages/app-agent/src/agent/agentTools.js packages/app-agent/src/agent/*.test.js
git commit -m "refactor(app-agent): remove action docs schema bundle"
```

## Phase 9: Final Verification

**Purpose:** Confirm generated artifacts, types, unit tests, prompt tests, and lint all agree.

**Steps:**

- Check generated artifacts:

```bash
npm --workspace @genome-spy/app-agent run check:agent
```

- Run TypeScript checks:

```bash
npm --workspace @genome-spy/app-agent run test:tsc --if-present
```

- Run app-agent unit tests:

```bash
npm --workspace @genome-spy/app-agent test
```

- Run prompt/server tests if they are not included above:

```bash
pytest packages/app-agent/server/tests/test_main.py packages/app-agent/server/tests/test_prompt_builder.py
```

- Run lint:

```bash
npm run lint
```

- Inspect final diff:

```bash
git diff --stat
git status --short
```

**Commit:**

Only commit in this phase if verification requires small follow-up fixes:

```bash
git add <changed-files>
git commit -m "test(app-agent): verify intent action type docs workflow"
```

## Final Acceptance Criteria

- `getIntentActionDocs` returns compact docs, examples, payload fields, and `referencedTypes`.
- `getIntentActionDocs` has no `includeSchema` input or schema response branch.
- `getIntentActionTypeDocs` is present in tool input types, generated tool schema/catalog, runtime handlers, prompt guidance, and tests.
- Every generated action payload field type and type ref is queryable.
- `Scale` docs are useful but compact.
- `any[]` is not exposed in generated action payload docs.
- Malformed complex action payloads suggest `getIntentActionTypeDocs`.
- Old schema bundle code is removed.
- Each phase has a focused commit.

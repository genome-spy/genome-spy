# Selection Aggregation Action Adapter

Plan for allowing agent-authored intent actions to use
`SELECTION_AGGREGATION` candidates directly while keeping Redux actions and
reducers on canonical `AttributeIdentifier` payloads.

## Problem

Plotting tools and `getAttributeSummary` already accept compact
`SELECTION_AGGREGATION` candidates:

```json
{
  "type": "SELECTION_AGGREGATION",
  "candidateId": "brush@track:field",
  "aggregation": "max"
}
```

Intent actions still require resolved `AttributeIdentifier` payloads because
the generated action schemas and Redux reducers expect app-native payload
types. This forces the agent to call `buildSelectionAggregationAttribute` before
actions such as deriving metadata, sorting, filtering, or grouping.

## Goal

Let the agent submit compact selection-derived attributes directly inside
intent action payloads, then normalize them before validation/execution reaches
the app layer.

The app-facing action creators and reducers should continue to receive only
canonical `AttributeIdentifier` objects.

## Non-Goals

- Do not change Redux reducer payload contracts.
- Do not duplicate app action payload types in app-agent.
- Do not teach the agent to construct `VALUE_AT_LOCUS` objects by hand.
- Do not replace `buildSelectionAggregationAttribute` immediately; it can remain
  as a diagnostic or compatibility tool until the new path is proven.

## Existing Pieces

- `attributeCandidate.js`
  - Resolves `SAMPLE_ATTRIBUTE` and `SELECTION_AGGREGATION` candidates.
  - Already contains the canonical conversion logic used by plots and
    `getAttributeSummary`.
- `agentTools.submitIntentActions(...)`
  - Receives agent-authored action payloads and forwards them to
    `runtime.submitIntentActions(...)`.
- `intentProgramExecutor.js`
  - Validates and executes canonical app intent batches.
- `actionShapeValidator.js`
  - Validates action payloads against generated action schemas.
- `generatedActionTypes.ts` and `generatedActionSchema.json`
  - Generated from app action payload typings.

## Proposed Design

Add an agent-side normalization boundary before intent actions enter the app
executor:

1. Accept agent-authored action payloads where `AttributeIdentifier` fields may
   also contain `SELECTION_AGGREGATION` candidates.
2. Walk each submitted action payload and replace every
   `SELECTION_AGGREGATION` candidate with the resolved canonical
   `AttributeIdentifier`.
3. Validate and execute the normalized batch through the existing
   `intentProgramExecutor` path.

The normalizer should reuse `resolveAgentAttributeCandidate(...)` rather than
duplicating selection aggregation construction.

## Type Strategy

Prefer deriving the agent-authored action input type from the generated app
action type:

```ts
type AgentAttributeInput = AttributeIdentifier | SelectionAggregationCandidate;

type AgentizeAttributes<T> =
    T extends AttributeIdentifier ? AgentAttributeInput :
    T extends readonly (infer U)[] ? AgentizeAttributes<U>[] :
    T extends object ? { [K in keyof T]: AgentizeAttributes<T[K]> } :
    T;
```

Then use a derived agent-facing action step type for `submitIntentActions`.

This avoids copying payload contracts while making only `AttributeIdentifier`
positions broader for the agent.

## Schema Strategy

First try generating the tool schema from the recursive mapped type above. If
`ts-json-schema-generator` emits a clear schema, keep this path.

If schema generation becomes noisy or incorrect, use schema post-processing:

- Generate the canonical action schema as today.
- For the agent tool schema and action-shape validator, replace refs to
  `AttributeIdentifier` with an `anyOf` union:
  - canonical `AttributeIdentifier`
  - `SelectionAggregationCandidate`
- Keep generated app action schema unchanged for executor-facing validation.

The post-processing fallback is less elegant but still centralizes the adapter
without duplicating payload types.

## Normalization Strategy

Add a small recursive normalizer, for example
`normalizeAgentIntentActionAttributes(runtime, value)`.

Rules:

- If an object has `type: "SELECTION_AGGREGATION"`, string `candidateId`, and
  string `aggregation`, resolve it with `resolveAgentAttributeCandidate(...)`.
- Recurse into arrays and plain objects.
- Leave all other values unchanged.
- Fail fast on invalid candidates by reusing the existing resolver errors.

This broad recursive pass is acceptable because `SELECTION_AGGREGATION` is an
agent-only marker and should never be a legitimate non-attribute payload object.

## Implementation Steps

Before each implementation step, record the baseline measurements listed below.
After the step, record the same measurements again and include the delta in the
commit notes or plan update:

- Focused source line counts:
  - `wc -l packages/app-agent/src/agent/agentToolInputs.d.ts`
  - `wc -l packages/app-agent/src/agent/agentTools.js`
  - `wc -l packages/app-agent/src/agent/attributeCandidate.js`
  - any new adapter/normalizer files
- Generated schema size:
  - `wc -c packages/app-agent/src/agent/generated/generatedToolSchema.json`
  - `wc -c packages/app-agent/src/agent/generated/generatedActionSchema.json`
- Relevant generated schema slice size:
  - byte count or line count for the `submitIntentActions` schema/definition
    section in `generatedToolSchema.json`.
  - One repeatable way to measure it:

    ```sh
    node -e 'const s=require("./packages/app-agent/src/agent/generated/generatedToolSchema.json"); console.log(JSON.stringify(s.definitions.SubmitIntentActionsToolInput).length)'
    ```

  - If schema generation moves the relevant action-step detail outside that
    definition, also record a short qualitative note about whether the
    `submitIntentActions` schema remained readable.

### Measurement Log

Baseline before implementation:

- Focused source lines:
  - `agentToolInputs.d.ts`: 458
  - `agentTools.js`: 565
  - `attributeCandidate.js`: 191
- Generated schema sizes:
  - `generatedToolSchema.json`: 80,565 bytes
  - `generatedActionSchema.json`: 61,188 bytes
  - `SubmitIntentActionsToolInput` JSON slice: 1,149 bytes

Step 1 attempted the recursive mapped type strategy. Result: rejected. It made
`generatedToolSchema.json` smaller, but produced many noisy
`AgentizeAttributes<...>` definitions and made the action schema hard to read.

- Focused source lines:
  - `agentToolInputs.d.ts`: 477
  - `agentTools.js`: 565
  - `attributeCandidate.js`: 191
- Generated schema sizes:
  - `generatedToolSchema.json`: 79,902 bytes
  - `generatedActionSchema.json`: 61,188 bytes
  - `SubmitIntentActionsToolInput` JSON slice: 1,151 bytes

Step 2 uses the schema post-processing fallback and adds the runtime
normalizer.

- Focused source lines:
  - `agentToolInputs.d.ts`: 458
  - `agentTools.js`: 570
  - `attributeCandidate.js`: 191
  - `agentIntentActionAttributes.js`: 56
  - `actionShapeValidator.js`: 583
  - `submitIntentActionsValidator.js`: 89
- Generated schema sizes:
  - `generatedToolSchema.json`: 80,803 bytes
  - `generatedActionSchema.json`: 61,188 bytes
  - `SubmitIntentActionsToolInput` JSON slice: 1,149 bytes
- Verification:
  - `npx vitest run packages/app-agent/src/agent/toolCatalog.test.js packages/app-agent/src/agent/actionShapeValidator.test.js packages/app-agent/src/agent/agentTools.test.js`
    passed.
  - `npm --workspace packages/app-agent run test:tsc` passed.
  - `npm --workspace packages/app-agent run check:agent` passed.

1. Add the agent-facing action input type.
   - Try the recursive `AgentizeAttributes<T>` approach in
     `agentToolInputs.d.ts`.
   - Regenerate tool schemas and inspect `submitIntentActions`.
   - Measure success:
     - `generatedToolSchema.json` accepts `SELECTION_AGGREGATION` under action
       payload attributes.
     - The generated `submitIntentActions` schema remains readable and does not
       duplicate full payload contracts by hand.
     - `npm --workspace packages/app-agent run check:agent` passes.
     - Record line-count and schema-size deltas.

2. Add normalization before submission.
   - Normalize `input.actions` in `agentTools.submitIntentActions(...)`.
   - Pass the normalized actions to `runtime.submitIntentActions(...)`.
   - Measure success:
     - A focused unit test proves submitted `SELECTION_AGGREGATION` candidates
       are converted to canonical `VALUE_AT_LOCUS` attributes before runtime
       submission.
     - Existing canonical action payload tests still pass unchanged.
     - Record line-count and schema-size deltas.

3. Keep canonical executor behavior.
   - Do not change reducers or action creators.
   - Keep `intentProgramExecutor` validating canonical batches.
   - Measure success:
     - No files under `packages/app/src/sampleView/state/` change.
     - `intentProgramExecutor` tests still validate canonical payloads.
     - Record line-count and schema-size deltas.

4. Add focused tests.
   - `submitIntentActions` accepts a `SELECTION_AGGREGATION` attribute in
     `deriveMetadata`.
   - The runtime receives a canonical `VALUE_AT_LOCUS` attribute.
   - Invalid candidate ids are rejected as tool errors.
   - Existing canonical `SAMPLE_ATTRIBUTE` and `VALUE_AT_LOCUS` payloads still
     pass unchanged.
   - Measure success:
     - `npx vitest run packages/app-agent/src/agent/agentTools.test.js`
       includes the adapter cases and passes.
     - Any new normalizer test file is run directly and passes.
     - Record line-count and schema-size deltas.

5. Update prompt/tool docs.
   - Say intent actions can use `SELECTION_AGGREGATION` candidates directly once
     the adapter exists.
   - Deprecate the mandatory `buildSelectionAggregationAttribute` step in the
     workflow text.
   - Measure success:
     - `rg "buildSelectionAggregationAttribute" packages/app-agent/server/app/prompts`
       shows it is no longer described as mandatory for intent actions.
     - Tool docs and generated schema describe direct action use without
       claiming Redux reducers accept compact candidates.
     - Record line-count and schema-size deltas.

6. Reconsider `buildSelectionAggregationAttribute`.
   - Keep it initially for diagnostics and backwards compatibility.
   - After the new path is stable, decide whether to remove it from the tool
     surface.
   - Measure success:
     - Either a follow-up issue/plan note records why the tool remains, or a
       separate cleanup removes it with generated schema/tests updated.
     - Record line-count and schema-size deltas.

## Risks

- Recursive mapped types may generate poor JSON Schema.
- A broad recursive normalizer may resolve objects in unexpected payload
  locations, though the marker shape is specific enough to keep this low risk.
- Action-shape validation currently happens before runtime execution; the
  agent-facing schema must accept compact candidates or the tool call will be
  rejected before normalization.

## Success Criteria

- The agent can submit `SELECTION_AGGREGATION` directly in an action payload.
- Redux reducers receive only canonical app payloads.
- Generated schemas remain understandable.
- No app action payload typings are duplicated in app-agent.

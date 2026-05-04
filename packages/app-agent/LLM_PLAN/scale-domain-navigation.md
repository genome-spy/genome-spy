# Scale Domain and Zoom-To Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose current named zoomable scale domains in the agent volatile context, connect them to ViewTree scale summaries, and add a minimal animated `zoomTo` tool.

**Architecture:** Use Core's existing `ScaleResolutionApi` as the scale control surface. App `AgentApi` only exposes the named scale-resolution map; app-agent builds the LLM-facing domain projection and owns the `zoomToScale` tool. Stable scale identity belongs in the ViewTree, while high-churn current domains belong in `AgentVolatileContext`.

**Tech Stack:** JavaScript with JSDoc, TypeScript declaration files for agent contracts, Vitest, generated agent tool catalog/schema artifacts.

---

## Design Summary

The agent needs two linked pieces of context:

- Stable ViewTree scale references that explain what a scale controls.
- Volatile current domains for named zoomable scales.

The stable ViewTree should include scale identity:

```json
{
  "encodings": {
    "x": {
      "field": "pos",
      "scale": {
        "name": "x_at_root",
        "type": "locus",
        "zoomable": true,
        "domainRef": "x_at_root"
      }
    }
  }
}
```

The volatile context should include only the current domain:

```json
{
  "scaleDomains": [
    {
      "name": "x_at_root",
      "domain": [
        { "chrom": "chr8", "pos": 127000000 },
        { "chrom": "chr8", "pos": 129000000 }
      ],
      "zoomed": true
    }
  ]
}
```

The agent joins these through `scale.domainRef` / `scaleDomains[].name`.

Only zoomable named scales are included in `scaleDomains`, so volatile domain rows do not need a `zoomable` field. Scale type stays in the stable ViewTree scale summary, where it does not churn.

## Scope

### Phase 1: Domain Exposure

- App `AgentApi` exposes named Core scale resolutions.
- app-agent adds stable ViewTree scale references.
- app-agent adds volatile `scaleDomains`.

### Phase 2: Minimal Navigation

- app-agent adds one tool: `zoomToScale(scaleName, domain)`.
- The tool resolves the named `ScaleResolutionApi` through `AgentApi`.
- The tool calls `scaleResolution.zoomTo(domain, true)` so agent-initiated zooms are animated.

## Non-Goals

- Do not expose linked-selection metadata.
- Do not reuse bookmark-domain filtering; volatile context must reflect the actual current viewport.
- Do not add selector objects for scales; scale names are the public address.
- Do not add App-specific scale navigation wrappers.
- Do not support `pan`, `zoomBy`, or `reset` in this plan.
- Do not add `animate` to the tool input; agent-controlled zooms always animate.

## File Map

### Phase 1: Domain Exposure

- Modify `packages/app/src/agentApi/index.d.ts`
  - Add `getNamedScaleResolutions(): Map<string, ScaleResolutionApi>` to `AgentApi`.
- Modify `packages/app/src/agentApi/index.js`
  - Return `app.genomeSpy.getNamedScaleResolutions()`.
- Modify `packages/app/src/agentApi/index.test.js`
  - Test that the named scale map is exposed.
- Modify `packages/app-agent/src/agent/agentContextTypes.d.ts`
  - Add stable scale-reference fields to `AgentViewScaleSummary`.
  - Add app-agent-owned `AgentScaleDomainSummary`.
- Modify `packages/app-agent/src/agent/types.d.ts`
  - Add `scaleDomains` to `AgentVolatileContext`.
- Modify `packages/app-agent/src/agent/viewTree.js`
  - Include stable `name`, `domainRef`, and `zoomable` in scale summaries.
  - Continue omitting volatile positional/locus domains from the stable ViewTree.
- Modify `packages/app-agent/src/agent/viewTree.test.js`
  - Test that scale summaries expose stable references and omit volatile domains.
- Modify `packages/app-agent/src/agent/volatileContextBuilder.js`
  - Build `scaleDomains` from `agentApi.getNamedScaleResolutions()`.
- Modify `packages/app-agent/src/agent/volatileContextBuilder.test.js`
  - Test that volatile context includes current domains for zoomable named scales only.

### Phase 2: Minimal Navigation

- Modify `packages/app-agent/src/agent/agentToolInputs.d.ts`
  - Add `ZoomToScaleToolInput` and register `zoomToScale` in `AgentToolInputs`.
- Modify `packages/app-agent/src/agent/agentTools.js`
  - Add the `zoomToScale` handler.
- Modify `packages/app-agent/src/agent/agentTools.test.js`
  - Test animated `zoomTo`, unknown scale rejection, and non-zoomable scale rejection.
- Regenerate generated files:
  - `packages/app-agent/src/agent/generated/generatedToolCatalog.json`
  - `packages/app-agent/src/agent/generated/generatedToolSchema.json`
- Modify `packages/app-agent/server/app/prompts/genomespy_system_prompt.md`
  - Document scale names, `scaleDomains`, and `zoomToScale`.

## Proposed Contracts

### App AgentApi

Add to `packages/app/src/agentApi/index.d.ts`:

```ts
import type { ScaleResolutionApi } from "@genome-spy/core/types/scaleResolutionApi.js";
```

Add to `AgentApi`:

```ts
getNamedScaleResolutions(): Map<string, ScaleResolutionApi>;
```

### Agent Volatile Context

Add to `packages/app-agent/src/agent/agentContextTypes.d.ts`:

```ts
export interface AgentScaleDomainSummary {
    name: string;
    domain: unknown[];
    zoomed: boolean;
}
```

Add to `AgentVolatileContext` in `packages/app-agent/src/agent/types.d.ts`:

```ts
scaleDomains: AgentScaleDomainSummary[];
```

### Tool Input

Add to `packages/app-agent/src/agent/agentToolInputs.d.ts`:

```ts
/**
 * Zoom a named zoomable scale to a target domain. Use only scale names listed
 * in volatile `scaleDomains`. Agent-controlled zooms are always animated. For
 * genomic locus scales, interval endpoints must be chromosome-position
 * objects. For quantitative and index-like scales, use numeric endpoints.
 *
 * @example
 * {
 *   "scaleName": "x_at_root",
 *   "domain": [
 *     { "chrom": "chr8", "pos": 127000000 },
 *     { "chrom": "chr8", "pos": 129000000 }
 *   ]
 * }
 *
 * @example
 * {
 *   "scaleName": "score_scale",
 *   "domain": [0, 100]
 * }
 */
export interface ZoomToScaleToolInput {
    /**
     * Named scale resolution to zoom. Use a name from volatile `scaleDomains`.
     */
    scaleName: string;

    /**
     * Target external domain accepted by `ScaleResolutionApi.zoomTo(...)`.
     */
    domain: unknown[];
}
```

Add to `AgentToolInputs`:

```ts
zoomToScale: ZoomToScaleToolInput;
```

## Task 1: Expose Named Scale Resolutions Through AgentApi

**Files:**
- Modify: `packages/app/src/agentApi/index.d.ts`
- Modify: `packages/app/src/agentApi/index.js`
- Modify: `packages/app/src/agentApi/index.test.js`

- [ ] **Step 1: Write failing AgentApi test**

In `packages/app/src/agentApi/index.test.js`, add a named scale map to the `beforeEach` app stub:

```js
const namedScaleResolutions = new Map([
    [
        "x_at_root",
        {
            getComplexDomain: vi.fn(() => [
                { chrom: "chr1", pos: 10 },
                { chrom: "chr1", pos: 20 },
            ]),
            isZoomable: vi.fn(() => true),
            isZoomed: vi.fn(() => true),
            zoomTo: vi.fn(async () => undefined),
        },
    ],
]);
```

Add it to `app.genomeSpy`:

```js
getNamedScaleResolutions: vi.fn(() => namedScaleResolutions),
```

Add the test:

```js
it("exposes named scale resolutions for agent context and tools", () => {
    const agentApi = createAgentApi(app);

    expect(agentApi.getNamedScaleResolutions()).toBe(namedScaleResolutions);
});
```

- [ ] **Step 2: Run focused test to verify failure**

Run:

```bash
npx vitest run packages/app/src/agentApi/index.test.js
```

Expected: FAIL because `getNamedScaleResolutions` is not implemented.

- [ ] **Step 3: Add type contract**

In `packages/app/src/agentApi/index.d.ts`, import `ScaleResolutionApi`:

```ts
import type { ScaleResolutionApi } from "@genome-spy/core/types/scaleResolutionApi.js";
```

Add to `AgentApi` after `getRootSpec()`:

```ts
getNamedScaleResolutions(): Map<string, ScaleResolutionApi>;
```

- [ ] **Step 4: Implement AgentApi method**

In `packages/app/src/agentApi/index.js`, add this method after `getRootSpec()`:

```js
getNamedScaleResolutions() {
    return app.genomeSpy.getNamedScaleResolutions();
},
```

- [ ] **Step 5: Run focused test**

Run:

```bash
npx vitest run packages/app/src/agentApi/index.test.js
```

Expected: PASS.

## Task 2: Add Agent Context Types

**Files:**
- Modify: `packages/app-agent/src/agent/agentContextTypes.d.ts`
- Modify: `packages/app-agent/src/agent/types.d.ts`

- [ ] **Step 1: Extend context types**

In `agentContextTypes.d.ts`, add:

```ts
export interface AgentScaleDomainSummary {
    name: string;
    domain: unknown[];
    zoomed: boolean;
}
```

Extend `AgentViewScaleSummary`:

```ts
export interface AgentViewScaleSummary {
    name?: string;
    type: string;
    domainRef?: string;
    zoomable?: boolean;
    domain?: unknown;
    range?: unknown;
    scheme?: unknown;
    assembly?: Scale["assembly"];
    reverse?: boolean;
}
```

In `types.d.ts`, add `AgentScaleDomainSummary` to the imports and exports from `agentContextTypes.d.ts`.

Add to `AgentVolatileContext`:

```ts
scaleDomains: AgentScaleDomainSummary[];
```

- [ ] **Step 2: Run typecheck to verify expected failure**

Run:

```bash
npm --workspace @genome-spy/app-agent run test:tsc:src
```

Expected: FAIL until `volatileContextBuilder.js` includes `scaleDomains`.

## Task 3: Connect Stable Scale References to the ViewTree

**Files:**
- Modify: `packages/app-agent/src/agent/viewTree.js`
- Modify: `packages/app-agent/src/agent/viewTree.test.js`

- [ ] **Step 1: Write failing ViewTree test**

Add or extend a ViewTree test using a fake scale resolution whose scale has a name:

```js
it("summarizes scale identity without volatile positional domains", () => {
    const scaleResolution = {
        name: "x_at_root",
        isZoomable: () => true,
        getResolvedScaleType: () => "locus",
        getScale: () => ({
            type: "locus",
            props: {
                type: "locus",
                name: "x_at_root",
            },
            domain: () => [
                { chrom: "chr1", pos: 10 },
                { chrom: "chr1", pos: 20 },
            ],
            range: () => [0, 100],
        }),
    };

    const summary = summarizeScaleForTest("x", scaleResolution);

    expect(summary).toEqual({
        name: "x_at_root",
        type: "locus",
        domainRef: "x_at_root",
        zoomable: true,
    });
});
```

If `summarizeScale` is not exported, test through `buildViewTree(...)` using the existing test patterns. The assertion should verify that a positional/locus scale gets `name`, `domainRef`, and `zoomable`, but no `domain`.

- [ ] **Step 2: Run focused test**

Run:

```bash
npx vitest run packages/app-agent/src/agent/viewTree.test.js
```

Expected: FAIL because scale identity is not yet included.

- [ ] **Step 3: Implement stable scale references**

Modify `summarizeScale(channel, scaleResolution)` in `viewTree.js`:

```js
const scaleName = scaleResolution.name ?? props.name;
if (scaleName) {
    summary.name = String(scaleName);
    summary.domainRef = String(scaleName);
}

if (typeof scaleResolution.isZoomable === "function") {
    const zoomable = scaleResolution.isZoomable();
    if (zoomable) {
        summary.zoomable = true;
    }
}
```

Keep existing domain/range omission rules for positional channels and locus domains.

- [ ] **Step 4: Run focused test**

Run:

```bash
npx vitest run packages/app-agent/src/agent/viewTree.test.js
```

Expected: PASS.

## Task 4: Expose Scale Domains in Volatile Context

**Files:**
- Modify: `packages/app-agent/src/agent/volatileContextBuilder.js`
- Modify: `packages/app-agent/src/agent/volatileContextBuilder.test.js`

- [ ] **Step 1: Write failing volatile context test**

Add to the agent API stub in the relevant test:

```js
getNamedScaleResolutions: vi.fn(() =>
    new Map([
        [
            "x_at_root",
            {
                getComplexDomain: vi.fn(() => [
                    { chrom: "chr1", pos: 10 },
                    { chrom: "chr1", pos: 20 },
                ]),
                isZoomable: vi.fn(() => true),
                isZoomed: vi.fn(() => true),
            },
        ],
        [
            "color_scale",
            {
                getComplexDomain: vi.fn(() => [0, 100]),
                isZoomable: vi.fn(() => false),
                isZoomed: vi.fn(() => false),
            },
        ],
    ])
),
```

Add assertion:

```js
expect(context.scaleDomains).toEqual([
    {
        name: "x_at_root",
        domain: [
            { chrom: "chr1", pos: 10 },
            { chrom: "chr1", pos: 20 },
        ],
        zoomed: true,
    },
]);
```

- [ ] **Step 2: Run focused test**

Run:

```bash
npx vitest run packages/app-agent/src/agent/volatileContextBuilder.test.js
```

Expected: FAIL because `scaleDomains` is missing.

- [ ] **Step 3: Implement scale-domain projection**

In `volatileContextBuilder.js`, add a helper:

```js
/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @returns {import("./types.d.ts").AgentScaleDomainSummary[]}
 */
function buildScaleDomains(agentApi) {
    return Array.from(agentApi.getNamedScaleResolutions())
        .filter(([, resolution]) => resolution.isZoomable())
        .map(([name, resolution]) => ({
            name,
            domain: resolution.getComplexDomain(),
            zoomed: resolution.isZoomed(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
```

In `getAgentVolatileContext(agentApi)`, add:

```js
scaleDomains: buildScaleDomains(agentApi),
```

Place it near `parameterValues` because both are high-churn runtime state.

- [ ] **Step 4: Run focused test**

Run:

```bash
npx vitest run packages/app-agent/src/agent/volatileContextBuilder.test.js
```

Expected: PASS.

## Task 5: Add `zoomToScale` Tool Contract and Generated Artifacts

**Files:**
- Modify: `packages/app-agent/src/agent/agentToolInputs.d.ts`
- Generate:
  - `packages/app-agent/src/agent/generated/generatedToolCatalog.json`
  - `packages/app-agent/src/agent/generated/generatedToolSchema.json`

- [ ] **Step 1: Add tool input type**

Add the `ZoomToScaleToolInput` definition from the Proposed Contracts section.

- [ ] **Step 2: Register the tool**

Add to `AgentToolInputs`:

```ts
zoomToScale: ZoomToScaleToolInput;
```

- [ ] **Step 3: Regenerate tool artifacts**

Run:

```bash
npm --workspace @genome-spy/app-agent run generate:agent
```

Expected: generated tool catalog and schema files update.

- [ ] **Step 4: Check generated artifacts**

Run:

```bash
npm --workspace @genome-spy/app-agent run check:agent
```

Expected: PASS.

## Task 6: Implement `zoomToScale` Tool Handler

**Files:**
- Modify: `packages/app-agent/src/agent/agentTools.js`
- Modify: `packages/app-agent/src/agent/agentTools.test.js`

- [ ] **Step 1: Write failing tool tests**

Add tests:

```js
it("zooms a named scale with animation", async () => {
    const resolution = {
        isZoomable: vi.fn(() => true),
        getComplexDomain: vi.fn(() => [0, 1]),
        zoomTo: vi.fn(async () => undefined),
    };
    const runtime = createRuntime();
    runtime.agentApi.getNamedScaleResolutions = vi.fn(
        () => new Map([["score_scale", resolution]])
    );

    await expect(
        agentTools.zoomToScale(runtime, {
            scaleName: "score_scale",
            domain: [0, 100],
        })
    ).resolves.toEqual({
        text: "Zoomed scale score_scale.",
        content: {
            kind: "scale_zoom",
            scaleName: "score_scale",
            domain: [0, 100],
        },
    });
    expect(resolution.zoomTo).toHaveBeenCalledWith([0, 100], true);
});

it("rejects unknown scale names", async () => {
    const runtime = createRuntime();
    runtime.agentApi.getNamedScaleResolutions = vi.fn(() => new Map());

    await expect(
        agentTools.zoomToScale(runtime, {
            scaleName: "missing",
            domain: [0, 100],
        })
    ).rejects.toThrow('Unknown scale name "missing".');
});

it("rejects non-zoomable scales", async () => {
    const runtime = createRuntime();
    runtime.agentApi.getNamedScaleResolutions = vi.fn(
        () =>
            new Map([
                [
                    "color_scale",
                    {
                        isZoomable: vi.fn(() => false),
                    },
                ],
            ])
    );

    await expect(
        agentTools.zoomToScale(runtime, {
            scaleName: "color_scale",
            domain: [0, 100],
        })
    ).rejects.toThrow('Scale "color_scale" is not zoomable.');
});
```

Adapt `createRuntime()` to include `agentApi.getNamedScaleResolutions`.

- [ ] **Step 2: Run focused tests**

Run:

```bash
npx vitest run packages/app-agent/src/agent/agentTools.test.js
```

Expected: FAIL because the handler is missing.

- [ ] **Step 3: Implement handler**

Add to `agentTools`:

```js
/**
 * @param {AgentToolRuntime} runtime
 * @param {import("./agentToolInputs.d.ts").ZoomToScaleToolInput} input
 */
async zoomToScale(runtime, input) {
    const resolution = runtime.agentApi
        .getNamedScaleResolutions()
        .get(input.scaleName);
    if (!resolution) {
        throw new ToolCallRejectionError(
            'Unknown scale name "' + input.scaleName + '".'
        );
    }

    if (!resolution.isZoomable()) {
        throw new ToolCallRejectionError(
            'Scale "' + input.scaleName + '" is not zoomable.'
        );
    }

    try {
        await resolution.zoomTo(input.domain, true);
        return {
            text: "Zoomed scale " + input.scaleName + ".",
            content: {
                kind: "scale_zoom",
                scaleName: input.scaleName,
                domain: input.domain,
            },
        };
    } catch (error) {
        throw new ToolCallRejectionError(
            error instanceof Error ? error.message : String(error)
        );
    }
},
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run packages/app-agent/src/agent/agentTools.test.js
```

Expected: PASS.

## Task 7: Update System Prompt Guidance

**Files:**
- Modify: `packages/app-agent/server/app/prompts/genomespy_system_prompt.md`

- [ ] **Step 1: Add scale-addressing guidance**

After the selector section, add:

```md
Scales are not identified by selector objects. Named scales are identified by
their `name`. ViewTree scale summaries may include `domainRef`; join that value
to `scaleDomains` in volatile context to understand the current viewport.
Use only scale names that appear in current context. Do not invent scale names.
```

- [ ] **Step 2: Add tool guidance**

In the tool section, add:

```md
### Scale-navigation tool

- `zoomToScale(scaleName, domain)`: animate a named zoomable scale to a target
  domain.

Use this for user-visible viewport/navigation requests. For locus scales, use
chromosome-position endpoints such as `{ "chrom": "chr8", "pos": 127000000 }`.
For quantitative and index-like scales, use numeric interval endpoints.
Do not use view selectors as scale names.
```

- [ ] **Step 3: Run prompt-adjacent tests**

Run:

```bash
npx vitest run packages/app-agent/src/agent/agentSessionController.test.js
```

Expected: PASS. If tests assert prompt/tool wording too tightly, update only assertions that describe the tool surface.

## Task 8: Full Verification

**Files:**
- No direct code changes unless verification fails.

- [ ] **Step 1: Run focused app-agent tests**

Run:

```bash
npx vitest run packages/app-agent/src/agent/viewTree.test.js packages/app-agent/src/agent/volatileContextBuilder.test.js packages/app-agent/src/agent/agentTools.test.js
```

Expected: PASS.

- [ ] **Step 2: Run App AgentApi tests**

Run:

```bash
npx vitest run packages/app/src/agentApi/index.test.js
```

Expected: PASS.

- [ ] **Step 3: Run generated artifact checks**

Run:

```bash
npm --workspace @genome-spy/app-agent run check:agent
```

Expected: PASS.

- [ ] **Step 4: Run TypeScript checks**

Run:

```bash
npm --workspace @genome-spy/app-agent run test:tsc
```

Expected: PASS.

- [ ] **Step 5: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

## Risk Notes

- `ScaleResolutionApi` does not expose scale type. Keep type in the stable ViewTree scale summary rather than duplicating it in volatile context.
- `zoomToScale` intentionally supports only `ScaleResolutionApi.zoomTo(...)`. Add pan, zoom-by, or reset later only if the UX requires them and the Core API is the right public surface.
- The tool always passes `true` as the `duration` argument so agent-controlled zooming is animated.
- Generated files must be regenerated after `agentToolInputs.d.ts` changes; do not edit generated artifacts manually.

## Commit Plan

Use small commits:

1. `feat(app): expose named scale resolutions to agent`
2. `feat(app-agent): expose scale domains in volatile context`
3. `feat(app-agent): add animated zoom-to-scale tool`
4. `docs(app-agent): document scale domain navigation`

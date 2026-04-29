# Sample Attribute Plot Tool Plan

This plan describes how to expose the existing sample metadata plots as an
agent tool that renders an embedded chart in the chat transcript instead of
opening a modal dialog.

The implementation must be split into two independent commits:

1. **Commit 1: App-only refactor.** Touch only `packages/app`. This commit must
   be cherry-pickable to `master` and must not depend on `packages/app-agent`.
2. **Commit 2: App Agent integration.** Touch `packages/app-agent` after Commit
   1 exists. Add or use `agentApi` wiring only in the feature branch.

A sub-agent assigned to Commit 1 must stop after the app-only commit is made.
Do not start agent-tool or chat integration in the same commit.

## Goal

Let the agent create the same exploratory plots users can currently open from
the sample-view menus:

- categorical metadata as bar plots
- quantitative metadata as box plots over the current sample groups
- quantitative-vs-quantitative metadata as scatter plots

The plot should be transient chat output. It should not be a provenance action
and should not change the visualization state.

## Existing Code

- Menu entry point:
  [`plotMenuItems.js`](../../app/src/sampleView/plotMenuItems.js)
- Current dialog wrappers:
  [`hierarchyBarplotDialog.js`](../../app/src/charts/hierarchyBarplotDialog.js),
  [`hierarchyBoxplotDialog.js`](../../app/src/charts/hierarchyBoxplotDialog.js),
  [`hierarchyScatterplotDialog.js`](../../app/src/charts/hierarchyScatterplotDialog.js)
- Reusable data builders:
  [`hierarchyBarplotData.js`](../../app/src/charts/hierarchyBarplotData.js),
  [`hierarchyBoxplotData.js`](../../app/src/charts/hierarchyBoxplotData.js),
  [`hierarchyScatterplotData.js`](../../app/src/charts/hierarchyScatterplotData.js)
- Existing boxplot spec helper:
  [`boxplotChart.js`](../../app/src/charts/boxplotChart.js)
- Feature-branch App host API for Commit 2 only:
  [`agentApi/index.js`](../../app/src/agentApi/index.js),
  [`agentApi/index.d.ts`](../../app/src/agentApi/index.d.ts)
- Agent tool contracts:
  [`agentToolInputs.d.ts`](../src/agent/agentToolInputs.d.ts)
- Tool execution:
  [`agentTools.js`](../src/agent/agentTools.js)
- Chat rendering:
  [`agentSessionController.js`](../src/agent/agentSessionController.js),
  [`chatMessage.js`](../src/agent/chatMessage.js)

## Commit 1: App-Only Foundation

The first commit should touch only `packages/app` and should be useful even
without the agent. Its purpose is to unify chart creation behind a reusable
renderable plot API and replace the per-plot dialog components with one generic
plot dialog.

This commit must be cherry-pickable to `master`.

### Commit 1 Scope

Allowed:

- `packages/app/src/charts/**`
- `packages/app/src/sampleView/plotMenuItems.js`
- app package type/export files if needed
- app tests next to the changed app code

Not allowed:

- `packages/app-agent/**`
- agent prompts
- generated agent tool catalogs or schemas
- server code
- provenance/action catalog changes
- `packages/app/src/agentApi/**`

If implementation seems to require touching `packages/app-agent` or
`packages/app/src/agentApi/**`, stop and revise the app-only chart boundary
instead. `agentApi` is not available in `master`, so Commit 1 must not touch it.

### Renderable Plot

The reusable app-level unit is a renderable plot:

```js
{
    kind: "sample_attribute_plot",
    plotType: "boxplot",
    title: "Boxplot of Age",
    spec,
    namedData: [
        { name: "hierarchy_boxplot_stats", rows: statsRows },
        { name: "hierarchy_boxplot_outliers", rows: outlierRows },
    ],
    filename: "genomespy-boxplot.png",
    summary: {
        groupCount: 4,
        rowCount: 12,
    },
}
```

This should not be called just a `spec` because the existing charts use named
data populated after `embed(...)` with `api.updateNamedData(...)`.

### App Refactor Steps

1. Add renderable plot types in `packages/app/src/charts/`.

   A small `.d.ts` file should define:
   - `SampleAttributePlotType`
   - `RenderablePlotNamedData`
   - `SampleAttributePlot`
   - request shapes for bar, boxplot, and scatterplot plots

2. Add renderable plot builders in App.

   Add a module such as
   [`hierarchySampleAttributePlots.js`](../../app/src/charts/hierarchySampleAttributePlots.js)
   that exports:
   - `buildHierarchyBarplot(...)`
   - `buildHierarchyBoxplot(...)`
   - `buildHierarchyScatterplot(...)`
   - optionally `buildHierarchySampleAttributePlot(...)` as a discriminated
     wrapper

   These functions should take already-resolved `AttributeInfo`,
   `SampleHierarchy`, and `CompositeAttributeInfoSource` inputs. They should
   reuse the existing data builders and move the spec-building code out of the
   dialog classes.

3. Add a shared render helper.

   Add a small helper such as:

   ```js
   export async function embedRenderablePlot(container, plot) {
     const api = await embed(container, plot.spec);
     for (const data of plot.namedData) {
       api.updateNamedData(data.name, data.rows);
     }
     return api;
   }
   ```

   The generic dialog and future chat rendering should both use this helper.

4. Replace per-plot dialogs with one generic plot dialog.

   Add a component such as
   [`plotDialog.js`](../../app/src/charts/plotDialog.js) with one input:

   ```js
   plot;
   ```

   The dialog should:
   - set the dialog title from `plot.title`
   - call `embedRenderablePlot(...)`
   - use `plot.filename` for PNG download
   - finalize the embedded GenomeSpy instance when the dialog closes

   Export a convenience function:

   ```js
   showPlotDialog(plot);
   ```

   Then remove or reduce these chart-specific dialog modules to compatibility
   wrappers if needed:
   - `hierarchyBarplotDialog.js`
   - `hierarchyBoxplotDialog.js`
   - `hierarchyScatterplotDialog.js`

   Prefer deleting the chart-specific dialog components if no external import
   requires them.

5. Update menu actions to build plots and open the generic dialog.

   [`plotMenuItems.js`](../../app/src/sampleView/plotMenuItems.js) should call
   the appropriate builder and then `showPlotDialog(plot)`.

   This makes current user-facing menu behavior unchanged while removing the
   duplicate dialog implementations.

6. Test the app-only refactor.

   Add or update focused tests for renderable plot builders. Existing
   data-builder tests can stay as-is. Dialog testing can remain light because
   the dialog becomes a generic renderer wrapper.

7. Commit the app-only refactor.

   Before committing, verify that the diff is limited to `packages/app`.
   Suggested commit message:

   ```text
   refactor(app): unify sample attribute plot rendering
   ```

   After this commit, the app should still expose the same user-facing menu
   behavior: bar, box, and scatter plots open in a dialog. The implementation
   should now go through shared renderable plot builders and one generic plot
   dialog.

## Commit 2: Agent Integration

Start this only after Commit 1 is complete and committed.

The second commit should live mostly in `packages/app-agent`. It may add
feature-branch-only `agentApi` wiring if that is the cleanest boundary, but the
app-only chart refactor from Commit 1 must remain independent of `agentApi`.

The agent integration must not duplicate chart logic. It should call the
renderable plot builders through a narrow runtime boundary. Prefer an
`agentApi.buildSampleAttributePlot(...)` method in the feature branch if the
current architecture already uses `agentApi` for App-hosted capabilities.

### Commit 2 Scope

Allowed:

- `packages/app-agent/src/agent/**`
- `packages/app-agent/server/app/prompts/**`
- generated app-agent tool catalog/schema files
- app-agent tests
- `packages/app/src/agentApi/**` only in this second feature-branch commit

Not allowed:

- rewriting the App chart builders from Commit 1
- duplicating App chart-building logic in app-agent
- putting plot specs or named data into model-visible tool content

### Tool Input

Add one read-only tool, tentatively named `showSampleAttributePlot`, with a
discriminated input shape:

```ts
type ShowSampleAttributePlotToolInput =
  | {
      plotType: "bar";
      attribute: AttributeIdentifier;
    }
  | {
      plotType: "boxplot";
      attribute: AttributeIdentifier;
    }
  | {
      plotType: "scatterplot";
      xAttribute: AttributeIdentifier;
      yAttribute: AttributeIdentifier;
    };
```

Validation should reject incompatible attribute types:

- `bar`: nominal or ordinal
- `boxplot`: quantitative
- `scatterplot`: two quantitative attributes

The rejection should be corrective, for example:

`Boxplot requires a quantitative attribute, but tissue is nominal. Use a bar plot instead.`

### Tool Result

The tool should return concise model-visible content only. The renderable plot
must be UI-only and must not be sent back to the LLM in tool-result history.

```js
{
    text: "Displayed boxplot of Age by current sample groups.",
    content: {
        kind: "sample_attribute_plot_summary",
        plotType: "boxplot",
        title,
        groupCount,
        rowCount,
    },
}
```

The full `SampleAttributePlot` object should be attached only to the local chat
message or another UI-side field that `agentSessionController.#buildHistory()`
does not serialize. Do not include `spec`, `namedData`, data rows, or the full
plot object in model-visible `content`.

### Chat Rendering

Add a visible chat message kind such as `"plot"`. Because current
`tool_result` messages are hidden outside dev mode, a new visible message kind
is likely cleaner.

Store the full renderable plot only in browser memory on the local chat
message:

```js
{
    id,
    kind: "plot",
    text: "Boxplot of Age",
    plot,
}
```

This `plot` field is local UI state. It must not be serialized into:

- tool-result `content`
- LLM history
- server requests
- provenance
- bookmarks, unless later explicitly supported

Add a small component, for example `gs-chat-plot`, that:

- calls the App render helper
- finalizes the embed in `disconnectedCallback`
- uses chat-friendly dimensions

Do not include renderable plots, specs, or data rows in
`agentSessionController.#buildHistory()`. If history needs to mention the plot,
serialize only a tiny textual note such as `Displayed boxplot of Age.`

If chat transcript memory becomes a problem later, replace direct `message.plot`
storage with a controller-local `Map<plotId, plot>` and store only `plotId` on
the message. That registry is not needed for v0.

### Commit 2 Fix Items

Use these short identifiers when discussing or reviewing the current
`showSampleAttributePlot` implementation.

- **PLOT-CONTENT-LEAK**: The tool result must not use the full
  `SampleAttributePlot` as model-visible `content`. Return only a compact
  summary in `content`, and pass the renderable plot through a separate UI-only
  field.
- **PLOT-UNION-SCHEMA**: `ShowSampleAttributePlotToolInput` must be a
  discriminated union. Bar and boxplot calls require `attribute`; scatterplot
  calls require `xAttribute` and `yAttribute`. The generated schema should
  enforce this instead of requiring only `plotType`.
- **PLOT-ATTRIBUTE-SCOPE**: The tool should accept the same
  `AttributeIdentifier` scope as App plot building, not only
  `SAMPLE_ATTRIBUTE`, unless a narrower scope is an explicit product decision.
  Selection-aggregation attributes should remain possible if they are
  sample-specific and quantitative/categorical as required by the plot type.
- **PLOT-UI-FIELD**: Local plot chat messages should store the renderable plot
  in a clearly UI-only field such as `message.plot`, not `message.content`.
  `content` is reserved for model-visible tool-result data.
- **PLOT-HISTORY-GUARD**: `agentSessionController.#buildHistory()` must never
  serialize renderable plots, specs, named data, or plot rows. If the history
  needs a record of the plot, serialize only a short textual note.
- **PLOT-ERROR-HINTS**: Type and resolution errors should name the problematic
  attribute when possible and give a corrective hint, for example: `Boxplot
  requires a quantitative attribute, but tissue is nominal. Use a bar plot
  instead.`
- **PLOT-TYPE-NAMING**: Avoid unnecessary plot-type translation. The public tool
  input currently uses `"bar"` while renderable plots use `"barplot"`. Keep
  this only if there is a clear reason; otherwise prefer one vocabulary across
  tool input, app request, and renderable plot summaries.

## Prompt Guidance

Add a short tool section, not broad prompt text:

```md
Use `showSampleAttributePlot` when the user asks to visualize metadata
attributes in chat. Use bar plots for categorical attributes, box plots for
quantitative attributes by current sample groups, and scatterplots for two
quantitative attributes.
```

The tool schema and validation should carry most of the detail.

## Open Questions

- Should the tool auto-select the plot type from attribute types, or require an
  explicit `plotType`? Answer: explicit
- Should scatterplot axes preserve the user's wording order, or should the
  agent choose x/y based on context?
- Should chat plots expose a "Save PNG" action immediately, matching dialogs?
  Answer: Yes. Use existing logic.
- Should there be an "Open larger" affordance that reuses the existing dialog
  through `showPlotDialog(plot)`?
- Should the feature branch expose plot building through
  `agentApi.buildSampleAttributePlot(...)`, or should another App-hosted
  runtime boundary own attribute resolution? Answer: agentApi

## Recommended v0

- First complete and commit the app-only renderable plot refactor and generic
  plot dialog.
- Then add app-agent tool and chat rendering in a separate commit.
- Require explicit `plotType` in the agent tool.
- Render one plot per tool call.
- Keep full plot data UI-only.
- Add no provenance actions.
- Keep Commit 1 free of `agentApi`.
- In Commit 2, route app-agent through a narrow App-hosted runtime boundary;
  `agentApi` is acceptable there because it is feature-branch-only.

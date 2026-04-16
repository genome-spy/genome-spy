# Agent Host API and Package Extraction

Note: This file is an early draft, not to be implemented yet.

This note sketches the boundary needed to move the current agent code out of
`packages/app` while still keeping the agent iteration-friendly during
development.

The goal is not to freeze a public plugin contract yet. The goal is to define
an unstable host API that the extracted browser agent package can consume, and
that a later MCP package can reuse for GenomeSpy-specific analysis and mutation
tools.

## Why This Boundary Exists

The current agent implementation is coupled to `App` internals:

- it reads app state, provenance, and the current sample view directly
- it mutates `viewSettings` and provenance-backed intent state
- it resolves views through `GenomeSpy`
- it mounts its panel into the app shell
- it keeps agent runtime state attached to the app shell

In the current tree, the browser agent state is already centralized in
`agentState.js` rather than exposed as top-level `App` fields. The remaining
coupling is mostly the agent package reaching into app-shell internals, not
the other way around.

That works well for fast iteration, but it makes the agent hard to extract as a
separate package. The minimum useful step is to define a narrow host interface
that replaces direct `App` access without forcing a fully public extension API.
The sample-state shapes in `sampleState.d.ts` can stay as app-level shared
contracts; the abstraction target is the heavier `SampleView` and `View`
objects, not the sample hierarchy data model itself.

## Current App Dependencies Used By The Agent

This section maps the current agent code to the `App` internals it depends on.

### `agentAdapter.js`

The adapter is the broadest consumer of `App`.

- `agentState.js`
  - Stores the agent base URL for `/v1/agent-turn` requests.
  - Stores the current agent session controller overlay.
- `app.options`
  - Used for generic app embed configuration.
- `app.store`
  - Used to dispatch `viewSettings` updates.
  - Used indirectly by provenance and intent execution helpers.
- `app.provenance`
  - Used to read the action history.
  - Used to summarize provenance actions.
- `app.genomeSpy`
  - Used to resolve view selectors.
  - Used to read the active `viewRoot`.
- `app.getSampleView()`
  - Used by `getAgentContext()` to inspect sample metadata and the current
    sample hierarchy.
- `app.intentPipeline`
  - Used by intent execution helpers.
- `app.rootSpec`
  - Used indirectly through the app state and sample view setup.

### `contextBuilder.js`

The context builder reads most of the visualization state that the agent needs.

- `app.getSampleView()`
  - Sample hierarchy, attribute info, and searchable-view metadata.
- `sampleState.d.ts`
  - The sample hierarchy data itself can remain a shared internal contract.
- `app.store.getState()`
  - Lifecycle state and current visibility state.
- `app.provenance.getPresentState()`
  - Parameter provenance and the current sample-view branch state.
- `app.provenance.getActionHistory()`
  - Provenance summary shown to the model.
- `app.genomeSpy.getSearchableViews()`
  - Searchable views in the current visualization.
- `app.genomeSpy.viewRoot`
  - Root for view-tree normalization.

### `selectionAggregationContext.js`

This helper needs both the sample view and current selection state.

- `app.getSampleView()`
- `app.provenance.getPresentState()`
- `app.provenance.getActionHistory()`
- `app.genomeSpy.viewRoot`

### `intentProgramExecutor.js` and `intentProgramValidator.js`

These pieces need the app state and mutation pipeline.

- `app.intentPipeline.submit(...)`
- `app.store.dispatch(...)`
- `app.provenance`
- `app.getSampleView()`

### `chatPanel.js`

The panel is browser-only UI.

- Imports `faStyles` and `formStyles` from
  `components/generic/componentStyles.js`, which are also used by app web
  components.
- Uses app CSS variables such as `--gs-basic-spacing`,
  `--gs-theme-primary`, and `--gs-dialog-stroke-color`.
- `agentState.js`
  - Determines whether the panel can open.
  - Stores the active session controller.
- `app.appContainer`
  - Provides the host element for the docked panel.
- `appRoot` DOM structure
  - Used to mount and toggle the panel.

### `toolbarMenu.js`

The toolbar entry is also browser-only.

- `agentState.js`
  - Determines whether the agent menu item should exist.

### `App` itself

Current `App` fields that the agent relies on are:

- `store`
- `provenance`
- `genomeSpy`
- `intentPipeline`
- `rootSpec`
- `appContainer`
- `options`
- `ui`

## What The Agent Actually Needs

The agent does not need the full `App` object. It needs a much smaller set of
capabilities:

- read the current visualization context
- resolve selectors against the current view tree
- inspect provenance and the active sample state
- mutate view visibility
- submit provenance-backed intent batches
- maintain agent-local expanded context state
- mount the browser chat panel when running in the app shell

That suggests two interfaces instead of one:

1. a host API for analysis and mutation
2. a small UI registration API for app-owned controls

## Draft Interface 1: Analysis Host

This is the core host contract that both the browser agent package and a later
MCP package could consume.

```ts
export interface AgentAnalysisHost {
  readonly baseUrl: string | undefined;

  getAppState(): AgentAppStateSnapshot;
  getSampleContext(): SampleContextSnapshot;
  getViewContext(): ViewContextSnapshot;
  getProvenanceContext(): ProvenanceContextSnapshot;
  resolveViewSelector(selector: ViewSelector): ResolvedViewHandle | undefined;
  searchViewDatums(
    selector: ViewSelector,
    query: string,
    field: string,
    mode: "exact" | "prefix"
  ): SearchViewDatumsResult;

  validateIntentBatch(batch: AgentIntentBatch): ShapeValidationResult;
  submitIntentActions(
    batch: AgentIntentBatch,
    options?: { submissionKind?: "agent" | "bookmark" | "user" }
  ): Promise<IntentBatchExecutionResult>;

  setViewVisibility(selector: ViewSelector, visibility: boolean): void;
  jumpToProvenanceState(provenanceId: string): boolean;
  jumpToInitialProvenanceState(): boolean;

  summarizeProvenanceActionsSince(startIndex: number): IntentBatchSummaryLine[];
  summarizeExecutionResult(result: IntentBatchExecutionResult): string;
}
```

Notes:

- `getAppState()` is intentionally vague. It should return only the current
  state needed by the agent context builder, not the whole Redux tree.
- `getSampleContext()`, `getViewContext()`, and `getProvenanceContext()` should
  return agent-oriented snapshots, not `SampleView` or other app internals.
- `resolveViewSelector()` should return a lightweight resolved-view handle,
  not the raw `View` object.
- `baseUrl` is the transport target for the browser agent. An MCP package may
  ignore it.
- `validateIntentBatch()` belongs here because both browser agent and MCP
  clients need the same guardrails before mutation.

## Draft Interface 2: UI Registration Host

This is the browser-only extension surface for app-owned controls. The agent
package should not mount arbitrary DOM into the app shell if a declarative
registration API is enough.

```ts
export interface AgentUiHost {
  addToolbarButton(spec: AgentToolbarButtonSpec): () => void;
  addToolbarMenuItem(spec: AgentToolbarMenuItemSpec): () => void;
}
```

Notes:

- `addToolbarButton()` is the preferred seam for the current agent UI.
- The app should own the actual button rendering and placement.
- The registration method should return a disposer so the agent package can
  unregister itself cleanly.
- Keep the UI API declarative and small; do not expose raw shell DOM unless the
  agent later needs a richer layout host.
- The extracted agent package will still need a style strategy for the panel:
  either share token/style modules with `packages/app` or duplicate the small
  amount of CSS it relies on today.

## Draft Snapshot Types

These are intentionally smaller than the current app objects.
The underlying sample hierarchy should stay on the existing
`sampleState.d.ts` types where that is convenient; the goal is to avoid leaking
the full `SampleView`, not to re-model the sample data from scratch.

```ts
export interface SampleContextSnapshot {
  sampleHierarchy: SampleHierarchy;
  selectionAggregation: AgentSelectionAggregationSummary;
  searchableViews: SearchableViewSummary[];
}

export interface ViewContextSnapshot {
  root: ViewSummary;
}

export interface ProvenanceContextSnapshot {
  actions: IntentBatchSummaryLine[];
  currentBranchId?: string;
  lastActionIndex: number;
}

export interface ResolvedViewHandle {
  selector: ViewSelector;
  title: string;
  description?: string;
  searchable: boolean;
}

export interface SearchViewDatumsResult {
  count: number;
  matches: unknown[];
}
```

Notes:

- Keep the snapshots narrow and serializable where possible.
- Add fields only when the agent needs them for reasoning or tool execution.
- Prefer summaries over direct object references.
- Reuse the existing sample-state model for sample hierarchy, metadata, and
  groups; do not introduce a second parallel sample data structure.

## Draft Interface 3: Minimal MCP Tool Host

If the MCP server is built later, it should likely consume a smaller tool-facing
subset of the analysis host rather than the browser shell API.

```ts
export interface AgentToolHost {
  getSampleContext(): SampleContextSnapshot;
  getViewContext(): ViewContextSnapshot;
  getProvenanceContext(): ProvenanceContextSnapshot;
  resolveViewSelector(selector: ViewSelector): ResolvedViewHandle | undefined;
  searchViewDatums(
    selector: ViewSelector,
    query: string,
    field: string,
    mode: "exact" | "prefix"
  ): SearchViewDatumsResult;

  validateIntentBatch(batch: AgentIntentBatch): ShapeValidationResult;
  submitIntentActions(
    batch: AgentIntentBatch,
    options?: { submissionKind?: "agent" | "bookmark" | "user" }
  ): Promise<IntentBatchExecutionResult>;

  setViewVisibility(selector: ViewSelector, visibility: boolean): void;
  jumpToProvenanceState(provenanceId: string): boolean;
  jumpToInitialProvenanceState(): boolean;
}
```

This is intentionally narrower than the browser agent host. It excludes panel
mounting, session state, and chat orchestration.

## Proposed Package Split

### `@genome-spy/app`

Owns the app shell and implements the host API.

- app bootstrap
- Redux/provenance state
- view resolution
- intent execution
- visibility mutation
- DOM shell mounting points

### `@genome-spy/app-agent`

Owns the current agent code after extraction.

- `agentState`
- `AgentSessionController`
- `contextBuilder`
- `agentAdapter`
- `chatPanel`
- `toolbarMenu`
- toolbar button registration and panel entry wiring
- tool catalog and schema handling
- agent-local prompt/session logic
- local or shared styling for the panel surface

### `@genome-spy/app-agent-mcp`

Future package.

- MCP transport
- tool registration
- request/response translation
- reuse of the shared analysis host contract

## Extraction Sequence

1. Define the unstable host interface in the app package.
   - Keep it small.
   - Prefer method-based access over exposing raw app internals.
   - Start with the capabilities already used by `agentAdapter.js` and
     `contextBuilder.js`.

2. Move `AgentSessionController` out of `App`.
   - The controller should be created by the browser agent package.
   - `App` should stop storing it on the instance.

3. Replace direct `App` reads in the agent code with host calls.
   - First target `agentAdapter.js`.
   - Then update `contextBuilder.js` and the selection/provenance helpers.

4. Move browser-only UI code into the extracted package.
   - `chatPanel.js`
   - `toolbarMenu.js`
   - any small UI helpers that only exist for the agent shell

5. Keep the generated schemas and tool catalogs local to the agent package.
   - The host should expose data and operations.
   - The agent package should continue to own LLM-facing schemas.

6. Add an MCP adapter later.
   - Reuse the same analysis host contract.
   - Do not reuse chat/session APIs in MCP.

## Open Questions

- Should the host surface return snapshots or provide direct methods for each
  field?
- Which pieces of provenance state should be exposed as read-only snapshots
  versus derived summaries?
- Should visibility mutations stay on the host, or be represented as a smaller
  mutation service?
- How much of the current `App` class should be represented in the host API
  versus hidden behind dedicated methods?
- Should the browser agent package own the context builder entirely, or should
  `App` expose a prebuilt agent snapshot?

## Working Assumption

The near-term goal is not a polished plugin ecosystem. It is a clean internal
boundary that:

- preserves fast iteration
- removes direct `App` coupling from the agent package
- keeps room open for a future MCP server
- avoids over-designing a public extension API too early

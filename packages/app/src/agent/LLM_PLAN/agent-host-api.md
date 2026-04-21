# Agent Host API and Package Extraction

Note: This file is an early draft, not to be implemented yet.

This note sketches the boundary needed to move the current agent code out of
`packages/app/src/agent` while still keeping a thin app-owned `agentApi`
barrel in `packages/app/src/agentApi` during development.

The goal is not to freeze a public plugin contract yet. The goal is to define
an unstable app-owned export surface that the extracted browser agent package
can consume, and that a later MCP package can reuse for GenomeSpy-specific
analysis and mutation tools. The app package should keep the boundary only;
agent-specific catalogs, schemas, and prompt-facing metadata can be generated
on the agent package side and loaded lazily when the agent feature is enabled.

In this note, `agentApi` means the app-owned boundary that stays in
`packages/app/src/agentApi`.

In this note, `agent` means the extracted implementation that will move out of
`packages/app/src/agent` into a dedicated package in the monorepo first, and
possibly into a separate repository later.

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

The app-owned surface should stay focused on host capabilities. The agent-owned
surface should own derived catalogs, schemas, and UI orchestration that can be
pulled in only when the agent plugin is actually used.

The app should know as little as possible about the future agent package. It
should provide only the essential hooks the agent needs and stay out of the
agent package's internal structure.

All future agent-to-App communication for analysis, state access, and
mutation should go through `AgentApi`. Toolbar and other shell UI registration
stay on the existing `app.ui` API and should not be added to `AgentApi`. If a
needed host hook is missing, add it only after careful planning and explicit
discussion. Extend the API conservatively so the agent does not gradually
bloat the app.

The first extraction pass should stay handle-oriented. Use the existing app
interfaces and method calls as the boundary, and only introduce snapshot-like
abstractions when they clearly reduce coupling or repetition.

The split is intentional:

- `agentApi` is the app-owned export surface.
- `agentApi` is also the place where the required host typings are exported.
- `agent` is the runtime and generated metadata consumer that depends on that
  surface.
- `agent` should not reach back into app internals once extraction starts.
- all future agent-to-App communication should go through `AgentApi`.
- `agentApi` should start with the minimum set of handles needed by the
  extracted package.
- `agentApi` should not expose agent-package internals, packaging concerns, or
  future abstractions before they are needed.
- toolbar and shell UI registration stay on the existing `app.ui` API, not in
  `AgentApi`.
- `getSampleView()` should not be part of the boundary; its current uses should
  be decomposed into smaller hooks.
- `createAgentAdapter`, `getAgentState`, and `registerAgentUi` belong with the
  extracted `agent` package, not with `agentApi`.
- if an essential hook is missing, add it to `AgentApi` only after planning
  and discussion, then keep the addition narrow.

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

The agent does not need a new host object at the start. It needs one app-owned
import boundary that creates a bound handle object and exposes the concrete
helpers and type contracts already used by the current implementation.

The initial `agentApi` should be a thin factory, not a facade class:

- create the handle object once from the app shell
- expose the concrete app-side hooks the extracted package needs as bound
  methods
  - `getSampleHierarchy()` for sample metadata and hierarchy data
  - `getSampleAttributeInfo(attribute)` for attribute title, description, and
    type
  - `getSampleParamConfig(paramName)` if selection descriptions still need it
  - `getSearchableViews()`
  - `getViewRoot()`
  - `resolveViewSelector(selector)`
  - `getActionHistory()`
  - `getPresentProvenanceState()`
  - `submitIntentActions(batch, options)`
  - `setViewVisibility(selector, visibility)`
  - `jumpToProvenanceState(provenanceId)`
  - `jumpToInitialProvenanceState()`
  - `getAppContainer()`
- re-export the small shared types those hooks need
- keep the implementations in `src/agent` for now
- do not introduce `AgentAnalysisHost`, `AgentToolHost`, or snapshot types at
  the start
- extend `AgentApi` conservatively; do not add hooks just because a new use case
  is convenient if the current surface already covers the need

This keeps the first boundary concrete and incremental. The extracted package
can receive one bound object and never see `App` at each call site. If repeated
call patterns emerge later, factor those into smaller helpers or interfaces at
that point.

## Possible Future Abstractions

If the handle-oriented surface starts to sprawl, compact snapshots or a host
interface can be introduced later. Keep that as a follow-up after the package
split, not as the starting point.

## Proposed Package Split

### `@genome-spy/app`

Owns the app shell and exports the app-owned boundary.

- `src/agentApi`
  - app-owned factory for the essential hooks and types the agent needs
  - likely exports:
    - `createAgentApi(app)` returning bound methods for the existing
      `SampleHierarchy`
    - `getSampleAttributeInfo(attribute)` for attribute title/description/type
    - `getSampleParamConfig(paramName)` if the selection context still needs it
    - `getSearchableViews()`
    - `getViewRoot()`
    - `resolveViewSelector(selector)`
    - `getActionHistory()`
    - `getPresentProvenanceState()`
    - `submitIntentActions(batch, options)`
    - `setViewVisibility(selector, visibility)`
    - `jumpToProvenanceState(provenanceId)`
    - `jumpToInitialProvenanceState()`
    - `getAppContainer()`
  - and the small shared types those hooks need
  - stable definitions that the extracted agent package can consume
  - no knowledge of the extracted agent package beyond those hooks
- app bootstrap
- Redux/provenance state
- view resolution
- intent execution
- visibility mutation
- DOM shell mounting points

### `@genome-spy/app-agent`

Owns the extracted agent implementation as a first-class package in the
monorepo. This is the first extraction target before any separate repo split.

- agent bootstrap and runtime composition
- `agentState`
- `AgentSessionController`
- `contextBuilder`
- `agentAdapter`
- `chatPanel`
- `toolbarMenu`
- toolbar button registration and panel entry wiring
- tool catalog and schema handling
- action and tool catalog generation from the app-owned `agentApi` exports
- agent-local prompt/session logic
- local or shared styling for the panel surface

If the agent later becomes a separate repository, this package boundary should
already be narrow enough that the repo move is mostly a packaging change rather
than an architecture change.

### `@genome-spy/app-agent-mcp`

Future package.

- MCP transport
- tool registration
- request/response translation
- reuse of the shared `agentApi` barrel

## Extraction Sequence

1. Define the initial `agentApi` barrel in the app package.
   - Create `src/agentApi` as a thin factory that returns a bound handle
     object.
   - Re-export only the concrete app-side hooks and small shared types listed
     above as zero-arg or narrow-arg methods on that object.
   - Keep the initial export surface minimal; do not publish extra agent-facing
     abstractions yet.
   - Do not export `createAgentAdapter`, `getAgentState`, or `registerAgentUi`
     from `agentApi`; those are agent runtime helpers and should stay with the
     extracted package.
   - Keep the underlying implementation in `src/agent` for now.
   - Do not wrap these exports in a new host object or snapshot model yet.

2. Replace the current direct `App` and `SampleView` reads with `agentApi`
   hooks, one capability area at a time.
   - Start with the places that still call `app.getSampleView()` directly:
     `contextBuilder.js`, `selectionAggregationContext.js`,
     `intentProgramExecutor.js`, and `viewTree.js`.
   - Then move the remaining direct `App` reads in the agent runtime wiring
     onto the same boundary.
   - Use the smallest concrete bound method that covers each call site instead
     of introducing a wider host interface.
   - Keep the current app-side modules available for now.
   - If a required hook is missing, stop and plan the addition explicitly
     before expanding `AgentApi`.
   - This makes the eventual extraction a packaging change first, not a logic
     rewrite.

3. Move `AgentSessionController` out of `App`.
   - The controller should be created by the browser agent package.
   - `App` should stop storing it on the instance.
   - This is the first step in turning `agent` into a package boundary rather
     than an app-internal folder.

4. Extract `agent` into `@genome-spy/app-agent`.
   - The package should depend on `agentApi`, not on app source files.
   - Keep the first version narrow and concrete.

5. Clean up any residual direct `App` reads uncovered by extraction.
   - First target the runtime wiring in `agentAdapter.js` if anything still
     reaches into app internals.
   - Keep method calls and existing handles if they are enough.
   - Introduce a smaller abstraction only when a repeated call pattern becomes
     awkward.

6. Add an MCP adapter later.
   - Reuse the same `agentApi` barrel and concrete handles.
   - Do not reuse chat/session APIs in MCP.

## Open Questions

- Which concrete helpers should `agentApi` re-export first?
- Which current imports are best moved over unchanged instead of wrapped?
- Which repeated call patterns, if any, justify a new abstraction later?
- Should visibility mutations stay as direct methods, or become a smaller
  service after extraction?

## Working Assumption

The near-term goal is not a polished plugin ecosystem. It is a clean internal
boundary that:

- preserves fast iteration
- removes direct `App` coupling from the agent package
- keeps room open for a future MCP server
- makes `agent` an extracted package in the monorepo first, with the option to
  split it into a separate repository later
- avoids over-designing a public extension API too early

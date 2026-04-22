# LLM Project Summary

## Code Anchors
- Context assembly: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- View normalization: [`viewTree.js`](../src/agent/viewTree.js)
- Selection aggregation context: [`selectionAggregationContext.js`](../src/agent/selectionAggregationContext.js)
- Action catalog and execution: [`actionCatalog.js`](../src/agent/actionCatalog.js), [`actionShapeValidator.js`](../src/agent/actionShapeValidator.js), [`intentProgramValidator.js`](../src/agent/intentProgramValidator.js), [`intentProgramExecutor.js`](../src/agent/intentProgramExecutor.js)
- Chat and entry points: [`chatPanel.js`](../src/agent/chatPanel.js), [`agentAdapter.js`](../src/agent/agentAdapter.js), [`toolbarMenu.js`](../src/agent/toolbarMenu.js)
- Session controller: owns transcript state, preflight, queueing, and the panel snapshot
- Python relay server design: [`python_agent_server.md`](./python_agent_server.md)
- Tool-call validation and rejection guide: [`validation.md`](./validation.md)
- Agent host API and package extraction: [`agent-host-api.md`](./agent-host-api.md)
- App agent package and plugin plan: [`app-agent-package-plugin-plan.md`](./app-agent-package-plugin-plan.md)
- Agent tool surface cleanup and contract consolidation: [`agent-tool-surface-cleanup.md`](./agent-tool-surface-cleanup.md)
- Agent benchmarking plan: [`../benchmarks/plan/benchmarking.md`](../benchmarks/plan/benchmarking.md)

## Goals
- Enable conversations with the agent over the current visualization.
- Help users understand the visualization itself: semantics, available attributes, encodings, scales, and related metadata.
- Dispatch intent actions that change the visualization state: sample collection manipulation, selections, parameter updates, and metadata derivation from aggregated selection regions.
- Run efficiently with a local LLM.

## Product Phases
### MVP
- Conversation over the current visualization.
- Questions about the visualization's structure and semantics.
- Intent programs that manipulate visualization state.
- Local-LLM-friendly prompts, tools, and context snapshots.

### Later
- Direct agent access to the data.
- Public and controlled-access data modes; see [`infrastructure.md`](./infrastructure.md) for the policy details.
- Local and cloud LLM support for public data.
- Summarized data as an optional optimization even for public data.

## Current Implementation (Relevant Pieces)
- Intent actions are plain Redux actions (serializable), primarily in SampleView.
- Intent execution flows through `IntentExecutor` (augmentation) and `IntentPipeline` (async sequencing).
- Provenance (undo/redo/history) records bookmarkable actions with inline human-readable summaries.
- Action schema and compact summaries are generated from reducer JSDoc and payload typings and emitted as JSON artifacts.
- `actionInfo` (sample actions) and `paramActionInfo` (param/selection actions) remain the runtime human-readable formatters used by the UI.
- Parameter declarations are part of the view spec and stay static; `paramProvenance`
  carries the current runtime values for those declarations.
- Interval selections should be described to the model as brushing/dragging a
  range; point-selection refinements are out of MVP scope.
- Semantic `description` fields should be carried through to views, encodings,
  params, data sources, and other objects the agent needs to reason about.
- For the MVP, the agent should answer visualization questions and dispatch
  intent batches; direct data access comes later.
- Agent support is loaded on demand from the dev-only entrypoint:
  - `singlePageApp.js` installs `appAgent({ baseUrl })` only when
    `VITE_AGENT_BASE_URL` is present.
  - `appAgent({ baseUrl })` requires a base URL.
  - Agent modules are loaded with dynamic `import()` so they stay out of the
    generic app path.

## Composition Strategy
- Treat multi-step requests as an "intent batch": ordered actions + validation + execution.
- Execute sequences via `IntentPipeline.submit(actions)` to guarantee ordering, readiness, and rollback.
- Consider macros that expand into multiple intents to reduce prompt errors.

## Next Implementation Candidates
- Build a read-only LLM context snapshot (views, attributes, scales, actions, provenance).
- Add intent batch validation + execution helper.
- Introduce an agent session controller that owns transcript history,
  preflight / turn state, and the read-only snapshot used by the panel.
- Wire field/attribute descriptions into `AttributeInfo` and LLM context.
- Keep agent code isolated behind the env gate and dynamic imports as the default deployment path.
- Draft an unstable agent host API that the extracted browser agent package can consume.
- Clean up the agent tool surface by consolidating its source of truth,
  reducing duplicated contract docs, tool-list assertions, redundant schema
  tests, and trivial wrapper coverage, and minimizing the number of files
  touched when tools are added or removed.
- Add a later-phase data access layer with explicit public vs controlled-access policies.
- Keep the GenomeSpy agent adapter and the Python relay server aligned when the request/response contract changes.

## Data + Visualization Context
- See [`data-schema.md`](./data-schema.md) for the proposed LLM-facing context schema.
- See [`view-tree.md`](./view-tree.md) for the proposed normalized view-tree IR.
- See [`explanatory-affordance-context.md`](./explanatory-affordance-context.md)
  for the draft explanatory context layer that helps the agent describe what the
  user is currently seeing and what actions are likely to make sense next.
- See [`searchable-data-lookup.md`](./searchable-data-lookup.md) for the proposed searchable-view context and view-scoped datum lookup flow.
- See [`chat-ui.md`](./chat-ui.md) for the proposed chat surface and component shape.

## Action + State Context
- See [`action-schema.md`](./action-schema.md) for the proposed action/provenance schema.
- See [`action-context-reduction-plan.md`](./action-context-reduction-plan.md)
  for the staged plan to replace always-on action payload docs with summaries
  and on-demand action detail lookup.
- See [`selectionAggregationContext.js`](../src/agent/selectionAggregationContext.js)
  for the interval-selection summaries used by the agent.
- See [`selection-aggregation-workflow.md`](./selection-aggregation-workflow.md)
  for the draft selection-aggregation flow.

## Data Access Policy
- See [`infrastructure.md`](./infrastructure.md) for the public-data vs controlled-access policy and the LLM transport safeguards.

## Annotation Style
- See [`annotation-style.md`](./annotation-style.md) for the JSDoc and extraction
  conventions used to generate action docs and schemas from code.

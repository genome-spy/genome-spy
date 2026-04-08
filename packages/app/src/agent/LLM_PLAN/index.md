# LLM Project Summary (Draft)

## Code Anchors
- Context assembly: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- View normalization: [`viewTree.js`](../src/agent/viewTree.js)
- Workflow context and resolution: [`viewWorkflowContext.js`](../src/agent/viewWorkflowContext.js), [`viewWorkflowResolver.js`](../src/agent/viewWorkflowResolver.js), [`viewWorkflowCatalog.js`](../src/agent/viewWorkflowCatalog.js)
- Action catalog and execution: [`actionCatalog.js`](../src/agent/actionCatalog.js), [`actionShapeValidator.js`](../src/agent/actionShapeValidator.js), [`intentProgramValidator.js`](../src/agent/intentProgramValidator.js), [`intentProgramExecutor.js`](../src/agent/intentProgramExecutor.js)
- Chat and entry points: [`chatPanel.js`](../src/agent/chatPanel.js), [`agentAdapter.js`](../src/agent/agentAdapter.js), [`toolbarMenu.js`](../src/agent/toolbarMenu.js)
- Session controller and transcript state: [`session-controller.md`](./session-controller.md)
- Python relay server plan: [`python_agent_server.md`](./python_agent_server.md)
- Conversation server POC: [`conversation-server-PoC.md`](./conversation-server-PoC.md)

## Goals
- Enable conversations with the agent over the current visualization.
- Help users understand the visualization itself: semantics, available attributes, encodings, scales, and related metadata.
- Dispatch intent actions that change the visualization state: sample collection manipulation, view visibility, selections, parameter updates, and metadata derivation from aggregated selection regions.
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
  intent programs; direct data access comes later.
- Agent support is Vite-gated and loaded on demand:
  - `VITE_AGENT_ENABLED=true` enables the feature at build time.
  - `agentBaseUrl` is required at runtime.
  - Agent modules are loaded with dynamic `import()` so they stay out of the generic app path.

## Composition Strategy
- Treat multi-step requests as an "intent program": ordered actions + validation + execution.
- Execute sequences via `IntentPipeline.submit(actions)` to guarantee ordering, readiness, and rollback.
- Consider macros that expand into multiple intents to reduce prompt errors.

## Next Implementation Candidates
- Build a read-only LLM context snapshot (views, attributes, scales, actions, provenance).
- Add intent program validation + execution helper.
- Introduce an agent session controller that owns transcript history and
  preflight / turn state.
- Wire field/attribute descriptions into `AttributeInfo` and LLM context.
- Keep agent code isolated behind the env gate and dynamic imports as the default deployment path.
- Add a later-phase data access layer with explicit public vs controlled-access policies.
- Keep the GenomeSpy agent adapter and the Python relay server aligned when the request/response contract changes.

## Data + Visualization Context
- See [`data-schema.md`](./data-schema.md) for the proposed LLM-facing context schema.
- See [`view-tree.md`](./view-tree.md) for the proposed normalized view-tree IR.
- See [`chat-ui.md`](./chat-ui.md) for the proposed chat surface and component shape.

## Action + State Context
- See [`action-schema.md`](./action-schema.md) for the proposed action/provenance schema.

## Data Access Policy
- See [`infrastructure.md`](./infrastructure.md) for the public-data vs controlled-access policy and the LLM transport safeguards.

## Annotation Style
- See [`annotation-style.md`](./annotation-style.md) for the JSDoc and extraction
  conventions used to generate action docs and schemas from code.

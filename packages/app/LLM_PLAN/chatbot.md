# LLM Project Summary (Draft)

## Goals
- Help users learn what actions are available and how to compose them.
- Enable natural-language commands (e.g., "Show me all patients with CCNE1 amplification").
- Support multi-step analysis requests (e.g., "boxplot + significance"), with plotting now and statistical testing later.

## Current Implementation (Relevant Pieces)
- Intent actions are plain Redux actions (serializable), primarily in SampleView.
- Intent execution flows through `IntentExecutor` (augmentation) and `IntentPipeline` (async sequencing).
- Provenance (undo/redo/history) records bookmarkable actions with inline human-readable summaries.
- Action schema and compact summaries are generated from reducer JSDoc and payload typings and emitted as JSON artifacts.
- `actionInfo` (sample actions) and `paramActionInfo` (param/selection actions) remain the runtime human-readable formatters used by the UI.
- Selection declarations are part of the view spec and stay static; `paramProvenance`
  carries the current runtime values for those declarations.
- Interval selections should be described to the model as brushing/dragging a
  range; point-selection refinements are out of MVP scope.
- Semantic `description` fields should be carried through to views, encodings,
  params, data sources, and other objects the agent needs to reason about.
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
- Wire field/attribute descriptions into `AttributeInfo` and LLM context.
- Keep agent code isolated behind the env gate and dynamic imports as the default deployment path.

## Data + Visualization Context
- See `packages/app/LLM_PLAN/data-schema.md` for the proposed LLM-facing context schema.
- See `packages/app/LLM_PLAN/view-tree.md` for the proposed normalized view-tree IR.

## Action + State Context
- See `packages/app/LLM_PLAN/action-schema.md` for the proposed action/provenance schema.

## Annotation Style
- See `packages/app/LLM_PLAN/annotation-style.md` for the JSDoc and extraction
  conventions used to generate action docs and schemas from code.

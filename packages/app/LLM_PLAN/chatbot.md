# LLM Project Summary (Draft)

## Goals
- Help users learn what actions are available and how to compose them.
- Enable natural-language commands (e.g., "Show me all patients with CCNE1 amplification").
- Support multi-step analysis requests (e.g., "boxplot + significance"), with plotting now and statistical testing later.

## Current Implementation (Relevant Pieces)
- Intent actions are plain Redux actions (serializable), primarily in SampleView.
- Intent execution flows through `IntentExecutor` (augmentation) and `IntentPipeline` (async sequencing).
- Provenance (undo/redo/history) records intent actions; augmented payloads are stripped.
- Action descriptions come from `actionInfo` (sample actions) and `paramActionInfo` (param/selection actions).

## Composition Strategy
- Treat multi-step requests as an "intent program": ordered actions + validation + execution.
- Execute sequences via `IntentPipeline.submit(actions)` to guarantee ordering, readiness, and rollback.
- Consider macros that expand into multiple intents to reduce prompt errors.

## Next Implementation Candidates
- Build a read-only LLM context snapshot (views, attributes, scales, actions, provenance).
- Add intent program validation + execution helper.
- Wire field/attribute descriptions into `AttributeInfo` and LLM context.

## Data + Visualization Context
- See `packages/app/LLM_PLAN/data-schema.md` for the proposed LLM-facing context schema.

## Action + State Context
- See `packages/app/LLM_PLAN/action-schema.md` for the proposed action/provenance schema.

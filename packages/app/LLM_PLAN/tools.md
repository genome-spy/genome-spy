# LLM Tools (Draft)

This document outlines what tools should be exposed to an LLM agent, with emphasis on safe composition, validation, and minimal state mutation.

## Principles
- Prefer read-only tools for context gathering.
- Validate intents before execution.
- Keep tools small and composable.
- Expose stable identifiers (view ids, attribute identifiers) rather than labels.
- Fail fast with clear errors when inputs are invalid.

## Read-Only Tools
These gather context without mutating state.

- `getViewHierarchySummary()`
  - Returns a compact, nested summary of the view tree (ids, types, encodings, data source ids).

- `getDataDictionary()`
  - Returns metadata attributes with types, titles, and descriptions.

- `getAttributeRegistry()`
  - Returns both metadata and view-backed attributes with stable identifiers.

- `getScaleSummaries()`
  - Returns scale type + data-domain; includes color schemes when meaningful.

- `getParamState()`
  - Returns current selection/param values from `paramProvenance`.

- `getProvenanceSummary()`
  - Returns recent actions as natural language strings.

## Action Tools
These mutate state and should run through `IntentPipeline`.

- `validateIntentProgram(program)`
  - Checks action types, payload schema, and attribute existence.

- `submitIntentProgram(program)`
  - Executes a batch via `IntentPipeline.submit(actions)`.
  - Returns status, any error, and a short provenance summary of what changed.

## Optional / Future Tools
- `resolveAttributeByName(query)`
  - Suggests matching attributes for ambiguous user requests.

- `explainAction(action)`
  - Renders action info to human-readable text (for confirmation).

- `previewIntentProgram(program)`
  - Returns a dry-run summary with warnings but no execution.

## Safety and UX
- Require confirmation for irreversible or large-scope operations.
- Use provenance summaries for post-action explanations.
- Surface missing context as clarification questions.

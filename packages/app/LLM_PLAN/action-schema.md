# LLM Action + State Context (Draft)

This document defines the LLM-facing structure for actions, interaction state, and provenance. It complements `data-schema.md`, which focuses on view hierarchy and data encodings.

## Action Catalog
From intent actions and action info sources:
- Action type
- Required payload fields
- Attribute requirements
- Human-readable description

Rationale: enables programmatic validation of LLM-proposed steps.

## Param/Selection State
From `paramProvenance`:
- Selector key + view scope
- Param type (value/point/interval)
- Current value(s)

Rationale: necessary for commands like "filter to the current brush".

## Provenance Summary
Use action info to provide:
- Recent actions in natural language
- Optional grouping into multi-step "programs"

Rationale: keeps the LLM aware of current state and avoids redundant steps.

## Composition Notes
- Multi-step requests should be represented as an ordered "intent program".
- Validate each step against the action catalog before execution.
- Execute sequences via `IntentPipeline.submit(actions)` to ensure ordering and rollback.

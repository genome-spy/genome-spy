# LLM View Tree Context (Draft)

This document describes the agent-facing visualization tree IR. The goal is to
keep the GenomeSpy core/app model unchanged while exposing a simplified,
spec-like tree that the agent can read, reason about, and eventually use to
propose new views.

## Why this exists
- The core view hierarchy is richer than the agent needs.
- The agent should see effective structure, not raw inheritance noise.
- The adapter should normalize encodings, selections, and descriptions into a
  compact tree.

## What the IR should resemble
The IR should stay close to the spec model:
- root config summary
- nested view tree
- titles and descriptions
- encodings
- data source / role
- selection declarations
- children

But it should omit or flatten details the agent does not need:
- axes
- legends
- layout/render internals
- template/import mechanics as primary structure
- inherited encoding clutter

The IR should carry `description` wherever the agent needs semantic intent:
- view nodes
- encodings / channels
- params
- data sources
- selection declarations
- scales when the scale choice is semantically important
- field and attribute definitions

`title` should stay the short label, while `description` should explain what the
object means or why it exists.

Transforms should be omitted from the default IR because they add noise.
If the agent later needs to know where the data came from, the adapter can
provide a detailed pipeline on demand.

## Source Material
The following files show the structures the adapter must understand:
- `packages/core/src/spec/root.d.ts` — root-level spec and root config
- `packages/core/src/spec/view.d.ts` — view structure, titles, descriptions, params, data, transforms, encodings
- `examples/docs/` — grammar and composition examples
- `examples/app/` — app-wrapped sample collection specs

## Current Code Paths to Reuse
The adapter should build the IR from the existing runtime structures rather than
inventing a new view model.

For now, the traversal should follow the addressable view tree, because those
are the views the agent can act on through selectors and provenance-bearing
actions. That is the right default for actionability, but it may need to be
relaxed later if the agent also needs to reason about non-addressable
annotation-only branches.

### Root assembly
- `packages/app/src/agent/contextBuilder.js`
  - current top-level agent context assembly
  - likely place where `viewTree` is attached

### Tree and selection traversal
- `packages/app/src/agent/viewWorkflowContext.js`
  - already traverses the runtime tree with `sampleView.visit(...)`
  - already extracts selection declarations, active selections, and selection-driven fields

### Runtime tree access
- `packages/app/src/sampleView/sampleView.js`
  - owns runtime traversal and layout ancestry helpers
  - exposes the current view hierarchy used by the app

### Field/attribute resolution
- `packages/app/src/sampleView/contextMenuBuilder.js`
  - resolves effective fields for a view
  - useful for normalizing encodings and field summaries

### Author semantics
- `ViewSpecBase.title`
- `ViewSpecBase.description`
  - these are the semantic hints the agent should see at node level

## Proposed IR Shape
The agent IR should be a normalized tree with explicit node summaries.

```json
{
  "schemaVersion": 1,
  "root": {
    "id": "root",
    "kind": "root",
    "type": "root",
    "title": "Samples",
    "description": "High-level purpose of the visualization.",
    "config": {
      "assembly": "hg38",
      "theme": "light"
    },
    "children": [
      {
        "id": "track-1",
        "kind": "unit",
        "type": "unit",
        "title": "Copy-number variation",
        "description": "Shows copy-number segments across the cohort.",
        "data": { "source": "samples" },
        "encodings": [
          { "channel": "x", "field": "start", "type": "index" },
          { "channel": "x2", "field": "end", "type": "index" },
          { "channel": "fill", "field": "logR", "type": "quantitative" }
        ],
        "selections": [
          {
            "param": "brush",
            "selectionType": "interval",
            "interactionKind": "brush"
          }
        ],
        "children": []
      }
    ]
  }
}
```

## Normalization Rules
- Resolve inherited encodings onto the node that effectively uses them.
- Keep container nodes structural.
- Keep selection declarations attached to the node that declares them.
- Carry author `description` through unchanged.
- Summarize root config only when it matters for understanding the visualization.

## Recommended Node Fields
- `id`
- `kind`
- `type`
- `title`
- `description`
- `data`
- `encodings`
- `selections`
- `attributes`
- `children`

## Example Coverage
Use the examples under `examples/docs/` and `examples/app/` as the validation
corpus for the adapter:
- unit specs
- layered specs
- concatenated specs
- selection-heavy specs
- app-wrapped sample collection specs

## Future Use
The IR should be suitable both for:
- understanding the current visualization
- proposing a new view later using the same simplified shape

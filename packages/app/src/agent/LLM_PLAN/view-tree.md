# LLM View Tree Context (Draft)

This document describes the agent-facing visualization tree IR. The goal is to
keep the GenomeSpy core/app model unchanged while exposing a simplified,
spec-like tree that the agent can read, reason about, and eventually use to
propose new views.

## Code References
- Tree builder: [`viewTree.js`](../src/agent/viewTree.js)
- Context assembly: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- Runtime selection summaries: [`viewWorkflowContext.js`](../src/agent/viewWorkflowContext.js)
- Workflow resolution: [`viewWorkflowResolver.js`](../src/agent/viewWorkflowResolver.js)
- Local agent entry point: [`agentAdapter.js`](../src/agent/agentAdapter.js)
- Workflow catalog: [`viewWorkflowCatalog.js`](../src/agent/viewWorkflowCatalog.js)
- Coverage tests: [`viewTree.test.js`](../src/agent/viewTree.test.js)

## Why this exists
- The core view hierarchy is richer than the agent needs.
- The agent should see effective structure, not raw inheritance noise.
- The adapter should normalize encodings, selections, and descriptions into a
  compact tree.

## What the IR should resemble
The IR should stay close to the spec model:
- structural root container
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

Long citation blocks should not live in `description`. The spec should expose
citations as structured metadata, and the adapter should surface them separately
from the semantic description.

Transforms should be omitted from the default IR because they add noise.
If the agent later needs to know where the data came from, the adapter can
provide a detailed pipeline on demand.

The root of the IR should be the top-level visualization container, not the
SampleView subtree. That root node carries the top-level `description` from the
spec automatically and can contain SampleView plus other top-level annotation
views as children.

For the initial agent context, keep the SampleView branch expanded and collapse
the sibling branches of SampleView and its ancestors into compact summaries.
Preserve `visible`, `childCount`, `selector`, and any short description so the
agent can discover those branches later without paying the full tree cost.

`rootConfig` should stay minimal. Keep fields that matter for interpreting the
visualization structure or data resolution:
- `assembly`
- `baseUrl`
- `genomes`
- `datasets`

Omit presentation-only config such as:
- `config`
- `theme`
- `background`

## Source Material
The following files show the structures the adapter must understand:
- `packages/core/src/spec/root.d.ts` — root-level spec and root config
- `packages/core/src/spec/view.d.ts` — view structure, titles, descriptions, params, data, transforms, encodings
- `examples/docs/` — grammar and composition examples
- `examples/app/` — app-wrapped sample collection specs

## Current Code Paths to Reuse
The adapter should build the IR from the existing runtime structures rather than
inventing a new view model.

The traversal should start from the top-level visualization root so the agent
sees SampleView and sibling annotation branches in the same tree. The adapter
can still omit chrome and keep selector information only where it is stable and
useful.

### Root assembly
- `app.genomeSpy.viewRoot`
  - the runtime root container for the visualization tree
  - this is where SampleView and annotation branches hang from
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
  "rootConfig": {
    "assembly": "hg38",
    "baseUrl": "private/fuse_encode_gs/"
  },
  "root": {
    "id": "viewRoot",
    "kind": "root",
    "type": "root",
    "title": "Visualization root",
    "description": "High-level purpose of the visualization.",
    "children": [
      {
        "id": "viewRoot/samples",
        "kind": "container",
        "type": "sampleView",
        "title": "Samples",
        "description": "Shows sample-level metadata and track summaries.",
        "selector": {
          "scope": [],
          "view": "samples"
        },
        "parameterDeclarations": [
          {
            "selector": { "scope": [], "param": "brush" },
            "parameterType": "selection",
            "selectionType": "interval",
            "label": "brush",
            "persist": true,
            "encodings": ["x"],
            "clearable": true
          }
        ],
        "children": [
          {
            "id": "viewRoot/samples/track-1",
            "kind": "leaf",
            "type": "unit",
            "title": "Copy-number variation",
            "description": "Shows copy-number segments across the cohort.",
            "data": { "source": "samples" },
            "encodings": {
              "x": { "field": "start", "type": "index" },
              "x2": { "field": "end", "type": "index" },
              "fill": { "field": "logR", "type": "quantitative" }
            },
            "parameterDeclarations": [],
            "children": []
          }
        ]
      },
      {
        "id": "viewRoot/annotations",
        "kind": "container",
        "type": "layer",
        "title": "Annotation tracks",
        "description": "Genome annotations that support the sample tracks.",
        "children": []
      }
    ]
  }
}
```

## Normalization Rules
- Resolve inherited encodings onto the node that effectively uses them.
- Keep container nodes structural.
- Keep parameter declarations attached to the node that declares them.
- Carry author `description` through unchanged.
- Summarize root config only when it matters for understanding the visualization.

## Recommended Node Fields
- `id`
- `kind`
- `type`
- `title`
- `description`
- `selector`
- `data`
- `encodings`
- `parameterDeclarations`
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

# LLM View Tree Context (Draft)

This document describes the agent-facing visualization tree IR. The goal is to
keep the GenomeSpy core/app model unchanged while exposing a simplified,
spec-like tree that the agent can read, reason about, and eventually use to
propose new views.

## Code References

- Tree builder: [`viewTree.js`](../src/agent/viewTree.js)
- Context assembly: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- Runtime selection summaries: [`selectionAggregationContext.js`](../src/agent/selectionAggregationContext.js)
- Workflow resolution: [`selectionAggregationWorkflow.js`](../src/agent/selectionAggregationWorkflow.js)
- Local agent entry point: [`agentAdapter.js`](../src/agent/agentAdapter.js)
- Coverage tests: [`viewTree.test.js`](../src/agent/viewTree.test.js)

## Why this exists

- The core view hierarchy is richer than the agent needs.
- The agent should see effective structure, not raw inheritance noise.
- The adapter should normalize encodings, parameters, and descriptions into a
  compact tree.

## What the IR should resemble

The IR should stay close to the spec model:

- structural root container
- nested view tree
- titles and descriptions
- encodings
- data source / role
- parameter declarations
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
- parameter declarations
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

The root of the IR should be the top-level visualization container when one is
available. Otherwise, use the top-level addressable view tree root. That root
node carries the top-level `description` from the spec automatically and can
contain the sample collection branch plus other top-level annotation views as
children.

For the initial agent context, keep the branch relevant to the current focus
expanded and summarize sibling branches compactly.
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

- `packages/app/src/agent/selectionAggregationContext.js`
  - already traverses the runtime tree with `sampleView.visit(...)`
  - already extracts parameter declarations, active selections, and selection-driven fields

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

The agent IR should be a normalized tree with explicit node summaries. The
current implementation uses `type` as the normalized view type, `name` as an
optional fallback, `parameterDeclarations` for both selection parameters and
bound variables, and `visible` / `collapsed` / `childCount` as summary hints
only.

```json
{
  "schemaVersion": 1,
  "rootConfig": {
    "assembly": "hg38",
    "baseUrl": "private/fuse_encode_gs/"
  },
  "root": {
    "type": "vconcat",
    "title": "viewRoot",
    "name": "viewRoot",
    "description": "Functional Segmentation (FUSE) of ENCODE WGBS data",
    "children": [
      {
        "type": "layer",
        "title": "Chromosome Ideogram",
        "name": "ideogram-track",
        "description": "Chromosome ideogram with cytoband annotations.",
        "selector": {
          "scope": [],
          "view": "ideogram-track"
        },
        "collapsed": true,
        "childCount": 3
      },
      {
        "type": "unit",
        "title": "GC content",
        "name": "gc-content",
        "description": "GC content across the genome, derived from the hg38 reference sequence.",
        "selector": {
          "scope": [],
          "view": "gc-content"
        },
        "markType": "rect",
        "collapsed": true
      },
      {
        "type": "vconcat",
        "title": "Data Tracks",
        "name": "data-tracks",
        "description": "Data tracks for the ENCODE WGBS methylation experiment and derived data.",
        "selector": {
          "scope": [],
          "view": "data-tracks"
        },
        "children": [
          {
            "type": "sampleView",
            "title": "Samples",
            "name": "samples",
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
                "clearable": true,
                "value": {
                  "type": "interval",
                  "intervals": {
                    "x": [
                      { "chrom": "chr17", "pos": 7685233 },
                      { "chrom": "chr17", "pos": 7690076 }
                    ]
                  }
                }
              },
              {
                "parameterType": "variable",
                "label": "windowSize",
                "selector": { "scope": [], "param": "windowSize" },
                "persist": true,
                "value": 260000,
                "bind": {
                  "input": "select",
                  "options": [130000, 260000, 500000, 1000000, 2000000]
                }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

Current builder rules:

- `type` is the normalized view type derived from the underlying spec.
- `name` is optional and only present when it differs from the title or when
  the title is missing.
- `selector` is omitted for the structural root when the root is a separate
  top-level container.
- `parameterDeclarations` attaches to the node that declares the parameter.
- `visible` is emitted only for hidden nodes.
- `collapsed` and `childCount` describe summary state, not transport metadata.

## Normalization Rules

- Resolve inherited encodings onto the node that effectively uses them.
- Keep container nodes structural.
- Keep parameter declarations attached to the node that declares them.
- Carry author `description` through unchanged.
- Summarize root config only when it matters for understanding the visualization.

## Recommended Node Fields

- `type`
- `title`
- `description`
- `selector`
- `data`
- `encodings`
- `parameterDeclarations`
- `attributes`
- `visible`
- `collapsed`
- `childCount`
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

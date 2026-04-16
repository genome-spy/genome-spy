# Agent Tool Surface Cleanup

Note: This file is a planning note, not an implementation proposal.

Removing a single small tool showed that the agent surface is organized around
a scattered set of files, generated artifacts, tests, and prompt text rather
than around a small number of stable capabilities. That is why one trivial
change touched so many places.

This note is a cleanup plan for that surface. It is also a companion to
[`agent-host-api.md`](./agent-host-api.md): the host API note sketches the
boundary the agent will eventually consume, and this note explains how to make
the current tool surface line up with that boundary without introducing a
plugin framework too early.

The main goal is practical: adding or removing a tool should touch as few
files as possible and require as little duplicated maintenance as possible.
The current docs show that the same contract is repeated across the tool
surface note, several per-tool drafts, generated artifacts, tests, and the
agent-server mirror. That duplication is a bigger maintenance burden than any
single tool implementation.

Target budget: a tool add/remove should ideally require one canonical contract
edit, one runtime behavior edit when behavior changes, generated artifact
refreshes, and only the minimum number of docs and tests that are genuinely
boundary-relevant. If it needs more than a handful of human-edited files, the
surface is still too scattered.

## What The Fix Revealed

### 1. The tool surface does not have a single owner

The current tool contract is represented in multiple places:

- [`agentToolInputs.d.ts`](../src/agent/agentToolInputs.d.ts)
- generated catalog/schema JSON in [`generated/`](../src/agent/generated/)
- [`toolCatalog.js`](../src/agent/toolCatalog.js)
- [`agentTools.js`](../src/agent/agentTools.js)
- [`contextBuilder.js`](../src/agent/contextBuilder.js)
- [`agentSessionController.js`](../src/agent/agentSessionController.js)
- docs and prompts under [`LLM_PLAN/`](.)
- repeated assertions in app-side and agent-server tests

That is workable while the surface is still moving, but it means the tool list
behaves more like a distributed protocol than a contract with a clear owner.

### 2. The generator is still too tightly coupled to declaration syntax

`generateAgentToolCatalog.mjs` originally assumed that documented tool inputs
must be interfaces. The zero-field tool case showed that the generator should
care about the semantic shape of the input, not whether the declaration is an
interface or a type alias.

That is a narrow but important sign: the current extraction path is too close
to TypeScript syntax details.

### 3. The runtime boundary is broader than the host API needs

[`agentAdapter.js`](../src/agent/agentAdapter.js) still collects several
unrelated responsibilities:

- context assembly
- selector resolution
- host mutations
- provenance jumps
- metadata summaries
- request/response transport

That is not wrong, but it makes the adapter a catch-all layer. The host API
draft in `agent-host-api.md` suggests a cleaner split: analysis/mutation
capabilities on one side and browser UI registration on the other.

### 4. Tool vocabulary still needs to stay simple

The important lesson is that the surface should keep its host vocabulary easy
to name, document, and explain. When the agent surface starts adding jargon
that the host does not actually need, the contract becomes harder to maintain.

### 5. The same contract is asserted repeatedly

The tool list is checked in:

- app-side catalog tests
- generated-catalog tests
- context-builder tests
- agent-session controller tests
- agent-server tests
- prompt text

Those checks are useful, but too many of them are restating the same contract.
The result is more churn than protection.

### 6. Example trace: `setViewVisibility`

This tool is a representative example of the current maintenance footprint.
It shows the full path from the contract definition to generation, runtime
dispatch, prompt text, and mirrored tests.

#### Contract and type-level shape

- [`agentToolInputs.d.ts`](../src/agent/agentToolInputs.d.ts)
  - `SetViewVisibilityToolInput`
  - `AgentToolInputs.setViewVisibility`
- [`types.d.ts`](../src/agent/types.d.ts)
  - `AgentToolRuntime.setViewVisibility(selector, visibility)`
- [`LLM_PLAN/tools.md`](./tools.md)
  - `setViewVisibility(selector, visibility)`
  - documents it as a tool-level visibility control
- [`LLM_PLAN/agent-host-api.md`](./agent-host-api.md)
  - includes `setViewVisibility(selector, visibility)` in the draft host API

#### Generation scripts and generated artifacts

- [`scripts/generateAgentToolCatalog.mjs`](../../../scripts/generateAgentToolCatalog.mjs)
  - `createGeneratedToolCatalog()`
  - `renderGeneratedToolCatalog(...)`
- [`scripts/generateAgentToolSchema.mjs`](../../../scripts/generateAgentToolSchema.mjs)
  - `generateToolSchemaText()`
  - `writeGeneratedToolSchema()`
- [`scripts/checkGeneratedAgentToolCatalog.mjs`](../../../scripts/checkGeneratedAgentToolCatalog.mjs)
  - fails if `generated/generatedToolCatalog.json` is stale
- [`scripts/checkGeneratedAgentToolSchema.mjs`](../../../scripts/checkGeneratedAgentToolSchema.mjs)
  - fails if `generated/generatedToolSchema.json` is stale
- [`generated/generatedToolCatalog.json`](../src/agent/generated/generatedToolCatalog.json)
- [`generated/generatedToolSchema.json`](../src/agent/generated/generatedToolSchema.json)

#### Runtime tool plumbing

- [`toolCatalog.js`](../src/agent/toolCatalog.js)
  - `listAgentTools()`
  - `buildResponsesToolDefinitions()`
  - `validateToolArgumentsShape("setViewVisibility", ...)`
  - `formatToolCallRejection("setViewVisibility", ...)`
- [`agentTools.js`](../src/agent/agentTools.js)
  - `setViewVisibility(runtime, input)`
  - calls `runtime.setViewVisibility(input.selector, input.visibility)`
- [`agentSessionController.js`](../src/agent/agentSessionController.js)
  - `executeToolCalls(toolCalls)`
  - `#executeToolCall(toolCall)`
  - `AgentSessionRuntime.setViewVisibility(selector, visibility)`
- [`agentAdapter.js`](../src/agent/agentAdapter.js)
  - `setViewVisibility(selector, visibility)`
  - dispatches `viewSettingsSlice.actions.setVisibility(...)`

#### Context and prompt consumers

- [`contextBuilder.js`](../src/agent/contextBuilder.js)
  - `getAgentContext(app, options)`
  - includes `toolCatalog: listAgentTools()...` in the snapshot
- [`utils/agent_server/app/prompts/genomespy_system_prompt.md`](../../../../utils/agent_server/app/prompts/genomespy_system_prompt.md)
  - instructs the model when to use `setViewVisibility`
  - lists the tool in the visibility-tools section

#### Shared commentary docs

These documents are not specific to `setViewVisibility`, but they still repeat
the surrounding tool contract and therefore add to the churn when the surface
changes:

- [`LLM_PLAN/tools.md`](./tools.md)
- [`LLM_PLAN/metadata-attribute-summary-tool.md`](./metadata-attribute-summary-tool.md)
- [`LLM_PLAN/view-data-summary-tool.md`](./view-data-summary-tool.md)
- [`LLM_PLAN/explanatory-affordance-context.md`](./explanatory-affordance-context.md)
- [`LLM_PLAN/visible-sample-metadata-summary.md`](./visible-sample-metadata-summary.md)
- [`LLM_PLAN/python_agent_server.md`](./python_agent_server.md)

#### Tests and mirrored checks

- [`toolCatalog.test.js`](../src/agent/toolCatalog.test.js)
  - tool list membership
  - Responses API definitions
  - schema validation failure
  - rejection message formatting
- [`agentTools.test.js`](../src/agent/agentTools.test.js)
  - dispatches to the runtime
  - fails fast on unresolved selectors
- [`agentSessionController.test.js`](../src/agent/agentSessionController.test.js)
  - malformed argument rejection
  - repeated rejected tool call handling
  - validation failure text
- [`agentAdapter.test.js`](../src/agent/agentAdapter.test.js)
  - direct store dispatch for visibility changes
- [`contextBuilder.test.js`](../src/agent/contextBuilder.test.js)
  - includes `setViewVisibility` in the current tool catalog snapshot
- [`scripts/generateAgentToolCatalog.test.mjs`](../../../scripts/generateAgentToolCatalog.test.mjs)
  - asserts the generated tool set includes `setViewVisibility`
- [`scripts/generatedToolSchema.test.mjs`](../../../scripts/generatedToolSchema.test.mjs)
  - checks the generated schema covers the current tool set
- [`utils/agent_server/tests/test_tool_catalog.py`](../../../../utils/agent_server/tests/test_tool_catalog.py)
  - asserts the server mirror exposes `setViewVisibility`
- [`utils/agent_server/tests/test_provider_parser.py`](../../../../utils/agent_server/tests/test_provider_parser.py)
  - parses a provider tool call named `setViewVisibility`

This is the maintenance shape the cleanup plan is trying to shrink: one tool
touches the contract file, generation scripts, generated artifacts, runtime
dispatch, context assembly, prompts, mirrored server expectations, and several
tests.

### 7. Redundant test candidates

The goal here is not to delete every test that mentions a tool. The goal is to
keep one or two tests per boundary and drop the ones that only restate the same
tool inventory in a different place.

#### Keep as canonical boundary tests

- [`toolCatalog.test.js`](../src/agent/toolCatalog.test.js)
  - This is the main app-side runtime contract test.
  - It should keep covering runtime tool metadata, validation, and a
    representative rejection message.
- [`scripts/generateAgentToolCatalog.test.mjs`](../../../scripts/generateAgentToolCatalog.test.mjs)
  - Keep the file-vs-generator comparison.
  - This is the main generator fidelity check.
- [`utils/agent_server/tests/test_tool_catalog.py`](../../../../utils/agent_server/tests/test_tool_catalog.py)
  - Keep one server-side mirror test if the Python side needs a boundary
    guard.
- [`agentSessionController.test.js`](../src/agent/agentSessionController.test.js)
  - Keep the controller behavior tests that prove the dispatch loop, retry
    budget, and turn lifecycle.

#### Drop or trim as redundant

- [`scripts/generatedToolSchema.test.mjs`](../../../scripts/generatedToolSchema.test.mjs)
  - Drop this entire test file unless it starts checking behavior that the
    generator-file comparison cannot cover.
  - The schema freshness script already guards the generated file, and the
    runtime contract test already checks the shape the app actually consumes.
- [`scripts/generateAgentToolCatalog.test.mjs`](../../../scripts/generateAgentToolCatalog.test.mjs)
  - Drop the second test, `produces the planner-facing tool set`.
  - The exact tool-name array is already asserted in the runtime catalog test
    and the server mirror test.
  - Keep only the generator-vs-committed-file check.
- [`contextBuilder.test.js`](../src/agent/contextBuilder.test.js)
  - Remove the exact `toolCatalog` name-list assertion.
  - Keep only a shape-level check that the context includes the generated tool
    catalog.
- [`utils/agent_server/tests/test_tool_catalog.py`](../../../../utils/agent_server/tests/test_tool_catalog.py)
  - Replace the exact ordered name-list assertion with a smaller mirror-shape
    check if the Python boundary still needs one.
  - The current full list is just repeating the same inventory one more time.
- [`agentSessionController.test.js`](../src/agent/agentSessionController.test.js)
  - Keep one malformed-tool rejection path for the controller.
  - Remove extra tool-specific validation tests when they only reassert the
    same generated tool contract and rejection phrasing.
  - Prefer a single representative tool for controller error-path coverage, not
    one per tool family.

#### What should still be covered somewhere

- the canonical tool inventory
- the generated catalog and schema files
- one runtime tool metadata test
- one generator freshness/fidelity test
- one app-context snapshot test that proves the tool catalog is attached
- one server-side mirror check if the Python path still needs it
- one controller rejection path for malformed tool calls

Anything beyond that should justify its existence by testing a different
boundary, not by repeating the same list of tools again.

## How This Aligns With `agent-host-api.md`

The host API note proposes two stable seams:

- an analysis/mutation host for read-only context, selector resolution,
  provenance inspection, and intentional mutations
- a UI host for app-owned toolbar/menu registration

This cleanup plan should support that shape instead of fighting it.

Concretely:

- tools that read context or submit mutations should be organized as host
  capabilities, not as a loose bag of unrelated helpers
- browser-only UI contributions should live on the UI seam, not in the same
  contract as analysis/mutation tools
- the extracted agent package should eventually consume the host APIs, while
  the current app package continues to own app-specific snapshot construction
  and rendering details

The cleanup work therefore serves two outcomes at once:

1. it reduces churn in the current app package
2. it prepares the codebase for the host boundary described in
   `agent-host-api.md`

## Cleanup Goals

The cleanup should aim for these outcomes:

- adding or removing a tool should touch as few files as possible
- the number of manual edits per tool change should stay small
- one canonical definition of the tool surface
- a clean separation between analysis/mutation capabilities and browser UI
- fewer generated artifacts that need manual touch-up
- fewer docs that restate the same contract in different words
- fewer tests that repeat the same tool list
- a narrower adapter boundary
- an eventual host boundary that matches the draft in `agent-host-api.md`

## Proposed Cleanup Plan

### Phase 0: Classify the current surface

Goal: identify the places that currently force broad churn when a tool changes.

Steps:

1. Categorize every current agent-facing capability as one of:
   - analysis/read-only context
   - mutation
   - browser UI registration
   - transport/session orchestration
2. Mark the current owner for each capability.
3. Identify which files are authoritative for the contract itself.
4. Identify which files should be generated, derived, or purely explanatory.
5. Identify any current helper that is not really a tool at all and should stay
   internal.

Deliverable:

- a small internal inventory table, kept in this note or beside it, that says
  where each capability belongs and which files should change when it changes.

Success criteria:

- every existing tool can be described in one category
- the inventory makes the current churn points visible before implementation starts
- the inventory makes it obvious which files are contract, projection, and
  commentary

### Phase 1: Consolidate the source of truth

Goal: make the contract live in one place and derive everything else from it.

Steps:

1. Keep a single machine-readable tool inventory as the source of truth.
2. Treat the generated catalog and schema as projections of that inventory.
3. Keep `agentToolInputs.d.ts` as the type-level contract only if it stays in
   sync with the inventory, not as a second place where the tool list is
   curated.
4. Make the generator accept both interfaces and type aliases for object-shaped
   and zero-field tool inputs.
5. Replace repeated hand-written tool lists with generated or shared
   assertions where possible.
6. Replace duplicated contract prose with references to the inventory instead of
   restating the same list in each doc.

Why this phase matters:

- this is the fastest way to reduce churn without changing the runtime shape
- it also exposes whether the current source-of-truth file is the right long
  term owner
- it is the main lever for shrinking the number of files touched by a tool
  addition or removal
- it should reduce the amount of repeated copy-editing across the tool docs

Success criteria:

- adding or removing a tool changes one canonical source and then regenerates
  the projections
- the generator no longer cares about interface-vs-type-alias syntax
- tests still protect the contract, but with less duplication
- the overview docs reference the inventory instead of duplicating it

### Phase 2: Split the runtime boundary into host seams

Goal: make the runtime align with the draft host API instead of one giant
adapter, so tool changes do not fan out through unrelated code.

Steps:

1. Keep `agentTools.js` focused on tool behavior and result formatting.
2. Move analysis and mutation capabilities toward a smaller host object.
3. Keep browser UI registration separate from analysis/mutation capabilities.
4. Make `agentAdapter.js` compose the host seams instead of owning everything.
5. Avoid adding new adapter methods unless they are clearly host capabilities.

Relationship to `agent-host-api.md`:

- this phase is the practical bridge to the draft `AgentAnalysisHost` and
  `AgentUiHost` split
- the app package can keep its internal state shapes, but the agent should stop
  reaching directly into those internals through a broad adapter

Success criteria:

- the adapter reads like a host facade, not a random utility bundle
- browser UI registration no longer sits next to analysis and mutation logic
- the extracted agent package has fewer reasons to know app-shell internals
- the number of runtime files touched by a tool change is lower than it is now

### Phase 3: Keep the surface vocabulary small

Goal: keep the tool surface lean and easy to understand.

Steps:

1. Keep the tools that are still needed by the current agent workflow.
2. Remove docs and prompt text for tools that no longer exist.
3. Keep the host vocabulary aligned with the runtime capabilities that are
   actually present.
4. Revisit the surface only when a new tool has a clear user-facing purpose.

Why this matters:

- unused tools and stale wording are easy for the model to confuse
- every obsolete tool increases prompt size, docs churn, and test churn
- the current cleanup should not reintroduce wording that creates more
  maintenance surface for a tool change

Success criteria:

- the model is not exposed to stale tool names or stale host wording
- the tool surface is easier to explain and easier to keep stable
- the docs for a tool change are updated in fewer places than before

### Phase 4: Reduce duplicated assertions and mirrored expectations

Goal: stop restating the same contract in every layer.

Steps:

1. Keep one app-side test that validates the generated tool catalog.
2. Keep one generator test that checks the generator output against the
   committed artifacts.
3. Keep the agent-server mirror test only where it protects a real boundary.
4. Turn prompt text and docs into consumers of the same source where possible.
5. Prefer a small number of end-to-end contract checks over repeated full
   list asserts.

Success criteria:

- tool-list churn only updates a few high-value checks
- the tests still catch contract drift without duplicating the contract
- mirrored server checks only remain where they catch a real integration gap

### Phase 5: Make extraction easier later

Goal: ensure the cleanup is not just a local simplification.

Steps:

1. Keep the app-specific snapshot builders in `packages/app`.
2. Keep host-facing capability names stable once they are selected.
3. Avoid moving app state shapes into the host API unless the extracted package
   truly needs them.
4. Keep the UI registration seam declarative so the extracted agent package can
   use it without knowing the toolbar implementation.

Why this matters:

- the host API note is about package extraction, not just local cleanliness
- the tool cleanup should make that extraction easier, not create another
  temporary abstraction layer

Success criteria:

- the current app package can be simplified without losing the ability to
  extract the agent later
- the host API draft remains small enough to reason about

## Non-Goals

- Do not invent a plugin framework yet.
- Do not split the agent into packages until the host boundary is stable
  enough to be worth extracting.
- Do not add new tool variants unless they solve a real agent failure mode.
- Do not push browser DOM ownership into the agent package if a declarative UI
  host is enough.
- Do not over-normalize the adapter if the simpler shape is still readable.

## Practical Rule

If a tool can be described in one sentence and its removal still touches five
or more unrelated files, the problem is probably not the tool itself. The
problem is that the contract is organized around the wrong boundary.

## Open Questions

- Should the long-term canonical contract be a machine-readable inventory file,
  with `agentToolInputs.d.ts` kept as a type-level projection, or should the
  type file itself remain the registry?
- Which current helpers are truly runtime-private and which should become host
  methods?
- Does the browser-only UI seam need only toolbar buttons and menu items, or
  will the extracted agent need a richer panel registration API later?
- Which duplicated tests are actually buying safety, and which are just
  repeated assertions of the same contract?

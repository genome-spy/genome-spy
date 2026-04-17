# Aggressive Agent Tool Surface Cleanup

This note is a replacement plan for the current agent tool architecture. The
old plan correctly noticed that a small tool change touched too many files, but
it was still too conservative: it mostly tried to make the existing generator,
mirror, adapter, and test layers less painful. That will not make this code
easy to edit by hand.

The current shape should be treated as disposable. The practical target is to
halve the human-maintained tool-surface code and remove most of the indirection
between "a tool exists" and "the app executes it".

## Verdict

Do not keep the current architecture and polish it. Replace it with a smaller
tool model.

The current design has three separate problems:

- the same tool contract is represented as TypeScript declaration syntax,
  generated catalog JSON, generated schema JSON, a runtime handler map, app
  tests, Python mirror code, Python tests, prompt text, and context text
- the model sees a confusing split between callable tools and generated
  `actionCatalog` entries, with `submitIntentActions` acting as a bridge to
  internal Redux/provenance actions
- several tools exist only to compensate for context-shape or schema-shape
  limitations, not because they are natural capabilities

Improving the existing generator would only make the current stack of
representations more reliable. It would not make the system simpler.

## Simplification Target

After the cleanup, a normal tool add/remove should require:

1. one edit in the executable tool registry
2. one handler edit only if the tool has new behavior
3. one focused handler or integration test only when there is real behavior to
   protect

It should not require hand-edited changes to TypeScript declaration registries,
generated JSON artifacts, Python mirror code, multiple inventory assertions,
prompt inventory lists, and context-builder snapshots.

The intended steady-state files are:

- `agentToolRegistry.js`: canonical executable registry
- `agentToolExecutor.js` or a small exported function from the registry module:
  validation, lookup, execution, and rejection formatting
- a small number of real tool implementation modules
- one registry contract test
- focused behavior tests for non-trivial tools

The following should disappear for the tool surface:

- `agentToolInputs.d.ts` as the tool registry
- `generated/generatedToolCatalog.json`
- `generated/generatedToolSchema.json`
- `generateAgentToolCatalog.mjs`
- `generateAgentToolSchema.mjs`
- Python `tool_catalog.py`
- Python tests that assert browser tool inventory
- broad exact tool-list assertions in unrelated app tests

Generated code is acceptable later, but only when the generated files replace
hand-maintained duplication. The current generated catalog and schema do not
replace duplication; they add another representation that must be tested and
mirrored.

## Current Failure Modes

### 1. The source of truth is not executable

[`agentToolInputs.d.ts`](../agentToolInputs.d.ts) is treated as the canonical
tool contract, but the app cannot execute it. Tool behavior lives in
[`agentTools.js`](../agentTools.js), validation and provider projection live in
[`toolCatalog.js`](../toolCatalog.js), and the Python relay rebuilds provider
tool definitions in `utils/agent_server/app/tool_catalog.py`.

That makes a tool definition hard to inspect directly. A maintainer has to
change declarations, generators, generated artifacts, handlers, tests, and
server projection code before they can be confident the tool changed.

### 2. The generator is solving the wrong problem

The current generator parses TypeScript declaration syntax and then another
script asks `ts-json-schema-generator` to emit schema. The recent zero-field
tool issue showed that the generator is too coupled to declaration syntax, but
the deeper issue is that it exists because the canonical contract is in the
wrong format.

Do not spend more time making the generator understand every declaration shape.
Make the canonical contract executable instead.

### 3. The Python relay should not own the browser tool catalog

The browser already knows which tools it can execute. The relay should not read
browser-generated files from disk and rebuild provider tool definitions. That
couples the relay to repo layout, duplicates the schema projection logic in
Python, and creates another test surface for every tool change.

The browser request should send provider-neutral tool definitions with the
turn request. The relay should pass them to the provider adapter. Prompt context
can still omit the tool catalog text, but the provider tool payload should come
from the app for that request, not from Python-side file reads.

### 4. The tool/action split exposes implementation details

The current agent surface exposes callable tools and a generated
`actionCatalog`. The most important mutation tool, `submitIntentActions`, then
asks the model to construct internal-ish action payloads. This leaks too much
application plumbing into the model contract and forces helper tools such as
`buildSelectionAggregationAttribute` to paper over awkward payload shapes.

If a human request is "group by quartiles", the model should not need to know
which Redux action type carries that payload. It should submit an agent command
that the app maps to provenance actions.

### 5. Some tools are stateful context controls, not user capabilities

`expandViewNode` and `collapseViewNode` mutate agent-session context state.
They are not user-facing application capabilities. They add runtime methods,
controller state, tests, and prompt surface for what is essentially context
paging.

If view context needs paging, use a stateless read tool such as
`getViewContext({ selector, depth })`. If the view tree is small enough after
better summarization, delete this capability entirely.

### 6. Tests punish harmless changes

The tests repeatedly assert the same inventory and phrasing across catalog,
generator, context, controller, adapter, and Python layers. This is why small
surface changes feel risky. Most of those tests are not protecting behavior;
they are retyping the contract.

Keep tests for behavior and boundaries. Delete inventory echoes.

## Proposed Architecture

### Canonical registry

Use one executable registry as the source of truth:

```js
export const agentToolRegistry = {
    summarizeMetadata: {
        description: "Return a compact summary of a sample metadata attribute.",
        strict: true,
        inputSchema: {
            type: "object",
            required: ["attribute", "scope"],
            additionalProperties: false,
            properties: {
                attribute: sampleAttributeIdentifierSchema,
                scope: {
                    type: "string",
                    enum: ["visibleSamples", "visibleGroups"],
                },
            },
        },
        execute: summarizeMetadataTool,
    },
};
```

The registry should directly drive:

- the app-side tool catalog sent in context when needed
- provider tool definitions sent to the relay
- app-side argument validation
- tool lookup and execution
- rejection messages

This removes the declaration-to-catalog-to-schema-to-runtime path. The schema is
the schema the provider receives and the app validates.

If stronger static typing is needed, add generated `.d.ts` output from the
registry later. Do not use `.d.ts` as the registry.

### Browser-owned provider tools

Change the browser-to-relay request shape to include tool definitions:

```ts
interface AgentTurnRequest {
    message: string;
    history: AgentConversationMessage[];
    context: AgentContext;
    tools: AgentProviderToolDefinition[];
}
```

The Python relay should use `request.tools` for Responses API tool payloads.
It should not import browser generated JSON files. This deletes the Python tool
catalog mirror and makes the app the sole owner of executable app tools.

The relay should also drop the Chat Completions provider path. Tool-capable
agent turns should have one provider shape: Responses API requests with
browser-provided tool definitions. Keeping Chat Completions means keeping a
second prompt path that does not advertise tools the same way and keeps parser
fallback code alive for no useful maintenance benefit.

Hash-based tool-definition caching can be added later if request size becomes a
real issue. That protocol can send `toolCatalogHash` first and include full
tool definitions only when the relay cache misses. It should not be part of the
first cleanup because deleting the filesystem mirror and the Chat Completions
path matters more than optimizing a small provider tool payload.

### One command language for mutations

Replace the current "generated Redux action catalog plus submit tool" model
with a small agent command schema. The schema should describe user-level
operations, not internal action types.

Examples of commands:

- set a parameter value
- group samples by an attribute or derived selection aggregate
- set metadata visibility
- set view visibility
- jump to a provenance state

The app can still map commands to existing Redux/provenance actions internally.
That mapping is implementation code, not model-facing contract.

This is the largest simplification lever. As long as the model has to assemble
internal action payloads, helper tools and generated action artifacts will keep
spreading.

### Smaller tool set

The target provider-facing surface should be closer to this:

- `getContextSlice`: optional stateless context paging for one view, sample
  group, or provenance area
- `summarizeMetadata`: one metadata summary tool with `scope:
  "visibleSamples" | "visibleGroups"`
- `searchViewData`: searchable view lookup
- `submitCommands`: execute user-level agent commands

Potentially keep `jumpToProvenanceState` as a separate tool only if it must
happen before command construction and cannot cleanly be represented as a
command.

Prefer sending a complete, coherent view-context snapshot when it is small
enough. A stateless context-slice tool is only the fallback for oversized
contexts, and its result should be a self-contained sub-snapshot with path and
parent context. Do not make the model reconstruct the authoritative view
hierarchy from a base snapshot plus patch-like subtree results; the app should
own the complete hierarchy and validate any hierarchy-dependent operation
against current state.

Tools to remove or fold:

- `expandViewNode` and `collapseViewNode`: delete, or replace with stateless
  `getContextSlice`
- `setViewVisibility`: fold into `submitCommands`
- `getMetadataAttributeSummary` and `getGroupedMetadataAttributeSummary`: merge
  into `summarizeMetadata`
- `buildSelectionAggregationAttribute`: delete by allowing `submitCommands` to
  reference a selection aggregation candidate directly
- `jumpToInitialProvenanceState`: fold into `jumpToProvenanceState` or
  `submitCommands`

This reduces the surface from ten tools to roughly four. That is more valuable
than making the current ten-tool catalog easier to generate.

## Code Deletion Plan

### Phase 0: Stop expanding the old system

Do not add more generator features, mirror tests, or per-tool prompt inventory
text while this cleanup is pending. Fix urgent bugs only when needed, but avoid
making the current architecture more complete.

Success criteria:

- no new tool-surface code is added to the `.d.ts` plus generated JSON path
- no new exact inventory tests are added

### Phase 1: Cut the tool surface before porting it

First reduce the number of tools in the current architecture. Deleting before
rewriting avoids porting tools that should not survive.

Steps:

1. Remove `expandViewNode` and `collapseViewNode`, or replace both with one
   stateless context-read tool if the model still needs progressive view
   detail.
2. Merge the two metadata summary tools into one `summarizeMetadata` tool.
3. Remove `buildSelectionAggregationAttribute` by allowing the mutation command
   payload to reference selection aggregation candidates.
4. Move view visibility changes into the mutation command path.
5. Merge initial and explicit provenance jumps unless keeping a separate
   provenance navigation tool is clearly useful.

Success criteria:

- provider-facing tool count is four or five
- helper tools that only adapt one internal payload shape are gone
- the prompt no longer explains model-private context mutation tools

### Phase 2: Replace generated tool artifacts with the registry

Create `agentToolRegistry.js` and make it the only tool source of truth.

Steps:

1. Move each surviving tool's description, strict flag, input JSON Schema, and
   execute function into the registry entry.
2. Replace `listAgentTools`, `buildResponsesToolDefinitions`,
   `validateToolArgumentsShape`, and rejection formatting with registry-backed
   helpers.
3. Delete `agentToolInputs.d.ts` after any remaining useful named input types
   are moved to JSDoc typedefs or generated from the registry.
4. Delete generated tool catalog/schema files and their generator scripts.
5. Keep action generators temporarily only if `submitIntentActions` still
   exists during the transition.

Success criteria:

- adding or removing a tool changes one executable registry object
- no AST parsing is needed for tool contracts
- provider schema and app validation use the same schema object

### Phase 3: Make the relay tool-agnostic

Move tool ownership fully into the browser request.

Steps:

1. Add a `tools` field to the browser turn request.
2. Build that field from the registry in `agentAdapter.js` before sending the
   request.
3. Update the Python request model to accept `tools`.
4. Make the Responses provider use `request.tools`.
5. Delete the Chat Completions provider path and its provider-specific tests.
6. Delete `utils/agent_server/app/tool_catalog.py`.
7. Delete `utils/agent_server/tests/test_tool_catalog.py`.
8. Defer hash-based tool caching until after the relay has one tool path.

Success criteria:

- the relay can run without reading files from `packages/app/src/agent/generated`
- the Python side does not know browser tool names
- changing a browser tool does not require Python code or Python test edits
- provider code has one supported tool-capable request path
- no cache handshake is required for the first simplification pass

### Phase 4: Replace action catalog exposure with commands

This is the phase that makes the mutation surface hand-editable.

Steps:

1. Define a small `AgentCommand` union for user-level operations.
2. Implement a command executor that maps those commands to current
   Redux/provenance actions.
3. Replace `submitIntentActions` with `submitCommands`.
4. Stop sending the generated `actionCatalog` to the model once command docs
   are sufficient.
5. Delete action catalog/schema/type generators only after all model-facing
   mutation paths have moved to commands.

Success criteria:

- the model sees a stable command language instead of app reducer names
- selection aggregation, visibility, grouping, and parameter changes use one
  mutation path
- internal Redux action renames do not affect the agent contract

### Phase 5: Thin the tests

After the architecture shrinks, remove tests that only repeated the old
contract.

Keep:

- one registry test that proves every entry has a valid schema, description,
  strict flag, and handler
- one provider-definition projection test
- one validation/rejection test for representative invalid arguments
- focused behavior tests for non-trivial tools such as metadata summary,
  searchable view lookup, command execution, and provenance navigation
- controller tests for queueing, retry limits, streaming, cancellation, and
  transcript behavior

Delete or trim:

- exact tool-name assertions in context-builder tests
- tool inventory assertions in controller tests
- direct pass-through wrapper tests in `agentTools.test.js`
- adapter tests that only prove a method forwards to another method
- Python tool catalog tests
- generator-vs-file tests for deleted tool generators

Success criteria:

- changing a tool name breaks one or two relevant tests, not half the agent
  suite
- tests fail for behavior regressions, not for duplicated inventory text

## Expected Line-Count Reduction

The realistic reduction comes from deletion, not refactoring.

The current directly relevant tool-surface code is already large before
counting generated JSON:

- `agentToolInputs.d.ts`: about 265 lines
- `toolCatalog.js`: about 346 lines
- `agentTools.js`: about 375 lines
- tool generator scripts and tests: about 392 lines
- Python tool mirror and mirror test: about 222 lines
- duplicated tool assertions inside broader tests: spread across several
  hundred more lines

The first registry pass should remove or collapse roughly 1,000 lines of
tool-surface code before touching the generated action catalog. The command
language phase is what makes a 50% reduction plausible for the broader
agent-facing contract.

Likely removals or large shrinkage:

- `agentToolInputs.d.ts`: delete as a registry
- generated tool catalog/schema JSON and `.d.ts` files: delete
- `generateAgentToolCatalog.mjs` and `generateAgentToolSchema.mjs`: delete
- `toolCatalog.js`: shrink into registry helpers
- `agentTools.js`: shrink by deleting wrapper tools and moving execution into
  registry entries
- `utils/agent_server/app/tool_catalog.py`: delete
- `utils/agent_server/tests/test_tool_catalog.py`: delete
- Chat Completions provider/parser fallback code and tests: delete
- repeated tool assertions in app tests: delete
- generated action artifacts: delete in the later command phase if the action
  catalog stops being model-facing

The first three phases should materially reduce the tool-surface code. The
fourth phase is needed to halve the broader agent contract code because the
generated action catalog is the other major source of indirection.

## Relationship To `agent-host-api.md`

The host API draft is still useful, but it should not drive a new abstraction
layer yet. The current priority is to delete the scattered contract and reduce
the tool count.

Keep these host ideas:

- browser UI registration is separate from agent analysis and mutation
- app-specific state stays inside the app
- model-facing capabilities should be named at the user-task level

Delay these host ideas:

- package extraction
- broad host facades
- plugin-style capability registration

Once the registry and command language are small, the host boundary will be
obvious. Building the host boundary first risks preserving the current mess
behind nicer names.

## Non-Goals

- Do not create a plugin framework.
- Do not preserve backwards compatibility for the current agent API.
- Do not continue exposing reducer/action names just because generators already
  exist.
- Do not add new provider-specific schema projection logic in Python.
- Do not keep Chat Completions as a parallel provider path for agent turns.
- Do not keep a tool only because a test or prompt currently mentions it.

## Decision Rules

- If a tool only transforms one internal payload shape into another, fold it
  into the command executor.
- If a tool mutates only agent context state, prefer a stateless read tool or
  delete it.
- If a contract is needed by both validation and provider calls, keep one schema
  object and reuse it.
- If a test repeats a generated or registry-derived inventory, delete it unless
  it protects a real integration boundary.
- If a simplification removes an entire layer, prefer it over making that layer
  more generic.

## Open Questions

- Can the initial command language replace the generated action catalog
  immediately, or should `submitIntentActions` remain for one transition?
- Does the model still need view-tree paging after the view context is
  summarized better?
- Should provenance navigation be a command or a separate read-before-mutate
  tool?
- Should registry schemas be hand-written JSON Schema, or should a later
  generator emit static types from the registry for editor support?

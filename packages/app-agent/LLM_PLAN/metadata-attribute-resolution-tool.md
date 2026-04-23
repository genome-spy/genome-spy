# Metadata Attribute Resolution Tool

Plan for fixing agent failures on prompts like:

- "Keep only relapse samples, then summarize purity."

The current agent can see metadata attributes in context, but it still has to
guess which attribute contains the user-mentioned value. That guess is brittle
when the user names a category value such as `relapse` instead of an attribute
name such as `timepoint` or `disease_status`.

## Goal

Add a read-only agent tool that resolves free-text metadata terms against the
current sample metadata so the model can discover:

- which categorical attribute likely contains the term
- which exact category value matched
- whether the match is unique or ambiguous

This should let the agent ground "relapse" to a real
`{ type: "SAMPLE_ATTRIBUTE", specifier: ... }` before it constructs
`filterByNominal`, `groupByNominal`, or follow-up summary actions.

## Existing Behavior To Reuse

The toolbar search already contains the core idea we want.

- [`searchField.js`](../src/components/toolbar/searchField.js)
  forwards unmatched free-text terms to
  [`MetadataView.handleVerboseCommand()`](../../app/src/sampleView/metadata/metadataView.js).
- [`MetadataView.handleVerboseCommand()`](../../app/src/sampleView/metadata/metadataView.js)
  scans categorical metadata attributes and checks whether the entered term
  exists as an exact metadata value.
- If it finds a match, it dispatches `filterByNominal` for that attribute.

That proves the app already has a useful metadata-value lookup behavior.

On the agent side, [`searchViewDatumsTool.js`](../src/agent/searchViewDatumsTool.js)
is also a strong implementation reference.

- it is read-only
- it keeps results bounded
- it validates inputs explicitly
- it returns structured matches plus a short text summary
- it exposes matching behavior clearly instead of hiding it inside an action

## Why We Should Not Reuse The UI Path Directly

`handleVerboseCommand()` is not suitable as the agent interface:

- it is write-oriented, not read-oriented
- it returns only `boolean`
- it dispatches immediately instead of exposing candidates
- it stops at the first match
- it is tied to `MetadataView`

The agent needs a fact-finding tool, not an implicit action.

## Proposed Feature

Add a new read-only tool, tentatively:

- `resolveMetadataAttributeValues(query)`

The tool should search the current sample metadata for categorical value
matches and return bounded candidate rows such as:

```json
{
  "kind": "metadata_attribute_value_resolution",
  "query": "relapse",
  "count": 1,
  "matches": [
    {
      "attribute": {
        "type": "SAMPLE_ATTRIBUTE",
        "specifier": "timepoint"
      },
      "title": "timepoint",
      "dataType": "nominal",
      "matchedValue": "relapse",
      "matchType": "exact",
      "visibleSampleCount": 42
    }
  ]
}
```

If several attributes match, the tool should return multiple candidates so the
agent can either choose a clear winner or ask a clarification question.

## Matching Scope

V1 should stay narrow and deterministic.

- Search only `SAMPLE_ATTRIBUTE` metadata.
- Search only categorical attributes: `nominal` and `ordinal`.
- Match against actual observed values in the current metadata state.
- Prefer exact case-insensitive matching first.
- Support a bounded typo-tolerant fallback using Levenshtein distance when
  exact matching finds nothing useful.
- Optionally add prefix matching only if exact and bounded fuzzy matching still
  feel too strict.
- Keep the result size bounded.

Explicitly out of scope for V1:

- semantic synonyms like `male` -> `M`
- quantitative threshold inference
- automatic action dispatch
- searching view datums or genomic annotations

## Recommended Extraction

Extract the metadata-value matching logic into a shared helper instead of
copying `handleVerboseCommand()` into the agent layer.

Suggested shape:

- new shared helper under `packages/app/src/sampleView/metadata/`
- input:
  - `sampleHierarchy`
  - attribute info lookup
  - query string
- output:
  - bounded list of categorical value matches with attribute info and counts

Then:

- `MetadataView.handleVerboseCommand()` can call the helper and keep its
  current dispatch behavior
- the new agent tool can call the same helper and return structured results

This keeps one matching policy for both the toolbar workflow and the agent.

## Agent Surface Changes

Update the app-agent stack in these places:

- [`agentToolInputs.d.ts`](../src/agent/agentToolInputs.d.ts)
  - add the new tool contract and examples
- [`agentTools.js`](../src/agent/agentTools.js)
  - register the handler
- new tool implementation file, likely parallel to
  [`searchViewDatumsTool.js`](../src/agent/searchViewDatumsTool.js)
  - follow the same bounded read-only tool style
- generated tool artifacts
  - regenerate tool catalog and schema outputs
- [`types.d.ts`](../src/agent/types.d.ts) and/or
  [`agentContextTypes.d.ts`](../src/agent/agentContextTypes.d.ts)
  - add a typed result shape if needed

The runtime source can likely live next to the current metadata summary source
logic in [`agentAdapter.js`](../src/agent/agentAdapter.js), or in a focused
helper if that file starts accumulating too much metadata-specific logic.

## Inspiration From `searchViewDatums`

`searchViewDatums` is the closest existing agent-tool pattern for this work.

Useful properties to mirror:

- narrow, explicit input contract
- deterministic matching modes
- bounded result count
- short human-readable `text` plus structured `content`
- rejection of malformed requests before runtime work

Recommended parallel:

- `searchViewDatums(query, field, mode, selector)` searches one searchable
  view
- the new metadata-resolution tool should search metadata values across the
  current sample metadata inventory

Important difference:

- `searchViewDatums` resolves against one selected view and its configured
  search fields
- the metadata-resolution tool resolves across categorical sample attributes
  and their observed values

So the plan should borrow the tool shape and bounded lookup style from
`searchViewDatums`, while borrowing the actual metadata matching idea from
`MetadataView.handleVerboseCommand()`

## Prompt Changes

Update the system prompt so the agent uses the new tool before guessing an
attribute from a user-mentioned metadata value.

Add guidance like:

- when the user names a metadata category value such as `relapse`, `female`,
  or `AML` without naming the attribute, call the metadata-resolution tool
  first
- do not infer the attribute only from title similarity when the value can be
  resolved from current metadata
- if the tool returns multiple plausible attributes, ask a brief clarification
  question or explain the ambiguity

Relevant prompt file:

- [`genomespy_system_prompt.md`](../server/app/prompts/genomespy_system_prompt.md)

## Tool Behavior In The Example Request

For "Keep only relapse samples, then summarize purity.", the expected agent
workflow becomes:

1. Call `resolveMetadataAttributeValues({ query: "relapse" })`.
2. Read back the concrete attribute and matched value.
3. Submit `sampleView/filterByNominal` using that exact attribute/value pair.
4. After the state refresh, call `getMetadataAttributeSummary` for `purity`.
5. Answer from the returned summary.

This removes the attribute-name guess from the critical path.

## Ambiguity Handling

We should design for non-unique matches up front.

Examples:

- `relapse` may appear in both `timepoint` and `disease_status`
- `yes` may appear in many boolean-like columns

Recommended behavior:

- return several candidates, ordered by confidence
- include enough evidence for the agent to reason about the best candidate:
  - attribute id
  - title
  - data type
  - matched value
  - visible sample count
- keep the tool read-only
- let the agent ask a clarification question when ambiguity remains real

## Suggested Ranking

Keep ranking simple in V1.

1. exact case-insensitive value match
2. bounded Levenshtein-distance match
3. larger visible-sample count for the matched value
4. stable tie-breaker by attribute name

This should still stay intentionally simpler than a broad fuzzy-search system.

## Levenshtein Fallback

Levenshtein distance is a good fit here as a narrow fallback for small typos in
user-entered category values.

Examples it should help with:

- `relpase` -> `relapse`
- `relapse` -> `relapse`
- `primray` -> `primary`

Recommended constraints:

- only run the Levenshtein pass after exact matching
- compare against observed categorical values, not attribute names alone
- normalize case before scoring
- use a small maximum distance, for example:
  - distance `<= 1` for short strings
  - distance `<= 2` for medium-length strings
- prefer exact matches over all fuzzy matches regardless of count
- surface the match type in the tool result, for example:
  - `exact`
  - `levenshtein`
- include the edit distance for fuzzy matches so the agent can reason about
  confidence

Example fuzzy result row:

```json
{
  "attribute": {
    "type": "SAMPLE_ATTRIBUTE",
    "specifier": "timepoint"
  },
  "title": "timepoint",
  "dataType": "nominal",
  "matchedValue": "relapse",
  "matchType": "levenshtein",
  "distance": 1,
  "visibleSampleCount": 42
}
```

The tool should remain conservative:

- do not return distant fuzzy matches
- do not use fuzzy matching to bridge semantic differences
- do not quietly auto-pick a fuzzy match when several candidates tie closely

If the fuzzy pass returns several similarly plausible candidates, the agent
should clarify instead of guessing.

## Tests

Add tests in three layers.

### Shared matcher tests

- exact match against one categorical attribute
- same value appearing in multiple attributes
- no matches
- non-categorical attributes excluded
- result ordering and truncation
- single-typo Levenshtein match resolves to the intended category
- exact matches outrank fuzzy matches
- overly distant strings do not match
- ambiguous fuzzy matches remain ambiguous

### Agent tool tests

- valid tool call returns attribute candidate rows
- ambiguous result returns multiple candidates
- empty query is rejected
- missing sample hierarchy returns a clean tool rejection or empty result,
  depending on final contract

### Prompt / session tests

- multi-step request where the agent first resolves `relapse`
- filter action uses the returned `AttributeIdentifier`
- follow-up summary uses the refreshed state

Existing useful references:

- [`agentTools.test.js`](../src/agent/agentTools.test.js)
- [`agentSessionController.test.js`](../src/agent/agentSessionController.test.js)
- [`searchField.test.js`](../../app/src/components/toolbar/searchField.test.js)

## Implementation Order

1. Extract a shared metadata value matcher from `MetadataView`.
2. Refactor `handleVerboseCommand()` to use that matcher with no behavior
   change.
3. Add the new agent tool contract and runtime handler, following the same
   bounded lookup style as `searchViewDatums`.
4. Regenerate generated tool artifacts.
5. Update the system prompt to prefer the new tool for user-mentioned metadata
   values.
6. Add end-to-end agent-session coverage for the relapse-style workflow.

## Risks And Watchouts

- Do not make the tool too fuzzy in V1 or the agent will get noisy matches.
- Do not silently pick the first attribute match in the agent path.
- Keep the helper grounded in current metadata state, not only attribute names
  or static defs.
- Avoid turning `agentAdapter.js` into a large metadata utility module if the
  logic grows beyond a thin source wrapper.
- If Levenshtein is added, keep it bounded and secondary to exact matching so
  common short labels like `M`, `F`, `yes`, and `no` do not produce noisy
  near-matches.

## Recommended Initial Slice

The smallest useful version is:

- exact categorical value matching first
- bounded Levenshtein fallback for minor typos
- current visible sample metadata only
- bounded candidate list
- prompt update telling the agent to use it for unlabeled metadata values

That should solve the concrete `relapse` failure mode without adding much
surface area.

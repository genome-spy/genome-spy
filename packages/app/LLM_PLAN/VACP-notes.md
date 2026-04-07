# VACP Notes

VACP: Visual Analytics Context Protocol (https://arxiv.org/abs/2603.29322)

This note captures the parts of the VACP paper that are most relevant for the
GenomeSpy agent architecture.

## Core Idea

VACP argues that agents should not be given raw pixels or DOM fragments as the
primary interface to a visual analytics application. Instead, the system should
expose:

- semantic state
- available interaction capabilities
- validated execution endpoints

That split matches the direction of the current GenomeSpy agent work.

## Ideas Worth Reusing

- Expose a semantic state graph, not just a structural tree.
- Model interactions as intent-level capabilities, not mouse mechanics.
- Keep execution separate from discovery so actions can be validated against
  the current state snapshot.
- Use stable semantic references so the agent can reason across turns.
- Support scoped reads so the agent can request only a subtree or a filtered
  subset of refs when it does not need the full graph.
- Provide details on demand instead of sending every branch at full depth.
- Keep provenance visible so the agent can reason about what happened and what
  can be undone or extended.
- Use semantic context for planning and visual context only for verification
  when needed.
- Keep the in-page bridge stable across rerenders and view switches.
- Expose interaction parameter types, required/optional fields, and valid
  ranges.
- Reject incompatible action values at the protocol boundary instead of
  silently normalizing them into bad state.

## GenomeSpy Implications

The current agent IR already has the right base shape, but the paper and the
logs suggest a few stronger semantic layers:

- `viewTree` should describe what each branch means, not only how it is nested.
- `selectionDeclarations` should surface the interaction affordances described
  in the paper.
- `actionCatalog` should expose stable identifiers, parameter schemas, and
  optional targets clearly.
- `DataHandle`-style nodes should be the default way to query data on demand
  instead of serializing large tables into the context.
- state should distinguish current values from lightweight summaries.
- collapsed branches should remain discoverable, but compact.
- action execution should fail loudly when the selector or selection is stale.
- selection metadata should expose parameter types, valid ranges, and other
  constraints clearly.
- state and capabilities should be separate reads, with capability discovery
  optionally scoped to the relevant subtree or node kinds.

This is especially important for small models. A smaller model is much more
likely to succeed when the protocol tells it what to send, rather than asking it
to infer the value space from a field name or an axis label.

## What the Logs Show

The demo logs surface a few practical failure modes:

- the agent can identify the right semantic target and still send values in the
  wrong domain
- a bad selection can be accepted and stored as `NaN` instead of being rejected
- a second pass over schema/state can repair the mistake, but only after wasted
  turns

That suggests VACP-style systems should be strict at the boundary:

- validate selection values before applying them
- report the expected representation in the error
- keep a repair loop available, but not as the primary success path

The Seattle weather example is a good case: the agent needed to know that the
interval selection on `x` used a month-based temporal encoding, not a raw ISO
date range. That should be visible in the semantic metadata up front.

The repo also makes the transport shape concrete:

- `vacp_capabilities`, `vacp_state`, and `vacp_execute` are separate contracts
- capability/state reads can be scoped by refs and prefixes
- state updates can return full snapshots or deltas keyed by stable refs
- action descriptors carry names, descriptions, parameter schemas, and optional
  targets

## Local Model Angle

The paper’s design supports local models well because it reduces the need to
infer interface semantics from screenshots or DOM structure. For GenomeSpy, the
same principle means:

- compact tree summaries by default
- on-demand expansion for hidden branches
- explicit semantic metadata for planning
- visual verification only when necessary

For a local on-device model, this explicitness is not optional. The protocol
should assume limited recovery from ambiguity and give the model the minimum
semantic contract needed to plan a correct action on the first try.

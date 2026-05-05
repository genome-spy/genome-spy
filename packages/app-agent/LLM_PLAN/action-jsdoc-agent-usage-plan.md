# Action JSDoc Plan For Agent Use

This plan focuses on improving the existing action-catalog pipeline instead of
adding new metadata prematurely. The current system already provides a useful
split:

- The first sentence of reducer JSDoc becomes the compact action summary.
- The remaining reducer JSDoc is exposed on demand through
  `getActionDetails(...)` as `usage`.
- Payload field documentation is exposed through `payloadFields`.
- Examples can be exposed through the generated action catalog.

The main goal is to make that existing pipeline clearer and more reliable for
agent use.

The descriptions should be grounded in actual behavior verified from the code.
User-facing documentation in `docs/sample-collections/analyzing.md` should also
be used as supporting context, especially for intended semantics and wording,
but reducer and payload JSDoc should ultimately match what the implementation
really does today.

## Why revise the earlier plan

The earlier plan leaned too quickly toward adding new structured tags. After
reviewing the implementation, the bigger opportunity is to improve the quality
of the docs that already flow into the agent catalog:

- The first sentence now carries a lot of weight, so it must be especially
  precise and concise.
- The remaining reducer prose should be written as on-demand agent guidance,
  not generic developer commentary.
- Payload docs are equally important because they tell the agent how to build
  the payload correctly.
- Examples should be the default for exposed actions, not an afterthought.

## Plan

### 1. Use the current split as the baseline

- Treat the first sentence of each reducer JSDoc as the canonical compact
  summary.
- Treat the remaining reducer JSDoc as the on-demand usage guidance returned
  by `getActionDetails`.
- Avoid adding new metadata fields until the documentation audit shows a clear
  need that prose and examples cannot handle cleanly.

### 2. Review action-level JSDoc with extraction rules in mind

- Verify each exposed action against the reducer implementation before editing
  its JSDoc.
- Rewrite the first sentence of each exposed action so it is as descriptive and
  concise as possible.
- Rewrite the remaining reducer paragraphs so they help the agent decide when
  and how to use the action.
- Keep the follow-up prose focused on:
  - when to use the action
  - how to use the action
  - what prior state or step it assumes
  - likely confusion with similar actions
- Cross-check wording with `docs/sample-collections/analyzing.md`, but prefer
  the verified implementation whenever the docs are more general, simplified,
  or incomplete.
- Keep these descriptions compact because they are retrieved on demand.

### 3. Review payload-level JSDoc for agent execution quality

- Audit `packages/app/src/sampleView/state/payloadTypes.d.ts` with an
  agent-execution mindset.
- Verify each payload field against how reducers and helper functions actually
  consume it.
- Tighten field docs where the meaning, expected values, or operational
  constraints are easy to misread.
- Prioritize fields that are likely to cause invalid or misleading payloads,
  especially:
  - optional fields with non-obvious behavior
  - operators and thresholds
  - grouping payloads
  - source-based metadata inputs
  - naming and path semantics

### 4. Make examples the default

- Add a minimal valid example for most exposed actions.
- Skip examples only when the payload is truly trivial and the example would
  add little value.
- Prefer small examples that show the minimum payload needed for success.
- Use examples especially for actions that are easy to misunderstand or encode
  incorrectly.

### 5. Make agent exposure explicit

- Add `@agent.ignore true` to actions that must never be exposed, including
  `setSamples`.
- Review the full exposed surface of `sampleSlice.js` and confirm which actions
  are safe for direct agent use.
- Prefer explicit exposure policy over indirect filtering rules where possible.

### 6. Reassess before adding new structure

- After revising reducer and payload docs, inspect the generated action catalog.
- Confirm whether `description`, `usage`, `payloadFields`, and `examples`
  together are sufficient for agent use.
- Only introduce extra structured tags if the documentation audit still leaves
  recurring ambiguity.

### 7. Add structure only if it solves a real gap

- If prose and examples are still not enough, add only a small amount of
  structured metadata.
- Limit any new structure to decision-support hints rather than creating a
  parallel documentation system.
- Expose any richer guidance through `getActionDetails`, not through the
  always-present compact summaries.

## Recommended next step

The next concrete step should be a documentation audit of:

- `packages/app/src/sampleView/state/sampleSlice.js`
- `packages/app/src/sampleView/state/payloadTypes.d.ts`
- `docs/sample-collections/analyzing.md`

That audit should evaluate both:

- whether the agent would choose the right action
- whether the agent would build the right payload
- whether the action and payload descriptions match verified behavior in code
- whether user-facing terminology stays aligned with `analyzing.md`

Only after that review should the team decide whether additional structured
JSDoc tags are necessary.

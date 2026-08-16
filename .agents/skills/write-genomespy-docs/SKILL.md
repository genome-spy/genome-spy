---
name: write-genomespy-docs
description: Write and verify GenomeSpy user-facing documentation, schema-derived specification docs, and documentation examples. Use for changes in `docs/`, JSDoc in `packages/core/src/spec/*.d.ts`, docs macros, Zensical configuration, or schema/docs generation.
---

# Write GenomeSpy documentation

## Authoring rules

- Before adding documentation, inspect the page outline and read the surrounding
  sections to identify the logical location, required context, and expected
  reading order. Do not place new text merely where it is easiest to append.
- Integrate new material at the page, section, and heading level where readers
  would expect it and where any prerequisite concepts have already been
  introduced.
- After editing, reread the complete affected section and its transitions to the
  preceding and following sections as continuous prose. Reorder or revise nearby
  headings, transitions, or duplicated statements when needed so the addition
  does not disrupt the existing narrative or make it illogical.
- When documenting a feature, focus on its user-facing rationale—the problem it
  solves—its behavior, and representative use cases. Include implementation
  details or internal design rationale only when needed for correct usage.
- Prefer the shortest explanation that gives readers the context they need.
- Use concise, direct language. Remove vague or tentative phrasing unless the
  uncertainty is meaningful.
- Prefer plain statements over analogies or design commentary.
- Use imperative wording such as `Use ...` only for required or strongly
  recommended actions. Present optional approaches as options.
- If a sentence does not help the reader use the feature, shorten or remove it.
- Apply the same rules to user-facing JSDoc in specification `.d.ts` files.

## Specification and schema docs

- Types in `packages/core/src/spec/` compile into the JSON Schema; keep their
  documentation user-facing.
- Put `__Default value:__` at the end of a JSDoc block when documenting a
  default.
- If a new or renamed type is absent from generated documentation, regenerate
  schema/docs artifacts, for example with
  `npm run build && npm run build:docs`.

## Documentation site

- User-facing sources live in `docs/` and use Zensical.
- Site structure is configured in `zensical.toml`.
- `SCHEMA <TypeName>` embeds schema-derived property documentation, for example
  `SCHEMA ExprRef`.
- Do not repeat configuration properties in prose when `SCHEMA` already
  documents them clearly. Use prose for relationships, constraints, workflows,
  and non-obvious semantics. Improve the source specification JSDoc when a
  property's generated documentation needs clarification.
- `EXAMPLE examples/docs/...json` embeds a small, self-contained documentation
  specification.
- Macro implementation lives in
  `utils/markdown_extension/extension/extension.py`.

Use the lightest build or targeted verification that proves the edited source
and any generated artifact remain synchronized.

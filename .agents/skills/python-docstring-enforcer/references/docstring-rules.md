# Docstring Rules

Use these rules together with `utils/agent_server/AGENTS.md`.

## Scope

- Apply these rules only to targeted files under `utils/agent_server/`.
- Prefer changed files or explicit paths over broad scans.

## Private Helpers

- Private helpers should usually have no docstring.
- Keep a private helper docstring only when the behavior is not obvious from the code alone.
- Remove private docstrings that:
  - restate the function name,
  - narrate trivial implementation steps,
  - are lengthy relative to the helper,
  - repeat annotated types,
  - add low-value prose around straightforward logic.

## Public APIs

- Public functions should have docstrings by default.
- Use Google style compatible with `sphinx.ext.napoleon`.
- Do not add sections mechanically.
- Public API docs should follow the local section expectations only when the
  content is supported by the code:
  - Summary
  - Description
  - Args only when the function takes arguments
  - Returns only when the returned value needs semantic explanation beyond the
    annotation and name
  - Raises only for exceptions explicitly raised or intentionally documented as
    part of the public contract
  - Example only when it materially improves usage clarity and can be kept
    correct
- For trivial public functions, a short summary-only docstring is often better
  than a full template.

## Forbidden Patterns

- Lengthy private-helper docstrings
- Docstrings that literally restate the function name
- Empty or boilerplate sections such as `Args:` on zero-argument functions
- `Raises:` sections for exceptions that are not explicitly raised or
  intentionally documented as part of the contract
- `Example:` sections on trivial functions where the example adds no real value
- Type information repeated in `Args:` or `Returns:`
- NumPy-style section headers such as `Parameters` and underlines
- Examples that do not run or are unsupported by local context
- `TODO` or `FIXME` notes in public API docs

## Editing Bias

- Prefer deletion over rewriting for bad private helper docstrings.
- Prefer small corrections over full rewrites for public docstrings.
- Do not invent examples, exceptions, or guarantees that the code does not support.

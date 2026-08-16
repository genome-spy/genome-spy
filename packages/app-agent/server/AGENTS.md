# GenomeSpy Agent Server

The root and `packages/app-agent/AGENTS.md` instructions also apply. Read
`ARCHITECTURE.md` before changing relay responsibilities or module boundaries.

## Working approach

- State material assumptions and tradeoffs before implementing. Ask when an
  ambiguity would materially change the result.
- Implement the minimum requested behavior. Avoid speculative features,
  configuration, abstraction, and impossible-case error handling.
- Make surgical changes: match existing style, avoid unrelated cleanup, and
  remove only imports or code made obsolete by the current change.
- Define verifiable success criteria and run the narrowest checks that prove
  them. For behavior changes and bug fixes, add focused regression coverage.

## Python conventions

- Use Python 3.11 and type hints. Keep strict `mypy` compatibility and prefer
  obviously type-safe code over ignores.
- Use dataclasses or Pydantic models instead of ad hoc dictionaries when a data
  shape matters.
- Prefer the standard library unless a dependency clearly pays for itself.
- Use `pathlib` for filesystem paths and `os` for environment variables or other
  non-path process concerns.
- Prefer functions over single-use classes. Extract only when reuse or subsystem
  structure is real; do not create modules for tiny abstractions.
- Fail fast with clear errors. Do not silently swallow invalid states.
- Prefer explicit imports and concrete module boundaries over re-export magic,
  lazy imports, or indirection.
- Use `ruff` as the formatting and linting source of truth. Keep functions small
  when that improves readability, but do not fragment straightforward flows.
- Do not use mutable defaults, bare `except`, unexplained magic numbers, or
  wildcard imports. Do not assume CPU numeric behavior equals GPU behavior or
  invent APIs, paths, or configuration keys.

## Docstrings

- Use concise Google-style docstrings. Public functions normally need one;
  private helpers need one only for non-obvious behavior.
- Do not duplicate annotation types or add empty boilerplate sections.
- Read `docs/DOCSTRINGS.md` before adding or substantially revising public
  docstrings; it contains the full section rules and examples.

## Testing

- Use `pytest` and keep tests focused, deterministic, and readable.
- Every test should identify the bug it prevents, fail for plausibly wrong code,
  use specific assertions, and leave only intentional edge cases uncovered.
- Report any relevant check that could not be run.

Common checks:

- `uv run --project packages/app-agent/server pytest`
- `uv run --project packages/app-agent/server ruff check .`
- `uv run --project packages/app-agent/server ruff format --check .`
- `uv run --project packages/app-agent/server mypy app`

## Logging and migrations

- Use the centralized Python logger; do not add ad hoc `print()` debugging.
- Changelog generation uses Commitizen and Conventional Commits.
- Migration guides must include side-by-side before/after code, a version
  timeline, an argument-mapping table, and a changelog entry.

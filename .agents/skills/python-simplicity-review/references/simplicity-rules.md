# Simplicity Rules

Use these rules together with `utils/agent_server/AGENTS.md` and `utils/agent_server/EXAMPLES.md`.

## Scope

- Apply these rules only to targeted files under `utils/agent_server/`.
- Prefer changed files or explicit paths over broad scans.
- Keep the relay thin: translate, validate, normalize, and log.

## Design Priorities

- Prefer functions over single-use classes.
- Prefer a little duplication before introducing shared abstractions.
- Avoid speculative configurability or extension points.
- Prefer `pathlib` over `os` for filesystem path handling.
- Use `os` for environment variables or non-path process concerns, not for path
  manipulation.
- Favor readability, predictability, and debuggability over cleverness.
- Make surgical changes only.

## Review Questions

- Would a small function be clearer than this class?
- Does this abstraction solve a real repeated need or a hypothetical future one?
- Does the code add orchestration behavior that the relay should not own?
- Is the direct implementation easier to understand than the abstraction?
- Is filesystem path handling using `os.path` or string concatenation where
  `pathlib` would be clearer?
- Would a senior engineer likely call this overcomplicated for the stated task?

## Editing Bias

- Simplify only when the case is high confidence.
- Report medium-confidence issues instead of forcing a rewrite.
- Avoid broad refactors and adjacent cleanup.

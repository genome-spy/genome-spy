---
name: python-simplicity-review
description: Review or simplify Python code in utils/agent_server after a coding agent has written or edited it. Use when Codex needs to detect repo-specific over-engineering such as single-use classes that should be functions, speculative abstractions, unnecessary configurability, relay-layer scope creep, or changes that conflict with the simplicity, surgical-change, and design rules in utils/agent_server/AGENTS.md and utils/agent_server/EXAMPLES.md. Prefer changed files, user-specified files, or a narrow target path over repo-wide sweeps.
---

# Python Simplicity Review

Use this skill to review or simplify targeted Python files in `utils/agent_server/` after agent-authored edits.

## Workflow

1. Read `utils/agent_server/AGENTS.md`.
2. Read `utils/agent_server/EXAMPLES.md`.
3. Read `references/simplicity-rules.md`.
4. If the task involves class-vs-function judgment or speculative abstraction, read `references/overengineering-signals.md` and `references/examples-map.md`.
5. Limit the scope to:
   - user-specified files,
   - changed files, or
   - a narrow requested path.
6. Separate findings into:
   - high-confidence simplifications,
   - medium-confidence issues to report,
   - low-confidence cases to leave unchanged.

Do not perform a full-repo sweep unless the user explicitly asks for one.

## Review Priorities

Focus on these local rules:

- Prefer functions over single-use classes.
- Avoid classes when a small stateless helper or a couple of functions would be clearer.
- Avoid speculative abstraction and extra configurability.
- Prefer `pathlib` over `os` for filesystem path handling.
- Keep the relay thin.
- Make surgical changes only.
- Prefer readability, predictability, and debuggability over cleverness.
- Prefer explicit module boundaries and imports over clever indirection.
- Treat one-file abstractions and tiny wrapper modules as suspect unless they
  clearly improve structure.

## High-Confidence Simplification Signals

- A class has one public method and little or no meaningful state.
- A class is instantiated once and mostly wraps one operation.
- A class acts as a namespace for helpers that could be module-level functions.
- A layer of configurability or indirection exists without a clear requirement.
- The abstraction is longer and harder to follow than the direct implementation.
- Path handling uses `os.path` or manual path string manipulation where
  `pathlib` would be clearer.
- A package-level re-export, lazy import, or wrapper file hides the real owner
  of functionality without adding meaningful clarity.
- A tiny module exists only to hold one trivial symbol and does not help
  organize a larger subsystem.

## Caution Signals

Do not simplify automatically when:

- state or lifecycle meaningfully matters,
- the abstraction is reused across multiple call sites,
- provider-specific separation is intentional and narrow,
- simplifying would force a wider refactor,
- the code may encode a contract not obvious from the local file.

## Editing Policy

- Auto-fix only high-confidence cases.
- For medium-confidence cases, report the issue and explain the likely simpler shape.
- Do not perform broad refactors.
- Do not rewrite adjacent code that is unrelated to the request.
- Keep diffs minimal and local.

## Output Expectations

When reviewing, report:

- classes that likely should be functions,
- speculative abstractions,
- path handling that should use `pathlib`,
- unnecessary extension points,
- relay scope creep,
- simpler alternatives grounded in the local rules.

When fixing, simplify only the highest-confidence cases and leave concise notes about borderline cases that were intentionally left unchanged.

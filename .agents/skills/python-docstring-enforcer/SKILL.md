---
name: python-docstring-enforcer
description: Enforce the local Python docstring rules for utils/agent_server after a coding agent has written or edited code. Use when Codex needs to review or fix docstrings so they match utils/agent_server/AGENTS.md, especially by removing unnecessary private-helper docstrings, trimming verbose or redundant private docs, and correcting public docstrings toward the local Google/Napoleon format without inventing undocumented behavior. Prefer changed files, user-specified files, or a narrow target path over repo-wide sweeps.
---

# Python Docstring Enforcer

Use this skill to review and fix docstrings in targeted Python files under `utils/agent_server/`.

## Workflow

1. Read `utils/agent_server/AGENTS.md`.
2. Read `references/docstring-rules.md`.
3. If the task is ambiguous or requires examples, read `utils/agent_server/EXAMPLES.md` and `references/docstring-patterns.md`.
4. Limit the scope to:
   - user-specified files,
   - changed files, or
   - a narrow requested path.
5. Classify each touched function or class as public or private before editing.
6. Apply the docstring rules with a strong bias toward minimal diffs.

Do not perform a full-repo sweep unless the user explicitly asks for one.

## Enforcement Priorities

- Remove private helper docstrings that are unnecessary.
- Remove private helper docstrings that restate the function name or narrate obvious code.
- Keep a private helper docstring only when the behavior is genuinely non-obvious from code alone.
- When a private helper docstring is warranted, prefer a short summary that
  improves scanability.
- Keep public docstrings compatible with Google style via Napoleon.
- Normalize malformed public docstrings only when the needed content can be written confidently from local context.
- Do not add sections mechanically.
- Include `Args:` only when the function takes arguments.
- Include `Returns:` only when the return semantics are not obvious from the
  name and annotation alone.
- Include `Raises:` only when the function explicitly raises an exception, or
  when a specific exception contract is intentionally part of the public API.
- Include `Example:` only when it materially helps usage and can be made
  correct from local context.
- Prefer a short summary-only docstring for trivial public functions.
- Avoid repeating types already present in annotations.
- Treat doctest examples as required only when they can be made correct from the code and surrounding context.

## Editing Policy

- Prefer deleting a bad private docstring over rewriting it.
- Prefer a small correction over a full rewrite.
- Do not invent behavior, exceptions, examples, guarantees, or edge cases.
- Do not refactor code just to make a docstring cleaner.
- Do not touch unrelated formatting or adjacent code.

## Review Checklist

For private helpers, ask:

- Is the behavior obvious from the function body and name?
- Would a one-line summary materially improve scanability for this helper?
- Does the docstring merely repeat the name or parameters?
- Is the docstring longer than the helper needs?
- Does it repeat annotated types?

For public functions, ask:

- Is a docstring needed here under the local rules? Usually yes, but keep it
  minimal when the function is trivial.
- Is the docstring in Google/Napoleon style?
- Does it avoid repeating annotated types?
- Does it include `Args:` only when arguments exist?
- Does it include `Returns:` only when the return value needs semantic
  explanation beyond the annotation and name?
- Does it include `Raises:` only for explicit or intentionally documented
  exception behavior?
- Does it include `Example:` only when the example adds real value?
- Would adding a missing section require guessing or boilerplate? If so, leave
  it out or report the gap instead of inventing content.
- Would a shorter docstring communicate the same thing more clearly?

## Output Expectations

When reviewing without editing, report:

- unnecessary private docstrings,
- verbose private docstrings,
- malformed public docstrings,
- repeated type information,
- examples that appear non-runnable or unsupported by local context.

When fixing, make the smallest compliant edits and then suggest the narrowest relevant checks.

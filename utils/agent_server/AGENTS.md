# GenomeSpy Agent Server

This directory contains the Python relay that sits between the GenomeSpy app
and an OpenAI-compatible model server. This file defines local coding
conventions and LLM-agent expectations for work inside `utils/agent_server/`.

The repo-root `AGENTS.md` still applies. This file adds Python-specific rules
and tighter implementation preferences for the relay.

## General LLM instructions

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them. Don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
  simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it. Don't delete it.

When your changes create orphans:

- Remove imports, variables, and functions that your changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]

Strong success criteria let you loop independently. Weak criteria such as
"make it work" require constant clarification.

See [`EXAMPLES.md`](./EXAMPLES.md), which contains concrete examples of
what LLMs should avoid doing and what they should do instead. Treat that file
as a companion guide to the principles below.

## Scope and design priorities

- Keep the relay thin. It should translate, validate, normalize, and log. It
  should not grow into a large orchestration layer.
- Prefer provider-neutral prompt assembly and narrow provider-specific shims.
- Optimize for readability, predictability, and debuggability over cleverness.
- Group code by responsibility, not by whether it is a "helper" or by when it
  was added.
- Keep orchestration modules shallow. Move dense parsing, streaming, logging,
  or formatting mechanics behind focused modules when that makes the top-level
  flow easier to scan.
- Developer tooling is welcome when it stays small and directly supports relay
  work.

## Python coding conventions

- Always use type hints.
- Keep `mypy` compatibility in mind while writing code. Prefer code that is
  obviously type-safe over code that requires type-ignore escapes.
- Use Python 3.11 features when they simplify the code clearly.
- Prefer dataclasses or Pydantic models for structured data over ad hoc dict
  protocols when the shape matters.
- Prefer standard-library solutions unless an extra dependency clearly pays for
  itself.
- Prefer `pathlib` over `os` when working with filesystem paths.
- Use `os` for environment variables or non-path process concerns, not for path
  manipulation.
- Prefer functions over single-use classes.
- Do not introduce a class when a small stateless helper or a couple of
  functions would solve the problem more clearly.
- Fail fast with clear error messages. Do not silently swallow invalid states.
- Avoid speculative abstraction. Duplicate a little first; extract only when
  the reuse is real.
- Prefer explicit imports and module boundaries over clever re-export,
  indirection, or lazy-import tricks.
- Do not create a separate module for a tiny abstraction unless it improves the
  structure of a real subsystem.

## Docstrings

- Google style via sphinx.ext.napoleon.
- Public functions should have docstrings by default.
- Private helpers should have docstrings only when their behavior is not
  obvious from the code alone.
- Prefer the smallest docstring that captures useful behavior. Do not add
  sections mechanically.
- Public docstrings should use this structure:
  1. Summary     — one-line, imperative verb: "Compute", "Return", "Validate"
  2. Description — algorithm, assumptions, or non-obvious behavior; omit for
     trivial functions
- Optional public-doc sections:
  - Args     — include only when the function takes arguments; description only
    (no types)
  - Returns  — include when the return semantics are not obvious from the name
    and annotation alone
  - Raises   — include only for exceptions the function explicitly raises, or
    for a deliberate public exception contract the reader needs to know
  - Example  — include only when it materially helps usage and can be kept
    correct and executable; omit for trivial functions
- Forbidden:
  - Empty or boilerplate sections such as `Args:` on zero-argument functions
  - `Raises:` sections for exceptions that are not explicitly raised or
    intentionally documented as part of the function contract
  - `Example:` sections on trivial functions where the example adds no real
    value
  - Lengthy private-helper docstrings
  - Docstring that literally repeats the function name ("get_value: Gets the value")
  - Examples that don't run or produce wrong output
  - TODO / FIXME in public API docs
  - Type repeated in docstring when annotation already covers it (e.g., "arg (int):" or "Returns: torch.Tensor")
  - NumPy-style "Parameters\n----------" — use Google/Napoleon "Args:" instead

Example:

```python
def build_context_text(context: dict[str, object]) -> str:
    """Build the serialized GenomeSpy context snapshot for the prompt.

    Removes fields that should not be injected into model-facing prompt context
    and returns the remaining snapshot in the relay's standard text format.

    Args:
        context: Raw agent-turn context payload from the browser client.

    Returns:
        Prompt-ready context text prefixed with the standard snapshot header.

    Raises:
        ValueError: If the context payload cannot be serialized to JSON.

    Example:
        >>> build_context_text(
        ...     {
        ...         "schemaVersion": 1,
        ...         "toolCatalog": [{"name": "expandViewNode"}],
        ...         "viewRoot": {"title": "Example"},
        ...     }
        ... )
        'Current GenomeSpy context snapshot:\\n{\\n  "schemaVersion": 1,\\n  "viewRoot": {\\n    "title": "Example"\\n  }\\n}'
    """
```

For a trivial zero-argument function, prefer a short docstring without
boilerplate sections:

```python
def load_default_system_prompt() -> str:
    """Load the bundled default system prompt text."""
```

## Style and formatting

- Use `ruff` as the source of truth for formatting and linting style.
- Keep functions small when practical, but do not split code into tiny helpers
  unless it improves readability.
- Forbidden:
  - Mutable default arguments
  - Bare except: without exception type
  - Magic numbers without named constants
  - import * in library code
  - Assuming CPU numeric behavior equals GPU
  - Any hallucinated API, file path, or config key

## Testing expectations

- Use `pytest`.
- Add or update tests for behavior changes and bug fixes.
- Prefer focused unit tests close to the affected behavior.
- Keep tests deterministic and readable.

Every test must pass the Suspicious Check:

- What specific bug does this test prevent?
- Could it pass with plausibly wrong code?
- What edge cases remain?
- Are assertions specific enough to catch subtle errors?

## Validation and local checks

Before finishing work in this directory, run the narrowest relevant checks you
can.

Common checks:

- `uv run --project utils/agent_server pytest`
- `uv run --project utils/agent_server ruff check .`
- `uv run --project utils/agent_server ruff format --check .`
- `uv run --project utils/agent_server mypy app`

Prefer targeted test runs when they cover the change well. If you could not run
the relevant checks, say so explicitly.

## File and module guidance

- Keep request and response schema changes aligned across `models.py`,
  `prompt_builder.py`, `providers.py`, and `main.py`.
- Reuse existing prompt-building helpers instead of rebuilding prompt pieces in
  multiple places.
- Keep provider-specific compatibility logic narrow, explicit, and tested.
- When a subsystem grows several closely related modules, prefer a focused
  package with clear ownership over a flat set of vaguely named files.
- Prefer direct imports from concrete modules when that makes ownership
  clearer; avoid package-level magic that hides where a symbol actually lives.
- Avoid adding new HTTP endpoints unless they are clearly needed.
- If a debugging feature can live as an internal helper instead of an API
  surface, prefer the helper first.

## Logging and diagnostics

- Use the centralized Python logger. Do not add ad hoc `print()` debugging.

## CHANGELOG
- commitizen (conventional commits, automated)
Migration guides must include: before/after code side-by-side,
version timeline, argument mapping table, CHANGELOG entry.

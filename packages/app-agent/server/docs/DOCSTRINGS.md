# Python Docstring Guide

Use Google style through `sphinx.ext.napoleon`.

## Public functions

Public functions should normally have docstrings with only the sections their
contract needs:

1. Start with a one-line imperative summary such as `Compute`, `Return`, or
   `Validate`.
2. Add a description only for a non-obvious algorithm, assumption, or behavior.
3. Add `Args:` only when the function takes arguments. Describe semantics
   without repeating annotation types.
4. Add `Returns:` when the return semantics are not clear from the function name
   and annotation.
5. Add `Raises:` only for explicitly raised exceptions or a deliberate public
   exception contract.
6. Add `Example:` only when it materially helps usage and can remain correct and
   executable.

Do not add empty sections, lengthy private-helper docstrings, examples to
trivial functions, TODO/FIXME markers in public API docs, or NumPy-style
`Parameters` sections. Do not merely repeat the function name.

## Full example

```python
import json


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
        >>> build_context_text({"schemaVersion": 1, "viewRoot": {}})
        'Current GenomeSpy context snapshot:\\n{\\n  "schemaVersion": 1,\\n  "viewRoot": {}\\n}'
    """
    try:
        payload = json.dumps(context, indent=2, ensure_ascii=False)
    except (TypeError, ValueError) as error:
        raise ValueError("Context must be JSON serializable") from error

    return "Current GenomeSpy context snapshot:\n" + payload
```

For a trivial zero-argument function, omit boilerplate:

```python
def load_default_system_prompt() -> str:
    """Load the bundled default system prompt text."""
```

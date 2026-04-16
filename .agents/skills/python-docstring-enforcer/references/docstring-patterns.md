# Docstring Patterns

Use these examples to decide whether to delete, trim, or rewrite a docstring.

## Remove Redundant Private Docstrings

Bad:

```python
def _load_config(path: str) -> Config:
    """Load the config from the provided path."""
```

Why:

- Repeats the function name
- Adds no behavior the code does not already express

Preferred:

```python
def _load_config(path: str) -> Config:
```

## Remove Lengthy Private Helper Narration

Bad:

```python
def _normalize_payload(payload: dict[str, object]) -> dict[str, object]:
    """Normalize the incoming payload before returning it.

    This helper takes the payload, loops through the keys, removes empty
    values, and then returns the final cleaned payload so the caller can
    continue processing in the endpoint.
    """
```

Why:

- Too long for a private helper
- Mostly narrates obvious steps

Preferred:

- Delete the docstring unless the helper contains a non-obvious contract.

## Keep Non-Obvious Private Helper Docs Brief

Acceptable:

```python
def _trim_prompt(messages: list[str], limit: int) -> list[str]:
    """Drop oldest assistant turns first to preserve recent user intent."""
```

Why:

- Captures a non-obvious policy choice
- Short and specific

## Avoid Type Repetition in Public Docs

Bad:

```python
def build_prompt(context: dict[str, object]) -> str:
    """Build the prompt.

    Args:
        context (dict[str, object]): Context payload.

    Returns:
        str: Prompt text.
    """
```

Preferred:

```python
def build_prompt(context: dict[str, object]) -> str:
    """Build the prompt.

    Args:
        context: Context payload.

    Returns:
        Prompt text ready for the provider request.
    """
```

## Omit Boilerplate Sections On Trivial Public Functions

Bad:

```python
def load_default_system_prompt() -> str:
    """Load the bundled default system prompt text.

    Args:
        None.

    Raises:
        None.

    Example:
        >>> isinstance(load_default_system_prompt(), str)
        True
    """
```

Why:

- `Args:` adds no value for a zero-argument function
- `Raises:` should not appear when the docstring is not documenting an explicit
  exception contract
- `Example:` is unnecessary for a trivial function returning a string

Preferred:

```python
def load_default_system_prompt() -> str:
    """Load the bundled default system prompt text."""
```

## Keep `Raises:` Only For Explicit Contracts

Bad:

```python
def health() -> dict[str, str]:
    """Return the relay health status.

    Raises:
        RuntimeError: If the relay is unhealthy.
    """
```

Why:

- The function does not explicitly raise that exception
- The docstring invents a contract not supported by the implementation

Preferred:

- Remove the `Raises:` section unless the function explicitly raises or
  intentionally documents a public exception contract.

# Overengineering Signals

Use these signals to identify code that likely violates the local simplicity rules.

## Classes That Likely Should Be Functions

Strong signals:

- The class has one public method.
- The class stores no meaningful state beyond constructor arguments that could be function parameters.
- The class is instantiated once at the call site.
- The class exists only to wrap a single operation.
- The class behaves like a namespace for helper methods.

Typical simplification:

- Replace the class with one function, or
- replace it with one public function plus a small private helper.

## Speculative Abstractions

Watch for:

- strategy or plugin patterns with one concrete implementation,
- manager or service classes with narrow local scope,
- extra flags, hooks, or configuration knobs that were not requested,
- indirection that makes the main path harder to read without paying for itself.

## Path Handling Smells

Watch for:

- `os.path.join`, `os.path.dirname`, or similar path manipulation in new code,
- manual string concatenation for filesystem paths,
- path handling split across strings where a `Path` object would be clearer.

Typical simplification:

- Replace path manipulation with `pathlib.Path` operations,
- keep `os` usage limited to environment variables or non-path process APIs.

## Scope Creep

Watch for relay code that starts owning:

- orchestration beyond request translation and validation,
- provider-specific behavior in otherwise shared logic,
- debugging surfaces that should remain internal helpers,
- new endpoints or layers without a clear need.

## Do Not Auto-Simplify When

- the abstraction has multiple real call sites,
- state or lifecycle behavior is important,
- the simplification would force a wider redesign,
- the local file does not provide enough context to be confident.

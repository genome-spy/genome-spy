# Module Placement Signals

Use these signals to decide whether code is in the wrong file.

## Strong Move Signals

- A helper in `main.py` is only used for token-debugging.
- A helper in `main.py` is only used for provider logging or response formatting.
- A group of helpers clearly supports prompt construction but lives outside the prompt module.
- A helper's only callers are in another subsystem module.
- Related constants, helpers, and types are split across unrelated files without a good reason.

## Acceptable To Leave In Place

- The helper is tightly coupled to application startup or request wiring.
- The helper is local glue that would become less readable if moved out.
- The current file is already the clearest owner of the concern.
- Moving the code would split one small local workflow across multiple modules.

## Prefer Cluster Moves

Prefer moving:

- a helper with its sibling helpers,
- a helper plus related constants or types,
- a small subsystem cluster,

instead of moving:

- one stray function while its related logic remains behind.

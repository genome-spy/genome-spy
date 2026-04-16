# Import Safety Checklist

Treat import safety as part of the refactor, not as cleanup after the move.

## Before Moving Code

- Identify the target module that should own the behavior.
- Check whether the target already imports the source module.
- Check whether moving the code would create a circular import.
- Check whether the code relies on local constants, types, or helpers that must move with it.

## During The Move

- Move the smallest cohesive unit that fully belongs elsewhere.
- Update imports at every call site.
- Update internal references in the moved code.
- Update tests or fixtures that import the old location.

## After The Move

- Confirm there are no stale imports in the source module.
- Confirm there are no unresolved names in the target module.
- Run narrow checks after the change.
- If the move would force broad package-level changes, stop and report instead of pushing through.

# Cohesion Rules

Use these rules together with `utils/agent_server/AGENTS.md`.

## Scope

- Apply these rules only to targeted files under `utils/agent_server/`.
- Prefer changed files or explicit paths over broad scans.
- Keep entrypoint modules thin.

## Placement Principles

- Group code by responsibility, not by when it was added.
- Keep support logic near the subsystem it supports.
- Prefer one obvious owning module over convenience placement in the file already being edited.
- Keep token-related helpers with token-related code.
- Keep provider parsing, formatting, and provider-specific logging near provider code.
- Keep prompt-building helpers near prompt-building code.

## Moving Code

- Prefer moving a cohesive cluster over a single leaf helper.
- Move code only when the destination module is clearly better.
- Update imports and call sites as part of the same change.
- Avoid creating tiny new modules for one-off cleanup.

## Entrypoint Rule

- `main.py` and similar entrypoints should primarily own wiring, request flow, and application startup.
- If support helpers in an entrypoint belong to another subsystem, move them unless they are truly entrypoint-specific.

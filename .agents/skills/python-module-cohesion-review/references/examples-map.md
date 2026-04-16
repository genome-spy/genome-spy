# Examples Map

Use `utils/agent_server/AGENTS.md` and local repo history as the main source of truth.

## Relevant Local Principles

- `Keep the relay thin`
  - Use when entrypoint files accumulate subsystem-specific support helpers.
- `Surgical Changes`
  - Use when deciding whether a move is worth the churn.
- `Simplicity First`
  - Use when choosing between keeping a local helper and creating a new module.

## Repo-Specific Examples To Watch For

- Token or token-debugging helpers ending up in `main.py`
- Logging helpers added to request or entrypoint files instead of the owning subsystem
- Provider-specific parsing or formatting helpers living outside provider code
- Prompt-construction helpers split away from the prompt builder module

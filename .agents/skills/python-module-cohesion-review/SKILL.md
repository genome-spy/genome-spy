---
name: python-module-cohesion-review
description: Review targeted Python code in utils/agent_server for module-placement and cohesion problems after a coding agent has written or edited code. Use when related helpers or subsystem logic have been added to the wrong file, especially when main.py or another entrypoint accumulates token, logging, parsing, formatting, or other support logic that belongs in a more focused module. When fixing, move cohesive code clusters surgically, keep related functionality together, and update imports and call sites safely. Prefer changed files, user-specified files, or a narrow target path over repo-wide sweeps.
---

# Python Module Cohesion Review

Use this skill to review or fix module-placement problems in targeted Python files under `utils/agent_server/`.

## Non-Goals

This skill is not for:

- generic refactoring,
- docstring cleanup,
- lint-only cleanup,
- class-vs-function review unless module placement is the main problem,
- broad architecture redesign.

Use `python-docstring-enforcer` for docstrings and `python-simplicity-review` for over-engineering.

## Workflow

1. Read `utils/agent_server/AGENTS.md`.
2. Read `references/cohesion-rules.md`.
3. If the task is ambiguous, also read:
   - `references/module-placement-signals.md`
   - `references/import-safety-checklist.md`
   - `references/examples-map.md`
4. Limit scope to:
   - user-specified files,
   - changed files, or
   - a narrow requested path.
5. Identify cohesive concern clusters and their likely owning module.
6. Decide whether the code is misplaced or acceptably local.
7. Move code only when the destination module is obvious and import risk is manageable.
8. Update imports, references, and nearby tests together with the move.

Do not perform a full-repo sweep unless the user explicitly asks for one.

## Review Priorities

Focus on these local rules:

- Keep entrypoint modules like `main.py` thin.
- Group code by responsibility, not by the timing of implementation.
- Keep support logic near the subsystem it supports.
- Prefer moving cohesive clusters over isolated leaf helpers.
- Keep refactors surgical and easy to follow.

## High-Confidence Signals

- `main.py` contains helpers that belong entirely to token, logging, prompt, or provider support.
- Multiple functions for one concern are split across unrelated modules.
- A helper's only callers live in another subsystem module.
- A support concern was appended to an entrypoint file instead of its owning module.
- Path, parsing, formatting, or logging helpers are mixed into a module that mainly owns request flow.

## Caution Signals

Do not auto-move code when:

- the destination module is ambiguous,
- moving one helper would leave half of the concern behind,
- the move may create a circular import,
- the move would force a wider package redesign,
- the current file is ugly but still the clearest owner of the behavior.

## Editing Policy

- Auto-fix only high-confidence moves.
- Prefer moving the smallest cohesive unit that fully belongs elsewhere.
- Do not create a new module unless there is a real cluster with a clear name and stable responsibility.
- Update imports and call sites as part of the same change.
- Do not perform unrelated cleanup while moving code.

## Output Expectations

When reviewing, report:

- code that belongs in another module,
- entrypoint files that have accumulated subsystem-specific helpers,
- concern clusters that are split across unrelated modules,
- import or circular-dependency risks that make a move unsafe.

When fixing, move only the clearest cases, update imports safely, and note any borderline cases that were intentionally left unchanged.

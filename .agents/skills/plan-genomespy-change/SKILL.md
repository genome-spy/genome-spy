---
name: plan-genomespy-change
description: Create, revise, reconcile, or retire GenomeSpy design proposals and implementation plans. Use when the user asks for a design, architecture proposal, migration plan, implementation plan, or work on plan files under `plans/`; do not use for a brief conversational plan for a routine edit.
---

# Plan a GenomeSpy change

1. Study the current implementation and start at `ARCHITECTURE.md`. Follow only
   the subsystem references relevant to the proposed change.
2. When designing a feature or architecture, study comparable established
   projects. Prefer proven patterns when they fit GenomeSpy and document the
   tradeoffs when a custom design is better.
3. Verify license compatibility before copying or closely adapting code.
   Preserve provenance in the proposal and nearby code comments with wording
   such as `Adapted from ...` or `Based on the design of ...`, a durable source
   link, and any required copyright or license notice.
4. Put a requested proposal at
   `plans/<feature-name>/<feature-name>-plan.md`. Split a large proposal into
   focused files in the same directory.
5. Ground the proposal in current files, types, and architectural constraints.
6. State goals, non-goals, key decisions, alternatives considered, risks,
   unresolved questions, and acceptance criteria.
7. Divide implementation into independently reviewable steps. For each step,
   include:

   - Intended outcome
   - Affected areas
   - Verification
   - Documentation or migration work
   - A tentative Conventional Commit message

Keep design documents about the current or intended design. Mention discarded
approaches only when their rationale helps explain the selected design.

## Retire the plan

- Treat files under `plans/` as temporary working artifacts.
- Before deleting a plan, review every incomplete task. Complete it or explicitly
  mark it as discarded in the plan.
- Commit the reconciled plan so completed and discarded tasks remain in Git
  history. Only then delete the plan in a later commit.
- Delete the plan files before creating a PR. If a PR already exists, delete
  them before merge. Do not merge temporary plan files.

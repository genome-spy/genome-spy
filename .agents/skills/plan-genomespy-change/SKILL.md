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
7. Divide implementation into coherent milestones that produce meaningful,
   verifiable outcomes. Do not create separate steps solely for measurements,
   plan updates, minor tests, or review fixes unless they materially change
   scope or risk. For each milestone, include:

   - Intended outcome
   - Affected areas and downstream consumers
   - Verification, including cross-subsystem or cross-backend compatibility
     where shared contracts are involved
   - Documentation or migration work
   - A tentative Conventional Commit message
8. Add final integration verification for changes that cross milestone
   boundaries or span multiple subsystems or renderers. Name representative
   real examples and interactions that isolated unit tests cannot cover.

Keep design documents about the current or intended design. Mention discarded
approaches only when their rationale helps explain the selected design.

## Review and commit strategy

- Define review gates around risk boundaries, not every numbered milestone.
  Normally review shared contracts, architecture, public APIs, persistent
  state, performance-critical changes with meaningful complexity, and the
  final integration of a cross-cutting project.
- Combine adjacent low-risk milestones into one review. Do not require separate
  reviews for measurements, plan wording, documentation-only updates, or
  trivial review fixes.
- Do not require a subagent review after every step. When independent reviews
  are requested, use them for substantial milestones and final integration.
- Ask reviewers to inspect downstream consumers and interactions, not only the
  local diff. Shared mark or encoding changes, for example, must consider every
  applicable renderer, picking path, and export path.
- By default, implement and verify a coherent milestone, review it, apply
  worthwhile correctness and KISS fixes, verify again, and create one clean
  commit. Use separate review-fix commits only when explicitly requested or
  when the fix is independently meaningful.
- Re-review a fix only when it materially changes behavior, architecture, or
  risk. Do not create recursive review gates for wording or small test
  improvements.

## Retire the plan

- Treat files under `plans/` as temporary working artifacts.
- Before deleting a plan, review every incomplete task. Complete it or explicitly
  mark it as discarded in the plan.
- Commit the reconciled plan so completed and discarded tasks remain in Git
  history. Only then delete the plan in a later commit.
- Delete the plan files before creating a PR. If a PR already exists, delete
  them before merge. Do not merge temporary plan files.

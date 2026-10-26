---
name: plan-genomespy-change
description: Create, revise, reconcile, or retire GenomeSpy design proposals and implementation plans. Use before implementing a substantial new feature or when the user asks for a design, architecture proposal, migration plan, implementation plan, or work on plan files under `plans/`; do not use for a brief conversational plan for a routine edit.
---

# Plan a GenomeSpy change

Always create or update a written plan before implementing a substantial new
feature, even when the user has not explicitly asked for a plan.

For implementation work, use the
[delivery workflow](../prepare-genomespy-change/SKILL.md#choose-the-delivery-workflow).

## Write the plan

1. Study the current implementation and start at `ARCHITECTURE.md`. Follow only
   the subsystem references relevant to the proposed change.
2. When designing a feature or architecture, study comparable established
   projects. Prefer proven patterns when they fit GenomeSpy and document the
   tradeoffs when a custom design is better.
3. Verify license compatibility before copying or closely adapting code.
   Preserve provenance in the proposal and nearby code comments with wording
   such as `Adapted from ...` or `Based on the design of ...`, a durable source
   link, and any required copyright or license notice.
4. Put the plan at `plans/<feature-name>/<feature-name>-plan.md`. Split a large
   proposal into focused files in the same directory.
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

## Review the plan

- When the user explicitly requests a plan, do not review it automatically,
  even for a substantial feature. Review it only when the user asks; otherwise,
  gently offer a subagent review when delivering the plan.
- Otherwise, have an independent subagent review plans for substantial new
  features before implementation and address worthwhile findings.

## Implementation review and commits

Apply this strategy when implementation and commits are authorized.

- Define review gates around risk boundaries: shared contracts, architecture,
  public APIs, persistent state, complex performance-critical paths, and final
  integration. Combine adjacent low-risk milestones; avoid separate reviews
  for measurements, wording, documentation-only updates, or trivial fixes.
- When independent implementation reviews are requested, use them for
  substantial milestones and final integration, not every step.
- Ask reviewers to inspect downstream consumers and interactions, not only the
  local diff. Shared mark or encoding changes, for example, must consider every
  applicable renderer, picking path, and export path.
- By default, implement and verify a coherent milestone, review it, apply
  worthwhile correctness and KISS fixes, verify again, and create one clean
  commit. Use separate review-fix commits only when explicitly requested or
  when the fix is independently meaningful.
- Re-review fixes only when they materially change behavior, architecture, or
  risk.

## Retire the plan

- Plans are temporary working artifacts. Retain and update them in draft PRs
  for discussion; unfinished tasks and open questions are expected.
- Before deleting a plan, review every incomplete task. Complete it or explicitly
  mark it as discarded in the plan.
- For direct commits to `master` or `main`, exclude temporary plans from
  every commit and do not create separate plan-retirement commits. Reconcile
  and remove the task's temporary plan before staging the deliverable; leave
  unrelated plans alone.
- For branch/PR work, commit the reconciled plan so completed and discarded
  tasks remain in branch history, then delete it in a later commit before
  merge. Never merge temporary plan files.

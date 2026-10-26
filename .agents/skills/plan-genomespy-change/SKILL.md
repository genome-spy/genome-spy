---
name: plan-genomespy-change
description: Plan and check architectural fit for GenomeSpy changes before implementation or design revisions. Create, review or retire written plans for substantial features and requested proposals.
---

# Plan a GenomeSpy change

Check architectural fit before implementing or revising a PR's design. For routine
fixes and docs, a few sentences in existing notes suffice. Substantial features
need a written plan before implementation. A request for a plan does not authorize
implementation. Use [prepare-genomespy-change](../prepare-genomespy-change/SKILL.md)
for delivery mechanics.

## Check architectural fit

- Read `ARCHITECTURE.md`, applicable package instructions and current linked
  issues/reviews. Understand the package responsibility map, then trace affected
  paths in depth; distinguish agreed requirements from a PoC or open proposal.
- Identify the native contract and owning subsystem. Trace relevant grammar,
  normalization, state, scopes/scales, renderers, interaction, API and persistence.
  Keep value identity, dependency/resource ownership and disposal consistent.
- Prefer extending existing semantics over parallel vocabulary, state, expressions
  or rendering paths. Reusing helpers alone does not prove architectural fit.
  Generalize across supported uses without inventing speculative frameworks.
- Record the owner, reuse decision, affected consumers and compatibility impact
  with source references. For behavior changes, name a composed or neighboring case
  beyond the demo and how it verifies required backends, inputs and semantics.
- Choose the smallest coherent PR. Split reusable foundations from UI consumers
  when independently useful; do not shrink a diff by moving engine logic into
  specs or omitting required consumers.

## Write the plan

Put it at `plans/<feature-name>/<feature-name>-plan.md`, splitting only when useful.
Reuse the architecture findings; state goals, non-goals, decisions, alternatives,
risks, open questions and acceptance criteria grounded in current files/types.
Study established designs where relevant. Before copying/adapting code, verify
license compatibility and retain durable provenance and required notices.

Organize meaningful milestones with outcomes, affected consumers, verification,
docs/migration work and tentative Conventional Commit messages. Include final
integration checks using representative examples and interactions across affected
subsystems/backends. Do not create milestones solely for minor tests, measurements
or bookkeeping. Mention discarded approaches only to explain a design choice.

## Review and implementation

- For an explicitly requested plan, offer independent review; do not run it unless
  asked. Otherwise, obtain independent review before implementing substantial
  features and address worthwhile findings.
- Review at architectural/public API/persistent-state/performance boundaries and
  final integration. Check downstream consumers, applicable renderers, picking and
  export; challenge the chosen abstraction before polishing its implementation.
- When implementation is authorized, verify each coherent milestone, review it,
  fix worthwhile findings, verify again and commit. Independent implementation
  reviews, when requested, belong at substantial boundaries rather than every edit.
  Re-review fixes only when behavior, architecture or risk changes materially.

## Retire the plan

Keep active plans updated in draft PRs. Complete or explicitly discard every
remaining task before removal. On a feature branch, commit the reconciled plan,
then delete it in a later commit before merge. For direct master/main delivery,
reconcile/remove it before staging; exclude temporary plans from every commit and
make no separate retirement commit. Leave unrelated plans alone.

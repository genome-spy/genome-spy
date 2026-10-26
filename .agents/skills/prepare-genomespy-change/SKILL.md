---
name: prepare-genomespy-change
description: Prepare GenomeSpy commits and pull requests for delivery. Use when the user asks to commit, propose or fix a commit message, organize commits, inspect changes for delivery, create or finalize a pull request, prepare a branch for merge, or draft PR titles and notes.
---

# Prepare a GenomeSpy change

## Choose the delivery workflow

- Use a feature branch and PR for non-trivial features and fixes unless the
  user explicitly chooses another route. Direct commits to `master` or
  `main` are suitable for small, clearly scoped changes.
- If unsure which route is appropriate, ask before proceeding. Do not infer
  that a change should go directly to `master` just because it is checked out.

## Inspect the change

- Inspect the exact diff the message describes: staged changes for a commit,
  working-tree changes for an uncommitted proposal, or the branch diff for a PR.
- Base the message on everything included, not only the latest edits.
- Verify required plans and reviews using
  [plan-genomespy-change](../plan-genomespy-change/SKILL.md).
- Keep commits focused. Casual intermediate commits are acceptable on feature
  branches when the user wants them.

## Record release impact

Use [write-genomespy-changeset](../write-genomespy-changeset/SKILL.md) before
committing a complete change or preparing a PR. It defines release-impact
assessment, fragment reuse, and required delivery checks. Versioning and
publishing follow the [release workflow](../../../CONTRIBUTING.md#releases).

## Write commits

- Follow Conventional Commits: `<type>: <subject>` or
  `<type>(<scope>): <subject>`.
- Keep every header, body, and footer line at most 100 characters. Check line
  lengths before committing.
- Scopes are optional and can generally be omitted on feature branches. Add the
  monorepo package name, such as `core` or `app`, when it clarifies the change.
- Reserve `feat` and `fix` mainly for user-facing features and bug fixes.
- Reserve `docs` for user-facing documentation that should appear in generated
  changelogs. Use `chore` for internal documentation, including agent
  instructions and architecture maintenance.
- Use `build` for dependencies, package metadata, release tooling, and other
  build-system changes.
- Include a brief body explaining the rationale and important details beyond
  the title. Avoid restating the title or enumerating files. Omit the body only
  for genuinely trivial, self-explanatory commits.

## Retire implementation plans

Follow the [plan retirement workflow](../plan-genomespy-change/SKILL.md#retire-the-plan)
for draft PRs, direct commits, and pre-merge cleanup.

## Draft pull request metadata

- Use a Conventional Commit-style PR title and Markdown notes.
- Do not hard-wrap prose in PR notes. Keep each paragraph on one source line and
  let GitHub wrap it when rendering HTML. Use line breaks only for Markdown
  structure, such as paragraphs, lists, headings, and code blocks.
- Establish the rationale from the task, linked issue, plan, documentation,
  and diff. Explain the concrete problem or opportunity, its practical effect,
  and the affected audience. Ask for missing context instead of inventing it.
- Open with a self-contained explanation of the problem before the solution,
  including important compatibility or rollout boundaries. Lead with user
  impact for features and fixes, and engineering or maintenance benefits for
  internal changes. For mixed changes, put the user-visible reason first.
- For draft PRs, distinguish proposed and implemented work, link to the active
  plan when present, and identify open questions.
- Follow with concise key points, verification, and any remaining operational
  follow-ups. Omit minor implementation details.

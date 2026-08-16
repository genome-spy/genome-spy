---
name: prepare-genomespy-change
description: Prepare GenomeSpy commits and pull requests for delivery. Use when the user asks to commit, propose or fix a commit message, organize commits, inspect changes for delivery, create or finalize a pull request, prepare a branch for merge, or draft PR titles and notes.
---

# Prepare a GenomeSpy change

## Inspect the change

- Inspect the exact diff the message describes: staged changes for a commit,
  working-tree changes for an uncommitted proposal, or the branch diff for a PR.
- Base the message on everything included, not only the latest edits.
- Keep commits focused. On feature branches, casual intermediate commits and an
  omitted scope are acceptable when the user wants them.

## Write commits

- Follow Conventional Commits: `<type>(<scope>): <subject>`.
- Keep the complete header at most 100 characters, including type and scope.
- Keep every body and footer line at most 100 characters as required by the
  active commitlint configuration. Check line lengths before committing so the
  hook does not need to reject the message.
- Use the monorepo package name as the scope when one workspace is clearly
  affected, for example `core` or `app`.
- Reserve `feat` and `fix` mainly for user-facing features and bug fixes.
- Reserve `docs` for user-facing documentation that should appear in generated
  changelogs. Use `chore` for internal documentation, including agent
  instructions and architecture maintenance.
- Use `build` for dependencies, package metadata, release tooling, and other
  build-system changes.
- Include a brief body by default. Focus it on the rationale: why the change was
  needed and why the chosen approach is appropriate. Mention important details
  that the title cannot capture, but do not merely restate the title or enumerate
  files.
- Omit the body only for genuinely trivial, self-explanatory commits.

## Retire implementation plans

- Before creating a PR or preparing a branch for merge, check for relevant plan
  files under `plans/`.
- Review every incomplete task in those plans. Complete it or explicitly mark it
  as discarded in the plan.
- Commit the reconciled plan so its final task status remains in Git history.
  Delete the plan files in a later commit.
- Do not create a PR with temporary plan files. If a PR already exists, delete
  them before merge.

## Draft pull request metadata

- Use a Conventional Commit-style PR title.
- Write Markdown notes.
- Start with a short prose rationale.
- Follow with concise key points focused on user-visible benefits; omit minor
  refactoring details.

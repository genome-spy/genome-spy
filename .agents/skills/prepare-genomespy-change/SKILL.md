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
- Keep commits focused. Casual intermediate commits are acceptable on feature
  branches when the user wants them.

## Record release impact

- Use `write-genomespy-changeset` before committing a complete change or
  preparing a PR. Inspect the full PR diff for PR notes and the exact staged
  diff for a direct commit to `master` or `main`.
- Include a user-facing changeset for releasable changes. Contributions with no
  release impact need no fragment. Update the fragment for an existing
  unreleased change instead of adding a note for each implementation commit.
  Assess independent direct commits separately for release impact.
- Confirm any required fragment is included in the commit or PR and run
  `npm run release:check` and `npm run release:status`. Conventional Commit
  messages describe history; Changesets supplies release intent and prose.
- Release preparation consumes the pending fragments. Use
  `npm run release:version` and the workflow in `CONTRIBUTING.md`; do not run
  plain `changeset version` or infer the release from commit subjects. Publish
  reviewed release commits with the manual `publish.yml` workflow.

## Write commits

- Follow Conventional Commits: `<type>: <subject>` or
  `<type>(<scope>): <subject>`.
- Keep the complete header at most 100 characters, including type and scope.
- Keep every body and footer line at most 100 characters as required by the
  active commitlint configuration. Check line lengths before committing so the
  hook does not need to reject the message.
- Scopes are optional and can generally be omitted on feature branches. Add the
  monorepo package name, such as `core` or `app`, when it clarifies the change.
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

- For direct commits to `master` or `main`, do not stage temporary plans or
  create separate plan-retirement commits. Reconcile and remove the task's
  temporary plan before staging the deliverable; leave unrelated plans alone.
- For branch/PR work, follow the
  [plan retirement workflow](../plan-genomespy-change/SKILL.md#retire-the-plan):
  commit the reconciled plan, then delete it in a later commit before creating
  the PR, or before merge if the PR already exists.

## Draft pull request metadata

- Use a Conventional Commit-style PR title.
- Write Markdown notes.
- Do not hard-wrap prose in PR notes. Keep each paragraph on one source line and
  let GitHub wrap it when rendering HTML. Use line breaks only for Markdown
  structure, such as paragraphs, lists, headings, and code blocks.
- Before drafting the notes, establish why the change is necessary: the current
  behavior, its concrete consequence, and the affected audience. Use the task
  context, linked issue, plan, documentation, and branch diff as evidence. If
  they do not provide enough information, ask the user for clarification. Do
  not invent a rationale or substitute a goal or implementation summary for it.
- Start with a self-contained opening for a reviewer who has not read the
  originating task, issue, or design discussion. Explain the problem before the
  solution, and include important compatibility or rollout boundaries.
- For a feature or fix, make the opening useful and understandable to affected
  users as well as maintainers. Describe the limitation or failure and its
  practical effect in plain language before adding implementation context.
- For a refactor or other internal change, explain the engineering problem and
  maintenance benefit without inventing user-facing impact. For mixed changes,
  lead with the user-visible reason and then explain the supporting internal
  work.
- Follow with concise key points, verification, and any remaining operational
  follow-ups. Omit minor implementation details.

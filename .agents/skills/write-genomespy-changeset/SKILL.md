---
name: write-genomespy-changeset
description: Assess GenomeSpy release impact and create or update user-facing Changesets notes for features, fixes, pull requests, and individual commits to master or main. Record intentional no-release changes with an empty fragment.
---

# Write a GenomeSpy changeset

Read `.changeset/config.json` and `.changeset/README.md` for the release group
and contribution contract. `v1.0.0` is the migration boundary. Do not reconstruct
earlier release notes or derive bump types from Conventional Commit subjects.

## Assess the change

- For a PR, inspect its entire diff against the target branch and any existing
  fragments. For a direct commit to `master` or `main`, inspect exactly the
  staged change. During implementation, inspect the working diff and update
  the note before preparing the commit.
- Identify observable behavior and affected package APIs or specification
  properties. Include release notes for user-visible fixes, functionality, and
  compatibility changes, including a behavior change inside a refactor.
- Tests, CI, internal docs, pure refactoring, and work limited to the unpublished
  WebGPU prototype normally need an empty changeset. Documentation changes
  need a package bump only when they change what ships to consumers; explain
  user-visible feature documentation in the feature's existing fragment.
- Select directly affected packages. The configured fixed group propagates
  their highest bump to all eight packages, including private applications.
  Do not list every synchronized package solely to keep versions aligned.
  Keep `@genome-spy/webgpu-renderer` outside this group.

## Choose and write the note

- `patch`: backward-compatible fix. `minor`: backward-compatible functionality.
  `major`: breaking API or specification change. Use post-1.0 semantic versioning.
- If compatibility is uncertain, investigate callers, docs, and tests. State any
  unresolved judgment for review instead of silently inventing a major bump.
- Lead with the observable benefit, corrected behavior, or affected public
  contract. Name relevant APIs or spec properties. Every breaking note needs
  concrete migration instructions. Avoid commit prefixes, internal method
  names, and issue shorthand that users cannot understand.
- One fragment describes one coherent change, even across multiple packages
  and commits. Update an existing fragment for that unreleased change. Add a
  separate fragment for an independent direct commit; do not rewrite notes for
  unrelated work or create a duplicate merely because a PR gains a commit.
- Use `npm run changeset` or write a descriptive `.changeset/<name>.md` with
  YAML frontmatter. For a no-release contribution, use
  `npm run changeset -- --empty`. Creating these files is part of preparing the
  authorized change and does not authorize publishing or GitHub messages.

```md
---
"@genome-spy/core": patch
---

Keep axis labels up to date when an interactive parameter changes their number
format, so the labels match the active formatting choice.
```

## Verify delivery

- Run `npm run release:check` and `npm run release:status`; report the calculated
  version and why that bump or no-release decision fits. With only empty
  fragments, no release is expected.
- Check the staged diff or PR diff again: the fragment must travel with the
  change. For PR preparation, `npm run release:check -- <base-ref>` also checks
  the note/no-release marker against that base, including working-tree edits.
- Keep commit messages developer-facing. They are not copied to changelogs.
  Changesets consumes fragments when `npm run release:version` prepares the
  next release. Do not run it merely to validate a contribution, because it
  changes versions and removes pending fragments.

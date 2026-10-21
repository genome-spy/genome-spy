---
name: write-genomespy-changeset
description: Assess GenomeSpy release impact and write concise changelog entries for feature branches, pull requests, and direct commits to master or main. Reuse fragments for ongoing work; contributions with no release impact need no fragment.
---

# Write a GenomeSpy changeset

Read `.changeset/config.json` and `.changeset/README.md` for the release group
and contribution contract. `v1.0.0` is the migration boundary. Do not reconstruct
earlier release notes or derive bump types from Conventional Commit subjects.

## Assess the contribution

- For a feature branch or PR, inspect the cumulative diff against the target
  branch, including relevant uncommitted changes and fragments already added
  by the branch. Assess the whole contribution, not just the latest task or
  implementation commit. For a direct commit to `master` or `main`, inspect
  exactly the staged change.
- Identify observable behavior and affected package APIs or specification
  properties. Include release notes for user-visible fixes, functionality, and
  compatibility changes, including a behavior change inside a refactor.
- Tests, CI, internal docs, pure refactoring, and work limited to the unpublished
  WebGPU prototype have no release impact by themselves. Documentation changes
  need a package bump only when they change what ships to consumers.
- Select directly affected packages. The configured fixed group propagates
  their highest bump to all eight packages, including private applications.
  Do not list every synchronized package solely to keep versions aligned.
  Keep `@genome-spy/webgpu-renderer` outside this group.

## Reuse or create a fragment

- One fragment describes one coherent change across packages and commits.
  Reuse the contribution's existing fragment. Add a separate note only for an
  independent user-visible change; leave unrelated fragments alone.
- Tests, documentation, refactoring, and fixes to the same unreleased feature
  do not need additional fragments. Leave an accurate note unchanged
  unless the final behavior, compatibility impact, or affected packages change.
- Contributions with no release impact need no fragment. Existing empty
  fragments remain valid. Assess independent direct commits to `master` or
  `main` separately for release impact.
- Use `npm run changeset` or write a descriptive `.changeset/<name>.md` with
  YAML frontmatter. Creating these files does not authorize publishing or
  GitHub messages.

## Write a concise changelog entry

- Start the Markdown body with exactly one `<!-- category: feature -->`,
  `<!-- category: improvement -->`, or `<!-- category: fix -->` marker, then a
  blank line and the entry. Choose the category by the change's purpose,
  independently of the version bump; any major bump is displayed under Breaking
  changes. Empty no-release fragments need no category. Keep the marker when
  rewriting an existing note.
- `patch`: backward-compatible fix. `minor`: backward-compatible functionality.
  `major`: breaking API or specification change. Use post-1.0 semantic versioning.
- If compatibility is uncertain, investigate callers, docs, and tests. State any
  unresolved judgment for review instead of silently inventing a major bump.
- Aim for one short paragraph, usually two to four sentences. Give more context
  than a commit subject: say what users can now do or what was corrected, and
  why it matters. A small fix can be shorter.
- Name public APIs or spec properties only when they help users understand the
  change. Keep tutorials, configuration examples, option inventories, edge-case
  catalogs, implementation details, and test results in documentation or PR
  notes. Avoid commit prefixes and internal method names.
- When the feature evolves, rewrite the note to summarize its final behavior;
  do not append each refinement or implementation step. Re-read the whole note
  for brevity before delivery.
- Every breaking note needs the minimum concrete migration instructions.
  Add another short paragraph only when needed to explain the migration.
- Put general release commentary in the prepared root changelog entry or supply
  a Markdown file with `npm run release:version -- --intro <file>`. Keep that
  release-wide prose out of individual feature notes.

```md
---
"@genome-spy/core": patch
---

<!-- category: fix -->

Keep axis labels up to date when an interactive parameter changes their number
format, so the labels match the active formatting choice.
```

## Verify delivery

- Run `npm run release:check` and `npm run release:status`; report the calculated
  version and why that bump or no-release decision fits. Without releasable
  fragments, no release is expected.
- Check the staged diff or PR diff again: user-visible changes need a fragment
  included with the change. `release:check` validates existing fragments and
  release policy; reviewers assess whether a contribution needs release notes.
- Keep commit messages developer-facing. They are not copied to changelogs.
  Changesets consumes fragments when `npm run release:version` prepares the
  next release. Do not run it merely to validate a contribution, because it
  changes versions and removes pending fragments.

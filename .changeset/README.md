# Release notes

GenomeSpy uses Changesets for releases after `v1.0.0`. Existing versions and
changelogs are the baseline; pre-1.0 changes are not reconstructed.

For each user-visible change, run `npm run changeset` and commit the generated
Markdown fragment with the change. Select the directly affected packages and
write a note for users. The fixed group in `config.json` synchronizes the eight
release packages automatically. The private WebGPU prototype is outside that
group and remains unpublished.

Use `patch` for compatible fixes, `minor` for compatible functionality, and
`major` for breaking API or specification changes. Every breaking note must
explain how to migrate. Describe the observable benefit or corrected behavior;
do not copy commit subjects or describe implementation work.

Start every nonempty fragment's Markdown body with exactly one category marker:
`<!-- category: feature -->`, `<!-- category: improvement -->`, or
`<!-- category: fix -->`. Add this after using `npm run changeset`. The category
controls the release-note section independently of the package version bumps;
any major bump places the note under **Breaking changes**. Empty no-release
fragments need no marker. `release:check` rejects missing or invalid categories.

Write a concise changelog entry, usually one short paragraph of two to four
sentences. Give enough context to explain the change and its benefit beyond a
commit subject. Keep tutorials, configuration examples, exhaustive option lists,
and implementation details in documentation or PR notes. Breaking changes need
only the migration instructions necessary to update existing usage.

One fragment covers a coherent change across packages and commits. Assess a
feature branch or PR as a whole and reuse its existing fragment. Leave an
accurate note unchanged for tests, documentation, refactoring, and refinements
that do not change its release summary; these need no additional empty fragment.
When the final behavior changes, rewrite the note concisely instead of appending
each development step. Use separate fragments for independent user-visible
changes. For direct commits to `master` or `main`, assess each commit separately.

When the whole contribution has no release impact, such as tests, refactoring,
CI, internal documentation, or work limited to the private WebGPU prototype,
record the decision once. If it has no existing no-release marker, run:

```sh
npm run changeset -- --empty
```

The empty fragment records an intentional no-release decision. It does not bump
versions. PRs and direct pushes are checked for a new or updated fragment;
release commits that consume fragments are checked separately. CI cannot judge
whether a note or bump is appropriate: review that decision with the diff.

Run `npm run release:status` to inspect planned versions and `npm run
release:check` to validate the package topology and fragments. See the
[release workflow](../CONTRIBUTING.md#releases) for preparation and publishing.

Root release notes group entries into **Breaking changes**, **New features**,
**Improvements**, and **Fixes**, with readable labels for the directly affected
packages. A shared change appears once. Package changelogs keep Changesets'
version-bump headings; the shared formatter removes the markers and puts prose
before links and contributor attribution in both outputs.

Release-wide prose belongs in the root release entry. Use
`npm run release:version -- --intro /path/to/introduction.md` to insert a Markdown
introduction above the grouped entries, or edit the prepared root entry before
committing it. The introduction file must be outside the working tree or already
committed, because versioning requires a clean checkout. Release prose may include
paragraphs, links, and headings; it needs no category marker and is preserved in
the GitHub release. Keep individual fragments concise.

## Example notes

Each example is a complete fragment with YAML frontmatter and prose for the
changelog. Adapt the packages, bump types, and text to the actual change.

### Feature

This example names the option and explains what it enables:

```md
---
"@genome-spy/core": minor
---

<!-- category: feature -->

Expose selected SAM auxiliary tags through the BAM lazy data source's `tags`
option. The resulting `tag_<name>` fields make annotations such as haplotype
assignments and cell barcodes available in encodings, filters, and tooltips.
```

### Breaking change

This hypothetical example explains the compatibility change and gives concrete
migration instructions:

```md
---
"@genome-spy/core": major
---

<!-- category: improvement -->

The BAM lazy data source now uses `samTags` instead of `tags` to select SAM
auxiliary tags. Rename `tags` to `samTags` in source definitions; the resulting
`tag_<name>` fields keep their existing names.
```

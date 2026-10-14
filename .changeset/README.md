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

One fragment can cover a coherent change across several packages. In a PR,
update its existing fragment as the implementation evolves. For direct commits
to `master` or `main`, include a fragment with each independently releasable
change. If another commit changes the same unreleased feature, update that
feature's fragment instead of duplicating its note.

For changes with no release impact, such as tests, refactoring, CI, internal
documentation, or work limited to the private WebGPU prototype, run:

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

## Example notes

Each example is a complete fragment with YAML frontmatter and prose for the
changelog. Adapt the packages, bump types, and text to the actual change.

### Feature

This example names the affected data source, explains the benefit, and shows
how to use the new option:

```md
---
"@genome-spy/core": minor
---

The BAM lazy data source now supports a `tags` option for exposing SAM auxiliary
tags in encodings, filters, and tooltips. This makes it possible to visualize
haplotype assignments, cell barcodes, and other annotations stored in BAM records.

For example, adding `"tags": ["HP", "CB"]` to a BAM source definition exposes
`tag_HP` and `tag_CB` fields on each read. A field has the value `undefined` when
the read lacks the requested tag.
```

### Breaking change

This hypothetical example explains the compatibility change and gives concrete
migration instructions:

```md
---
"@genome-spy/core": major
---

The BAM lazy data source now uses `samTags` instead of `tags` to select SAM
auxiliary tags. Source definitions using `tags` must be updated.

Replace `"tags": ["HP", "CB"]` with `"samTags": ["HP", "CB"]` in BAM source
definitions. The resulting fields, such as `tag_HP`, keep their existing names.
```

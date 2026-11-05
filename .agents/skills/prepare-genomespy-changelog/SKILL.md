---
name: prepare-genomespy-changelog
description:
  Revise generated GenomeSpy release changelogs, consolidate related entries,
  and write release introductions.
---

# Prepare a GenomeSpy changelog

Describe what users gain since the previous public release. Use
[write-genomespy-changeset](../write-genomespy-changeset/SKILL.md) for
individual contributions and
[CONTRIBUTING.md](../../../CONTRIBUTING.md#releases) for the release procedure.

## Generate and revise

- Identify the release commit/branch and previous published version; inspect the
  merged changes in that range. Merging a feature does not mean users received
  it.
- Use the generated changelogs if available; otherwise run
  `npm run release:version` following the release procedure. If the user handles
  generation manually, continue once it is complete. Revise entries in place; do
  not rerun versioning merely to update prose.
- Check claims against the final implementation and current docs, including
  defaults, compatibility, caveats, and experimental status.

## Curate the release

- Group by user-visible capability, not PR or commit. Combine a new feature and
  its fixes before its first public release into one description of the final
  behavior. Keep fixes to previously released behavior distinguishable, even
  when they concern the same subsystem.
- Keep root and affected package entries consistent and appropriately scoped.
  Preserve calculated versions, headings, migrations, caveats, package labels,
  PR/commit links, and contributors; deduplicate repeated references. Edit only
  the prepared release's entries unless asked to revise published history.
- Use the changeset style: one sentence identifying the feature/fix, followed by
  optional detail. Add a short introduction to the root entry summarizing key
  themes and benefits, with links to newly introduced external projects. Keep
  option inventories in the individual entries or documentation.

## Review

Check coverage of distinct user-visible changes and retain genuine fixes when
consolidating. Honor any requested review stop before committing or publishing;
changelog preparation alone does not authorize those actions.

Keep Markdown files wrapped. Preview them with `npm run --silent release:notes`;
`npm run --silent release:notes -- --github` unwraps prose and adds credits
while preserving Markdown structure. Keep the curated notes rather than
replacing them with GitHub's generated PR list.

Use focused content and formatting checks. If fragments change, apply the
changeset skill's policy checks; reuse results for unchanged inputs. Editorial
changes do not require repeating builds, test suites, or example smoke checks.

## Examples

References and attribution are omitted here; retain them in real entries.

### Consolidate a feature's first release

When Figwig support and follow-up summary/metadata fixes first ship together:

```md
- **App, Core:** Load multiple signal tracks and embedded sample metadata from
  [Figwig](https://github.com/jmschrei/figwig) files.

  Tracks can be selected reactively, with cached reads focused on the current
  viewport. Fast mode combines approximate overview summaries with raw values at
  close zooms; exact mode computes missing-aware means from raw values. Embedded
  track attributes can provide sample IDs, labels, and metadata.
```

### Introduce the key themes

```md
This release brings [Figwig](https://github.com/jmschrei/figwig) support for
multi-track genomic signals and embedded sample metadata, richer categorical
navigation, and interactive legends. Embedding applications can change sample
cohorts in place, while rendering and interaction fixes improve consistency
across views.
```

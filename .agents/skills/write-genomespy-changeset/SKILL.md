---
name: write-genomespy-changeset
description:
  Assess release impact and write or update individual GenomeSpy changesets for
  PRs and direct commits.
---

# Write a GenomeSpy changeset

Follow the [note format](../../../.changeset/README.md) and release group in
`.changeset/config.json`. For release-wide editing, use
[prepare-genomespy-changelog](../prepare-genomespy-changelog/SKILL.md).

## Assess and record the change

- Inspect the whole PR/branch diff, including uncommitted work and existing
  fragments. For a direct commit, assess exactly the staged change.
- Record user-visible functionality, fixes, and compatibility changes, including
  behavior changes within refactors. Tests, CI, internal docs, pure refactoring,
  and unpublished WebGPU work need no fragment by themselves. Documentation
  needs a bump only when it changes what ships to consumers.
- Reuse one fragment per coherent change. Rewrite it as the feature evolves;
  supporting work and pre-release fixes need no extra notes. Add a separate
  fragment for an independent user-visible change.
- Select directly affected packages; the fixed group synchronizes versions.
  Choose `patch` for compatible fixes, `minor` for functionality, and `major`
  for breaking changes. Investigate uncertain compatibility rather than
  guessing.
- Use `npm run changeset` or write `.changeset/<name>.md`. Begin the body with
  one `<!-- category: feature -->`, `<!-- category: improvement -->`, or
  `<!-- category: fix -->` marker. Categories describe purpose independently of
  bumps; major changes appear under Breaking changes. Empty fragments need no
  marker and do not cause a release.

## Write the entry

- Open with one short, complete sentence identifying the feature or fix. Put
  useful details and caveats in a separate paragraph; small fixes can remain one
  sentence. Breaking entries need concrete migration instructions.
- Explain the final user-visible behavior. Keep tutorials, option inventories,
  implementation details, and test results elsewhere. Name APIs only when
  useful. Verify defaults, limitations, and experimental status against code and
  docs.
- Wrap Markdown source with the repository's Prettier settings and separate
  paragraphs with blank lines. GitHub output unwraps prose automatically. Let
  the formatter supply package labels, references, and attribution.

## Examples

The feature example is a complete fragment; the others show entry prose only.

### Feature (`minor`, `feature`)

```md
---
"@genome-spy/core": minor
---

<!-- category: feature -->

Add explicit fills and configurable borders to rule marks.

Borders can sit inside, centered on, or outside the rule body, with independent
fill and stroke opacity. Canvas approximates the outlined rendering to maintain
interactive performance, and excessive outlined dashes can produce large SVGs
that render slowly.
```

### Fix (`patch`, `fix`)

```md
Fix clipped labels and plot overlap in multi-column categorical legends.

Vertical legends now reserve space for every column, keeping later labels
visible and preventing the legend from extending into the plot.
```

### Breaking change (`major`, `improvement`; hypothetical)

```md
Rename the BAM source's `tags` option to `samTags`.

Replace `tags` with `samTags` in source definitions. Generated `tag_<name>`
fields are unchanged.
```

## Verify

Check that the note covers the diff, then run `npm run release:check` and
`npm run release:status`; report the bump or no-release decision. Reuse passing
checks for unchanged inputs. These commands validate policy, not whether every
user-visible change has a note.

Use focused content and formatting checks for prose-only edits. Do not run
version generation for validation: it changes versions and consumes fragments.

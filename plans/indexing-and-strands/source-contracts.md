# Source Contracts

## Scope

This document specifies the user-visible coordinate, strand, GFF3, and VCF
contracts for the [Genomic Indexing and Strand Contracts](indexing-and-strands-plan.md)
proposal. Dependency and Tabix mechanics are covered separately in
[GMOD upgrades](gmod-upgrades.md).

The MB identifiers below refer to the merge-blocker register in the
[master plan](indexing-and-strands-plan.md#incremental-implementation-and-merge-blockers).
They may remain open while independent upgrade work proceeds, but each must be
closed before merge.

## General coordinate contract

GenomeSpy-owned genomic intervals use zero-based, half-open semantics. Sources
keep their established documented field names unless their format-specific
contract explicitly adds canonical fields. For sources that expose the
canonical interval shape, it is:

```text
chrom: chromosome or contig reference name under the source's documented policy
start: zero-based inclusive start
end:   zero-based exclusive end
```

A point-like record still has a reference span. For a single reference base,
`end == start + 1`. Marks may encode only `start` when a visual point is
desired, but the source contract remains an interval contract.

**MB-3 resolution:** `chrom` preserves the reference name stored in the file.
`addChrPrefix` is an idempotent query-name mapping and does not rewrite emitted
records. This policy is identical for eager and lazy format adapters.

**MB-4 resolution:** The invariant applies to coordinate semantics, not one
mandatory set of field names. BED continues to expose `chromStart/chromEnd`,
and BEDPE continues to expose `start1/end1` and `start2/end2`; these documented
fields are zero-based and half-open.

Known source adapters perform format-aware conversion before publishing rows to
the dataflow. Consequently, formulas, filters, pileups, lookups, windows,
encodings, tooltips, and exports observe the same values.

Generic CSV, TSV, JSON, and Tabix TSV records are not interpreted. Authors
derive canonical fields explicitly near the beginning of the dataflow:

```json
{
  "transform": [
    {
      "type": "formula",
      "expr": "datum.rawStart - 1",
      "as": "start"
    },
    {
      "type": "formula",
      "expr": "datum.rawEnd",
      "as": "end"
    }
  ]
}
```

For a one-based closed interval, subtract one only from the start. Its inclusive
end has the same numeric value as the corresponding zero-based exclusive end.
Keep raw fields when their original representation is useful; downstream
transforms should refer consistently to the derived canonical fields.

## Per-format coordinate status

| Format/source | Input or library semantics | GenomeSpy action |
| --- | --- | --- |
| BAM | GMOD records are zero-based, half-open | Preserve `chrom/start/end` |
| BED | BED is zero-based, half-open | Preserve BED coordinate fields |
| BEDPE | BEDPE interval columns are zero-based, half-open | Preserve both intervals |
| BigWig | BBI features are zero-based, half-open | Preserve `chrom/start/end` |
| BigBed | BBI/BED features are zero-based, half-open | Preserve coordinates |
| Indexed FASTA | Query API is zero-based, half-open | Preserve query/result positions |
| WIG | Source notation is one-based closed | Continue converting during parsing |
| GFF3 | Text format is one-based closed | Let GFF v5/parser adapter emit canonical intervals |
| VCF | Raw `POS` is one-based; record span is format-aware | Add canonical primary `chrom/start/end`, retain raw fields |
| Generic Tabix TSV | Determined by its index configuration and row schema | Do not rewrite row fields; require explicit transforms |

The Tabix query API uses zero-based, half-open query windows internally. That
does not prove that arbitrary columns in a generic row have the same semantics.

## Strand contract

GenomeSpy-owned strand fields use:

```ts
type Strand = "+" | "-" | null;
```

Normalize parser-native values at ingestion:

| Input | Output |
| --- | --- |
| `"+"` or `1` | `"+"` |
| `"-"` or `-1` | `"-"` |
| `.`, `0`, missing, or format-defined unstranded value | `null` |

Use one shared helper for these known parser domains so BED, BEDPE, BigBed,
BAM, and GFF cannot drift. Validate unexpected values at the format boundary;
do not silently reinterpret arbitrary strings.

BEDPE applies the rule independently to `strand1` and `strand2`. GFF applies it
recursively to every object in `subfeatures`. BigBed normalizes both the fast
AutoSQL parser and fallback `@gmod/bed` parser results after parsing, which
ensures the selected parser path does not affect public data.

### Strand migration

Specifications comparing numeric strands migrate as follows:

```text
datum.strand == 1   -> datum.strand == "+"
datum.strand == -1  -> datum.strand == "-"
datum.strand == 0   -> datum.strand == null
```

Update scale domains, preferred orders, conditional encodings, tooltip labels,
and tests together.

## GFF3 contract

### Current problem

`packages/core/src/data/sources/lazy/gff3Source.js` uses `gff-nostream` 3 and
parses Tabix slices by joining lines into a new string. The legacy objects use
`seq_id`, one-based closed coordinates, string strands, nested
`child_features` arrays, and attributes under `attributes`. Specifications need
repeated flatten/project operations, and the legacy grouping can attach the
same biological feature more than once.

### New record shape

Use `gff-nostream` 5 `parseLines()` for each Tabix slice. Adapt each returned
feature recursively to this public shape:

```js
{
    chrom,
    start,
    end,
    strand,
    source,
    type,
    score,
    phase,
    subfeatures,
    // parser-flattened GFF attributes
}
```

Specific decisions:

- Rename parser `refName` to `chrom` without changing the file's reference name.
- Preserve canonical zero-based, half-open `start` and `end` from v5.
- Convert numeric parser strand to the symbolic/null contract.
- Keep `subfeatures` as direct feature objects and normalize them recursively.
- Preserve v5's documented flattened attribute behavior, including its
  collision naming. Do not reconstruct the v3 `attributes` container.
- Preserve nullable `source` and `type`, and optional `score` and `phase`, with
  their v5 types.
- Do not reintroduce `derived_features` or merge multi-location records in the
  adapter.

**MB-5 resolution:** Reserve adapter-created `chrom`. Rename an attribute named
`chrom` to the next free numeric field (`chrom2`, `chrom3`, and so on). Preserve
the same adapted feature object under each declared parent, while deduplicating
repeated attachment to the same parent/path.

The exact output fixture becomes a deliberate public contract and should be
captured by focused snapshots after the adapter design stabilizes.

Define an explicit GenomeSpy GFF datum type rather than reusing the upstream
parser type after `refName` and numeric strand have been adapted.

### GenomeSpy 1.x-to-v2 mapping

| GenomeSpy 1.x GFF3 field/path | GenomeSpy 2.0 field/path |
| --- | --- |
| `seq_id` | `chrom` |
| `start` with encoding offset | canonical `start` |
| `end` | canonical exclusive `end` |
| string `strand` | `"+"`, `"-"`, or `null` |
| `child_features` nested arrays | `subfeatures` objects |
| `attributes.ID[0]` | flattened `id` field |
| `attributes.*` | lowercase flattened fields; singleton values become scalars and repeated values remain arrays |
| repeated initial `flatten` | removed |

### GFF3 verification

- Add a synthetic gene -> transcript -> exon fixture with exact coordinate,
  attribute, and strand assertions.
- Test an orphan child whose parent is outside the fetched Tabix slice; it must
  remain available as a top-level feature.
- Test multi-location and multi-parent features. Assert that every declared
  relationship is preserved and that no segment is attached repeatedly to the
  same parent/path.
- Test attribute arrays, singleton attributes, and collisions with built-in
  property names.
- Test raw reference-name preservation with a bare-reference file.
- Add a stable snapshot for the normalized hierarchy.
- Render a representative GENCODE interval and assert the expected mark/SVG
  count so object duplication cannot return unnoticed.

## VCF contract

### Boundary of normalization

VCF is extensible and cannot be normalized recursively. The source preserves
the raw parser materialization and adds only these GenomeSpy-owned fields:

```js
{
    CHROM, POS, ID, REF, ALT, QUAL, FILTER, INFO, SAMPLES,
    // ...other raw parser fields...
    chrom, // same reference name as raw CHROM
    start, // zero-based inclusive local start
    end,   // zero-based exclusive local end
}
```

`chrom/start/end` describe the primary local reference interval, not every
coordinate contained by the VCF record.

Raw fields remain untouched:

- `POS` stays one-based.
- `INFO.END` retains VCF semantics. Its numeric value normally equals the
  canonical exclusive `end`; do not decrement it in place.
- Breakend mate positions embedded in `ALT` stay raw.
- Arbitrary `INFO`, `FORMAT`, sample, `ANN`, and `CSQ` values stay raw.
- Relative fields such as `CIPOS` and `CIEND` stay relative offsets.

### Primary interval computation

Create one shared helper used by eager `format.type: "vcf"` and lazy
`data.lazy.type: "vcf"`:

1. `chrom` equals raw `CHROM`; the raw field remains unchanged.
2. `start` is `POS - 1`.
3. Compute `end` from the exact algorithm selected in MB-2.

**MB-2:** Current `@gmod/vcf` materializes non-flag INFO values as arrays, so
`INFO.END` and `INFO.SVTYPE` must not be treated as scalars. Current Tabix
interval logic also treats `SVTYPE=TRA` as a one-base local interval before
considering `END`; other records use a valid `END` or fall back to
`start + REF.length`. Decide whether the public helper adopts those semantics
exactly, then specify failure behavior for invalid or missing `POS`, `END`, and
`REF`. Eager and lazy parsing must use the same decision.

Validate the helper against the interval semantics used by the upgraded Tabix
library. Do not use field-name heuristics such as `POS2` or recursively scan
annotations. A later normalized mate-breakpoint API requires a separate,
format-aware design.

For multi-allelic or structural records, the canonical interval is the record's
local reference span. It is not a promise of one normalized interval per ALT
allele.

Update `packages/core/src/data/formats/vcfTypes.d.ts` to include the canonical
fields without weakening the types of preserved raw fields.

### Collision behavior

The GMOD parser currently uses uppercase standard fields and nests INFO/sample
data, so lowercase `chrom/start/end` form a distinct GenomeSpy namespace.
Fail fast during development if an upgraded parser starts producing conflicting
top-level lowercase fields; do not silently overwrite parser data without
reviewing the public contract.

### VCF verification

- Test SNVs, insertions, deletions, symbolic alleles with `END`, multi-allelic
  records, and breakends.
- Assert raw `POS`, `INFO`, `ALT`, and sample objects are unchanged.
- Assert eager and lazy parsing produce identical canonical fields.
- Assert breakend mate coordinates and confidence intervals are not rewritten.
- Test that `chrom` equals raw `CHROM` even when a lazy query uses
  `addChrPrefix` mapping.
- Update ClinVar to encode canonical fields without an encoding offset.
- Audit HCC1954 structural-variant formulas so local and mate endpoints declare
  explicitly whether they consume canonical or raw values.

## Indexing-offset retirement

### Encoding offset

`ChromPosDefBase.offset` is currently copied by
`packages/core/src/view/flowBuilder.js` into an implicit
`LinearizeGenomicCoordinate` appended after user transforms. It therefore
changes final linearization but not earlier access to the same position field.
Remove it from:

- `packages/core/src/spec/channel.d.ts`
- implicit transform construction in `packages/core/src/view/flowBuilder.js`
- generated schemas and schema-derived documentation

The current user documentation is also internally inconsistent: the type docs
say the offset is subtracted, while `docs/grammar/genomic-coordinates.md`
describes addition and shows a negative value. Migration removes that ambiguity
rather than choosing another implicit sign convention.

### Transform offset

Remove `LinearizeGenomicCoordinateParams.offset` and the subtraction code in
`packages/core/src/data/transforms/linearizeGenomicCoordinate.js`. The transform
continues to accept `chrom`, one or more `pos` fields, corresponding `as`
fields, and a locus-scale channel.

Indexing correction is a preceding explicit transform, not a mode of
linearization. This ordering makes corrected values available to every later
consumer.

### Unaffected offsets

Do not change:

- `scale.numberingOffset`, which controls labels and tick selection without
  modifying data;
- mark `xOffset`, `x2Offset`, `yOffset`, and `y2Offset`;
- axis, title, legend, stroke-dash, stack, and layout offsets.

Use precise terminology in docs so searches for the removed coordinate option
do not imply that unrelated offset features are deprecated.

## User-facing documentation

Documentation is an acceptance requirement, not deferred cleanup.

### Genomic coordinates

Update `docs/grammar/genomic-coordinates.md` to:

- define the source/dataflow zero-based half-open invariant;
- remove locus-encoding offset guidance;
- demonstrate explicit normalization before other transforms;
- distinguish data normalization from `scale.numberingOffset`;
- link to source-specific exceptions and raw-field behavior.

### Coordinate linearization

Update `docs/grammar/transform/linearize-genomic-coordinate.md` to state that
inputs must already be canonical and to show normalization preceding explicit
linearization.

### Source pages

Update `docs/grammar/data/eager.md` and `docs/grammar/data/lazy.md` with concise
returned-field contracts for WIG, BED, BEDPE, BigWig, BigBed, BAM, GFF3, VCF,
IndexedFASTA, and generic Tabix TSV.

For VCF, use explicit wording: canonical fields describe the primary local
record interval; all other VCF contents preserve raw semantics.

For GFF, document the exact hierarchy, coordinate contract, strand contract,
attribute behavior, and slice/orphan behavior needed to use the source.

### Examples and migration page

Update the known affected specifications:

- `examples/docs/examples/genomic-data/gff3-gene-annotations.json`
- `examples/docs/examples/genomic-data/clinvar-variants.json`
- `examples/docs/examples/genomic-data/hcc1954-sv-cnv.json`
- `examples/docs/examples/genomic-data/ASCAT.json`
- `examples/docs/examples/genomic-data/ASCAT-algorithm.json`
- their pages under `docs/examples/genomic-data/`

In addition, audit every existing specification under `examples/`, not only the
known files above, and verify that all examples work correctly. Migrate only
uses affected by the new coordinate, strand, GFF, VCF, or offset contracts and
change supporting code or assets only when necessary. This includes imported
and private/example variants that may not be embedded in the documentation.
Use repository-wide searches plus `npm run smoke:examples`; the offline
initialization suite is insufficient because it skips specifications with
absolute HTTP data URLs. Do not treat the known list as exhaustive or presume
that every example needs an edit.

Add a v2 migration section with old/new snippets for encoding offsets, explicit
custom-data correction, numeric strands, GFF hierarchy fields, and canonical
versus raw VCF fields.

**MB-8:** Select a concrete migration document path and add it to
`zensical.toml`. Decide whether the offsets receive an observable prerelease
deprecation during 1.x or are removed directly in 2.0; document the chosen path
in types, schema-derived docs, and the migration page. Replace mutable upstream
`main` links used as compatibility evidence with release-tagged or commit-pinned
links.

Regenerate schema artifacts from `.d.ts` sources. Do not edit generated schema
descriptions directly.

## Acceptance criteria

- The general coordinate and strand contracts are stated once and linked from
  every format-specific page.
- Known adapters normalize before any user-authored transform.
- Generic/custom records are unchanged and have a documented explicit
  normalization pattern.
- GFF and VCF fulfill their bounded contracts and do not claim broader
  normalization.
- Encoding and transform indexing offsets are absent from the final schema.
- Every affected in-repository example uses canonical fields without hidden
  coordinate adjustment.
- Every existing specification under `examples/` has been audited and verified
  to work. Only affected specifications and supporting code or assets are
  migrated; no affected example depends on indexing offsets, numeric source
  strands, the legacy GFF hierarchy, or raw VCF `POS` for its primary genomic
  placement.
- Documentation contains no remaining recommendation to correct genomic
  indexing in a locus encoding or during linearization.
- MB-2, MB-3, MB-4, MB-5, MB-7, and MB-8 are closed before merge.

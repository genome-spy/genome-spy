# BAM Alignment Support Plan

## Rationale

GenomeSpy was originally designed around higher-level genomic data such as
copy-number segments, variant calls, annotations, and cohort metadata. It is
also a general declarative visualization system with enough flexibility to build
custom genomic views from lower-level data.

BAM read alignments are standard evidence tracks in genome browsers. GenomeSpy
does not need to become an IGV replacement, but it should provide enough
grammar-level building blocks to make IGV-like alignment evidence views possible
when users need custom pileup or coverage visualizations.

The target users are tool builders, computational biologists, and visualization
developers who already build custom GenomeSpy specs. These users may want to
change how BAM evidence is filtered, grouped, colored, summarized, or combined
with assay-specific metadata. A closed, fixed "BAM track" would be less useful
than reusable alignment-derived data rows that work with ordinary marks,
transforms, encodings, parameters, and composition.

## Objective

Add an incremental foundation for BAM alignment visualizations by exposing
standard alignment evidence as composable GenomeSpy data:

- read-level rows from the BAM source
- CIGAR operation rows for aligned blocks, indels, skips, and clipping
- sparse mismatch rows for per-base variant evidence
- coverage summaries that combine total depth with allele-colored evidence

The initial feature set should be useful for short-read local inspection around
SNVs and small indels. It should demonstrate that the grammar can express an
IGV-like coverage plus read pileup view while still allowing users to customize
the view.

## Non-Goals for the Initial Version

- Full IGV interaction parity.
- A monolithic built-in alignment track renderer.
- Complete structural-variant analysis from paired reads.
- Complete split-read or chimeric-read workflows.
- Complete RNA-seq junction visualization.
- Long-read-specific conventions such as base modifications.
- A guarantee that every BAM/SAM edge case is displayed identically to IGV.

These can be added later if the foundational transforms prove useful.

## Existing Conventions and Specifications

Two kinds of reference material should guide this work.

### Data Semantics

The formal SAM/BAM specifications define the meaning of the alignment fields and
should be treated as the source of truth for parsing:

- SAMv1 specification: https://samtools.github.io/hts-specs/SAMv1.pdf
- SAM optional tags: https://samtools.github.io/hts-specs/SAMtags.pdf
- HTS specifications repository: https://github.com/samtools/hts-specs

Important concepts:

- `CIGAR` maps read positions to reference positions.
- `M` consumes both read and reference but does not distinguish match from
  mismatch.
- `=` and `X` explicitly distinguish sequence match and mismatch when present.
- `I` consumes read sequence only.
- `D` and `N` consume reference sequence only.
- `S` consumes read sequence and represents soft-clipped bases.
- `H` and `P` consume neither read nor reference.
- `MD` and `NM` tags provide mismatch and edit information. `MD` is especially
  useful when CIGAR uses `M`.
- `MAPQ` is a Phred-scaled estimate of mapping-placement confidence, with
  aligner-dependent interpretation.
- SAM text is 1-based for positions, while the current `@gmod/bam` API exposes
  0-based coordinates.

### Display Conventions

IGV is the most useful reference implementation for familiar alignment display
conventions:

- Alignment basics:
  https://igv.org/doc/desktop/UserGuide/tracks/alignments/viewing_alignments_basics/
- Paired-end alignments:
  https://igv.org/doc/desktop/UserGuide/tracks/alignments/paired_end_alignments/
- Chimeric reads:
  https://igv.org/doc/desktop/UserGuide/tracks/alignments/chimeric_reads/
- RNA-seq alignments:
  https://igv.org/doc/desktop/UserGuide/tracks/alignments/rna_seq/

Initial GenomeSpy behavior should follow familiar conventions where practical:

- coverage bars above read alignments
- gray read bodies by default
- colored mismatch bases
- black deletion markers
- insertion markers, optionally labeled by inserted length at high zoom
- clipped-end markers
- lower opacity or hollow styling for low or zero MAPQ reads

These conventions are not normative standards. The GenomeSpy documentation
should describe them as IGV-like alignment evidence conventions, not as strict
IGV compatibility.

## What `@gmod/bam` Offers

GenomeSpy already uses `@gmod/bam` for lazy BAM loading. The package exposes the
raw fields needed for alignment-derived visualization:

- `record.start` and `record.end`
- `record.name`
- `record.CIGAR`
- `record.NUMERIC_CIGAR`
- `record.mq`
- `record.strand`
- `record.seq`
- `record.seqAt(index)`
- `record.qual`
- `record.flags`
- `record.getTag("MD")`
- `record.getTagRaw("MD")`
- `record.NUMERIC_MD`
- mate fields such as `next_refid`, `next_pos`, `template_length`
- flag helpers such as `isPaired()`, `isDuplicate()`, and `isSupplementary()`
- pair orientation for same-reference mapped mates

The package does not directly expose a GenomeSpy-ready table of CIGAR operations
or mismatch rows. GenomeSpy should derive those rows in transforms so they can be
used with ordinary marks and encodings.

## Current GenomeSpy Support

At the start of this feature branch, the lazy BAM source was intentionally
minimal and published only read-level fields such as:

- `chrom`
- `start`
- `end`
- `name`
- `cigar`
- `mapq`
- `strand`

Milestone 1 added richer read fields, shared CIGAR parsing helpers, and the
`flattenCigar` transform. Milestone 2 added sparse mismatch extraction through
`alignmentMismatches`. The BAM example now renders two tracks:

- coverage computed from aligned CIGAR blocks
- read pileup rendered as strand-colored arrow marks with CIGAR overlays
- mismatch overlays derived from `CIGAR + MD + SEQ + QUAL`

Existing transform patterns that are relevant:

- `coverage` computes interval coverage from sorted segments.
- `pileup` assigns lanes to interval rows.
- `flattenSequence`, `flattenDelimited`, and `flattenCompressedExons` expand one
  input row into several cloned output rows.
- `aggregate` buffers rows per batch and emits summaries.
- modifying transforms are preceded by defensive clones when needed.

This suggests that BAM-derived data should be added as ordinary transforms, not
as a special-purpose renderer. However, these transforms are domain-specific
alignment transforms rather than generic table reshaping utilities. Their output
field names should be fixed and semantic. Users can use `project` or `formula`
afterward if they need renamed or derived fields.

## Proposed Initial Scope

The first useful milestone should support short-read local inspection around
SNVs and small indels:

1. Expose richer read-level BAM fields from the lazy BAM source.
2. Add CIGAR-derived row expansion.
3. Add sparse mismatch extraction.
4. Add an allele-colored coverage summary using existing transforms if
   feasible.
5. Update the BAM example to demonstrate an IGV-like but customizable alignment
   evidence view.

The example should prove utility, not just visual polish. A useful first view
would include:

- CIGAR-aware read bodies
- deletions
- insertion markers
- clipped-end markers
- mismatch overlays
- MAPQ opacity
- coverage depth with allele-colored evidence
- at least one customization hook such as a MAPQ filter or a color-by mode

## BAM Source Changes

The BAM source should remain a source of read-level rows. It should not emit all
derived rows by default because per-base and per-CIGAR expansion can multiply
row counts substantially.

Tentative source output additions:

```ts
interface BamReadDatum {
    chrom: string;
    start: number;
    end: number;
    name: string;
    cigar: string;
    mapq?: number;
    strand: "+" | "-";

    seq?: string;
    qual?: number[];
    md?: string;
    flags?: number;

    mateChrom?: string;
    mateStart?: number;
    templateLength?: number;
    pairOrientation?: string;

    isPaired?: boolean;
    isProperPair?: boolean;
    isDuplicate?: boolean;
    isQcFail?: boolean;
    isSecondary?: boolean;
    isSupplementary?: boolean;
}
```

The initial implementation can expose only the fields required by the first
transforms. Mate fields can be added later if pair visualization is deferred.

## Transform: `flattenCigar`

`flattenCigar` should follow the style of existing flatten transforms. It takes
one alignment row and emits one row per CIGAR operation, cloning the input datum
and adding operation-specific fields.

Tentative props:

```ts
export interface FlattenCigarParams extends TransformParamsBase {
    type: "flattenCigar";

    /**
     * The read's reference start coordinate.
     *
     * Default: "start"
     */
    start?: Field;

    /**
     * The CIGAR string or numeric CIGAR field.
     *
     * Default: "cigar"
     */
    cigar?: Field;
}
```

The transform should emit fixed output fields:

```ts
interface CigarOperationDatum extends BamReadDatum {
    cigarOp: "M" | "I" | "D" | "N" | "S" | "H" | "P" | "=" | "X";
    cigarLength: number;
    cigarStart: number;
    cigarEnd: number;
    readStart: number;
    readEnd: number;
    cigarType:
        | "aligned"
        | "insertion"
        | "deletion"
        | "skip"
        | "softClip"
        | "hardClip"
        | "padding";
}
```

Suggested `cigarType` values:

- `"aligned"` for `M`, `=`, and `X`
- `"insertion"` for `I`
- `"deletion"` for `D`
- `"skip"` for `N`
- `"softClip"` for `S`
- `"hardClip"` for `H`
- `"padding"` for `P`

Example transform chain for CIGAR-aware read bodies:

```json
[
  { "type": "pileup", "start": "start", "end": "end", "as": "_lane" },
  { "type": "flattenCigar", "start": "start", "cigar": "cigar" },
  { "type": "filter", "expr": "datum.cigarType == 'aligned'" }
]
```

Example transform chain for CIGAR-aware coverage:

```json
[
  { "type": "flattenCigar", "start": "start", "cigar": "cigar" },
  { "type": "filter", "expr": "datum.cigarType == 'aligned'" },
  {
    "type": "coverage",
    "chrom": "chrom",
    "start": "cigarStart",
    "end": "cigarEnd",
    "as": "coverage"
  }
]
```

Ordering matters. For read pileups, `pileup` should generally run before
`flattenCigar` so all CIGAR operation rows from the same read inherit the same
lane.

## Transform: `alignmentMismatches`

`alignmentMismatches` should emit sparse per-base mismatch rows. It should not
emit every aligned base because that would produce much larger data than most
views need.

It should parse `CIGAR + MD + SEQ + QUAL`. `MD` is required because CIGAR
strings that use `M` do not distinguish matches from mismatches. Explicit `X`
CIGAR operations can identify mismatches directly, but the transform should
still require `MD` so `refBase` semantics remain consistent.

Tentative props:

```ts
export interface AlignmentMismatchesParams extends TransformParamsBase {
    type: "alignmentMismatches";

    /**
     * The read's reference start coordinate.
     *
     * Default: "start"
     */
    start?: Field;

    /**
     * The CIGAR string or numeric CIGAR field.
     *
     * Default: "cigar"
     */
    cigar?: Field;

    /**
     * Read sequence field.
     *
     * Default: "seq"
     */
    sequence?: Field;

    /**
     * Base quality field.
     *
     * Default: "qual"
     */
    quality?: Field;

    /**
     * MD tag field.
     *
     * Default: "md"
     */
    md?: Field;
}
```

The transform should emit fixed output fields:

```ts
interface AlignmentMismatchDatum extends BamReadDatum {
    mismatchStart: number;
    mismatchEnd: number;
    readOffset: number;
    base: "A" | "C" | "G" | "T" | "N" | string;
    refBase: "A" | "C" | "G" | "T" | "N" | string;
    baseQuality?: number;
}
```

Example mismatch overlay transform chain:

```json
[
  { "type": "pileup", "start": "start", "end": "end", "as": "_lane" },
  {
    "type": "alignmentMismatches",
    "start": "start",
    "cigar": "cigar",
    "sequence": "seq",
    "quality": "qual",
    "md": "md"
  }
]
```

The transform should fail fast when required fields are missing. Reference
FASTA-backed mismatch extraction is out of scope for this feature.

## Composable Coverage and Mismatch Summaries

The current `coverage` transform counts sorted interval depth. That is enough
for the ordinary depth histogram when it receives CIGAR-derived aligned blocks:

```json
[
  { "type": "flattenCigar", "start": "start", "cigar": "cigar" },
  { "type": "filter", "expr": "datum.cigarType == 'aligned'" },
  { "type": "collect", "sort": { "field": ["chrom", "cigarStart"] } },
  {
    "type": "coverage",
    "chrom": "chrom",
    "start": "cigarStart",
    "end": "cigarEnd",
    "as": "coverage",
    "asStart": "start",
    "asEnd": "end"
  }
]
```

Mismatch-colored coverage overlays can also be expressed with existing
transforms. `alignmentMismatches` creates one row per observed non-reference
base. `aggregate` can count rows by reference locus and observed base. `stack`
can turn those counts into ranged y-values for stacked colored bars:

```json
[
  { "type": "filter", "expr": "datum.md != null" },
  { "type": "alignmentMismatches" },
  {
    "type": "filter",
    "expr": "datum.baseQuality == null || datum.baseQuality >= minBaseQuality"
  },
  {
    "type": "aggregate",
    "groupby": ["chrom", "mismatchStart", "base"]
  },
  {
    "type": "stack",
    "field": "count",
    "groupby": ["chrom", "mismatchStart"],
    "sort": { "field": "base", "order": "ascending" },
    "as": ["mismatchCount0", "mismatchCount1"]
  },
  {
    "type": "formula",
    "expr": "datum.mismatchStart + 1",
    "as": "mismatchEnd"
  }
]
```

This is feasible and matches GenomeSpy's composability goals. It does not
produce a full per-base consensus pileup because matching reference bases are
not materialized as rows. The first allele-colored coverage view should
therefore show:

- total aligned-base depth from `coverage`
- stacked colored bars for non-reference mismatch support
- base-quality filtering before aggregation

The mismatch summary should group and stack by `chrom + mismatchStart`. The
rows represent single-base loci, so `mismatchEnd` is derived after aggregation
for interval rendering rather than used as part of the stack key.

This is enough for local SNV inspection and avoids a premature
`alignmentCoverage` transform. A dedicated alignment coverage transform should
remain a later fallback if ordinary transform chains become too slow, too
verbose, or unable to express deletion, insertion, strand-split, or
reference-base summaries clearly.

## Example Spec Direction

The updated BAM example should be structured as an ordinary layered and
concatenated GenomeSpy spec.

High-level layout:

```json
{
  "vconcat": [
    {
      "name": "coverage",
      "layer": [
        "depth bars",
        "base-composition overlays for loci with non-reference support"
      ]
    },
    {
      "name": "reads",
      "layer": [
        "CIGAR-aware read blocks",
        "deletion markers",
        "insertion markers",
        "soft-clipping markers",
        "mismatch base overlays"
      ]
    }
  ]
}
```

Useful customization controls:

```json
{
  "params": [
    {
      "name": "minMapq",
      "value": 0,
      "bind": { "input": "range", "min": 0, "max": 60, "step": 1 }
    },
    {
      "name": "laneHeight",
      "value": 12,
      "bind": { "input": "range", "min": 2, "max": 30, "step": 1 }
    }
  ]
}
```

Example read filter:

```json
{ "type": "filter", "expr": "datum.mapq == null || datum.mapq >= minMapq" }
```

Example MAPQ opacity:

```json
{
  "fillOpacity": {
    "field": "mapq",
    "type": "quantitative",
    "scale": { "domain": [0, 60], "range": [0.12, 1], "clamp": true }
  }
}
```

The example should make the composability explicit. It should not only show a
fixed IGV-like rendering. It should include at least one visible customization,
such as filtering by MAPQ or switching read coloring between strand and MAPQ.

## Implementation Notes

### Shared CIGAR Walker

`flattenCigar` and `alignmentMismatches` should share a small CIGAR walking
helper. The helper should maintain both cursors:

```text
refPos  = read alignment start
readPos = offset into SEQ
```

Consumption rules:

```text
M, =, X consume read and reference
I, S    consume read only
D, N    consume reference only
H, P    consume neither
```

The helper should be tested independently. Production transforms should focus
on field access, output rows, and flow behavior.

### Flow Behavior

Likely flow behaviors:

- `flattenCigar`: `BEHAVIOR_CLONES`
- `alignmentMismatches`: `BEHAVIOR_CLONES`

The transforms should follow existing conventions:

- use field accessors from `utils/field.js`
- use fixed semantic output field names for BAM-specific derived rows
- fail loudly on invalid or unsupported input
- keep JSDoc docs user-facing in `packages/core/src/spec/transform.d.ts`
- add focused Vitest tests next to the transform code

## Documentation Plan

Documentation should be updated with:

- BAM lazy source field descriptions
- new transform docs generated from `transform.d.ts`
- a revised BAM example under `examples/docs/grammar/data/lazy/`
- a short user-facing explanation that BAM support is a set of composable
  alignment evidence building blocks
- explicit limitations of the initial release

The current `docs/grammar/data/lazy.md` says the BAM source is work in progress.
That section should be revised once the first useful feature set lands.

## Testing Strategy

Tests should focus on behavior and contracts rather than reproducing internal
implementation details:

- CIGAR walker tests for every operation type.
- `flattenCigar` row output for representative CIGARs.
- `alignmentMismatches` output for `M + MD`, explicit `X`, insertion-adjacent
  mismatches, deletion-adjacent mismatches, and soft clipping.
- example-level checks that the coverage view can combine `coverage` depth with
  `alignmentMismatches + aggregate + stack` mismatch summaries.
- BAM source tests for exposed fields if a small fixture is practical.
- Layout/example smoke test only if the docs example is expected to remain
  stable.

The first implementation should not add broad snapshot tests until the output
shape has stabilized.

## Suggested Milestones

### Milestone 1: Raw BAM Fields and CIGAR Rows

- Expose `seq`, `qual`, `md`, `flags`, and selected flag booleans from
  `bamSource`.
- Add a shared CIGAR walker.
- Add `flattenCigar`.
- Update the example to show CIGAR-aware read bodies, deletions, insertions, and
  clipping.

### Milestone 2: Mismatch Evidence

- Add `alignmentMismatches`.
- Add mismatch overlays colored by base.
- Add base-quality opacity or filtering.
- Ensure the example supports local SNV inspection.

### Milestone 3: Composable Coverage Summary

- Use `coverage` for aligned-base depth.
- Use `alignmentMismatches`, `aggregate`, and `stack` for allele-colored
  mismatch bars.
- Keep quality thresholds in the ordinary transform chain.

### Milestone 4: Customization and Documentation

- Add one or two visible customization controls to the example.
- Update user-facing docs.
- Document limitations and future directions.

### Later Milestones

- Paired-read derived fields and pair anomaly coloring.
- Supplementary and chimeric-read support from `SA` tags.
- Downsampling indicators.
- RNA-seq-specific split/skipped-region and junction summaries.
- Long-read-specific display conventions.

## Open Design Questions

- Should `bamSource` expose both string CIGAR and numeric CIGAR, or should the
  source normalize to string only and let transforms parse it?
- Should base qualities remain a numeric array on the datum, or should they be
  encoded more compactly for memory?
- Should the coverage histogram count only aligned read bases, or should a later
  deletion-aware mode count reads spanning deleted reference bases too?
- Should insertion positions be represented as zero-width loci or one-base
  anchored intervals for mark compatibility?
- Should initial docs use the current UCSC BAM example or a different BAM with
  clearer mismatches and indels?

## Success Criteria for the Initial Version

The first version is successful if:

- an IGV-like local BAM pileup and coverage view can be expressed as a normal
  GenomeSpy spec
- the view is useful for inspecting read support around SNVs and small indels
- the spec demonstrates at least one meaningful customization of the BAM pileup
  or coverage semantics
- the new transforms are independently tested and documented
- limitations are clear enough that users do not mistake the feature for full
  IGV parity

## Detailed Milestone 3 Plan: Composable Coverage Summary

Milestone 3 should make the coverage track more useful without adding a new
BAM-specific summary transform. The implementation should first try ordinary
GenomeSpy composition: `coverage` for total aligned-base depth, and
`alignmentMismatches + aggregate + stack` for allele-colored mismatch support.

### Investigation Summary

The existing transforms support this design:

- `coverage` is a sorted interval-depth transform. It is suitable for the
  ordinary coverage histogram when it receives `flattenCigar` rows filtered to
  aligned operations.
- `alignmentMismatches` emits one row per observed non-reference aligned base.
- `aggregate` can count mismatch rows by chromosome, reference position, and
  observed read base.
- `stack` can turn per-base mismatch counts into ranged y-values for stacked
  bars.
- Lazy sources publish a single file batch for the loaded window, so
  batch-oriented `aggregate` and `stack` summarize the current window rather
  than individual records.

A dataflow smoke test with three reads at the same locus confirmed this row
shape. With the milestone output field names, the stacked mismatch rows would
look like:

```json
[
  {
    "chrom": "chr1",
    "mismatchStart": 104,
    "mismatchEnd": 105,
    "base": "G",
    "count": 2,
    "mismatchCount0": 0,
    "mismatchCount1": 2
  },
  {
    "chrom": "chr1",
    "mismatchStart": 104,
    "mismatchEnd": 105,
    "base": "T",
    "count": 1,
    "mismatchCount0": 2,
    "mismatchCount1": 3
  }
]
```

The limitation is semantic, not mechanical: this chain summarizes only
non-reference mismatch evidence. It does not materialize matching reference
bases, so it cannot produce full A/C/G/T/reference-base consensus counts without
another source of reference bases or a heavier per-base alignment expansion.

### Milestone 3 Goal

After Milestone 3, the BAM example should show:

- total aligned-base depth in the coverage track
- stacked colored mismatch bars at loci with non-reference support
- base-quality filtering before mismatch aggregation
- the same base color palette used by the indexed FASTA sequence example
- shared read filtering, MAPQ normalization, and pileup assignment before the
  coverage/read views split
- a read pileup that still shows read bodies, CIGAR overlays, and per-read
  mismatch marks

No new core transform should be added in this milestone unless the ordinary
transform chain proves inadequate during implementation.

### Milestone 3 Scope Decisions

- Use `coverage` for depth. The initial depth semantics are aligned read bases:
  `M`, `=`, and `X` via `cigarType == 'aligned'`.
- Do not count `D` deletion operations in the total depth histogram yet.
  Deletion-aware depth is a separate design choice because deleted reference
  bases have read support but no read base.
- Use `alignmentMismatches` for mismatch evidence. Reads without `MD` tags can
  still contribute to total depth, but they should be filtered out before
  mismatch aggregation.
- Apply `minBaseQuality` before `aggregate`, so low-quality bases do not
  contribute to the stacked mismatch counts.
- Hoist shared read-level filtering, `mapqOrZero`, and `pileup` to the root
  transform so coverage and read layers derive from the same filtered read
  stream.
- Do not join to FASTA or infer reference bases from another source.
- Treat insertion and deletion summary bars as later work. The read pileup
  already shows insertions and deletions through `flattenCigar`.

### Milestone 3 Files

Modify:

- `examples/docs/grammar/data/lazy/bam-read-alignments.json`
  - Move the read-level MAPQ filter, `mapqOrZero` formula, and `pileup`
    assignment to the root transform.
  - Convert the coverage track to a layered view.
  - Keep the current depth layer based on `flattenCigar + coverage`.
  - Add a mismatch-summary layer based on
    `alignmentMismatches + aggregate + stack`.
  - Use the same A/C/T/G/N palette as
    `examples/docs/genomic-data/examples/indexed-fasta-sequence-track.json`.
- `docs/grammar/data/lazy.md`
  - Replace "allele-aware coverage is planned" wording with a statement that
    mismatch support can be summarized in coverage tracks using ordinary
    transforms.
- `BAM_ALIGNMENT_PLAN.md`
  - Keep this milestone plan in sync with the implemented example.

Optional local-only update:

- `private/bam/bam-read-alignments.json`
  - Apply the same coverage-track structure for manual testing with the
    private NA12878 BAM. This file remains ignored by git.

No `packages/core/src` changes are expected for this milestone.

### Shared Read Dataflow

The example should follow the private BAM spec's simpler dataflow shape: perform
read-level filtering and lane assignment once before the views split. Coverage,
CIGAR overlays, read bodies, per-read mismatch marks, and mismatch-summary bars
then derive from the same filtered read stream.

```json
{
  "transform": [
    {
      "type": "filter",
      "expr": "datum.mapq == null || datum.mapq >= minMapq"
    },
    {
      "type": "formula",
      "expr": "datum.mapq == null ? 0 : datum.mapq",
      "as": "mapqOrZero"
    },
    { "type": "pileup", "start": "start", "end": "end", "as": "_lane" }
  ],
  "vconcat": ["coverage view", "read pileup view"]
}
```

This avoids duplicating the MAPQ filter and keeps all read-derived layers
consistent. It also means the coverage histogram reflects the same read-level
filters as the pileup. If later examples need unfiltered coverage plus filtered
reads, they can move the filter back into only the read view.

### Coverage Track Structure

The coverage view should become a `LayerView` with one layer for total depth and
one layer for stacked mismatch support:

```json
{
  "name": "coverage",
  "title": "Coverage",
  "height": 40,
  "resolve": { "scale": { "color": "independent" } },
  "layer": [
    {
      "name": "depth",
      "title": "Depth",
      "transform": [
        { "type": "flattenCigar" },
        { "type": "filter", "expr": "datum.cigarType == 'aligned'" },
        { "type": "collect", "sort": { "field": ["chrom", "cigarStart"] } },
        {
          "type": "coverage",
          "chrom": "chrom",
          "start": "cigarStart",
          "end": "cigarEnd",
          "as": "coverage",
          "asStart": "start",
          "asEnd": "end"
        }
      ],
      "mark": "rect",
      "encoding": {
        "x": { "chrom": "chrom", "pos": "start", "type": "locus" },
        "x2": { "chrom": "chrom", "pos": "end" },
        "y": {
          "field": "coverage",
          "type": "quantitative",
          "axis": { "tickCount": 2 }
        },
        "color": { "value": "#d0d0d0" }
      }
    },
    {
      "name": "mismatch-summary",
      "title": "Mismatch support",
      "transform": [
        { "type": "filter", "expr": "datum.md != null" },
        { "type": "alignmentMismatches" },
        {
          "type": "filter",
          "expr": "datum.baseQuality == null || datum.baseQuality >= minBaseQuality"
        },
        {
          "type": "aggregate",
          "groupby": ["chrom", "mismatchStart", "base"]
        },
        {
          "type": "stack",
          "field": "count",
          "groupby": ["chrom", "mismatchStart"],
          "sort": { "field": "base", "order": "ascending" },
          "as": ["mismatchCount0", "mismatchCount1"]
        },
        {
          "type": "formula",
          "expr": "datum.mismatchStart + 1",
          "as": "mismatchEnd"
        }
      ],
      "mark": "rect",
      "encoding": {
        "x": {
          "chrom": "chrom",
          "pos": "mismatchStart",
          "type": "locus",
          "band": 0
        },
        "x2": { "chrom": "chrom", "pos": "mismatchEnd", "band": 0 },
        "y": { "field": "mismatchCount0", "type": "quantitative" },
        "y2": { "field": "mismatchCount1" },
        "color": {
          "field": "base",
          "type": "nominal",
          "scale": {
            "domain": ["A", "C", "T", "G", "a", "c", "t", "g", "N"],
            "range": [
              "#7BD56C",
              "#FF9B9B",
              "#86BBF1",
              "#FFC56C",
              "#7BD56C",
              "#FF9B9B",
              "#86BBF1",
              "#FFC56C",
              "#E0E0E0"
            ]
          },
          "legend": null
        }
      }
    }
  ]
}
```

The mismatch-summary layer should share the coverage track's y-scale so stacked
mismatch height is directly comparable to total depth. It should not replace the
read-level mismatch marks; the coverage summary and read pileup answer different
questions.

### Implementation Steps

1. Move the public BAM example's MAPQ filter, `mapqOrZero` formula, and
   `pileup` transform from the read view to the root transform.
2. Refactor the public BAM example's coverage view from a single mark view into
   a `layer` view.
3. Move the current `flattenCigar + coverage` chain into a child layer named
   `depth`.
4. Add a second child layer named `mismatch-summary` with the transform chain
   shown above.
5. Use the indexed FASTA sequence palette for mismatch-summary colors.
6. Keep `minBaseQuality` as the only base-quality control for both per-read
   mismatch marks and coverage-summary mismatch bars.
7. Update the lazy BAM documentation to explain that mismatch support can be
   summarized using `aggregate` and `stack`.
8. Optionally mirror the public example changes in the ignored private BAM spec
   for manual inspection.

### Verification

Run the focused transform tests to ensure the inputs to the composed summary are
still correct:

```sh
npx vitest run packages/core/src/data/transforms/mdUtils.test.js packages/core/src/data/transforms/alignmentMismatches.test.js
```

Validate the public example against the generated schema after editing it. Also
run the docs build because the example is embedded in user-facing
documentation:

```sh
npm run build:docs
```

If the private BAM spec is updated, validate it with the same generated-schema
check used for the public example. No new permanent unit test is required unless
implementation exposes a bug or requires a change to core transform behavior.

### Milestone 3 Commit Sequence

Suggested commits:

1. `docs: plan composable BAM coverage summary`
2. `docs: show BAM mismatch coverage summary`

If implementation requires core fixes, split them into separate `fix(core): ...`
or `feat(core): ...` commits before the example commit.

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

Milestones 1-3 added richer read fields, shared CIGAR parsing helpers,
`flattenCigar`, sparse mismatch extraction through `alignmentMismatches`, and
an example that combines ordinary GenomeSpy transforms for an IGV-like view.
The BAM example now renders:

- total coverage computed from aligned CIGAR blocks
- stacked mismatch support in the coverage track using
  `alignmentMismatches`, `aggregate`, and `stack`
- read pileup rendered as directional read bodies with CIGAR overlays
- per-read mismatch overlays derived from `CIGAR + MD + SEQ + QUAL`

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

## Initial Scope Status

The initial useful scope for short-read local inspection around SNVs and small
indels is now in place:

1. Expose richer read-level BAM fields from the lazy BAM source.
2. Add CIGAR-derived row expansion.
3. Add sparse mismatch extraction.
4. Add an allele-colored mismatch summary in the coverage track using existing
   transforms.
5. Update the BAM example to demonstrate an IGV-like but customizable alignment
   evidence view.

The example demonstrates:

- CIGAR-aware read bodies
- deletions
- insertion markers
- clipped-end markers
- mismatch overlays
- MAPQ opacity
- coverage depth with allele-colored evidence
- customization hooks for MAPQ and base-quality thresholds

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
not materialized as rows. The current allele-colored coverage view therefore
shows:

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

The BAM example is structured as an ordinary layered and concatenated GenomeSpy
spec.

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

The example makes the composability explicit. It includes visible
customization, such as filtering by MAPQ and base quality, rather than only
showing a fixed IGV-like rendering.

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

## Milestone Status

### Completed: Raw BAM Fields and CIGAR Rows

- Expose `seq`, `qual`, `md`, `flags`, and selected flag booleans from
  `bamSource`.
- Add a shared CIGAR walker.
- Add `flattenCigar`.
- Update the example to show CIGAR-aware read bodies, deletions, insertions, and
  clipping.

### Completed: Mismatch Evidence

- Add `alignmentMismatches`.
- Add mismatch overlays colored by base.
- Add base-quality opacity or filtering.
- Ensure the example supports local SNV inspection.

### Completed: Composable Coverage Summary

- Use `coverage` for aligned-base depth.
- Use `alignmentMismatches`, `aggregate`, and `stack` for allele-colored
  mismatch bars.
- Keep quality thresholds in the ordinary transform chain.

### Remaining: Customization and Documentation

- Add one or two visible customization controls to the example.
- Update user-facing docs.
- Document limitations and future directions.

### Later Possibilities

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

## Remaining Gaps

The initial version is useful for SNV and small-indel inspection but still has
clear limits:

- mismatch summary bars show non-reference support only; matching reference
  bases are represented by total depth, not per-base consensus counts
- deletion and insertion support are visible in the read pileup but not yet
  summarized in the coverage track
- paired-end, supplementary, chimeric, RNA-seq junction, and downsampling
  conventions remain future work
- docs should be kept explicit that this is composable BAM evidence support,
  not full IGV track parity

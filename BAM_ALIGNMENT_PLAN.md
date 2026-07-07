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
- base-aware coverage or pileup summaries for depth and allele composition

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

The existing lazy BAM source is intentionally minimal. It currently publishes
only read-level fields such as:

- `chrom`
- `start`
- `end`
- `name`
- `cigar`
- `mapq`
- `strand`

The current BAM example renders two tracks:

- coverage computed from read start and end
- read pileup rendered as strand-colored arrow marks

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
4. Add a base-aware coverage or pileup summary.
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

It should parse `CIGAR + MD + SEQ + QUAL`. If `=` and `X` CIGAR operations are
present, `X` can identify mismatches directly. For ordinary `M`, `MD` or a
reference sequence is needed to distinguish matches from mismatches.

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
    refBase?: "A" | "C" | "G" | "T" | "N" | string;
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

The transform should fail fast when required fields are missing for an operation
that needs them. A future version may support reference-backed mismatch
extraction when an indexed FASTA source is available.

## Transform: Base-Aware Coverage or Pileup

The current `coverage` transform counts interval depth. BAM alignment coverage
needs a richer summary for variant evidence:

- total depth
- base counts for A, C, G, T, N
- optional strand-split counts
- optional quality-weighted counts
- deletion and insertion support counts

There are two viable directions:

1. Add a new transform such as `alignmentCoverage`.
2. Add lower-level mismatch/indel rows and rely on existing aggregate
   transforms.

The first version should probably add a dedicated `alignmentCoverage` transform
because coverage semantics are common, performance-sensitive, and easy to get
wrong if every spec author must reconstruct them.

Tentative props:

```ts
export interface AlignmentCoverageParams extends TransformParamsBase {
    type: "alignmentCoverage";

    chrom?: Field;
    start?: Field;
    cigar?: Field;
    sequence?: Field;
    quality?: Field;
    md?: Field;
    strand?: Field;

    /**
     * Minimum base quality included in base counts.
     *
     * Default: 0
     */
    minBaseQuality?: number;

    /**
     * If true, base counts are weighted by base quality.
     *
     * Default: false
     */
    qualityWeighted?: boolean;
}
```

The transform should emit fixed output fields:

```ts
interface AlignmentCoverageDatum {
    chrom?: string;
    start: number;
    end: number;
    depth: number;
    A: number;
    C: number;
    G: number;
    T: number;
    N: number;
    deletionCount: number;
    insertionCount: number;
    forwardCount?: number;
    reverseCount?: number;
}
```

This transform can be deferred until after `flattenCigar` and
`alignmentMismatches` if implementation needs to be split into smaller pieces.
However, a base-aware coverage summary is important for an initial version that
is useful rather than merely decorative.

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

`flattenCigar`, `alignmentMismatches`, and `alignmentCoverage` should share a
small CIGAR walking helper. The helper should maintain both cursors:

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
- `alignmentCoverage`: probably `BEHAVIOR_CLONES` if it emits new summary rows,
  but it may need batch or sorted-stream state similar to `coverage`

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
- `alignmentCoverage` summaries for simple reads, indels, base qualities, and
  strand splits.
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

### Milestone 3: Base-Aware Coverage

- Add `alignmentCoverage`.
- Add allele-colored coverage bars and depth summaries.
- Support quality thresholds and possibly strand-split counts.

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
- Should `alignmentCoverage` require `MD`, or should it support reference-backed
  extraction from indexed FASTA later?
- Should missing `MD` in mismatch-related transforms fail immediately or produce
  no mismatch rows with a warning?
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

## Initial Planning Commit Messages

Use these commit messages for the planning-only changes before implementation
starts:

1. `docs: add BAM alignment support plan`
2. `docs: detail BAM alignment milestone 1 plan`

## Detailed Milestone 1 Plan: Raw BAM Fields and CIGAR Rows

Milestone 1 should produce a working, testable foundation for CIGAR-aware read
rendering. It should not attempt per-base mismatch rendering or base-aware
coverage yet. Those belong to later milestones.

### Milestone 1 Goal

After Milestone 1, a GenomeSpy spec should be able to:

- load BAM reads with richer read-level fields
- assign one pileup lane per read
- expand reads into CIGAR operation rows
- render aligned read blocks using CIGAR-aware intervals
- render deletion, insertion, skip, and clipping markers from the same data
- keep ordinary `filter`, `formula`, `project`, `coverage`, and `pileup`
  transforms usable in the chain

### Milestone 1 Scope Decisions

- Use CIGAR strings as the transform input for the first implementation.
  `@gmod/bam` exposes `record.CIGAR`, and the existing source already publishes
  it as `cigar`. Numeric CIGAR support can be added later if profiling shows
  parsing strings is a problem.
- Emit fixed semantic output fields from `flattenCigar`.
- Keep insertion and clipping operations as zero-width reference-anchored rows
  in Milestone 1. Marker layers can render them using `x` or a very small
  constant-size mark.
- Leave `alignmentMismatches` and `alignmentCoverage` out of Milestone 1.
- Keep the current depth coverage track, but compute it from aligned CIGAR
  blocks rather than raw read start/end where practical.

### Milestone 1 Files

Create:

- `packages/core/src/data/transforms/cigarUtils.js`
  - Shared CIGAR parsing and walking helpers.
- `packages/core/src/data/transforms/cigarUtils.test.js`
  - Unit tests for CIGAR parsing and cursor movement.
- `packages/core/src/data/transforms/flattenCigar.js`
  - Row-expanding transform that emits one row per CIGAR operation.
- `packages/core/src/data/transforms/flattenCigar.test.js`
  - Transform contract tests for representative CIGAR strings.

Modify:

- `packages/core/src/data/sources/lazy/bamSource.js`
  - Expose richer BAM read fields.
- `packages/core/src/data/transforms/transformFactory.js`
  - Register `flattenCigar`.
- `packages/core/src/spec/transform.d.ts`
  - Add user-facing `FlattenCigarParams` docs and include it in
    `TransformParams`.
- `examples/docs/grammar/data/lazy/bam-read-alignments.json`
  - Revise the example to use CIGAR-aware read blocks and markers.
- `docs/grammar/data/lazy.md`
  - Keep the existing work-in-progress warning, but mention that CIGAR rows are
    now available once the feature lands.

Optional if needed:

- `packages/core/src/data/sources/lazy/bamSource.test.js`
  - Test record-to-datum mapping if the mapping is extracted into a pure helper.

### Milestone 1 Output Contracts

#### BAM Read Rows

The BAM source should continue to emit the existing fields and add fields needed
by Milestone 1 and Milestone 2:

```ts
interface BamReadDatum {
    chrom: string;
    start: number;
    end: number;
    name: string;
    cigar: string;
    mapq?: number;
    strand: "+" | "-";

    seq: string;
    qual?: number[];
    md?: string;
    flags: number;

    isPaired: boolean;
    isProperPair: boolean;
    isDuplicate: boolean;
    isQcFail: boolean;
    isSecondary: boolean;
    isSupplementary: boolean;
}
```

Milestone 1 does not need to expose mate coordinates yet. Pair visualization is
out of scope.

#### CIGAR Operation Rows

`flattenCigar` should clone each input read row and add:

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

Coordinate rules must be implemented from the SAMv1 specification, section
1.4 and the CIGAR operation table. The bullets below restate the intended
behavior for this feature, but implementers must verify them against the
specification rather than relying on this plan alone:

- `M`, `=`, `X`: `cigarStart = refPos`, `cigarEnd = refPos + length`,
  `readStart = readPos`, `readEnd = readPos + length`
- `I`: `cigarStart = refPos`, `cigarEnd = refPos`, `readStart = readPos`,
  `readEnd = readPos + length`
- `D`, `N`: `cigarStart = refPos`, `cigarEnd = refPos + length`,
  `readStart = readPos`, `readEnd = readPos`
- `S`: `cigarStart = refPos`, `cigarEnd = refPos`, `readStart = readPos`,
  `readEnd = readPos + length`
- `H`, `P`: `cigarStart = refPos`, `cigarEnd = refPos`,
  `readStart = readPos`, `readEnd = readPos`

Cursor advancement must follow the SAMv1 CIGAR operation table:

```text
M, =, X advance refPos and readPos
I, S    advance readPos only
D, N    advance refPos only
H, P    advance neither cursor
```

### Milestone 1 Task Breakdown

#### Task 1: Add CIGAR Parsing Helpers

Create `packages/core/src/data/transforms/cigarUtils.js`.

Responsibilities:

- base parsing and cursor semantics on SAMv1, section 1.4 and the CIGAR
  operation table
- parse CIGAR strings into `{ op, length }` operations
- reject malformed CIGAR strings with clear errors
- walk operations from a reference start position
- produce operation descriptors using the fixed coordinate rules above

Suggested exported API:

```js
// CIGAR operation parsing follows SAMv1, section 1.4 and the CIGAR operation
// table: https://samtools.github.io/hts-specs/SAMv1.pdf
// Keep this implementation aligned with the spec's query/reference
// consumption rules for M, I, D, N, S, H, P, =, and X.

/**
 * @typedef {"M" | "I" | "D" | "N" | "S" | "H" | "P" | "=" | "X"} CigarOp
 *
 * @typedef {object} CigarOperation
 * @prop {CigarOp} op
 * @prop {number} length
 *
 * @typedef {object} CigarOperationLayout
 * @prop {CigarOp} cigarOp
 * @prop {number} cigarLength
 * @prop {number} cigarStart
 * @prop {number} cigarEnd
 * @prop {number} readStart
 * @prop {number} readEnd
 * @prop {string} cigarType
 */

export function parseCigar(cigar) {
    // Returns CigarOperation[].
}

export function* walkCigar(cigar, start) {
    // Yields CigarOperationLayout objects.
}
```

The generated `cigarUtils.js` file should include a concise comment like the
one above near the parser or operation table. The comment should cite SAMv1 and
explain that the implementation follows the spec's query/reference consumption
rules. Avoid comments that merely repeat what the code does.

Tests in `packages/core/src/data/transforms/cigarUtils.test.js` should cover:

- `10M`
- `5S10M2I4M3D6M1S`
- `8M100N12M`
- `3H5S10M2P4M`
- `4=1X5=`
- malformed strings such as `""`, `"M10"`, `"10Q"`, and `"10M2"`

Run:

```sh
npx vitest run packages/core/src/data/transforms/cigarUtils.test.js
```

#### Task 2: Add the `flattenCigar` Transform

Create `packages/core/src/data/transforms/flattenCigar.js`.

Behavior:

- Use `BEHAVIOR_CLONES`.
- Read `start` from `params.start ?? "start"`.
- Read `cigar` from `params.cigar ?? "cigar"`.
- For each walked CIGAR operation, clone the input datum, add fixed CIGAR
  output fields, and propagate the clone.
- Fail fast if `start` is not a finite number.
- Fail fast if `cigar` is not a non-empty string.

Tentative params:

```ts
export interface FlattenCigarParams extends TransformParamsBase {
    type: "flattenCigar";

    /**
     * The read's reference start coordinate.
     *
     * __Default value:__ `"start"`
     */
    start?: Field;

    /**
     * The CIGAR string.
     *
     * __Default value:__ `"cigar"`
     */
    cigar?: Field;
}
```

Tests in `packages/core/src/data/transforms/flattenCigar.test.js` should verify:

- one input row produces one row per CIGAR operation
- input fields such as `name`, `chrom`, and `_lane` are preserved
- aligned operations have expected reference and read intervals
- insertions and soft clips are zero-width reference-anchored rows
- malformed CIGARs fail loudly

Run:

```sh
npx vitest run packages/core/src/data/transforms/flattenCigar.test.js
```

#### Task 3: Register and Document the Transform

Modify `packages/core/src/data/transforms/transformFactory.js`:

- import `FlattenCigarTransform`
- add `flattenCigar: FlattenCigarTransform` to the `transforms` registry

Modify `packages/core/src/spec/transform.d.ts`:

- add `FlattenCigarParams`
- document fixed output fields in the JSDoc
- add `FlattenCigarParams` to the `TransformParams` union

Documentation should use user-facing wording and avoid internal implementation
details except where needed to explain coordinate semantics.

Run:

```sh
npx vitest run packages/core/src/spec/schema.test.js packages/core/src/data/transforms/flattenCigar.test.js
```

If schema artifacts are affected, run the repo's schema/docs build commands
before committing that implementation.

#### Task 4: Expose Richer Read Fields from `bamSource`

Modify `packages/core/src/data/sources/lazy/bamSource.js`.

Read-level mapping should include:

```js
{
    chrom: d.chrom,
    start: record.start,
    end: record.end,
    name: record.name,
    cigar: record.CIGAR,
    mapq: record.mq,
    strand: record.strand === 1 ? "+" : "-",
    seq: record.seq,
    qual: record.qual ? Array.from(record.qual) : undefined,
    md: record.getTag("MD"),
    flags: record.flags,
    isPaired: record.isPaired(),
    isProperPair: record.isProperlyPaired(),
    isDuplicate: record.isDuplicate(),
    isQcFail: record.isFailedQc(),
    isSecondary: record.isSecondary(),
    isSupplementary: record.isSupplementary()
}
```

If the mapping becomes awkward to test inside `BamSource`, extract it into a
small exported helper in the same file or a nearby file and test that helper
with a lightweight fake record object.

Run at minimum:

```sh
npx vitest run packages/core/src/data/transforms/flattenCigar.test.js
```

If a source mapping test is added, also run:

```sh
npx vitest run packages/core/src/data/sources/lazy/bamSource.test.js
```

#### Task 5: Update the BAM Example

Modify `examples/docs/grammar/data/lazy/bam-read-alignments.json`.

The example should show CIGAR-aware read layout without waiting for mismatch
support:

- Keep the lazy BAM source.
- Add a `minMapq` parameter.
- Keep `laneHeight`.
- Compute coverage from aligned CIGAR blocks:

```json
[
  { "type": "flattenCigar" },
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

- In the read track, run `pileup` before `flattenCigar`:

```json
[
  { "type": "filter", "expr": "datum.mapq == null || datum.mapq >= minMapq" },
  { "type": "pileup", "start": "start", "end": "end", "as": "_lane" },
  { "type": "flattenCigar" }
]
```

- Render aligned blocks with `rect`.
- Render deletions with a thin black `rect` or `rule`.
- Render insertions with a text marker such as `"I"` or a narrow rule.
- Render soft clips with a distinct marker at the read end.
- Use `mapq` opacity for read blocks.
- Keep strand direction if the current `arrow` mark remains useful, but prefer
  CIGAR-aware block rendering over a single whole-read arrow.

The example does not need to show mismatches in Milestone 1. It should make the
absence clear by not claiming variant evidence support yet.

Run a focused schema/spec check if available. If there is no focused command,
run:

```sh
npm test
```

For a lighter check while developing, run the focused transform tests and inspect
the example manually in the docs/dev server.

#### Task 6: Update Docs for the Milestone 1 Feature Set

Modify `docs/grammar/data/lazy.md`.

The BAM section should say:

- BAM support is still incremental.
- The source exposes read-level fields.
- `flattenCigar` can derive CIGAR operation rows for custom alignment views.
- Mismatch and base-aware coverage support are planned for later milestones.

Avoid claiming that GenomeSpy has full IGV-like BAM support after Milestone 1.

Run docs/schema build only if type docs or schema generation requires it.

### Milestone 1 Verification Checklist

Before considering Milestone 1 complete:

- `npx vitest run packages/core/src/data/transforms/cigarUtils.test.js` passes.
- `npx vitest run packages/core/src/data/transforms/flattenCigar.test.js`
  passes.
- Any added BAM source mapping tests pass.
- The updated example validates against the schema.
- The updated example can render a coverage track and CIGAR-aware read track.
- The read track preserves one lane per read after `flattenCigar`.
- Insertions, deletions, skips, and clips are visible or explicitly represented
  in separate layers.
- The docs do not overstate the feature as full BAM/IGV support.

### Milestone 1 Commit Sequence

Use small commits so review can separate parsing, transform plumbing, source
fields, and example work:

1. `feat(core): add CIGAR parsing helpers`
2. `feat(core): add flattenCigar transform`
3. `feat(core): expose BAM read fields`
4. `docs(core): document CIGAR-derived BAM rows`
5. `docs: update BAM alignment example`

The exact commit messages can be adjusted to match the final file scope.

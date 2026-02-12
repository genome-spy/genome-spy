# Tooltip Plan: Genomic Coordinate Formatting and Raw Field Handling

## Rationale

Current tooltips show raw genomic fields as-is, which causes three practical problems:

1. Coordinate notation ambiguity:
   Values may originally be one-based or zero-based and closed or half-open.
2. Information quality:
   Tooltips often expose implementation-oriented fields instead of human-readable genomic locations.

GenomeSpy already normalizes genomic coordinates through `LinearizeGenomicCoordinate` when configured correctly, and normalized coordinates can be rendered reliably with genome-aware formatters (`formatInterval`, plus a new locus formatter).

This plan introduces ergonomic defaults while keeping behavior safe when provenance is uncertain.

## Goals

1. Show genomic coordinates in a human-readable form by default.
2. Support three display forms:
   - locus (single position, e.g. SNVs)
   - interval (segment-like data)
   - endpoints (two independent loci, e.g. translocations)
3. Support both automatically inserted and manually added `LinearizeGenomicCoordinate`.
4. Improve custom handler ergonomics by avoiding deep internal traversal in handler code.
5. Avoid incorrect hiding of raw fields when provenance is unclear.

## Non-goals

1. Full dataflow provenance tracking for arbitrary transform chains.
2. Breaking tooltip handler API compatibility in this major version.
3. Replacing `mark` parameter in handler signature now (documented TODO remains).

## Key Design Decisions

### 1) Stable tooltip context (backward-compatible API extension)

Tooltip handlers will receive an optional 4th argument:

- `context` (new, stable shape for tooltip-relevant precomputed info)

Existing handlers with 3 arguments continue to work.

### 2) Genomic formatting source of truth: encoders

Formatting will use encoded locus coordinates (`x`, `x2`, `y`, `y2`) from encoders and locus scales. This makes formatting robust regardless of whether linearization was inserted automatically or manually.

### 3) Raw-field hiding policy: prove-or-don’t-hide

Raw fields are hidden only when mapping can be verified. If mapping is ambiguous or inconsistent, raw fields stay visible.

### 4) Axis-level display mode with `auto` default

Display mode is configurable via tooltip params (not inferred from mark type):

- `locus`
- `interval`
- `endpoints`
- `disabled`
- `auto` (default)

`auto` behavior:

1. One coordinate -> `locus`
2. Two coordinates with same mapping group -> `interval`
3. Two coordinates with different mapping groups -> `endpoints`
4. `disabled` -> no special genomic formatting or hiding

### 5) Neutral naming

Use `endpoint 1` / `endpoint 2` labels for endpoint mode. Avoid domain-specific naming such as `breakpoint`.

## Proposed API Additions

### Tooltip handler signature

Current:

```ts
(datum, mark, params?) => Promise<...>
```

Planned (backward-compatible):

```ts
(datum, mark, params?, context?) => Promise<...>
```

### Tooltip params (default handler)

```json
{
  "handler": "default",
  "params": {
    "genomicCoordinates": {
      "x": { "mode": "auto" },
      "y": { "mode": "auto" }
    }
  }
}
```

If omitted, defaults are applied internally as `auto`.

## Execution Cadence

Each implementation step is completed using the following workflow:

1. Implement only the current step's code changes.
2. Run relevant Vitest tests for touched behavior/files.
3. Run TypeScript checks:
   - `npm -ws run test:tsc --if-present`
4. Commit the step before moving to the next step.

## Implementation Plan

### Step 1: Add locus formatter in Genome API

Files:

- `packages/core/src/genome/genome.js`
- `packages/core/src/genome/locusFormat.js` (reuse existing formatter)

Changes:

1. Add `Genome.formatLocus(continuousPos)` to produce human-readable, genome-aware locus strings.
2. Continue using `Genome.formatInterval(interval)` for range rendering.

### Step 2: Extend tooltip handler typing

Files:

- `packages/core/src/tooltip/tooltipHandler.ts`

Changes:

1. Add `TooltipContext` type.
2. Extend `TooltipHandler` type to accept optional `context`.
3. Keep existing compatibility and TODO regarding `mark` leakage.

### Step 3: Build tooltip context in core

Files:

- `packages/core/src/tooltip/tooltipContext.js` (new)
- `packages/core/src/genomeSpy/interactionController.js`

Changes:

1. Introduce context builder invoked at hover-time before handler call.
2. Context includes:
   - flattened rows from datum
   - derived genomic display rows
   - `hiddenSourceFields` (verified only)
3. Pass context as the optional 4th argument to handlers.

### Step 4: Determine genomic display rows

Files:

- `packages/core/src/tooltip/tooltipContext.js` (new)

Changes:

1. Use encoders/scales to identify active locus channels.
2. Read encoded continuous values from datum for `x/x2/y/y2`.
3. Resolve mode per axis (`locus`, `interval`, `endpoints`, `disabled`, `auto`).
4. Build derived rows:
   - `locus` -> one row
   - `interval` -> one row
   - `endpoints` -> two rows: `endpoint 1`, `endpoint 2`
   - `disabled` -> no derived genomic rows

### Step 5: Raw field hiding with verification

Files:

- `packages/core/src/tooltip/tooltipContext.js` (new)

Changes:

1. Build candidate mappings from upstream `LinearizeGenomicCoordinate.params`:
   - `as[i] -> { chrom, pos[i], offset[i], groupId }`
2. For each candidate used in active genomic rendering, verify equality for current datum:
   - `genome.toContinuous(chrom, pos - offset)` equals encoded linearized value
3. Hide only fields from verified mappings.
4. Always keep conservative fallback:
   - if uncertain, do not hide.

### Step 6: Refactor default handler to consume context

Files:

- `packages/core/src/tooltip/dataTooltipHandler.js`

Changes:

1. Render derived genomic rows as the first data rows in the tooltip.
2. Filter raw rows by `hiddenSourceFields`.
3. Preserve existing title/table style.
4. Show remaining raw datum fields after derived genomic rows.
5. Keep underscore-prefixed field filtering.

### Step 7: Documentation updates

Files:

- `docs/api.md`

Changes:

1. Document optional 4th handler argument (`context`).
2. Document default genomic behavior and mode options.
3. Clarify conservative hiding policy.

## Testing Plan

### Unit tests: tooltip context/default handler

New/updated tests:

1. SNV-like locus:
   - one locus channel
   - renders formatted locus string
2. Segment-like interval:
   - two coords in same mapping group
   - renders interval string
3. Two-endpoint case (SV-like):
   - two coords in different mapping groups
   - renders `endpoint 1` and `endpoint 2`
4. Forced mode override:
   - `interval` / `endpoints` / `locus` / `disabled` honored with sensible fallback
5. Verified hiding:
   - hide only fields from mappings passing equality check
6. Ambiguous or missing mapping:
   - no hide
7. Post-linearization mutation mismatch:
   - no hide
8. Existing 3-arg custom handler compatibility:
   - still invoked correctly

### Integration-level regression case

Use spec:

- `packages/core/private/decider_set2-19/sv.json`

Checks:

1. Endpoint display is human-readable and comma-separated.
2. Endpoint labels are neutral.
3. Unused raw fields (for example `end1`, `end2` if not used in displayed mapping) remain visible.

## Risks and Mitigations

Risk 1:
Manual transform chains may change values after linearization.

Mitigation:
Only hide fields after per-datum equality verification.

Risk 2:
Ambiguous `as` mappings from multiple transforms.

Mitigation:
Fail safe: no hide on ambiguity.

Risk 3:
Handler ecosystem compatibility.

Mitigation:
Add optional context argument only; preserve old call contract.

## Acceptance Criteria

1. Default tooltips show formatted genomic values for locus scales without requiring spec changes.
2. Locus, interval, endpoints, and disabled modes are supported and configurable per axis.
3. `auto` chooses representation from mapping structure, not mark type.
4. Derived genomic rows are shown as the first data rows in the tooltip.
5. Raw fields are hidden only when mapping verification succeeds.
6. Manual `LinearizeGenomicCoordinate` workflows are supported.
7. Existing custom handlers that accept only `(datum, mark, params)` still work unchanged.
8. SV-like two-endpoint examples render neutral endpoint labels with correct formatting.

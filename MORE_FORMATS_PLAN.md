# More Formats Plan (BED/BEDPE Scope)

## Goal

Focus this branch on eager support for:

- `bed`
- `bedpe`

`seg`, `maf`, and `cn` are explicitly deferred.

## Current status

Done in this branch:

- eager BED loader based on `@gmod/bed`
- eager BEDPE loader with sentinel handling (`.` and `-1` -> `null`)
- parse-policy handling for genomic custom formats (`parse: "auto"` is not forced)
- BED/BEDPE docs and examples under `packages/core/examples/genomic/`

## Remaining work (if any)

1. Keep BED/BEDPE docs and examples aligned with implementation.
2. Keep BEDPE examples based on `link` marks and large coordinate ranges.
3. Keep field-name matching explicit (no automatic name normalization).

## Out of scope in this branch

- `seg` support
- `maf` support
- `cn` support

## References

- BED (UCSC): <https://genome.ucsc.edu/FAQ/FAQformat#format1>
- BEDPE (bedtools): <https://bedtools.readthedocs.io/en/latest/content/general-usage.html#bedpe-format>

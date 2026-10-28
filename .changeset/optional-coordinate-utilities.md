---
"@genome-spy/core": minor
"@genome-spy/app": patch
---

<!-- category: feature -->

Parse and format genomic locations through the optional `@genome-spy/core/coordinates`
entry, with optional validation against a locus scale's resolved assembly. App
uses the same utilities and rejects invalid coordinate input. Custom contig names
now take precedence over aliases, and locus domain readback correctly covers
one-base views and fractional chromosome boundaries. The internal
`Genome.parseInterval()` method was removed; use `parseCoordinates()`, which
returns a tagged result containing chromosome-relative endpoints instead of
whole-genome numeric offsets. Both parsers use zero-based half-open intervals.

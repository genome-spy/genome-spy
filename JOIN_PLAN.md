# Lookup Transform Plan

## Rationale

GenomeSpy data transforms currently operate on one input stream. A lookup
transform would enrich those rows from a small, keyed table without requiring
the source data to be changed before it is loaded. This supports mappings such
as codon to amino-acid translation and metadata joins.

The lookup table must use the same `data` descriptors as visual data. A table
can therefore be inline, loaded from a URL in CSV, JSON, or Parquet format, or
provided as named data. Lookup data must not need a separate, invisible view in
the specification.

The initial feature is a one-to-one left lookup: every primary row is retained
and receives values from at most one matching table row. This is deliberately
not a general relational or interval join. A genomic range-overlap join has
different semantics and should be a separate feature.

## High-level design

The proposed syntax uses the explicit transform type already used by
GenomeSpy:

```json
{
  "type": "lookup",
  "from": {
    "data": {
      "url": "data/genetic-code.csv",
      "format": { "type": "csv" }
    },
    "key": ["codon"]
  },
  "fields": ["codon"],
  "values": ["aminoAcid"],
  "as": ["aminoAcid"],
  "default": "?"
}
```

`from` is a normal data descriptor. `fields` and `key` are aligned
field arrays that form an exact key tuple. `values` selects fields copied from
the matching row, `as` names their output fields, and `default` is written when
no row matches. If `as` is omitted, use the corresponding `values` names.
Reject duplicate foreign keys so accidental many-to-one joins fail clearly.

The flow builder creates the foreign source through the existing data-source
factory and attaches an internal collector. The lookup transform reads that
collector rather than adding a second structural parent to `FlowNode`:

```text
foreign source -> internal collector ---\
                                      lookup -> downstream collector
primary source -> primary transforms --/
```

The internal collector builds a `Map` from foreign keys to rows. Lookup probes
that map once per primary row, so building the table is O(m) and enriching n
primary rows is O(n). A foreign table must complete before lookup completes.
If the primary source finishes first, the transform retains its input until the
table is ready. The transform emits new objects and does not modify source
rows.

Table sources are auxiliary dataflow resources. They need normal source
initialization and loading, but no mark observer. Their collectors and sources
must be released when their lookup-owning view is disposed. The initial feature
does not reapply lookups when foreign data refreshes. Reload the primary data
to apply changed table values.

Genome metadata can later use this mechanism through a small genome-specific
table adapter. It should resolve chromosome aliases through `Genome` rather
than joining directly against `axisGenome` rows, whose `name` field contains
only canonical contig names.

## Implementation steps

1. Define the public transform contract in `packages/core/src/spec/transform.d.ts`.
   Add `LookupParams` and include it in `TransformParams`, with user-facing
   property documentation. Register the transform in
   `packages/core/src/data/transforms/transformFactory.js`.

   Tentative commit: `feat(core): add lookup transform schema`

2. Implement `packages/core/src/data/transforms/lookup.js`. It should validate
   the lookup configuration, build a unique `Map` index from the foreign
   collector, clone primary rows, copy requested values, and apply defaults for
   missing keys. Add focused unit tests for matches, missing values, output
   aliases, and duplicate foreign keys.

   Tentative commit: `feat(core): implement keyed lookup transform`

3. Extend flow construction and lifecycle handling so `from` creates an
   auxiliary source and collector. Reuse the normal source creation path for
   inline, URL, and named data. Reject lazy data. Load the table before primary
   data and remove the auxiliary source when it has no remaining consumers.
   Foreign-data updates replay buffered primary data or reload its source. Add
   integration tests with `createHeadlessEngine` for delayed table loading,
   table refreshes, and disposal.

   Tentative commit: `feat(core): materialize lookup table sources`

4. Add `docs/grammar/transform/lookup.md`, link it from the transform index,
   and regenerate schema and documentation artifacts. Include a compact inline
   codon-table example with input and output data. Run the focused lookup and
   flow tests, the example validation suite, and the relevant schema/docs build
   checks.

   Tentative commit: `docs(core): document lookup transform`

## Deferred work

- A genome-aware lookup adapter exposing fields such as `odd`.
- General inner, outer, many-to-many, and interval-overlap joins.

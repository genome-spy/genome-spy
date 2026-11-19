# Deduplicate generated specification schemas

[Issue #743](https://github.com/genome-spy/genome-spy/issues/743) tracks
repeated definitions in the schemas used by editors and published with Core and
App. PR #744 shared the existing axis definition. On the merged base, the
minified Core and App schemas are 908,151 and 1,066,646 bytes, respectively.
Naming the axis, scale, and legend maps saved 26,167 bytes in Core and 44,405 in
App. A post-generation prototype delivered substantially larger reductions,
validated all 263 shared examples, and preserved the results of Playground
language-service probes for nested axes and conditional encodings.

## Design

Core and App specification types remain the source of truth. A shared build
script will call the existing TypeScript schema generator and consolidate
repeated subschemas. Keep named definitions at their current locations, include
annotations in subtree identity, and reference deterministic generated
definitions.
[JSON Schema Draft 7](https://json-schema.org/draft-07/draft-handrews-json-schema-01#rfc.section.8.3)
and
[Schemars](https://docs.rs/schemars/latest/schemars/trait.JsonSchema.html#method.inline_schema)
describe the named-reference approach. A post-generation pass also catches
duplicate annotations and inline types produced by TypeScript intersections.

Traverse schema positions, including tuple items and schema dependencies. Treat
examples, defaults, constants, and other values as opaque. Optimize schemas with
direct root-definition references and a single reference scope. Keep the
original output for scoped IDs or other reference targets. Keep the
transform-data schema on its current build path.

Package exports, Playground, and publication will consume the existing schema
files. Core and App schema tests will call the generation function used by the
build. Generated definitions stay outside the grammar type index. The Markdown
schema macro will expand generated references when reading properties and
rendering inline types. Named references can still link to their type pages.

## Milestone

Tentative commit subject is `perf: deduplicate generated specification schemas`.

- Route Core and App specification schema builds and tests through the shared
  generator. Include a Core and App patch changeset for the smaller downloads.
- Test equality of shared annotations, opaque values, and preservation of
  references. Verify that expanding only the new references reconstructs both
  original schemas. Measure the minified and gzip output with identical
  serialization and compression.
- Run the schema suites. Compare Playground completion, hover, and diagnostics
  on a composed spec with a conditional encoding and invalid variants.
- Check the grammar type index and compare Markdown schema macro output against
  the original schemas.

## Verified outcome

The review confirmed that macro output depends on the generator's sorted
property order. The implementation preserves that order and expands only
generated references when rendering inline documentation.

| Schema |      Minified bytes |       Gzip bytes |
| ------ | ------------------: | ---------------: |
| Core   |   908,151 → 404,059 | 112,807 → 67,722 |
| App    | 1,066,646 → 446,407 | 123,876 → 74,981 |

Gzip level 6 was applied to the minified JSON. Expanding the generated
references reconstructed both base schemas. All 263 shared examples and seven
App examples validated against both versions. The Playground language service
returned matching diagnostics, completions, and hover content for root and
nested axes and a conditional encoding, including invalid cases. The generated
type index and macro output matched the base. All 305 focused Vitest tests and
20 Markdown extension tests passed.

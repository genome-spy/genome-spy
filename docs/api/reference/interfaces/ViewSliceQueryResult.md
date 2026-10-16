[GenomeSpy Core API](../index.md) / ViewSliceQueryResult

# Interface: ViewSliceQueryResult

## Properties

### rows

> **rows**: `Record`<`string`, `unknown`\>[]

***

### rowsExamined

> **rowsExamined**: `number`

All loaded rows examined, before scope filtering.

***

### rowsMatched

> **rowsMatched**: `number`

All loaded rows matching the scope, before limiting returned rows.

***

### truncated

> **truncated**: `boolean`

***

### scope

> **scope**: `object`

#### type

> **type**: `"viewport"`

#### domains

> **domains**: `Partial`<`Record`<`"x"` \| `"y"`, `number`[]\>\>

Captured numeric domains; locus coordinates use Core's linearized genome.

#### selection?

> `optional` **selection?**: `object`

##### selection.name

> **name**: `string`

##### selection.value

> **value**: `IntervalSelection`

#### dataRevision

> **dataRevision**: `number`

#### data

> **data**: `"loaded-transformed"`

#### sourceCoverage

> **sourceCoverage**: `"unknown"`

Ready for the viewport does not prove full lazy-source coverage.

#### primarySource

> **primarySource**: [`ViewSourceDescription`](ViewSourceDescription.md) \| `null`

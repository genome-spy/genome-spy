[GenomeSpy Core API](../index.md) / ViewSliceQueryResult

# Interface: ViewSliceQueryResult

## Properties

### annotationTargets?

> `optional` **annotationTargets?**: `string`[]

References aligned with rows; valid until the next target-producing query.

***

### rows

> **rows**: `Record`<`string`, `unknown`\>[]

***

### rowsExamined

> **rowsExamined**: `number`

All loaded rows examined, before scope filtering.

***

### rowsMatched

> **rowsMatched**: `number`

All loaded rows matching the scope.

***

### outputRows?

> `optional` **outputRows?**: `number`

Analysis output population before limit; present only for analysis requests.

***

### truncated

> **truncated**: `boolean`

***

### aggregates

> **aggregates**: `Record`<`string`, `unknown`\>

Detached aggregate-transform values. Undefined results (for example empty mean) are null.

***

### scope

> **scope**: `object`

#### type

> **type**: `"viewport"`

#### analysis?

> `optional` **analysis?**: [`ViewSliceAnalysisStage`](../type-aliases/ViewSliceAnalysisStage.md)[]

Detached analysis pipeline, in execution order.

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

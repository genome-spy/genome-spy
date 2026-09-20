[GenomeSpy Core API](../index.md) / ViewDataReadResult

# Interface: ViewDataReadResult

## Properties

### rows

> **rows**: `Record`<`string`, `unknown`\>[]

Structured-cloned values in collector order. Nested values are detached.

***

### rowsExamined

> **rowsExamined**: `number`

Number of visited rows, including at most one lookahead row.

***

### truncated

> **truncated**: `boolean`

More currently loaded transformed rows exist beyond the returned rows.

***

### scope

> **scope**: `"loaded-transformed"`

Loaded transformed rows, not viewport-filtered marks or all source rows.

***

### ready

> **ready**: `true`

Always true: reads reject data that is not ready.

[GenomeSpy Core API](../index.md) / ViewDataReadResult

# Interface: ViewDataReadResult

## Properties

### rows

> **rows**: `Record`<`string`, `unknown`\>[]

Structured-cloned values in collector order. Nested values are detached.

***

### rowsExamined

> **rowsExamined**: `number`

***

### truncated

> **truncated**: `boolean`

***

### scope

> **scope**: `"loaded-transformed"`

Loaded transformed rows, not viewport-filtered marks or all source rows.

***

### ready

> **ready**: `true`

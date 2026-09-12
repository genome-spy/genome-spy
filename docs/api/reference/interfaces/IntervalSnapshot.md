[GenomeSpy Core API](../index.md) / IntervalSnapshot

# Interface: IntervalSnapshot

Detached value of an interval selection.

An interval is active when at least one configured channel has a range. The
numeric ranges are expressed in data-domain values, not canvas coordinates.
`complexIntervals` uses genomic `{ chrom, pos }` endpoints for locus
channels, while numeric channels retain numeric endpoints.

## Properties

### type

> **type**: `"interval"`

Discriminator for interval selection snapshots.

***

### active

> **active**: `boolean`

Whether at least one interval is currently set.

***

### intervals

> **intervals**: `Partial`<`Record`<`"x"` \| `"y"`, readonly \[`number`, `number`\] \| `null`\>\>

Selected range for each configured positional channel, or `null`.

***

### complexIntervals

> **complexIntervals**: [`ComplexIntervals`](../type-aliases/ComplexIntervals.md)

The same ranges with locus channels converted to `{ chrom, pos }`
endpoints. Numeric channels remain numeric and cleared channels are null.

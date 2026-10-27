[GenomeSpy Core API](../index.md) / RecordPointSnapshot

# Interface: RecordPointSnapshot

Detached value of a point selection.

Each row in `data` is a shallow copy of the selected datum without
GenomeSpy's internal picking identifier.

## Properties

### type

> **type**: `"point"`

Discriminator for point selection snapshots.

***

### membership

> **membership**: `"records"`

Membership identifies individual records.

***

### active

> **active**: `boolean`

Whether at least one row is currently selected.

***

### data

> **data**: readonly `Readonly`<`Record`<`string`, `unknown`\>\>[]

Selected data rows, in selection order.

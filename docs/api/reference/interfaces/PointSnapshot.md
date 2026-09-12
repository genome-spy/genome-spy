[GenomeSpy Core API](../index.md) / PointSnapshot

# Interface: PointSnapshot

Detached value of a point selection.

Each row in `data` is a shallow copy of the selected datum without
GenomeSpy's internal picking identifier.

## Properties

### type

> **type**: `"point"`

Discriminator for point selection snapshots.

***

### active

> **active**: `boolean`

Whether at least one row is currently selected.

***

### data

> **data**: readonly `Readonly`<`Record`<`string`, `unknown`\>\>[]

Selected data rows, in selection order.

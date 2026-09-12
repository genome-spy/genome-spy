[GenomeSpy Core API](../index.md) / MoveViewOptions

# Interface: MoveViewOptions

Options for reordering a view within its current parent container.

## Properties

### index

> **index**: `number`

Destination child index within the target's current parent.

The index is zero-based and is interpreted after temporarily removing
the target from its parent. Values from `0` through the remaining child
count are valid. A value equal to the remaining child count places the
target last. Negative values and larger values throw.

For children `[A, B, C, D]`, moving `B` with `index: 3` results in
`[A, C, D, B]`.

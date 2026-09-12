[GenomeSpy Core API](../index.md) / InsertViewOptions

# Interface: InsertViewOptions

Options for inserting a new child view or subtree.

## Properties

### index?

> `optional` **index?**: `number`

Child index where the view is inserted. If omitted, the view is appended.

***

### scope?

> `optional` **scope?**: `string`

Optional scope name for the inserted subtree.

The scope makes repeated instances of the same spec independently
addressable by selectors. It does not replace the inserted root view's
own `name`.
